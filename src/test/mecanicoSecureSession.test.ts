// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMechanicSession, mechanicSessionFetch, readMechanicSession, writeMechanicSession,
  MECHANIC_SESSION_KEY,
} from "@/app-mecanico/lib/secureSession";

const token = "a".repeat(64);
const accessId = "b661ad8e-dc35-4ba6-b0f2-f795284973b2";

describe("App Mecânicos / sessões pessoais", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  });
  afterEach(() => {
    clearMechanicSession();
    vi.unstubAllGlobals();
  });

  it("não aceita um token que não tenha sido emitido pelo servidor", () => {
    expect(() => writeMechanicSession(accessId, "1234")).toThrow("Sessao invalida");
  });

  it("restaura apenas sessão válida e expira tokens vencidos", () => {
    writeMechanicSession(accessId, token);
    expect(readMechanicSession()?.accessId).toBe(accessId);
    const s = JSON.parse(sessionStorage.getItem(MECHANIC_SESSION_KEY) || "{}");
    sessionStorage.setItem(MECHANIC_SESSION_KEY, JSON.stringify({ ...s, expiresAt: Date.now() - 1 }));
    expect(readMechanicSession()).toBeNull();
  });

  it("adiciona token somente em RPCs do App Mecânicos", async () => {
    writeMechanicSession(accessId, token);
    await mechanicSessionFetch("https://example.supabase.co/rest/v1/rpc/app_mecanico_validar_acesso", {
      method: "POST", headers: { "x-client-info": "supabase-js/2" },
    });
    const calls = vi.mocked(fetch).mock.calls;
    const headers = new Headers(calls[0][1]?.headers);
    expect(headers.get("x-client-info")).toContain("mec-session=" + token);

    await mechanicSessionFetch("https://example.supabase.co/rest/v1/rpc/admin_app_mecanicos_dashboard", { method: "POST" });
    const other = new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers);
    expect(other.get("x-client-info")).toBeNull();
  });
});
