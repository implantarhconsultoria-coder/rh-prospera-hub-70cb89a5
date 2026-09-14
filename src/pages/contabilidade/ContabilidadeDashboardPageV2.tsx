import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, BadgeCheck, BellRing, BriefcaseBusiness, Building2,
  CalendarDays, CheckCircle2, ChevronRight, Clock3, FileHeart, FileText,
  FileUp, History, Loader2, LogOut, RefreshCw, Search, Send, UserPlus,
  UserRoundX, WalletCards, Banknote,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type PortalKind = 'principal' | 'goiania';
type Evento = {
  origem_tipo: string;
  origem_id: string;
  empresa_id: string;
  empresa_nome: string;
  funcionario_id?: string | null;
  funcionario_nome: string;
  categoria: string;
  titulo: string;
  data_evento?: string;
  created_at: string;
  source_updated_at?: string;
  prioridade: string;
  documento_url?: string | null;
  documento_nome?: string | null;
  detalhes?: Record<string, any>;
  formalizado?: boolean;
  formalizado_em?: string | null;
  status: string;
  observacao?: string | null;
  revisor_nome?: string | null;
  revisado_em?: string | null;
};
type Empresa = { id: string; nome: string; codigo: string; cnpj?: string };
type Sessao = { token: string; expira_em?: string; usuario?: { id: string; nome: string; email?: string; portal?: string } };

type CategoryMeta = { label: string; short: string; icon: any; iconClass: string; note: string; emphasis?: boolean };

const storageKey = (portal: PortalKind) => `topac_contabilidade_${portal}_session`;
const accessPath = (portal: PortalKind) => portal === 'goiania' ? '/acesso-contabilidade-goiania' : '/acesso-contabilidade';

const brDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
};
const brDate = (value?: string | null) => {
  if (!value) return '—';
  if (/^\d{4}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR').format(d);
};
const money = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
};
const labelStatus = (e: Evento) => {
  if (e.origem_tipo === 'ferias_alerta') return e.titulo.replace('FÉRIAS ', '');
  if (e.categoria === 'adiantamento') return 'Informação mensal';
  return ({ aguardando_analise: 'Aguardando análise', conferido: 'Conferido', pendencia: 'Com pendência', retificacao: 'Retificação' } as Record<string,string>)[e.status] || e.status;
};
const statusClass = (e: Evento) => {
  if (e.origem_tipo === 'ferias_alerta') {
    if (e.titulo.includes('VENCIDAS')) return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    if (e.titulo.includes('CRÍTICAS')) return 'border-amber-400/30 bg-amber-400/10 text-amber-300';
    return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300';
  }
  if (e.categoria === 'adiantamento') return 'border-sky-400/20 bg-sky-400/5 text-sky-300';
  return ({
    aguardando_analise: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    conferido: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    pendencia: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
    retificacao: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  } as Record<string,string>)[e.status] || 'border-zinc-700 bg-zinc-800/50 text-zinc-300';
};

const categoryMeta: Record<string, CategoryMeta> = {
  admissao: { label: 'Novas contratações', short: 'Contratações', icon: UserPlus, iconClass: 'text-[#f4b400] bg-[#21180a] border-[#5a4411]', note: 'Concluídas no mês e próximas entradas', emphasis: true },
  demissao: { label: 'Demissões / Rescisões', short: 'Demissões', icon: UserRoundX, iconClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20', note: 'Desligamentos do mês' },
  ferias: { label: 'Férias', short: 'Férias', icon: CalendarDays, iconClass: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', note: 'Vencidas, críticas e próximas em até 4 meses' },
  atestado: { label: 'Atestados / Afastamentos', short: 'Atestados', icon: FileHeart, iconClass: 'text-amber-300 bg-amber-500/10 border-amber-500/20', note: 'Documentos recebidos neste mês' },
  adiantamento: { label: 'Adiantamentos', short: 'Adiantamentos', icon: Banknote, iconClass: 'text-sky-400 bg-sky-500/10 border-sky-500/20', note: 'Lançamentos da competência atual' },
  alteracao_salario: { label: 'Alterações salariais', short: 'Salários', icon: WalletCards, iconClass: 'text-[#b85cff] bg-[#1b1028] border-[#4d2469]', note: 'Análise individual obrigatória', emphasis: true },
  alteracao_funcao: { label: 'Alterações de função', short: 'Funções', icon: BriefcaseBusiness, iconClass: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20', note: 'Análise individual obrigatória', emphasis: true },
  fechamento: { label: 'Fechamentos', short: 'Fechamentos', icon: FileText, iconClass: 'text-[#9b32ff] bg-[#180d24] border-[#43205c]', note: 'Conferência e retorno ao RH' },
};

const needsReview = (e: Evento) => !['adiantamento', 'ferias_alerta'].includes(e.origem_tipo) && e.categoria !== 'adiantamento' && ['aguardando_analise','retificacao','pendencia'].includes(e.status);
const isInformational = (e: Evento) => e.categoria === 'adiantamento' || e.origem_tipo === 'ferias_alerta';

function readSession(portal: PortalKind): Sessao | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(portal)) || 'null');
    if (!parsed?.token) return null;
    if (parsed.expira_em && Date.parse(parsed.expira_em) <= Date.now()) return null;
    return parsed;
  } catch { return null; }
}

