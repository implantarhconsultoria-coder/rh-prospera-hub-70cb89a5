import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useOperatorIdentity } from '@/hooks/useOperatorIdentity';
import { supabase } from '@/integrations/supabase/client';
import { getPreviousCompetencia } from '@/lib/benefitReports';
import { renderPdfPagesToDataUrls } from '@/lib/pdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { registrarAcao } from '@/lib/acoesLog';
import { ClipboardCheck, Loader2, ScanText } from 'lucide-react';

type Doc = {
  id: string;
  funcionario_id: string | null;
  funcionario_nome: string | null;
  company_id: string | null;
  nome_arquivo: string | null;
  tipo_documento: string | null;
  data_documento: string | null;
  arquivo_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  descricao: string | null;
  observacao: string | null;
};
type Ocr = {
  tipo_documento?: string;
  funcionario_nome?: string;
  cpf?: string;
  data_documento?: string;
  data_inicio?: string;
  data_fim?: string;
  dias_cobertos?: number;
  horas_justificadas?: number;
  cid?: string;
  medico?: string;
  crm?: string;
  texto_bruto?: string;
  confianca?: number;
};
type Review = {
  inicio: string;
  fim: string;
  horas: string;
  dias: string;
  aplicarVR: boolean;
  aplicarVT: boolean;
  ocr?: Ocr;
  erro?: string;
};
const digits = (v: unknown) => String(v || '').replace(/\D/g, '');
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z'));
const mediaKey = (doc: Doc) => doc.arquivo_url || (doc.storage_bucket && doc.storage_path
  ? `storage://${doc.storage_bucket}/${doc.storage_path}` : '');

const blobAsDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Arquivo ilegível'));
  reader.readAsDataURL(blob);
});

