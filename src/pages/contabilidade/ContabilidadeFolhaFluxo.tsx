import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Clock3, FileUp, Loader2, LockKeyhole, ReceiptText, RefreshCw, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { analyzePayrollFiles } from '@/lib/payrollPageDocuments';
import { sha256Browser } from '@/lib/payrollDocuments';

type PortalKind = 'principal' | 'goiania';
type ProcessType = 'adiantamento' | 'pagamento';
type Company = { id:string; nome:string; codigo?:string; cnpj?:string };
type Cycle = {
  id:string; empresa_id:string; competencia:string; tipo:ProcessType; status:string;
  apontamento_liberado_em?:string|null; contabilidade_recebeu_em?:string|null;
  enviado_em?:string|null; conferido_em?:string|null; observacao?:string|null;
};
type Employee = { id:string; nome:string; cpf?:string; cargo?:string; empresa_id?:string|null; company_id?:string|null };
type FlowDocument = { id:string; ciclo_id:string; classificacao:string; status:string };
type State = { competence:string; companies:Company[]; cycles:Cycle[]; employees:Employee[]; documents:FlowDocument[] };

const sessionKey = (portal: PortalKind) => `topac_contabilidade_${portal}_session`;
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeText = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const monthLabel = (value: string) => {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : value;
};

function readToken(portal: PortalKind) {
  try { return JSON.parse(localStorage.getItem(sessionKey(portal)) || 'null')?.token || ''; }
  catch { return ''; }
}

const statusLabel = (cycle?: Cycle | null) => {
  if (!cycle) return 'Preparando';
  const labels: Record<string,string> = {
    aguardando_envio: 'Aguardando envio',
    aguardando_apontamento: 'Aguardando apontamento',
    liberado: 'Apontamento enviado',
    recebido: 'Apontamento recebido',
    processando: 'Processando PDFs',
    aguardando_conferencia: 'Aguardando conferência do RH',
    conferido: 'Conferido / OK',
    pendencia: 'Pendência para corrigir',
  };
  return labels[cycle.status] || cycle.status.replace(/_/g, ' ');
};

const statusTone = (cycle?: Cycle | null) => {
  const status = cycle?.status || '';
  if (status === 'conferido') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
  if (status === 'pendencia') return 'border-rose-500/25 bg-rose-500/10 text-rose-300';
  if (status === 'aguardando_conferencia' || status === 'processando') return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
  return 'border-violet-500/25 bg-violet-500/10 text-violet-300';
};

const likelyReceipt = (type: ProcessType, page: any) => {
  const text = normalizeText(page?.text);
  if (type === 'adiantamento') {
    return page?.documentType === 'SALARY_ADVANCE' || (text.includes('adiantamento') && (text.includes('recibo') || text.includes('total liquido') || text.includes('credito')));
  }
  return page?.documentType === 'PAYSLIP' || text.includes('recibo de pagamento') || text.includes('demonstrativo de pagamento') || (text.includes('total liquido') && text.includes('proventos'));
};

