import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Building2, CalendarCheck, CheckCircle2, ChevronLeft, Clock3, Eye,
  FileCheck2, FileSearch, FileText, FileX, Loader2, RefreshCw, Send, Stethoscope,
  UploadCloud, Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import FechamentoPage from '@/pages/FechamentoPage';
import PreCadastroAdmissionalPage from '@/pages/PreCadastroAdmissionalPage';
import RescisaoPage from '@/pages/RescisaoPage';
import AvisoFeriasPage from '@/pages/AvisoFeriasPage';
import ASOPage from '@/pages/ASOPage';
import EmailsContabilidadePage from '@/pages/admin/EmailsContabilidadePage';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type TabKey = 'visao' | 'movimentacoes' | 'documentos' | 'fechamento';
type MetricView = 'pendencias' | 'conferidos' | 'documentos' | 'hoje' | null;
type ModuleKey = 'pre-cadastro' | 'rescisao' | 'ferias' | 'aso' | 'clinicas';
type Revisao = {
  id:string; origem_tipo:string; origem_id:string; empresa_id:string; status:string;
  observacao?:string|null; revisor_nome?:string|null; revisado_em?:string|null;
  source_updated_at?:string|null; created_at:string; updated_at?:string|null;
};
type Upload = {
  id:string; portal_user_id:string; empresa_id:string; tipo_documento:string;
  competencia?:string|null; funcionario_nome?:string|null; observacao?:string|null;
  arquivo_nome:string; tamanho_bytes?:number|null; status:string;
  formalizacao_email_status?:string|null; formalizacao_email_em?:string|null;
  formalizacao_destinos?:string[]|null; origem_tipo?:string|null; origem_id?:string|null; created_at:string;
  ciclo_id?:string|null; processo_tipo?:string|null;
  rh_resposta?:string|null; rh_resposta_em?:string|null; rh_resposta_por?:string|null;
};
type PayrollCycle = { id:string; empresa_id:string; competencia:string; tipo:string; status:string; conferido_em?:string|null; updated_at?:string|null };
type PortalUser = { id:string; nome:string; email?:string|null; portal:string };

const MODULE_KEYS: ModuleKey[] = ['pre-cadastro','rescisao','ferias','aso','clinicas'];

const brDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(d);
};
const tipoLabel = (value?: string | null) => ({
  recibos_holerites:'Recibos / Holerites', folha_processada:'Folha processada', contrato:'Contrato de trabalho',
  rescisao:'Documentos de rescisão', ferias:'Documentos de férias', retorno_folha:'Retorno da contabilidade', outro:'Outro documento',
}[String(value || '')] || String(value || 'Documento').replace(/_/g, ' '));
const statusLabel = (value?: string | null) => ({
  conferido:'Conferido', pendencia:'Pendência', retificacao:'Retificação', aguardando_analise:'Aguardando análise',
  enviado:'Formalizado', erro_envio_email:'Falha no e-mail', processando:'Processando', aguardando_configuracao:'Aguardando configuração',
}[String(value || '')] || String(value || '—').replace(/_/g, ' '));
const emailOk = (value?: string | null) => value === 'enviado';
const reviewHasDocument = (r:Revisao) => ['atestado_doc','atestado','admissao','ferias'].includes(String(r.origem_tipo || ''));