const BenefitMedicalReview: React.FC<{ competencia: string; tipo: 'vr' | 'vt' }> = ({ competencia, tipo }) => {
  const { employees, companies, session } = useApp();
  const operador = useOperatorIdentity();
  const periodo = getPreviousCompetencia(competencia);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [accountingEmployees, setAccountingEmployees] = useState<Set<string>>(new Set());
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  const load = useCallback(async () => {
    const first = periodo + '-01';
    const [year, month] = periodo.split('-').map(Number);
    if (!year || !month) return;
    const until = new Date(Date.UTC(year, month, 3)).toISOString();
    setLoading(true);
    try {
      const [d, a, c] = await Promise.all([
        supabase.from('documentos_funcionario')
          .select('id,funcionario_id,funcionario_nome,company_id,nome_arquivo,tipo_documento,data_documento,arquivo_url,storage_bucket,storage_path,descricao,observacao')
          .or('tipo_documento.ilike.%ATESTADO%,tipo_documento.ilike.%DECLARA%')
          .gte('data_documento', `${first}T00:00:00-03:00`)
          .lt('data_documento', until)
          .order('data_documento', { ascending: false }),
        supabase.from('atestados').select('arquivo_url,status')
          .eq('status', 'confirmado'),
        supabase.from('contabilidade_folha_documentos')
          .select('funcionario_id,tipo_documento,classificacao,created_at')
          .gte('created_at', `${first}T00:00:00-03:00`).lt('created_at', until),
      ]);
      if (d.error) throw d.error;
      if (a.error) throw a.error;
      if (c.error) throw c.error;
      setDocs((d.data || []) as Doc[]);
      setConfirmed(new Set((a.data || []).map(row => row.arquivo_url || '').filter(Boolean)));
      setAccountingEmployees(new Set((c.data || []).filter(row =>
        /atestado|declarac/i.test(`${row.tipo_documento || ''} ${row.classificacao || ''}`)
      ).map(row => row.funcionario_id || '').filter(Boolean)));
    } catch (e: any) {
      toast.error('Não foi possível consultar os atestados: ' + (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const pendentes = useMemo(() => docs.filter(doc => !confirmed.has(mediaKey(doc))), [docs, confirmed]);

  const analyze = useCallback(async (doc: Doc) => {
    try {
      const path = doc.storage_path || '';
      const bucket = doc.storage_bucket || '';
      let url = doc.arquivo_url || '';
      if (bucket && path) {
        const signed = await supabase.storage.from(bucket).createSignedUrl(path, 180);
        if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error('Arquivo privado indisponível');
        url = signed.data.signedUrl;
      }
      if (!url.startsWith('https://')) throw new Error('Não há arquivo original acessível');
      const pdf = /\.pdf(?:\?|$)/i.test(path || url) || /\.pdf$/i.test(doc.nome_arquivo || '');
      let dataUrl: string;
      if (pdf) {
        const { pageUrls } = await renderPdfPagesToDataUrls(url, 1.5, 1);
        if (!pageUrls.length) throw new Error('PDF ilegível');
        dataUrl = pageUrls[0];
      } else {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Falha ao abrir o documento privado');
        dataUrl = await blobAsDataUrl(await response.blob());
      }
      const { data, error } = await supabase.functions.invoke('ocr-documento-ponto', { body: { dataUrl } });
      if (error || !data?.ok) throw error || new Error(data?.error || 'OCR não retornou um documento');
      const ocr: Ocr = data.data || {};
      const employee = employees.find(e => e.id === doc.funcionario_id);
      if (ocr.cpf && employee?.cpf && digits(ocr.cpf) !== digits(employee.cpf)) {
        throw new Error('CPF lido diverge do funcionário arquivado — requer correção de vínculo');
      }
      setReviews(prev => ({
        ...prev,
        [doc.id]: {
          inicio: ocr.data_inicio || '',
          fim: ocr.data_fim || '',
          horas: String(Math.max(0, Number(ocr.horas_justificadas) || 0)),
          dias: String(Math.max(0, Number(ocr.dias_cobertos) || 0)),
          // O OCR sugere, mas não autoriza descontos de benefícios.
          aplicarVR: false,
          aplicarVT: false,
          ocr,
        },
      }));
    } catch (e: any) {
      setReviews(prev => ({ ...prev, [doc.id]: {
        inicio: prev[doc.id]?.inicio || '',
        fim: prev[doc.id]?.fim || '',
        dias: prev[doc.id]?.dias || '0',
        horas: prev[doc.id]?.horas || '0',
        aplicarVR: false, aplicarVT: false,
        erro: e?.message || 'Arquivo não reconhecido',
      }}));
    }
  }, [employees]);

  const analyzeAll = async () => {
    setScanning(true);
    try {
      const todo = pendentes.filter(doc => !reviews[doc.id]);
      // Limite de duas leituras simultâneas para evitar sobrecarga no serviço de OCR.
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(2, todo.length) }, async () => {
        while (cursor < todo.length) {
          const item = todo[cursor++];
          await analyze(item);
        }
      }));
      toast.info('Leitura concluída. Confira as datas e valide os documentos antes do fechamento.');
    } finally { setScanning(false); }
  };

  const confirm = async (doc: Doc) => {
    const r = reviews[doc.id];
    const emp = employees.find(e => e.id === doc.funcionario_id);
    if (!session?.user?.id || !operador.nome) return toast.error('Identificação do administrador indisponível.');
    if (!emp || !doc.company_id || emp.companyId !== doc.company_id) return toast.error('Funcionário ou empresa sem vínculo válido.');
    if (!r || !isDate(r.inicio) || !isDate(r.fim) || r.inicio > r.fim) return toast.error('Informe e confira as datas reais de início e fim do documento.');
    const interseca = r.inicio <= `${periodo}-31` && r.fim >= `${periodo}-01`;
    if (!interseca) return toast.error('O atestado não corresponde ao mês deste fechamento.');
    const horas = Number(r.horas.replace(',', '.'));
    const dias = Number(r.dias);
    if (!Number.isFinite(horas) || horas < 0 || !Number.isInteger(dias) || dias < 0) return toast.error('Quantidade de horas ou dias inválida.');
    if ((r.aplicarVR || r.aplicarVT) && (dias === 0 || horas > 0)) return toast.error('Abatimento de VR/VT requer período em dias, sem declaração por horas.');
    const key = mediaKey(doc);
    if (!key) return toast.error('Documento sem origem de arquivo auditável.');
    setSavingId(doc.id);
    try {
      const payload = {
        funcionario_id: emp.id,
        funcionario_nome: emp.name,
        company_id: emp.companyId,
        empresa_nome: companies.find(c => c.id === emp.companyId)?.name || '',
        competencia: r.inicio.slice(0, 7),
        data_inicio: r.inicio,
        data_fim: r.fim,
        dias_cobertos: dias,
        arquivo_url: key,
        arquivo_nome: doc.nome_arquivo || 'Documento de afastamento',
        ocr_confianca: Number(r.ocr?.confianca) || 0,
        ocr_texto_bruto: String(r.ocr?.texto_bruto || ''),
        cid: String(r.ocr?.cid || ''),
        medico: String(r.ocr?.medico || ''),
        crm: String(r.ocr?.crm || ''),
        status: 'confirmado',
        aplicado_vr: dias > 0 && r.aplicarVR,
        aplicado_vt: dias > 0 && r.aplicarVT,
        importado_por_user_id: session.user.id,
        importado_por_nome: operador.nome,
      };
      const existing = await supabase.from('atestados').select('id').eq('arquivo_url', key).maybeSingle();
      if (existing.error) throw existing.error;
      const saved = existing.data?.id
        ? await supabase.from('atestados').update(payload as any).eq('id', existing.data.id)
        : await supabase.from('atestados').insert(payload as any);
      if (saved.error) throw saved.error;
      // Horas são justificativas de ponto, nunca dias inteiros de benefício.
      if (horas > 0) {
        const entry = await supabase.from('lancamentos_mensais')
          .select('id,observacoes,bloqueado').eq('funcionario_id', emp.id)
          .eq('competencia', r.inicio.slice(0, 7)).is('apagado_em', null).maybeSingle();
        if (entry.error) throw entry.error;
        const marker = `[DOC_ORIGEM:${doc.id}]`;
        if (entry.data && !entry.data.bloqueado && !String(entry.data.observacoes || '').includes(marker)) {
          const current = String(entry.data.observacoes || '');
          const { error } = await supabase.from('lancamentos_mensais')
            .update({ observacoes: [current, `${marker} DECLARACAO/ATESTADO HORAS: +${horas}h (conferido)`].filter(Boolean).join('\n') })
            .eq('id', entry.data.id);
          if (error) throw error;
        }
      }
      await registrarAcao({
        modulo: 'beneficios_medicos', entidade: 'documentos_funcionario', entidadeId: doc.id,
        acao: 'conferiu', observacao: `Competência ${periodo}; ${dias} dia(s); ${horas} hora(s); VR:${r.aplicarVR}; VT:${r.aplicarVT}`,
      }, { userId: session.user.id, userEmail: session.user.email, funcionarioNome: operador.nome, cpf: operador.cpf, origem: 'admin' });
      setConfirmed(prev => new Set([...prev, key]));
      window.dispatchEvent(new Event('topac:medical-updated'));
      toast.success('Documento conciliado com o fechamento e identificado pelo operador.');
    } catch (e: any) {
      toast.error('Falha ao conferir o documento: ' + (e.message || String(e)));
    } finally { setSavingId(null); }
  };

  return (
    <div className="mt-2">
      <button type="button" className="text-xs underline underline-offset-2 text-violet-300 hover:text-violet-200"
        onClick={() => setOpen(v => !v)} aria-expanded={open}>
        {open ? 'Fechar conferência de documentos' : 'Conferir documentos médicos do fechamento'}
      </button>
      {open && <div className="mt-3 rounded-xl border border-violet-400/30 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm font-semibold">Atestados arquivados · {periodo}</p>
            <p className="text-xs text-muted-foreground">OCR do arquivo original, comparação com fechamento e contabilidade. Nada é descontado sem sua confirmação.</p></div>
          <Button size="sm" variant="outline" onClick={analyzeAll} disabled={loading || scanning || !pendentes.length}>
            {scanning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanText className="mr-1 h-4 w-4" />}
            Analisar {pendentes.length} pendente(s)
          </Button>
        </div>
        {loading && <p className="text-xs">Consultando documentos privados...</p>}
        {!loading && !pendentes.length && <p className="text-xs text-emerald-400">Nenhum documento médico pendente nesta competência.</p>}
        <div className="max-h-[540px] overflow-y-auto space-y-2">
          {pendentes.map(doc => {
            const r = reviews[doc.id];
            return <div key={doc.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="text-sm font-medium">{doc.funcionario_nome || employees.find(e => e.id === doc.funcionario_id)?.name || 'Funcionário não vinculado'}</p>
                  <p className="text-xs text-muted-foreground">{doc.nome_arquivo || doc.tipo_documento || 'Documento'} · {doc.data_documento?.slice(0, 10) || 'sem data de envio'} · Contabilidade: {accountingEmployees.has(doc.funcionario_id || '') ? 'referência encontrada' : 'sem documento correspondente'}</p></div>
                <Button size="sm" variant="outline" disabled={scanning || savingId === doc.id} onClick={() => void analyze(doc)}>
                  <ScanText className="mr-1 h-4 w-4" />Ler arquivo
                </Button>
              </div>
              {r?.erro && <p className="text-xs text-amber-400">OCR: {r.erro}. Confira o arquivo original e preencha as datas.</p>}
              {r && <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <label className="text-xs">Início do afastamento<Input type="date" value={r.inicio} onChange={e => setReviews(p => ({ ...p, [doc.id]: { ...r, inicio: e.target.value } }))} /></label>
                  <label className="text-xs">Fim do afastamento<Input type="date" value={r.fim} onChange={e => setReviews(p => ({ ...p, [doc.id]: { ...r, fim: e.target.value } }))} /></label>
                  <label className="text-xs">Dias<Input type="number" min="0" value={r.dias} onChange={e => setReviews(p => ({ ...p, [doc.id]: { ...r, dias: e.target.value } }))} /></label>
                  <label className="text-xs">Horas<Input type="number" min="0" step="0.25" value={r.horas} onChange={e => setReviews(p => ({ ...p, [doc.id]: { ...r, horas: e.target.value } }))} /></label>
                </div>
                <p className="text-xs text-muted-foreground">Datas lidas do documento, não da postagem. Horas são conferidas no ponto; descontos em VR/VT precisam de autorização explícita.</p>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={r.aplicarVR} onChange={e => setReviews(p => ({ ...p, [doc.id]: { ...r, aplicarVR: e.target.checked } }))} />Aplicar abatimento VR</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={r.aplicarVT} onChange={e => setReviews(p => ({ ...p, [doc.id]: { ...r, aplicarVT: e.target.checked } }))} />Aplicar abatimento VT</label>
                  <Button size="sm" onClick={() => void confirm(doc)} disabled={savingId === doc.id}>
                    {savingId === doc.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-1 h-4 w-4" />}
                    Confirmar e conciliar
                  </Button>
                </div>
              </div>}
            </div>;
          })}
        </div>
      </div>}
    </div>
  );
};
export default BenefitMedicalReview;
