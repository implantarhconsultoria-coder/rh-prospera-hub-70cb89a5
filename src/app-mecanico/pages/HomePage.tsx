import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Car,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Fuel,
  Gauge,
  LogIn,
  LogOut,
  UtensilsCrossed,
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
  pendencias?: number;
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

function ActionCard({ icon: Icon, title, subtitle, disabled, onClick, badge, greenBadge, accent = "purple" }: { icon: ElementType; title: string; subtitle: string; disabled?: boolean; onClick: () => void; badge?: string; greenBadge?: string; accent?: "purple" | "amber" }) {
  const amber = accent === "amber";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative min-h-[128px] overflow-hidden rounded-[22px] border p-3.5 text-left text-white shadow-[0_14px_34px_rgba(0,0,0,.32)] transition duration-150 active:scale-[.975] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[138px] sm:p-4 ${
        amber
          ? "border-amber-400/30 bg-[linear-gradient(145deg,rgba(38,27,8,.96),rgba(10,9,12,.98)_58%,rgba(31,16,45,.88))]"
          : "border-fuchsia-500/25 bg-[linear-gradient(145deg,rgba(24,12,34,.98),rgba(8,8,14,.98)_60%,rgba(15,10,23,.98))]"
      }`}
    >
      <span className={`pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-3xl ${amber ? "bg-amber-400/10" : "bg-fuchsia-500/10"}`} />
      <span className={`absolute inset-x-5 top-0 h-px ${amber ? "bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" : "bg-gradient-to-r from-transparent via-fuchsia-400/60 to-transparent"}`} />
      <span className="relative flex h-full flex-col">
        <span className="flex items-start justify-between gap-2">
          <span className={`grid h-12 w-12 place-items-center rounded-[17px] border shadow-inner sm:h-14 sm:w-14 ${
            amber
              ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
              : "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-300"
          }`}>
            <Icon className="h-7 w-7 stroke-[1.7]" />
          </span>
          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/5 bg-white/[.035] text-zinc-500 transition group-active:text-white">
            <ChevronRight className="h-4 w-4" />
          </span>
        </span>
        <span className="mt-4 min-w-0">
          <strong className="block text-[13px] font-black leading-[1.12] tracking-[-.01em] sm:text-[15px]">{title}</strong>
          <span className="mt-1.5 block text-[9px] leading-snug text-zinc-400 sm:text-[10px]">{subtitle}</span>
          {(badge || greenBadge) && (
            <span className="mt-2 flex flex-wrap gap-1">
              {badge && <em className="rounded-full border border-fuchsia-400/15 bg-fuchsia-500/10 px-2 py-1 text-[7px] font-bold not-italic text-fuchsia-200 sm:text-[8px]">{badge}</em>}
              {greenBadge && <em className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-2 py-1 text-[7px] font-bold not-italic text-emerald-300 sm:text-[8px]">{greenBadge}</em>}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function SummaryItem({ icon: Icon, label, value, danger = false }: { icon: ElementType; label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="relative min-h-[88px] overflow-hidden rounded-[18px] border border-white/[.055] bg-[linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012))] p-3">
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] border border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0">
          <small className="block text-[8px] font-semibold uppercase tracking-[.08em] text-zinc-500 sm:text-[9px]">{label}</small>
          <strong className={`mt-1 block break-words text-[12px] font-black leading-tight sm:text-[14px] ${danger ? "text-red-400" : "text-amber-300"}`}>{value}</strong>
        </span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { mecanico } = useMecanicoApp();
  const navigate = useNavigate();
  const base = `/app-mecanico/${mecanico.acesso_id}`;
  const [resumo, setResumo] = useState<DashboardResumo>({});
  const [historico, setHistorico] = useState<HistoricoResumo>({ pontos: [], abastecimentos: [], chamados: [] });

  useEffect(() => {
    let active = true;
    const carregar = async () => {
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

  const recent = useMemo(() => {
    const items = [
      ...chamados.slice(0, 8).map((row) => ({
        at: row.created_at,
        kind: "maintenance",
        title: row.titulo || row.assunto || "Ocorrência",
        sub: row.descricao || row.observacao || "Ocorrência operacional",
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
    <div className="space-y-5 pb-2 pt-[env(safe-area-inset-top)]">
      <header className="relative flex items-center justify-between gap-3 overflow-hidden rounded-[24px] border border-fuchsia-500/15 bg-[linear-gradient(135deg,rgba(20,11,29,.94),rgba(6,6,11,.92))] px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,.28)]">
        <div className="min-w-0">
          <p className="mb-1 text-[8px] font-black uppercase tracking-[.22em] text-fuchsia-400">TOPAC • OPERAÇÃO</p>
          <h1 className="truncate text-[27px] font-black tracking-[-.03em] text-white sm:text-3xl">{greeting}, <span className="text-amber-300">{firstName}</span></h1>
          <p className="mt-1.5 text-[11px] capitalize text-zinc-400 sm:text-sm">{dateLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="relative grid h-11 w-11 place-items-center rounded-[15px] border border-white/10 bg-white/[.035] text-zinc-200">
            <Bell className="h-5 w-5" /><i className="absolute right-1 top-1 h-2 w-2 rounded-full bg-fuchsia-500 shadow-[0_0_10px_#a855f7]" />
          </span>
          <span className="grid h-11 w-11 place-items-center rounded-[15px] border border-fuchsia-400/35 bg-fuchsia-500/10 text-[13px] font-black text-white shadow-[0_0_24px_rgba(168,85,247,.12)]">{initials}</span>
        </div>
      </header>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-white sm:text-base"><Wrench className="h-4 w-4 text-amber-400" /> APP MECÂNICO</h2>
          <span className="text-[9px] font-semibold text-fuchsia-400 sm:text-[11px]">Operação</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <ActionCard icon={LogIn} title="Entrada de Ponto" subtitle={hasEntry ? `Entrada às ${pointTime(entrada)}` : "Registre o início da jornada"} disabled={hasEntry} onClick={() => navigate(`${base}/ponto?tipo=entrada`)} />
          <ActionCard icon={UtensilsCrossed} title="Início do Almoço" subtitle={almocoInicio ? `Iniciado às ${pointTime(almocoInicio)}` : "Registre a saída para o intervalo"} disabled={!hasEntry || hasExit || Boolean(almocoInicio)} onClick={() => navigate(`${base}/ponto?tipo=almoco_inicio`)} />
          <ActionCard icon={Clock3} title="Fim do Almoço" subtitle={almocoFim ? `Retorno às ${pointTime(almocoFim)}` : almocoInicio ? "Registre o retorno do intervalo" : "Disponível após iniciar o almoço"} disabled={!almocoInicio || Boolean(almocoFim) || hasExit} onClick={() => navigate(`${base}/ponto?tipo=almoco_fim`)} />
          <ActionCard
            icon={LogOut}
            title="Saída de Ponto"
            subtitle={hasExit ? `Saída às ${pointTime(saida)}` : (!weekend && (!almocoInicio || !almocoFim)) ? "Disponível após concluir o almoço" : "Registre o fim da jornada"}
            disabled={!hasEntry || hasExit || (!weekend && (!almocoInicio || !almocoFim)) || (Boolean(almocoInicio) && !almocoFim)}
            onClick={() => navigate(`${base}/ponto?tipo=saida`)}
          />
          <ActionCard icon={Gauge} title="Ponto do Carro / KM" subtitle="Registre hodômetro e localização" onClick={() => navigate(`${base}/veiculo`)} />
          <ActionCard icon={Fuel} title="Solicitação de Abastecimento" subtitle="Solicite combustível de forma controlada" accent="amber" onClick={() => navigate(`${base}/abastecimento`)} />
          <ActionCard icon={Wrench} title="Ocorrências" subtitle="Receba, aceite e acompanhe ocorrências dos compressores" onClick={() => navigate(`${base}/chamados`)} />
          <ActionCard icon={CalendarDays} title="Plantão" subtitle={weekend ? "Disponível para registro" : "Somente fim de semana"} badge="Somente fim de semana" greenBadge="Conta como extra" accent="amber" disabled={!weekend || hasEntry} onClick={() => navigate(`${base}/ponto?tipo=entrada&origem=plantao`)} />
        </div>
      </section>

      <section className="overflow-hidden rounded-[22px] border border-fuchsia-500/20 bg-[#07070d] shadow-[0_16px_38px_rgba(0,0,0,.26)]">
        <div className="flex items-center justify-between border-b border-white/[.05] px-3.5 py-3">
          <h2 className="flex items-center gap-2 text-[12px] font-black text-white sm:text-sm"><ClipboardCheck className="h-4 w-4 text-fuchsia-300" /> RESUMO DO DIA</h2>
          <span className="rounded-full border border-white/[.06] bg-white/[.025] px-2 py-1 text-[8px] font-semibold text-zinc-500 sm:text-[9px]">Dados atuais</span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-2.5">
          <SummaryItem icon={Clock3} label="Jornada de hoje" value={workLabel} />
          <SummaryItem icon={Gauge} label="KM registrado hoje" value={`${Number(resumo.km_hoje || 0).toLocaleString("pt-BR")} km`} />
          <SummaryItem icon={Car} label="Veículo atual" value={vehicleLabel} />
          <SummaryItem icon={Fuel} label="Último abastecimento" value={resumo.ultimo_abastecimento_data ? `${shortDate(resumo.ultimo_abastecimento_data)} • ${money(resumo.ultimo_abastecimento_valor)}` : "—"} />
          <SummaryItem icon={Clock3} label="Última entrada" value={entrada ? pointTime(entrada) : "—"} />
          <SummaryItem icon={AlertTriangle} label="Pendências operacionais" value={`${pending} ${pending === 1 ? "item" : "itens"}`} danger={pending > 0} />
        </div>
      </section>

      <section className="overflow-hidden rounded-[22px] border border-fuchsia-500/20 bg-[#07070d] shadow-[0_16px_38px_rgba(0,0,0,.24)]">
        <div className="flex items-center justify-between border-b border-fuchsia-500/10 px-3 py-2.5">
          <h2 className="flex items-center gap-2 text-[12px] font-extrabold text-white sm:text-sm"><FileCheck2 className="h-4 w-4 text-fuchsia-400" /> ÚLTIMOS REGISTROS</h2>
          <button onClick={() => navigate(`${base}/historico`)} className="flex items-center gap-0.5 text-[8px] font-semibold text-fuchsia-400 sm:text-[10px]">Ver histórico completo <ChevronRight className="h-3 w-3" /></button>
        </div>
        <div className="space-y-1.5 p-2">
          {recent.length ? recent.map((row, index) => (
            <button key={`${row.at}-${index}`} onClick={() => navigate(`${base}/historico`)} className="grid w-full grid-cols-[36px_1fr_auto_58px_12px] items-center gap-2 rounded-[15px] border border-white/[.055] bg-[linear-gradient(135deg,rgba(255,255,255,.028),rgba(255,255,255,.01))] px-2.5 py-2.5 text-left transition active:scale-[.99] sm:grid-cols-[40px_1fr_auto_76px_14px]">
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
