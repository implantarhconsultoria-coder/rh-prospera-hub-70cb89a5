import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/context/AppContext";
import AppLayout from "@/components/AppLayout";
import FilialLayout from "@/components/FilialLayout";
import FinanceiroLayout from "@/components/FinanceiroLayout";
import FaturamentoLayout from "@/components/FaturamentoLayout";
import LoginPage from "@/pages/LoginPage";
import CadastroPage from "@/pages/CadastroPage";
import RecuperarSenhaPage from "@/pages/RecuperarSenhaPage";
import RedefinirSenhaPage from "@/pages/RedefinirSenhaPage";
import EscolherModuloPage from "@/pages/EscolherModuloPage";
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
import PermissoesAcessoPage from "@/pages/admin/PermissoesAcessoPage";

// Filial pages
import FilialDashboardPage from "@/pages/filial/FilialDashboardPage";
import FilialApontamentoPage from "@/pages/filial/FilialApontamentoPage";
import FilialAlertasPage from "@/pages/filial/FilialAlertasPage";
import MovimentoDiarioPage from "@/pages/filial/MovimentoDiarioPage";

// Financeiro pages
import FinanceiroDashboardPage from "@/pages/financeiro/FinanceiroDashboardPage";
import ContasPagarPage from "@/pages/financeiro/ContasPagarPage";
import ContasReceberPage from "@/pages/financeiro/ContasReceberPage";
import FornecedoresPage from "@/pages/financeiro/FornecedoresPage";
import BancosPage from "@/pages/financeiro/BancosPage";
import FluxoCaixaPage from "@/pages/financeiro/FluxoCaixaPage";
import InadimplenciaPage from "@/pages/financeiro/InadimplenciaPage";
import CentrosCustoPage from "@/pages/financeiro/CentrosCustoPage";
import ConciliacaoPage from "@/pages/financeiro/ConciliacaoPage";

// Faturamento pages
import FaturamentoDashboardPage from "@/pages/faturamento/FaturamentoDashboardPage";
import ClientesFatPage from "@/pages/faturamento/ClientesFatPage";
import ClienteDetailPage from "@/pages/faturamento/ClienteDetailPage";
import ContratosPage from "@/pages/faturamento/ContratosPage";
import ContratoDetailPage from "@/pages/faturamento/ContratoDetailPage";
import FaturasPage from "@/pages/faturamento/FaturasPage";
import MedicoesPage from "@/pages/faturamento/MedicoesPage";
import ReajustesPage from "@/pages/faturamento/ReajustesPage";
import PendenciasPage from "@/pages/faturamento/PendenciasPage";

import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

/**
 * Decide para onde mandar o usuário após login.
 * - admin → /admin
 * - 1 módulo → direto pro portal
 * - múltiplos → /escolher-modulo
 */
