import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, Clock3, ExternalLink, Fuel, Gauge,
  Loader2, LogIn, Printer, Radar, RefreshCw, Route, Users, Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import AppMecanicoDetailPanel from './AppMecanicoDetailPanel';
import RastreamentoMecanicosAdminPanel from './RastreamentoMecanicosAdminPanel';
import { toast } from 'sonner';

const TZ = 'America/Sao_Paulo';
const todayLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const monthStart = () => `${todayLocal().slice(0, 7)}-01`;
const money = (value?: number | null) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numberBr = (value?: number | null) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }) : 'Nunca';
const onlyTime = (value?: string | null) => value ? String(value).slice(0, 5) : '—';
const dateBr = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const duration = (minutes?: number | null) => {
  const total = Math.max(0, Number(minutes || 0));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}min`;
};

type Tab = 'ponto' | 'abastecimento' | 'km' | 'fechamento' | 'rastreamento';

type DashboardStats = {
  mecanicos: number;
  online: number;
  ponto_hoje: number;
  ponto_aberto: number;
  abastecimentos_hoje: number;
  abastecimentos_pendentes: number;
  km_total_hoje: number;
  km_abertos: number;
  fechamentos_completos: number;
  fechamentos_pendentes: number;
};

type MecanicoRow = {
  id: string;
  funcionario_id?: string | null;
  nome: string;
  empresa: string;
  filial?: string | null;
  funcao?: string | null;
  liberado: boolean;
  online: boolean;
  acessou_hoje: boolean;
  ultimo_acesso_em?: string | null;
  ponto: { batidas: number; entrada?: string | null; almoco_inicio?: string | null; almoco_fim?: string | null; saida?: string | null; status: string };
  abastecimento: { hoje: number; valor: number; litros: number; pendentes: number; ultimo_em?: string | null };
  km: { placa?: string | null; veiculo?: string | null; saida?: number | null; chegada?: number | null; total: number; status: string };
  fechamento: { status: string };
};

type DashboardResponse = { ok?: boolean; error?: string; stats?: DashboardStats; mecanicos?: MecanicoRow[] };

type FuelAuthorization = {
  id: string;
  funcionario_nome: string;
  empresa_nome?: string | null;
  filial?: string | null;
  placa?: string | null;
  combustivel?: string | null;
  posto_nome?: string | null;
  solicitado_em: string;
  status: string;
};

type ClosedOperation = {
  id: string;
  mecanico_nome: string;
  empresa?: string | null;
  filial?: string | null;
  placa?: string | null;
  data: string;
  hora: string;
  combustivel?: string | null;
  valor: number;
  litros: number;
  posto_nome?: string | null;
  categoria_operacional?: string | null;
  fim_semana: boolean;
  hora_extra_minutos: number;
  acompanhantes: Array<{ nome?: string }>;
};

const emptyStats: DashboardStats = {
  mecanicos: 0, online: 0, ponto_hoje: 0, ponto_aberto: 0, abastecimentos_hoje: 0,
  abastecimentos_pendentes: 0, km_total_hoje: 0, km_abertos: 0,
  fechamentos_completos: 0, fechamentos_pendentes: 0,
};

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.75)]' : 'bg-zinc-600'}`} />;
}

