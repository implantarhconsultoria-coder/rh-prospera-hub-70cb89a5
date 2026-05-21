import { useEffect, useState } from "react";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Clock, MapPin, Camera, Fuel, Pencil, Trash2, Save, X } from "lucide-react";

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saida",
  almoco_inicio: "Inicio Almoco",
  almoco_fim: "Retorno Almoco",
};

export default function HistoricoPage() {
  const { mecanico } = useMecanicoApp();
  const [pontos, setPontos] = useState<any[]>([]);
  const [abastecimentos, setAbastecimentos] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    const { data } = await supabase.rpc("app_mecanico_listar_historico" as any, { p_acesso_id: mecanico.acesso_id });
    const d = data as any;
    setPontos(d?.pontos || []);
    setAbastecimentos(d?.abastecimentos || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [mecanico.acesso_id]);

  const salvarAbastecimento = async () => {
    if (!edit) return;
    const { data, error } = await supabase.rpc("app_mecanico_atualizar_abastecimento" as any, {
      p_acesso_id: mecanico.acesso_id,
      p_abastecimento_id: edit.id,
      p_valor: Number(edit.valor) || 0,
      p_litros: Number(edit.litros) || 0,
      p_valor_por_litro: Number(edit.valor_por_litro) || 0,
      p_km_atual: edit.km_atual ? Number(edit.km_atual) : null,
      p_combustivel: edit.combustivel || null,
      p_observacao: edit.observacao || null,
    });
    const r = data as any;
    if (error || !r?.ok) {
      toast.error(r?.error || error?.message || "Erro ao salvar abastecimento");
      return;
    }
    toast.success("Abastecimento atualizado");
    setEdit(null);
    await carregar();
  };

  const excluirAbastecimento = async (a: any) => {
    const motivo = window.prompt("Motivo da exclusao/cancelamento:");
    if (!motivo) return;
    const { data, error } = await supabase.rpc("app_mecanico_excluir_abastecimento" as any, {
      p_acesso_id: mecanico.acesso_id,
      p_abastecimento_id: a.id,
      p_motivo: motivo,
    });
    const r = data as any;
    if (error || !r?.ok) {
      toast.error(r?.error || error?.message || "Erro ao excluir abastecimento");
      return;
    }
    toast.success("Abastecimento removido do historico ativo");
    await carregar();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Fuel className="w-4 h-4" /> Abastecimentos recentes</h2>
        {abastecimentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum abastecimento.</p> : (
          <ul className="text-sm divide-y">
            {abastecimentos.map((a) => (
              <li key={a.id} className="py-3 space-y-2">
                {edit?.id === a.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={edit.valor ?? ""} onChange={e => setEdit((p: any) => ({ ...p, valor: e.target.value }))} placeholder="Valor" inputMode="decimal" />
                      <Input value={edit.litros ?? ""} onChange={e => setEdit((p: any) => ({ ...p, litros: e.target.value }))} placeholder="Litros" inputMode="decimal" />
                      <Input value={edit.valor_por_litro ?? ""} onChange={e => setEdit((p: any) => ({ ...p, valor_por_litro: e.target.value }))} placeholder="R$/L" inputMode="decimal" />
                      <Input value={edit.km_atual ?? ""} onChange={e => setEdit((p: any) => ({ ...p, km_atual: e.target.value }))} placeholder="KM" inputMode="numeric" />
                    </div>
                    <Input value={edit.observacao ?? ""} onChange={e => setEdit((p: any) => ({ ...p, observacao: e.target.value }))} placeholder="Observacao" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={salvarAbastecimento}><Save className="w-3 h-3 mr-1" /> Salvar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEdit(null)}><X className="w-3 h-3 mr-1" /> Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-medium">{a.placa || "-"} - {a.posto_nome || "Posto"}</span>
                        <p className="text-xs text-muted-foreground">{a.combustivel || "Combustivel"} | {Number(a.litros || 0).toFixed(2)} L | R$ {Number(a.valor || 0).toFixed(2)}</p>
                      </div>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">{a.data} {a.hora?.slice(0, 5)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">KM {a.km_atual || "-"} | {a.empresa || ""}</span>
                      <div className="flex gap-1">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEdit(a)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="icon" variant="outline" className="h-8 w-8 text-destructive" onClick={() => excluirAbastecimento(a)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4" /> Pontos recentes</h2>
        {pontos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro.</p> : (
          <ul className="text-sm divide-y">
            {pontos.map((p) => (
              <li key={p.id} className="py-2.5">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-medium">{TIPO_LABEL[p.tipo] || p.tipo}</span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">{p.data} {p.hora?.slice(0, 5)}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  {(p.latitude || p.lat) && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{(p.latitude ?? p.lat)?.toFixed?.(4)}, {(p.longitude ?? p.lng)?.toFixed?.(4)}</span>}
                  {(p.selfie_url || p.selfie) && <span className="flex items-center gap-1 text-emerald-600"><Camera className="w-3 h-3" /> selfie</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
