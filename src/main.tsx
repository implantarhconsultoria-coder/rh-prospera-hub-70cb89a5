import { Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/topac-platform.css";
import "./styles/hide-vercel-toolbar.css";
import ErrorBoundary from "@/components/ErrorBoundary";

const PayrollPdfConsolidatorMount = lazy(() => import("@/components/PayrollPdfConsolidator"));
const EpiBulkPrintEnhancer = lazy(() => import("@/components/EpiBulkPrintEnhancer"));
const CabinetLabelsAddon = lazy(() => import("@/components/CabinetLabelsAddon"));
const TicketVrReportPageAddon = lazy(() => import("@/components/TicketVrReportPageAddon"));

const MOBILE_BUILD_TAG = "20260817-performance-1";
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

const RouteEnhancers = () => {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = window.location.pathname;
      setPath(current => current === next ? current : next);
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  const isFechamento = path.includes('/admin/fechamento');
  const isRelatorioVr = path.includes('/admin/relatorio-vr');
  const isEpi = path.includes('/admin/epi');

  if (!isFechamento && !isRelatorioVr && !isEpi) return null;

  return (
    <Suspense fallback={null}>
      {isFechamento && <PayrollPdfConsolidatorMount />}
      {isFechamento && <CabinetLabelsAddon />}
      {isRelatorioVr && <TicketVrReportPageAddon />}
      {isEpi && <EpiBulkPrintEnhancer />}
    </Suspense>
  );
};

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
    <RouteEnhancers />
  </ErrorBoundary>
);