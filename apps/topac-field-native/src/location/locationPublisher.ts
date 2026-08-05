import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LocationObject } from "expo-location";
import { supabase } from "@/lib/supabase";
import {
  getMechanicSession,
  saveLocationDiagnostics,
} from "@/session/mechanicSession";

const PENDING_LOCATION_KEY = "topac_field_pending_location_v1";

type NativeLocationOrigin = "native_foreground" | "native_background";

interface PendingLocation {
  location: LocationObject;
  origin: NativeLocationOrigin;
}

interface LocationRpcResult {
  ok?: boolean;
  accepted?: boolean;
  reason?: string;
  error?: string;
  ultimo_sinal_timestamp?: string;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function persistPending(pending: PendingLocation): Promise<void> {
  await AsyncStorage.setItem(PENDING_LOCATION_KEY, JSON.stringify(pending));
}

async function clearPending(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_LOCATION_KEY);
}

export async function getPendingLocation(): Promise<PendingLocation | null> {
  const raw = await AsyncStorage.getItem(PENDING_LOCATION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PendingLocation;
  } catch {
    await clearPending();
    return null;
  }
}

export async function publishLocation(
  location: LocationObject,
  origin: NativeLocationOrigin,
): Promise<LocationRpcResult> {
  const session = await getMechanicSession();
  if (!session) {
    throw new Error("Sessão do mecânico não encontrada para enviar localização.");
  }
  if (!session.consentimentoVersao) {
    throw new Error("Consentimento de localização ainda não registrado.");
  }

  await saveLocationDiagnostics({
    ultimoEventoEm: new Date(location.timestamp).toISOString(),
    ultimoErro: undefined,
  });

  const { data, error } = await supabase.rpc("app_mecanico_registrar_localizacao", {
    p_acesso_id: session.acessoId,
    p_latitude: location.coords.latitude,
    p_longitude: location.coords.longitude,
    p_precisao_metros: finiteOrNull(location.coords.accuracy),
    p_velocidade_mps: finiteOrNull(location.coords.speed),
    p_direcao_graus: finiteOrNull(location.coords.heading),
    p_origem: origin,
    p_consentimento_versao: session.consentimentoVersao,
  });

  if (error) {
    await persistPending({ location, origin });
    await saveLocationDiagnostics({ ultimoErro: error.message });
    throw error;
  }

  const result = (data ?? {}) as LocationRpcResult;
  if (!result.ok) {
    const message = result.error || "Falha ao registrar localização no TOPAC.";
    await persistPending({ location, origin });
    await saveLocationDiagnostics({ ultimoErro: message });
    throw new Error(message);
  }

  await clearPending();
  await saveLocationDiagnostics({
    ultimoEnvioAceitoEm: result.accepted
      ? result.ultimo_sinal_timestamp || new Date().toISOString()
      : undefined,
    ultimoErro: undefined,
  });

  return result;
}

export async function flushPendingLocation(): Promise<void> {
  const pending = await getPendingLocation();
  if (!pending) return;
  await publishLocation(pending.location, pending.origin);
}