export default function ContabilidadeFolhaFluxo({ portal }: { portal: PortalKind }) {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<ProcessType | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyCycle, setBusyCycle] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const call = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const token = readToken(portal);
    if (!token) throw new Error('Sessão expirada. Entre novamente.');
    const response = await fetch('/api/accounting-payroll-flow', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, portal, token, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      const error: any = new Error(data?.message || data?.error || 'Não foi possível concluir a operação.');
      error.code = data?.error;
      throw error;
    }
    return data;
  }, [portal]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await call('state');
      setState({
        competence: String(data.competence || ''),
        companies: Array.isArray(data.companies) ? data.companies : [],
        cycles: Array.isArray(data.cycles) ? data.cycles : [],
        employees: Array.isArray(data.employees) ? data.employees : [],
        documents: Array.isArray(data.documents) ? data.documents : [],
      });
    } catch (error:any) {
      if (!silent) toast.error(error?.message || 'Não foi possível carregar Adiantamento e Pagamento.');
    } finally { if (!silent) setLoading(false); }
  }, [call]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const cycleFor = useCallback((companyId: string, type: ProcessType) => state?.cycles.find(c => c.empresa_id === companyId && c.tipo === type) || null, [state?.cycles]);
  const docsForCycle = useCallback((cycleId?: string | null) => state?.documents.filter(d => d.ciclo_id === cycleId) || [], [state?.documents]);

  const processSummary = useMemo(() => {
    const result: Record<ProcessType,{ok:number;waiting:number;pending:number;locked:number}> = {
      adiantamento: { ok:0, waiting:0, pending:0, locked:0 },
      pagamento: { ok:0, waiting:0, pending:0, locked:0 },
    };
    for (const type of ['adiantamento','pagamento'] as ProcessType[]) {
      for (const company of state?.companies || []) {
        const cycle = cycleFor(company.id, type);
        if (cycle?.status === 'conferido') result[type].ok += 1;
        else if (cycle?.status === 'pendencia') result[type].pending += 1;
        else if (type === 'pagamento' && !cycle?.apontamento_liberado_em) result[type].locked += 1;
        else result[type].waiting += 1;
      }
    }
    return result;
  }, [state?.companies, cycleFor]);

  const acknowledge = async (cycle: Cycle) => {
    setBusyCycle(cycle.id);
    try {
      await call('ack_apontamento', { ciclo_id: cycle.id, empresa_id: cycle.empresa_id });
      toast.success('Recebimento do apontamento confirmado.');
      await load(true);
    } catch (error:any) { toast.error(error?.message || 'Não foi possível confirmar o recebimento.'); }
    finally { setBusyCycle(null); }
  };

  const uploadSigned = async (bucket: string, path: string, token: string, body: Blob | Uint8Array) => {
    const blob = body instanceof Blob ? body : new Blob([body as any], { type: 'application/pdf' });
    const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, blob, { contentType: 'application/pdf' });
    if (error) throw error;
  };

  const processFiles = async (files: File[]) => {
    if (!selectedType || !selectedCompany || !files.length) return;
    const cycle = cycleFor(selectedCompany.id, selectedType);
    if (!cycle) return toast.error('Ciclo não encontrado. Atualize a página.');
    if (selectedType === 'pagamento' && !cycle.apontamento_liberado_em) return toast.error('O Pagamento ainda está bloqueado. Aguarde o apontamento do RH.');
    if (selectedType === 'pagamento' && !cycle.contabilidade_recebeu_em) return toast.error('Confirme primeiro o recebimento do apontamento.');
    if (cycle.status === 'conferido') return toast.info('Este processo já está conferido.');

    setUploading(true);
    try {
      const companyEmployees = (state?.employees || [])
        .filter(e => e.company_id === selectedCompany.id || e.empresa_id === selectedCompany.id)
        .map(e => ({ id:e.id, name:e.nome, cpf:e.cpf || '', cargo:e.cargo || '', companyId:selectedCompany.id }));
      let identified = 0;
      let review = 0;
      let ignored = 0;

      for (const file of files) {
        if (!/\.pdf$/i.test(file.name)) { ignored += 1; continue; }
        const sourceSha = await sha256Browser(file);
        const prepared = await call('prepare_original', {
          ciclo_id: cycle.id, empresa_id: selectedCompany.id, arquivo_nome: file.name, tamanho_bytes: file.size,
        });
        await uploadSigned(prepared.bucket, prepared.path, prepared.upload_token, file);
        const finalized = await call('finalize_original', {
          ciclo_id: cycle.id, empresa_id: selectedCompany.id, storage_path: prepared.path,
          arquivo_nome: file.name, tamanho_bytes: file.size, source_sha256: sourceSha,
        });
        const uploadId = finalized.upload?.id;
        if (!uploadId) throw new Error(`Não foi possível registrar ${file.name}.`);

        const analyses = await analyzePayrollFiles({ files: [file], employees: companyEmployees });
        const analysis = analyses[0];
        if (!analysis || analysis.fatalError) {
          review += 1;
          await call('register_page', {
            ciclo_id: cycle.id, empresa_id: selectedCompany.id, upload_id: uploadId,
            pagina: 0, classificacao: 'erro', status: 'pdf_nao_lido', detalhes: { erro: analysis?.fatalError || 'Falha de leitura do PDF.' },
          });
          continue;
        }

        for (const page of analysis.documents) {
          const receipt = likelyReceipt(selectedType, page);
          const detectedCnpj = digits(page.cnpjDetected);
          const expectedCnpj = digits(selectedCompany.cnpj);
          const sameCompany = !detectedCnpj || !expectedCnpj || detectedCnpj === expectedCnpj;
          const safeMatch = receipt && sameCompany && page.status === 'IDENTIFICADO' && Boolean(page.employeeId) && page.bytes?.byteLength > 0;

          if (!safeMatch) {
            const classification = page.status === 'ERRO' ? 'erro' : receipt ? 'revisao' : 'ignorado';
            if (classification === 'revisao' || classification === 'erro') review += 1; else ignored += 1;
            await call('register_page', {
              ciclo_id: cycle.id, empresa_id: selectedCompany.id, upload_id: uploadId,
              pagina: page.pageNumber, funcionario_id: page.employeeId || null, tipo_documento: page.documentType,
              nome_detectado: page.employeeNameDetected || page.employeeName || null, cpf_detectado: page.cpfDetected || null,
              classificacao: classification, status: !sameCompany ? 'empresa_divergente' : receipt ? 'revisar_identificacao' : 'pagina_nao_individual',
              detalhes: { mensagem: page.message || null, metodo_vinculo: page.matchMethod, cnpj_detectado: page.cnpjDetected || null },
            });
            continue;
          }

          const pageHash = page.sha256 || await sha256Browser(page.bytes);
          const filename = `${String(page.employeeName || 'FUNCIONARIO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_-]+/g,'_')}_${cycle.competencia}_${selectedType === 'adiantamento' ? 'ADIANTAMENTO' : 'PAGAMENTO'}.pdf`;
          const pagePrepared = await call('prepare_document', {
            ciclo_id: cycle.id, empresa_id: selectedCompany.id, upload_id: uploadId,
            funcionario_id: page.employeeId, pagina: page.pageNumber, arquivo_nome: filename, tamanho_bytes: page.bytes.byteLength,
          });
          await uploadSigned(pagePrepared.bucket, pagePrepared.path, pagePrepared.upload_token, page.bytes);
          const saved = await call('finalize_document', {
            ciclo_id: cycle.id, empresa_id: selectedCompany.id, upload_id: uploadId,
            funcionario_id: page.employeeId, pagina: page.pageNumber, storage_path: pagePrepared.path,
            arquivo_nome: filename, tamanho_bytes: page.bytes.byteLength, source_sha256: analysis.sourceSha256,
            document_sha256: pageHash, nome_detectado: page.employeeNameDetected || page.employeeName,
            cpf_detectado: page.cpfDetected, cnpj_detectado: page.cnpjDetected, tipo_detectado: page.documentType,
            metodo_vinculo: page.matchMethod, competencia_detectada: page.competenciaDetected, valor_liquido: page.amountDetected,
          });
          if (saved.review_required) review += 1;
          else if (!saved.duplicate) identified += 1;
        }
      }

      const result = await call('complete_cycle', { ciclo_id: cycle.id, empresa_id: selectedCompany.id });
      await load(true);
      toast.success(`${identified || result.identificados || 0} recibo(s) identificado(s) e enviado(s) para conferência do RH.${Number(result.revisar || review) ? ` ${Number(result.revisar || review)} item(ns) ficaram para revisão.` : ''}`);
    } catch (error:any) {
      console.error('[contabilidade-folha-upload]', error);
      toast.error(error?.message || 'Falha ao processar os PDFs.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  if (portal !== 'principal') return null;
  if (loading && !state) return <section className="mb-5 rounded-xl border border-[#2b2532] bg-[#05070b] p-5"><div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando Adiantamento e Pagamento...</div></section>;

  return (
    <section className="mb-5 rounded-xl border border-[#2b2532] bg-[#05070b] shadow-[0_18px_50px_rgba(0,0,0,.18)]">
      <div className="flex flex-col gap-3 border-b border-[#25202b] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-violet-400">Folha · competência {monthLabel(state?.competence || '')}</div><h2 className="mt-1 text-lg font-black text-white">Adiantamento e Pagamento</h2><p className="mt-1 text-xs text-zinc-500">Envio dos PDFs por empresa, identificação automática dos recibos e encaminhamento para Assinatura Digital.</p></div>
        <Button variant="outline" size="sm" onClick={() => void load()} className="border-[#3d3150] bg-[#090b10] text-zinc-300"><RefreshCw className="mr-2 h-3.5 w-3.5" />Atualizar</Button>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <ProcessCard type="adiantamento" icon={WalletCards} title="Adiantamento" description="A contabilidade envia os PDFs por empresa. Recibos reconhecidos seguem para a Assinatura Digital." summary={processSummary.adiantamento} onClick={() => { setSelectedType('adiantamento'); setSelectedCompany(null); }} />
        <ProcessCard type="pagamento" icon={ReceiptText} title="Pagamento" description="Fica bloqueado até o RH enviar o apontamento. Depois, a contabilidade confirma o recebimento e envia os PDFs." summary={processSummary.pagamento} onClick={() => { setSelectedType('pagamento'); setSelectedCompany(null); }} />
      </div>

      <Dialog open={Boolean(selectedType)} onOpenChange={open => { if (!open && !uploading) { setSelectedType(null); setSelectedCompany(null); } }}>
        <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto border-[#33283d] bg-[#07090d] text-white">
          <DialogHeader><DialogTitle>{selectedType === 'adiantamento' ? 'Adiantamento' : 'Pagamento'} · {monthLabel(state?.competence || '')}</DialogTitle></DialogHeader>
          {!selectedCompany ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(state?.companies || []).map(company => {
                const cycle = cycleFor(company.id, selectedType || 'adiantamento');
                const docs = docsForCycle(cycle?.id);
                const identified = docs.filter(d => d.classificacao === 'identificado').length;
                const review = docs.filter(d => ['revisao','erro'].includes(d.classificacao)).length;
                const locked = selectedType === 'pagamento' && !cycle?.apontamento_liberado_em;
                return <button key={company.id} type="button" onClick={() => setSelectedCompany(company)} className="rounded-xl border border-[#2c2732] bg-[#090b10] p-4 text-left transition hover:border-violet-500/50">
                  <div className="flex items-start justify-between gap-3"><Building2 className="h-5 w-5 text-violet-400" /><span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${statusTone(cycle)}`}>{locked ? 'Bloqueado · aguardando apontamento' : statusLabel(cycle)}</span></div>
                  <div className="mt-3 text-sm font-black text-white">{company.nome}</div>
                  <div className="mt-1 text-[10px] text-zinc-500">{identified} identificado(s){review ? ` · ${review} para revisar` : ''}</div>
                </button>;
              })}
            </div>
          ) : (() => {
            const cycle = cycleFor(selectedCompany.id, selectedType || 'adiantamento');
            const docs = docsForCycle(cycle?.id);
            const locked = selectedType === 'pagamento' && !cycle?.apontamento_liberado_em;
            const needsAck = selectedType === 'pagamento' && cycle?.apontamento_liberado_em && !cycle.contabilidade_recebeu_em;
            const canUpload = Boolean(cycle && !locked && !needsAck && cycle.status !== 'conferido');
            return <div className="space-y-4">
              <button onClick={() => setSelectedCompany(null)} className="text-xs font-bold text-violet-300 hover:text-white">← Voltar para empresas</button>
              <div className="rounded-xl border border-[#2c2732] bg-[#090b10] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] uppercase text-zinc-500">Empresa</div><div className="mt-1 text-lg font-black">{selectedCompany.nome}</div></div><span className={`rounded-full border px-3 py-1.5 text-[10px] font-bold ${statusTone(cycle)}`}>{locked ? 'Aguardando apontamento do RH' : statusLabel(cycle)}</span></div>
                {cycle?.observacao && <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/[.05] p-3 text-xs text-rose-200"><AlertTriangle className="mr-2 inline h-4 w-4" />{cycle.observacao}</div>}
              </div>

              {locked && <div className="rounded-xl border border-amber-500/20 bg-amber-500/[.05] p-5 text-center"><LockKeyhole className="mx-auto h-7 w-7 text-amber-300" /><div className="mt-2 text-sm font-black text-amber-200">Envio bloqueado</div><div className="mt-1 text-xs text-zinc-500">O Pagamento só será liberado quando o RH enviar o apontamento.</div></div>}

              {needsAck && cycle && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[.04] p-5"><div className="text-sm font-black text-white">Apontamento disponível</div><div className="mt-1 text-xs text-zinc-500">Confirme que recebeu o apontamento antes de iniciar o processamento.</div><Button onClick={() => void acknowledge(cycle)} disabled={busyCycle === cycle.id} className="mt-3 bg-cyan-600 text-white hover:bg-cyan-500">{busyCycle === cycle.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Confirmar recebimento</Button></div>}

              {canUpload && <div className="rounded-xl border border-dashed border-violet-500/35 bg-violet-500/[.035] p-6 text-center"><FileUp className="mx-auto h-8 w-8 text-violet-400" /><div className="mt-3 text-sm font-black">Selecione todos os PDFs desta empresa</div><div className="mt-1 text-xs text-zinc-500">Pode selecionar 1, 4, 5 ou quantos arquivos fizerem parte do processo. O sistema separa e identifica os recibos individualmente.</div><input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={event => void processFiles(Array.from(event.target.files || []))} /><Button onClick={() => fileInput.current?.click()} disabled={uploading} className="mt-4 bg-violet-600 text-white hover:bg-violet-500">{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}{uploading ? 'Lendo e enviando PDFs...' : 'Selecionar PDFs'}</Button></div>}

              <div className="grid grid-cols-3 gap-2">
                <SmallStat label="Identificados" value={docs.filter(d => d.classificacao === 'identificado').length} tone="text-emerald-300" />
                <SmallStat label="Para revisar" value={docs.filter(d => ['revisao','erro'].includes(d.classificacao)).length} tone="text-amber-300" />
                <SmallStat label="Ignorados" value={docs.filter(d => ['ignorado','duplicado'].includes(d.classificacao)).length} tone="text-zinc-400" />
              </div>
              {cycle?.status === 'aguardando_conferencia' && <div className="rounded-lg border border-amber-500/20 bg-amber-500/[.04] p-3 text-xs text-amber-200"><Clock3 className="mr-2 inline h-4 w-4" />Arquivos enviados. Aguardando a conferência e o OK do RH.</div>}
              {cycle?.status === 'conferido' && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[.04] p-3 text-xs text-emerald-200"><CheckCircle2 className="mr-2 inline h-4 w-4" />Conferido / OK pelo RH. Os recibos identificados estão liberados na Assinatura Digital.</div>}
            </div>;
          })()}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ProcessCard({ icon:Icon, title, description, summary, onClick }: { type:ProcessType; icon:any; title:string; description:string; summary:{ok:number;waiting:number;pending:number;locked:number}; onClick:()=>void }) {
  return <button onClick={onClick} className="rounded-xl border border-[#2b2631] bg-[#080a0e] p-5 text-left transition hover:-translate-y-0.5 hover:border-violet-500/50"><div className="flex items-start justify-between"><Icon className="h-6 w-6 text-violet-400" /><span className="text-[10px] font-bold text-zinc-600">Abrir empresas →</span></div><div className="mt-4 text-base font-black text-white">{title}</div><div className="mt-1 min-h-[34px] text-[11px] leading-relaxed text-zinc-500">{description}</div><div className="mt-4 flex flex-wrap gap-2"><Badge label={`${summary.ok} OK`} tone="green" /><Badge label={`${summary.waiting} em andamento`} tone="amber" />{summary.pending > 0 && <Badge label={`${summary.pending} pendência`} tone="rose" />}{summary.locked > 0 && <Badge label={`${summary.locked} bloqueado`} tone="zinc" />}</div></button>;
}
function Badge({ label, tone }: { label:string; tone:'green'|'amber'|'rose'|'zinc' }) { const classes={green:'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',amber:'border-amber-500/20 bg-amber-500/10 text-amber-300',rose:'border-rose-500/20 bg-rose-500/10 text-rose-300',zinc:'border-zinc-700 bg-zinc-900 text-zinc-400'}; return <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${classes[tone]}`}>{label}</span>; }
function SmallStat({ label, value, tone }: { label:string; value:number; tone:string }) { return <div className="rounded-lg border border-[#27232c] bg-[#080a0e] p-3 text-center"><div className={`text-xl font-black ${tone}`}>{value}</div><div className="mt-1 text-[9px] font-bold uppercase text-zinc-600">{label}</div></div>; }
