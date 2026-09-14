import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, ScanFace, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type FaceMode = 'login' | 'enroll' | 'verify';

type Props = {
  mode: FaceMode;
  companyScope: string;
  session?: string;
  documentId?: string;
  onSuccess: (data: any) => void | Promise<void>;
  onCancel: () => void;
};

const SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js';
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/vladmandic/face-api@1.7.12/model';

let modelsPromise: Promise<any> | null = null;

const loadFaceApi = async () => {
  if (modelsPromise) return modelsPromise;
  modelsPromise = (async () => {
    const win = window as any;
    if (!win.faceapi) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`) as HTMLScriptElement | null;
        if (existing) {
          if ((window as any).faceapi) return resolve();
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('face_library_failed')), { once: true });
          return;
        }
        const script = document.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('face_library_failed'));
        document.head.appendChild(script);
      });
    }
    const api = (window as any).faceapi;
    if (!api) throw new Error('face_library_failed');
    await Promise.all([
      api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    return api;
  })().catch((error) => {
    modelsPromise = null;
    throw error;
  });
  return modelsPromise;
};

const captureJpeg = (video: HTMLVideoElement) => {
  const canvas = document.createElement('canvas');
  const sourceW = video.videoWidth || 640;
  const sourceH = video.videoHeight || 480;
  const targetW = Math.min(640, sourceW);
  const targetH = Math.round((sourceH / sourceW) * targetW);
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('camera_capture_failed');
  ctx.drawImage(video, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', 0.72);
};

const friendlyError = (code: string) => {
  const errors: Record<string, string> = {
    NotAllowedError: 'A câmera foi bloqueada. Libere a câmera para continuar.',
    PermissionDeniedError: 'A câmera foi bloqueada. Libere a câmera para continuar.',
    NotFoundError: 'Nenhuma câmera foi encontrada neste aparelho.',
    DevicesNotFoundError: 'Nenhuma câmera foi encontrada neste aparelho.',
    NotReadableError: 'A câmera está ocupada por outro aplicativo. Feche a câmera em outros apps e tente novamente.',
    TrackStartError: 'A câmera está ocupada por outro aplicativo. Feche a câmera em outros apps e tente novamente.',
    OverconstrainedError: 'Não foi possível iniciar a câmera com esta configuração. Tente novamente.',
    ConstraintNotSatisfiedError: 'Não foi possível iniciar a câmera com esta configuração. Tente novamente.',
    AbortError: 'A câmera foi interrompida. Tente novamente.',
    face_library_failed: 'Não foi possível carregar a leitura facial. Verifique a internet e tente novamente.',
    face_not_registered: 'Ainda não há reconhecimento facial cadastrado para este acesso. Entre pelos dados atuais e cadastre seu rosto.',
    face_not_recognized: 'Não conseguimos confirmar este rosto. Posicione-se de frente, com boa iluminação, e tente novamente.',
    face_not_clear: 'A imagem do rosto não ficou nítida. Melhore a iluminação e tente novamente.',
    invalid_session: 'Sua sessão expirou. Entre novamente para continuar.',
    session_expired: 'Sua sessão expirou. Entre novamente para continuar.',
    too_many_attempts: 'Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar novamente.',
  };
  return errors[code] || 'Não foi possível concluir a leitura facial. Tente novamente.';
};

const requestFrontCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('NotFoundError');
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 720 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (error: any) {
    const retryable = ['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error?.name || '');
    if (!retryable) throw error;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
};

const FaceRecognitionCapture: React.FC<Props> = ({ mode, companyScope, session, documentId, onSuccess, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const apiRef = useRef<any>(null);
  const submittingRef = useRef(false);
  const stableRef = useRef(0);
  const [stage, setStage] = useState<'loading' | 'camera' | 'reading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Preparando leitura facial...');
  const [error, setError] = useState('');

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const setup = async () => {
      try {
        setStage('loading');
        setMessage('Preparando leitura facial...');
        apiRef.current = await loadFaceApi();
        if (cancelled) return;

        const stream = await requestFrontCamera();
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error('camera_capture_failed');
        video.srcObject = stream;
        await video.play();
        setStage('camera');
        setMessage('Encaixe seu rosto no espaço indicado');

        const scan = async () => {
          if (cancelled || submittingRef.current || !videoRef.current || !apiRef.current) return;
          const currentVideo = videoRef.current;
          if (currentVideo.readyState < 2 || !currentVideo.videoWidth) return;
          try {
            setStage('reading');
            const api = apiRef.current;
            const result = await api
              .detectSingleFace(currentVideo, new api.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
              .withFaceLandmarks()
              .withFaceDescriptor();

            if (!result) {
              stableRef.current = 0;
              setMessage('Aproxime o rosto e olhe para a câmera');
              setStage('camera');
              return;
            }

            const box = result.detection.box;
            const vw = currentVideo.videoWidth;
            const vh = currentVideo.videoHeight;
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            const centered = Math.abs(centerX - vw / 2) < vw * 0.19 && Math.abs(centerY - vh / 2) < vh * 0.2;
            const largeEnough = box.width > vw * 0.27 && box.height > vh * 0.27;
            const clearEnough = Number(result.detection.score || 0) >= 0.55;

            if (!centered || !largeEnough || !clearEnough) {
              stableRef.current = 0;
              setMessage(!largeEnough ? 'Aproxime um pouco o rosto' : 'Centralize o rosto e olhe para a câmera');
              setStage('camera');
              return;
            }

            stableRef.current += 1;
            setMessage(stableRef.current >= 2 ? 'Rosto lido. Confirmando...' : 'Mantenha o rosto nessa posição...');
            if (stableRef.current < 2) return;

            submittingRef.current = true;
            const snapshot = captureJpeg(currentVideo);
            const action = mode === 'login' ? 'identify' : mode === 'enroll' ? 'enroll' : 'verify_signature';
            const response = await fetch('/api/payroll-face', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              cache: 'no-store',
              body: JSON.stringify({
                action,
                company_scope: companyScope,
                session: session || undefined,
                document_id: documentId || undefined,
                descriptor: Array.from(result.descriptor as Float32Array),
                face_score: Number(result.detection.score || 0),
                snapshot,
              }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.ok) throw new Error(data.error || `face_${response.status}`);
            setStage('success');
            setMessage(mode === 'login' ? 'Identidade confirmada. Acesso liberado.' : mode === 'enroll' ? 'Reconhecimento facial cadastrado.' : 'Rosto confirmado para esta assinatura.');
            stopCamera();
            await onSuccess(data);
          } catch (scanError: any) {
            submittingRef.current = false;
            stableRef.current = 0;
            const code = scanError?.message || 'face_failed';
            if (['face_not_recognized', 'face_not_clear'].includes(code)) {
              setError(friendlyError(code));
              setStage('error');
              return;
            }
            throw scanError;
          }
        };

        timer = window.setInterval(() => void scan().catch((scanError: any) => {
          if (cancelled) return;
          setError(friendlyError(scanError?.message || 'face_failed'));
          setStage('error');
          stopCamera();
        }), 850);
      } catch (setupError: any) {
        if (cancelled) return;
        setError(friendlyError(setupError?.name || setupError?.message || 'camera_failed'));
        setStage('error');
        stopCamera();
      }
    };

    void setup();
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stopCamera();
    };
  }, [mode, companyScope, session, documentId, onSuccess]);

  const title = mode === 'login' ? 'Acesso por reconhecimento facial' : mode === 'enroll' ? 'Cadastrar reconhecimento facial' : 'Confirmação facial da assinatura';
  const subtitle = mode === 'login'
    ? 'Encaixe seu rosto. O sistema identifica você e registra este acesso.'
    : mode === 'enroll'
      ? 'Seu rosto será vinculado com segurança ao seu cadastro para facilitar os próximos acessos.'
      : 'Esta leitura será registrada como evidência adicional desta assinatura.';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3 sm:p-6">
      <section className="relative w-full max-w-md overflow-hidden rounded-3xl border border-cyan-400/30 bg-slate-950 shadow-2xl">
        <button type="button" onClick={onCancel} className="absolute right-3 top-3 z-20 rounded-full bg-black/50 p-2 text-white backdrop-blur" aria-label="Fechar leitura facial">
          <X className="h-5 w-5" />
        </button>

        <div className="p-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
              <ScanFace className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p>
            </div>
          </div>
        </div>

        <div className="relative mx-4 aspect-[4/5] overflow-hidden rounded-3xl bg-slate-900">
          <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover -scale-x-100" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[70%] w-[72%] rounded-[48%] border-[3px] border-cyan-300/90 shadow-[0_0_0_999px_rgba(2,6,23,0.38),0_0_32px_rgba(34,211,238,0.28)]" />
          </div>
          {stage === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-white">
              <Loader2 className="h-9 w-9 animate-spin text-cyan-300" />
              <p className="mt-4 text-sm font-semibold">Preparando câmera...</p>
            </div>
          )}
          {stage === 'success' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/90 text-white">
              <CheckCircle2 className="h-14 w-14 text-emerald-300" />
              <p className="mt-4 text-base font-bold">Identidade confirmada</p>
            </div>
          )}
          {stage === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center text-white">
              <Camera className="h-11 w-11 text-amber-300" />
              <p className="mt-4 text-sm leading-6 text-slate-200">{error}</p>
              <Button className="mt-5" variant="outline" onClick={onCancel}>Voltar</Button>
            </div>
          )}
        </div>

        <div className="p-5 pt-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-cyan-100">
            {stage === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            <span>{message}</span>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">Use boa iluminação, retire óculos escuros e mantenha somente um rosto diante da câmera.</p>
        </div>
      </section>
    </div>
  );
};

export default FaceRecognitionCapture;
