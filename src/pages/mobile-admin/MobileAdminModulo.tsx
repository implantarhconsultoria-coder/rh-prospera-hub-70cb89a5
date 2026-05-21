import { useOutletContext } from "react-router-dom";
import { Plus, Pencil, Trash2, CheckCircle2, Eye } from "lucide-react";
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
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6 text-center text-amber-200">
        Você não tem acesso ao módulo {titulo}.
      </div>
    );
  }

  const podeCriar = perm?.pode_criar ?? mod.pode_criar;
  const podeEditar = perm?.pode_editar ?? mod.pode_editar;
  const podeExcluir = perm?.pode_excluir ?? false;
  const podeAprovar = perm?.pode_aprovar ?? false;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-400/15 bg-[rgba(10,17,30,0.6)] p-6">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/80">Módulo</div>
          {mod.escopo_unidade && mod.unidade && (
            <span className="px-2 py-0.5 text-[10px] rounded bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20">
              Filial: {mod.unidade}
            </span>
          )}
          {!mod.escopo_unidade && (
            <span className="px-2 py-0.5 text-[10px] rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              Global
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-white">{titulo}</h1>
        <p className="text-xs text-slate-400 mt-1">Status: módulo ativo · permissões carregadas do Supabase</p>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
          <Badge on={podeVer} label="Visualizar" />
          <Badge on={podeCriar} label="Criar" />
          <Badge on={podeEditar} label="Editar" />
          <Badge on={podeExcluir} label="Excluir" />
          <Badge on={podeAprovar} label="Aprovar" />
        </div>
      </div>

      {(podeCriar || podeEditar || podeExcluir || podeAprovar) && (
        <div className="rounded-2xl border border-cyan-400/10 bg-[rgba(10,17,30,0.5)] p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80 mb-3">Ações</div>
          <div className="flex flex-wrap gap-2">
            {podeCriar && (
              <Button size="sm" className="bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25">
                <Plus className="w-4 h-4 mr-1" /> Novo
              </Button>
            )}
            {podeEditar && (
              <Button size="sm" variant="outline" className="border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/10">
                <Pencil className="w-4 h-4 mr-1" /> Editar
              </Button>
            )}
            {podeAprovar && (
              <Button size="sm" variant="outline" className="border-fuchsia-400/30 text-fuchsia-200 hover:bg-fuchsia-500/10">
                <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar
              </Button>
            )}
            {podeExcluir && (
              <Button size="sm" variant="outline" className="border-rose-400/30 text-rose-200 hover:bg-rose-500/10">
                <Trash2 className="w-4 h-4 mr-1" /> Excluir
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-cyan-400/10 bg-[rgba(10,17,30,0.4)] p-6">
        <div className="flex items-center gap-2 text-cyan-300/80 text-[11px] uppercase tracking-[0.2em] mb-2">
          <Eye className="w-3.5 h-3.5" /> Escopo
        </div>
        <ul className="text-sm text-slate-300 space-y-1">
          <li>Usuário: <span className="text-white">{data.usuario?.nome}</span></li>
          <li>Unidade base: <span className="text-white">{data.usuario?.unidade}</span></li>
          <li>Financeiro global: <span className="text-white">{data.financeiro_global_liberado ? "liberado" : "restrito"}</span></li>
        </ul>
      </div>
    </div>
  );
}

function Badge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={
        "px-2 py-1 rounded text-center border " +
        (on
          ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/30"
          : "bg-slate-500/5 text-slate-600 border-slate-500/10")
      }
    >
      {label}
    </span>
  );
}
