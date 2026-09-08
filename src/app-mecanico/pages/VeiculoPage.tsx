import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Car, CheckCircle2, Gauge, Loader2, MapPin, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import CameraCapture from "../components/CameraCapture";
import { useMecanicoApp } from "../MecanicoAppContext";

type Vehicle = {
  id?: string | null;
  placa: string;
  descricao?: string | null;
};

type VehicleRecord = {
  id: string;
  data: string;
  status: string;
  veiculo_placa: string;
  veiculo_descricao?: string | null;
  km_saida: number;
  km_chegada?: number | null;
  km_total?: number | null;
  saida_em?: string | null;
  chegada_em?: string | null;
};

type StatusResult = {
  ok?: boolean;
  error?: string;
  vehicles?: Vehicle[];
  record?: VehicleRecord | null;
};

type PhotoState = {
  dataUrl: string;
  mimeType: string;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível preparar a foto."));
    reader.readAsDataURL(blob);
  });

const getPreciseLocation = () =>
  new Promise<{ latitude: number; longitude: number; accuracy: number }>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS indisponível neste aparelho."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      () => reject(new Error("Ative a localização do aparelho para registrar o KM.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
    );
  });

const errorMessage = (error?: string, payload?: Record<string, unknown>) => {
  if (error === "sem_veiculo_vinculado") return "Nenhum veículo está vinculado ao seu cadastro. Procure o administrador.";
  if (error === "veiculo_nao_autorizado") return "Este veículo não está vinculado ao seu cadastro.";
  if (error === "registro_dia_ja_existe") return "O ponto do veículo de hoje já foi iniciado.";
  if (error === "sem_saida_aberta") return "Não existe saída de veículo aberta hoje.";
  if (error === "gps_obrigatorio") return "A localização é obrigatória para registrar o ponto do veículo.";
  if (error === "km_invalido") return "Informe um KM inicial válido.";
  if (error === "km_chegada_invalido") return `O KM de chegada não pode ser menor que o KM de saída (${payload?.km_saida ?? "-"}).`;
  if (error === "km_menor_ultimo") return `O KM informado é menor que o último KM registrado (${payload?.ultimo_km ?? "-"}). Confira o painel.`;
  if (error === "acesso_nao_autorizado") return "Seu acesso não está liberado. Entre novamente pelo PIN.";
  return "Não foi possível concluir o ponto do veículo agora.";
};

