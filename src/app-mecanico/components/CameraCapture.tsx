import { useEffect, useRef, useState } from "react";
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
}

const getCameraMessage = (error: unknown) => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Permita acesso à câmera no navegador ou selecione uma foto da galeria.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhuma câmera foi encontrada neste aparelho. Selecione uma foto da galeria.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "A câmera está em uso por outro aplicativo. Feche a câmera ou selecione uma foto da galeria.";
  }
  if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
    return "Abra o app em um endereço seguro HTTPS ou selecione uma foto da galeria.";
  }
  return "Não foi possível abrir a câmera. Tente novamente ou selecione uma foto da galeria.";
};

/**
 * Câmera mobile-first reutilizável.
 * Fotos operacionais com câmera traseira também podem ser escolhidas da galeria.
 * Selfies continuam exigindo captura ao vivo por padrão.
 */
export default function CameraCapture({
  open,
  onClose,
  onCapture,
  facing = "user",
  title = "Foto",
  hint,
  allowGallery,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openRef = useRef(open);
  const [foto, setFoto] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const galleryEnabled = allowGallery ?? facing === "environment";

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setErro(null);
    setFoto(null);
    stop();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro(galleryEnabled
          ? "Este navegador não liberou acesso à câmera. Selecione uma foto da galeria."
          : "Este navegador não liberou acesso à câmera. Use Chrome/Safari atualizado ou HTTPS.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1080 }, height: { ideal: 1440 } },
        audio: false,
      });

      if (!openRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error("Erro ao iniciar câmera do app mecânico:", error);
      setErro(getCameraMessage(error));
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    openRef.current = open;
    if (open) void start();
    else stop();
    return () => {
      openRef.current = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  const tirar = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) {
      toast.error("Câmera não inicializada. Tente novamente.");
      return;
    }
    if (!v.videoWidth || !v.videoHeight) {
      toast.error("A câmera ainda não está pronta. Tente novamente.");
      return;
    }
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) {
      toast.error("Não foi possível preparar a foto.");
      return;
    }
    ctx.save();
    if (facing === "user") {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    ctx.restore();
    setFoto(c.toDataURL("image/jpeg", 0.85));
    stop();
  };

  const carregarDaGaleria = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        URL.revokeObjectURL(objectUrl);
        toast.error("Não foi possível preparar a imagem.");
        return;
      }

      const maxDimension = 2000;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        toast.error("Não foi possível preparar a imagem.");
        return;
      }

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      setFoto(canvas.toDataURL("image/jpeg", 0.88));
      setErro(null);
      stop();
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      toast.error("Não foi possível abrir essa imagem. Selecione outra foto.");
    };
    image.src = objectUrl;
  };

  const confirmar = async () => {
    if (!canvasRef.current || saving) return;
    setSaving(true);
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) {
        setSaving(false);
        toast.error("Não foi possível gerar a foto. Tente novamente.");
        return;
      }
      try {
        await onCapture(blob);
        stop();
        onClose();
      } catch (error: unknown) {
        console.error("Erro ao salvar foto do app mecânico:", error);
        toast.error(error instanceof Error ? error.message : "Erro ao salvar foto");
      } finally {
        setSaving(false);
      }
    }, "image/jpeg", 0.88);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { stop(); onClose(); } }}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-black border-0">
        <div className="relative bg-black aspect-[3/4] w-full flex items-center justify-center">
          {starting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 z-10">
              <Loader2 className="w-8 h-8 animate-spin" /><p className="text-sm">Iniciando câmera...</p>
            </div>
          )}
          {erro && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 z-10 p-6 text-center">
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
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" style={facing === "user" ? { transform: "scaleX(-1)" } : undefined} />
          )}
          <canvas ref={canvasRef} className="hidden" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              carregarDaGaleria(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between text-white">
            <div className="flex items-center gap-2"><Camera className="w-5 h-5" /><span className="font-semibold text-sm">{title}</span></div>
            <button onClick={() => { stop(); onClose(); }} className="p-1 rounded-full bg-white/10 hover:bg-white/20"><X className="w-4 h-4" /></button>
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
                <Button onClick={tirar} disabled={starting || !!erro} className="w-20 h-20 rounded-full bg-white hover:bg-white/90 p-0 border-4 border-white/40">
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
