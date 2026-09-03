import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarDays,
  Car,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FolderOpen,
  Fuel,
  Gauge,
  LogIn,
  LogOut,
  UsersRound,
  Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMecanicoApp } from "../MecanicoAppContext";

const TZ = "America/Sao_Paulo";
const todayLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || "Mecânico";
const money = (value: unknown) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
const pointTime = (row: any) => String(row?.hora || "—").slice(0, 5);
const dateTimeMs = (row: any) => {
  const raw = row?.data_hora_brasilia || row?.created_at || (row?.data && row?.hora ? `${row.data}T${row.hora}` : "");
  const value = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
};

interface DashboardResumo {
  ok?: boolean;
  funcionarios_ativos?: number;
  assinaturas_concluidas?: number;
  filiais_ativas?: number;
  pendencias?: number;
  competencia?: string;
  km_hoje?: number;
  veiculo_placa?: string;
  veiculo_descricao?: string;
  ultimo_abastecimento_data?: string | null;
  ultimo_abastecimento_valor?: number | null;
}

interface HistoricoResumo {
  ok?: boolean;
  pontos?: any[];
  abastecimentos?: any[];
  chamados?: any[];
}

function MetricCard({ icon: Icon, label, value, footer, onClick }: { icon: ElementType; label: string; value: React.ReactNode; footer: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="grid h-9 w-9 place-items-center rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-400 sm:h-11 sm:w-11">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
      <span className="mt-2 block min-h-[24px] text-[8px] font-medium uppercase leading-tight text-zinc-400 sm:text-[10px]">{label}</span>
      <strong className="mt-1 block text-lg font-black leading-none text-amber-400 sm:text-2xl">{value}</strong>
      <span className="mt-auto flex items-center justify-center gap-0.5 pt-2 text-[8px] font-semibold text-fuchsia-400 sm:text-[10px]">{footer}<ChevronRight className="h-3 w-3" /></span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="flex min-h-[116px] flex-col rounded-xl border border-fuchsia-500/20 bg-[#07070d] p-2.5 text-left shadow-[inset_0_0_25px_rgba(168,85,247,0.025)] active:scale-[.98] sm:min-h-[135px] sm:p-3">{body}</button>
  ) : (
    <div className="flex min-h-[116px] flex-col rounded-xl border border-fuchsia-500/20 bg-[#07070d] p-2.5 shadow-[inset_0_0_25px_rgba(168,85,247,0.025)] sm:min-h-[135px] sm:p-3">{body}</div>
  );
}

