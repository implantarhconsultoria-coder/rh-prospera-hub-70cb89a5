import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import ErrorBoundary from "@/components/ErrorBoundary";

const BUILD_ID = "20260525-white-screen-fix";
const MOBILE_CACHE_RESET_KEY = `topac-mobile-cache-reset-${BUILD_ID}`;
const RUNTIME_RELOAD_KEY = `topac-runtime-reload-${BUILD_ID}`;

function safeSessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Sem storage, seguimos com fallback visual.
  }
}

function renderBootFallback(message: string) {
  const root = document.getElementById("root");
  if (!root || root.childElementCount > 0) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Arial,sans-serif;background:#050b16;color:#fff">
      <div style="max-width:420px;width:100%;border:1px solid rgba(34,211,238,.25);border-radius:16px;padding:24px;background:#101829">
        <h1 style="margin:0 0 8px;font-size:20px">TOPAC RH PRO</h1>
        <p style="margin:0 0 18px;color:#cbd5e1;font-size:14px">${message}</p>
        <button onclick="location.href='/?build=${BUILD_ID}'" style="width:100%;border:0;border-radius:10px;padding:12px;font-weight:700;background:#35d8f2;color:#06111f">Recarregar acesso</button>
      </div>
    </div>`;
}

function isChunkOrRuntimeLoadError(value: unknown) {
  const msg = String(value instanceof Error ? value.message : value || "").toLowerCase();
  return msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("chunkloaderror") ||
    msg.includes("importing a module script failed") ||
    msg.includes("mime type");
}

function forceFreshReload(reason: string) {
  if (safeSessionGet(RUNTIME_RELOAD_KEY) === reason) {
    renderBootFallback("Nao foi possivel carregar o pacote atualizado. Toque em recarregar para abrir uma sessao limpa.");
    return;
  }

  safeSessionSet(RUNTIME_RELOAD_KEY, reason);
  const url = new URL(window.location.href);
  url.searchParams.set("build", BUILD_ID);
  window.location.replace(url.toString());
}

async function clearLegacyMobileCache() {
  if (typeof window === "undefined") return;
  try {
    if (safeSessionGet(MOBILE_CACHE_RESET_KEY) === "done") return;

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }

    safeSessionSet(MOBILE_CACHE_RESET_KEY, "done");

    const url = new URL(window.location.href);
    if (url.searchParams.get("build") !== BUILD_ID) {
      url.searchParams.set("build", BUILD_ID);
      window.location.replace(url.toString());
    }
  } catch (error) {
    console.warn("Falha ao limpar cache antigo do mobile:", error);
  }
}

void clearLegacyMobileCache();

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  forceFreshReload("preload");
});

window.addEventListener("unhandledrejection", (event) => {
  if (isChunkOrRuntimeLoadError(event.reason)) {
    event.preventDefault();
    forceFreshReload("chunk");
    return;
  }

  console.error("[unhandledrejection]", event.reason);
});

window.addEventListener('error', (e) => {
  if (isChunkOrRuntimeLoadError(e.error || e.message)) {
    e.preventDefault();
    forceFreshReload("script");
    return;
  }

  fetch('https://hook.implantarh.dev/erros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Project': 'w75ugcr5afmn' },
    body: JSON.stringify({ message: e.message, stack: e.error?.stack, url: location.pathname }),
  }).catch(() => undefined);

  setTimeout(() => renderBootFallback("A tela encontrou um erro de carregamento. Recarregue para restaurar o acesso."), 1000);
});

try {
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
} catch (error) {
  console.error("Falha ao iniciar TOPAC RH PRO:", error);
  renderBootFallback("Nao foi possivel iniciar a plataforma neste navegador.");
}