const CentralContabilidadePage: React.FC = () => {
  const { companies } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const abrirInteligente = location.pathname === '/admin/apontamento-inteligente' || searchParams.get('inteligente') === '1';
  const [tab, setTab] = useState<TabKey>(() => abrirInteligente ? 'fechamento' : 'visao');
  const [metricView, setMetricView] = useState<MetricView>(null);
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [payrollCycles, setPayrollCycles] = useState<PayrollCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyUploadId, setReplyUploadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [selectedUploadIds, setSelectedUploadIds] = useState<string[]>([]);
  const [bulkReplyOpen, setBulkReplyOpen] = useState(false);

  const moduleParam = searchParams.get('modulo') || '';
  const activeModule: ModuleKey | null = MODULE_KEYS.includes(moduleParam as ModuleKey) ? moduleParam as ModuleKey : null;

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const userMap = useMemo(() => new Map(portalUsers.map((u) => [u.id, u])), [portalUsers]);
  const replyUpload = useMemo(() => uploads.find((u) => u.id === replyUploadId) || null, [uploads, replyUploadId]);
  const replySender = replyUpload ? userMap.get(replyUpload.portal_user_id) : null;
  const buildReplyTemplate = useCallback((items:Upload[]) => {
    if (!items.length) return '';
    const empresas = Array.from(new Set(items.map((u) => companyMap.get(u.empresa_id) || 'Empresa')));
    const competencias = Array.from(new Set(items.map((u) => u.competencia).filter(Boolean) as string[]));
    const arquivos = items.map((u) => `- ${u.arquivo_nome}`).join('\n');
    return [
      'Prezados,',
      '',
      `Confirmamos o recebimento dos documentos abaixo${empresas.length === 1 ? ` referentes à ${empresas[0]}` : ''}${competencias.length === 1 ? ` — competência ${competencias[0]}` : ''}:`,
      '',
      arquivos,
      '',
      'Documentos recebidos e registrados pelo RH.',
      'Caso seja necessário algum ajuste ou complemento, retornaremos por este mesmo fluxo.',
      '',
      'Atenciosamente,',
      'RH TOPAC',
    ].join('\n');
  }, [companyMap]);

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [a, b, c, d] = await Promise.all([
        supabase.from('contabilidade_portal_revisoes' as any).select('*').order('updated_at', { ascending:false }).limit(250),
        supabase.from('contabilidade_portal_uploads' as any).select('*').order('created_at', { ascending:false }).limit(250),
        supabase.from('contabilidade_portal_usuarios' as any).select('id,nome,email,portal').eq('ativo', true),
        supabase.from('contabilidade_folha_ciclos' as any).select('id,empresa_id,competencia,tipo,status,conferido_em,updated_at').order('updated_at', { ascending:false }).limit(250),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      if (c.error) throw c.error;
      if (d.error) throw d.error;
      setRevisoes((a.data || []) as any);
      setUploads((b.data || []) as any);
      setPortalUsers((c.data || []) as any);
      setPayrollCycles((d.data || []) as any);
    } catch (e:any) {
      toast.error(e?.message || 'Não foi possível carregar a Central da Contabilidade.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    const metric = searchParams.get('metric');
    const requestedTab = searchParams.get('tab');
    if (metric === 'pendencias') {
      setMetricView('pendencias');
      setTab('movimentacoes');
    } else if (requestedTab === 'fechamento') {
      setTab('fechamento');
    }
  }, [searchParams]);


  useEffect(() => {
    const timer = window.setInterval(() => void carregar(true), 60_000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const pendencias = useMemo(() => revisoes.filter((r) => ['pendencia','retificacao','aguardando_analise'].includes(r.status)), [revisoes]);
  const conferidos = useMemo(() => revisoes.filter((r) => r.status === 'conferido'), [revisoes]);
  const receivedUploads = useMemo(() => uploads.filter((u) => u.origem_tipo !== 'rh_apontamento'), [uploads]);

  const uploadProcessType = useCallback((u:Upload): 'pagamento' | 'adiantamento' | 'outros' => {
    const explicit = String(u.processo_tipo || '').toLowerCase();
    if (explicit === 'adiantamento' || explicit === 'pagamento') return explicit;
    if (/adiant/i.test(u.arquivo_nome || '')) return 'adiantamento';
    if (String(u.origem_tipo || '').toLowerCase() === 'fechamento' || String(u.tipo_documento || '').toLowerCase() === 'fechamento') return 'pagamento';
    return 'outros';
  }, []);

  const uploadCycle = useCallback((u:Upload) => {
    if (u.ciclo_id) {
      const direct = payrollCycles.find(cycle => cycle.id === u.ciclo_id);
      if (direct) return direct;
    }
    const tipo = uploadProcessType(u);
    if (tipo === 'outros' || !u.competencia) return null;
    return payrollCycles.find(cycle =>
      cycle.empresa_id === u.empresa_id &&
      cycle.competencia === u.competencia &&
      cycle.tipo === tipo
    ) || null;
  }, [payrollCycles, uploadProcessType]);

  const uploadConcluded = useCallback((u:Upload) => {
    if (u.rh_resposta_em) return true;
    const cycle = uploadCycle(u);
    return String(cycle?.status || '').toLowerCase() === 'conferido';
  }, [uploadCycle]);

  const pendingReceivedUploads = useMemo(() => receivedUploads.filter(u => !uploadConcluded(u)), [receivedUploads, uploadConcluded]);
  const completedReceivedUploads = useMemo(() => receivedUploads.filter(u => uploadConcluded(u)), [receivedUploads, uploadConcluded]);
  const pendingPagamento = useMemo(() => pendingReceivedUploads.filter(u => uploadProcessType(u) === 'pagamento'), [pendingReceivedUploads, uploadProcessType]);
  const pendingAdiantamento = useMemo(() => pendingReceivedUploads.filter(u => uploadProcessType(u) === 'adiantamento'), [pendingReceivedUploads, uploadProcessType]);
  const pendingOutros = useMemo(() => pendingReceivedUploads.filter(u => uploadProcessType(u) === 'outros'), [pendingReceivedUploads, uploadProcessType]);
  const historicoPagamento = useMemo(() => completedReceivedUploads.filter(u => uploadProcessType(u) === 'pagamento'), [completedReceivedUploads, uploadProcessType]);
  const historicoAdiantamento = useMemo(() => completedReceivedUploads.filter(u => uploadProcessType(u) === 'adiantamento'), [completedReceivedUploads, uploadProcessType]);
  const historicoOutros = useMemo(() => completedReceivedUploads.filter(u => uploadProcessType(u) === 'outros'), [completedReceivedUploads, uploadProcessType]);

  useEffect(() => {
    const allowed = new Set(pendingReceivedUploads.map(u => u.id));
    setSelectedUploadIds(current => current.filter(id => allowed.has(id)));
  }, [pendingReceivedUploads.map(u => u.id).join('|')]);

  const errosEmail = useMemo(() => pendingReceivedUploads.filter((u) => !!u.formalizacao_email_status && !emailOk(u.formalizacao_email_status)), [pendingReceivedUploads]);
  const selectedUploads = useMemo(() => pendingReceivedUploads.filter((u) => selectedUploadIds.includes(u.id)), [pendingReceivedUploads, selectedUploadIds]);
  const hojeKey = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const todayMovements = useMemo(() => {
    const reviewItems = revisoes
      .filter((r) => new Date(r.updated_at || r.created_at).toLocaleDateString('en-CA') === hojeKey)
      .map((r) => ({
        id:`review:${r.id}`,
        kind:'review' as const,
        at:r.updated_at || r.revisado_em || r.created_at,
        companyId:r.empresa_id,
        title:String(r.origem_tipo || 'Movimentação').replace(/_/g,' '),
        subtitle:r.revisor_nome || 'Contabilidade',
        status:r.status,
        review:r,
      }));
    const uploadItems = uploads
      .filter((u) => new Date(u.created_at).toLocaleDateString('en-CA') === hojeKey)
      .map((u) => ({
        id:`upload:${u.id}`,
        kind:'upload' as const,
        at:u.created_at,
        companyId:u.empresa_id,
        title:u.arquivo_nome,
        subtitle:userMap.get(u.portal_user_id)?.nome || 'Contabilidade',
        status:u.status || 'recebido',
        upload:u,
      }));
    return [...reviewItems, ...uploadItems].sort((a,b) =>
      new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()
    );
  }, [revisoes, uploads, hojeKey, userMap]);
  const hoje = todayMovements.length;

  const filteredRevisoes = useMemo(() => {
    if (metricView === 'pendencias') return pendencias;
    if (metricView === 'conferidos') return conferidos;
    return revisoes;
  }, [metricView, pendencias, conferidos, revisoes]);

  const movementTitle = metricView === 'pendencias'
    ? 'Pendências / retificações'
    : metricView === 'conferidos'
      ? 'Conferidos'
      : 'Conferências feitas pela contabilidade';

  const openMetric = (view:Exclude<MetricView, null>) => {
    setMetricView(view);
    if (view === 'documentos') setTab('documentos');
    else if (view === 'hoje') setTab('visao');
    else setTab('movimentacoes');
    window.setTimeout(() => window.scrollTo({ top: 360, behavior:'smooth' }), 40);
  };

  const openModule = (key: ModuleKey) => {
    setMetricView(null);
    const next = new URLSearchParams(searchParams);
    next.set('modulo', key);
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeModule = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('modulo');
    setSearchParams(next);
    setMetricView(null);
    setTab('visao');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const authToken = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    return data.session.access_token;
  };

  const chamarCentralAdmin = async (action:string, uploadId:string, extra:Record<string, unknown> = {}) => {
    const token = await authToken();
    const response = await fetch('/api/accounting-central-admin', {
      method:'POST',
      headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` },
      body:JSON.stringify({ action, upload_id:uploadId, ...extra }),
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(data?.message || data?.error || 'Operação não concluída.');
    return data;
  };

  const chamarReviewAction = async (payload:Record<string, unknown>) => {
    const token = await authToken();
    const response = await fetch('/api/accounting-review-action', {
      method:'POST',
      headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` },
      body:JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.message || data?.error || 'Documento indisponível.');
    return data;
  };

  const abrirUpload = async (u:Upload) => {
    setBusyId(u.id);
    try {
      const data = await chamarCentralAdmin('view_upload', u.id);
      if (!data.url) throw new Error('Documento indisponível.');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e:any) {
      toast.error(e?.message || 'Erro ao abrir documento.');
    } finally {
      setBusyId(null);
    }
  };

  const abrirDocumentoRevisao = async (r:Revisao) => {
    setBusyId(r.id);
    try {
      const data = await chamarReviewAction({ action:'view_review_source', origem_tipo:r.origem_tipo, origem_id:r.origem_id });
      if (!data.url) throw new Error('Documento indisponível.');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e:any) {
      toast.error(e?.message || 'Este movimento não possui documento disponível.');
    } finally {
      setBusyId(null);
    }
  };

  const responderUpload = async (u:Upload) => {
    const text = replyText.trim();
    if (!text) return toast.error('Escreva a resposta antes de enviar.');
    setBusyId(u.id);
    try {
      await chamarCentralAdmin('reply_upload', u.id, { text });
      toast.success('Resposta enviada para a Contabilidade e registrada no histórico.');
      setReplyUploadId(null);
      setReplyText('');
      await carregar(true);
    } catch (e:any) {
      toast.error(e?.message || 'Não foi possível enviar a resposta.');
    } finally {
      setBusyId(null);
    }
  };

  const responderEmMassa = async () => {
    const items = selectedUploads;
    const text = replyText.trim();
    if (!items.length) return toast.error('Selecione pelo menos um documento.');
    if (!text) return toast.error('A resposta não pode ficar vazia.');
    setBusyId('bulk');
    try {
      const first = items[0];
      const result = await chamarCentralAdmin('reply_uploads_bulk', first.id, { upload_ids:items.map(i=>i.id), text });
      toast.success(`Retorno enviado em massa: ${Number(result.sent || items.length)} documento(s).`);
      setBulkReplyOpen(false);
      setReplyText('');
      setSelectedUploadIds([]);
      await carregar(true);
    } catch (e:any) {
      const message = String(e?.message || '');
      if (message === 'nenhum_envio_concluido' || message.includes('domínio') || message.includes('domain')) {
        toast.error('O envio foi bloqueado pelo serviço de e-mail. O domínio/remetente da plataforma precisa estar validado na mesma conta da chave de envio.');
      } else {
        toast.error(message || 'Não foi possível enviar o retorno em massa.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const reenviarFormalizacao = async (u:Upload) => {
    setBusyId(u.id);
    try {
      const data = await chamarCentralAdmin('retry_email', u.id);
      if (data.email_status === 'enviado') toast.success('Formalização enviada por e-mail.');
      else toast.error(`Documento recebido, mas o e-mail ainda não saiu: ${statusLabel(data.email_status)}.`);
      await carregar(true);
    } catch (e:any) {
      toast.error(e?.message || 'Erro ao reenviar formalização.');
    } finally {
      setBusyId(null);
    }
  };

  const renderReceivedUploadRow = (u:Upload, historical = false) => {
    const sender = userMap.get(u.portal_user_id);
    const process = uploadProcessType(u);
    return (
      <div key={u.id} className={`rounded-lg border bg-[#080a0e] ${!historical && selectedUploadIds.includes(u.id) ? 'border-violet-500/60' : 'border-[#24212a]'} ${historical ? 'opacity-80' : ''}`}>
        <div className={`grid gap-3 p-4 ${historical ? 'lg:grid-cols-[1.5fr_.8fr_.8fr_.8fr_auto]' : 'lg:grid-cols-[auto_1.5fr_.8fr_.8fr_.8fr_auto]'} lg:items-center`}>
          {!historical && (
            <label className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={selectedUploadIds.includes(u.id)}
                onChange={(e)=>setSelectedUploadIds(current => e.target.checked ? Array.from(new Set([...current, u.id])) : current.filter(id => id !== u.id))}
                className="h-4 w-4 accent-violet-600"
                aria-label={`Selecionar ${u.arquivo_nome}`}
              />
            </label>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{u.arquivo_nome}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>{tipoLabel(u.tipo_documento)}{u.funcionario_nome?` · ${u.funcionario_nome}`:''}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${process==='adiantamento'?'border-amber-500/20 text-amber-300':process==='pagamento'?'border-sky-500/20 text-sky-300':'border-zinc-500/20 text-zinc-400'}`}>
                {process==='adiantamento'?'Adiantamento':process==='pagamento'?'Pagamento':'Outro processo'}
              </span>
              {historical && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[.05] px-2 py-0.5 text-[9px] font-black uppercase text-emerald-300">Concluído</span>}
            </div>
            {u.observacao && <div className="mt-2 rounded-md border border-[#30283a] bg-[#06080c] p-2 text-xs text-zinc-300"><b className="text-zinc-500">Mensagem da Contabilidade:</b> {u.observacao}</div>}
          </div>
          <Info label="Empresa" value={companyMap.get(u.empresa_id)||'—'}/>
          <div>
            <Info label="Enviado por" value={sender?.nome||'Contabilidade'}/>
            {sender?.email && <div className="mt-1 text-[10px] text-zinc-600">{sender.email}</div>}
          </div>
          <div>
            <div className="text-[10px] uppercase text-zinc-600">Formalização</div>
            <div className="mt-1"><StatusBadge value={u.formalizacao_email_status||'—'}/></div>
            <div className="mt-2 text-[10px] text-zinc-600">{brDateTime(u.created_at)}</div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button onClick={()=>void abrirUpload(u)} disabled={busyId===u.id} className="rounded-md border border-[#423051] px-3 py-2 text-xs font-bold text-zinc-200">Abrir PDF</button>
            {!historical && <button onClick={()=>{setReplyUploadId(u.id);setReplyText(buildReplyTemplate([u]));}} className="rounded-md bg-[#7c24d6] px-3 py-2 text-xs font-bold text-white">Responder</button>}
            {!historical && !emailOk(u.formalizacao_email_status)&&<button onClick={()=>void reenviarFormalizacao(u)} disabled={busyId===u.id} className="rounded-md border border-amber-500/30 px-3 py-2 text-xs font-bold text-amber-200">Reenviar formalização</button>}
          </div>
        </div>
        {historical && u.rh_resposta_em && (
          <div className="mx-4 mb-3 text-[10px] text-emerald-300">Retorno do RH registrado em {brDateTime(u.rh_resposta_em)}</div>
        )}
      </div>
    );
  };

  const tabs:Array<{key:TabKey;label:string;icon:React.ElementType}> = [
    { key:'visao', label:'Visão geral', icon:Building2 },
    { key:'movimentacoes', label:'Conferências', icon:FileCheck2 },
    { key:'documentos', label:'Documentos recebidos', icon:UploadCloud },
    { key:'fechamento', label:'Fechamento', icon:Send },
  ];

  const processCards:Array<{key:ModuleKey;title:string;description:string;icon:React.ElementType}> = [
    { key:'pre-cadastro', title:'Pré-cadastro', description:'Admissão, documentação e preparação do novo funcionário.', icon:FileSearch },
    { key:'rescisao', title:'Rescisões', description:'Solicitação, acompanhamento e documentos de desligamento.', icon:FileX },
    { key:'ferias', title:'Solicitação de Férias', description:'Solicitar férias e formalizar o envio para a contabilidade.', icon:CalendarCheck },
    { key:'aso', title:'ASO', description:'Controle dos exames ocupacionais e documentos do funcionário.', icon:Stethoscope },
    { key:'clinicas', title:'Envio para Clínicas', description:'Solicitações, e-mails e acompanhamento dos envios às clínicas.', icon:Send },
  ];

  const activeTitle = processCards.find(item => item.key === activeModule)?.title || '';

  if (location.pathname === '/admin/apontamento-inteligente') return <FechamentoPage abrirInteligente />;

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="overflow-hidden rounded-xl border border-[#2b2335] bg-[#05070b] shadow-[0_18px_50px_rgba(0,0,0,.24)]">
        <div className="flex flex-col gap-5 border-b border-[#28212f] bg-[radial-gradient(circle_at_10%_0%,rgba(139,34,255,.17),transparent_36%)] px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[.18em] text-[#a855f7]">Administração TOPAC RH PRO</div>
            <h1 className="mt-1 text-2xl font-black text-white">Central da Contabilidade</h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-400">Todos os processos de RH que envolvem contabilidade e clínicas ficam centralizados aqui.</p>
          </div>
          <button onClick={() => void carregar()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#3b2b4b] bg-[#0b0d12] px-4 py-2 text-xs font-bold text-zinc-200 hover:border-[#8b22ff]">
            <RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`} /> Atualizar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
          <MetricCard icon={AlertTriangle} label="Pendências / retificações" value={pendencias.length} tone="amber" active={metricView==='pendencias'} onClick={()=>openMetric('pendencias')} />
          <MetricCard icon={CheckCircle2} label="Conferidos" value={conferidos.length} tone="green" active={metricView==='conferidos'} onClick={()=>openMetric('conferidos')} />
          <MetricCard icon={FileText} label="Documentos recebidos" value={receivedUploads.length} tone="purple" active={metricView==='documentos'} onClick={()=>openMetric('documentos')} />
          <MetricCard icon={Clock3} label="Movimentações hoje" value={hoje} tone="blue" active={metricView==='hoje'} onClick={()=>openMetric('hoje')} />
        </div>

        <div className="border-t border-[#211b28] bg-[#07090d] p-4">
          <div className="mb-3 text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">Processos da Central</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {processCards.map(({key,title,description,icon:Icon}) => (
              <button
                key={key}
                type="button"
                onClick={() => openModule(key)}
                className={`group rounded-xl border p-4 text-left transition ${activeModule===key ? 'border-[#8b22ff] bg-[#241039] shadow-[0_0_28px_rgba(139,34,255,.12)]' : 'border-[#2b2631] bg-[#090b10] hover:-translate-y-0.5 hover:border-[#7131a8]'}`}
              >
                <div className="flex items-center justify-between"><Icon className="h-5 w-5 text-[#ffc400]"/><span className="text-[10px] font-bold text-zinc-600 group-hover:text-zinc-400">Abrir →</span></div>
                <div className="mt-3 text-sm font-black text-white">{title}</div>
                <div className="mt-1 text-[10px] leading-relaxed text-zinc-500">{description}</div>
              </button>
            ))}
          </div>
        </div>

        {!activeModule && <div className="flex gap-1 overflow-x-auto border-t border-[#211b28] bg-[#07090d] px-3 py-2">
          {tabs.map(({key,label,icon:Icon}) => (
            <button key={key} onClick={() => { setMetricView(null); setTab(key); }} className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-bold ${tab===key && !metricView?'bg-[#25123d] text-white ring-1 ring-[#7131a8]':'text-zinc-500 hover:bg-white/[.035] hover:text-zinc-200'}`}>
              <Icon className={`h-4 w-4 ${tab===key?'text-[#ffc400]':'text-[#8b22ff]'}`} />{label}
            </button>
          ))}
        </div>}
      </section>

      {activeModule ? (
        <section className="space-y-4 rounded-xl border border-[#31263c] bg-[#04060a] p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#292230] bg-[#080a0e] px-4 py-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.16em] text-violet-400">Central da Contabilidade</div>
              <div className="mt-1 text-base font-black text-white">{activeTitle}</div>
            </div>
            <button type="button" onClick={closeModule} className="inline-flex items-center gap-2 rounded-md border border-[#41314f] px-3 py-2 text-xs font-bold text-zinc-300 hover:border-violet-500 hover:text-white"><ChevronLeft className="h-4 w-4"/>Voltar à Central</button>
          </div>
          {activeModule === 'pre-cadastro' && <PreCadastroAdmissionalPage />}
          {activeModule === 'rescisao' && <RescisaoPage />}
          {activeModule === 'ferias' && <AvisoFeriasPage />}
          {activeModule === 'aso' && <ASOPage />}
          {activeModule === 'clinicas' && <EmailsContabilidadePage />}
        </section>
      ) : loading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-[#27222e] bg-[#05070b]"><Loader2 className="h-6 w-6 animate-spin text-[#a855f7]" /></div>
      ) : metricView === 'hoje' ? (
        <Panel title="Movimentações de hoje" icon={Clock3}>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-sky-500/15 bg-sky-500/[.035] px-4 py-3">
            <div className="text-xs font-bold text-sky-200">{hoje} movimentação(ões) registrada(s) hoje</div>
            <button type="button" onClick={()=>{setMetricView(null);setTab('visao');}} className="rounded-md border border-[#423051] px-3 py-1.5 text-[11px] font-bold text-zinc-300 hover:border-violet-500">Voltar à visão geral</button>
          </div>
          {todayMovements.length===0 ? <Empty text="Nenhuma movimentação registrada hoje."/> : (
            <div className="space-y-2">
              {todayMovements.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-[#24212a] bg-[#080a0e] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-zinc-100">{item.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">{companyMap.get(item.companyId)||'Empresa'} · {item.subtitle} · {brDateTime(item.at)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge value={item.status}/>
                    {item.kind==='upload'
                      ? <button onClick={()=>void abrirUpload(item.upload)} disabled={busyId===item.upload.id} className="inline-flex items-center gap-1.5 rounded-md border border-[#423051] px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-[#8b22ff] disabled:opacity-50"><Eye className="h-3.5 w-3.5"/>Abrir</button>
                      : reviewHasDocument(item.review) && <button onClick={()=>void abrirDocumentoRevisao(item.review)} disabled={busyId===item.review.id} className="inline-flex items-center gap-1.5 rounded-md border border-[#423051] px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-[#8b22ff] disabled:opacity-50"><Eye className="h-3.5 w-3.5"/>Abrir</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : tab === 'fechamento' ? (
        <FechamentoPage abrirInteligente={abrirInteligente} />
      ) : tab === 'visao' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Últimas conferências" icon={FileCheck2}>
            {revisoes.length===0 ? <Empty text="Nenhuma conferência registrada."/> : revisoes.slice(0,8).map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 border-b border-[#1f2026] py-3 last:border-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-zinc-100">{String(r.origem_tipo||'Movimentação').replace(/_/g,' ')}</div>
                  <div className="mt-1 text-xs text-zinc-500">{companyMap.get(r.empresa_id)||'Empresa'} · {r.revisor_nome||'Contabilidade'} · {brDateTime(r.revisado_em||r.created_at)}</div>
                  {r.observacao&&<div className="mt-1 line-clamp-2 text-xs text-zinc-400">{r.observacao}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {reviewHasDocument(r) && <button onClick={()=>void abrirDocumentoRevisao(r)} disabled={busyId===r.id} className="inline-flex items-center gap-1.5 rounded-md border border-[#423051] px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-[#8b22ff] disabled:opacity-50">{busyId===r.id?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Eye className="h-3.5 w-3.5"/>}Abrir documento</button>}
                  <StatusBadge value={r.status}/>
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Últimos documentos recebidos" icon={UploadCloud}>
            {receivedUploads.length===0 ? <Empty text="Nenhum documento recebido."/> : receivedUploads.slice(0,8).map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 border-b border-[#1f2026] py-3 last:border-0">
                <div className="min-w-0"><div className="truncate text-sm font-bold text-zinc-100">{u.arquivo_nome}</div><div className="mt-1 text-xs text-zinc-500">{companyMap.get(u.empresa_id)||'Empresa'} · {userMap.get(u.portal_user_id)?.nome||'Contabilidade'} · {brDateTime(u.created_at)}</div></div>
                <button onClick={()=>void abrirUpload(u)} disabled={busyId===u.id} className="rounded-md border border-[#3a2c48] px-3 py-1.5 text-xs font-bold text-zinc-200 hover:border-[#8b22ff]">Abrir</button>
              </div>
            ))}
          </Panel>

          {errosEmail.length>0&&<div className="xl:col-span-2"><Panel title="Formalizações de e-mail com falha" icon={AlertTriangle}><div className="grid gap-2 lg:grid-cols-2">{errosEmail.slice(0,12).map((u)=><div key={u.id} className="rounded-lg border border-rose-500/20 bg-rose-500/[.045] p-3"><div className="text-sm font-bold text-white">{u.arquivo_nome}</div><div className="mt-1 text-xs text-zinc-500">{companyMap.get(u.empresa_id)||'Empresa'} · {brDateTime(u.created_at)}</div><div className="mt-3 flex items-center justify-between gap-2"><StatusBadge value={u.formalizacao_email_status||'erro_envio_email'}/><button onClick={()=>void reenviarFormalizacao(u)} disabled={busyId===u.id} className="inline-flex items-center gap-2 rounded-md bg-[#7c24d6] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{busyId===u.id?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Send className="h-3.5 w-3.5"/>}Reenviar formalização</button></div></div>)}</div></Panel></div>}
        </div>
      ) : tab === 'movimentacoes' ? (
        <Panel title={movementTitle} icon={Users}>
          {(metricView==='pendencias'||metricView==='conferidos') && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#2b2631] bg-[#080a0e] px-4 py-3">
              <div className="text-xs font-bold text-zinc-300">Filtro ativo: <span className="text-white">{movementTitle}</span> · {filteredRevisoes.length} registro(s)</div>
              <button type="button" onClick={()=>setMetricView(null)} className="rounded-md border border-[#423051] px-3 py-1.5 text-[11px] font-bold text-zinc-300 hover:border-violet-500">Ver todas</button>
            </div>
          )}
          {filteredRevisoes.length===0 ? <Empty text={metricView==='pendencias'?'Nenhuma pendência ou retificação.':metricView==='conferidos'?'Nenhuma conferência concluída.':'Nenhuma conferência registrada.'}/> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-[#29242f] text-[10px] uppercase text-zinc-500"><tr><th className="px-3 py-3">Movimento</th><th className="px-3 py-3">Empresa</th><th className="px-3 py-3">Contabilidade</th><th className="px-3 py-3">Data / hora</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Documento</th><th className="px-3 py-3">Observação</th></tr></thead>
                <tbody>{filteredRevisoes.map((r)=><tr key={r.id} className="border-b border-[#1b1c21]"><td className="px-3 py-3 font-bold text-zinc-200">{String(r.origem_tipo||'Movimentação').replace(/_/g,' ')}</td><td className="px-3 py-3 text-zinc-400">{companyMap.get(r.empresa_id)||'—'}</td><td className="px-3 py-3 text-zinc-400">{r.revisor_nome||'—'}</td><td className="px-3 py-3 text-zinc-400">{brDateTime(r.revisado_em||r.created_at)}</td><td className="px-3 py-3"><StatusBadge value={r.status}/></td><td className="px-3 py-3">{reviewHasDocument(r)?<button onClick={()=>void abrirDocumentoRevisao(r)} disabled={busyId===r.id} className="inline-flex items-center gap-1.5 rounded-md border border-[#423051] px-2.5 py-1.5 font-bold text-zinc-200 hover:border-[#8b22ff] disabled:opacity-50">{busyId===r.id?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Eye className="h-3.5 w-3.5"/>}Abrir</button>:<span className="text-zinc-700">—</span>}</td><td className="max-w-[340px] px-3 py-3 text-zinc-400">{r.observacao||'—'}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <Panel title="Documentos enviados pela contabilidade para o RH" icon={UploadCloud}>
          {receivedUploads.length===0 ? <Empty text="Nenhum documento recebido."/> : (
            <div className="space-y-4">
              {pendingReceivedUploads.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2b2631] bg-[#080a0e] p-3">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-zinc-300">
                      <input
                        type="checkbox"
                        checked={pendingReceivedUploads.length > 0 && selectedUploadIds.length === pendingReceivedUploads.length}
                        onChange={(e)=>setSelectedUploadIds(e.target.checked ? pendingReceivedUploads.map(u => u.id) : [])}
                        className="h-4 w-4 accent-violet-600"
                      />
                      Selecionar pendentes
                    </label>
                    <span className="text-xs text-zinc-500">{selectedUploadIds.length} selecionado(s)</span>
                  </div>
                  <button
                    type="button"
                    disabled={selectedUploadIds.length === 0}
                    onClick={()=>{setReplyText(buildReplyTemplate(selectedUploads));setBulkReplyOpen(true);}}
                    className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
                  >
                    <Send className="h-4 w-4"/> Responder selecionados ({selectedUploadIds.length})
                  </button>
                </div>
              )}

              {pendingPagamento.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="text-[11px] font-black uppercase tracking-[.14em] text-sky-300">Pagamento · aguardando conclusão</div>
                    <div className="text-[10px] text-zinc-500">{pendingPagamento.length} documento(s)</div>
                  </div>
                  {pendingPagamento.map(u => renderReceivedUploadRow(u))}
                </section>
              )}

              {pendingAdiantamento.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="text-[11px] font-black uppercase tracking-[.14em] text-amber-300">Adiantamento · aguardando conclusão</div>
                    <div className="text-[10px] text-zinc-500">{pendingAdiantamento.length} documento(s)</div>
                  </div>
                  {pendingAdiantamento.map(u => renderReceivedUploadRow(u))}
                </section>
              )}

              {pendingOutros.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="text-[11px] font-black uppercase tracking-[.14em] text-zinc-300">Outros processos · aguardando conclusão</div>
                    <div className="text-[10px] text-zinc-500">{pendingOutros.length} documento(s)</div>
                  </div>
                  {pendingOutros.map(u => renderReceivedUploadRow(u))}
                </section>
              )}

              {pendingReceivedUploads.length === 0 && (
                <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[.035] px-4 py-4 text-sm text-emerald-300">
                  Nenhum documento pendente. Os processos concluídos estão somente no histórico abaixo.
                </div>
              )}

              {(historicoPagamento.length > 0 || historicoAdiantamento.length > 0 || historicoOutros.length > 0) && (
                <div className="space-y-2 border-t border-[#28212f] pt-4">
                  <div className="text-[10px] font-black uppercase tracking-[.16em] text-zinc-600">Histórico concluído</div>

                  {historicoPagamento.length > 0 && (
                    <details className="rounded-lg border border-[#24212a] bg-[#07090d]">
                      <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black text-zinc-300">
                        Pagamento concluído <span className="ml-2 text-zinc-600">({historicoPagamento.length})</span>
                      </summary>
                      <div className="space-y-2 border-t border-[#24212a] p-3">
                        {historicoPagamento.map(u => renderReceivedUploadRow(u, true))}
                      </div>
                    </details>
                  )}

                  {historicoAdiantamento.length > 0 && (
                    <details className="rounded-lg border border-[#24212a] bg-[#07090d]">
                      <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black text-zinc-300">
                        Adiantamento concluído <span className="ml-2 text-zinc-600">({historicoAdiantamento.length})</span>
                      </summary>
                      <div className="space-y-2 border-t border-[#24212a] p-3">
                        {historicoAdiantamento.map(u => renderReceivedUploadRow(u, true))}
                      </div>
                    </details>
                  )}

                  {historicoOutros.length > 0 && (
                    <details className="rounded-lg border border-[#24212a] bg-[#07090d]">
                      <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black text-zinc-300">
                        Outros processos concluídos <span className="ml-2 text-zinc-600">({historicoOutros.length})</span>
                      </summary>
                      <div className="space-y-2 border-t border-[#24212a] p-3">
                        {historicoOutros.map(u => renderReceivedUploadRow(u, true))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      <Dialog open={bulkReplyOpen} onOpenChange={(open) => {
        setBulkReplyOpen(open);
        if (!open) setReplyText('');
      }}>
        <DialogContent className="max-w-2xl border-[#3a2c48] bg-[#07090d] text-white">
          <DialogHeader>
            <DialogTitle>Responder documentos selecionados</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-[#2b2631] bg-[#05070b] p-4">
              <div className="text-xs font-black uppercase tracking-wide text-violet-300">{selectedUploads.length} documento(s) selecionado(s)</div>
              <div className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-zinc-400">
                {selectedUploads.map(u => <div key={u.id}>• {u.arquivo_nome} — {companyMap.get(u.empresa_id)||'Empresa'}</div>)}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-bold text-zinc-300">E-mail de resposta já preparado</div>
              <textarea
                value={replyText}
                onChange={(e)=>setReplyText(e.target.value)}
                rows={10}
                className="w-full resize-y rounded-lg border border-[#49315e] bg-[#05070b] p-3 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
            <div className="rounded-md border border-sky-500/15 bg-sky-500/[.035] p-3 text-[11px] text-zinc-400">
              O sistema envia a resposta para os responsáveis corretos de cada documento e mantém o registro individual no histórico.
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={()=>setBulkReplyOpen(false)} className="rounded-md border border-[#423051] px-4 py-2 text-xs font-bold text-zinc-300">Cancelar</button>
              <button type="button" onClick={()=>void responderEmMassa()} disabled={busyId==='bulk'||!replyText.trim()} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                {busyId==='bulk'?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}
                Enviar retorno em massa
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!replyUpload} onOpenChange={(open) => {
        if (!open) {
          setReplyUploadId(null);
          setReplyText('');
        }
      }}>
        <DialogContent className="max-w-2xl border-[#3a2c48] bg-[#07090d] text-white">
          <DialogHeader>
            <DialogTitle>Responder à Contabilidade</DialogTitle>
          </DialogHeader>

          {replyUpload && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#2b2631] bg-[#05070b] p-4">
                <div className="text-sm font-black text-white">{replyUpload.arquivo_nome}</div>
                <div className="mt-2 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
                  <div><b className="text-zinc-500">Empresa:</b> {companyMap.get(replyUpload.empresa_id)||'—'}</div>
                  <div><b className="text-zinc-500">Enviado por:</b> {replySender?.nome||'Contabilidade'}</div>
                  {replySender?.email && <div className="sm:col-span-2"><b className="text-zinc-500">E-mail:</b> {replySender.email}</div>}
                </div>
                {replyUpload.observacao && (
                  <div className="mt-3 rounded-md border border-violet-500/15 bg-violet-500/[.035] p-3 text-xs text-zinc-300">
                    <b className="text-violet-300">Mensagem da Contabilidade:</b> {replyUpload.observacao}
                  </div>
                )}
                <button
                  type="button"
                  onClick={()=>void abrirUpload(replyUpload)}
                  className="mt-3 inline-flex items-center gap-2 rounded-md border border-[#423051] px-3 py-2 text-xs font-bold text-zinc-200"
                >
                  <Eye className="h-4 w-4"/> Abrir PDF recebido
                </button>
              </div>

              <textarea
                value={replyText}
                onChange={(e)=>setReplyText(e.target.value)}
                rows={5}
                placeholder="Digite aqui o retorno para a Contabilidade..."
                className="w-full resize-y rounded-lg border border-[#49315e] bg-[#05070b] p-3 text-sm text-white outline-none focus:border-violet-500"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={()=>{setReplyUploadId(null);setReplyText('');}}
                  className="rounded-md border border-[#423051] px-4 py-2 text-xs font-bold text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={()=>void responderUpload(replyUpload)}
                  disabled={busyId===replyUpload.id || !replyText.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busyId===replyUpload.id?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}
                  Enviar retorno
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Panel=({title,icon:Icon,children}:{title:string;icon:React.ElementType;children:React.ReactNode})=><section className="rounded-xl border border-[#27222e] bg-[#05070b] p-5"><div className="mb-4 flex items-center gap-2"><Icon className="h-4 w-4 text-[#ffc400]"/><h2 className="text-sm font-black uppercase tracking-wide text-white">{title}</h2></div>{children}</section>;
const Empty=({text}:{text:string})=><div className="py-10 text-center text-sm text-zinc-600">{text}</div>;
const Info=({label,value}:{label:string;value:string})=><div><div className="text-[10px] uppercase text-zinc-600">{label}</div><div className="mt-1 text-xs font-semibold text-zinc-300">{value}</div></div>;
const MetricCard=({icon:Icon,label,value,tone,onClick,active=false}:{icon:React.ElementType;label:string;value:number;tone:'amber'|'green'|'purple'|'blue';onClick:()=>void;active?:boolean})=>{const tones={amber:'text-amber-300 border-amber-500/20 bg-amber-500/[.055]',green:'text-emerald-300 border-emerald-500/20 bg-emerald-500/[.055]',purple:'text-violet-300 border-violet-500/20 bg-violet-500/[.055]',blue:'text-sky-300 border-sky-500/20 bg-sky-500/[.055]'};return <button type="button" onClick={onClick} aria-pressed={active} className={`group rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-violet-500/60 ${tones[tone]} ${active?'ring-2 ring-violet-500/70 shadow-[0_0_24px_rgba(139,34,255,.12)]':''}`}><div className="flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div><Icon className="h-4 w-4"/></div><div className="mt-2 flex items-end justify-between gap-3"><div className="text-2xl font-black text-white">{value}</div><span className="text-[10px] font-black uppercase tracking-wide opacity-0 transition group-hover:opacity-80">Abrir →</span></div></button>};
const StatusBadge=({value}:{value?:string|null})=>{const v=String(value||'—');const cls=v==='conferido'||v==='enviado'?'border-emerald-500/25 bg-emerald-500/10 text-emerald-300':v.includes('erro')||v==='pendencia'?'border-rose-500/25 bg-rose-500/10 text-rose-300':v==='retificacao'?'border-violet-500/25 bg-violet-500/10 text-violet-300':'border-amber-500/25 bg-amber-500/10 text-amber-300';return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${cls}`}>{statusLabel(v)}</span>};

export default CentralContabilidadePage;
