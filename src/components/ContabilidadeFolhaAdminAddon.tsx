import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Clock3, Eye, FileCheck2,
  Loader2, MailCheck, RefreshCw, WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type ProcessType = 'adiantamento' | 'pagamento';
type Company = { id:string; nome:string; cnpj?:string; codigo?:string };
type Cycle = {
  id:string; empresa_id:string; competencia:string; tipo:ProcessType; status:string;
  apontamento_liberado_em?:string|null; contabilidade_recebeu_em?:string|null;
  enviado_em?:string|null; conferido_em?:string|null; observacao?:string|null;
  email_envio_status?:string|null; email_retorno_status?:string|null;
};
type Doc = { id:string; ciclo_id:string; classificacao:string; status:string; payroll_document_id?:string|null };
type Upload = {
  id:string; ciclo_id:string; empresa_id:string; arquivo_nome:string;
  storage_bucket:string; storage_path:string; created_at:string;
  formalizacao_email_status?:string|null; origem_tipo?:string|null;
};
type AdminState = { competence:string; companies:Company[]; cycles:Cycle[]; documents:Doc[]; uploads:Upload[] };
type Summary = { ok:number; attention:number; waiting:number; locked:number };

const VIEW_STATE_KEY = 'topac:view-state:v1:fechamento:principal';
const monthLabel = (value:string) => { const [y,m] = String(value||'').split('-'); return y&&m ? `${m}/${y}` : value; };
const statusLabel = (value:string) => ({
  aguardando_envio:'Aguardando Contabilidade',
  aguardando_apontamento:'Fechamento pendente',
  liberado:'Apontamento enviado',
  recebido:'Contabilidade confirmou recebimento',
  processando:'Processando PDFs',
  aguardando_conferencia:'Aguardando seu OK',
  conferido:'Conferido / OK',
  pendencia:'Pendência enviada',
} as Record<string,string>)[value] || value.replace(/_/g,' ');
const statusClass = (value:string) => value === 'conferido'
  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
  : value === 'pendencia'
    ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
    : value === 'aguardando_conferencia'
      ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
      : 'border-violet-500/25 bg-violet-500/10 text-violet-300';

