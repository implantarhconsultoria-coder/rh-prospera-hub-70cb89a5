import { Link, useOutletContext } from "react-router-dom";
import {
  Users, Receipt, Banknote, Fuel, Folder, Settings, ChevronRight, ShieldCheck,
} from "lucide-react";
import type { MobileAdminHomeData, MobileAdminModulo } from "./useMobileAdminHome";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  users: Users, receipt: Receipt, banknote: Banknote, fuel: Fuel, folder: Folder, settings: Settings,
};

export default function MobileAdminHome() {
  const { data } = useOutletContext<{ data: MobileAdminHomeData }>();
  const modulos = data.modulos || [];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-400/15 bg-[rgba(10,17,30,0.6)] p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400/20 to-fuchsia-500/20 border border-cyan-400/30 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">Bem-vindo</div>
            <div className="text-lg font-semibold text-white truncate">{data.usuario?.nome}</div>
            <div className="text-xs text-slate-400 truncate">
              {data.usuario?.email} · {data.usuario?.unidade}
              {data.financeiro_global_liberado && " · visão financeira global"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {modulos.map((m: MobileAdminModulo) => {
          const Icon = ICONS[m.icone] || Folder;
          return (
            <Link
              key={m.modulo}
              to={m.rota}
              className="group relative rounded-xl border border-cyan-400/10 bg-[rgba(10,17,30,0.6)] p-4 hover:border-cyan-400/30 hover:bg-[rgba(10,17,30,0.85)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-400/5 border border-cyan-400/15 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-cyan-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white">{m.titulo}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    {m.escopo_unidade && m.unidade && (
                      <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20">
                        {m.unidade}
                      </span>
                    )}
                    {m.pode_editar && <span className="text-emerald-400">edição</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-300" />
              </div>
            </Link>
          );
        })}
      </div>

      {modulos.length === 0 && (
        <p className="text-center text-sm text-slate-500 py-8">
          Nenhum módulo liberado para você.
        </p>
      )}
    </div>
  );
}