function TopCard({ active, title, value, subtitle, icon: Icon, onClick }: { active: boolean; title: string; value: string | number; subtitle: string; icon: typeof Clock3; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-xl border p-4 text-left transition ${active ? 'border-amber-400/60 bg-amber-400/5 shadow-[0_0_22px_rgba(251,191,36,.08)]' : 'border-fuchsia-500/20 bg-[#08080e] hover:border-fuchsia-500/40'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-500">{title}</p>
          <strong className="mt-2 block text-2xl font-black text-amber-400">{value}</strong>
          <span className="mt-1 block text-[11px] text-zinc-500">{subtitle}</span>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-xl border ${active ? 'border-amber-400/30 bg-amber-400/10 text-amber-400' : 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-400'}`}><Icon className="h-5 w-5" /></span>
      </div>
    </button>
  );
}

function AccessBadge({ row }: { row: MecanicoRow }) {
  if (!row.liberado) return <Badge variant="destructive">Bloqueado</Badge>;
  if (row.online) return <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/10"><StatusDot ok />&nbsp; Online</Badge>;
  if (row.acessou_hoje) return <Badge variant="outline" className="border-blue-500/30 text-blue-400">Acessou hoje</Badge>;
  return <Badge variant="outline" className="text-zinc-500">Offline</Badge>;
}

function MiniStatus({ label, value, tone = 'text-zinc-300' }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-2"><span className="block text-[8px] font-bold uppercase tracking-wider text-zinc-600">{label}</span><strong className={`mt-1 block truncate text-[11px] ${tone}`}>{value}</strong></div>;
}

function MechanicCard({ row, tab, onOpen }: { row: MecanicoRow; tab: Tab; onOpen: (id: string) => void }) {
  const initials = row.nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const pointTone = row.ponto.status === 'fechado' ? 'text-emerald-400' : row.ponto.status === 'aberto' ? 'text-amber-400' : 'text-zinc-500';
  const closeTone = row.fechamento.status === 'completo' ? 'text-emerald-400' : row.fechamento.status === 'pendente' ? 'text-amber-400' : 'text-zinc-500';

  return (
    <article className="overflow-hidden rounded-xl border border-fuchsia-500/15 bg-[#07070d] shadow-[inset_0_0_35px_rgba(168,85,247,.025)]">
      <div className="flex items-start gap-3 border-b border-white/5 p-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 text-xs font-black text-fuchsia-300">{initials}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2"><h3 className="truncate text-sm font-black text-white">{row.nome}</h3><AccessBadge row={row} /></div>
          <p className="mt-0.5 truncate text-[10px] text-zinc-500">{row.funcao || 'Mecânico'} · {row.filial || row.empresa}</p>
          <div className="mt-1 flex items-center justify-between gap-2"><p className="flex items-center gap-1 text-[9px] text-zinc-600"><LogIn className="h-3 w-3" /> Último acesso: {dateTime(row.ultimo_acesso_em)}</p><Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => onOpen(row.id)}><ExternalLink className="mr-1 h-3 w-3" />Abrir ficha</Button></div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 p-2.5">
        <MiniStatus label="Ponto" value={row.ponto.status === 'fechado' ? 'Fechado' : row.ponto.status === 'aberto' ? 'Em jornada' : 'Não bateu'} tone={pointTone} />
        <MiniStatus label="Abast." value={row.abastecimento.pendentes ? `${row.abastecimento.pendentes} pend.` : row.abastecimento.hoje ? `${row.abastecimento.hoje} hoje` : 'Nenhum'} tone={row.abastecimento.pendentes ? 'text-amber-400' : row.abastecimento.hoje ? 'text-emerald-400' : 'text-zinc-500'} />
        <MiniStatus label="KM" value={row.km.placa ? `${numberBr(row.km.total)} km` : 'Sem registro'} tone={row.km.status === 'aberto' ? 'text-amber-400' : row.km.placa ? 'text-zinc-300' : 'text-zinc-500'} />
        <MiniStatus label="Fech." value={row.fechamento.status === 'completo' ? 'Completo' : row.fechamento.status === 'pendente' ? 'Pendente' : 'Não iniciou'} tone={closeTone} />
      </div>

      <div className="border-t border-white/5 px-3.5 py-3 text-xs">
        {tab === 'ponto' && <div className="grid grid-cols-4 gap-2 text-center"><div><span className="block text-[9px] text-zinc-600">Entrada</span><strong className="text-emerald-400">{onlyTime(row.ponto.entrada)}</strong></div><div><span className="block text-[9px] text-zinc-600">Almoço</span><strong className="text-zinc-300">{onlyTime(row.ponto.almoco_inicio)}</strong></div><div><span className="block text-[9px] text-zinc-600">Retorno</span><strong className="text-zinc-300">{onlyTime(row.ponto.almoco_fim)}</strong></div><div><span className="block text-[9px] text-zinc-600">Saída</span><strong className={row.ponto.saida ? 'text-emerald-400' : 'text-amber-400'}>{onlyTime(row.ponto.saida)}</strong></div></div>}
        {tab === 'abastecimento' && <div className="grid grid-cols-3 gap-2"><div><span className="block text-[9px] text-zinc-600">Hoje</span><strong className="text-amber-400">{row.abastecimento.hoje} registro(s)</strong></div><div><span className="block text-[9px] text-zinc-600">Litros</span><strong>{numberBr(row.abastecimento.litros)} L</strong></div><div><span className="block text-[9px] text-zinc-600">Valor</span><strong>{money(row.abastecimento.valor)}</strong></div></div>}
        {tab === 'km' && <div className="grid grid-cols-3 gap-2"><div><span className="block text-[9px] text-zinc-600">Veículo</span><strong className="text-fuchsia-300">{row.km.placa || '—'}</strong></div><div><span className="block text-[9px] text-zinc-600">Saída / chegada</span><strong>{row.km.saida ?? '—'} / {row.km.chegada ?? '—'}</strong></div><div><span className="block text-[9px] text-zinc-600">Rodado</span><strong className="text-amber-400">{numberBr(row.km.total)} km</strong></div></div>}
        {tab === 'fechamento' && <div className="flex items-center justify-between gap-3"><div><span className="block text-[9px] text-zinc-600">Situação de hoje</span><strong className={closeTone}>{row.fechamento.status === 'completo' ? 'Jornada fechada' : row.fechamento.status === 'pendente' ? 'Aguardando saída' : 'Sem jornada iniciada'}</strong></div><div className="text-right"><span className="block text-[9px] text-zinc-600">Batidas</span><strong>{row.ponto.batidas || 0}</strong></div></div>}
      </div>
    </article>
  );
}

function PendingFuelAuthorizations({ rows, acting, decide }: { rows: FuelAuthorization[]; acting: string; decide: (row: FuelAuthorization, decision: 'autorizar' | 'negar') => Promise<void> }) {
  if (!rows.length) return <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-400"><CheckCircle2 className="mr-2 inline h-4 w-4" />Nenhuma autorização de abastecimento pendente.</div>;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /><h2 className="text-sm font-black text-white">Autorizações pendentes</h2><Badge variant="destructive">{rows.length}</Badge></div>
      <div className="grid gap-2 xl:grid-cols-2">
        {rows.map((row) => <div key={row.id} className="rounded-xl border border-amber-500/20 bg-[#08080e] p-3"><div className="flex items-start justify-between gap-2"><div><strong className="text-sm text-white">{row.funcionario_nome}</strong><p className="text-[10px] text-zinc-500">{row.empresa_nome} · {row.filial}</p></div><span className="text-[10px] text-zinc-500">{dateTime(row.solicitado_em)}</span></div><div className="mt-2 text-xs text-zinc-400">{row.placa || 'Sem placa'} · {row.combustivel || 'Combustível'} · {row.posto_nome || 'Posto'}</div><div className="mt-3 flex gap-2"><Button size="sm" variant="destructive" disabled={acting === row.id} onClick={() => void decide(row, 'negar')}>Negar</Button><Button size="sm" disabled={acting === row.id} onClick={() => void decide(row, 'autorizar')}>Autorizar</Button></div></div>)}
      </div>
    </section>
  );
}

