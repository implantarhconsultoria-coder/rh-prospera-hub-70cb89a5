import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/context/AppContext";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import CadastroPage from "@/pages/CadastroPage";
import RecuperarSenhaPage from "@/pages/RecuperarSenhaPage";
import RedefinirSenhaPage from "@/pages/RedefinirSenhaPage";
import DashboardPage from "@/pages/DashboardPage";
import FechamentosFiliaisPage from "@/pages/admin/FechamentosFiliaisPage";
import ConferenciaFechamentoPage from "@/pages/admin/ConferenciaFechamentoPage";
import EmpresasPage from "@/pages/EmpresasPage";
import BaseMestraPage from "@/pages/BaseMestraPage";
import ASOPage from "@/pages/ASOPage";
import PrestadoresPage from "@/pages/PrestadoresPage";
import FuncionariosPage from "@/pages/FuncionariosPage";
import EmployeeDetailPage from "@/pages/EmployeeDetailPage";
import LancamentosPage from "@/pages/LancamentosPage";
import FechamentoPage from "@/pages/FechamentoPage";
import FechamentoPontoPage from "@/pages/admin/FechamentoPontoPage";
import CombustivelPage from "@/pages/CombustivelPage";
import CombustivelAdminPage from "@/pages/admin/CombustivelAdminPage";
import ProtocoloPage from "@/pages/ProtocoloPage";
import DocumentosVeiculosPage from "@/pages/DocumentosVeiculosPage";
import AvisoFeriasPage from "@/pages/AvisoFeriasPage";
import RelatorioPage from "@/pages/RelatorioPage";
import RelatorioImpressaoPage from "@/pages/RelatorioImpressaoPage";
import ConfiguracoesPage from "@/pages/ConfiguracoesPage";
import EPIPage from "@/pages/EPIPage";
import UniformePage from "@/pages/UniformePage";
import EntregaImpressaoPage from "@/pages/EntregaImpressaoPage";
import RelatorioVRPage from "@/pages/RelatorioVRPage";
import RelatorioVTPage from "@/pages/RelatorioVTPage";
import RelatorioVRImpressaoPage from "@/pages/RelatorioVRImpressaoPage";
import RelatorioVTImpressaoPage from "@/pages/RelatorioVTImpressaoPage";
import RelatorioBeneficioIndividualPage from "@/pages/RelatorioBeneficioIndividualPage";
import ApontamentoContabilidadePage from "@/pages/admin/ApontamentoContabilidadePage";
import HistoricoPage from "@/pages/HistoricoPage";
import AtestadosImportPage from "@/pages/AtestadosImportPage";
import ImportacaoFechamentoPage from "@/pages/ImportacaoFechamentoPage";
import ConferenciaPontoPage from "@/pages/ConferenciaPontoPage";
import AlmoxarifadoPage from "@/pages/AlmoxarifadoPage";
import FolhaPagamentoPage from "@/pages/FolhaPagamentoPage";
import RescisaoPage from "@/pages/RescisaoPage";
import ComprasPage from "@/pages/ComprasPage";
import EmailsContabilidadePage from "@/pages/admin/EmailsContabilidadePage";
import AcessoRemovidoPage from "@/pages/AcessoRemovidoPage";
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

/**
 * RoleRedirect — toda autenticação válida cai em /admin.
 * Acessos externos foram removidos.
 */
const RoleRedirect = () => {
  const { roleLoading } = useApp();
  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  return <Navigate to="/admin" replace />;
};

