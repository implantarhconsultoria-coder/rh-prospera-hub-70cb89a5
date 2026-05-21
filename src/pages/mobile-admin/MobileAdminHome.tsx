import { Link, useOutletContext } from "react-router-dom";
import {
  Users, Receipt, Banknote, Fuel, Folder, Settings, ChevronRight, ShieldCheck,
  TrendingUp, Layers, Zap,
} from "lucide-react";
import type { MobileAdminHomeData, MobileAdminModulo } from "./useMobileAdminHome";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  users: Users, receipt: Receipt, banknote: Banknote, fuel: Fuel, folder: Folder, settings: Settings,
};

// Tema por módulo — cada um com glow exclusivo
const THEMES: Record<string, { from: string; to: string; ring: string; text: string; shadow: string }> = {
  rh:           { from: "from-cyan-500/25",    to: "to-blue-600/15",    ring: "border-cyan-400/30",    text: "text-cyan-200",    shadow: "shadow-[0_0_30px_-10px_rgba(34,211,238,0.5)]" },
  faturamento:  { from: "from-emerald-500/25", to: "to-teal-600/15",    ring: "border-emerald-400/30", text: "text-emerald-200", shadow: "shadow-[0_0_30px_-10px_rgba(52,211,153,0.5)]" },
  financeiro:   { from: "from-amber-500/25",   to: "to-orange-600/15",  ring: "border-amber-400/30",   text: "text-amber-200",   shadow: "shadow-[0_0_30px_-10px_rgba(251,191,36,0.5)]" },
  abastecimento:{ from: "from-rose-500/25",    to: "to-red-600/15",     ring: "border-rose-400/30",    text: "text-rose-200",    shadow: "shadow-[0_0_30px_-10px_rgba(244,114,182,0.5)]" },
  documentos_rh:{ from: "from-violet-500/25",  to: "to-fuchsia-600/15", ring: "border-violet-400/30",  text: "text-violet-200",  shadow: "shadow-[0_0_30px_-10px_rgba(167,139,250,0.5)]" },
  config:       { from: "from-slate-500/25",   to: "to-slate-700/15",   ring: "border-slate-400/30",   text: "text-slate-200",   shadow: "shadow-[0_0_30px_-10px_rgba(148,163,184,0.4)]" },
};

const FALLBACK_THEME = THEMES.rh;

export default function MobileAdminHome() {
  const { data } = useOutletContext<{ data: MobileAdminHomeData }>();
  const modulos = data.modulos || [];
  const u = data.usuario;
  const initials = (u?.nome || u?.email || "?").trim().slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Hero card — premium glass */}
      <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-[rgba(10,17,30,0.9)] via-[rgba(15,23,42,0.7)] to-[rgba(10,17,30,0.9)] p-6 shadow-[0_0_80px_-20px_rgba(124,58,237,0.4)]">
        {/* Decorative blobs */}
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-gradient-to-br from-fuchsia-500/20 to-transparent blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-gradient-to-br from-cyan-400/20 to-transparent blur-3xl" />

        <div className="relative flex items-start gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 via-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-lg shadow-[0_0_25px_-5px_rgba(124,58,237,0.6)]">
              {initials}
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#0a0f1d] shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/80 font-semibold">Bem-vindo</span>
              {u?.is_admin && (
                <span className="px-1.5 py-0.5 text-[9px] rounded bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-400/30 uppercase tracking-wider font-bold">
                  Admin
                </span>
              )}
            </div>
            <div className="text-xl font-bold text-white truncate">{u?.nome}</div>
            <div className="text-xs text-slate-400 truncate mt-0.5">{u?.email}</div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="relative grid grid-cols-3 gap-2 mt-5 pt-5 border-t border-cyan-400/10">
          <Kpi icon={Layers}      label="Módulos"   value={String(modulos.length)} tone="cyan" />
          <Kpi icon={ShieldCheck} label="Unidade"   value={u?.unidade || "—"}      tone="violet" />
          <Kpi icon={TrendingUp}  label="Financeiro" value={data.financeiro_global_liberado ? "Global" : "Local"} tone="emerald" />
        </div>
      </div>

      {/* Section title */}
      <div className="flex items-center gap-2 px-1">
        <Zap className="w-4 h-4 text-cyan-300" />
        <h2 className="text-[11px] uppercase tracking-[0.25em] text-cyan-300/80 font-semibold">
          Módulos liberados
        </h2>
        <div className="flex-1 h-px bg-gradient-to-r from-cyan-400/20 to-transparent" />
      </div>

      {/* Modules grid — premium tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {modulos.map((m: MobileAdminModulo) => {
          const Icon = ICONS[m.icone] || Folder;
          const t = THEMES[m.modulo] || FALLBACK_THEME;
          return (
            <Link
              key={m.modulo}
              to={m.rota}
              className={`group relative overflow-hidden rounded-2xl border ${t.ring} bg-gradient-to-br ${t.from} ${t.to} backdrop-blur-sm p-4 transition-all hover:scale-[1.02] hover:${t.shadow} hover:border-opacity-60`}
            >
              {/* Shimmer */}
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent group-hover:translate-x-full transition-transform duration-1000" />

              <div className="relative flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl bg-black/30 border ${t.ring} flex items-center justify-center ${t.shadow}`}>
                  <Icon className={`w-6 h-6 ${t.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{m.titulo}</div>
                  <div className="text-[10px] text-slate-300/70 flex items-center gap-1.5 mt-1 flex-wrap">
                    {m.escopo_unidade && m.unidade ? (
                      <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-400/30 uppercase tracking-wider font-bold">
                        {m.unidade}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-200 border border-cyan-400/30 uppercase tracking-wider font-bold">
                        Global
                      </span>
                    )}
                    {m.pode_editar && <span className="text-emerald-300/80">· edição</span>}
                    {m.pode_criar && <span className="text-cyan-300/80">· criar</span>}
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 ${t.text} opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all`} />
              </div>
            </Link>
          );
        })}
      </div>

      {modulos.length === 0 && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-8 text-center">
          <ShieldCheck className="w-10 h-10 text-amber-300/60 mx-auto mb-3" />
          <p className="text-sm text-amber-200">Nenhum módulo liberado para você.</p>
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, tone,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone: "cyan" | "violet" | "emerald" }) {
  const tones = {
    cyan: "text-cyan-300 bg-cyan-500/10 border-cyan-400/20",
    violet: "text-violet-300 bg-violet-500/10 border-violet-400/20",
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-400/20",
  } as const;
  return (
    <div className="flex flex-col items-start gap-1">
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border ${tones[tone]}`}>
        <Icon className="w-3 h-3" />
        <span className="text-[9px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="text-sm font-bold text-white truncate w-full pl-1">{value}</div>
    </div>
  );
}
