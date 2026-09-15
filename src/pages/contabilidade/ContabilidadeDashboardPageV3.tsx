import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Banknote, BellRing, Building2, CalendarDays, CheckCircle2,
  ChevronRight, Clock3, FileHeart, FileText, History, Loader2, LogOut,
  RefreshCw, Users, UserPlus, UserRoundX, WalletCards, BriefcaseBusiness,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
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
type Empresa = {
  id: string;
  nome: string;
  codigo: string;
  cnpj?: string;
  funcionarios_ativos?: number;
};
type Sessao = {
  token: string;
  expira_em?: string;
  usuario?: { id: string; nome: string; email?: string; portal?: string };
};
type ViewKey =
  | 'pending'
  | 'alerts'
  | 'ferias'
  | 'atestados'
  | 'adiantamentos'
  | 'fechamento'
  | 'history'
  | `notification:${string}`
  | `company:${string}`
  | `ferias-status:${string}`
  | `atestados-status:${string}`;

const storageKey = (portal: PortalKind) => `topac_contabilidade_${portal}_session`;
const accessPath = (portal: PortalKind) => portal === 'goiania' ? '/acesso-contabilidade-goiania' : '/acesso-contabilidade';

const brDate = (value?: string | null) => {
  if (!value) return '—';
  if (/^\d{4}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('pt-BR').format(d);
};
const brDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
};
const money = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n) : '—';
};
const parseDate = (value?: unknown) => {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const sameMonth = (value: string | undefined, competencia: string) => String(value || '').slice(0, 7) === competencia;
const reviewStatuses = new Set(['aguardando_analise', 'retificacao', 'pendencia']);
const needsReview = (e: Evento) => !['adiantamento', 'ferias_alerta'].includes(e.origem_tipo) && e.categoria !== 'adiantamento' && reviewStatuses.has(e.status);
const isInformational = (e: Evento) => e.categoria === 'adiantamento' || e.origem_tipo === 'ferias_alerta';

const notificationMeta: Record<string, { label: string; icon: any; tone: string }> = {
  admissao: { label: 'Contratações', icon: UserPlus, tone: 'text-amber-300' },
  demissao: { label: 'Demissões', icon: UserRoundX, tone: 'text-rose-300' },
  atestado: { label: 'Atestados', icon: FileHeart, tone: 'text-cyan-300' },
  alteracao_salario: { label: 'Salários', icon: WalletCards, tone: 'text-violet-300' },
  alteracao_funcao: { label: 'Funções', icon: BriefcaseBusiness, tone: 'text-fuchsia-300' },
};

function readSession(portal: PortalKind): Sessao | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(portal)) || 'null');
    if (!parsed?.token) return null;
    if (parsed.expira_em && Date.parse(parsed.expira_em) <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function ContabilidadeDashboardPageV3({ portal }: { portal: PortalKind }) {
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<Sessao | null>(() => readSession(portal));
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [historico, setHistorico] = useState<Evento[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [competenciaAtual, setCompetenciaAtual] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [viewKey, setViewKey] = useState<ViewKey | null>(null);
  const [selecionado, setSelecionado] = useState<Evento | null>(null);
  const [pendenciaTexto, setPendenciaTexto] = useState('');
  const [showIssueForm, setShowIssueForm] = useState(false);
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
      setCompetenciaAtual(String(res.competencia_atual || new Date().toISOString().slice(0, 7)));
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível atualizar a Central da Contabilidade.');
    } finally {
      setLoading(false);
    }
  }, [navigate, portal]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    const timer = window.setInterval(() => void carregar(true), 60_000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const abrir = (key: ViewKey) => {
    setViewKey(key);
    setSelecionado(null);
    setShowIssueForm(false);
    setPendenciaTexto('');
  };
  const fechar = () => {
    setViewKey(null);
    setSelecionado(null);
    setShowIssueForm(false);
    setPendenciaTexto('');
  };
  const abrirEvento = (evento: Evento) => {
    setSelecionado(evento);
    setPendenciaTexto(evento.observacao || '');
    setShowIssueForm(false);
  };

  const marcar = async (evento: Evento, status: 'conferido' | 'pendencia', observacao?: string) => {
    if (isInformational(evento)) return;
    const current = readSession(portal);
    if (!current?.token) return sair();
    if (status === 'pendencia' && !String(observacao || '').trim()) return toast.error('Informe o que precisa ser corrigido.');
    setUpdating(true);
    try {
      const { data, error } = await supabase.rpc('contabilidade_portal_revisar_sessao' as any, {
        p_token: current.token,
        p_portal: portal,
        p_origem_tipo: evento.origem_tipo,
        p_origem_id: evento.origem_id,
        p_status: status,
        p_observacao: observacao || null,
      });
      const res = data as any;
      if (error || !res?.ok) throw new Error('Não foi possível registrar a conferência.');
      toast.success(status === 'conferido' ? 'Conferência registrada.' : 'Pendência registrada para o RH.');
      setShowIssueForm(false);
      await carregar(true);
      setSelecionado(null);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar.');
    } finally {
      setUpdating(false);
    }
  };

  const pendentes = useMemo(() => eventos.filter(needsReview), [eventos]);
  const totalFuncionarios = useMemo(() => empresas.reduce((sum, e) => sum + Number(e.funcionarios_ativos || 0), 0), [empresas]);
  const fechamentoMes = useMemo(() => eventos.filter(e => e.categoria === 'fechamento'), [eventos]);
  const adiantamentos = useMemo(() => eventos.filter(e => e.categoria === 'adiantamento'), [eventos]);
  const adiantamentoTotal = useMemo(() => adiantamentos.reduce((sum, e) => sum + Number(e.detalhes?.valor || 0), 0), [adiantamentos]);
  const atestadosMes = useMemo(() => eventos.filter(e => e.categoria === 'atestado' && (!competenciaAtual || sameMonth(e.data_evento || e.created_at, competenciaAtual))), [eventos, competenciaAtual]);
  const atestadosPendentes = useMemo(() => atestadosMes.filter(needsReview), [atestadosMes]);

  const ferias = useMemo(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const operacionais = eventos.filter(e => e.categoria === 'ferias');
    const regulares = operacionais.filter(e => e.origem_tipo === 'ferias');
    const alertas = operacionais.filter(e => e.origem_tipo === 'ferias_alerta');
    const vencidas = alertas.filter(e => e.detalhes?.situacao === 'vencida' || e.titulo.includes('VENCIDAS'));
    const aVencer = alertas.filter(e => ['critica', 'proxima'].includes(String(e.detalhes?.situacao || '')) || e.titulo.includes('CRÍTICAS') || e.titulo.includes('PRÓXIMAS'));
    const emAndamento = regulares.filter(e => {
      const inicio = parseDate(e.detalhes?.inicio);
      const fim = parseDate(e.detalhes?.fim);
      return !!inicio && !!fim && inicio <= now && fim >= now;
    });
    const noPeriodo = regulares.filter(e => {
      const inicio = parseDate(e.detalhes?.inicio);
      return !!inicio && inicio > now;
    });
    const concluidas = historico.filter(e => e.categoria === 'ferias' && e.origem_tipo === 'ferias').filter(e => {
      const fim = parseDate(e.detalhes?.fim);
      return !!fim && fim < now;
    });
    return { vencidas, aVencer, noPeriodo, emAndamento, concluidas };
  }, [eventos, historico]);

  const notificationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.keys(notificationMeta).forEach(k => {
      if (k === 'atestado') counts[k] = atestadosMes.length;
      else counts[k] = eventos.filter(e => e.categoria === k).length;
    });
    return counts;
  }, [eventos, atestadosMes]);

  const alertCount = pendentes.length + ferias.vencidas.length + atestadosPendentes.length;

  const listForView = useMemo(() => {
    if (!viewKey) return [] as Evento[];
    if (viewKey === 'pending') return pendentes;
    if (viewKey === 'alerts') {
      const uniq = new Map<string, Evento>();
      [...ferias.vencidas, ...atestadosPendentes, ...pendentes].forEach(e => uniq.set(`${e.origem_tipo}:${e.origem_id}`, e));
      return [...uniq.values()];
    }
    if (viewKey === 'fechamento') return fechamentoMes;
    if (viewKey === 'adiantamentos') return adiantamentos;
    if (viewKey.startsWith('notification:')) return eventos.filter(e => e.categoria === viewKey.split(':')[1]);
    if (viewKey.startsWith('company:')) return eventos.filter(e => e.empresa_id === viewKey.split(':')[1]);
    if (viewKey.startsWith('ferias-status:')) {
      const key = viewKey.split(':')[1] as keyof typeof ferias;
      return ferias[key] || [];
    }
    if (viewKey === 'atestados-status:pending') return atestadosPendentes;
    if (viewKey === 'atestados-status:month') return atestadosMes;
    if (viewKey === 'history') return historico;
    return [];
  }, [viewKey, pendentes, ferias, atestadosPendentes, atestadosMes, fechamentoMes, adiantamentos, eventos, historico]);

  const modalTitle = useMemo(() => {
    if (!viewKey) return '';
    if (viewKey === 'pending') return 'Aguardando análise';
    if (viewKey === 'alerts') return 'Alertas';
    if (viewKey === 'fechamento') return 'Fechamento do mês';
    if (viewKey === 'adiantamentos') return 'Adiantamentos do mês';
    if (viewKey === 'history') return 'Histórico';
    if (viewKey.startsWith('notification:')) return notificationMeta[viewKey.split(':')[1]]?.label || 'Notificações';
    if (viewKey.startsWith('company:')) return empresas.find(e => e.id === viewKey.split(':')[1])?.nome || 'Empresa';
    if (viewKey.startsWith('ferias-status:')) {
      return ({ vencidas: 'Férias vencidas', aVencer: 'Férias a vencer', noPeriodo: 'Férias no período', emAndamento: 'Férias em andamento', concluidas: 'Férias concluídas' } as Record<string, string>)[viewKey.split(':')[1]] || 'Férias';
    }
    if (viewKey === 'atestados-status:pending') return 'Atestados aguardando confirmação';
    if (viewKey === 'atestados-status:month') return 'Atestados lançados no mês';
    return 'Movimentações';
  }, [viewKey, empresas]);

  const detailRows = (e: Evento): Array<[string, any]> => {
    const d = e.detalhes || {};
    if (e.origem_tipo === 'ferias_alerta') return [
      ['Situação', e.titulo.replace('FÉRIAS ', '')],
      ['Data limite', brDate(d.data_limite)],
      ['Dias para o limite', d.dias_para_limite ?? '—'],
      ['Período aquisitivo', `${brDate(d.periodo_aquisitivo_inicio)} até ${brDate(d.periodo_aquisitivo_fim)}`],
      ['Início previsto', brDate(d.inicio_previsto)],
    ];
    if (e.categoria === 'ferias') return [['Início', brDate(d.inicio)], ['Fim', brDate(d.fim)], ['Retorno', brDate(d.retorno)], ['Dias', d.dias ?? '—'], ['Cargo', d.cargo || '—']];
    if (e.categoria === 'atestado') return [['Documento', d.tipo_documento || 'Atestado'], ['Data', brDate(d.data_documento)], ['Recebido', brDateTime(d.recebido_em)], ['Registrado por', d.registrado_por || '—'], ['Descrição', d.descricao || '—']];
    if (e.categoria === 'adiantamento') return [['Competência', d.competencia || '—'], ['Valor', money(d.valor)], ['Status', d.status_conferencia || '—']];
    if (e.categoria === 'fechamento') return [['Competência', d.competencia || e.data_evento || '—'], ['Funcionários', d.total_funcionarios ?? '—'], ['Proventos', money(d.total_proventos)], ['Descontos', money(d.total_descontos)], ['Líquido', money(d.total_liquido)], ['Fechado por', d.fechado_por || '—']];
    if (e.categoria === 'admissao') return [['CPF', d.cpf || '—'], ['Admissão', brDate(d.admissao)], ['Função', d.funcao || '—'], ['Jornada', d.jornada || '—']];
    if (e.categoria === 'demissao') return [['CPF', d.cpf || '—'], ['Desligamento', brDate(d.desligamento)], ['Tipo', d.tipo || '—'], ['Motivo', d.motivo || '—']];
    if (e.categoria === 'alteracao_salario') return [['Salário anterior', money(d.salario_anterior)], ['Novo salário', money(d.salario_novo)], ['Alterado em', brDateTime(d.data_registro)]];
    if (e.categoria === 'alteracao_funcao') return [['Função anterior', d.funcao_anterior || '—'], ['Nova função', d.funcao_nova || '—'], ['Alterado em', brDateTime(d.data_registro)]];
    return Object.entries(d).slice(0, 8).map(([k, v]) => [k.replaceAll('_', ' '), typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')]);
  };

  const abrirDocumento = (e: Evento) => {
    const raw = String(e.documento_url || '').trim();
    if (!raw) return toast.error('Este registro não possui documento anexado.');
    if (/^https?:\/\//i.test(raw)) return window.open(raw, '_blank', 'noopener,noreferrer');
    const bucket = String(e.detalhes?.storage_bucket || '').trim();
    const path = String(e.detalhes?.storage_path || raw).trim();
    if (!bucket || !path) return toast.error('Documento indisponível.');
    const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <div className="min-h-screen bg-[#020609] flex items-center justify-center text-zinc-300"><Loader2 className="h-8 w-8 animate-spin text-[#9b32ff]" /></div>;

  return (
    <div className="min-h-screen bg-[#020609] text-zinc-100">
      <header className="sticky top-0 z-30 h-[62px] border-b border-[#24202c] bg-[#030609]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-[1680px] items-center gap-3 px-4 sm:px-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border border-[#7c2cff] bg-[#08070a] text-[25px] font-black text-[#f4b400]">T</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-black text-white">TOPAC RH PRO</div>
            <div className="truncate text-[10px] font-semibold text-[#9b32ff]">Central da Contabilidade {isGoiania ? '· Goiânia' : ''}</div>
          </div>
          <div className="hidden text-right md:block">
            <div className="text-[11px] font-semibold text-zinc-200">{sessao?.usuario?.nome || 'Contabilidade'}</div>
            <div className="text-[9px] text-zinc-500">{isGoiania ? 'TOPAC Goiânia' : 'Matriz · Praia · LMT · ALQUI'}</div>
          </div>
          <button onClick={() => abrir('history')} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#2b2532] bg-[#080a0e] px-3 text-[10px] font-semibold text-zinc-300 hover:border-[#7c2cff]"><History className="h-4 w-4" />Histórico</button>
          <button onClick={() => void carregar()} className="grid h-9 w-9 place-items-center rounded-md border border-[#2b2532] bg-[#080a0e] text-zinc-400 hover:border-[#7c2cff]" title="Atualizar"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={sair} className="grid h-9 w-9 place-items-center rounded-md border border-[#2b2532] bg-[#080a0e] text-zinc-400 hover:border-rose-500/50 hover:text-rose-300" title="Sair"><LogOut className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] p-4 sm:p-[18px]">
        <section className="rounded-[12px] border border-[#2b2532] bg-[linear-gradient(110deg,#080a0f_0%,#0d0815_58%,#080a0f_100%)] px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#a855f7]">Competência · {competenciaAtual ? brDate(competenciaAtual) : 'mês atual'}</div>
              <h1 className="mt-1 text-[25px] font-black text-white sm:text-[30px]">Central da Contabilidade</h1>
              <p className="mt-1 max-w-2xl text-[12px] text-zinc-400">O que precisa de ação aparece. O que já fechou vai para o histórico.</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500"><Clock3 className="h-3.5 w-3.5" />Atualização automática</div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <MainCard icon={Users} label="Funcionários ativos" value={totalFuncionarios} note={`${empresas.length} ${empresas.length === 1 ? 'empresa liberada' : 'empresas liberadas'}`} tone="text-cyan-300" />
          <MainCard icon={BellRing} label="Aguardando análise" value={pendentes.length} note="Apenas pendências reais" tone="text-amber-300" onClick={() => abrir('pending')} />
          <MainCard icon={CalendarDays} label="Férias" value={ferias.vencidas.length + ferias.aVencer.length + ferias.noPeriodo.length + ferias.emAndamento.length} note={`${ferias.vencidas.length} vencidas`} tone="text-cyan-300" onClick={() => abrir('ferias')} />
          <MainCard icon={FileText} label="Fechamento do mês" value={fechamentoMes.length} note="Conferência por empresa" tone="text-violet-300" onClick={() => abrir('fechamento')} />
          <MainCard icon={AlertTriangle} label="Alertas" value={alertCount} note="Itens que merecem atenção" tone="text-rose-300" onClick={() => abrir('alerts')} />
          <MainCard icon={Banknote} label="Adiantamentos" value={adiantamentos.length} note={adiantamentos.length ? money(adiantamentoTotal) : 'Competência atual'} tone="text-sky-300" onClick={() => abrir('adiantamentos')} />
        </section>

        <section className="mt-4 rounded-[12px] border border-[#24202c] bg-[#04070b] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="text-[14px] font-black text-white">Empresas</h2><p className="mt-1 text-[10px] text-zinc-500">Funcionários ativos e movimentações da competência.</p></div>
            <Building2 className="h-5 w-5 text-[#9b32ff]" />
          </div>
          <div className={`grid gap-3 ${empresas.length === 1 ? 'grid-cols-1 max-w-md' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}`}>
            {empresas.map(empresa => {
              const movimentos = eventos.filter(e => e.empresa_id === empresa.id).length;
              const pend = pendentes.filter(e => e.empresa_id === empresa.id).length;
              return <button key={empresa.id} onClick={() => abrir(`company:${empresa.id}`)} className="rounded-[10px] border border-[#2b2532] bg-[#070a0f] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#7c2cff]">
                <div className="flex items-start justify-between gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg border border-[#482463] bg-[#150d1d] text-[#b85cff]"><Building2 className="h-5 w-5" /></div><ChevronRight className="h-4 w-4 text-zinc-600" /></div>
                <div className="mt-4 text-[13px] font-black text-white">{empresa.nome}</div>
                <div className="mt-3 flex items-end justify-between"><div><div className="text-[28px] font-black leading-none text-white">{Number(empresa.funcionarios_ativos || 0)}</div><div className="mt-1 text-[9px] uppercase tracking-wide text-zinc-500">funcionários ativos</div></div><div className="text-right text-[9px] text-zinc-500"><div>{movimentos} movimentos</div><div className={pend ? 'text-amber-300' : 'text-emerald-400'}>{pend ? `${pend} pendentes` : 'Sem pendência'}</div></div></div>
              </button>;
            })}
          </div>
        </section>

        <section className="mt-4 rounded-[12px] border border-[#24202c] bg-[#04070b] p-4 sm:p-5">
          <div className="mb-4"><h2 className="text-[14px] font-black text-white">Notificações</h2><p className="mt-1 text-[10px] text-zinc-500">Contratação, demissão, atestados, salário e função só aparecem quando houver movimento.</p></div>
          {Object.entries(notificationMeta).every(([key]) => !notificationCounts[key]) ? (
            <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[.035] p-5 text-center text-xs text-emerald-300">Nenhuma notificação operacional agora.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {Object.entries(notificationMeta).map(([key, meta]) => {
                const count = notificationCounts[key] || 0;
                if (!count) return null;
                const Icon = meta.icon;
                return <button key={key} onClick={() => key === 'atestado' ? abrir('atestados') : abrir(`notification:${key}`)} className="rounded-[10px] border border-[#2b2532] bg-[#070a0f] p-4 text-left transition hover:border-[#7c2cff]">
                  <div className="flex items-center justify-between"><Icon className={`h-5 w-5 ${meta.tone}`} /><span className="rounded-full border border-[#5f3a78] bg-[#1a1023] px-2 py-0.5 text-[10px] font-black text-white">{count}</span></div>
                  <div className="mt-4 text-[12px] font-black text-white">{meta.label}</div><div className="mt-1 text-[9px] text-zinc-500">Clique para abrir</div>
                </button>;
              })}
            </div>
          )}
        </section>
      </main>

      <Dialog open={!!viewKey} onOpenChange={open => { if (!open) fechar(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[#3a2849] bg-[#05080d] text-zinc-100 sm:max-w-5xl">
          <DialogHeader><DialogTitle className="pr-8 text-white">{selecionado ? selecionado.titulo : modalTitle || (viewKey === 'ferias' ? 'Férias' : viewKey === 'atestados' ? 'Atestados' : '')}</DialogTitle></DialogHeader>

          {!selecionado && viewKey === 'ferias' && <StatusGrid>
            <StatusCard label="Vencidas" value={ferias.vencidas.length} tone="rose" onClick={() => abrir('ferias-status:vencidas')} />
            <StatusCard label="A vencer" value={ferias.aVencer.length} tone="amber" onClick={() => abrir('ferias-status:aVencer')} />
            <StatusCard label="No período" value={ferias.noPeriodo.length} tone="cyan" onClick={() => abrir('ferias-status:noPeriodo')} />
            <StatusCard label="Em andamento" value={ferias.emAndamento.length} tone="violet" onClick={() => abrir('ferias-status:emAndamento')} />
            <StatusCard label="Concluídas" value={ferias.concluidas.length} tone="green" onClick={() => abrir('ferias-status:concluidas')} />
          </StatusGrid>}

          {!selecionado && viewKey === 'atestados' && <StatusGrid>
            <StatusCard label="Aguardando confirmação" value={atestadosPendentes.length} tone="amber" onClick={() => abrir('atestados-status:pending')} />
            <StatusCard label="Lançados do mês" value={atestadosMes.length} tone="cyan" onClick={() => abrir('atestados-status:month')} />
          </StatusGrid>}

          {!selecionado && viewKey?.startsWith('company:') && (() => {
            const empresaId = viewKey.split(':')[1];
            const empresa = empresas.find(e => e.id === empresaId);
            const movs = eventos.filter(e => e.empresa_id === empresaId);
            const pend = movs.filter(needsReview);
            const fech = movs.filter(e => e.categoria === 'fechamento');
            const fer = movs.filter(e => e.categoria === 'ferias');
            return <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MiniStat label="Funcionários ativos" value={Number(empresa?.funcionarios_ativos || 0)} />
                <MiniStat label="Pendências" value={pend.length} />
                <MiniStat label="Férias / alertas" value={fer.length} />
                <MiniStat label="Fechamento" value={fech.length} />
              </div>
              <EventList events={movs} onOpen={abrirEvento} empty="Nenhuma movimentação desta empresa na competência atual." />
            </div>;
          })()}

          {!selecionado && viewKey && !['ferias', 'atestados'].includes(viewKey) && !viewKey.startsWith('company:') && <EventList events={listForView} onOpen={abrirEvento} empty={viewKey === 'pending' ? 'Não há nada aguardando análise.' : 'Nenhum registro encontrado.'} direct={viewKey === 'pending'} />}

          {selecionado && <div className="space-y-4">
            <div className="rounded-lg border border-[#28232e] bg-[#080b10] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-wide text-zinc-500">{selecionado.empresa_nome}</div><div className="mt-1 text-lg font-black text-white">{selecionado.funcionario_nome || selecionado.titulo}</div></div><StatusBadge evento={selecionado} /></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{detailRows(selecionado).map(([label, value]) => <div key={label} className="rounded-md border border-[#24232a] bg-[#05070a] p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">{label}</div><div className="mt-1 text-xs font-semibold text-zinc-200">{String(value ?? '—')}</div></div>)}</div>
            </div>
            {selecionado.documento_url && <Button variant="outline" onClick={() => abrirDocumento(selecionado)} className="border-[#3d3150] bg-[#090b10] text-zinc-200">Abrir documento</Button>}
            {!isInformational(selecionado) && <div className="rounded-lg border border-[#302739] bg-[#080a0f] p-4">
              <div className="text-xs font-bold text-white">Conferência</div>
              {selecionado.observacao && <div className="mt-2 rounded-md border border-rose-500/20 bg-rose-500/[.04] p-3 text-xs text-rose-200">{selecionado.observacao}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={updating} onClick={() => void marcar(selecionado, 'conferido')} className="bg-emerald-600 text-white hover:bg-emerald-500"><CheckCircle2 className="mr-2 h-4 w-4" />Confirmar</Button>
                <Button disabled={updating} variant="outline" onClick={() => setShowIssueForm(v => !v)} className="border-rose-500/30 bg-rose-500/[.04] text-rose-200"><AlertTriangle className="mr-2 h-4 w-4" />Informar pendência</Button>
              </div>
              {showIssueForm && <div className="mt-3 space-y-2"><textarea value={pendenciaTexto} onChange={e => setPendenciaTexto(e.target.value)} placeholder="Descreva o que precisa ser corrigido..." className="min-h-[90px] w-full rounded-md border border-[#3a2d46] bg-[#05070a] p-3 text-sm text-zinc-100 outline-none focus:border-[#8b22ff]" /><Button disabled={updating || !pendenciaTexto.trim()} onClick={() => void marcar(selecionado, 'pendencia', pendenciaTexto)} className="bg-rose-600 text-white hover:bg-rose-500">Registrar pendência</Button></div>}
            </div>}
            <button onClick={() => setSelecionado(null)} className="text-xs font-semibold text-[#b85cff] hover:text-white">← Voltar para a lista</button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MainCard({ icon: Icon, label, value, note, tone, onClick }: { icon: any; label: string; value: number; note: string; tone: string; onClick?: () => void }) {
  const Cmp: any = onClick ? 'button' : 'div';
  return <Cmp onClick={onClick} className={`min-h-[132px] rounded-[11px] border border-[#2b2532] bg-[#06090d] p-4 text-left ${onClick ? 'transition hover:-translate-y-0.5 hover:border-[#7c2cff]' : ''}`}>
    <div className="flex items-start justify-between"><Icon className={`h-5 w-5 ${tone}`} />{onClick && <ChevronRight className="h-4 w-4 text-zinc-600" />}</div>
    <div className="mt-4 text-[30px] font-black leading-none text-white">{value}</div><div className="mt-2 text-[11px] font-black text-zinc-200">{label}</div><div className="mt-1 text-[9px] leading-snug text-zinc-600">{note}</div>
  </Cmp>;
}

function StatusGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">{children}</div>;
}
function StatusCard({ label, value, tone, onClick }: { label: string; value: number; tone: 'rose' | 'amber' | 'cyan' | 'violet' | 'green'; onClick: () => void }) {
  const tones = { rose: 'border-rose-500/25 text-rose-300', amber: 'border-amber-500/25 text-amber-300', cyan: 'border-cyan-500/25 text-cyan-300', violet: 'border-violet-500/25 text-violet-300', green: 'border-emerald-500/25 text-emerald-300' };
  return <button onClick={onClick} className={`rounded-xl border bg-[#080a0e] p-4 text-left transition hover:-translate-y-0.5 ${tones[tone]}`}><div className="text-3xl font-black text-white">{value}</div><div className={`mt-2 text-xs font-black ${tones[tone].split(' ')[1]}`}>{label}</div><div className="mt-1 text-[9px] text-zinc-600">Clique para ver quem são</div></button>;
}
function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-[#28232e] bg-[#080a0e] p-4"><div className="text-2xl font-black text-white">{value}</div><div className="mt-1 text-[10px] font-semibold text-zinc-500">{label}</div></div>;
}
function EventList({ events, onOpen, empty, direct = false }: { events: Evento[]; onOpen: (e: Evento) => void; empty: string; direct?: boolean }) {
  if (!events.length) return <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[.035] p-6 text-center text-xs text-emerald-300">{empty}</div>;
  return <div className="space-y-2">
    {direct && <div className="rounded-md border border-amber-500/15 bg-amber-500/[.035] px-3 py-2 text-[10px] text-amber-200">Somente itens que precisam de ação. Sem pesquisa e sem filtros.</div>}
    {events.map(e => <button key={`${e.origem_tipo}:${e.origem_id}`} onClick={() => onOpen(e)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#28232e] bg-[#080a0e] p-4 text-left transition hover:border-[#68368a]">
      <div className="min-w-0"><div className="truncate text-xs font-black text-white">{e.funcionario_nome || e.titulo}</div><div className="mt-1 truncate text-[10px] text-zinc-500">{e.empresa_nome} · {e.titulo} · {brDate(e.data_evento || e.created_at)}</div></div><div className="flex shrink-0 items-center gap-2"><StatusBadge evento={e} /><ChevronRight className="h-4 w-4 text-zinc-600" /></div>
    </button>)}
  </div>;
}
function StatusBadge({ evento }: { evento: Evento }) {
  if (evento.origem_tipo === 'ferias_alerta') {
    const vencida = evento.detalhes?.situacao === 'vencida' || evento.titulo.includes('VENCIDAS');
    return <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${vencida ? 'border-rose-500/25 bg-rose-500/10 text-rose-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-300'}`}>{vencida ? 'Vencida' : 'A vencer'}</span>;
  }
  const labels: Record<string, string> = { aguardando_analise: 'Aguardando', conferido: 'Conferido', pendencia: 'Pendência', retificacao: 'Retificação' };
  const classes: Record<string, string> = { aguardando_analise: 'border-amber-500/25 bg-amber-500/10 text-amber-300', conferido: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300', pendencia: 'border-rose-500/25 bg-rose-500/10 text-rose-300', retificacao: 'border-violet-500/25 bg-violet-500/10 text-violet-300' };
  return <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${classes[evento.status] || 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>{labels[evento.status] || evento.status || 'Informação'}</span>;
}
