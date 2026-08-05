import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, LocateFixed, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { shouldSendLocation, type LocationPoint } from '@/lib/locationTracking';
import { useMecanicoApp } from './MecanicoAppContext';

const HEARTBEAT_MS = 4 * 60 * 1000;
const MIN_DISTANCE_METERS = 500;
const CONSENT_VERSION = 'topac-localizacao-operacional-2026-08-v1';

type TrackerStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported' | 'error';

interface RpcResponse {
  ok?: boolean;
  accepted?: boolean;
  error?: string;
  ultimo_sinal_timestamp?: string;
}

const locationRpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: RpcResponse | null; error: { message?: string } | null }>;
};

const readLastSignal = (key: string) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null') as {
      latitude?: number;
      longitude?: number;
      sentAt?: number;
    } | null;

    if (!value || typeof value.latitude !== 'number' || typeof value.longitude !== 'number' || typeof value.sentAt !== 'number') {
      return null;
    }

    return {
      point: { latitude: value.latitude, longitude: value.longitude } satisfies LocationPoint,
      sentAt: value.sentAt,
    };
  } catch {
    return null;
  }
};

export default function MechanicLocationTracker() {
  const { mecanico } = useMecanicoApp();
  const consentKey = useMemo(() => `topac_location_consent:${mecanico.acesso_id}`, [mecanico.acesso_id]);
  const lastSignalKey = useMemo(() => `topac_location_last:${mecanico.acesso_id}`, [mecanico.acesso_id]);
  const [consentGranted, setConsentGranted] = useState(() => localStorage.getItem(consentKey) === CONSENT_VERSION);
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [lastSignalAt, setLastSignalAt] = useState<number | null>(null);
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const lastPointRef = useRef<LocationPoint | null>(null);
  const lastSentAtRef = useRef<number | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    const cached = readLastSignal(lastSignalKey);
    lastPointRef.current = cached?.point || null;
    lastSentAtRef.current = cached?.sentAt || null;
    setLastSignalAt(cached?.sentAt || null);
  }, [lastSignalKey]);

  useEffect(() => () => {
    activeRef.current = false;
  }, []);

  const sendPosition = useCallback(async (position: GeolocationPosition) => {
    const current = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    const now = Date.now();

    if (!shouldSendLocation({
      current,
      previous: lastPointRef.current,
      lastSentAt: lastSentAtRef.current,
      now,
      minDistanceMeters: MIN_DISTANCE_METERS,
      maxIntervalMs: HEARTBEAT_MS,
    })) {
      return;
    }

    setSending(true);
    setSendError('');

    try {
      const { data, error } = await locationRpc.rpc('app_mecanico_registrar_localizacao', {
        p_acesso_id: mecanico.acesso_id,
        p_latitude: current.latitude,
        p_longitude: current.longitude,
        p_precisao_metros: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        p_velocidade_mps: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        p_direcao_graus: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
        p_origem: 'web_foreground',
        p_consentimento_versao: CONSENT_VERSION,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.error || 'Não foi possível enviar a localização.');
      }

      if (data.accepted !== false) {
        lastPointRef.current = current;
        lastSentAtRef.current = now;
        localStorage.setItem(lastSignalKey, JSON.stringify({ ...current, sentAt: now }));
        if (activeRef.current) setLastSignalAt(now);
      }
    } catch (error) {
      console.error('[topac-field] falha ao enviar localização', error);
      if (activeRef.current) setSendError(error instanceof Error ? error.message : 'Falha ao enviar o sinal.');
    } finally {
      if (activeRef.current) setSending(false);
    }
  }, [lastSignalKey, mecanico.acesso_id]);

  useEffect(() => {
    if (!consentGranted) return undefined;
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return undefined;
    }

    let watchId: number | null = null;
    let heartbeatId: number | null = null;
    let stopped = false;

    const onSuccess = (position: GeolocationPosition) => {
      if (stopped) return;
      setStatus('active');
      void sendPosition(position);
    };

    const onError = (error: GeolocationPositionError) => {
      if (stopped) return;
      if (error.code === error.PERMISSION_DENIED) {
        setStatus('denied');
        return;
      }
      setStatus((current) => current === 'active' ? current : 'error');
      setSendError(error.message || 'GPS indisponível neste momento.');
    };

    const options: PositionOptions = {
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 30_000,
    };

    setStatus('requesting');
    watchId = navigator.geolocation.watchPosition(onSuccess, onError, options);
    heartbeatId = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
    }, HEARTBEAT_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (heartbeatId !== null) window.clearInterval(heartbeatId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [consentGranted, sendPosition]);

  const requestConsent = () => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }

    setStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      () => {
        localStorage.setItem(consentKey, CONSENT_VERSION);
        setConsentGranted(true);
        setStatus('idle');
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error');
        setSendError(error.message || 'Não foi possível liberar o GPS.');
      },
      { enableHighAccuracy: false, timeout: 30_000, maximumAge: 60_000 },
    );
  };

  const signalLabel = lastSignalAt
    ? `Último envio ${new Date(lastSignalAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : 'Aguardando primeiro sinal';

  const blocked = !consentGranted || status === 'denied' || status === 'unsupported';

  return (
    <>
      {!blocked && (
        <div className="fixed right-3 top-[72px] z-40 flex items-center gap-2 rounded-full border border-emerald-400/20 bg-[#071522]/95 px-3 py-2 text-[10px] text-emerald-200 shadow-xl backdrop-blur">
          {status === 'active' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />}
          <span>{sending ? 'Enviando GPS...' : signalLabel}</span>
        </div>
      )}

      {sendError && !blocked && (
        <div className="fixed left-3 right-3 top-[116px] z-40 mx-auto max-w-md rounded-xl border border-amber-400/20 bg-amber-950/95 px-3 py-2 text-center text-[11px] text-amber-100 shadow-xl">
          {sendError}
        </div>
      )}

      {blocked && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020814]/95 p-5 backdrop-blur-xl">
          <div className="w-full max-w-sm rounded-[28px] border border-cyan-400/20 bg-[#081426] p-6 text-white shadow-2xl">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
              {status === 'denied' || status === 'unsupported' ? <AlertTriangle className="h-7 w-7" /> : <MapPin className="h-7 w-7" />}
            </div>
            <h2 className="text-xl font-black">Localização operacional</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              O TOPAC Field usa sua localização durante a jornada para mostrar à Central onde o atendimento de rua está acontecendo. O envio é otimizado: após deslocamento relevante ou aproximadamente a cada quatro minutos.
            </p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-400">
              No aplicativo web, o aparelho pode reduzir ou interromper atualizações quando o navegador é minimizado. O rastreamento não é oculto e termina ao sair do TOPAC Field.
            </div>

            {status === 'denied' && (
              <p className="mt-4 text-sm text-amber-200">
                A permissão foi bloqueada. Abra as configurações do navegador, permita a localização para este site e tente novamente.
              </p>
            )}
            {status === 'unsupported' && (
              <p className="mt-4 text-sm text-amber-200">Este navegador não oferece geolocalização. Utilize Chrome, Safari ou o aplicativo instalado.</p>
            )}
            {sendError && status === 'error' && <p className="mt-4 text-sm text-amber-200">{sendError}</p>}

            <Button
              className="mt-6 h-12 w-full rounded-2xl bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400"
              onClick={requestConsent}
              disabled={status === 'requesting' || status === 'unsupported'}
            >
              {status === 'requesting' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
              {status === 'denied' ? 'Tentar novamente' : 'Permitir localização'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