const ContabilidadeFolhaAdminAddon: React.FC = () => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<AdminState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ProcessType | null>(null);
  const [issueCycle, setIssueCycle] = useState<string | null>(null);
  const [issueText, setIssueText] = useState('');

  useEffect(() => {
    const mount = () => {
      if (window.location.pathname !== '/admin/central-contabilidade') { setHost(null); return; }
      const heading = Array.from(document.querySelectorAll('h1')).find(el => /Central da Contabilidade/i.test(el.textContent || ''));
      const root = heading?.closest('.space-y-5.animate-fade-in') as HTMLElement | null;
      if (!root) return;
      let element = root.querySelector<HTMLElement>('[data-contabilidade-folha-admin-host="true"]');
      if (!element) {
        element = document.createElement('div');
        element.dataset.contabilidadeFolhaAdminHost = 'true';
        root.prepend(element);
      }
      setHost(element);
    };
    mount();
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList:true, subtree:true });
    const timer = window.setInterval(mount, 700);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, []);

  const authToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    return token;
  }, []);

  const api = useCallback(async (action:string, payload:Record<string,unknown> = {}) => {
    const token = await authToken();
    const response = await fetch('/api/accounting-payroll-flow', {
      method:'POST',
      headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` },
      body:JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || 'Operação não concluída.');
    return result;
  }, [authToken]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await api('admin_state');
      setState({
        competence:String(result.competence||''),
        companies:result.companies||[],
        cycles:result.cycles||[],
        documents:result.documents||[],
        uploads:result.uploads||[],
      });
    } catch (error:any) {
      if (!silent) toast.error(error?.message || 'Não foi possível carregar o fluxo da folha.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [api]);

  const finalizeClosing = useCallback(async (empresaId:string, competencia:string) => {
    const token = await authToken();
    setBusy(`closing:${empresaId}`);
    let lastError = '';
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt) await new Promise(resolve => window.setTimeout(resolve, 750));
        const response = await fetch('/api/accounting-closing-flow', {
          method:'POST',
          headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` },
          body:JSON.stringify({ action:'finalize', empresa_id:empresaId, competencia }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result?.ok) {
          if (result.email_status === 'enviado') toast.success('Fechamento concluído. PDF do apontamento gerado, Pagamento liberado e e-mail enviado à Contabilidade.');
          else toast.warning(`Fechamento concluído e Pagamento liberado. O PDF foi gerado, mas o e-mail ficou pendente. ${result.email_error || ''}`.trim());
          setSelectedType('pagamento');
          const overviewTab = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Visão geral') as HTMLButtonElement | undefined;
          overviewTab?.click();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        lastError = result?.message || result?.error || 'Falha ao finalizar fechamento.';
        if (result?.error !== 'fechamento_nao_concluido') throw new Error(lastError);
      }
      throw new Error(lastError || 'O fechamento não foi confirmado pelo banco a tempo.');
    } finally {
      setBusy(null);
    }
  }, [authToken]);

  useEffect(() => { if (host) void load(); }, [host, load]);
  useEffect(() => {
    if (!host) return;
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [host, load]);

  useEffect(() => {
    if (!host) return;
    const enhanceClosingButton = () => {
      const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
      for (const button of buttons) {
        const text = button.textContent?.trim() || '';
        if (text === 'Marcar como Fechado') {
          const textNode = Array.from(button.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('Marcar como Fechado'));
          if (textNode) textNode.textContent = ' Concluir e enviar à Contabilidade';
          button.dataset.centralClosingButton = 'true';
          button.title = 'Conclui o fechamento, gera o PDF do apontamento e libera o Pagamento para a Contabilidade.';
        }
      }
    };
    const observer = new MutationObserver(() => requestAnimationFrame(enhanceClosingButton));
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    enhanceClosingButton();

    const onClick = (event:MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null;
      if (!button) return;
      const text = button.textContent?.trim() || '';
      if (button.dataset.centralClosingButton !== 'true' && !text.includes('Concluir e enviar à Contabilidade') && text !== 'Marcar como Fechado') return;

      let saved:any = {};
      try { saved = JSON.parse(window.sessionStorage.getItem(VIEW_STATE_KEY) || '{}'); } catch { saved = {}; }
      const empresaId = String(saved?.selectedCompany || '');
      const competencia = String(saved?.competencia || state?.competence || '');
      if (!empresaId || !/^\d{4}-\d{2}$/.test(competencia)) {
        event.preventDefault();
        event.stopPropagation();
        toast.error('Selecione a empresa e a competência antes de concluir.');
        return;
      }

      const companyName = state?.companies.find(company => company.id === empresaId)?.nome || 'esta empresa';
      const confirmed = window.confirm(`Concluir o fechamento de ${companyName} (${monthLabel(competencia)})?\n\nAo confirmar, o sistema vai gerar automaticamente o PDF do apontamento, liberar o card PAGAMENTO e enviar o apontamento para a Contabilidade.`);
      if (!confirmed) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      window.setTimeout(() => {
        void finalizeClosing(empresaId, competencia)
          .then(() => load(true))
          .catch((error:any) => toast.error(error?.message || 'O fechamento foi salvo, mas não foi possível enviar o apontamento automaticamente.'));
      }, 450);
    };

    document.addEventListener('click', onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
    };
  }, [host, finalizeClosing, load, state?.companies, state?.competence]);

  const companyMap = useMemo(() => new Map((state?.companies||[]).map(company => [company.id,company])), [state?.companies]);
  const cyclesFor = useCallback((type:ProcessType) => (state?.cycles||[])
    .filter(cycle => cycle.tipo === type)
    .sort((a,b) => (companyMap.get(a.empresa_id)?.nome||'').localeCompare(companyMap.get(b.empresa_id)?.nome||'', 'pt-BR')), [state?.cycles, companyMap]);

  const summary = useMemo<Record<ProcessType,Summary>>(() => {
    const base = ():Summary => ({ ok:0, attention:0, waiting:0, locked:0 });
    const result = { adiantamento:base(), pagamento:base() };
    for (const cycle of state?.cycles || []) {
      const item = result[cycle.tipo];
      if (cycle.status === 'conferido') item.ok++;
      else if (cycle.status === 'aguardando_conferencia' || cycle.status === 'pendencia') item.attention++;
      else if (cycle.tipo === 'pagamento' && !cycle.apontamento_liberado_em) item.locked++;
      else item.waiting++;
    }
    return result;
  }, [state?.cycles]);

  const approve = async (cycle:Cycle) => {
    setBusy(cycle.id);
    try {
      const result = await api('admin_approve_cycle', { ciclo_id:cycle.id });
      const released = Number(result.documentos_liberados||0);
      if (result.email_status === 'enviado') toast.success(`Conferido / OK. ${released} documento(s) liberado(s) para assinatura e resposta enviada à Contabilidade.`);
      else toast.warning(`Conferido / OK. ${released} documento(s) liberado(s), mas o e-mail de resposta ficou pendente. ${result.email_error || ''}`.trim());
      await load(true);
    } catch (error:any) {
      toast.error(error?.message || 'Não foi possível concluir a conferência.');
    } finally {
      setBusy(null);
    }
  };

  const markPending = async (cycle:Cycle) => {
    if (!issueText.trim()) return toast.error('Descreva a pendência.');
    setBusy(cycle.id);
    try {
      await api('admin_mark_pending', { ciclo_id:cycle.id, observacao:issueText.trim() });
      toast.success('Pendência enviada para a Contabilidade.');
      setIssueCycle(null);
      setIssueText('');
      await load(true);
    } catch (error:any) {
      toast.error(error?.message || 'Não foi possível registrar a pendência.');
    } finally {
      setBusy(null);
    }
  };

  const openUpload = async (upload:Upload) => {
    setBusy(upload.id);
    try {
      const result = await api('admin_view_file', { bucket:upload.storage_bucket, path:upload.storage_path });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error:any) {
      toast.error(error?.message || 'PDF indisponível.');
    } finally {
      setBusy(null);
    }
  };

  const openClosing = (cycle:Cycle) => {
    let current:any = {};
    try { current = JSON.parse(window.sessionStorage.getItem(VIEW_STATE_KEY) || '{}'); } catch { current = {}; }
    window.sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify({ ...current, selectedCompany:cycle.empresa_id, competencia:cycle.competencia }));
    const tab = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Fechamento') as HTMLButtonElement | undefined;
    if (!tab) return toast.error('A área de fechamento não foi localizada na Central.');
    tab.click();
    window.setTimeout(() => window.scrollTo({ top: 250, behavior:'smooth' }), 120);
  };

  if (!host) return null;

  return createPortal(
    <section className="mb-5 overflow-hidden rounded-xl border border-[#352741] bg-[#05070b] shadow-[0_18px_50px_rgba(0,0,0,.22)]">
      <div className="flex flex-col gap-3 border-b border-[#28212f] bg-[radial-gradient(circle_at_10%_0%,rgba(139,34,255,.15),transparent_38%)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.18em] text-[#a855f7]">Competência {monthLabel(state?.competence||'')}</div>
          <h2 className="mt-1 text-xl font-black text-white">Fluxo da Contabilidade</h2>
          <p className="mt-1 text-xs text-zinc-500">Tudo fica aqui: Adiantamento para conferir e Pagamento ligado ao fechamento e ao apontamento.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="border-[#3c2d49] bg-[#090b10] text-zinc-300">
          {loading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<RefreshCw className="mr-2 h-4 w-4"/>}Atualizar
        </Button>
      </div>

      {loading && !state ? (
        <div className="flex h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-violet-400" /></div>
      ) : (
        <>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <ProcessCard icon={WalletCards} title="Adiantamento" description="A Contabilidade envia. Você só recebe, confere e dá o OK para liberar a assinatura." summary={summary.adiantamento} active={selectedType==='adiantamento'} onClick={()=>setSelectedType(current => current==='adiantamento'?null:'adiantamento')} />
            <ProcessCard icon={FileCheck2} title="Pagamento" description="Você conclui o fechamento. O sistema gera o PDF do apontamento e libera automaticamente para a Contabilidade." summary={summary.pagamento} active={selectedType==='pagamento'} onClick={()=>setSelectedType(current => current==='pagamento'?null:'pagamento')} />
          </div>

          {selectedType && (
            <div className="border-t border-[#28212f] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-black text-white">{selectedType==='adiantamento'?'Adiantamento':'Pagamento'} por empresa</div>
                  <div className="mt-0.5 text-[10px] text-zinc-600">Clique na ação da empresa para seguir o fluxo.</div>
                </div>
                <button onClick={()=>setSelectedType(null)} className="text-[10px] font-bold text-zinc-500 hover:text-white">Fechar</button>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {cyclesFor(selectedType).map(cycle => {
                  const company = companyMap.get(cycle.empresa_id);
                  const docs = (state?.documents||[]).filter(doc => doc.ciclo_id===cycle.id);
                  const uploads = (state?.uploads||[]).filter(upload => upload.ciclo_id===cycle.id);
                  const identified = docs.filter(doc => doc.classificacao==='identificado').length;
                  const review = docs.filter(doc => ['revisao','erro'].includes(doc.classificacao)).length;
                  const closingPending = cycle.tipo==='pagamento' && !cycle.apontamento_liberado_em;
                  return (
                    <div key={cycle.id} className="rounded-xl border border-[#2a2630] bg-[#080a0e] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><div className="text-sm font-black text-white">{company?.nome||'Empresa'}</div><div className="mt-1 text-[10px] text-zinc-600">{monthLabel(cycle.competencia)}</div></div>
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${statusClass(cycle.status)}`}>{statusLabel(cycle.status)}</span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2"><Mini label="PDFs" value={uploads.length}/><Mini label="Reconhecidos" value={identified}/><Mini label="Revisar" value={review}/></div>
                      {cycle.email_envio_status==='enviado' && <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/[.04] px-2.5 py-1.5 text-[10px] font-bold text-cyan-200"><MailCheck className="h-3.5 w-3.5"/>E-mail de recebimento enviado</div>}
                      {cycle.email_retorno_status==='enviado' && <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[.04] px-2.5 py-1.5 text-[10px] font-bold text-emerald-200"><MailCheck className="h-3.5 w-3.5"/>E-mail de OK enviado</div>}
                      {cycle.observacao && <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/[.035] p-2.5 text-[11px] text-amber-200">{cycle.observacao}</div>}

                      {uploads.length>0 && <div className="mt-3 flex flex-wrap gap-2">{uploads.slice(0,6).map(upload => <button key={upload.id} onClick={()=>void openUpload(upload)} disabled={busy===upload.id} className="inline-flex items-center gap-1.5 rounded-md border border-[#3a3044] bg-[#0a0c11] px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 hover:border-violet-500/50">{busy===upload.id?<Loader2 className="h-3 w-3 animate-spin"/>:<Eye className="h-3 w-3"/>}{upload.origem_tipo==='rh_apontamento'?'Apontamento RH':(upload.arquivo_nome.length>25?`${upload.arquivo_nome.slice(0,22)}...`:upload.arquivo_nome)}</button>)}</div>}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {closingPending && cycle.tipo==='pagamento' && <Button size="sm" onClick={()=>openClosing(cycle)} className="bg-cyan-600 text-white hover:bg-cyan-500"><FileCheck2 className="mr-2 h-4 w-4"/>Abrir fechamento</Button>}
                        {cycle.status==='aguardando_conferencia' && <><Button size="sm" onClick={()=>void approve(cycle)} disabled={busy===cycle.id} className="bg-emerald-600 text-white hover:bg-emerald-500">{busy===cycle.id?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<CheckCircle2 className="mr-2 h-4 w-4"/>}Conferir e dar OK</Button><Button size="sm" variant="outline" onClick={()=>{setIssueCycle(cycle.id);setIssueText('');}} className="border-rose-500/30 bg-rose-500/[.04] text-rose-200"><AlertTriangle className="mr-2 h-4 w-4"/>Pendência</Button></>}
                        {cycle.status==='conferido' && <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[.04] px-3 py-2 text-[11px] font-bold text-emerald-300"><CheckCircle2 className="h-4 w-4"/>OK finalizado</span>}
                        {!closingPending && !['aguardando_conferencia','conferido'].includes(cycle.status) && <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/15 px-3 py-2 text-[11px] text-amber-200"><Clock3 className="h-4 w-4"/>{cycle.tipo==='pagamento'?'Aguardando Contabilidade':'Aguardando envio da Contabilidade'}</span>}
                      </div>

                      {issueCycle===cycle.id && <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/[.035] p-3"><textarea value={issueText} onChange={event=>setIssueText(event.target.value)} placeholder="Explique o que precisa ser corrigido..." className="min-h-[80px] w-full rounded-md border border-[#493248] bg-[#05070b] p-3 text-xs text-white outline-none focus:border-rose-500/50"/><div className="mt-2 flex gap-2"><Button size="sm" onClick={()=>void markPending(cycle)} disabled={busy===cycle.id||!issueText.trim()} className="bg-rose-600 text-white">Enviar pendência</Button><Button size="sm" variant="ghost" onClick={()=>{setIssueCycle(null);setIssueText('');}} className="text-zinc-400">Cancelar</Button></div></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>,
    host,
  );
};

function ProcessCard({ icon:Icon, title, description, summary, active, onClick }:{ icon:any; title:string; description:string; summary:Summary; active:boolean; onClick:()=>void }) {
  return <button onClick={onClick} className={`rounded-xl border p-5 text-left transition ${active?'border-violet-500/60 bg-violet-500/[.07]':'border-[#2b2631] bg-[#080a0e] hover:border-violet-500/45'}`}><div className="flex items-start justify-between gap-3"><Icon className="h-6 w-6 text-violet-400"/><ChevronRight className={`h-4 w-4 text-zinc-600 transition ${active?'rotate-90 text-violet-300':''}`}/></div><div className="mt-4 text-base font-black text-white">{title}</div><div className="mt-1 min-h-[34px] text-[11px] leading-relaxed text-zinc-500">{description}</div><div className="mt-4 flex flex-wrap gap-2"><Badge label={`${summary.ok} OK`} tone="green"/><Badge label={`${summary.attention} para conferir`} tone="amber"/>{summary.waiting>0&&<Badge label={`${summary.waiting} em andamento`} tone="purple"/>}{summary.locked>0&&<Badge label={`${summary.locked} fechamento pendente`} tone="zinc"/>}</div></button>;
}

function Badge({ label, tone }:{ label:string; tone:'green'|'amber'|'purple'|'zinc' }) {
  const classes = { green:'border-emerald-500/20 bg-emerald-500/10 text-emerald-300', amber:'border-amber-500/20 bg-amber-500/10 text-amber-300', purple:'border-violet-500/20 bg-violet-500/10 text-violet-300', zinc:'border-zinc-700 bg-zinc-900 text-zinc-400' };
  return <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${classes[tone]}`}>{label}</span>;
}

function Mini({ label, value }:{ label:string; value:number }) {
  return <div className="rounded-md border border-[#25222a] bg-[#06080b] p-2.5"><div className="text-lg font-black text-white">{value}</div><div className="text-[9px] font-bold uppercase text-zinc-600">{label}</div></div>;
}

export default ContabilidadeFolhaAdminAddon;
