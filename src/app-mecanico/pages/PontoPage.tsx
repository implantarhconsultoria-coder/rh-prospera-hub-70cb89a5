import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Camera, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useGeolocation } from "@/hooks/useGeolocation";
import { supabase } from "@/integrations/supabase/client";
import { formatarAgoraBrasil } from "@/lib/brTime";
import CameraCapture from "../components/CameraCapture";
import { useMecanicoApp } from "../MecanicoAppContext";
import { uploadFoto } from "../lib/upload";

const LABELS: Record<string, string> = {
  entrada: "Registrar Entrada",
  almoco_inicio: "Início Almoço",
  almoco_fim: "Retorno Almoço",
  saida: "Registrar Saída",
};

const PONTOS_PENDENTES_KEY = "topac_pontos_pendentes_v1";

interface PontoPendente {
  clientId: string;
  acessoId: string;
  tipo: string;
  ocorridoEm: string;
  latitude: number | null;
  longitude: number | null;
  selfieDataUrl: string | null;
  selfieUrl: string | null;
  empresa: string;
  filial: string;
  funcionarioId: string | null;
}

interface PontoRpcResult {
  ok?: boolean;
  error?: string;
  batidas_hoje?: number;
}

const criarClientId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const lerPendentes = (): PontoPendente[] => {
  try {
    const value = localStorage.getItem(PONTOS_PENDENTES_KEY);
    return value ? JSON.parse(value) : [];
  } catch (error) {
    console.error("Erro ao ler pontos pendentes:", error);
    return [];
  }
};

const gravarPendentes = (items: PontoPendente[]) => {
  localStorage.setItem(PONTOS_PENDENTES_KEY, JSON.stringify(items));
};

const salvarPendente = (item: PontoPendente) => {
  const items = lerPendentes();
  const index = items.findIndex((current) => current.clientId === item.clientId);
  if (index >= 0) items[index] = item;
  else items.push(item);
  gravarPendentes(items);
};

const removerPendente = (clientId: string) => {
  try {
    gravarPendentes(lerPendentes().filter((item) => item.clientId !== clientId));
  } catch (error) {
    console.error("Erro ao remover ponto sincronizado da fila local:", error);
  }
};

const dataUrlParaBlob = (dataUrl: string) => {
  const [header, payload] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
};

const comprimirFoto = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      const maxSide = 900;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Não foi possível preparar a selfie."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.65));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível ler a selfie."));
    };
    image.src = objectUrl;
  });

const enviarPontoPendente = async (item: PontoPendente) => {
  let current = item;

  if (current.selfieDataUrl && !current.selfieUrl) {
    const selfieUrl = await uploadFoto(
      "ponto-selfies",
      current.acessoId,
      `selfie-${current.tipo}`,
      dataUrlParaBlob(current.selfieDataUrl),
    );
    current = { ...current, selfieUrl, selfieDataUrl: null };
    try {
      salvarPendente(current);
    } catch (error) {
      console.error("Erro ao atualizar selfie na fila local:", error);
    }
  }

  const dispositivo = JSON.stringify({
    user_agent: navigator.userAgent.slice(0, 200),
    client_id: current.clientId,
    ocorrido_em: current.ocorridoEm,
    empresa: current.empresa,
    filial: current.filial,
    funcionario_id: current.funcionarioId,
  });

  const { data, error } = await supabase.rpc("app_mecanico_registrar_ponto", {
    p_acesso_id: current.acessoId,
    p_tipo: current.tipo,
    p_latitude: current.latitude ?? undefined,
    p_longitude: current.longitude ?? undefined,
    p_endereco: undefined,
    p_selfie_url: current.selfieUrl ?? undefined,
    p_dispositivo: dispositivo,
  });

  if (error) throw error;
  const result = data as unknown as PontoRpcResult | null;
  if (!result?.ok) {
    throw new Error(result?.error || "registro_ponto_recusado");
  }

  removerPendente(current.clientId);
  return data;
};

