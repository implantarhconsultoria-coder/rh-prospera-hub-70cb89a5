import { useCallback, useEffect, useState } from "react";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Clock, MapPin, Camera, Fuel, ShieldCheck } from "lucide-react";
import { formatarDataHoraBrasil } from "@/lib/brTime";

interface PontoHistorico {
  id: string;
  tipo: string;
  data?: string | null;
  hora?: string | null;
  registro_teste?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  selfie_url?: string | null;
  selfie?: string | null;
}

interface AbastecimentoHistorico {
  id: string;
  placa?: string | null;
  posto_nome?: string | null;
  registro_teste?: boolean;
  combustivel?: string | null;
  litros?: string | number | null;
  valor?: string | number | null;
  valor_por_litro?: string | number | null;
  km_atual?: string | number | null;
  observacao?: string | null;
  empresa?: string | null;
  data?: string | null;
  hora?: string | null;
}

interface HistoricoResult {
  ok?: boolean;
  error?: string;
  pontos?: PontoHistorico[];
  abastecimentos?: AbastecimentoHistorico[];
}

const historicoRpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  almoco_inicio: "Início Almoço",
  almoco_fim: "Retorno Almoço",
  almoco_saida: "Início Almoço",
  almoco_volta: "Retorno Almoço",
};

export default function HistoricoPage() {
  const { mecanico } = useMecanicoApp();
  const [pontos, setPontos] = useState<PontoHistorico[]>([]);
  const [abastecimentos, setAbastecimentos] = useState<AbastecimentoHistorico[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await historicoRpc.rpc("app_mecanico_listar_historico", { p_acesso_id: mecanico.acesso_id });
    const result = data as HistoricoResult | null;
    if (error || !result?.ok) {
      toast.error(result?.error || error?.message || "Erro ao carregar histórico");
      setPontos([]);
      setAbastecimentos([]);
    } else {
      setPontos(result.pontos || []);
      setAbastecimentos(result.abastecimentos || []);
    }
    setLoading(false);
  }, [mecanico.acesso_id]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 px-3 py-2 text-xs text-zinc-400">
        <ShieldCheck className="h-4 w-4 shrink-0 text-fuchsia-400" />
        Histórico somente para consulta. Registros não podem ser editados ou excluídos pelo mecânico.
      </div>

      <Card className="border-fuchsia-500/15 bg-[#07070d] p-4 text-white">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Fuel className="h-4 w-4 text-fuchsia-400" /> Abastecimentos recentes</h2>
        {abastecimentos.length === 0 ? <p className="text-sm text-zinc-500">Nenhum abastecimento.</p> : (
          <ul className="divide-y divide-fuchsia-500/10 text-sm">
            {abastecimentos.map((a) => (
              <li key={a.id} className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{a.placa || "-"} · {a.posto_nome || "Posto"}</span>
                    {a.registro_teste && <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">TESTE</span>}
                    <p className="mt-1 text-xs text-zinc-400">{a.combustivel || "Combustível"} · {Number(a.litros || 0).toFixed(2)} L · R$ {Number(a.valor || 0).toFixed(2)}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-zinc-500">{formatarDataHoraBrasil(a.data, a.hora)}</span>
                </div>
                <div className="text-[11px] text-zinc-500">KM {a.km_atual || "-"} · {a.empresa || ""}</div>
                {a.observacao && <p className="text-[11px] text-zinc-500">{a.observacao}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-fuchsia-500/15 bg-[#07070d] p-4 text-white">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-fuchsia-400" /> Pontos recentes</h2>
        {pontos.length === 0 ? <p className="text-sm text-zinc-500">Nenhum registro.</p> : (
          <ul className="divide-y divide-fuchsia-500/10 text-sm">
            {pontos.map((p) => (
              <li key={p.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{TIPO_LABEL[p.tipo] || p.tipo}</span>
                    {p.registro_teste && <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">TESTE</span>}
                  </div>
                  <span className="whitespace-nowrap text-xs text-zinc-500">{formatarDataHoraBrasil(p.data, p.hora)}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
                  {(p.latitude || p.lat) && (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{(p.latitude ?? p.lat)?.toFixed?.(4)}, {(p.longitude ?? p.lng)?.toFixed?.(4)}</span>
                  )}
                  {(p.selfie_url || p.selfie) && <span className="flex items-center gap-1 text-emerald-400"><Camera className="h-3 w-3" /> selfie</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
