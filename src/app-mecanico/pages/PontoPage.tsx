import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function PontoPage() {
  const [params] = useSearchParams();
  const tipo = params.get("tipo") === "saida" ? "saida" : "entrada";
  const { mecanico } = useMecanicoApp();
  const navigate = useNavigate();
  const { getLocation } = useGeolocation();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [pos, setPos] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  useEffect(() => {
    getLocation().then((p) => setPos({ lat: p.latitude, lng: p.longitude }));
  }, [getLocation]);

  const registrar = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("app_mecanico_registrar_ponto" as any, {
      p_acesso_id: mecanico.acesso_id,
      p_tipo: tipo,
      p_latitude: pos.lat,
      p_longitude: pos.lng,
      p_endereco: null,
    });
    setLoading(false);
    if (error || !(data as any)?.ok) {
      toast.error("Erro ao registrar ponto");
      return;
    }
    setDone(true);
    toast.success(tipo === "entrada" ? "Entrada registrada" : "Saída registrada");
    setTimeout(() => navigate(`/app-mecanico/${mecanico.acesso_id}`), 1500);
  };

  return (
    <Card className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">{tipo === "entrada" ? "Registrar Entrada" : "Registrar Saída"}</h1>
      <div className="text-sm space-y-2">
        <p><span className="text-muted-foreground">Mecânico:</span> {mecanico.nome}</p>
        <p><span className="text-muted-foreground">Data:</span> {new Date().toLocaleString("pt-BR")}</p>
        <p className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          {pos.lat ? `${pos.lat.toFixed(5)}, ${pos.lng?.toFixed(5)}` : "Obtendo localização..."}
        </p>
      </div>

      {done ? (
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="w-5 h-5" /> Registrado com sucesso!
        </div>
      ) : (
        <Button onClick={registrar} disabled={loading} className="w-full h-12">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
        </Button>
      )}
    </Card>
  );
}