export default function PontoPage() {
  const [params] = useSearchParams();
  const tipoParam = params.get("tipo") || "entrada";
  const tipo = ["entrada", "saida", "almoco_inicio", "almoco_fim"].includes(tipoParam)
    ? tipoParam
    : "entrada";
  const { mecanico } = useMecanicoApp();
  const navigate = useNavigate();
  const { getLocation } = useGeolocation();
  const [pos, setPos] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });
  const [posErr, setPosErr] = useState(false);
  const [statusDia, setStatusDia] = useState<{ batidas: number } | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [openCam, setOpenCam] = useState(false);
  const [loading, setLoading] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const sincronizandoRef = useRef(false);

  const exigirSelfie = tipo === "entrada" && (statusDia?.batidas ?? 0) === 0;

  const atualizarQuantidadePendente = useCallback(() => {
    setPendentes(
      lerPendentes().filter((item) => item.acessoId === mecanico.acesso_id).length,
    );
  }, [mecanico.acesso_id]);

  const sincronizarPendentes = useCallback(async () => {
    if (sincronizandoRef.current || !navigator.onLine) return;
    sincronizandoRef.current = true;
    const items = lerPendentes().filter((item) => item.acessoId === mecanico.acesso_id);
    let enviados = 0;

    for (const item of items) {
      try {
        await enviarPontoPendente(item);
        enviados += 1;
      } catch (error) {
        console.error("Erro ao sincronizar ponto pendente:", error);
        break;
      }
    }

    sincronizandoRef.current = false;
    atualizarQuantidadePendente();
    if (enviados > 0) toast.success("Ponto pendente sincronizado com sucesso");
  }, [atualizarQuantidadePendente, mecanico.acesso_id]);

  useEffect(() => {
    atualizarQuantidadePendente();
    void sincronizarPendentes();

    getLocation().then((location) => {
      setPos({ lat: location.latitude, lng: location.longitude });
      if (!location.latitude) setPosErr(true);
    });

    supabase
      .rpc("app_mecanico_status_dia", { p_acesso_id: mecanico.acesso_id })
      .then(({ data, error }) => {
        const result = data as unknown as PontoRpcResult | null;
        if (error) console.error("Erro ao consultar ponto do dia:", error);
        setStatusDia({ batidas: result?.ok ? result.batidas_hoje || 0 : 0 });
      });

    const onOnline = () => void sincronizarPendentes();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [
    atualizarQuantidadePendente,
    getLocation,
    mecanico.acesso_id,
    sincronizarPendentes,
  ]);

  const handleSelfie = async (blob: Blob) => {
    const dataUrl = await comprimirFoto(blob);
    setSelfieDataUrl(dataUrl);
    toast.success("Selfie capturada");
  };

  const registrar = async () => {
    if (exigirSelfie && !selfieDataUrl) {
      toast.error("Tire a selfie para concluir a entrada.");
      setOpenCam(true);
      return;
    }

    const item: PontoPendente = {
      clientId: criarClientId(),
      acessoId: mecanico.acesso_id,
      tipo,
      ocorridoEm: new Date().toISOString(),
      latitude: pos.lat,
      longitude: pos.lng,
      selfieDataUrl,
      selfieUrl: null,
      empresa: mecanico.empresa || "",
      filial: mecanico.filial || "",
      funcionarioId: mecanico.funcionario_id,
    };

    setLoading(true);
    let salvoLocalmente = false;
    try {
      salvarPendente(item);
      salvoLocalmente = true;
      atualizarQuantidadePendente();
    } catch (error) {
      console.error("Erro ao guardar ponto no aparelho:", error);
    }

    try {
      await enviarPontoPendente(item);
      setDoneMessage("Ponto registrado com sucesso");
      atualizarQuantidadePendente();
      toast.success("Ponto registrado com sucesso");
    } catch (error) {
      console.error("Erro Supabase ao registrar ponto:", error);
      if (salvoLocalmente) {
        setDoneMessage("Ponto salvo para sincronizar");
        toast.success("Ponto salvo para sincronizar");
      } else {
        toast.error("Não foi possível registrar nem salvar o ponto neste aparelho.");
        setLoading(false);
        return;
      }
    } finally {
      setLoading(false);
    }

    setTimeout(() => navigate(`/app-mecanico/${mecanico.acesso_id}`), 1500);
  };

  return (
    <Card className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">{LABELS[tipo]}</h1>
      <div className="space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">Mecânico:</span> {mecanico.nome}
        </p>
        {mecanico.empresa && (
          <p>
            <span className="text-muted-foreground">Empresa:</span> {mecanico.empresa}
          </p>
        )}
        {mecanico.registro_teste && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">
            Registro de teste: aparece para validação, mas não entra em fechamento oficial.
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Data/Hora:</span>{" "}
          {formatarAgoraBrasil()}
        </p>
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          {pos.lat
            ? `${pos.lat.toFixed(5)}, ${pos.lng?.toFixed(5)}`
            : posErr
              ? "GPS indisponível; o ponto será salvo mesmo assim"
              : "Obtendo localização..."}
        </p>
      </div>

      {posErr && (
        <div className="flex items-start gap-2 rounded bg-amber-500/10 p-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>
            Localização indisponível. O registro continuará e poderá ser conferido depois.
          </span>
        </div>
      )}

      {pendentes > 0 && (
        <div className="flex items-start gap-2 rounded bg-blue-500/10 p-3 text-sm text-blue-700">
          <Loader2 className="mt-0.5 h-4 w-4" />
          <span>{pendentes} ponto(s) aguardando sincronização automática.</span>
        </div>
      )}

      {exigirSelfie && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Prova de vida (selfie obrigatória)</p>
          {selfieDataUrl ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Selfie capturada
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelfieDataUrl(null);
                  setOpenCam(true);
                }}
              >
                Refazer
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setOpenCam(true)}>
              <Camera className="mr-2 h-4 w-4" /> Tirar selfie
            </Button>
          )}
        </div>
      )}

      {doneMessage ? (
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="h-5 w-5" /> {doneMessage}
        </div>
      ) : (
        <Button onClick={registrar} disabled={loading} className="h-12 w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
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