function ActionCard({ icon: Icon, title, subtitle, disabled, onClick, badge, greenBadge }: { icon: ElementType; title: string; subtitle: string; disabled?: boolean; onClick: () => void; badge?: string; greenBadge?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid min-h-[104px] grid-cols-[42px_1fr_14px] items-center gap-2 rounded-xl border border-fuchsia-500/20 bg-[#07070d] p-2.5 text-left text-white transition active:scale-[.985] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[118px] sm:grid-cols-[56px_1fr_18px] sm:p-4"
    >
      <span className="grid h-11 w-11 place-items-center text-fuchsia-400 sm:h-14 sm:w-14">
        <Icon className="h-8 w-8 stroke-[1.45] sm:h-10 sm:w-10" />
      </span>
      <span className="min-w-0">
        <strong className="block text-[12px] font-bold leading-tight sm:text-[15px]">{title}</strong>
        <span className="mt-1 block text-[9px] leading-snug text-zinc-400 sm:text-[11px]">{subtitle}</span>
        {(badge || greenBadge) && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {badge && <em className="rounded-md bg-fuchsia-500/15 px-1.5 py-0.5 text-[7px] not-italic text-fuchsia-300 sm:text-[8px]">{badge}</em>}
            {greenBadge && <em className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[7px] not-italic text-emerald-400 sm:text-[8px]">{greenBadge}</em>}
          </span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 text-zinc-500" />
    </button>
  );
}

function SummaryItem({ icon: Icon, label, value, danger = false }: { icon: ElementType; label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="grid min-h-[55px] grid-cols-[31px_1fr] items-center gap-2 sm:grid-cols-[38px_1fr]">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-fuchsia-500/10 text-fuchsia-400 sm:h-9 sm:w-9"><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></span>
      <span className="min-w-0">
        <small className="block text-[9px] text-zinc-400 sm:text-[11px]">{label}</small>
        <strong className={`mt-0.5 block truncate text-[12px] font-extrabold sm:text-[14px] ${danger ? "text-red-500" : "text-amber-400"}`}>{value}</strong>
      </span>
    </div>
  );
}

export default function HomePage() {
  const { mecanico } = useMecanicoApp();
  const navigate = useNavigate();
  const base = `/app-mecanico/${mecanico.acesso_id}`;
  const [resumo, setResumo] = useState<DashboardResumo>({});
  const [historico, setHistorico] = useState<HistoricoResumo>({ pontos: [], abastecimentos: [], chamados: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const carregar = async () => {
      setLoading(true);
      try {
        const [dashboardResult, historyResult] = await Promise.all([
          (supabase as any).rpc("app_mecanico_dashboard_resumo", { p_acesso_id: mecanico.acesso_id }),
          (supabase as any).rpc("app_mecanico_listar_historico", { p_acesso_id: mecanico.acesso_id }),
        ]);
        if (!active) return;
        if (!dashboardResult.error && dashboardResult.data?.ok) setResumo(dashboardResult.data as DashboardResumo);
        if (!historyResult.error && historyResult.data?.ok) setHistorico(historyResult.data as HistoricoResumo);
      } catch (error) {
        console.error("Falha ao carregar home do app mecânico:", error);
      } finally {
        if (active) setLoading(false);
      }
    };
    void carregar();
    return () => { active = false; };
  }, [mecanico.acesso_id]);

  const firstName = primeiroNome(mecanico.nome);
  const initials = mecanico.nome.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "MC";
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()).replace(/\D/g, "")) % 24;
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const dateLabelRaw = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  const dateLabel = dateLabelRaw.charAt(0).toUpperCase() + dateLabelRaw.slice(1);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date());
  const weekend = weekday === "Sat" || weekday === "Sun";

  const points = useMemo(() => Array.isArray(historico.pontos) ? historico.pontos : [], [historico.pontos]);
  const abastecimentos = useMemo(() => Array.isArray(historico.abastecimentos) ? historico.abastecimentos : [], [historico.abastecimentos]);
  const chamados = useMemo(() => Array.isArray(historico.chamados) ? historico.chamados : [], [historico.chamados]);
  const hoje = todayLocal();
  const pontosHoje = points.filter((row) => String(row?.data || "").slice(0, 10) === hoje);
  const entrada = pontosHoje.find((row) => String(row?.tipo || "").toLowerCase() === "entrada");
  const saida = pontosHoje.find((row) => String(row?.tipo || "").toLowerCase() === "saida");
  const almocoInicio = pontosHoje.find((row) => String(row?.tipo || "").toLowerCase() === "almoco_inicio");
  const almocoFim = pontosHoje.find((row) => String(row?.tipo || "").toLowerCase() === "almoco_fim");
  const hasEntry = Boolean(entrada);
  const hasExit = Boolean(saida);

  const workLabel = useMemo(() => {
    if (!entrada) return "Não iniciada";
    const start = dateTimeMs(entrada);
    const end = saida ? dateTimeMs(saida) : Date.now();
    if (!start || end < start) return pointTime(entrada);
    let minutes = Math.round((end - start) / 60000);
    if (almocoInicio && almocoFim) minutes -= Math.max(0, Math.round((dateTimeMs(almocoFim) - dateTimeMs(almocoInicio)) / 60000));
    minutes = Math.max(0, minutes);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}h ${String(minutes % 60).padStart(2, "0")}m`;
  }, [entrada, saida, almocoInicio, almocoFim]);

  const lastFuel = abastecimentos[0];
  const vehicleLabel = [resumo.veiculo_descricao, resumo.veiculo_placa || lastFuel?.placa].filter(Boolean).join(" ") || "Sem veículo registrado";
  const pending = Number(resumo.pendencias || 0);
  const metricValue = (value: unknown) => loading && value === undefined ? "…" : Number(value || 0);

  const recent = useMemo(() => {
    const items = [
      ...chamados.slice(0, 8).map((row) => ({
        at: row.created_at,
        kind: "maintenance",
        title: row.titulo || row.assunto || "Ordem de Serviço",
        sub: row.descricao || row.observacao || "Chamado operacional",
        meta: row.status || "Aberto",
        metaClass: String(row.status || "").toLowerCase().includes("concl") ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-300",
      })),
      ...abastecimentos.slice(0, 8).map((row) => ({
        at: row.created_at || `${row.data}T${row.hora || "00:00"}`,
        kind: "fuel",
        title: "Abastecimento",
        sub: `${Number(row.litros || 0).toLocaleString("pt-BR")} L • ${row.combustivel || "Combustível"}`,
        meta: money(row.valor),
        metaClass: "text-amber-400",
      })),
      ...points.slice(0, 10).map((row) => ({
        at: row.created_at || row.data_hora_brasilia || `${row.data}T${row.hora || "00:00"}`,
        kind: "point",
        title: String(row.tipo || "Ponto").replace("almoco_inicio", "Início do almoço").replace("almoco_fim", "Retorno do almoço").replace(/^./, (c: string) => c.toUpperCase()),
        sub: "Registro de ponto",
        meta: pointTime(row),
        metaClass: "text-zinc-300",
      })),
    ];
    return items.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()).slice(0, 4);
  }, [chamados, abastecimentos, points]);

  const when = (raw?: string) => {
    if (!raw) return "—";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "—";
    const day = date.toLocaleDateString("en-CA", { timeZone: TZ });
    const time = date.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    if (day === hoje) return `Hoje, ${time}`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (day === yesterday.toLocaleDateString("en-CA", { timeZone: TZ })) return `Ontem, ${time}`;
    return `${date.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" })}, ${time}`;
  };

  const RecentIcon = ({ kind }: { kind: string }) => kind === "fuel" ? <Fuel className="h-4 w-4" /> : kind === "maintenance" ? <Wrench className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />;

  return (
    <div className="space-y-4 pb-2">
      <header className="flex items-center justify-between gap-3 px-0.5 pt-1">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-black tracking-tight text-white sm:text-3xl">{greeting}, <span className="text-amber-400">{firstName}</span></h1>
          <p className="mt-1.5 text-[12px] capitalize text-zinc-400 sm:text-sm">{dateLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="relative grid h-11 w-11 place-items-center rounded-full border border-fuchsia-500/20 bg-[#08080e] text-zinc-200">
            <Bell className="h-5 w-5" /><i className="absolute right-1 top-1 h-2 w-2 rounded-full bg-fuchsia-500 shadow-[0_0_10px_#a855f7]" />
          </span>
          <span className="grid h-11 w-11 place-items-center rounded-full border border-fuchsia-500/60 bg-[#09070d] text-[13px] font-bold text-white">{initials}</span>
        </div>
      </header>

      <section className="grid grid-cols-4 gap-1.5 sm:gap-2">
        <MetricCard icon={UsersRound} label="Funcionários ativos" value={metricValue(resumo.funcionarios_ativos)} footer="Ver equipe" />
        <MetricCard icon={FileCheck2} label="Assinaturas concluídas" value={metricValue(resumo.assinaturas_concluidas)} footer="Este mês" />
        <MetricCard icon={Building2} label="Filiais ativas" value={metricValue(resumo.filiais_ativas)} footer="Ver filiais" />
        <MetricCard icon={FolderOpen} label="Pendências" value={pending} footer="Ver pendências" onClick={() => navigate(`${base}/chamados`)} />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-white sm:text-base"><Wrench className="h-4 w-4 text-amber-400" /> APP MECÂNICO</h2>
          <span className="text-[9px] font-semibold text-fuchsia-400 sm:text-[11px]">Operação</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ActionCard icon={LogIn} title="Entrada de Ponto" subtitle={hasEntry ? "Entrada já registrada" : "Registre o início da jornada de trabalho"} disabled={hasEntry} onClick={() => navigate(`${base}/ponto?tipo=entrada`)} />
          <ActionCard icon={LogOut} title="Saída de Ponto" subtitle={hasExit ? "Saída já registrada" : "Registre o fim da jornada de trabalho"} disabled={!hasEntry || hasExit || (Boolean(almocoInicio) && !almocoFim)} onClick={() => navigate(`${base}/ponto?tipo=saida`)} />
          <ActionCard icon={Gauge} title="Ponto do Carro / KM" subtitle="Registre hodômetro e localização" onClick={() => navigate(`${base}/veiculo`)} />
          <ActionCard icon={Fuel} title="Solicitação de Abastecimento" subtitle="Solicite combustível de forma controlada" onClick={() => navigate(`${base}/abastecimento`)} />
          <ActionCard icon={Wrench} title="Manutenção" subtitle="Abra e acompanhe ordens de serviço" onClick={() => navigate(`${base}/chamados`)} />
          <ActionCard icon={CalendarDays} title="Plantão" subtitle={weekend ? "Disponível para registro" : "Somente fim de semana"} badge="Somente fim de semana" greenBadge="Conta como extra" disabled={!weekend || hasEntry} onClick={() => navigate(`${base}/ponto?tipo=entrada&origem=plantao`)} />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-fuchsia-500/20 bg-[#07070d]">
        <div className="flex items-center justify-between border-b border-fuchsia-500/10 px-3 py-2.5">
          <h2 className="flex items-center gap-2 text-[12px] font-extrabold text-white sm:text-sm"><ClipboardCheck className="h-4 w-4 text-fuchsia-400" /> RESUMO DO DIA</h2>
          <span className="text-[8px] text-zinc-500 sm:text-[9px]">Dados atuais</span>
        </div>
        <div className="grid grid-cols-2 px-2 py-1">
          <div className="border-r border-fuchsia-500/10 pr-2">
            <SummaryItem icon={Clock3} label="Jornada de hoje" value={workLabel} />
            <SummaryItem icon={Car} label="Veículo atual" value={vehicleLabel} />
            <SummaryItem icon={Clock3} label="Última entrada" value={entrada ? pointTime(entrada) : "—"} />
          </div>
          <div className="pl-2">
            <SummaryItem icon={Gauge} label="KM registrado hoje" value={`${Number(resumo.km_hoje || 0).toLocaleString("pt-BR")} km`} />
            <SummaryItem icon={Fuel} label="Último abastecimento" value={resumo.ultimo_abastecimento_data ? `${shortDate(resumo.ultimo_abastecimento_data)} • ${money(resumo.ultimo_abastecimento_valor)}` : "—"} />
            <SummaryItem icon={AlertTriangle} label="Pendências operacionais" value={`${pending} ${pending === 1 ? "item" : "itens"}`} danger={pending > 0} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-fuchsia-500/20 bg-[#07070d]">
        <div className="flex items-center justify-between border-b border-fuchsia-500/10 px-3 py-2.5">
          <h2 className="flex items-center gap-2 text-[12px] font-extrabold text-white sm:text-sm"><FileCheck2 className="h-4 w-4 text-fuchsia-400" /> ÚLTIMOS REGISTROS</h2>
          <button onClick={() => navigate(`${base}/historico`)} className="flex items-center gap-0.5 text-[8px] font-semibold text-fuchsia-400 sm:text-[10px]">Ver histórico completo <ChevronRight className="h-3 w-3" /></button>
        </div>
        <div className="space-y-1.5 p-2">
          {recent.length ? recent.map((row, index) => (
            <button key={`${row.at}-${index}`} onClick={() => navigate(`${base}/historico`)} className="grid w-full grid-cols-[32px_1fr_auto_56px_12px] items-center gap-1.5 rounded-lg border border-fuchsia-500/10 bg-[#05050a] px-2 py-2 text-left sm:grid-cols-[38px_1fr_auto_76px_14px] sm:gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-fuchsia-500/10 text-fuchsia-400 sm:h-9 sm:w-9"><RecentIcon kind={row.kind} /></span>
              <span className="min-w-0"><strong className="block truncate text-[10px] text-white sm:text-[12px]">{row.title}</strong><small className="mt-0.5 block truncate text-[8px] text-zinc-500 sm:text-[9px]">{row.sub}</small></span>
              <strong className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[8px] font-bold sm:text-[9px] ${row.metaClass}`}>{row.meta}</strong>
              <time className="text-right text-[7px] text-zinc-500 sm:text-[8px]">{when(row.at)}</time>
              <ChevronRight className="h-3 w-3 text-zinc-600" />
            </button>
          )) : <p className="px-3 py-5 text-center text-[11px] text-zinc-500">Nenhum registro encontrado.</p>}
        </div>
      </section>
    </div>
  );
}
