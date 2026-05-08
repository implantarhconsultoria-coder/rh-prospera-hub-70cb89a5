import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { uploadFoto } from "../lib/upload";
import { getBrowserLocation } from "@/lib/browserGeo";
import CameraCapture from "../components/CameraCapture";
import { toast } from "sonner";
import { AlertTriangle, Camera, Check, Fuel, Gauge, Loader2, QrCode, RotateCcw } from "lucide-react";
import QrScanner from "qr-scanner";

type Step = "scan" | "vale" | "bomba" | "painel" | "form" | "ok";
type CameraMode = "environment" | "user" | null;

type ScanFeedback = {
  title: string;
  detail?: string;
  reason:
    | "https"
    | "unsupported"
    | "blocked"
    | "no-camera"
    | "busy"
    | "technical"
    | "qr"
    | "permission";
};

interface Posto {
  id: string;
  codigo: string;
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
}

interface MecInfo {
  nome: string;
  empresa: string;
  filial: string;
}

const CANONICAL_BASE_URL = "https://implantarhprpro.com";
const supabaseRpc = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export default function AbastecimentoPage() {
  const { mecanico } = useMecanicoApp();
  const [step, setStep] = useState<Step>("scan");
  const [posto, setPostoData] = useState<Posto | null>(null);
  const [mecInfo, setMecInfo] = useState<MecInfo | null>(null);
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);

  const [camBomba, setCamBomba] = useState(false);
  const [camPainel, setCamPainel] = useState(false);
  const [fotoBombaUrl, setFotoBombaUrl] = useState<string | null>(null);
  const [fotoPainelUrl, setFotoPainelUrl] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);

  const [valor, setValor] = useState("");
  const [litros, setLitros] = useState("");
  const [combustivel, setCombustivel] = useState("Diesel S10");
  const [postoNome, setPostoNome] = useState("");
  const [placa, setPlaca] = useState("");
  const [km, setKm] = useState("");
  const [obs, setObs] = useState("");

  const scannerRef = useRef<QrScanner | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const secureContext = typeof window !== "undefined" && (window.isSecureContext || window.location.hostname === "localhost");
  const canonicalUrl = useMemo(() => {
    if (typeof window === "undefined") return CANONICAL_BASE_URL;
    return `${CANONICAL_BASE_URL}${window.location.pathname}${window.location.search}${window.location.hash}`;
  }, []);
  const isCanonicalHost = typeof window !== "undefined" && window.location.origin === CANONICAL_BASE_URL;

  const stopScanner = async () => {
    const instance = scannerRef.current;
    if (instance) {
      try {
        instance.stop();
      } catch {
        void 0;
      }
      try {
        instance.destroy();
      } catch {
        void 0;
      }
      scannerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
    setScanLoading(false);
    setCameraMode(null);
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const getPermissionHint = (reason: ScanFeedback["reason"]) => {
    switch (reason) {
      case "https":
        return "Abra o App Mecânico pelo endereço seguro https://implantarhprpro.com para usar a câmera.";
      case "blocked":
      case "permission":
        return "Toque no cadeado/ícone do site no navegador > Permissões > Câmera > Permitir. Depois toque em Tentar novamente.";
      case "no-camera":
        return "Use outro aparelho com câmera ou continue pelo envio da foto do QR / digitação manual.";
      case "unsupported":
        return "Atualize o navegador do celular. Chrome Android e Safari iPhone são compatíveis.";
      case "busy":
        return "Feche outros apps que estejam usando a câmera e tente novamente.";
      case "technical":
      case "qr":
      default:
        return "Se a câmera não abrir, continue pela galeria ou digite o código manualmente.";
    }
  };

  const getCameraPermissionState = async () => {
    try {
      if (!navigator.permissions?.query) return null;
      const result = await navigator.permissions.query({ name: "camera" as PermissionName });
      return result.state;
    } catch {
      return null;
    }
  };

  const resolveCameraError = async (error?: unknown): Promise<ScanFeedback> => {
    if (!secureContext) {
      return {
        title: "A câmera exige conexão segura HTTPS.",
        detail: `Abra pelo endereço seguro ${CANONICAL_BASE_URL}.`,
        reason: "https",
      };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return {
        title: "Este navegador não suporta acesso à câmera.",
        detail: "Use Chrome no Android ou Safari no iPhone atualizado.",
        reason: "unsupported",
      };
    }

    const permissionState = await getCameraPermissionState();
    const name = typeof error === "object" && error && "name" in error ? String((error as { name?: string }).name) : "";
    const message = typeof error === "object" && error && "message" in error ? String((error as { message?: string }).message) : String(error || "");

    if (permissionState === "denied" || name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        title: "A câmera foi bloqueada no navegador.",
        detail: "Permita o uso da câmera para continuar a leitura do QR Code.",
        reason: permissionState === "denied" ? "blocked" : "permission",
      };
    }

    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        title: "Nenhuma câmera foi encontrada neste aparelho.",
        detail: "Use a galeria ou digite o código do QR manualmente.",
        reason: "no-camera",
      };
    }

    if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
      return {
        title: "A câmera está ocupada ou indisponível no momento.",
        detail: "Feche outros aplicativos que estejam usando a câmera e tente novamente.",
        reason: "busy",
      };
    }

    if (name === "SecurityError") {
      return {
        title: "O navegador bloqueou o acesso à câmera.",
        detail: `Abra o App Mecânico em ${CANONICAL_BASE_URL}.`,
        reason: "https",
      };
    }

    return {
      title: "Não foi possível abrir a câmera.",
      detail: message && message !== "undefined" ? message : "Erro técnico ao iniciar o leitor de QR Code.",
      reason: "technical",
    };
  };

  const requestCameraStream = async () => {
    const attempts: Array<{ constraints: MediaStreamConstraints; mode: CameraMode }> = [
      {
        mode: "environment",
        constraints: {
          audio: false,
          video: {
            facingMode: { exact: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
      },
      {
        mode: "environment",
        constraints: {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
      },
      {
        mode: "user",
        constraints: {
          audio: false,
          video: {
            facingMode: { exact: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
      },
      {
        mode: "user",
        constraints: {
          audio: false,
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
      },
    ];

    let lastError: unknown = null;

    for (const attempt of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
        return { stream, mode: attempt.mode };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  };

  const iniciarScanner = async () => {
    setScanFeedback(null);

    if (typeof window !== "undefined" && window.location.hostname !== "localhost" && !isCanonicalHost) {
      window.location.assign(canonicalUrl);
      return;
    }

    if (!secureContext) {
      setScanFeedback(await resolveCameraError());
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanFeedback(await resolveCameraError());
      return;
    }

    setScanLoading(true);

    // Dispara getUserMedia IMEDIATAMENTE dentro do gesto do usuário
    // para garantir que o popup nativo de permissão apareça no Android/iOS.
    let stream: MediaStream | null = null;
    let mode: CameraMode = "environment";
    try {
      await stopScanner();
      const result = await requestCameraStream();
      stream = result.stream;
      mode = result.mode;
    } catch (error) {
      setScanFeedback(await resolveCameraError(error));
      setScanLoading(false);
      return;
    }

    try {
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        setScanFeedback({
          title: "Não foi possível preparar a câmera.",
          detail: "Atualize a página e tente novamente.",
          reason: "technical",
        });
        setScanLoading(false);
        return;
      }
      // Libera o stream temporário; QrScanner reabre com o modo correto
      stream.getTracks().forEach((t) => t.stop());

      const scanner = new QrScanner(
        video,
        (result) => {
          const decoded = typeof result === "string" ? result : result.data;
          stopScanner();
          setCodigo(decoded);
          validarQr(decoded);
        },
        {
          preferredCamera: mode || "environment",
          maxScansPerSecond: 8,
          highlightScanRegion: false,
          highlightCodeOutline: false,
          returnDetailedScanResult: true,
          onDecodeError: () => {},
        },
      );

      scannerRef.current = scanner;
      await scanner.start();
      setScanning(true);
      setCameraMode(mode);
    } catch (error) {
      setScanFeedback(await resolveCameraError(error));
      await stopScanner();
    } finally {
      setScanLoading(false);
    }
  };

  const lerArquivoQr = async (file: File) => {
    setScanFeedback(null);
    try {
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
        alsoTryWithoutScanRegion: true,
      });
      const decoded = typeof result === "string" ? result : result.data;
      setCodigo(decoded);
      validarQr(decoded);
    } catch (error) {
      const message = typeof error === "object" && error && "message" in error ? String((error as { message?: string }).message) : "";
      setScanFeedback({
        title: "Não foi possível ler o QR da imagem.",
        detail: message && message !== "undefined" ? message : "Tente outra foto com foco melhor e boa iluminação.",
        reason: "qr",
      });
    }
  };

  const validarQr = async (cod: string) => {
    if (!cod) {
      toast.error("Informe o código do QR");
      return;
    }
    setLoading(true);
    const { data, error } = await supabaseRpc.rpc("app_mecanico_validar_qr_posto", {
      p_acesso_id: mecanico.acesso_id,
      p_codigo: cod.trim(),
    });
    setLoading(false);
    const r = (data ?? null) as { ok?: boolean; error?: string; posto?: Posto; mecanico?: MecInfo } | null;
    if (error || !r?.ok) {
      const err = r?.error || error?.message || "qr_invalido";
      const map: Record<string, string> = {
        qr_nao_encontrado: "QR Code do posto ainda não foi gerado no admin.",
        qr_bloqueado: "QR Code bloqueado pelo administrador.",
        acesso_nao_autorizado: "Acesso não autorizado.",
      };
      const msg = map[err] || "Erro ao validar QR Code.";
      toast.error(msg);
      setScanFeedback({
        title: msg,
        detail: "Confira o código lido, envie uma foto mais nítida ou digite manualmente.",
        reason: "qr",
      });
      setStep("scan");
      return;
    }
    setPostoData(r.posto);
    setMecInfo(r.mecanico);
    setPostoNome(r.posto?.nome || "");
    setStep("vale");
  };

  const onCaptureBomba = async (blob: Blob) => {
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "bomba", blob);
      setFotoBombaUrl(url);
      setAnalisando(true);
      try {
        const dataUrl = await blobToDataUrl(blob);
        const { data } = await supabase.functions.invoke("ocr-bomba-combustivel", { body: { dataUrl } });
        const r = (data ?? null) as { ok?: boolean; valor?: string | number; litros?: string | number; combustivel?: string } | null;
        if (r?.ok) {
          if (r.valor) setValor(String(r.valor));
          if (r.litros) setLitros(String(r.litros));
          if (r.combustivel) setCombustivel(r.combustivel);
        }
      } catch {
        void 0;
      }
      setAnalisando(false);
      setStep("painel");
      toast.success("Foto da bomba salva. Agora a foto do painel/KM.");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) || "Erro no upload");
    } finally {
      setLoading(false);
    }
  };

  const onCapturePainel = async (blob: Blob) => {
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "painel", blob);
      setFotoPainelUrl(url);
      setStep("form");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) || "Erro no upload");
    } finally {
      setLoading(false);
    }
  };

  const finalizar = async () => {
    if (!posto) return;
    if (!fotoBombaUrl || !fotoPainelUrl) {
      toast.error("Fotos obrigatórias");
      return;
    }
    if (!valor || !litros) {
      toast.error("Informe valor e litros");
      return;
    }
    setLoading(true);
    const { latitude, longitude } = await getBrowserLocation();
    const { data, error } = await supabaseRpc.rpc("app_mecanico_registrar_abastecimento_posto", {
      p_acesso_id: mecanico.acesso_id,
      p_posto_codigo: posto.codigo,
      p_valor: Number(valor),
      p_litros: Number(litros),
      p_combustivel: combustivel,
      p_km: km ? Number(km) : null,
      p_placa: placa || null,
      p_observacao: obs || null,
      p_foto_bomba_url: fotoBombaUrl,
      p_foto_painel_url: fotoPainelUrl,
      p_latitude: latitude,
      p_longitude: longitude,
      p_endereco: null,
    });
    setLoading(false);
    const r = (data ?? null) as { ok?: boolean; error?: string } | null;
    if (error || !r?.ok) {
      toast.error(r?.error || error?.message || "Erro ao salvar");
      return;
    }
    toast.success("Abastecimento registrado!");
    setStep("ok");
  };

  const reset = () => {
    stopScanner();
    setPostoData(null);
    setMecInfo(null);
    setCodigo("");
    setFotoBombaUrl(null);
    setFotoPainelUrl(null);
    setValor("");
    setLitros("");
    setKm("");
    setObs("");
    setScanFeedback(null);
    setStep("scan");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
            <Fuel className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold">Abastecimento</h1>
            <p className="text-xs text-muted-foreground">QR Code + foto da bomba + foto do painel</p>
          </div>
        </div>
      </Card>

      {step === "scan" && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <QrCode className="h-4 w-4" /> Ler QR Code do posto
          </div>

          {!secureContext && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">A câmera precisa de HTTPS.</div>
              <p className="mt-1">Use o App Mecânico em {CANONICAL_BASE_URL} para liberar a câmera no celular.</p>
              {!isCanonicalHost && (
                <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => window.location.assign(canonicalUrl)}>
                  Abrir versão segura
                </Button>
              )}
            </div>
          )}

          <div className={`overflow-hidden rounded-xl border border-border bg-muted ${scanning || scanLoading ? "block aspect-square" : "hidden"}`}>
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
          </div>

          {!scanning ? (
            <Button className="w-full" onClick={iniciarScanner} disabled={loading || scanLoading}>
              {scanLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Abrir câmera para ler QR
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Câmera {cameraMode === "environment" ? "traseira" : "frontal"} ativa. Aponte para o QR Code do posto.
              </div>
              <Button variant="outline" className="w-full" onClick={stopScanner}>
                Parar câmera
              </Button>
            </div>
          )}

          {scanFeedback && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                <div className="space-y-1">
                  <div className="font-semibold text-foreground">{scanFeedback.title}</div>
                  {scanFeedback.detail && <div className="text-muted-foreground">{scanFeedback.detail}</div>}
                  <div className="text-muted-foreground">{getPermissionHint(scanFeedback.reason)}</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {(scanFeedback.reason === "blocked" || scanFeedback.reason === "permission") && (
                  <Button type="button" className="w-full" onClick={iniciarScanner} disabled={scanLoading}>
                    {scanLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                    Liberar câmera
                  </Button>
                )}
                <Button type="button" variant="outline" className="w-full" onClick={iniciarScanner} disabled={scanLoading}>
                  {scanLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  Tentar novamente
                </Button>
                {scanFeedback.reason === "https" && !isCanonicalHost && (
                  <Button type="button" variant="secondary" className="w-full" onClick={() => window.location.assign(canonicalUrl)}>
                    Abrir em {CANONICAL_BASE_URL}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs">Enviar foto do QR (galeria)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) lerArquivoQr(file);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()}>
              Enviar imagem do QR
            </Button>
          </div>

          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs">Ou digite o código manualmente</Label>
            <div className="flex gap-2">
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="COMB-XXXXXXX" />
              <Button onClick={() => validarQr(codigo)} disabled={loading || !codigo}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === "vale" && posto && (
        <Card className="space-y-3 p-4">
          <div className="text-xs font-semibold uppercase text-muted-foreground">QR validado</div>
          <div className="space-y-1 text-sm">
            <div><b>Mecânico:</b> {mecInfo?.nome}</div>
            <div><b>Empresa:</b> {mecInfo?.empresa || "—"} {mecInfo?.filial ? `· ${mecInfo.filial}` : ""}</div>
            <div><b>Posto:</b> {posto.nome}</div>
            {posto.cnpj && <div className="text-xs text-muted-foreground">CNPJ: {posto.cnpj}</div>}
            {posto.endereco && <div className="text-xs text-muted-foreground">{posto.endereco}</div>}
            <div className="text-xs text-muted-foreground">Código: {posto.codigo}</div>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleString("pt-BR")}</div>
          </div>
          <Button className="w-full" onClick={() => setCamBomba(true)}>
            <Camera className="mr-2 h-4 w-4" /> Tirar foto da bomba
          </Button>
          <Button className="w-full" variant="outline" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" /> Cancelar
          </Button>
        </Card>
      )}

      {step === "painel" && (
        <Card className="space-y-3 p-4">
          {analisando && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Analisando foto da bomba...
            </div>
          )}
          {fotoBombaUrl && <img src={fotoBombaUrl} className="w-full rounded-lg" alt="Bomba" />}
          <Button className="w-full" onClick={() => setCamPainel(true)}>
            <Gauge className="mr-2 h-4 w-4" /> Tirar foto do painel/KM
          </Button>
          <Button className="w-full" variant="outline" onClick={() => setCamBomba(true)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Refazer foto da bomba
          </Button>
        </Card>
      )}

      {step === "form" && (
        <Card className="space-y-3 p-4">
          <div className="text-sm font-semibold">Confirme os dados</div>
          {fotoBombaUrl && fotoPainelUrl && (
            <div className="grid grid-cols-2 gap-2">
              <img src={fotoBombaUrl} className="w-full rounded-lg" alt="Bomba" />
              <img src={fotoPainelUrl} className="w-full rounded-lg" alt="Painel" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" inputMode="decimal" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Litros</Label>
              <Input type="number" inputMode="decimal" step="0.001" value={litros} onChange={(e) => setLitros(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Combustível</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={combustivel}
                onChange={(e) => setCombustivel(e.target.value)}
              >
                <option>Diesel S10</option>
                <option>Diesel</option>
                <option>Gasolina</option>
                <option>Etanol</option>
                <option>GNV</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">KM</Label>
              <Input type="number" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Placa</Label>
              <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Posto</Label>
              <Input value={postoNome} onChange={(e) => setPostoNome(e.target.value)} disabled />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Observação</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>
          <Button className="w-full" onClick={finalizar} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Finalizar abastecimento
          </Button>
        </Card>
      )}

      {step === "ok" && (
        <Card className="space-y-3 p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <div className="text-lg font-bold">Abastecimento registrado</div>
          <p className="text-sm text-muted-foreground">As fotos e dados foram salvos.</p>
          <Button onClick={reset} className="w-full">Novo abastecimento</Button>
        </Card>
      )}

      <CameraCapture
        open={camBomba}
        onClose={() => setCamBomba(false)}
        onCapture={onCaptureBomba}
        facing="environment"
        title="Foto da bomba"
        hint="Mostre o visor com valor, litros e tipo"
      />
      <CameraCapture
        open={camPainel}
        onClose={() => setCamPainel(false)}
        onCapture={onCapturePainel}
        facing="environment"
        title="Foto do painel/KM"
        hint="Mostre o hodômetro/KM atual"
      />
    </div>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}