const AuthGate = () => {
  const { isAuthenticated, loading } = useApp();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/cadastro" element={<CadastroPage />} />
        <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
        <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<RoleRedirect />} />

      {/* ========== ADMIN PORTAL (único acesso) ========== */}
      <Route element={<AppLayout />}>
        <Route path="/admin" element={<DashboardPage />} />
        <Route path="/admin/empresas" element={<EmpresasPage />} />
        <Route path="/admin/base-mestra" element={<BaseMestraPage />} />
        <Route path="/admin/funcionarios" element={<FuncionariosPage />} />
        <Route path="/admin/funcionarios/:id" element={<EmployeeDetailPage />} />
        <Route path="/admin/lancamentos" element={<LancamentosPage />} />
        <Route path="/admin/fechamento" element={<FechamentoPage />} />
        <Route path="/admin/fechamento-ponto" element={<FechamentoPontoPage />} />
        <Route path="/admin/fechamentos-filiais" element={<FechamentosFiliaisPage />} />
        <Route path="/admin/fechamentos-filiais/:companyId/conferencia" element={<ConferenciaFechamentoPage />} />
        <Route path="/admin/relatorio" element={<RelatorioPage />} />
        <Route path="/admin/epi" element={<EPIPage />} />
        <Route path="/admin/uniformes" element={<UniformePage />} />
        <Route path="/admin/relatorio-vr" element={<RelatorioVRPage />} />
        <Route path="/admin/relatorio-vt" element={<RelatorioVTPage />} />
        <Route path="/admin/apontamento-contabilidade" element={<ApontamentoContabilidadePage />} />
        <Route path="/admin/historico" element={<HistoricoPage />} />
        <Route path="/admin/aso" element={<ASOPage />} />
        <Route path="/admin/prestadores" element={<PrestadoresPage />} />
        <Route path="/admin/combustivel" element={<CombustivelAdminPage />} />
        <Route path="/admin/galoes-combustivel" element={<CombustivelPage />} />
        <Route path="/admin/protocolo" element={<ProtocoloPage />} />
        <Route path="/admin/documentos-ativos" element={<DocumentosVeiculosPage />} />
        <Route path="/admin/aviso-ferias" element={<AvisoFeriasPage />} />
        <Route path="/admin/atestados" element={<AtestadosImportPage />} />
        <Route path="/admin/importar-fechamento" element={<ImportacaoFechamentoPage />} />
        <Route path="/admin/conferencia-ponto" element={<ConferenciaPontoPage />} />
        <Route path="/admin/almoxarifado" element={<AlmoxarifadoPage />} />
        <Route path="/admin/folha-pagamento" element={<FolhaPagamentoPage />} />
        <Route path="/admin/rescisoes" element={<RescisaoPage />} />
        <Route path="/admin/compras" element={<ComprasPage />} />
        <Route path="/admin/emails-contabilidade" element={<EmailsContabilidadePage />} />
        <Route path="/admin/configuracoes" element={<ConfiguracoesPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppProvider>
          <BrowserRouter>
            <Routes>
              {/* Páginas de impressão (uso interno admin) */}
              <Route path="/relatorio-impressao" element={<ErrorBoundary><RelatorioImpressaoPage /></ErrorBoundary>} />
              <Route path="/entrega-impressao" element={<ErrorBoundary><EntregaImpressaoPage /></ErrorBoundary>} />
              <Route path="/relatorio-vr-impressao" element={<ErrorBoundary><RelatorioVRImpressaoPage /></ErrorBoundary>} />
              <Route path="/relatorio-vt-impressao" element={<ErrorBoundary><RelatorioVTImpressaoPage /></ErrorBoundary>} />
              <Route path="/relatorio-beneficio-individual" element={<ErrorBoundary><RelatorioBeneficioIndividualPage /></ErrorBoundary>} />

              {/* ===== Rotas externas legadas — TODAS removidas =====
                  Mostram tela "Acesso removido pelo administrador". */}
              <Route path="/sp" element={<AcessoRemovidoPage />} />
              <Route path="/pg" element={<AcessoRemovidoPage />} />
              <Route path="/go" element={<AcessoRemovidoPage />} />
              <Route path="/g" element={<AcessoRemovidoPage />} />
              <Route path="/r/:slug" element={<AcessoRemovidoPage />} />
              <Route path="/acesso/:slug" element={<AcessoRemovidoPage />} />
              <Route path="/operacional" element={<AcessoRemovidoPage />} />
              <Route path="/operacional/*" element={<AcessoRemovidoPage />} />
              <Route path="/m/*" element={<AcessoRemovidoPage />} />
              <Route path="/financeiro" element={<AcessoRemovidoPage />} />
              <Route path="/financeiro/*" element={<AcessoRemovidoPage />} />
              <Route path="/financeiro-cpf/*" element={<AcessoRemovidoPage />} />
              <Route path="/faturamento" element={<AcessoRemovidoPage />} />
              <Route path="/faturamento/*" element={<AcessoRemovidoPage />} />
              <Route path="/faturamento-cpf/*" element={<AcessoRemovidoPage />} />
              <Route path="/filial" element={<AcessoRemovidoPage />} />
              <Route path="/filial/*" element={<AcessoRemovidoPage />} />
              <Route path="/campo" element={<AcessoRemovidoPage />} />
              <Route path="/campo/*" element={<AcessoRemovidoPage />} />
              <Route path="/rh/*" element={<AcessoRemovidoPage />} />
              <Route path="/almoxarifado/*" element={<AcessoRemovidoPage />} />
              <Route path="/documentos-rh/*" element={<AcessoRemovidoPage />} />
              <Route path="/setor-cpf/*" element={<AcessoRemovidoPage />} />
              <Route path="/abastecer/*" element={<AcessoRemovidoPage />} />

              {/* Rotas administrativas removidas */}
              <Route path="/admin/gerenciar-usuarios" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/links-acesso-cpf" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/permissoes-funcionarios" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/permissoes-funcionario" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/monitoramento" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/monitoramento-filiais" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/app-operacional" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/app-operacional/*" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/chamados" element={<Navigate to="/admin" replace />} />

              <Route path="/*" element={<AuthGate />} />
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
