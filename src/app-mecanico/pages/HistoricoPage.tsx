import { useCallback, useEffect, useState } from "react";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Clock, MapPin, Camera, Fuel, Pencil, Trash2, Save, X } from "lucide-react";
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

interface ActionResult { ok?: boolean; error?: string; }

const historicoRpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const parseDecimal = (value: string | number | null | undefined) => {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  return Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
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
  const [edit, setEdit] = useState<AbastecimentoHistorico | null>(null);
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

  const salvarAbastecimento = async () => {
    if (!edit) return;
    const { data, error } = await historicoRpc.rpc("app_mecanico_atualizar_abastecimento", {
      p_acesso_id: mecanico.acesso_id,
      p_abastecimento_id: edit.id,
      p_valor: parseDecimal(edit.valor) || 0,
      p_litros: parseDecimal(edit.litros) || 0,
      p_valor_por_litro: parseDecimal(edit.valor_por_litro) || 0,
      p_km_atual: edit.km_atual ? parseDecimal(edit.km_atual) : null,
      p_combustivel: edit.combustivel || null,
      p_observacao: edit.observacao || null,
    });
    const r = data as ActionResult | null;
    if (error || !r?.ok) {
      toast.error(r?.error || error?.message || "Erro ao salvar abastecimento");
      return;
    }
    toast.success("Abastecimento atualizado");
    setEdit(null);
    await carregar();
  };

  const excluirAbastecimento = async (a: AbastecimentoHistorico) => {
    const motivo = window.prompt("Motivo da exclusao/cancelamento:");
    if (!motivo) return;
    const { data, error } = await historicoRpc.rpc("app_mecanico_excluir_abastecimento", {
      p_acesso_id: mecanico.acesso_id,
      p_abastecimento_id: a.id,
      p_motivo: motivo,
    });
    const r = data as ActionResult | null;
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
      {mecanico.registro_teste && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700">
          Registros de Teste: estes lançamentos servem para validação visual e ficam fora dos relatórios oficiais.
        </Card>
      )}
      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Fuel className="w-4 h-4" /> Abastecimentos recentes</h2>
        {abastecimentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum abastecimento.</p> : (
          <ul className="text-sm divide-y">
            {abastecimentos.map((a) => (
              <li key={a.id} className="py-3 space-y-2">
                {edit?.id === a.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={edit.valor ?? ""} onChange={e => setEdit((current) => current ? ({ ...current, valor: e.target.value }) : current)} placeholder="Valor" inputMode="decimal" />
                      <Input value={edit.litros ?? ""} onChange={e => setEdit((current) => current ? ({ ...current, litros: e.target.value }) : current)} placeholder="Litros" inputMode="decimal" />
                      <Input value={edit.valor_por_litro ?? ""} onChange={e => setEdit((current) => current ? ({ ...current, valor_por_litro: e.target.value }) : current)} placeholder="R$/L" inputMode="decimal" />
                      <Input value={edit.km_atual ?? ""} onChange={e => setEdit((current) => current ? ({ ...current, km_atual: e.target.value }) : current)} placeholder="KM" inputMode="numeric" />
                    </div>
                    <Input value={edit.observacao ?? ""} onChange={e => setEdit((current) => current ? ({ ...current, observacao: e.target.value }) : current)} placeholder="Observacao" />
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
                        {a.registro_teste && <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700">TESTE</span>}
                        <p className="text-xs text-muted-foreground">{a.combustivel || "Combustivel"} | {Number(a.litros || 0).toFixed(2)} L | R$ {Number(a.valor || 0).toFixed(2)}</p>
                      </div>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">{formatarDataHoraBrasil(a.data, a.hora)}</span>
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
                  {p.registro_teste && <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700">TESTE</span>}
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatarDataHoraBrasil(p.data, p.hora)}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  {(p.latitude || p.lat) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {(p.latitude ?? p.lat)?.toFixed?.(4)}, {(p.longitude ?? p.lng)?.toFixed?.(4)}
                    </span>
                  )}
                  {(p.selfie_url || p.selfie) && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <Camera className="w-3 h-3" /> selfie
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
