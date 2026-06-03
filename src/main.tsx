import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import ErrorBoundary from "@/components/ErrorBoundary";

const MOBILE_BUILD_TAG = "20260603-login-web-2";
const MOBILE_CACHE_RESET_KEY = `topac-mobile-cache-reset-${MOBILE_BUILD_TAG}`;

async function clearLegacyMobileCache() {
  if (typeof window === "undefined") return;
  if (window.sessionStorage.getItem(MOBILE_CACHE_RESET_KEY) === "done") return;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }

    window.sessionStorage.setItem(MOBILE_CACHE_RESET_KEY, "done");

    const url = new URL(window.location.href);
    if (url.searchParams.get("build") !== MOBILE_BUILD_TAG) {
      url.searchParams.set("build", MOBILE_BUILD_TAG);
      window.location.replace(url.toString());
    }
  } catch (error) {
    console.warn("Falha ao limpar cache antigo do mobile:", error);
  }
}

void clearLegacyMobileCache();

window.addEventListener('error', (e) => {
  fetch('https://hook.implantarh.dev/erros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Project': 'w75ugcr5afmn' },
    body: JSON.stringify({ message: e.message, stack: e.error?.stack, url: location.pathname }),
  });
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
