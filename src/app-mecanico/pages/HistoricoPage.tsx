import { useEffect, useState } from "react";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function HistoricoPage() {
  const { mecanico } = useMecanicoApp();
  const [pontos, setPontos] = useState<any[]>([]);
  const [chamados, setChamados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("app_mecanico_listar_historico" as any, { p_acesso_id: mecanico.acesso_id });
      setPontos((data as any)?.pontos || []);
      setChamados((data as any)?.chamados || []);
      setLoading(false);
    })();
  }, [mecanico.acesso_id]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-semibold mb-2">Pontos recentes</h2>
        {pontos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro.</p> : (
          <ul className="text-sm space-y-1">
            {pontos.map((p) => (
              <li key={p.id} className="flex justify-between border-b py-1 last:border-0">
                <span className="capitalize">{p.tipo}</span>
                <span className="text-muted-foreground">{p.data} {p.hora?.slice(0,5)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold mb-2">Chamados recentes</h2>
        {chamados.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum chamado.</p> : (
          <ul className="text-sm space-y-1">
            {chamados.map((c) => (
              <li key={c.id} className="flex justify-between border-b py-1 last:border-0">
                <span className="truncate pr-2">{c.cliente || c.tipo_servico}</span>
                <span className="text-muted-foreground">{c.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
