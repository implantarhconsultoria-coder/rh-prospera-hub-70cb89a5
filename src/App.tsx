import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useParams, useLocation } from "react-router-dom";

// Alias legado: redireciona /mecanico-ext/:acessoId(/...) para /app-mecanico/:acessoId(/...)
const MecanicoExtAlias = () => {
  const { acessoId } = useParams<{ acessoId: string }>();
  const location = useLocation();
  const resto = location.pathname.replace(/^\/mecanico-ext\/[^/]+/, "");
  return <Navigate to={`/app-mecanico/${acessoId}${resto}`} replace />;
};
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/context/AppContext";
import AppLayout from "@/components/AppLayout";
import FilialLayout from "@/components/FilialLayout";
import FaturamentoLayout from "@/components/FaturamentoLayout";
import FinanceiroLayout from "@/components/FinanceiroLayout";
import LoginPage from "@/pages/LoginPage";
import CadastroPage from "@/pages/CadastroPage";
import RecuperarSenhaPage from "@/pages/RecuperarSenhaPage";
import RedefinirSenhaPage from "@/pages/RedefinirSenhaPage";
import DashboardPage from "@/pages/DashboardPage";
import FilialDashboardPage from "@/pages/filial/FilialDashboardPage";
import FilialAlertasPage from "@/pages/filial/FilialAlertasPage";
import MovimentoDiarioPage from "@/pages/filial/MovimentoDiarioPage";
import FilialFechamentoPage from "@/pages/filial/FilialFechamentoPage";
import FechamentosFiliaisPage from "@/pages/admin/FechamentosFiliaisPage";
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
import RecibosBeneficioImpressaoPage from "@/pages/RecibosBeneficioImpressaoPage";
import RelatorioBeneficioIndividualPage from "@/pages/RelatorioBeneficioIndividualPage";
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
import AppMecanicoEmReconstrucaoPage from "@/pages/admin/AppMecanicoEmReconstrucaoPage";
import AppMecanicoAdminPage from "@/pages/admin/AppMecanicoAdminPage";
import CombustivelQRAdminPage from "@/pages/admin/CombustivelQRAdminPage";
import AcessoMecanicoPage from "@/app-mecanico/AcessoMecanicoPage";
import MecanicoAppLayout from "@/app-mecanico/MecanicoAppLayout";
import MecHomePage from "@/app-mecanico/pages/HomePage";
import MecPontoPage from "@/app-mecanico/pages/PontoPage";
import MecChamadosPage from "@/app-mecanico/pages/ChamadosPage";
import MecVeiculoPage from "@/app-mecanico/pages/VeiculoPage";
import MecHistoricoPage from "@/app-mecanico/pages/HistoricoPage";
import MecAbastecimentoPage from "@/app-mecanico/pages/AbastecimentoPage";
import DespacharChamadoPage from "@/pages/campo/DespacharChamadoPage";
import FaturamentoDashboardPage from "@/pages/faturamento/FaturamentoDashboardPage";
import ClientesFatPage from "@/pages/faturamento/ClientesFatPage";
import ClienteDetailPage from "@/pages/faturamento/ClienteDetailPage";
import ContratosPage from "@/pages/faturamento/ContratosPage";
import ContratoDetailPage from "@/pages/faturamento/ContratoDetailPage";
import { FaturasPage, MedicoesPage, ReajustesPage, PendenciasPage } from "@/pages/faturamento/FaturamentoPlaceholders";
import ConferenciaPage from "@/pages/faturamento/ConferenciaPage";
import ImportacoesDN4Page from "@/pages/faturamento/ImportacoesDN4Page";
import FaturamentoDN4Layout from "@/pages/admin/faturamento-dn4/FaturamentoDN4Layout";
import FaturamentoDN4DashboardPage from "@/pages/admin/faturamento-dn4/FaturamentoDN4DashboardPage";
import FaturamentoDN4NovoPage from "@/pages/admin/faturamento-dn4/FaturamentoDN4NovoPage";
import FaturamentoDN4ConferenciaPage from "@/pages/admin/faturamento-dn4/FaturamentoDN4ConferenciaPage";
import FaturamentoDN4HistoricoPage from "@/pages/admin/faturamento-dn4/FaturamentoDN4HistoricoPage";
import FaturamentoDN4RelatorioPage from "@/pages/admin/faturamento-dn4/FaturamentoDN4RelatorioPage";
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
import AcessoExternoPage from "@/pages/AcessoExternoPage";
import PortaisPage from "@/pages/PortaisPage";
import AcessosExternosPage from "@/pages/admin/AcessosExternosPage";
import AssistentePage from "@/pages/admin/AssistentePage";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";
import ExternoLayout from "@/components/ExternoLayout";
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Building, Landmark, TrendingDown, AlertTriangle, Layers, GitMerge,
  FileText, Users, FileSignature, Receipt, TrendingUp, ClipboardCheck,
  UserCircle, Stethoscope, FileWarning, CalendarDays, FileCheck,
  Package, Shirt, Shield,
  Wrench, Headphones,
  LayoutDashboard, Bell, Activity,
} from "lucide-react";

