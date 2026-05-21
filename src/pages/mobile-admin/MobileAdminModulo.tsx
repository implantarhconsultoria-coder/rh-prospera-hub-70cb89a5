import { useOutletContext } from "react-router-dom";
import { Plus, Pencil, Trash2, CheckCircle2, Eye, Activity, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MobileAdminHomeData } from "./useMobileAdminHome";

interface Props { moduloKey: string; titulo: string; }

interface Perm {
  modulo: string;
  pode_visualizar?: boolean;
  pode_criar?: boolean;
  pode_editar?: boolean;
  pode_excluir?: boolean;
  pode_aprovar?: boolean;
}

export default function MobileAdminModulo({ moduloKey, titulo }: Props) {
  const { data } = useOutletContext<{ data: MobileAdminHomeData }>();
  const mod = data.modulos?.find((m) => m.modulo === moduloKey);
  const perm = (data.permissoes as unknown as Perm[] | undefined)?.find((p) => p.modulo === moduloKey);
  const podeVer = perm?.pode_visualizar ?? !!mod;

  if (!mod || !podeVer) {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-8 text-center">
        <ShieldCheck className="w-10 h-10 text-amber-300/60 mx-auto mb-3" />
        <p className="text-sm text-amber-200">Você não tem acesso ao módulo {titulo}.</p>
      </div>
    );
  }

  const podeCriar = perm?.pode_criar ?? mod.pode_criar;
  const podeEditar = perm?.pode_editar ?? mod.pode_editar;
  const podeExcluir = perm?.pode_excluir ?? false;
  const podeAprovar = perm?.pode_aprovar ?? false;

  return (
    <div className="space-y-5">
      {/* Hero do módulo */}
      <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-[rgba(10,17,30,0.9)] via-[rgba(15,23,42,0.7)] to-[rgba(10,17,30,0.9)] p-6 shadow-[0_0_60px_-20px_rgba(34,211,238,0.4)]">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-gradient-to-br from-cyan-400/15 to-transparent blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-gradient-to-br from-fuchsia-500/15 to-transparent blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/80 font-semibold">Módulo</span>
            {mod.escopo_unidade && mod.unidade ? (
              <span className="px-2 py-0.5 text-[10px] rounded bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-400/30 uppercase tracking-wider font-bold">
                Filial · {mod.unidade}
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] rounded bg-cyan-500/15 text-cyan-200 border border-cyan-400/30 uppercase tracking-wider font-bold">
                Global
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/20 text-[10px] text-emerald-300 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> ATIVO
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{titulo}</h1>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-cyan-300/60" />
            permissões sincronizadas em tempo real via Supabase
          </p>

          <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 gap-2">
            <PermBadge on={podeVer} label="Visualizar" />
            <PermBadge on={podeCriar} label="Criar" />
            <PermBadge on={podeEditar} label="Editar" />
            <PermBadge on={podeExcluir} label="Excluir" />
            <PermBadge on={podeAprovar} label="Aprovar" />
          </div>
        </div>
      </div>

      {/* Ações */}
      {(podeCriar || podeEditar || podeExcluir || podeAprovar) && (
        <div className="rounded-2xl border border-cyan-400/15 bg-[rgba(10,17,30,0.6)] backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <div className="text-[11px] uppercase tracking-[0.25em] text-cyan-300/80 font-semibold">Ações disponíveis</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {podeCriar && (
              <ActionButton tone="emerald" icon={Plus} label="Novo" />
            )}
            {podeEditar && (
              <ActionButton tone="cyan" icon={Pencil} label="Editar" />
            )}
            {podeAprovar && (
              <ActionButton tone="fuchsia" icon={CheckCircle2} label="Aprovar" />
            )}
            {podeExcluir && (
              <ActionButton tone="rose" icon={Trash2} label="Excluir" />
            )}
          </div>
        </div>
      )}

      {/* Escopo */}
      <div className="rounded-2xl border border-cyan-400/10 bg-[rgba(10,17,30,0.4)] backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 text-cyan-300/80 text-[11px] uppercase tracking-[0.25em] mb-4 font-semibold">
          <Eye className="w-3.5 h-3.5" /> Escopo de acesso
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <InfoTile label="Usuário" value={data.usuario?.nome || "—"} />
          <InfoTile label="Unidade base" value={data.usuario?.unidade || "—"} />
          <InfoTile label="Financeiro" value={data.financeiro_global_liberado ? "Global" : "Restrito"} highlight={data.financeiro_global_liberado} />
        </div>
      </div>
    </div>
  );
}

function PermBadge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={
        "px-2 py-1.5 rounded-lg text-center border text-[10px] uppercase tracking-wider font-semibold transition-all " +
        (on
          ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/30 shadow-[0_0_15px_-5px_rgba(52,211,153,0.4)]"
          : "bg-slate-800/30 text-slate-600 border-slate-700/30")
      }
    >
      {label}
    </span>
  );
}

function ActionButton({
  tone, icon: Icon, label,
}: { tone: "emerald" | "cyan" | "fuchsia" | "rose"; icon: React.ComponentType<{ className?: string }>; label: string }) {
  const styles = {
    emerald: "bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-400/30 text-emerald-200 hover:from-emerald-500/30 hover:shadow-[0_0_20px_-5px_rgba(52,211,153,0.5)]",
    cyan:    "bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border-cyan-400/30 text-cyan-200 hover:from-cyan-500/30 hover:shadow-[0_0_20px_-5px_rgba(34,211,238,0.5)]",
    fuchsia: "bg-gradient-to-br from-fuchsia-500/20 to-fuchsia-600/10 border-fuchsia-400/30 text-fuchsia-200 hover:from-fuchsia-500/30 hover:shadow-[0_0_20px_-5px_rgba(232,121,249,0.5)]",
    rose:    "bg-gradient-to-br from-rose-500/20 to-rose-600/10 border-rose-400/30 text-rose-200 hover:from-rose-500/30 hover:shadow-[0_0_20px_-5px_rgba(244,114,182,0.5)]",
  } as const;
  return (
    <Button size="sm" className={`h-11 border ${styles[tone]} font-semibold transition-all`}>
      <Icon className="w-4 h-4 mr-1.5" /> {label}
    </Button>
  );
}

function InfoTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-emerald-400/30 bg-emerald-500/5" : "border-cyan-400/10 bg-black/20"}`}>
      <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold">{label}</div>
      <div className={`text-sm font-semibold mt-1 truncate ${highlight ? "text-emerald-300" : "text-white"}`}>{value}</div>
    </div>
  );
}
