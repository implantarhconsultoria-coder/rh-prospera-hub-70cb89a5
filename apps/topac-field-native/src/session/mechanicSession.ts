import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "topac_field_mechanic_session_v1";
const DIAGNOSTICS_KEY = "topac_field_location_diagnostics_v1";

export const LOCATION_CONSENT_VERSION =
  "topac-localizacao-operacional-native-2026-08-v1";

export interface MechanicSession {
  acessoId: string;
  nome: string;
  empresa: string;
  filial: string;
  funcao: string;
  funcionarioId: string | null;
  consentimentoVersao?: string;
  consentimentoEm?: string;
}

export interface LocationDiagnostics {
  ultimoEventoEm?: string;
  ultimoEnvioAceitoEm?: string;
  ultimoErro?: string;
  rastreamentoAtivo?: boolean;
}

export async function saveMechanicSession(session: MechanicSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function getMechanicSession(): Promise<MechanicSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MechanicSession>;
    if (!parsed.acessoId || !parsed.nome) return null;
    return parsed as MechanicSession;
  } catch {
    return null;
  }
}

export async function registerLocationConsent(): Promise<MechanicSession> {
  const session = await getMechanicSession();
  if (!session) {
    throw new Error("Sessão do mecânico não encontrada.");
  }

  const next: MechanicSession = {
    ...session,
    consentimentoVersao: LOCATION_CONSENT_VERSION,
    consentimentoEm: new Date().toISOString(),
  };
  await saveMechanicSession(next);
  return next;
}

export async function clearMechanicSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function saveLocationDiagnostics(
  patch: Partial<LocationDiagnostics>,
): Promise<LocationDiagnostics> {
  const current = await getLocationDiagnostics();
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(next));
  return next;
}

export async function getLocationDiagnostics(): Promise<LocationDiagnostics> {
  const raw = await AsyncStorage.getItem(DIAGNOSTICS_KEY);
  if (!raw) return {};

  try {
    return JSON.parse(raw) as LocationDiagnostics;
  } catch {
    return {};
  }
}