const EXT_ITEMS_FINANCEIRO = [
  { to: '', label: 'Dashboard', icon: Wallet, end: true },
  { to: 'contas-receber', label: 'Contas a Receber', icon: ArrowDownCircle },
  { to: 'contas-pagar', label: 'Contas a Pagar', icon: ArrowUpCircle },
  { to: 'fornecedores', label: 'Fornecedores', icon: Building },
  { to: 'bancos', label: 'Bancos', icon: Landmark },
  { to: 'fluxo-caixa', label: 'Fluxo de Caixa', icon: TrendingDown },
  { to: 'inadimplencia', label: 'Inadimplência', icon: AlertTriangle },
  { to: 'centros-custo', label: 'Centros de Custo', icon: Layers },
  { to: 'conciliacao', label: 'Conciliação', icon: GitMerge },
];
const EXT_ITEMS_FATURAMENTO = [
  { to: '', label: 'Dashboard', icon: TrendingUp, end: true },
  { to: 'clientes', label: 'Clientes', icon: Users },
  { to: 'contratos', label: 'Contratos', icon: FileSignature },
  { to: 'medicoes', label: 'Medições', icon: FileText },
  { to: 'conferencia', label: 'Conferência', icon: ClipboardCheck },
  { to: 'faturas', label: 'Faturas', icon: Receipt },
  { to: 'reajustes', label: 'Reajustes', icon: TrendingUp },
  { to: 'pendencias', label: 'Pendências', icon: AlertTriangle },
];
const EXT_ITEMS_RH = [
  { to: '', label: 'Funcionários', icon: UserCircle, end: true },
  { to: 'aso', label: 'ASO', icon: Stethoscope },
  { to: 'atestados', label: 'Atestados', icon: FileWarning },
  { to: 'aviso-ferias', label: 'Aviso de Férias', icon: CalendarDays },
  { to: 'protocolo', label: 'Protocolo', icon: FileCheck },
];
const EXT_ITEMS_ALMOX = [
  { to: '', label: 'Almoxarifado', icon: Package, end: true },
  { to: 'epi', label: 'EPI', icon: Shield },
  { to: 'uniformes', label: 'Uniformes', icon: Shirt },
];
const EXT_ITEMS_OP = [
  { to: '', label: 'Chamados', icon: Headphones, end: true },
  { to: 'tecnicos', label: 'Técnicos', icon: Wrench },
];
const EXT_ITEMS_FILIAL = [
  { to: '', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: 'funcionarios', label: 'Funcionários', icon: UserCircle },
  { to: 'aviso-ferias', label: 'Aviso de Férias', icon: CalendarDays },
  { to: 'aso', label: 'ASO', icon: Stethoscope },
  { to: 'atestados', label: 'Atestados', icon: FileWarning },
  { to: 'protocolo', label: 'Protocolo', icon: FileCheck },
  { to: 'alertas', label: 'Alertas', icon: Bell },
  { to: 'movimento-diario', label: 'Movimento Diário', icon: Activity },
  { to: 'fechamento', label: 'Fechamento', icon: ClipboardCheck },
];
const EXT_ITEMS_CAMPO = [
  { to: '', label: 'Chamados', icon: Headphones, end: true },
];

