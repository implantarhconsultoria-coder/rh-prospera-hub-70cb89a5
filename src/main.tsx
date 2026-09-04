import { Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/topac-platform.css";
import "./styles/hide-vercel-toolbar.css";
import "./styles/form-contrast-guard.css";
import ErrorBoundary from "@/components/ErrorBoundary";
import GlobalFormContrastGuard from "@/components/GlobalFormContrastGuard";
import { AppProvider } from "@/context/AppContext";

const PayrollPdfConsolidatorMount = lazy(() => import("@/components/PayrollPdfConsolidator"));
const EpiBulkPrintEnhancer = lazy(() => import("@/components/EpiBulkPrintEnhancer"));
const CabinetLabelsAddon = lazy(() => import("@/components/CabinetLabelsAddon"));
const TicketVrReportPageAddon = lazy(() => import("@/components/TicketVrReportPageAddon"));
const FechamentoPagamentoAddon = lazy(() => import("@/components/FechamentoPagamentoAddon"));
const PreCadastroFsePrintAddon = lazy(() => import("@/components/PreCadastroFsePrintAddon"));
const PreCadastroFseButtonPlacement = lazy(() => import("@/components/PreCadastroFseButtonPlacement"));
const PedidoDemissaoModelDialog = lazy(() => import("@/components/PedidoDemissaoModelDialog"));
const PayrollSignaturePublicPage = lazy(() => import("@/pages/PayrollSignaturePublicPage"));

const MOBILE_BUILD_TAG = "20260903-app-mecanico-layout-v1";
const MOBILE_CACHE_RESET_KEY = `topac-mobile-cache-reset-${MOBILE_BUILD_TAG}`;
const isPayrollPublicPortal = /^\/holerite(?:\/[^/]+)?\/?$/i.test(window.location.pathname);

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

if (!isPayrollPublicPortal) {
  void clearLegacyMobileCache();
}

const reportClientError = (payload: { message?: string; stack?: string; url: string }) => {
  void fetch('https://hook.implantarh.dev/erros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Project': 'w75ugcr5afmn' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((error) => {
    console.warn('[Telemetry] Nao foi possivel enviar o erro ao coletor:', error);
  });
};

window.addEventListener('error', (e) => {
  reportClientError({
    message: e.message,
    stack: e.error?.stack,
    url: location.pathname,
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

  const isFechamento = path === '/admin/fechamento';
  const isRelatorioVr = path.includes('/admin/relatorio-vr');
  const isEpi = path.includes('/admin/epi');
  const isPreCadastro = path === '/admin/pre-cadastro-admissional';
  const isPedidoDemissao = path === '/admin/rescisoes' || path === '/admin/funcionarios';

  if (!isFechamento && !isRelatorioVr && !isEpi && !isPreCadastro && !isPedidoDemissao) return null;

  return (
    <Suspense fallback={null}>
      {isFechamento && <PayrollPdfConsolidatorMount />}
      {isFechamento && <CabinetLabelsAddon />}
      {isFechamento && <FechamentoPagamentoAddon />}
      {isRelatorioVr && <TicketVrReportPageAddon />}
      {isEpi && <EpiBulkPrintEnhancer />}
      {isPreCadastro && <PreCadastroFsePrintAddon />}
      {isPreCadastro && <PreCadastroFseButtonPlacement />}
      {isPedidoDemissao && <PedidoDemissaoModelDialog />}
    </Suspense>
  );
};

const root = createRoot(document.getElementById("root")!);
if (isPayrollPublicPortal) {
  root.render(
    <ErrorBoundary>
      <GlobalFormContrastGuard />
      <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">Carregando acesso seguro...</div>}>
        <PayrollSignaturePublicPage />
      </Suspense>
    </ErrorBoundary>
  );
} else {
  root.render(
    <ErrorBoundary>
      <GlobalFormContrastGuard />
      <App />
      <AppProvider>
        <RouteEnhancers />
      </AppProvider>
    </ErrorBoundary>
  );
}
