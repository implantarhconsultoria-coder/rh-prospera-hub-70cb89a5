import { Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";
import "./styles/topac-platform.css";
import "./styles/hide-vercel-toolbar.css";
import "./styles/form-contrast-guard.css";
import ErrorBoundary from "@/components/ErrorBoundary";
import GlobalFormContrastGuard from "@/components/GlobalFormContrastGuard";
import { AppProvider } from "@/context/AppContext";
import { Toaster as Sonner } from "@/components/ui/sonner";
import AcessoMecanicoPage from "@/app-mecanico/AcessoMecanicoPage";
import MecanicoAppLayout from "@/app-mecanico/MecanicoAppLayout";
import MecHomePage from "@/app-mecanico/pages/HomePage";
import MecPontoPage from "@/app-mecanico/pages/PontoPage";
import MecChamadosPage from "@/app-mecanico/pages/ChamadosPage";
import MecVeiculoPage from "@/app-mecanico/pages/VeiculoPage";
import MecHistoricoPage from "@/app-mecanico/pages/HistoricoPage";
import MecAbastecimentoPage from "@/app-mecanico/pages/AbastecimentoPage";
import ContabilidadeAcessoPage from "@/pages/contabilidade/ContabilidadeAcessoPage";
import ContabilidadePortalShell from "@/pages/contabilidade/ContabilidadePortalShell";

const PayrollPdfConsolidatorMount = lazy(() => import("@/components/PayrollPdfConsolidator"));
const EpiBulkPrintEnhancer = lazy(() => import("@/components/EpiBulkPrintEnhancer"));
const CabinetLabelsAddon = lazy(() => import("@/components/CabinetLabelsAddon"));
const TicketVrReportPageAddon = lazy(() => import("@/components/TicketVrReportPageAddon"));
const FechamentoPagamentoAddon = lazy(() => import("@/components/FechamentoPagamentoAddon"));
const PreCadastroFsePrintAddon = lazy(() => import("@/components/PreCadastroFsePrintAddon"));
const PreCadastroFseButtonPlacement = lazy(() => import("@/components/PreCadastroFseButtonPlacement"));
const PreCadastroCandidateActions = lazy(() => import("@/components/PreCadastroCandidateActions"));
const ContabilidadeAdminInboxAddon = lazy(() => import("@/components/ContabilidadeAdminInboxAddon"));
const ContabilidadeFolhaAdminAddon = lazy(() => import("@/components/ContabilidadeFolhaAdminAddon"));
const ContabilidadeCorrectionPanel = lazy(() => import("@/components/ContabilidadeCorrectionPanel"));
const PayrollAccountingSourceAddon = lazy(() => import("@/components/PayrollAccountingSourceAddon"));
const PayrollSignaturePublicPage = lazy(() => import("@/pages/PayrollSignaturePublicPage"));

const MOBILE_BUILD_TAG = "20260908-mecanicos-oficial-v2";
const MOBILE_CACHE_RESET_KEY = `topac-mobile-cache-reset-${MOBILE_BUILD_TAG}`;
const currentPath = window.location.pathname;
const isPayrollPublicPortal = /^\/holerite(?:\/[^/]+)?\/?$/i.test(currentPath);
const isMecanicoPublicPortal = /^\/(?:mecanicos|acesso-mecanico|app-mecanico(?:\/|$)|mecanico-ext(?:\/|$))/i.test(currentPath);
const isContabilidadePublicPortal = /^\/(?:acesso-contabilidade(?:-goiania)?|contabilidade(?:-goiania)?)\/?$/i.test(currentPath);

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

if (!isPayrollPublicPortal && !isContabilidadePublicPortal) {
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
  const [routeKey, setRouteKey] = useState(() => `${window.location.pathname}${window.location.search}`);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = `${window.location.pathname}${window.location.search}`;
      setRouteKey(current => current === next ? current : next);
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  const [path, query = ''] = routeKey.split('?');
  const params = new URLSearchParams(query);
  const centralModule = path === '/admin/central-contabilidade' ? params.get('modulo') : null;

  const isFechamento = path === '/admin/fechamento';
  const isRelatorioVr = path.includes('/admin/relatorio-vr');
  const isEpi = path.includes('/admin/epi');
  const isPreCadastro = path === '/admin/pre-cadastro-admissional' || centralModule === 'pre-cadastro';
  const isContabilidadeAdmin = path === '/admin/apontamento-contabilidade';
  const isContabilidadeCentral = path === '/admin/central-contabilidade';
  const isAssinaturaDigital = path === '/admin/assinatura-digital';

  if (!isFechamento && !isRelatorioVr && !isEpi && !isPreCadastro && !isContabilidadeAdmin && !isContabilidadeCentral && !isAssinaturaDigital) return null;

  return (
    <Suspense fallback={null}>
      {isFechamento && <PayrollPdfConsolidatorMount />}
      {isFechamento && <CabinetLabelsAddon />}
      {isFechamento && <FechamentoPagamentoAddon />}
      {isRelatorioVr && <TicketVrReportPageAddon />}
      {isEpi && <EpiBulkPrintEnhancer />}
      {isPreCadastro && <PreCadastroFsePrintAddon />}
      {isPreCadastro && <PreCadastroFseButtonPlacement />}
      {isPreCadastro && <PreCadastroCandidateActions />}
      {isContabilidadeAdmin && <ContabilidadeAdminInboxAddon />}
      {isContabilidadeCentral && <ContabilidadeFolhaAdminAddon />}
      {isContabilidadeCentral && <ContabilidadeCorrectionPanel mode="admin" />}
      {isAssinaturaDigital && <PayrollAccountingSourceAddon />}
    </Suspense>
  );
};

const MecanicoLegacyAlias = () => {
  const { acessoId } = useParams<{ acessoId: string }>();
  const location = useLocation();
  const tail = location.pathname.replace(/^\/mecanico-ext\/[^/]+/, "");
  return <Navigate to={`/app-mecanico/${acessoId}${tail}${location.search}`} replace />;
};

const MecanicoPublicPortal = () => (
  <BrowserRouter>
    <Sonner />
    <Routes>
      <Route path="/mecanicos" element={<AcessoMecanicoPage />} />
      <Route path="/acesso-mecanico" element={<Navigate to="/mecanicos" replace />} />
      <Route path="/app-mecanico/:acessoId" element={<MecanicoAppLayout />}>
        <Route index element={<MecHomePage />} />
        <Route path="ponto" element={<MecPontoPage />} />
        <Route path="chamados" element={<MecChamadosPage />} />
        <Route path="veiculo" element={<MecVeiculoPage />} />
        <Route path="historico" element={<MecHistoricoPage />} />
        <Route path="abastecimento" element={<MecAbastecimentoPage />} />
      </Route>
      <Route path="/mecanico-ext/:acessoId" element={<MecanicoLegacyAlias />} />
      <Route path="/mecanico-ext/:acessoId/*" element={<MecanicoLegacyAlias />} />
      <Route path="*" element={<Navigate to="/mecanicos" replace />} />
    </Routes>
  </BrowserRouter>
);

const ContabilidadePublicPortal = () => (
  <BrowserRouter>
    <Sonner />
    <Routes>
      <Route path="/acesso-contabilidade" element={<ContabilidadeAcessoPage portal="principal" />} />
      <Route path="/contabilidade" element={<ContabilidadePortalShell portal="principal" />} />
      <Route path="/acesso-contabilidade-goiania" element={<ContabilidadeAcessoPage portal="goiania" />} />
      <Route path="/contabilidade-goiania" element={<ContabilidadePortalShell portal="goiania" />} />
      <Route path="*" element={<Navigate to={currentPath.toLowerCase().includes('goiania') ? '/acesso-contabilidade-goiania' : '/acesso-contabilidade'} replace />} />
    </Routes>
  </BrowserRouter>
);

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
} else if (isMecanicoPublicPortal) {
  root.render(
    <ErrorBoundary>
      <GlobalFormContrastGuard />
      <MecanicoPublicPortal />
    </ErrorBoundary>
  );
} else if (isContabilidadePublicPortal) {
  root.render(
    <ErrorBoundary>
      <GlobalFormContrastGuard />
      <ContabilidadePublicPortal />
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
