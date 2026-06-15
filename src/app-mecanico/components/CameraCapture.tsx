import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Camera, RotateCcw, Check, X, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (blob: Blob) => Promise<void> | void;
  facing?: "user" | "environment";
  title?: string;
  hint?: string;
}

/**
 * Câmera mobile-first reutilizável (selfie ou traseira).
 * Garante prova de vida para ponto e foto da bomba/painel para abastecimento.
 */
export default function CameraCapture({ open, onClose, onCapture, facing = "user", title = "Foto", hint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openRef = useRef(open);
  const [foto, setFoto] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const start = async () => {
    setStarting(true); setErro(null); setFoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1440 } },
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
    } catch {
      setErro("Permita acesso à câmera para concluir o registro.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    openRef.current = open;
    if (open) void start(); else stop();
    return () => {
      openRef.current = false;
      stop();
    };
    // `start` and `stop` intentionally follow the current camera props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  const tirar = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    if (!v.videoWidth || !v.videoHeight) {
      toast.error("A câmera ainda não está pronta. Tente novamente.");
      return;
    }
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d"); if (!ctx) return;
    if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    setFoto(c.toDataURL("image/jpeg", 0.85));
    stop();
  };

  const confirmar = async () => {
    if (!canvasRef.current) return;
    setSaving(true);
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) { setSaving(false); return; }
      try {
        await onCapture(blob);
        stop(); onClose();
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Erro ao salvar foto");
      } finally { setSaving(false); }
    }, "image/jpeg", 0.85);
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
              <Button onClick={start} variant="secondary" size="sm">Tentar novamente</Button>
            </div>
          )}
          {foto ? (
            <img src={foto} alt="Captura" className="w-full h-full object-cover" />
          ) : (
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover"
              style={facing === "user" ? { transform: "scaleX(-1)" } : undefined} />
          )}
          <canvas ref={canvasRef} className="hidden" />

          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between text-white">
            <div className="flex items-center gap-2"><Camera className="w-5 h-5" /><span className="font-semibold text-sm">{title}</span></div>
            <button onClick={() => { stop(); onClose(); }} className="p-1 rounded-full bg-white/10 hover:bg-white/20"><X className="w-4 h-4" /></button>
          </div>

          {hint && !foto && !starting && !erro && (
            <div className="absolute bottom-3 left-3 right-3 bg-black/60 text-white text-xs px-3 py-2 rounded text-center">{hint}</div>
          )}
        </div>

        <div className="p-4 bg-black flex items-center justify-center gap-4">
          {foto ? (
            <>
              <Button onClick={start} variant="outline" className="flex-1 bg-white/10 text-white border-white/20 hover:bg-white/20" disabled={saving}>
                <RotateCcw className="w-4 h-4 mr-2" /> Refazer
              </Button>
              <Button onClick={confirmar} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Confirmar
              </Button>
            </>
          ) : (
            <Button onClick={tirar} disabled={starting || !!erro}
              className="w-20 h-20 rounded-full bg-white hover:bg-white/90 p-0 border-4 border-white/40">
              <div className="w-full h-full rounded-full bg-white border-2 border-black/20" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