function OperationalClosingReport() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayLocal());
  const [rows, setRows] = useState<ClosedOperation[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from('abastecimentos').select('id,mecanico_nome,empresa,filial,placa,data,hora,combustivel,valor,litros,posto_nome,categoria_operacional,fim_semana,hora_extra_minutos,acompanhantes').gte('data', from).lte('data', to).eq('excluido', false).order('data', { ascending: true }).order('hora', { ascending: true });
    if (error) toast.error('Falha ao carregar fechamento operacional: ' + error.message);
    else setRows((data || []) as ClosedOperation[]);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);
  const total = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
  const overtime = rows.reduce((sum, row) => sum + Number(row.hora_extra_minutos || 0), 0);
  const trips = rows.filter((row) => row.categoria_operacional === 'Abastecimento Viagem').length;

  return (
    <section id="mechanic-close-print" className="space-y-3 rounded-xl border border-fuchsia-500/15 bg-[#08080e] p-4">
      <style>{`@media print{body *{visibility:hidden!important}#mechanic-close-print,#mechanic-close-print *{visibility:visible!important}#mechanic-close-print{position:absolute;left:0;top:0;width:100%;background:white!important;color:black!important;border:0!important}#mechanic-close-print .no-print{display:none!important}}`}</style>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-2"><Route className="h-4 w-4 text-fuchsia-400" /><h2 className="font-black text-white">Fechamento operacional</h2></div><p className="mt-1 text-[11px] text-zinc-500">Abastecimentos, viagens e hora extra consolidados.</p></div><div className="no-print flex flex-wrap items-end gap-2"><label className="text-[10px] text-zinc-500">De<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-36" /></label><label className="text-[10px] text-zinc-500">Até<Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1 w-36" /></label><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button><Button size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />PDF</Button></div></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><MiniStatus label="Operações" value={String(rows.length)} tone="text-amber-400" /><MiniStatus label="Viagens" value={String(trips)} tone="text-fuchsia-300" /><MiniStatus label="Hora extra" value={duration(overtime)} tone="text-amber-400" /><MiniStatus label="Abastecimento" value={money(total)} tone="text-emerald-400" /></div>
      <div className="overflow-x-auto rounded-xl border border-white/5"><table className="w-full min-w-[950px] text-xs"><thead className="bg-white/5 text-zinc-500"><tr><th className="p-2 text-left">Data</th><th className="p-2 text-left">Empresa</th><th className="p-2 text-left">Mecânico</th><th className="p-2 text-left">Veículo</th><th className="p-2 text-left">Abastecimento</th><th className="p-2 text-left">Categoria</th><th className="p-2 text-left">HE</th><th className="p-2 text-right">Valor</th></tr></thead><tbody className="divide-y divide-white/5">{rows.map((row) => <tr key={row.id}><td className="p-2">{dateBr(row.data)} · {String(row.hora || '').slice(0,5)}</td><td className="p-2">{row.empresa || '—'}<span className="block text-zinc-600">{row.filial}</span></td><td className="p-2 font-semibold">{row.mecanico_nome}</td><td className="p-2">{row.placa || '—'}</td><td className="p-2">{numberBr(row.litros)} L · {row.combustivel}</td><td className="p-2">{row.categoria_operacional || 'Normal'}</td><td className="p-2">{row.hora_extra_minutos ? duration(row.hora_extra_minutos) : '—'}</td><td className="p-2 text-right font-semibold">{money(row.valor)}</td></tr>)}{!rows.length && <tr><td colSpan={8} className="p-6 text-center text-zinc-500">Nenhuma operação no período.</td></tr>}</tbody></table></div>
    </section>
  );
}

