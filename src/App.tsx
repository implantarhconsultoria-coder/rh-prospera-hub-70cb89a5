import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/context/AppContext";
import AppLayout from "@/components/AppLayout";
import FilialLayout from "@/components/FilialLayout";
import OperacionalLayout from "@/components/OperacionalLayout";
import CampoLayout from "@/components/CampoLayout";
import MecanicoLayout from "@/components/MecanicoLayout";
import MecanicoHomePage from "@/pages/mecanico/MecanicoHomePage";
import MecanicoPontoPage from "@/pages/mecanico/MecanicoPontoPage";
import MecanicoChamadosPage from "@/pages/mecanico/MecanicoChamadosPage";
import MecanicoEstoquePage from "@/pages/mecanico/MecanicoEstoquePage";
import MecanicoKmPage from "@/pages/mecanico/MecanicoKmPage";
import LoginPage from "@/pages/LoginPage";
import CadastroPage from "@/pages/CadastroPage";
import RecuperarSenhaPage from "@/pages/RecuperarSenhaPage";
import RedefinirSenhaPage from "@/pages/RedefinirSenhaPage";
import DashboardPage from "@/pages/DashboardPage";
import FilialDashboardPage from "@/pages/filial/FilialDashboardPage";
import FilialAlertasPage from "@/pages/filial/FilialAlertasPage";
import EmpresasPage from "@/pages/EmpresasPage";
import BaseMestraPage from "@/pages/BaseMestraPage";
import ASOPage from "@/pages/ASOPage";
import PrestadoresPage from "@/pages/PrestadoresPage";
import FuncionariosPage from "@/pages/FuncionariosPage";
import EmployeeDetailPage from "@/pages/EmployeeDetailPage";
import LancamentosPage from "@/pages/LancamentosPage";
import FechamentoPage from "@/pages/FechamentoPage";
import CombustivelPage from "@/pages/CombustivelPage";
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
import HistoricoPage from "@/pages/HistoricoPage";
import AlmoxarifadoPage from "@/pages/AlmoxarifadoPage";
import MonitoramentoPage from "@/pages/MonitoramentoPage";
import GerenciarUsuariosPage from "@/pages/GerenciarUsuariosPage";
import AppOperacionalPage from "@/pages/admin/AppOperacionalPage";
import TecnicoDetailPage from "@/pages/admin/TecnicoDetailPage";
import CampoHomePage from "@/pages/campo/CampoHomePage";
import PontoPage from "@/pages/campo/PontoPage";
import ChamadosPage from "@/pages/campo/ChamadosPage";
import EstoqueVeiculoPage from "@/pages/campo/EstoqueVeiculoPage";
import RegistroKmPage from "@/pages/campo/RegistroKmPage";
import DespacharChamadoPage from "@/pages/campo/DespacharChamadoPage";
import FaturamentoDashboardPage from "@/pages/faturamento/FaturamentoDashboardPage";
import ClientesFatPage from "@/pages/faturamento/ClientesFatPage";
import ClienteDetailPage from "@/pages/faturamento/ClienteDetailPage";
import ContratosPage from "@/pages/faturamento/ContratosPage";
import ContratoDetailPage from "@/pages/faturamento/ContratoDetailPage";
import { FaturasPage, MedicoesPage, ReajustesPage, PendenciasPage } from "@/pages/faturamento/FaturamentoPlaceholders";
import FinanceiroDashboardPage from "@/pages/financeiro/FinanceiroDashboardPage";
import ContasReceberPage from "@/pages/financeiro/ContasReceberPage";
import ContasPagarPage from "@/pages/financeiro/ContasPagarPage";
import FornecedoresPage from "@/pages/financeiro/FornecedoresPage";
import BancosPage from "@/pages/financeiro/BancosPage";
import FluxoCaixaPage from "@/pages/financeiro/FluxoCaixaPage";
import InadimplenciaPage from "@/pages/financeiro/InadimplenciaPage";
import CentrosCustoPage from "@/pages/financeiro/CentrosCustoPage";
import ConciliacaoPage from "@/pages/financeiro/ConciliacaoPage";
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

/**
 * RoleRedirect — after login, sends user to the correct portal based on role.
 */