export default function VeiculoPage() {
  const { mecanico } = useMecanicoApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [record, setRecord] = useState<VehicleRecord | null>(null);
  const [plate, setPlate] = useState("");
  const [km, setKm] = useState("");
  const [kmOcr, setKmOcr] = useState<number | null>(null);
  const [photo, setPhoto] = useState<PhotoState | null>(null);

  const completed = String(record?.status || "").toLowerCase() === "concluido";
  const open = Boolean(record) && !completed;
  const mode: "start" | "finish" = open ? "finish" : "start";
  const selected = useMemo(() => vehicles.find((vehicle) => vehicle.placa === plate) || null, [plate, vehicles]);
  const kmRodado = record?.km_chegada != null
    ? Number(record.km_total ?? Math.max(0, Number(record.km_chegada) - Number(record.km_saida || 0)))
    : null;

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("app-mecanico-ponto-veiculo", {
        body: { action: "status", acessoId: mecanico.acesso_id },
      });
      const result = data as StatusResult | null;
      if (error || !result?.ok) throw new Error(result?.error || error?.message || "status_indisponivel");
      const list = Array.isArray(result.vehicles) ? result.vehicles : [];
      setVehicles(list);
      setRecord(result.record || null);
      const currentPlate = result.record?.veiculo_placa || (list.length === 1 ? list[0].placa : "");
      setPlate(currentPlate);
      setKm(result.record && String(result.record.status).toLowerCase() !== "concluido" ? "" : "");
      setKmOcr(null);
      setPhoto(null);
    } catch (error) {
      console.error("Falha ao carregar ponto do veículo:", error);
      toast.error("Não foi possível carregar o Ponto do Carro / KM.");
    } finally {
      setLoading(false);
    }
  }, [mecanico.acesso_id]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const onCapture = async (blob: Blob) => {
    const dataUrl = await blobToDataUrl(blob);
    setPhoto({ dataUrl, mimeType: blob.type || "image/jpeg" });
    setOcrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-bomba-combustivel", {
        body: { dataUrl, tipo: "painel_km" },
      });
      const ocr = data as { ok?: boolean; km?: number; motivo?: string } | null;
      if (!error && ocr?.ok && Number.isFinite(Number(ocr.km))) {
        const parsedKm = Math.round(Number(ocr.km));
        setKm(String(parsedKm));
        setKmOcr(parsedKm);
        toast.success("KM lido automaticamente. Confira o número antes de confirmar.");
      } else {
        setKmOcr(null);
        toast.info("Foto salva. Confira e informe o KM manualmente.");
      }
    } catch (error) {
      console.warn("OCR do hodômetro indisponível:", error);
      setKmOcr(null);
      toast.info("Foto salva. Informe o KM manualmente.");
    } finally {
      setOcrLoading(false);
    }
  };

  const submit = async () => {
    if (saving || completed) return;
    const parsedKm = Number(String(km).replace(/\D/g, ""));
    if (mode === "start" && !plate) return toast.error("Selecione o veículo.");
    if (!Number.isSafeInteger(parsedKm) || parsedKm < 0) return toast.error("Informe o KM exibido no painel.");
    if (mode === "finish" && parsedKm < Number(record?.km_saida || 0)) return toast.error(`O KM de chegada não pode ser menor que ${record?.km_saida}.`);
    if (!photo) {
      toast.error("Tire a foto do painel para continuar.");
      setCameraOpen(true);
      return;
    }

    setSaving(true);
    try {
      const location = await getPreciseLocation();
      const { data, error } = await supabase.functions.invoke("app-mecanico-ponto-veiculo", {
        body: {
          action: mode,
          acessoId: mecanico.acesso_id,
          vehiclePlate: mode === "start" ? plate : record?.veiculo_placa,
          km: parsedKm,
          kmOcr,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          device: navigator.userAgent.slice(0, 400),
          photo: { data: photo.dataUrl, mimeType: photo.mimeType },
        },
      });
      const result = data as (StatusResult & Record<string, unknown>) | null;
      if (error || !result?.ok) {
        toast.error(errorMessage(result?.error || error?.message, result || undefined));
        return;
      }
      toast.success(mode === "start" ? "Saída do veículo registrada." : "Chegada registrada e KM do dia calculado.");
      await loadStatus();
    } catch (error) {
      console.error("Erro ao registrar ponto do veículo:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar o ponto do veículo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  return (
    <div className="space-y-4 pb-4">
      <Card className="border-fuchsia-500/20 bg-[#07070d] p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-fuchsia-500/10 text-fuchsia-400"><Gauge className="h-6 w-6" /></span>
          <div>
            <h1 className="text-lg font-bold">Ponto do Carro / KM</h1>
            <p className="text-xs text-zinc-400">Foto do painel + GPS + hodômetro</p>
          </div>
        </div>
      </Card>

      {completed && record ? (
        <Card className="space-y-4 border-emerald-500/25 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 font-semibold text-emerald-600"><CheckCircle2 className="h-5 w-5" /> Veículo encerrado hoje</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="block text-xs text-muted-foreground">Veículo</span><strong>{record.veiculo_descricao || record.veiculo_placa}</strong><span className="block text-xs text-muted-foreground">{record.veiculo_placa}</span></div>
            <div><span className="block text-xs text-muted-foreground">KM rodado</span><strong className="text-xl">{kmRodado ?? 0} km</strong></div>
            <div><span className="block text-xs text-muted-foreground">Saída</span><strong>{record.km_saida}</strong></div>
            <div><span className="block text-xs text-muted-foreground">Chegada</span><strong>{record.km_chegada}</strong></div>
          </div>
          <Button variant="outline" className="w-full" onClick={() => void loadStatus()}><RotateCcw className="mr-2 h-4 w-4" /> Atualizar</Button>
        </Card>
      ) : (
        <Card className="space-y-5 p-5">
          {mode === "start" ? (
            <div className="space-y-2">
              <Label>Veículo</Label>
              {vehicles.length === 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">Nenhum veículo vinculado ao seu cadastro. O administrador precisa vincular um veículo antes do registro.</div>
              ) : (
                <div className="grid gap-2">
                  {vehicles.map((vehicle) => (
                    <button key={`${vehicle.id || "v"}-${vehicle.placa}`} type="button" onClick={() => setPlate(vehicle.placa)} className={`flex items-center gap-3 rounded-lg border p-3 text-left ${plate === vehicle.placa ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-border"}`}>
                      <Car className="h-5 w-5 shrink-0" />
                      <span><strong className="block text-sm">{vehicle.descricao || vehicle.placa}</strong><small className="text-muted-foreground">{vehicle.placa}</small></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-sm">
              <span className="text-muted-foreground">Veículo em uso</span>
              <strong className="mt-1 block">{record?.veiculo_descricao || record?.veiculo_placa}</strong>
              <span className="text-xs text-muted-foreground">{record?.veiculo_placa} · saída {record?.km_saida} km</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>{mode === "start" ? "KM de saída" : "KM de chegada"}</Label>
            <Input inputMode="numeric" pattern="[0-9]*" value={km} onChange={(event) => setKm(event.target.value.replace(/\D/g, ""))} placeholder="Ex.: 55128" className="h-12 text-lg font-semibold" />
            {kmOcr != null && <p className="text-xs text-emerald-600">OCR identificou {kmOcr} km. Confira com o painel.</p>}
          </div>

          <div className="space-y-2">
            <Label>Foto do painel</Label>
            <Button type="button" variant={photo ? "outline" : "default"} className="h-12 w-full" onClick={() => setCameraOpen(true)} disabled={ocrLoading}>
              {ocrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              {ocrLoading ? "Lendo hodômetro..." : photo ? "Refazer foto do painel" : "Tirar foto do painel"}
            </Button>
            {photo && !ocrLoading && <p className="text-xs text-emerald-600">Foto capturada e pronta para envio.</p>}
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /> O GPS será validado no momento da confirmação. Sem localização o registro não é concluído.</div>

          <Button className="h-12 w-full" onClick={() => void submit()} disabled={saving || ocrLoading || (mode === "start" && (!selected || vehicles.length === 0))}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "start" ? "Registrar saída do veículo" : "Registrar chegada do veículo"}
          </Button>
        </Card>
      )}

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={onCapture}
        facing="environment"
        allowGallery={false}
        title={mode === "start" ? "Painel na saída" : "Painel na chegada"}
        hint="Mostre o hodômetro/KM total com nitidez. A foto deve ser tirada agora."
      />
    </div>
  );
}