export default function AppMecanicoAdminPage() {
  const { userRoles } = useApp();
  const isAdmin = userRoles.includes('admin');
  const [tab, setTab] = useState<Tab>('ponto');
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [rows, setRows] = useState<MecanicoRow[]>([]);
  const [pendingFuel, setPendingFuel] = useState<FuelAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const [dashboardResult, fuelResult] = await Promise.all([
      (supabase as any).rpc('admin_app_mecanicos_dashboard'),
      (supabase as any).from('abastecimento_autorizacoes').select('id,funcionario_nome,empresa_nome,filial,placa,combustivel,posto_nome,solicitado_em,status').eq('status', 'pendente').order('solicitado_em', { ascending: false }),
    ]);
    const dashboard = dashboardResult.data as DashboardResponse | null;
    if (dashboardResult.error || !dashboard?.ok) toast.error(dashboard?.error || dashboardResult.error?.message || 'Falha ao carregar dashboard dos mecânicos.');
    else { setStats(dashboard.stats || emptyStats); setRows(dashboard.mecanicos || []); }
    if (!fuelResult.error) setPendingFuel((fuelResult.data || []) as FuelAuthorization[]);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    void load();
    if (!isAdmin) return;
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load, isAdmin]);

  const decide = async (row: FuelAuthorization, decision: 'autorizar' | 'negar') => {
    setActing(row.id);
    try {
      const { error } = await (supabase as any).rpc('topac_decidir_abastecimento', { p_id: row.id, p_decisao: decision });
      if (error) throw error;
      toast.success(decision === 'autorizar' ? 'Abastecimento autorizado.' : 'Solicitação negada.');
      await load();
    } catch (error: any) { toast.error(error?.message || 'Não foi possível registrar a decisão.'); }
    finally { setActing(''); }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, MecanicoRow[]>();
    rows.forEach((row) => { const key = row.empresa || 'SEM EMPRESA'; map.set(key, [...(map.get(key) || []), row]); });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [rows]);

  const veiculosApp = useMemo(() => new Set(rows.map((row) => String(row.km?.placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()).filter(Boolean)).size, [rows]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fuchsia-500/20 bg-[#07070d] p-4">
        <div><div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-amber-400" /><h1 className="text-lg font-black text-white">App Mecânicos — Controle Operacional</h1><Badge variant="secondary">{stats.mecanicos} ativos</Badge></div><p className="mt-1 text-xs text-zinc-500">Acompanhamento em tempo real por empresa. Mecânicos não possuem edição ou exclusão de registros; a administração possui ficha completa.</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar</Button><Button size="sm" asChild><a href="/mecanicos" target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Link dos mecânicos</a></Button></div>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <TopCard active={tab === 'ponto'} title="Ponto" value={`${stats.ponto_hoje}/${stats.mecanicos}`} subtitle={`${stats.ponto_aberto} jornada(s) aberta(s)`} icon={Clock3} onClick={() => setTab('ponto')} />
        <TopCard active={tab === 'abastecimento'} title="Abastecimento" value={stats.abastecimentos_hoje} subtitle={`${stats.abastecimentos_pendentes} aguardando autorização`} icon={Fuel} onClick={() => setTab('abastecimento')} />
        <TopCard active={tab === 'km'} title="KM" value={`${numberBr(stats.km_total_hoje)} km`} subtitle={`${stats.km_abertos} veículo(s) em andamento`} icon={Gauge} onClick={() => setTab('km')} />
        <TopCard active={tab === 'fechamento'} title="Fechamento" value={stats.fechamentos_completos} subtitle={`${stats.fechamentos_pendentes} pendente(s) hoje`} icon={CheckCircle2} onClick={() => setTab('fechamento')} />
        <TopCard active={tab === 'rastreamento'} title="Rastreamento" value={veiculosApp} subtitle="veículo(s) vinculados no app" icon={Radar} onClick={() => setTab('rastreamento')} />
      </div>

      {tab === 'rastreamento' ? (
        <RastreamentoMecanicosAdminPanel />
      ) : (
        <>
          <div className="flex items-center gap-4 rounded-xl border border-white/5 bg-[#08080e] px-4 py-2 text-[11px] text-zinc-500"><span><StatusDot ok /> <strong className="text-emerald-400">{stats.online}</strong> online agora</span><span><Users className="mr-1 inline h-3.5 w-3.5" />{stats.mecanicos} mecânicos monitorados</span><span className="ml-auto hidden sm:inline">Atualização automática a cada 15 segundos</span></div>

          {tab === 'abastecimento' && <PendingFuelAuthorizations rows={pendingFuel} acting={acting} decide={decide} />}

          <section className="space-y-4">
            {grouped.map(([empresa, mecanicos]) => (
              <div key={empresa} className="space-y-2.5">
                <div className="flex items-center gap-2 border-b border-fuchsia-500/10 pb-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-fuchsia-500/10 text-fuchsia-400"><Building2 className="h-4 w-4" /></span><h2 className="text-sm font-black uppercase tracking-wide text-white">{empresa}</h2><Badge variant="outline" className="text-[10px]">{mecanicos.length}</Badge><span className="ml-auto text-[10px] text-zinc-600">{mecanicos.filter((m) => m.online).length} online</span></div>
                <div className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">{mecanicos.map((row) => <MechanicCard key={row.id} row={row} tab={tab} onOpen={setSelectedId} />)}</div>
              </div>
            ))}
            {!rows.length && !loading && <div className="rounded-xl border border-dashed p-10 text-center text-zinc-500">Nenhum mecânico encontrado.</div>}
          </section>

          {tab === 'fechamento' && <OperationalClosingReport />}
        </>
      )}

      {selectedId && <AppMecanicoDetailPanel acessoId={selectedId} onClose={() => setSelectedId(null)} onSaved={() => void load()} />}
    </div>
  );
}
