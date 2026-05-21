import { useOutletContext } from "react-router-dom";
import { Construction } from "lucide-react";
import type { MobileAdminHomeData } from "./useMobileAdminHome";

interface Props { moduloKey: string; titulo: string; }

export default function MobileAdminModulo({ moduloKey, titulo }: Props) {
  const { data } = useOutletContext<{ data: MobileAdminHomeData }>();
  const mod = data.modulos?.find((m) => m.modulo === moduloKey);

  if (!mod) {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6 text-center text-amber-200">
        Você não tem acesso ao módulo {titulo}.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-400/15 bg-[rgba(10,17,30,0.6)] p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/80">Módulo</div>
          {mod.escopo_unidade && mod.unidade && (
            <span className="px-2 py-0.5 text-[10px] rounded bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20">
              {mod.unidade}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-white">{titulo}</h1>
        <div className="mt-2 flex gap-2 text-[11px] text-slate-400">
          <span className={mod.pode_criar ? "text-emerald-300" : "text-slate-600"}>criar</span>
          <span>·</span>
          <span className={mod.pode_editar ? "text-emerald-300" : "text-slate-600"}>editar</span>
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-400/10 bg-[rgba(10,17,30,0.4)] p-10 text-center">
        <Construction className="w-10 h-10 text-cyan-400/60 mx-auto mb-3" />
        <p className="text-sm text-slate-400">
          Conteúdo do módulo será integrado às funções específicas do pacote mobile/admin.
        </p>
      </div>
    </div>
  );
}
