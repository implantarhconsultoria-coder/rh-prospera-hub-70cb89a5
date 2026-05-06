import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, MapPin, Camera, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import CameraCapture from "../components/CameraCapture";
import { uploadFoto } from "../lib/upload";

const LABELS: Record<string, string> = {
  entrada: "Registrar Entrada",
  almoco_inicio: "Início do Almoço",
  almoco_fim: "Retorno do Almoço",
  saida: "Registrar Saída",
};

export default function PontoPage() {
  const [params] = useSearchParams();
  const tipoParam = params.get("tipo") || "entrada";
  const tipo = ["entrada", "saida", "almoco_inicio", "almoco_fim"].includes(tipoParam) ? tipoParam : "entrada";
  const { mecanico } = useMecanicoApp();
  const navigate = useNavigate();
  const { getLocation } = useGeolocation();
  const [pos, setPos] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [posErr, setPosErr] = useState(false);
  const [statusDia, setStatusDia] = useState<{ batidas: number } | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [openCam, setOpenCam] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Selfie obrigatória somente na primeira batida do dia (ou se for entrada e ainda não tem batidas)
  const exigirSelfie = tipo === "entrada" && statusDia?.batidas === 0;

  useEffect(() => {
    getLocation().then((p) => {
      setPos({ lat: p.latitude, lng: p.longitude });
      if (!p.latitude) setPosErr(true);
    });
    supabase.rpc("app_mecanico_status_dia" as any, { p_acesso_id: mecanico.acesso_id }).then(({ data }) => {
      const d = data as any;
      if (d?.ok) setStatusDia({ batidas: d.batidas_hoje || 0 });
      else setStatusDia({ batidas: 0 });
    });
  }, [getLocation, mecanico.acesso_id]);

  const handleSelfie = async (blob: Blob) => {
    const url = await uploadFoto("ponto-selfies", mecanico.acesso_id, `selfie-${tipo}`, blob);
    setSelfieUrl(url);
    toast.success("Selfie capturada");
  };

  const registrar = async () => {
    if (!pos.lat) {
      toast.error("Permita acesso à localização para concluir o registro.");
      return;
    }
    if (exigirSelfie && !selfieUrl) {
      toast.error("Tire a selfie para concluir a entrada.");
      setOpenCam(true);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("app_mecanico_registrar_ponto" as any, {
      p_acesso_id: mecanico.acesso_id,
      p_tipo: tipo,
      p_latitude: pos.lat,
      p_longitude: pos.lng,
      p_endereco: null,
      p_selfie_url: selfieUrl,
      p_dispositivo: navigator.userAgent.slice(0, 200),
    });
    setLoading(false);
    if (error || !(data as any)?.ok) {
      toast.error("Erro ao registrar ponto");
      return;
    }
    setDone(true);
    toast.success("Registrado com sucesso");
    setTimeout(() => navigate(`/app-mecanico/${mecanico.acesso_id}`), 1500);
  };

  return (
    <Card className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">{LABELS[tipo]}</h1>
      <div className="text-sm space-y-2">
        <p><span className="text-muted-foreground">Mecânico:</span> {mecanico.nome}</p>
        {mecanico.empresa && <p><span className="text-muted-foreground">Empresa:</span> {mecanico.empresa}</p>}
        <p><span className="text-muted-foreground">Data/Hora:</span> {new Date().toLocaleString("pt-BR")}</p>
        <p className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          {pos.lat ? `${pos.lat.toFixed(5)}, ${pos.lng?.toFixed(5)}` :
            posErr ? <span className="text-destructive">GPS bloqueado</span> : "Obtendo localização..."}
        </p>
      </div>

      {posErr && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <span>Permita acesso à câmera e localização para concluir o registro.</span>
        </div>
      )}

      {exigirSelfie && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Prova de vida (selfie obrigatória)</p>
          {selfieUrl ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="w-4 h-4" /> Selfie capturada
              <Button variant="ghost" size="sm" onClick={() => { setSelfieUrl(null); setOpenCam(true); }}>Refazer</Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setOpenCam(true)}>
              <Camera className="w-4 h-4 mr-2" /> Tirar selfie
            </Button>
          )}
        </div>
      )}

      {done ? (
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="w-5 h-5" /> Registrado com sucesso!
        </div>
      ) : (
        <Button onClick={registrar} disabled={loading || !pos.lat || (exigirSelfie && !selfieUrl)} className="w-full h-12">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
        </Button>
      )}

      <CameraCapture
        open={openCam}
        onClose={() => setOpenCam(false)}
        onCapture={handleSelfie}
        facing="user"
        title="Selfie de Entrada"
        hint="Centralize o rosto e tire a foto"
      />
    </Card>
  );
}
