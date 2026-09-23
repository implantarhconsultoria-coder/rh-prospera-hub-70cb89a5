import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Camera, RotateCcw, Check, X, Loader2, AlertTriangle, ImageUp } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (blob: Blob) => Promise<void> | void;
  facing?: "user" | "environment";
  title?: string;
  hint?: string;
  allowGallery?: boolean;
  galleryMaxAgeMinutes?: number;
}

const MAX_CAPTURE_SIDE = 1440;
const JPEG_QUALITY = 0.8;

const getCameraMessage = (error: unknown) => {
  const name = error instanceof DOMException ? error.name : String((error as { name?: string })?.name || "");
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "A câmera está bloqueada. Libere a permissão da câmera nas configurações do navegador e tente novamente.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhuma câmera foi encontrada neste aparelho.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "A câmera está sendo usada por outro aplicativo. Feche a câmera em outros apps e tente novamente.";
  }
  if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
    return "Abra o app pelo endereço seguro HTTPS para liberar a câmera.";
  }
  return "Não foi possível abrir a câmera. Tente novamente.";
};

const waitForVideo = (video: HTMLVideoElement) => new Promise<void>((resolve, reject) => {
  if (video.readyState >= 2 && video.videoWidth > 0) {
    resolve();
    return;
  }
  const timer = window.setTimeout(() => {
    cleanup();
    reject(new Error("camera_timeout"));
  }, 10000);
  const onReady = () => {
    if (!video.videoWidth) return;
    cleanup();
    resolve();
  };
  const onError = () => {
    cleanup();
    reject(new Error("camera_video_failed"));
  };
  const cleanup = () => {
    window.clearTimeout(timer);
    video.removeEventListener("loadedmetadata", onReady);
    video.removeEventListener("canplay", onReady);
    video.removeEventListener("error", onError);
  };
  video.addEventListener("loadedmetadata", onReady);
  video.addEventListener("canplay", onReady);
  video.addEventListener("error", onError);
});

const requestCamera = async (facing: "user" | "environment") => {
  if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("Camera unavailable", "NotFoundError");
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 1600 },
      },
      audio: false,
    });
  } catch (error: unknown) {
    const name = String((error as { name?: string })?.name || "");
    if (!["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(name)) throw error;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
};

const drawScaled = (
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  mirror = false,
) => {
  const scale = Math.min(1, MAX_CAPTURE_SIDE / Math.max(sourceWidth, sourceHeight));
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a foto.");
  context.save();
  if (mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  context.restore();
};

const canvasToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) reject(new Error("Não foi possível gerar a foto. Tente novamente."));
    else resolve(blob);
  }, "image/jpeg", JPEG_QUALITY);
});

