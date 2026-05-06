import { useEffect, useState } from "react";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, Fuel, Clock } from "lucide-react";

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  almoco_inicio: "Início Almoço",
  almoco_fim: "Retorno Almoço",
};

export default function HistoricoPage() {
  const { mecanico } = useMecanicoApp();
  const [pontos, setPontos] = useState<any[]>([]);
  const [abast, setAbast] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("app_mecanico_listar_historico" as any, { p_acesso_id: mecanico.acesso_id });
      const d = data as any;
      setPontos(d?.pontos || []);
      setAbast(d?.abastecimentos || []);
      setLoading(false);
    })();
  }, [mecanico.acesso_id]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-semibold mb-2 flex items-center gap-2"><Clock className="w-4 h-4" /> Pontos recentes</h2>
        {pontos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro.</p> : (
          <ul className="text-sm divide-y">
            {pontos.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>{TIPO_LABEL[p.tipo] || p.tipo}</span>
                <span className="text-muted-foreground text-xs">{p.data} {p.hora?.slice(0,5)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-2 flex items-center gap-2"><Fuel className="w-4 h-4" /> Abastecimentos</h2>
        {abast.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum abastecimento.</p> : (
          <ul className="text-sm divide-y">
            {abast.map((a) => (
              <li key={a.id} className="py-2">
                <div className="flex justify-between">
                  <span className="font-medium">{a.placa || "—"} • {a.litros}L</span>
                  <span className="text-muted-foreground text-xs">{a.data} {a.hora?.slice(0,5)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  R$ {a.valor} • KM {a.km || "—"} • {a.posto || "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
