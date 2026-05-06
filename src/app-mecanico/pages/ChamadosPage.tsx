import { useEffect, useState } from "react";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Chamado {
  id: string;
  cliente: string;
  local_servico: string;
  tipo_servico: string;
  status: string;
  observacoes?: string | null;
  created_at: string;
}

export default function ChamadosPage() {
  const { mecanico } = useMecanicoApp();
  const [lista, setLista] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);
  const [obs, setObs] = useState("");
  const [acting, setActing] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("app_mecanico_listar_chamados" as any, { p_acesso_id: mecanico.acesso_id });
    setLista((data as any)?.chamados || []);
    setLoading(false);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  const acao = async (chamadoId: string, acao: "iniciar" | "finalizar") => {
    setActing(true);
    const { data, error } = await supabase.rpc("app_mecanico_atualizar_chamado" as any, {
      p_acesso_id: mecanico.acesso_id,
      p_chamado_id: chamadoId,
      p_acao: acao,
      p_observacao: obs || null,
    });
    setActing(false);
    if (error || !(data as any)?.ok) { toast.error("Erro ao atualizar chamado"); return; }
    toast.success(acao === "iniciar" ? "Atendimento iniciado" : "Chamado finalizado");
    setAberto(null); setObs("");
    carregar();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (lista.length === 0) return <Card className="p-6 text-center text-muted-foreground">Nenhum chamado atribuído.</Card>;

  return (
    <div className="space-y-3">
      {lista.map((c) => (
        <Card key={c.id} className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{c.cliente || "Sem cliente"}</p>
              <p className="text-xs text-muted-foreground">{c.tipo_servico}</p>
            </div>
            <Badge variant={c.status === "concluido" ? "secondary" : c.status === "em_atendimento" ? "default" : "outline"}>
              {c.status}
            </Badge>
          </div>
          {c.local_servico && <p className="text-sm">{c.local_servico}</p>}
          {aberto === c.id ? (
            <div className="space-y-2 pt-2">
              <Textarea
                placeholder="Observação (opcional)"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={3}
              />
              <div className="flex gap-2">
                {c.status !== "em_atendimento" && c.status !== "concluido" && (
                  <Button size="sm" onClick={() => acao(c.id, "iniciar")} disabled={acting} className="flex-1">
                    Iniciar
                  </Button>
                )}
                {c.status !== "concluido" && (
                  <Button size="sm" variant="default" onClick={() => acao(c.id, "finalizar")} disabled={acting} className="flex-1">
                    Finalizar
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setAberto(null); setObs(""); }}>Cancelar</Button>
              </div>
            </div>
          ) : (
            c.status !== "concluido" && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setAberto(c.id)}>
                Atender
              </Button>
            )
          )}
        </Card>
      ))}
    </div>
  );
}