export default function CameraCapture({
  open,
  onClose,
  onCapture,
  facing = "user",
  title = "Foto",
  hint,
  allowGallery = true,
  galleryMaxAgeMinutes,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startIdRef = useRef(0);
  const [foto, setFoto] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const galleryEnabled = allowGallery !== false;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    const startId = ++startIdRef.current;
    setStarting(true);
    setErro(null);
    setFoto(null);
    stop();
    try {
      const stream = await requestCamera(facing);
      if (startId !== startIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("camera_video_failed");
      }
      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      await waitForVideo(video);
    } catch (error) {
      console.error("Erro ao iniciar câmera do app mecânico:", error);
      stop();
      setErro(getCameraMessage(error));
    } finally {
      if (startId === startIdRef.current) setStarting(false);
    }
  }, [facing, stop]);

  useEffect(() => {
    if (open) void start();
    else {
      startIdRef.current += 1;
      stop();
      setFoto(null);
      setErro(null);
    }
    return () => {
      startIdRef.current += 1;
      stop();
    };
  }, [open, start, stop]);

  const tirar = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      toast.error("A câmera ainda não está pronta. Tente novamente.");
      return;
    }
    try {
      drawScaled(canvas, video, video.videoWidth, video.videoHeight, facing === "user");
      setFoto(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      stop();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível tirar a foto.");
    }
  };

  const carregarDaGaleria = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (galleryMaxAgeMinutes && galleryMaxAgeMinutes > 0) {
      const capturedAt = Number(file.lastModified || 0);
      const age = Date.now() - capturedAt;
      const maxAge = galleryMaxAgeMinutes * 60 * 1000;
      if (!capturedAt || age < -5 * 60 * 1000 || age > maxAge) {
        toast.error("Foto não aceita: use uma imagem recente ou tire uma nova foto.");
        return;
      }
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Não foi possível preparar a imagem.");
        drawScaled(canvas, image, image.naturalWidth, image.naturalHeight);
        setFoto(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
        setErro(null);
        stop();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível abrir essa imagem.");
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      toast.error("Não foi possível abrir essa imagem. Selecione outra foto.");
    };
    image.src = objectUrl;
  };

  const confirmar = async () => {
    const canvas = canvasRef.current;
    if (!canvas || saving) return;
    setSaving(true);
    try {
      const blob = await canvasToBlob(canvas);
      if (blob.size > 5 * 1024 * 1024) throw new Error("A foto ficou muito grande. Tire novamente.");
      await onCapture(blob);
      stop();
      onClose();
    } catch (error) {
      console.error("Erro ao salvar foto do app mecânico:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao salvar foto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !saving) { stop(); onClose(); } }}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-black border-0">
        <div className="relative bg-black aspect-[3/4] w-full flex items-center justify-center">
          {starting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 z-10 pointer-events-none">
              <Loader2 className="w-8 h-8 animate-spin" /><p className="text-sm">Iniciando câmera...</p>
            </div>
          )}
          {erro && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 z-10 p-6 text-center bg-black">
              <AlertTriangle className="w-10 h-10 text-yellow-400" />
              <p className="text-sm">{erro}</p>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <Button onClick={() => void start()} variant="secondary" size="sm">Tentar câmera novamente</Button>
                {galleryEnabled && <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm" className="bg-white text-black"><ImageUp className="w-4 h-4 mr-2" />Adicionar foto da galeria</Button>}
              </div>
            </div>
          )}
          {foto ? (
            <img src={foto} alt="Captura" className="w-full h-full object-contain" />
          ) : (
            <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" style={facing === "user" ? { transform: "scaleX(-1)" } : undefined} />
          )}
          <canvas ref={canvasRef} className="hidden" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void carregarDaGaleria(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between text-white">
            <div className="flex items-center gap-2"><Camera className="w-5 h-5" /><span className="font-semibold text-sm">{title}</span></div>
            <button onClick={() => { if (!saving) { stop(); onClose(); } }} className="p-1 rounded-full bg-white/10 hover:bg-white/20" aria-label="Fechar"><X className="w-4 h-4" /></button>
          </div>

          {hint && !foto && !starting && !erro && (
            <div className="absolute bottom-3 left-3 right-3 bg-black/60 text-white text-xs px-3 py-2 rounded text-center">{hint}</div>
          )}
        </div>

        <div className="p-4 bg-black space-y-3">
          {foto ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => void start()} variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20" disabled={saving || starting}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Refazer
                </Button>
                <Button onClick={() => void confirmar()} className="bg-emerald-500 hover:bg-emerald-600 text-white" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Confirmar
                </Button>
              </div>
              {galleryEnabled && (
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full bg-white text-black border-white hover:bg-white/90" disabled={saving}>
                  <ImageUp className="w-4 h-4 mr-2" /> Adicionar outra foto da galeria
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-center">
                <Button onClick={tirar} disabled={starting || !!erro} className="w-20 h-20 rounded-full bg-white hover:bg-white/90 p-0 border-4 border-white/40" aria-label="Tirar foto">
                  <div className="w-full h-full rounded-full bg-white border-2 border-black/20" />
                </Button>
              </div>
              {galleryEnabled && (
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full bg-white text-black border-white hover:bg-white/90" disabled={saving}>
                  <ImageUp className="w-4 h-4 mr-2" /> Adicionar foto da galeria
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
