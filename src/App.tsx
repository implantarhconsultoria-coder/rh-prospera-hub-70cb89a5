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
import FaturamentoLayout from "@/components/FaturamentoLayout";
import FinanceiroLayout from "@/components/FinanceiroLayout";
import MecanicoHomePage from "@/pages/mecanico/MecanicoHomePage";
import MecanicoPontoPage from "@/pages/mecanico/MecanicoPontoPage";
import MecanicoChamadosPage from "@/pages/mecanico/MecanicoChamadosPage";
import MecanicoEstoquePage from "@/pages/mecanico/MecanicoEstoquePage";
import MecanicoKmPage from "@/pages/mecanico/MecanicoKmPage";
import MecanicoAbastecimentoPage from "@/pages/mecanico/MecanicoAbastecimentoPage";
import MecanicoGaloesPage from "@/pages/mecanico/MecanicoGaloesPage";
import MecanicoHistoricoPage from "@/pages/mecanico/MecanicoHistoricoPage";
import LoginPage from "@/pages/LoginPage";
import CadastroPage from "@/pages/CadastroPage";
import RecuperarSenhaPage from "@/pages/RecuperarSenhaPage";
import RedefinirSenhaPage from "@/pages/RedefinirSenhaPage";
import DashboardPage from "@/pages/DashboardPage";
import FilialDashboardPage from "@/pages/filial/FilialDashboardPage";
import FilialAlertasPage from "@/pages/filial/FilialAlertasPage";
import MovimentoDiarioPage from "@/pages/filial/MovimentoDiarioPage";
import FilialApontamentoPage from "@/pages/filial/FilialApontamentoPage";
import FechamentosFiliaisPage from "@/pages/admin/FechamentosFiliaisPage";
import ConferenciaFechamentoPage from "@/pages/admin/ConferenciaFechamentoPage";
import MonitoramentoFiliaisPage from "@/pages/admin/MonitoramentoFiliaisPage";
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
import AcessoCpfPage from "@/pages/AcessoCpfPage";
import AcessoModuloCpfPage from "@/pages/AcessoModuloCpfPage";
import AbastecerPublicoPage from "@/pages/AbastecerPublicoPage";
import AcessoFilialOperacionalPage from "@/pages/AcessoFilialOperacionalPage";
import { FinanceiroCpfLayout, FaturamentoCpfLayout } from "@/components/CpfPortalLayout";
import SetorCpfPage from "@/pages/SetorCpfPage";
import LinksAcessoCpfPage from "@/pages/admin/LinksAcessoCpfPage";
import PermissoesFuncionariosPage from "@/pages/admin/PermissoesFuncionariosPage";
import EmailsContabilidadePage from "@/pages/admin/EmailsContabilidadePage";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";

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
  if (userRoles.includes('faturamento')) return <Navigate to="/faturamento" replace />;
  if (userRoles.includes('financeiro')) return <Navigate to="/financeiro" replace />;
  if (userRoles.includes('operacional')) return <Navigate to="/operacional-dispatch" replace />;
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
        <Route path="/admin/monitoramento" element={<MonitoramentoPage />} />
        <Route path="/admin/gerenciar-usuarios" element={<GerenciarUsuariosPage />} />
        <Route path="/admin/chamados" element={<DespacharChamadoPage />} />
        <Route path="/admin/app-operacional" element={<AppOperacionalPage />} />
        <Route path="/admin/app-operacional/:id" element={<TecnicoDetailPage />} />
        <Route path="/admin/links-acesso-cpf" element={<LinksAcessoCpfPage />} />
        <Route path="/admin/permissoes-funcionarios" element={<PermissoesFuncionariosPage />} />
        <Route path="/admin/emails-contabilidade" element={<EmailsContabilidadePage />} />
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
        <Route path="/filial/atestados" element={<AtestadosImportPage />} />
        <Route path="/filial/protocolo" element={<ProtocoloPage />} />
        <Route path="/filial/epi" element={<EPIPage />} />
        <Route path="/filial/uniformes" element={<UniformePage />} />
        <Route path="/filial/historico" element={<HistoricoPage />} />
        <Route path="/filial/alertas" element={<FilialAlertasPage />} />
        <Route path="/filial/movimento-diario" element={<MovimentoDiarioPage />} />
        <Route path="/filial/apontamento" element={<FilialApontamentoPage />} />
        <Route path="/filial/fechamento" element={<Navigate to="/filial/apontamento" replace />} />
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
      {/* ========== OPERACIONAL DISPATCH (uso interno admin/operacional desktop) ========== */}
      <Route element={<OperacionalLayout />}>
        <Route path="/operacional-dispatch" element={<DespacharChamadoPage />} />
      </Route>

      {/* ========== FATURAMENTO PORTAL (acesso teste FAT) ========== */}
      <Route element={<FaturamentoLayout />}>
        <Route path="/faturamento" element={<FaturamentoDashboardPage />} />
        <Route path="/faturamento/clientes" element={<ClientesFatPage />} />
        <Route path="/faturamento/clientes/:id" element={<ClienteDetailPage />} />
        <Route path="/faturamento/contratos" element={<ContratosPage />} />
        <Route path="/faturamento/contratos/:id" element={<ContratoDetailPage />} />
        <Route path="/faturamento/faturas" element={<FaturasPage />} />
        <Route path="/faturamento/medicoes" element={<MedicoesPage />} />
        <Route path="/faturamento/reajustes" element={<ReajustesPage />} />
        <Route path="/faturamento/pendencias" element={<PendenciasPage />} />
      </Route>

      {/* ========== FINANCEIRO PORTAL (acesso teste FIN) ========== */}
      <Route element={<FinanceiroLayout />}>
        <Route path="/financeiro" element={<FinanceiroDashboardPage />} />
        <Route path="/financeiro/contas-receber" element={<ContasReceberPage />} />
        <Route path="/financeiro/contas-pagar" element={<ContasPagarPage />} />
        <Route path="/financeiro/fornecedores" element={<FornecedoresPage />} />
        <Route path="/financeiro/bancos" element={<BancosPage />} />
        <Route path="/financeiro/fluxo-caixa" element={<FluxoCaixaPage />} />
        <Route path="/financeiro/inadimplencia" element={<InadimplenciaPage />} />
        <Route path="/financeiro/centros-custo" element={<CentrosCustoPage />} />
        <Route path="/financeiro/conciliacao" element={<ConciliacaoPage />} />
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
              {/* ========== 3 LINKS ÚNICOS POR REGIÃO — abrem tela de CPF ==========
                  /sp  -> link único São Paulo
                  /pg  -> link único Praia Grande
                  /go  -> link único Goiânia
                  Após informar o CPF, o sistema redireciona para o módulo
                  liberado para o funcionário em funcionario_modulos. */}
              <Route path="/sp" element={<AcessoModuloCpfPage />} />
              <Route path="/pg" element={<AcessoModuloCpfPage />} />
              <Route path="/go" element={<AcessoModuloCpfPage />} />
              {/* ========== PORTAL OPERACIONAL (canônico) — token único por CPF ========== */}
              <Route path="/operacional/:token" element={<MecanicoLayout />}>
                <Route index element={<MecanicoHomePage />} />
                <Route path="ponto" element={<MecanicoPontoPage />} />
                <Route path="chamados" element={<MecanicoChamadosPage />} />
                <Route path="estoque" element={<MecanicoEstoquePage />} />
                <Route path="km" element={<MecanicoKmPage />} />
                <Route path="abastecimento" element={<MecanicoAbastecimentoPage />} />
                <Route path="galoes" element={<MecanicoGaloesPage />} />
                <Route path="historico" element={<MecanicoHistoricoPage />} />
              </Route>
              {/* APP MECÂNICO LEGADO — redirect para /operacional/:token (preserva QR antigos) */}
              <Route path="/m/:token" element={<MecanicoLayout />}>
                <Route index element={<MecanicoHomePage />} />
                <Route path="ponto" element={<MecanicoPontoPage />} />
                <Route path="chamados" element={<MecanicoChamadosPage />} />
                <Route path="estoque" element={<MecanicoEstoquePage />} />
                <Route path="km" element={<MecanicoKmPage />} />
                <Route path="abastecimento" element={<MecanicoAbastecimentoPage />} />
                <Route path="galoes" element={<MecanicoGaloesPage />} />
                <Route path="historico" element={<MecanicoHistoricoPage />} />
              </Route>
              {/* QR público de abastecimento de combustível */}
              <Route path="/abastecer/:codigo" element={<AbastecerPublicoPage />} />
              {/* Link único permanente por CPF (Goiânia e demais filiais com link compartilhado) */}
              <Route path="/g" element={<AcessoCpfPage />} />
              {/* Links permanentes por módulo/unidade — acesso por CPF */}
              <Route path="/acesso/:slug" element={<AcessoModuloCpfPage />} />
              {/* Alias curto para link único por região */}
              <Route path="/r/:slug" element={<AcessoModuloCpfPage />} />
              {/* Portais isolados Financeiro/Faturamento por CPF */}
              <Route path="/financeiro-cpf" element={<FinanceiroCpfLayout />}>
                <Route index element={<FinanceiroDashboardPage />} />
                <Route path="contas-receber" element={<ContasReceberPage />} />
                <Route path="contas-pagar" element={<ContasPagarPage />} />
                <Route path="bancos" element={<BancosPage />} />
                <Route path="fluxo-caixa" element={<FluxoCaixaPage />} />
                <Route path="inadimplencia" element={<InadimplenciaPage />} />
                <Route path="conciliacao" element={<ConciliacaoPage />} />
              </Route>
              <Route path="/faturamento-cpf" element={<FaturamentoCpfLayout />}>
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
              {/* Portais isolados por CPF para os demais setores (RH, Almoxarifado, Mecânicos, Filial) */}
              <Route path="/setor-cpf/:modulo" element={<SetorCpfPage />} />
              <Route path="/relatorio-impressao" element={<ErrorBoundary><RelatorioImpressaoPage /></ErrorBoundary>} />
              <Route path="/entrega-impressao" element={<ErrorBoundary><EntregaImpressaoPage /></ErrorBoundary>} />
              <Route path="/relatorio-vr-impressao" element={<ErrorBoundary><RelatorioVRImpressaoPage /></ErrorBoundary>} />
              <Route path="/relatorio-vt-impressao" element={<ErrorBoundary><RelatorioVTImpressaoPage /></ErrorBoundary>} />
              <Route path="/relatorio-beneficio-individual" element={<ErrorBoundary><RelatorioBeneficioIndividualPage /></ErrorBoundary>} />
              <Route path="/*" element={<AuthGate />} />
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