const queryClient = new QueryClient();

/**
 * RoleRedirect — after login, sends user to the correct portal based on role.
 * App Mecânico antigo removido; tecnico_campo/operacional caem no admin como fallback.
 */
const RoleRedirect = () => {
  const { userRoles, roleLoading } = useApp();

  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (userRoles.includes('admin')) return <Navigate to="/admin" replace />;
  if (userRoles.includes('faturamento')) return <Navigate to="/faturamento" replace />;
  if (userRoles.includes('financeiro')) return <Navigate to="/financeiro" replace />;
  if (userRoles.includes('filial_praia') || userRoles.includes('filial_goiania')) return <Navigate to="/filial" replace />;
  if (userRoles.includes('almoxarifado')) return <Navigate to="/filial" replace />;

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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/index" element={<LoginPage />} />
        <Route path="/" element={<LoginPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Root → redirect to correct portal */}
      <Route path="/" element={<RoleRedirect />} />
      <Route path="/index" element={<Navigate to="/" replace />} />
      <Route path="/login" element={<Navigate to="/" replace />} />

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
        <Route path="/admin/relatorio" element={<RelatorioPage />} />
        <Route path="/admin/epi" element={<EPIPage />} />
        <Route path="/admin/uniformes" element={<UniformePage />} />
        <Route path="/admin/relatorio-vr" element={<RelatorioVRPage />} />
        <Route path="/admin/relatorio-vt" element={<RelatorioVTPage />} />
        <Route path="/admin/historico" element={<HistoricoPage />} />
        <Route path="/admin/aso" element={<ASOPage />} />
        <Route path="/admin/prestadores" element={<PrestadoresPage />} />
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
        {/* App Mecânico (novo) */}
        <Route path="/admin/app-mecanico" element={<AppMecanicoAdminPage />} />
        <Route path="/admin/app-operacional" element={<Navigate to="/admin/app-mecanico" replace />} />
        <Route path="/admin/app-operacional/:id" element={<Navigate to="/admin/app-mecanico" replace />} />
        <Route path="/admin/combustivel-qr" element={<Navigate to="/admin/abastecimento-qrcode" replace />} />
        <Route path="/admin/abastecimento-qrcode" element={<CombustivelQRAdminPage />} />
        <Route path="/admin/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="/admin/acessos-externos" element={<AcessosExternosPage />} />
        <Route path="/admin/assistente" element={<AssistentePage />} />
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
        <Route path="/admin/faturamento/conferencia" element={<ConferenciaPage />} />
        {/* Base de Faturamento (importação) */}
        <Route path="/admin/faturamento/importacao-dados" element={<ImportacoesDN4Page />} />
        <Route path="/admin/faturamento/importacao" element={<FaturamentoDN4Layout />}>
          <Route index element={<FaturamentoDN4DashboardPage />} />
          <Route path="novo" element={<FaturamentoDN4NovoPage />} />
          <Route path="conferencia" element={<FaturamentoDN4ConferenciaPage />} />
          <Route path="historico" element={<FaturamentoDN4HistoricoPage />} />
          <Route path="relatorio" element={<FaturamentoDN4RelatorioPage />} />
        </Route>
        {/* Redirecionamentos legados (rota interna antiga) */}
        <Route path="/admin/faturamento/dn4" element={<Navigate to="/admin/faturamento/importacao-dados" replace />} />
        <Route path="/admin/faturamento/dn4/*" element={<Navigate to="/admin/faturamento/importacao-dados" replace />} />
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
        <Route path="/filial/alertas" element={<FilialAlertasPage />} />
        <Route path="/filial/movimento-diario" element={<MovimentoDiarioPage />} />
        <Route path="/filial/fechamento" element={<FilialFechamentoPage />} />
      </Route>

      {/* App Mecânico antigo removido — campo/operacional não têm portal próprio por enquanto */}

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
        <Route path="/faturamento/conferencia" element={<ConferenciaPage />} />
        <Route path="/faturamento/importacao-dados" element={<ImportacoesDN4Page />} />
        <Route path="/faturamento/importacoes-dn4" element={<Navigate to="/faturamento/importacao-dados" replace />} />
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
              {/* ========== ACESSO EXTERNO POR PIN — PORTAL ÚNICO ========== */}
              {/* /acesso-filial é a rota canônica única para todos os portais externos (exceto mecânico) */}
              <Route path="/acesso-filial" element={<ErrorBoundary><AcessoExternoPage /></ErrorBoundary>} />
              <Route path="/portais" element={<ErrorBoundary><PortaisPage /></ErrorBoundary>} />
              {/* Aliases legados redirecionam para o portal único */}
              <Route path="/acesso-financeiro" element={<Navigate to="/acesso-filial" replace />} />
              <Route path="/acesso-almoxarifado" element={<Navigate to="/acesso-filial" replace />} />
              <Route path="/acesso-operacional" element={<Navigate to="/acesso-filial" replace />} />
              <Route path="/acesso-campo" element={<Navigate to="/acesso-filial" replace />} />
              <Route path="/acesso-faturamento" element={<Navigate to="/acesso-filial" replace />} />
              <Route path="/acesso-rh" element={<Navigate to="/acesso-filial" replace />} />
              {/* App Mecânico (novo) — login por PIN */}
              <Route path="/acesso-mecanico" element={<ErrorBoundary><AcessoMecanicoPage /></ErrorBoundary>} />

              {/* App Mecânico (novo) — portal isolado */}
              <Route path="/app-mecanico/:acessoId" element={<ErrorBoundary><MecanicoAppLayout /></ErrorBoundary>}>
                <Route index element={<MecHomePage />} />
                <Route path="ponto" element={<MecPontoPage />} />
                <Route path="chamados" element={<MecChamadosPage />} />
                <Route path="veiculo" element={<MecVeiculoPage />} />
                <Route path="historico" element={<MecHistoricoPage />} />
                <Route path="abastecimento" element={<MecAbastecimentoPage />} />
              </Route>

              {/* ========== ACESSO EXTERNO POR PIN — MÓDULOS (sem login) ========== */}
              <Route path="/financeiro-ext/:acessoId" element={<ErrorBoundary><ExternoLayout modulo="financeiro" titulo="Portal Financeiro" cor="bg-cyan-600" items={EXT_ITEMS_FINANCEIRO} /></ErrorBoundary>}>
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

              <Route path="/faturamento-ext/:acessoId" element={<ErrorBoundary><ExternoLayout modulo="faturamento" titulo="Portal Faturamento" cor="bg-indigo-500" items={EXT_ITEMS_FATURAMENTO} /></ErrorBoundary>}>
                <Route index element={<FaturamentoDashboardPage />} />
                <Route path="clientes" element={<ClientesFatPage />} />
                <Route path="clientes/:id" element={<ClienteDetailPage />} />
                <Route path="contratos" element={<ContratosPage />} />
                <Route path="contratos/:id" element={<ContratoDetailPage />} />
                <Route path="medicoes" element={<MedicoesPage />} />
                <Route path="conferencia" element={<ConferenciaPage />} />
                <Route path="faturas" element={<FaturasPage />} />
                <Route path="reajustes" element={<ReajustesPage />} />
                <Route path="pendencias" element={<PendenciasPage />} />
              </Route>

              {/* RH externo removido — usar /acesso-filial */}

              <Route path="/almoxarifado-ext/:acessoId" element={<ErrorBoundary><ExternoLayout modulo="almoxarifado" titulo="Almoxarifado" cor="bg-orange-600" items={EXT_ITEMS_ALMOX} /></ErrorBoundary>}>
                <Route index element={<AlmoxarifadoPage />} />
                <Route path="entregas" element={<AlmoxarifadoPage />} />
                <Route path="epi" element={<EPIPage />} />
                <Route path="uniformes" element={<UniformePage />} />
              </Route>

              <Route path="/operacional-ext/:acessoId" element={<ErrorBoundary><ExternoLayout modulo="operacional" titulo="Operacional" cor="bg-blue-600" items={EXT_ITEMS_OP} /></ErrorBoundary>}>
                <Route index element={<DespacharChamadoPage />} />
                <Route path="chamados" element={<DespacharChamadoPage />} />
                <Route path="tecnicos" element={<AppMecanicoEmReconstrucaoPage />} />
                <Route path="tecnicos/:id" element={<AppMecanicoEmReconstrucaoPage />} />
              </Route>

              <Route path="/filial-ext/:acessoId" element={<ErrorBoundary><ExternoLayout modulo="filial" titulo="Portal Filial" cor="bg-purple-600" items={EXT_ITEMS_FILIAL} /></ErrorBoundary>}>
                <Route index element={<FilialDashboardPage />} />
                <Route path="funcionarios" element={<FuncionariosPage />} />
                <Route path="funcionarios/:id" element={<EmployeeDetailPage />} />
                <Route path="aviso-ferias" element={<AvisoFeriasPage />} />
                <Route path="aso" element={<ASOPage />} />
                <Route path="atestados" element={<AtestadosImportPage />} />
                <Route path="protocolo" element={<ProtocoloPage />} />
                <Route path="alertas" element={<FilialAlertasPage />} />
                <Route path="movimento-diario" element={<MovimentoDiarioPage />} />
                <Route path="fechamento" element={<FilialFechamentoPage />} />
              </Route>

              <Route path="/campo-ext/:acessoId" element={<ErrorBoundary><ExternoLayout modulo="campo" titulo="Campo" cor="bg-amber-600" items={EXT_ITEMS_CAMPO} /></ErrorBoundary>}>
                <Route index element={<DespacharChamadoPage />} />
                <Route path="chamados" element={<DespacharChamadoPage />} />
              </Route>

              {/* Alias legado: /mecanico-ext/:acessoId → /app-mecanico/:acessoId */}
              <Route path="/mecanico-ext/:acessoId" element={<MecanicoExtAlias />} />
              <Route path="/mecanico-ext/:acessoId/*" element={<MecanicoExtAlias />} />

              <Route path="/relatorio-impressao" element={<ErrorBoundary><RelatorioImpressaoPage /></ErrorBoundary>} />
              <Route path="/entrega-impressao" element={<ErrorBoundary><EntregaImpressaoPage /></ErrorBoundary>} />
              <Route path="/relatorio-vr-impressao" element={<ErrorBoundary><RelatorioVRImpressaoPage /></ErrorBoundary>} />
              <Route path="/relatorio-vt-impressao" element={<ErrorBoundary><RelatorioVTImpressaoPage /></ErrorBoundary>} />
              <Route path="/relatorio-beneficio-individual" element={<ErrorBoundary><RelatorioBeneficioIndividualPage /></ErrorBoundary>} />
              <Route path="/recibos-beneficio" element={<ErrorBoundary><RecibosBeneficioImpressaoPage /></ErrorBoundary>} />
              <Route path="/*" element={<AuthGate />} />
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
