import React, { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface SelfieCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (blob: Blob) => Promise<void> | void;
  title?: string;
}

const SelfieCapture: React.FC<SelfieCaptureProps> = ({ open, onClose, onCapture, title = 'Selfie de Entrada' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(true);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    setStarting(true);
    setPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      toast.error('Não foi possível acessar a câmera: ' + (err.message || 'permissão negada'));
      onClose();
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (open) startCamera();
    else stopStream();
    return stopStream;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const takePhoto = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // Flip horizontal so it looks like a mirror
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    setPhoto(c.toDataURL('image/jpeg', 0.85));
    stopStream();
  };

  const retake = () => startCamera();

  const confirm = async () => {
    if (!canvasRef.current) return;
    setLoading(true);
    canvasRef.current.toBlob(
      async (blob) => {
        if (!blob) {
          setLoading(false);
          return;
        }
        try {
          await onCapture(blob);
          stopStream();
          onClose();
        } catch (err: any) {
          toast.error(err.message || 'Erro ao salvar selfie');
        } finally {
          setLoading(false);
        }
      },
      'image/jpeg',
      0.85,
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (stopStream(), onClose())}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-black border-0">
        <div className="relative bg-black aspect-[3/4] w-full flex items-center justify-center">
          {starting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 z-10">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Iniciando câmera...</p>
            </div>
          )}
          {photo ? (
            <img src={photo} alt="Selfie" className="w-full h-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          )}
          <canvas ref={canvasRef} className="hidden" />

          {/* Header overlay */}
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              <span className="font-semibold text-sm">{title}</span>
            </div>
            <button onClick={() => { stopStream(); onClose(); }} className="p-1 rounded-full bg-white/10 hover:bg-white/20">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Face guide */}
          {!photo && !starting && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-72 rounded-[50%] border-2 border-white/40 border-dashed" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 bg-black flex items-center justify-center gap-4">
          {photo ? (
            <>
              <Button onClick={retake} variant="outline" className="flex-1 bg-white/10 text-white border-white/20 hover:bg-white/20" disabled={loading}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Refazer
              </Button>
              <Button onClick={confirm} className="flex-1 bg-green-500 hover:bg-green-600 text-white" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Confirmar
              </Button>
            </>
          ) : (
            <Button
              onClick={takePhoto}
              disabled={starting}
              className="w-20 h-20 rounded-full bg-white hover:bg-white/90 p-0 border-4 border-white/40"
            >
              <div className="w-full h-full rounded-full bg-white border-2 border-black/20" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SelfieCapture;