const RoleRedirect = () => {
  const { userRoles, roleLoading } = useApp();

  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  // Priority: admin always wins (admin can also have tecnico_campo for testing the field app)
  if (userRoles.includes('admin')) return <Navigate to="/admin" replace />;
  if (userRoles.includes('operacional')) return <Navigate to="/operacional" replace />;
  if (userRoles.includes('filial_praia') || userRoles.includes('filial_goiania')) return <Navigate to="/filial" replace />;
  if (userRoles.includes('almoxarifado')) return <Navigate to="/filial" replace />;
  if (userRoles.includes('tecnico_campo')) return <Navigate to="/campo" replace />;

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
      {/* Root → redirect to correct portal */}
      <Route path="/" element={<RoleRedirect />} />

      {/* ========== ADMIN PORTAL ========== */}
      <Route element={<AppLayout />}>
        <Route path="/admin" element={<DashboardPage />} />
        <Route path="/admin/empresas" element={<EmpresasPage />} />
        <Route path="/admin/base-mestra" element={<BaseMestraPage />} />
        <Route path="/admin/funcionarios" element={<FuncionariosPage />} />
        <Route path="/admin/funcionarios/:id" element={<EmployeeDetailPage />} />
        <Route path="/admin/lancamentos" element={<LancamentosPage />} />
        <Route path="/admin/fechamento" element={<FechamentoPage />} />
        <Route path="/admin/relatorio" element={<RelatorioPage />} />
        <Route path="/admin/epi" element={<EPIPage />} />
        <Route path="/admin/uniformes" element={<UniformePage />} />
        <Route path="/admin/relatorio-vr" element={<RelatorioVRPage />} />
        <Route path="/admin/relatorio-vt" element={<RelatorioVTPage />} />
        <Route path="/admin/historico" element={<HistoricoPage />} />
        <Route path="/admin/aso" element={<ASOPage />} />
        <Route path="/admin/prestadores" element={<PrestadoresPage />} />
        <Route path="/admin/combustivel" element={<CombustivelPage />} />
        <Route path="/admin/protocolo" element={<ProtocoloPage />} />
        <Route path="/admin/documentos-ativos" element={<DocumentosVeiculosPage />} />
        <Route path="/admin/aviso-ferias" element={<AvisoFeriasPage />} />
        <Route path="/admin/almoxarifado" element={<AlmoxarifadoPage />} />
        <Route path="/admin/monitoramento" element={<MonitoramentoPage />} />
        <Route path="/admin/gerenciar-usuarios" element={<GerenciarUsuariosPage />} />
        <Route path="/admin/chamados" element={<DespacharChamadoPage />} />
        <Route path="/admin/app-operacional" element={<AppOperacionalPage />} />
        <Route path="/admin/app-operacional/:id" element={<TecnicoDetailPage />} />
        <Route path="/admin/configuracoes" element={<ConfiguracoesPage />} />
        {/* Faturamento */}
        <Route path="/admin/faturamento" element={<FaturamentoDashboardPage />} />
        <Route path="/admin/faturamento/clientes" element={<ClientesFatPage />} />
        <Route path="/admin/faturamento/clientes/:id" element={<ClienteDetailPage />} />
        <Route path="/admin/faturamento/contratos" element={<ContratosPage />} />
        <Route path="/admin/faturamento/contratos/:id" element={<ContratoDetailPage />} />
        <Route path="/admin/faturamento/faturas" element={<FaturasPage />} />
        <Route path="/admin/faturamento/medicoes" element={<MedicoesPage />} />
        <Route path="/admin/faturamento/reajustes" element={<ReajustesPage />} />
        <Route path="/admin/faturamento/pendencias" element={<PendenciasPage />} />
        {/* Financeiro */}
        <Route path="/admin/financeiro" element={<FinanceiroDashboardPage />} />
        <Route path="/admin/financeiro/contas-receber" element={<ContasReceberPage />} />
        <Route path="/admin/financeiro/contas-pagar" element={<ContasPagarPage />} />
        <Route path="/admin/financeiro/fornecedores" element={<FornecedoresPage />} />
        <Route path="/admin/financeiro/bancos" element={<BancosPage />} />
        <Route path="/admin/financeiro/fluxo-caixa" element={<FluxoCaixaPage />} />
        <Route path="/admin/financeiro/inadimplencia" element={<InadimplenciaPage />} />
        <Route path="/admin/financeiro/centros-custo" element={<CentrosCustoPage />} />
        <Route path="/admin/financeiro/conciliacao" element={<ConciliacaoPage />} />
      </Route>

      {/* ========== FILIAL PORTAL ========== */}
      <Route element={<FilialLayout />}>
        <Route path="/filial" element={<FilialDashboardPage />} />
        <Route path="/filial/funcionarios" element={<FuncionariosPage />} />
        <Route path="/filial/funcionarios/:id" element={<EmployeeDetailPage />} />
        <Route path="/filial/aviso-ferias" element={<AvisoFeriasPage />} />
        <Route path="/filial/aso" element={<ASOPage />} />
        <Route path="/filial/protocolo" element={<ProtocoloPage />} />
        <Route path="/filial/alertas" element={<FilialAlertasPage />} />
      </Route>

      {/* ========== CAMPO PORTAL ========== */}
      <Route element={<CampoLayout />}>
        <Route path="/campo" element={<CampoHomePage />} />
        <Route path="/campo/ponto" element={<PontoPage />} />
        <Route path="/campo/chamados" element={<ChamadosPage />} />
        <Route path="/campo/estoque" element={<EstoqueVeiculoPage />} />
        <Route path="/campo/km" element={<RegistroKmPage />} />
      </Route>

      {/* ========== OPERACIONAL PORTAL ========== */}
      <Route element={<OperacionalLayout />}>
        <Route path="/operacional" element={<DespacharChamadoPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppProvider>
        <BrowserRouter>
          <Routes>
            {/* ========== APP MECÂNICO POR LINK EXCLUSIVO (sem login) ========== */}
            <Route path="/m/:token" element={<MecanicoLayout />}>
              <Route index element={<MecanicoHomePage />} />
              <Route path="ponto" element={<MecanicoPontoPage />} />
              <Route path="chamados" element={<MecanicoChamadosPage />} />
              <Route path="estoque" element={<MecanicoEstoquePage />} />
              <Route path="km" element={<MecanicoKmPage />} />
            </Route>
            <Route path="/relatorio-impressao" element={<RelatorioImpressaoPage />} />
            <Route path="/entrega-impressao" element={<EntregaImpressaoPage />} />
            <Route path="/relatorio-vr-impressao" element={<RelatorioVRImpressaoPage />} />
            <Route path="/relatorio-vt-impressao" element={<RelatorioVTImpressaoPage />} />
            <Route path="/relatorio-beneficio-individual" element={<RelatorioBeneficioIndividualPage />} />
            <Route path="/*" element={<AuthGate />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