const defaultUploadType = (categoria: string) => ({ fechamento: 'folha_processada', admissao: 'contrato', demissao: 'rescisao', ferias: 'ferias' } as Record<string,string>)[categoria] || 'outro';
const uploadOptionsFor = (categoria: string): Array<[string,string]> => {
  if (categoria === 'fechamento') return [['folha_processada','Folha processada'],['recibos_holerites','Recibos / Holerites'],['retorno_folha','Outro retorno da folha']];
  if (categoria === 'admissao') return [['contrato','Contrato de trabalho'],['outro','Outro documento da admissão']];
  if (categoria === 'demissao') return [['rescisao','Documentos de rescisão'],['outro','Outro documento da demissão']];
  if (categoria === 'ferias') return [['ferias','Documentos de férias'],['outro','Outro documento das férias']];
  return [['outro','Documento de retorno']];
};

export default function ContabilidadeDashboardPageV2({ portal }: { portal: PortalKind }) {
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<Sessao | null>(() => readSession(portal));
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [historico, setHistorico] = useState<Evento[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [competenciaAtual, setCompetenciaAtual] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [viewKey, setViewKey] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<Evento | null>(null);
  const [empresaFiltro, setEmpresaFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [pendenciaTexto, setPendenciaTexto] = useState('');
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyMonth, setHistoryMonth] = useState('');
  const [historyCompany, setHistoryCompany] = useState('todas');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState('outro');
  const [uploadObs, setUploadObs] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const isGoiania = portal === 'goiania';

  const sair = useCallback(async () => {
    const s = readSession(portal);
    if (s?.token) await supabase.rpc('contabilidade_portal_logout' as any, { p_token: s.token, p_portal: portal }).catch(() => null);
    localStorage.removeItem(storageKey(portal));
    navigate(accessPath(portal), { replace: true });
  }, [navigate, portal]);

  const carregar = useCallback(async (silent = false) => {
    const current = readSession(portal);
    if (!current?.token) return navigate(accessPath(portal), { replace: true });
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase.rpc('contabilidade_portal_dashboard_sessao' as any, { p_token: current.token, p_portal: portal });
      const res = data as any;
      if (error || !res?.ok) {
        localStorage.removeItem(storageKey(portal));
        return navigate(accessPath(portal), { replace: true });
      }
      setSessao({ ...current, usuario: res.usuario || current.usuario });
      setEventos(Array.isArray(res.eventos) ? res.eventos : []);
      setHistorico(Array.isArray(res.historico) ? res.historico : []);
      setEmpresas(Array.isArray(res.empresas) ? res.empresas : []);
      setCompetenciaAtual(String(res.competencia_atual || ''));
    } catch (err: any) { toast.error(err?.message || 'Não foi possível atualizar o dashboard.'); }
    finally { setLoading(false); }
  }, [navigate, portal]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { const timer = window.setInterval(() => void carregar(true), 60_000); return () => clearInterval(timer); }, [carregar]);

  const abrirLista = (key: string) => { setViewKey(key); setSelecionado(null); setEmpresaFiltro('todas'); setBusca(''); setUploadOpen(false); setShowIssueForm(false); };
  const abrirMovimento = (e: Evento) => { setSelecionado(e); setPendenciaTexto(e.observacao || ''); setShowIssueForm(false); setUploadOpen(false); setUploadType(defaultUploadType(e.categoria)); setUploadObs(''); setUploadFile(null); };
  const fecharModal = () => { setViewKey(null); setSelecionado(null); setEmpresaFiltro('todas'); setBusca(''); setPendenciaTexto(''); setShowIssueForm(false); setUploadOpen(false); setUploadFile(null); };

  const marcar = async (evento: Evento, status: 'conferido' | 'pendencia', observacao?: string) => {
    if (isInformational(evento)) return;
    const current = readSession(portal);
    if (!current?.token) return sair();
    if (status === 'pendencia' && !String(observacao || '').trim()) return toast.error('Informe o que precisa ser corrigido.');
    setUpdating(true);
    try {
      const { data, error } = await supabase.rpc('contabilidade_portal_revisar_sessao' as any, {
        p_token: current.token, p_portal: portal, p_origem_tipo: evento.origem_tipo, p_origem_id: evento.origem_id,
        p_status: status, p_observacao: observacao || null,
      });
      const res = data as any;
      if (error || !res?.ok) throw new Error('Não foi possível registrar a conferência.');
      const next = { ...evento, status, observacao: status === 'pendencia' ? (observacao || null) : null, revisor_nome: res.revisor_nome || sessao?.usuario?.nome, revisado_em: res.revisado_em || new Date().toISOString() } as Evento;
      setSelecionado(next);
      setEventos(prev => prev.map(x => x.origem_tipo === evento.origem_tipo && x.origem_id === evento.origem_id ? next : x));
      toast.success(status === 'conferido' ? 'Conferência registrada.' : 'Pendência registrada para o RH.');
      setShowIssueForm(false);
      await carregar(true);
    } catch (err: any) { toast.error(err?.message || 'Erro ao salvar.'); }
    finally { setUpdating(false); }
  };

  const pendentes = useMemo(() => eventos.filter(needsReview), [eventos]);
  const hoje = useMemo(() => {
    const ymd = new Date().toISOString().slice(0,10);
    return eventos.filter(e => String(e.created_at || '').slice(0,10) === ymd).length;
  }, [eventos]);
  const conferidos = useMemo(() => eventos.filter(e => !isInformational(e) && e.status === 'conferido').length, [eventos]);
  const retificacoes = useMemo(() => eventos.filter(e => !isInformational(e) && e.status === 'retificacao').length, [eventos]);
  const adiantamentoTotal = useMemo(() => eventos.filter(e => e.categoria === 'adiantamento').reduce((s,e) => s + Number(e.detalhes?.valor || 0), 0), [eventos]);

  const categoryStats = useMemo(() => {
    const r: Record<string,{total:number,pending:number}> = {};
    Object.keys(categoryMeta).forEach(k => r[k] = { total:0, pending:0 });
    eventos.forEach(e => {
      if (!r[e.categoria]) r[e.categoria] = { total:0, pending:0 };
      r[e.categoria].total += 1;
      if (needsReview(e)) r[e.categoria].pending += 1;
    });
    return r;
  }, [eventos]);

  const listaBase = useMemo(() => {
    let list = eventos;
    if (viewKey?.startsWith('category:')) list = list.filter(e => e.categoria === viewKey.slice(9));
    else if (viewKey === 'pending') list = list.filter(needsReview);
    else if (viewKey === 'conferred') list = list.filter(e => !isInformational(e) && e.status === 'conferido');
    else if (viewKey === 'retifications') list = list.filter(e => !isInformational(e) && e.status === 'retificacao');
    else if (viewKey === 'today') { const ymd = new Date().toISOString().slice(0,10); list = list.filter(e => String(e.created_at || '').slice(0,10) === ymd); }
    return [...list].sort((a,b) => Date.parse(b.created_at || '0') - Date.parse(a.created_at || '0'));
  }, [eventos, viewKey]);

  const listaFiltrada = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return listaBase.filter(e => (empresaFiltro === 'todas' || e.empresa_id === empresaFiltro) && (!term || `${e.funcionario_nome} ${e.empresa_nome} ${e.titulo} ${e.data_evento || ''}`.toLowerCase().includes(term)));
  }, [listaBase, empresaFiltro, busca]);

  const historicoFiltrado = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    return historico.filter(e => {
      if (historyCompany !== 'todas' && e.empresa_id !== historyCompany) return false;
      if (historyMonth) {
        const ref = String(e.data_evento || e.created_at || '').slice(0,7);
        if (ref !== historyMonth) return false;
      }
      if (term && !`${e.funcionario_nome} ${e.empresa_nome} ${e.titulo} ${e.categoria} ${e.data_evento || ''}`.toLowerCase().includes(term)) return false;
      return true;
    }).sort((a,b) => Date.parse(b.created_at || '0') - Date.parse(a.created_at || '0'));
  }, [historico, historyCompany, historyMonth, historySearch]);

  const modalTitle = useMemo(() => {
    if (viewKey?.startsWith('category:')) return categoryMeta[viewKey.slice(9)]?.label || 'Movimentações';
    return ({ pending:'Aguardando análise', today:'Movimentações de hoje', conferred:'Conferidos', retifications:'Retificações' } as Record<string,string>)[String(viewKey)] || 'Movimentações';
  }, [viewKey]);

  const detailRows = (e: Evento) => {
    const d = e.detalhes || {};
    if (e.origem_tipo === 'ferias_alerta') return [
      ['Situação', e.titulo.replace('FÉRIAS ','')], ['Data limite', brDate(d.data_limite)], ['Dias para o limite', d.dias_para_limite ?? '—'],
      ['Período aquisitivo', `${brDate(d.periodo_aquisitivo_inicio)} até ${brDate(d.periodo_aquisitivo_fim)}`], ['Dias de direito', d.dias_direito ?? '—'], ['Início previsto', brDate(d.inicio_previsto)],
    ];
    if (e.categoria === 'adiantamento') return [['Competência', brDate(d.competencia)], ['Valor', money(d.valor)], ['Status interno', d.status_conferencia || '—'], ['Atualizado em', brDateTime(d.atualizado_em)]];
    if (e.categoria === 'atestado') return [['Documento', d.tipo_documento || 'Atestado'], ['Data do documento', brDateTime(d.data_documento)], ['Recebido pelo RH', brDateTime(d.recebido_em)], ['Registrado por', d.registrado_por || '—'], ['Descrição', d.descricao || '—']];
    if (e.categoria === 'admissao') return [['CPF', d.cpf || '—'], ['Admissão', brDate(d.admissao)], ['Situação', d.situacao === 'entrada_prevista' ? 'Entrada prevista' : 'Concluída'], ['Função', d.funcao || '—'], ['Salário', d.salario != null ? money(d.salario) : '—'], ['Jornada', d.jornada || '—']];
    if (e.categoria === 'demissao') return [['CPF', d.cpf || '—'], ['Desligamento', brDate(d.desligamento)], ['Tipo', d.tipo || '—'], ['Motivo', d.motivo || '—'], ['Aviso prévio', d.aviso_previo || '—'], ['Função', d.cargo || '—']];
    if (e.categoria === 'ferias') return [['Período', `${brDate(d.inicio)} até ${brDate(d.fim)}`], ['Retorno', brDate(d.retorno)], ['Dias', d.dias ?? '—'], ['Abono', d.abono ?? 0], ['Função', d.cargo || '—'], ['Registrado por', d.registrado_por || '—']];
    if (e.categoria === 'alteracao_salario') return [['Salário anterior', money(d.salario_anterior)], ['Novo salário', money(d.salario_novo)], ['Função', d.cargo || '—'], ['Alterado em', brDateTime(d.data_registro)]];
    if (e.categoria === 'alteracao_funcao') return [['Função anterior', d.funcao_anterior || '—'], ['Nova função', d.funcao_nova || '—'], ['Salário atual', money(d.salario_atual)], ['Alterado em', brDateTime(d.data_registro)]];
    if (e.categoria === 'fechamento') return [['Competência', d.competencia || e.data_evento || '—'], ['Funcionários', d.total_funcionarios ?? '—'], ['Proventos', money(d.total_proventos)], ['Descontos', money(d.total_descontos)], ['Líquido', money(d.total_liquido)], ['Fechado por', d.fechado_por || '—']];
    return Object.entries(d).slice(0,8).map(([k,v]) => [k.replaceAll('_',' '), typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')]);
  };

  const documentUrl = (e: Evento) => {
    const raw = String(e.documento_url || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const bucket = String(e.detalhes?.storage_bucket || '').trim();
    const path = String(e.detalhes?.storage_path || raw).trim();
    if (bucket && path) return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    return raw;
  };

  const competenciaSelecionada = () => {
    if (!selecionado) return '';
    const direct = String(selecionado.detalhes?.competencia || '').trim();
    if (direct) return direct;
    const raw = String(selecionado.data_evento || '');
    return /^\d{4}-\d{2}/.test(raw) ? raw.slice(0,7) : '';
  };

  const enviarRetorno = async () => {
    const current = readSession(portal);
    if (!current?.token || !selecionado) return toast.error('Sua sessão expirou. Entre novamente.');
    if (selecionado.status !== 'conferido') return toast.error('Conclua a conferência antes de enviar o retorno ao RH.');
    if (!uploadFile) return toast.error('Selecione o PDF que deseja enviar.');
    if (!/\.pdf$/i.test(uploadFile.name) && uploadFile.type !== 'application/pdf') return toast.error('Envie somente arquivo PDF.');
    if (uploadFile.size > 50 * 1024 * 1024) return toast.error('O PDF pode ter no máximo 50 MB.');
    setUploadBusy(true);
    try {
      const prepRes = await fetch('/api/accounting-portal-upload', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'prepare', portal, token:current.token, empresa_id:selecionado.empresa_id, arquivo_nome:uploadFile.name, tamanho_bytes:uploadFile.size }) });
      const prep = await prepRes.json();
      if (!prepRes.ok || !prep?.ok) throw new Error(prep?.error || 'Não foi possível preparar o envio.');
      const uploaded = await supabase.storage.from(prep.bucket).uploadToSignedUrl(prep.path, prep.upload_token, uploadFile, { contentType:'application/pdf' });
      if (uploaded.error) throw uploaded.error;
      const context = `Retorno referente a ${selecionado.titulo} · ${selecionado.funcionario_nome || selecionado.empresa_nome}`;
      const finalRes = await fetch('/api/accounting-portal-upload', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'finalize', portal, token:current.token, empresa_id:selecionado.empresa_id, storage_path:prep.path, arquivo_nome:uploadFile.name, tamanho_bytes:uploadFile.size, tipo_documento:uploadType, competencia:competenciaSelecionada() || null, funcionario_nome:selecionado.funcionario_nome || null, observacao:[context,uploadObs].filter(Boolean).join(' — '), origem_tipo:selecionado.origem_tipo, origem_id:selecionado.origem_id }) });
      const finalData = await finalRes.json();
      if (!finalRes.ok || !finalData?.ok) throw new Error(finalData?.error || 'O arquivo subiu, mas o registro não foi concluído.');
      toast.success(finalData.email_status === 'enviado' ? 'Documento recebido pelo RH e formalizado por e-mail.' : 'Documento recebido pelo RH e registrado na plataforma.');
      setUploadOpen(false); setUploadFile(null); setUploadObs('');
    } catch (err:any) { toast.error(err?.message || 'Erro ao enviar o documento.'); }
    finally { setUploadBusy(false); }
  };

  if (loading) return <div className="min-h-screen bg-[#020609] flex items-center justify-center text-zinc-300"><Loader2 className="w-8 h-8 animate-spin text-[#9b32ff]" /></div>;

  return (
    <div className="min-h-screen bg-[#020609] text-zinc-100">
      <header className="sticky top-0 z-30 h-[62px] border-b border-[#24202c] bg-[#030609]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-[1680px] items-center gap-3 px-4 sm:px-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border border-[#7c2cff] bg-[#08070a] text-[25px] font-black text-[#f4b400]">T</div>
          <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-black text-white">TOPAC RH PRO</div><div className="truncate text-[10px] font-semibold text-[#9b32ff]">Portal da Contabilidade {isGoiania ? '· Goiânia' : ''}</div></div>
          <div className="hidden text-right md:block"><div className="text-[11px] font-semibold text-zinc-200">{sessao?.usuario?.nome || 'Contabilidade'}</div><div className="mt-0.5 text-[9px] text-zinc-500">{isGoiania ? 'TOPAC Goiânia' : 'Matriz · Praia · LMT · ALQUI'}</div></div>
          <button onClick={() => setHistoryOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#2b2532] bg-[#080a0e] px-3 text-[10px] font-semibold text-zinc-300 hover:border-[#7c2cff] hover:text-white"><History className="h-4 w-4"/>Histórico</button>
          <button onClick={() => void carregar()} className="grid h-9 w-9 place-items-center rounded-md border border-[#2b2532] bg-[#080a0e] text-zinc-400 hover:border-[#7c2cff] hover:text-[#b85cff]" title="Atualizar"><RefreshCw className="h-4 w-4"/></button>
          <button onClick={sair} className="grid h-9 w-9 place-items-center rounded-md border border-[#2b2532] bg-[#080a0e] text-zinc-400 hover:border-rose-500/50 hover:text-rose-300" title="Sair"><LogOut className="h-4 w-4"/></button>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] p-4 sm:p-[18px]">
        <section className="rounded-[10px] border border-[#2b2532] bg-[linear-gradient(110deg,#080a0f_0%,#0d0815_58%,#080a0f_100%)] px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#a855f7]">Visão operacional · {competenciaAtual ? brDate(competenciaAtual) : 'mês atual'}</div><h1 className="mt-1 text-[25px] font-black text-white sm:text-[30px]">Portal da Contabilidade</h1><p className="mt-1 max-w-2xl text-[12px] text-zinc-400">A tela mostra só o mês atual e alertas futuros relevantes. Virou o mês, o concluído sai da operação e permanece apenas no histórico.</p></div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500"><Clock3 className="h-3.5 w-3.5"/>Atualização automática a cada 1 minuto</div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard icon={BellRing} label="Aguardando análise" value={pendentes.length} note="Somente o que realmente exige ação" accent="text-[#f4b400]" onClick={() => abrirLista('pending')}/>
          <SummaryCard icon={Clock3} label="Movimentações hoje" value={hoje} note="Entradas registradas hoje" accent="text-sky-400" onClick={() => abrirLista('today')}/>
          <SummaryCard icon={CheckCircle2} label="Conferidos" value={conferidos} note="Concluídos neste mês" accent="text-emerald-400" onClick={() => abrirLista('conferred')}/>
          <SummaryCard icon={AlertTriangle} label="Retificações" value={retificacoes} note="Alterações depois de uma conferência" accent="text-[#b85cff]" onClick={() => abrirLista('retifications')}/>
        </section>

        <section className="mt-4 rounded-[10px] border border-[#24202c] bg-[#04070b] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-[14px] font-black text-white">Movimentações do RH</h2><p className="mt-1 text-[10px] text-zinc-500">Tudo em card. Os detalhes só aparecem quando abrir.</p></div><div className="hidden items-center gap-2 text-[10px] text-zinc-500 sm:flex"><Building2 className="h-3.5 w-3.5 text-[#9b32ff]"/>{isGoiania ? '1 empresa liberada' : '4 empresas liberadas'}</div></div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {Object.entries(categoryMeta).map(([key,meta]) => {
              const Icon = meta.icon; const stats = categoryStats[key] || { total:0, pending:0 };
              const dynamicNote = key === 'adiantamento' && stats.total > 0 ? `${stats.total} lançamentos · ${money(adiantamentoTotal)}` : meta.note;
              return <button key={key} type="button" onClick={() => abrirLista(`category:${key}`)} className={`group min-h-[150px] rounded-[8px] border bg-[#06090d] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#6c2aa0] hover:bg-[#090b11] ${meta.emphasis && stats.pending > 0 ? 'border-[#6d5314]' : 'border-[#28232e]'}`}>
                <div className="flex items-start justify-between gap-2"><div className={`grid h-9 w-9 place-items-center rounded-[7px] border ${meta.iconClass}`}><Icon className="h-[18px] w-[18px]"/></div>{stats.pending > 0 ? <span className="rounded-full border border-[#f4b400]/25 bg-[#f4b400]/10 px-2 py-0.5 text-[9px] font-bold text-[#f4b400]">{stats.pending}</span> : <span className="rounded-full border border-emerald-400/15 bg-emerald-400/5 px-2 py-0.5 text-[9px] font-semibold text-emerald-400/80">OK</span>}</div>
                <div className="mt-4 text-[28px] font-black leading-none text-white">{stats.total}</div><div className="mt-2 text-[11px] font-bold text-zinc-200">{meta.short}</div><div className={`mt-1.5 text-[9px] leading-snug ${meta.emphasis ? 'text-[#c79b2f]' : 'text-zinc-600'}`}>{dynamicNote}</div>
              </button>;
            })}
          </div>
        </section>
      </main>

      <Dialog open={!!viewKey} onOpenChange={open => { if (!open) fecharModal(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[#3a2849] bg-[#05080d] text-zinc-100 sm:max-w-4xl">
          <DialogHeader><DialogTitle className="pr-8 text-white">{selecionado ? selecionado.titulo : modalTitle}</DialogTitle></DialogHeader>
          {!selecionado ? <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row"><select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)} className="h-10 rounded-md border border-[#302739] bg-[#090c11] px-3 text-sm text-zinc-200 sm:min-w-[210px]"><option value="todas">Todas as empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600"/><Input className="border-[#302739] bg-[#090c11] pl-9 text-zinc-100" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar funcionário..."/></div></div>
            {listaFiltrada.length === 0 ? <div className="rounded-lg border border-[#28232e] bg-[#070a0e] py-14 text-center text-sm text-zinc-500">Nenhum item neste card.</div> : <div className="grid gap-2">{listaFiltrada.map(e => { const meta = categoryMeta[e.categoria] || categoryMeta.fechamento; const Icon=meta.icon; return <button key={`${e.origem_tipo}-${e.origem_id}`} onClick={() => abrirMovimento(e)} className="flex w-full items-center gap-3 rounded-[8px] border border-[#28232e] bg-[#070a0e] p-3.5 text-left hover:border-[#63308a] hover:bg-[#0a0d12]"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border ${meta.iconClass}`}><Icon className="h-[18px] w-[18px]"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-[12px] font-bold text-zinc-100">{e.funcionario_nome || e.empresa_nome}</span>{e.categoria === 'admissao' && e.detalhes?.situacao === 'entrada_prevista' && <span className="rounded-full border border-[#f4b400]/20 bg-[#f4b400]/10 px-2 py-0.5 text-[8px] font-bold uppercase text-[#f4b400]">Entrada prevista</span>}</div><div className="mt-1 truncate text-[10px] text-zinc-500">{e.empresa_nome} · {e.data_evento ? brDate(e.data_evento) : brDateTime(e.created_at)}</div></div><span className={`hidden rounded-full border px-2.5 py-1 text-[9px] font-semibold sm:inline ${statusClass(e)}`}>{labelStatus(e)}</span><ChevronRight className="h-4 w-4 shrink-0 text-zinc-600"/></button>; })}</div>}
          </div> : <div className="space-y-4">
            <button onClick={() => { setSelecionado(null); setUploadOpen(false); setShowIssueForm(false); }} className="inline-flex items-center gap-2 text-[11px] font-semibold text-zinc-400 hover:text-white"><ArrowLeft className="h-4 w-4"/>Voltar</button>
            <div className="rounded-[9px] border border-[#302739] bg-[#080b10] p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="text-[18px] font-black text-white">{selecionado.funcionario_nome || selecionado.empresa_nome}</div><div className="mt-1 text-[11px] text-zinc-500">{selecionado.empresa_nome} · registrado em {brDateTime(selecionado.created_at)}</div></div><span className={`w-fit rounded-full border px-2.5 py-1 text-[9px] font-semibold ${statusClass(selecionado)}`}>{labelStatus(selecionado)}</span></div></div>
            {selecionado.status === 'retificacao' && <div className="flex gap-2 rounded-[8px] border border-violet-500/25 bg-violet-500/10 p-3 text-[11px] text-violet-200"><AlertTriangle className="h-4 w-4 shrink-0"/><div><strong>Informação alterada após a última conferência.</strong><div className="mt-1 text-violet-300/70">Analise novamente antes de dar novo OK.</div></div></div>}
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">{detailRows(selecionado).map(([label,value],idx) => <div key={`${label}-${idx}`} className="border-b border-[#29242e] pb-2.5"><div className="text-[9px] font-bold uppercase tracking-[.09em] text-zinc-600">{label}</div><div className="mt-1 break-words text-[12px] font-semibold text-zinc-200">{String(value)}</div></div>)}</div>
            {(selecionado.documento_url || selecionado.detalhes?.aso_url) && <div className="rounded-[8px] border border-[#302739] bg-[#080b10] p-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Documentos</div><div className="flex flex-wrap gap-2">{selecionado.documento_url && <Button variant="outline" className="border-[#49335c] bg-[#0b0d12] text-zinc-200" onClick={() => window.open(documentUrl(selecionado),'_blank','noopener,noreferrer')}><FileText className="mr-2 h-4 w-4"/>{selecionado.documento_nome || 'Visualizar documento'}</Button>}{selecionado.detalhes?.aso_url && <Button variant="outline" className="border-[#49335c] bg-[#0b0d12] text-zinc-200" onClick={() => window.open(String(selecionado.detalhes?.aso_url),'_blank','noopener,noreferrer')}><FileText className="mr-2 h-4 w-4"/>Visualizar ASO</Button>}</div></div>}
            {!isInformational(selecionado) && <div className="grid gap-3 rounded-[8px] border border-[#2b2532] bg-[#070a0e] p-3 text-[11px] sm:grid-cols-3"><div><div className="text-zinc-600">Última atualização</div><div className="mt-1 font-semibold text-zinc-300">{brDateTime(selecionado.source_updated_at)}</div></div><div><div className="text-zinc-600">Última conferência</div><div className="mt-1 font-semibold text-zinc-300">{selecionado.revisor_nome ? `${selecionado.revisor_nome} · ${brDateTime(selecionado.revisado_em)}` : 'Ainda não conferido'}</div></div><div><div className="text-zinc-600">Formalização</div><div className="mt-1 font-semibold text-zinc-300">{selecionado.formalizado ? `Sim · ${brDateTime(selecionado.formalizado_em)}` : 'Ainda não formalizado'}</div></div></div>}
            {isInformational(selecionado) ? <div className="rounded-[8px] border border-sky-500/20 bg-sky-500/5 p-3 text-[11px] text-sky-200"><strong>Informação de acompanhamento.</strong><div className="mt-1 text-sky-300/70">Este item fica visível enquanto estiver dentro da regra operacional e não exige OK.</div></div> : selecionado.status !== 'conferido' ? <div className="border-t border-[#2b2532] pt-4">{showIssueForm && <textarea value={pendenciaTexto} onChange={e => setPendenciaTexto(e.target.value)} className="mb-3 min-h-[86px] w-full rounded-md border border-[#3a2b45] bg-[#090c11] px-3 py-2 text-sm text-zinc-100" placeholder="Descreva a correção necessária..."/>}<div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">{showIssueForm ? <Button variant="outline" disabled={updating} className="border-rose-500/30 text-rose-300" onClick={() => void marcar(selecionado,'pendencia',pendenciaTexto)}><AlertTriangle className="mr-2 h-4 w-4"/>Registrar pendência</Button> : <Button variant="outline" disabled={updating} className="border-[#49335c] text-zinc-300" onClick={() => setShowIssueForm(true)}><AlertTriangle className="mr-2 h-4 w-4"/>Apontar pendência</Button>}<Button disabled={updating} onClick={() => void marcar(selecionado,'conferido')} className="bg-emerald-600 text-white hover:bg-emerald-500">{updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle2 className="mr-2 h-4 w-4"/>}Conferido / OK</Button></div></div> : <div className="space-y-3 border-t border-[#2b2532] pt-4"><div className="flex gap-2 rounded-[8px] border border-emerald-500/20 bg-emerald-500/8 p-3 text-[11px] text-emerald-200"><BadgeCheck className="h-4 w-4 shrink-0"/><div><strong>Conferência concluída.</strong><div className="mt-0.5 text-emerald-300/70">Se houver retorno documental, envie por este movimento.</div></div></div><div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="outline" className="border-[#49335c] text-zinc-300" onClick={() => setShowIssueForm(true)}>Apontar correção</Button><Button className="bg-[#6d28d9] text-white hover:bg-[#7c3aed]" onClick={() => setUploadOpen(v => !v)}><FileUp className="mr-2 h-4 w-4"/>Enviar documento ao RH</Button></div>{showIssueForm && <div className="rounded-[8px] border border-rose-500/20 bg-rose-500/5 p-3"><textarea value={pendenciaTexto} onChange={e => setPendenciaTexto(e.target.value)} className="min-h-[80px] w-full rounded-md border border-[#3a2b45] bg-[#090c11] px-3 py-2 text-sm text-zinc-100" placeholder="Descreva a correção..."/><div className="mt-2 flex justify-end"><Button disabled={updating} variant="outline" className="border-rose-500/30 text-rose-300" onClick={() => void marcar(selecionado,'pendencia',pendenciaTexto)}><AlertTriangle className="mr-2 h-4 w-4"/>Registrar correção</Button></div></div>}{uploadOpen && <div className="rounded-[9px] border border-[#4c2b64] bg-[#0a0b11] p-4"><div className="mb-3"><div className="text-[12px] font-bold text-white">Retorno para o RH</div><div className="mt-1 text-[10px] text-zinc-500">O PDF entra na plataforma e a formalização por e-mail ocorre pelo fluxo já configurado.</div></div><div className="grid gap-3 sm:grid-cols-2"><div><label className="text-[10px] font-semibold text-zinc-400">Tipo</label><select value={uploadType} onChange={e => setUploadType(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#34283e] bg-[#080b10] px-3 text-sm text-zinc-200">{uploadOptionsFor(selecionado.categoria).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div><div><label className="text-[10px] font-semibold text-zinc-400">Competência</label><div className="mt-1 flex h-10 items-center rounded-md border border-[#34283e] bg-[#080b10] px-3 text-sm text-zinc-300">{competenciaSelecionada() || 'Conforme movimento'}</div></div><div className="sm:col-span-2"><input type="file" accept="application/pdf,.pdf" onChange={e => setUploadFile(e.target.files?.[0] || null)} className="block w-full rounded-md border border-[#34283e] bg-[#080b10] p-2 text-xs text-zinc-400"/></div><div className="sm:col-span-2"><textarea value={uploadObs} onChange={e => setUploadObs(e.target.value)} className="min-h-[70px] w-full rounded-md border border-[#34283e] bg-[#080b10] px-3 py-2 text-sm text-zinc-100" placeholder="Observação opcional"/></div></div><div className="mt-3 flex justify-end gap-2"><Button variant="outline" disabled={uploadBusy} onClick={() => { setUploadOpen(false); setUploadFile(null); }}>Cancelar</Button><Button disabled={uploadBusy || !uploadFile} className="bg-[#6d28d9] text-white" onClick={() => void enviarRetorno()}>{uploadBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}Enviar para o RH</Button></div></div>}</div>}
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[#3a2849] bg-[#05080d] text-zinc-100 sm:max-w-5xl">
          <DialogHeader><DialogTitle className="text-white">Histórico da Contabilidade</DialogTitle></DialogHeader>
          <div className="grid gap-2 sm:grid-cols-[1.3fr_.8fr_.8fr]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600"/><Input value={historySearch} onChange={e => setHistorySearch(e.target.value)} className="border-[#302739] bg-[#090c11] pl-9 text-zinc-100" placeholder="Nome, empresa ou tipo..."/></div><input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)} className="h-10 rounded-md border border-[#302739] bg-[#090c11] px-3 text-sm text-zinc-200"/><select value={historyCompany} onChange={e => setHistoryCompany(e.target.value)} className="h-10 rounded-md border border-[#302739] bg-[#090c11] px-3 text-sm text-zinc-200"><option value="todas">Todas as empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
          <div className="mt-4 text-[10px] text-zinc-500">{historicoFiltrado.length} registro(s) encontrado(s)</div>
          <div className="mt-3 grid gap-2">{historicoFiltrado.slice(0,300).map(e => { const meta = categoryMeta[e.categoria] || categoryMeta.fechamento; const Icon=meta.icon; return <div key={`hist-${e.origem_tipo}-${e.origem_id}`} className="flex items-center gap-3 rounded-[8px] border border-[#28232e] bg-[#070a0e] p-3.5"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border ${meta.iconClass}`}><Icon className="h-[18px] w-[18px]"/></div><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-bold text-zinc-100">{e.funcionario_nome || e.empresa_nome}</div><div className="mt-1 truncate text-[10px] text-zinc-500">{e.empresa_nome} · {e.titulo} · {e.data_evento ? brDate(e.data_evento) : brDateTime(e.created_at)}</div></div><span className={`hidden rounded-full border px-2.5 py-1 text-[9px] font-semibold sm:inline ${statusClass(e)}`}>{labelStatus(e)}</span>{e.documento_url && <button onClick={() => window.open(documentUrl(e),'_blank','noopener,noreferrer')} className="rounded-md border border-[#3b2d48] px-2.5 py-1.5 text-[9px] font-semibold text-zinc-300 hover:text-white">Documento</button>}</div>; })}{historicoFiltrado.length === 0 && <div className="rounded-lg border border-[#28232e] bg-[#070a0e] py-14 text-center text-sm text-zinc-500">Nenhum registro encontrado.</div>}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ icon:Icon, label, value, note, accent, onClick }: { icon:any; label:string; value:number; note:string; accent:string; onClick:()=>void }) {
  return <button type="button" onClick={onClick} className="group min-h-[112px] rounded-[8px] border border-[#28232e] bg-[#05080d] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#62308a] hover:bg-[#080a10] sm:p-5"><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-semibold uppercase tracking-[.05em] text-zinc-500">{label}</div><div className="mt-2 text-[30px] font-black leading-none text-white">{value}</div></div><Icon className={`h-[18px] w-[18px] ${accent}`}/></div><div className="mt-3 text-[9px] text-zinc-600">{note}</div></button>;
}
