import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Camera, CheckCircle2, Loader2, LocateFixed, MapPin, RotateCcw } from "lucide-react";
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

const BUSINESS_ERRORS = new Set([
  "gps_obrigatorio",
  "selfie_obrigatoria",
  "entrada_ja_registrada",
  "entrada_obrigatoria",
  "almoco_inicio_ja_registrado",
  "almoco_inicio_obrigatorio",
  "almoco_fim_ja_registrado",
  "almoco_em_aberto",
  "saida_ja_registrada",
  "jornada_encerrada",
  "tipo_invalido",
  "acesso_nao_autorizado",
]);

const criarClientId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isBrowser = () => typeof window !== "undefined" && typeof localStorage !== "undefined";
const gpsValido = (lat: number | null, lng: number | null) =>
  lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const codigoErro = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || "");
  return String(error || "");
};

const mensagemPonto = (code: string) => {
  if (code === "gps_obrigatorio") return "Ative a localização do aparelho. Sem GPS o ponto não pode ser registrado.";
  if (code === "selfie_obrigatoria") return "A selfie ao vivo é obrigatória para registrar a entrada.";
  if (code === "entrada_ja_registrada") return "A entrada de hoje já foi registrada.";
  if (code === "entrada_obrigatoria") return "Registre a entrada antes desta ação.";
  if (code === "almoco_inicio_ja_registrado") return "O início do almoço de hoje já foi registrado.";
  if (code === "almoco_inicio_obrigatorio") return "Registre primeiro o início do almoço.";
  if (code === "almoco_fim_ja_registrado") return "O retorno do almoço de hoje já foi registrado.";
  if (code === "almoco_em_aberto") return "Registre o retorno do almoço antes de encerrar a jornada.";
  if (code === "saida_ja_registrada") return "A saída de hoje já foi registrada.";
  if (code === "jornada_encerrada") return "A jornada de hoje já foi encerrada.";
  if (code === "acesso_nao_autorizado") return "Seu acesso não está liberado. Entre novamente pelo PIN.";
  return "Não foi possível registrar o ponto agora.";
};

