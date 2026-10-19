/**
 * Sessao pessoal do App Mecanicos.
 * Token emitido e validado no servidor, nunca baseado apenas no UUID da rota.
 */
export const MECHANIC_SESSION_KEY = "topac_mecanico_session_v3";
const LEGACY_SESSION_KEY = "topac_mecanico_session_v2";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface MechanicSession {
  version: 3;
  accessId: string;
  token: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export const clearMechanicSession = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(MECHANIC_SESSION_KEY);
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
  localStorage.removeItem("app_mecanico_acesso_id");
  localStorage.removeItem("acesso_externo");
};

export const readMechanicSession = (): MechanicSession | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MECHANIC_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<MechanicSession>;
    if (
      s.version !== 3
      || !s.accessId
      || typeof s.token !== "string"
      || !/^[a-f0-9]{64}$/.test(s.token)
      || !Number.isFinite(s.issuedAt)
      || !Number.isFinite(s.expiresAt)
      || Number(s.expiresAt) <= Date.now()
    ) {
      clearMechanicSession();
      return null;
    }
    return s as MechanicSession;
  } catch {
    clearMechanicSession();
    return null;
  }
};

export const writeMechanicSession = (accessId: string, token: string): void => {
  if (!accessId || !/^[a-f0-9]{64}$/.test(token)) throw new Error("Sessao invalida");
  clearMechanicSession();
  const issuedAt = Date.now();
  const session: MechanicSession = {
    version: 3,
    accessId,
    token,
    nonce: globalThis.crypto?.randomUUID?.() || String(issuedAt),
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_MS,
  };
  sessionStorage.setItem(MECHANIC_SESSION_KEY, JSON.stringify(session));
};

/**
 * Encaminha a prova da sessao nas RPCs do App Mecânicos.
 * x-client-info é um header padrao permitido pelo PostgREST/SDK,
 * e nao altera JWT, apikey, Supabase Auth ou qualquer modulo administrativo.
 */
export const mechanicSessionFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : String(input instanceof URL ? input : input.url);
  if (!url.includes("/rest/v1/rpc/app_mecanico_")) return globalThis.fetch(input, init);
  const session = readMechanicSession();
  if (!session) return globalThis.fetch(input, init);

  const initialHeaders = typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined;
  const headers = new Headers(initialHeaders);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  headers.set("x-client-info", `${headers.get("x-client-info") || "supabase-js"} mec-session=${session.token}`);
  return globalThis.fetch(input, { ...init, headers });
};