const RoleRedirect = () => {
  const { roleLoading, userRoles } = useApp();
  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (userRoles.includes('admin')) return <Navigate to="/admin" replace />;

  const filiais = userRoles.filter(r => r === 'filial_praia' || r === 'filial_goiania');
  const outros = userRoles.filter(r => r === 'financeiro' || r === 'faturamento');
  const total = filiais.length + outros.length;

  if (total === 0) return <Navigate to="/escolher-modulo" replace />;
  if (total === 1) {
    if (filiais.length) return <Navigate to="/filial" replace />;
    if (userRoles.includes('financeiro')) return <Navigate to="/financeiro" replace />;
    if (userRoles.includes('faturamento')) return <Navigate to="/faturamento" replace />;
  }
  return <Navigate to="/escolher-modulo" replace />;
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
      <Route path="/escolher-modulo" element={<EscolherModuloPage />} />

      {/* ========== ADMIN ========== */}
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
        <Route path="/admin/permissoes-acesso" element={<PermissoesAcessoPage />} />
        <Route path="/admin/usuarios" element={<PermissoesAcessoPage />} />
      </Route>

      {/* ========== RH FILIAL (PRAIA / GOIÂNIA) ========== */}
      <Route path="/filial" element={<FilialLayout />}>
        <Route index element={<FilialDashboardPage />} />
        <Route path="funcionarios" element={<FuncionariosPage />} />
        <Route path="funcionarios/:id" element={<EmployeeDetailPage />} />
        <Route path="movimento-diario" element={<MovimentoDiarioPage />} />
        <Route path="apontamento" element={<FilialApontamentoPage />} />
        <Route path="epi" element={<EPIPage />} />
        <Route path="uniformes" element={<UniformePage />} />
        <Route path="aviso-ferias" element={<AvisoFeriasPage />} />
        <Route path="aso" element={<ASOPage />} />
        <Route path="protocolo" element={<ProtocoloPage />} />
        <Route path="historico" element={<HistoricoPage />} />
        <Route path="alertas" element={<FilialAlertasPage />} />
      </Route>

      {/* ========== FINANCEIRO ========== */}
      <Route path="/financeiro" element={<FinanceiroLayout />}>
        <Route index element={<FinanceiroDashboardPage />} />
        <Route path="contas-receber" element={<ContasReceberPage />} />
        <Route path="contas-pagar" element={<ContasPagarPage />} />
        <Route path="fornecedores" element={<FornecedoresPage />} />
        <Route path="bancos" element={<BancosPage />} />
        <Route path="fluxo-caixa" element={<FluxoCaixaPage />} />
        <Route path="inadimplencia" element={<InadimplenciaPage />} />
        <Route path="centros-custo" element={<CentrosCustoPage />} />
        <Route path="conciliacao" element={<ConciliacaoPage />} />
      </Route>

      {/* ========== FATURAMENTO ========== */}
      <Route path="/faturamento" element={<FaturamentoLayout />}>
        <Route index element={<FaturamentoDashboardPage />} />
        <Route path="clientes" element={<ClientesFatPage />} />
        <Route path="clientes/:id" element={<ClienteDetailPage />} />
        <Route path="contratos" element={<ContratosPage />} />
        <Route path="contratos/:id" element={<ContratoDetailPage />} />
        <Route path="faturas" element={<FaturasPage />} />
        <Route path="medicoes" element={<MedicoesPage />} />
        <Route path="reajustes" element={<ReajustesPage />} />
        <Route path="pendencias" element={<PendenciasPage />} />
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

              {/* Rotas legadas — todas redirecionam pro login */}
              <Route path="/sp" element={<Navigate to="/" replace />} />
              <Route path="/pg" element={<Navigate to="/" replace />} />
              <Route path="/go" element={<Navigate to="/" replace />} />
              <Route path="/portal/*" element={<Navigate to="/" replace />} />
              <Route path="/operacional/*" element={<Navigate to="/" replace />} />
              <Route path="/setor-cpf/*" element={<Navigate to="/" replace />} />
              <Route path="/financeiro-cpf/*" element={<Navigate to="/" replace />} />
              <Route path="/faturamento-cpf/*" element={<Navigate to="/" replace />} />
              <Route path="/r/:slug" element={<Navigate to="/" replace />} />
              <Route path="/m/*" element={<Navigate to="/" replace />} />
              <Route path="/g" element={<Navigate to="/" replace />} />
              <Route path="/abastecer/*" element={<Navigate to="/" replace />} />
              <Route path="/admin/links-acesso-cpf" element={<Navigate to="/admin/permissoes-acesso" replace />} />
              <Route path="/admin/gerenciar-usuarios" element={<Navigate to="/admin/permissoes-acesso" replace />} />
              <Route path="/admin/permissoes-funcionarios" element={<Navigate to="/admin/permissoes-acesso" replace />} />
              <Route path="/admin/permissoes-funcionario" element={<Navigate to="/admin/permissoes-acesso" replace />} />
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