const lerPendentes = (): PontoPendente[] => {
  if (!isBrowser()) return [];
  try {
    const value = localStorage.getItem(PONTOS_PENDENTES_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Erro ao ler pontos pendentes:", error);
    return [];
  }
};

const gravarPendentes = (items: PontoPendente[]) => {
  if (!isBrowser()) throw new Error("Armazenamento local indisponível neste aparelho.");
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
  if (!payload) throw new Error("Selfie inválida. Tire a foto novamente.");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
};

const comprimirFoto = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      const maxSide = 900;
      const scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1));
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
  if (!gpsValido(item.latitude, item.longitude)) throw new Error("gps_obrigatorio");
  let current = item;

  if (current.selfieDataUrl && !current.selfieUrl) {
    const selfieUrl = await uploadFoto(
      "ponto-selfies",
      current.acessoId,
      `selfie-${current.tipo}`,
      dataUrlParaBlob(current.selfieDataUrl),
    );
    current = { ...current, selfieUrl, selfieDataUrl: null };
    salvarPendente(current);
  }

  const dispositivo = JSON.stringify({
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "indisponivel",
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
  if (!result?.ok) throw new Error(result?.error || "registro_ponto_recusado");

  removerPendente(current.clientId);
  return data;
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
  const [locating, setLocating] = useState(true);
  const [statusDia, setStatusDia] = useState<{ batidas: number } | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [openCam, setOpenCam] = useState(false);
  const [loading, setLoading] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const sincronizandoRef = useRef(false);

  const exigirSelfie = tipo === "entrada";
  const temGps = gpsValido(pos.lat, pos.lng);

  const atualizarQuantidadePendente = useCallback(() => {
    setPendentes(lerPendentes().filter((item) => item.acessoId === mecanico.acesso_id).length);
  }, [mecanico.acesso_id]);

  const atualizarLocalizacao = useCallback(async () => {
    setLocating(true);
    setPosErr(false);
    try {
      const location = await getLocation();
      const next = { lat: location.latitude ?? null, lng: location.longitude ?? null };
      setPos(next);
      if (!gpsValido(next.lat, next.lng)) setPosErr(true);
      return next;
    } catch (error) {
      console.error("GPS indisponível no app mecânico:", error);
      setPos({ lat: null, lng: null });
      setPosErr(true);
      return { lat: null, lng: null };
    } finally {
      setLocating(false);
    }
  }, [getLocation]);

  const sincronizarPendentes = useCallback(async () => {
    if (sincronizandoRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    sincronizandoRef.current = true;
    const items = lerPendentes().filter((item) => item.acessoId === mecanico.acesso_id);
    let enviados = 0;

    try {
      for (const item of items) {
        if (!gpsValido(item.latitude, item.longitude)) {
          console.warn("Ponto antigo sem GPS mantido localmente e não sincronizado:", item.clientId);
          continue;
        }
        try {
          await enviarPontoPendente(item);
          enviados += 1;
        } catch (error) {
          const code = codigoErro(error);
          if (BUSINESS_ERRORS.has(code)) {
            removerPendente(item.clientId);
            console.warn("Ponto pendente recusado por regra operacional:", code);
            continue;
          }
          console.error("Erro ao sincronizar ponto pendente:", error);
          break;
        }
      }
    } finally {
      sincronizandoRef.current = false;
      atualizarQuantidadePendente();
    }

    if (enviados > 0) toast.success("Ponto pendente sincronizado com sucesso");
  }, [atualizarQuantidadePendente, mecanico.acesso_id]);

  useEffect(() => {
    let active = true;
    atualizarQuantidadePendente();
    void sincronizarPendentes();
    void atualizarLocalizacao();

    supabase
      .rpc("app_mecanico_status_dia", { p_acesso_id: mecanico.acesso_id })
      .then(({ data, error }) => {
        if (!active) return;
        const result = data as unknown as PontoRpcResult | null;
        if (error) console.error("Erro ao consultar ponto do dia:", error);
        setStatusDia({ batidas: result?.ok ? result.batidas_hoje || 0 : 0 });
      })
      .catch((error) => {
        if (!active) return;
        console.error("Falha ao consultar status do ponto:", error);
        setStatusDia({ batidas: 0 });
      });

    const onOnline = () => void sincronizarPendentes();
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
    };
  }, [atualizarLocalizacao, atualizarQuantidadePendente, mecanico.acesso_id, sincronizarPendentes]);

  const handleSelfie = async (blob: Blob) => {
    const dataUrl = await comprimirFoto(blob);
    setSelfieDataUrl(dataUrl);
    toast.success("Selfie capturada");
  };

  const registrar = async () => {
    if (loading || doneMessage) return;
    if (exigirSelfie && !selfieDataUrl) {
      toast.error("Tire a selfie ao vivo para concluir a entrada.");
      setOpenCam(true);
      return;
    }

    let localAtual = pos;
    if (!gpsValido(localAtual.lat, localAtual.lng)) {
      localAtual = await atualizarLocalizacao();
      if (!gpsValido(localAtual.lat, localAtual.lng)) {
        toast.error("Ative a localização do aparelho. Sem GPS o ponto não pode ser registrado.");
        return;
      }
    }

    const item: PontoPendente = {
      clientId: criarClientId(),
      acessoId: mecanico.acesso_id,
      tipo,
      ocorridoEm: new Date().toISOString(),
      latitude: localAtual.lat,
      longitude: localAtual.lng,
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
      setSelfieDataUrl(null);
      atualizarQuantidadePendente();
      toast.success("Ponto registrado com sucesso");
    } catch (error) {
      console.error("Erro Supabase ao registrar ponto:", error);
      const code = codigoErro(error);
      if (BUSINESS_ERRORS.has(code)) {
        removerPendente(item.clientId);
        atualizarQuantidadePendente();
        toast.error(mensagemPonto(code));
        setLoading(false);
        return;
      }
      if (salvoLocalmente) {
        setDoneMessage("Ponto salvo no aparelho para sincronizar");
        toast.success("Sem conexão com o servidor. Ponto preservado no aparelho para sincronização automática.");
      } else {
        toast.error("Não foi possível registrar nem salvar o ponto neste aparelho.");
        setLoading(false);
        return;
      }
    } finally {
      setLoading(false);
    }

    window.setTimeout(() => navigate(`/app-mecanico/${mecanico.acesso_id}`), 1500);
  };

  return (
    <Card className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">{LABELS[tipo]}</h1>
      <div className="space-y-2 text-sm">
        <p><span className="text-muted-foreground">Mecânico:</span> {mecanico.nome}</p>
        {mecanico.empresa && <p><span className="text-muted-foreground">Empresa:</span> {mecanico.empresa}</p>}
        {mecanico.registro_teste && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">Registro de teste: aparece para validação, mas não entra em fechamento oficial.</p>}
        <p><span className="text-muted-foreground">Data/Hora:</span> {formatarAgoraBrasil()}</p>
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          {temGps ? `${pos.lat!.toFixed(5)}, ${pos.lng!.toFixed(5)}` : locating ? "Obtendo localização..." : "Localização obrigatória não disponível"}
        </p>
      </div>

      {!temGps && !locating && (
        <div className="space-y-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-700">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Ative a localização do celular. O ponto não é concluído sem GPS.</span></div>
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void atualizarLocalizacao()}><LocateFixed className="mr-2 h-4 w-4" /> Tentar localização novamente</Button>
        </div>
      )}
      {temGps && <div className="flex items-center gap-2 rounded bg-emerald-500/10 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" /> GPS confirmado para este registro.</div>}
      {pendentes > 0 && <div className="flex items-start gap-2 rounded bg-blue-500/10 p-3 text-sm text-blue-700"><Loader2 className="mt-0.5 h-4 w-4" /><span>{pendentes} ponto(s) aguardando sincronização automática.</span></div>}

      {exigirSelfie && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Prova de vida — selfie ao vivo obrigatória</p>
          {selfieDataUrl ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Selfie capturada
              <Button variant="ghost" size="sm" onClick={() => { setSelfieDataUrl(null); setOpenCam(true); }}><RotateCcw className="mr-1 h-3 w-3" /> Refazer</Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setOpenCam(true)}><Camera className="mr-2 h-4 w-4" /> Tirar selfie agora</Button>
          )}
        </div>
      )}

      {doneMessage ? <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-5 w-5" /> {doneMessage}</div> : <Button onClick={() => void registrar()} disabled={loading || locating || !temGps} className="h-12 w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}</Button>}

      <CameraCapture open={openCam} onClose={() => setOpenCam(false)} onCapture={handleSelfie} facing="user" allowGallery={false} title="Selfie de Entrada" hint="Centralize o rosto. A foto deve ser tirada agora." />
    </Card>
  );
}