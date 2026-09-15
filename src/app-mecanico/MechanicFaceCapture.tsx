import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, ScanFace, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  mode: "login" | "enroll";
  accessId?: string;
  onSuccess: (data: any) => void | Promise<void>;
  onCancel: () => void;
};

const SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js";
const MODEL_URL = "https://cdn.jsdelivr.net/gh/vladmandic/face-api@1.7.12/model";
let modelsPromise: Promise<any> | null = null;

const loadFaceApi = async () => {
  if (modelsPromise) return modelsPromise;
  modelsPromise = (async () => {
    const win = window as any;
    if (!win.faceapi) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`) as HTMLScriptElement | null;
        if (existing) {
          if (win.faceapi) return resolve();
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("face_library_failed")), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = SCRIPT_URL;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("face_library_failed"));
        document.head.appendChild(script);
      });
    }
    const api = win.faceapi;
    if (!api) throw new Error("face_library_failed");
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

const requestFrontCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("NotFoundError");
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (error: any) {
    if (!["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(error?.name || "")) throw error;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
};

const captureJpeg = (video: HTMLVideoElement) => {
  const canvas = document.createElement("canvas");
  const sourceW = video.videoWidth || 640;
  const sourceH = video.videoHeight || 480;
  const targetW = Math.min(640, sourceW);
  canvas.width = targetW;
  canvas.height = Math.round((sourceH / sourceW) * targetW);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("camera_capture_failed");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
};

const friendlyError = (code: string) => {
  const messages: Record<string, string> = {
    NotAllowedError: "A câmera foi bloqueada. Libere a câmera para continuar.",
    PermissionDeniedError: "A câmera foi bloqueada. Libere a câmera para continuar.",
    NotFoundError: "Nenhuma câmera foi encontrada neste aparelho.",
    DevicesNotFoundError: "Nenhuma câmera foi encontrada neste aparelho.",
    NotReadableError: "A câmera está ocupada por outro aplicativo. Feche a câmera em outros apps e tente novamente.",
    TrackStartError: "A câmera está ocupada por outro aplicativo. Feche a câmera em outros apps e tente novamente.",
    face_library_failed: "Não foi possível carregar a leitura facial. Verifique a internet e tente novamente.",
    face_not_registered: "Seu rosto ainda não está cadastrado. Entre pelo PIN uma vez e cadastre o reconhecimento facial.",
    face_not_recognized: "Não conseguimos confirmar este rosto. Posicione-se de frente, com boa iluminação, e tente novamente.",
    face_not_clear: "A imagem não ficou nítida. Melhore a iluminação e tente novamente.",
    too_many_attempts: "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.",
    invalid_access: "Este acesso não está mais liberado. Entre novamente pelo PIN.",
  };
  return messages[code] || "Não foi possível concluir a leitura facial. Tente novamente.";
};

export default function MechanicFaceCapture({ mode, accessId, onSuccess, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const apiRef = useRef<any>(null);
  const submittingRef = useRef(false);
  const stableRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const [stage, setStage] = useState<"loading" | "camera" | "reading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Preparando leitura facial...");
  const [error, setError] = useState("");

  const stop = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;

    const fail = (code: string) => {
      if (cancelled) return;
      submittingRef.current = true;
      stop();
      setError(friendlyError(code));
      setStage("error");
    };

    const setup = async () => {
      try {
        apiRef.current = await loadFaceApi();
        if (cancelled) return;
        const stream = await requestFrontCamera();
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("camera_capture_failed");
        video.srcObject = stream;
        await video.play();
        setStage("camera");
        setMessage("Encaixe seu rosto no espaço indicado");

        const scan = async () => {
          if (cancelled || submittingRef.current || !videoRef.current || !apiRef.current) return;
          const currentVideo = videoRef.current;
          if (currentVideo.readyState < 2 || !currentVideo.videoWidth) return;

          setStage("reading");
          const api = apiRef.current;
          const result = await api
            .detectSingleFace(currentVideo, new api.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (!result) {
            stableRef.current = 0;
            setMessage("Aproxime o rosto e olhe para a câmera");
            setStage("camera");
            return;
          }

          const box = result.detection.box;
          const vw = currentVideo.videoWidth;
          const vh = currentVideo.videoHeight;
          const centered = Math.abs(box.x + box.width / 2 - vw / 2) < vw * 0.19
            && Math.abs(box.y + box.height / 2 - vh / 2) < vh * 0.2;
          const largeEnough = box.width > vw * 0.27 && box.height > vh * 0.27;
          const clearEnough = Number(result.detection.score || 0) >= 0.55;
          if (!centered || !largeEnough || !clearEnough) {
            stableRef.current = 0;
            setMessage(!largeEnough ? "Aproxime um pouco o rosto" : "Centralize o rosto e olhe para a câmera");
            setStage("camera");
            return;
          }

          stableRef.current += 1;
          setMessage(stableRef.current >= 2 ? "Rosto lido. Confirmando..." : "Mantenha o rosto nessa posição...");
          if (stableRef.current < 2) return;

          submittingRef.current = true;
          stop();
          const response = await fetch("/api/mechanic-face", {
            method: "POST",
            headers: { "content-type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              action: mode === "login" ? "identify" : "enroll",
              access_id: accessId || undefined,
              descriptor: Array.from(result.descriptor as Float32Array),
              face_score: Number(result.detection.score || 0),
              snapshot: captureJpeg(currentVideo),
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) {
            fail(data.error || `face_${response.status}`);
            return;
          }
          setStage("success");
          setMessage(mode === "login" ? "Identidade confirmada. Entrando..." : "Reconhecimento facial cadastrado.");
          await onSuccess(data);
        };

        timerRef.current = window.setInterval(() => void scan().catch((scanError: any) => {
          fail(scanError?.message || "face_failed");
        }), 850);
      } catch (setupError: any) {
        fail(setupError?.name || setupError?.message || "camera_failed");
      }
    };

    void setup();
    return () => {
      cancelled = true;
      stop();
    };
  }, [mode, accessId, onSuccess]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3">
      <section className="relative w-full max-w-md overflow-hidden rounded-3xl border border-fuchsia-400/30 bg-[#09070f] shadow-2xl">
        <button type="button" onClick={onCancel} className="absolute right-3 top-3 z-20 rounded-full bg-black/60 p-2 text-white" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-300"><ScanFace className="h-7 w-7" /></div>
            <div>
              <h2 className="text-lg font-black text-white">{mode === "login" ? "Entrar com meu rosto" : "Cadastrar meu rosto"}</h2>
              <p className="mt-1 text-xs text-zinc-400">TOPAC Mecânicos • reconhecimento facial</p>
            </div>
          </div>
        </div>
        <div className="relative mx-4 aspect-[4/5] overflow-hidden rounded-3xl bg-black">
          <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover -scale-x-100" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[70%] w-[72%] rounded-[48%] border-[3px] border-fuchsia-300/90 shadow-[0_0_0_999px_rgba(9,7,15,.42),0_0_32px_rgba(217,70,239,.25)]" />
          </div>
          {stage === "loading" && <div className="absolute inset-0 grid place-items-center bg-[#09070f]/95"><Loader2 className="h-9 w-9 animate-spin text-fuchsia-300" /></div>}
          {stage === "success" && <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/90 text-white"><CheckCircle2 className="h-14 w-14 text-emerald-300" /><p className="mt-4 font-bold">Identidade confirmada</p></div>}
          {stage === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#09070f]/95 p-6 text-center text-white">
              <Camera className="h-11 w-11 text-amber-300" />
              <p className="mt-4 text-sm leading-6 text-zinc-200">{error}</p>
              <Button className="mt-5 border-zinc-700 bg-zinc-950 text-white" variant="outline" onClick={onCancel}>Voltar</Button>
            </div>
          )}
        </div>
        <div className="p-5 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-fuchsia-100">
            {stage === "reading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            <span>{message}</span>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">Boa iluminação, rosto de frente e somente uma pessoa diante da câmera.</p>
        </div>
      </section>
    </div>
  );
}
