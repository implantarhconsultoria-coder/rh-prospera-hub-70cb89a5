import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useParams, useLocation } from "react-router-dom";

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
import AlmoxarifadoLayout from "@/components/AlmoxarifadoLayout";
import OperacionalLayout from "@/components/OperacionalLayout";
import CampoLayout from "@/components/CampoLayout";
import LoginPage from "@/pages/LoginPage";
import CadastroPage from "@/pages/CadastroPage";
import RecuperarSenhaPage from "@/pages/RecuperarSenhaPage";
import RedefinirSenhaPage from "@/pages/RedefinirSenhaPage";
import DashboardPage from "@/pages/DashboardPage";
import DirectorDashboardPage from "@/pages/DirectorDashboardPage";
import FilialDashboardPage from "@/pages/filial/FilialDashboardPage";
import FilialAlertasPage from "@/pages/filial/FilialAlertasPage";
import MovimentoDiarioPage from "@/pages/filial/MovimentoDiarioPage";
import FilialFechamentoPage from "@/pages/filial/FilialFechamentoPage";
import FilialDocumentosPage from "@/pages/filial/FilialDocumentosPage";
import FilialApontamentoPage from "@/pages/filial/FilialApontamentoPage";
import FechamentosFiliaisPage from "@/pages/admin/FechamentosFiliaisPage";
import EmpresasPage from "@/pages/EmpresasPage";
import BaseMestraPage from "@/pages/BaseMestraPage";
import ASOPage from "@/pages/ASOPage";
import PreCadastroAdmissionalPage from "@/pages/PreCadastroAdmissionalPage";
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
import CampoHomePage from "@/pages/campo/CampoHomePage";
import CampoPontoPage from "@/pages/campo/PontoPage";
import CampoChamadosPage from "@/pages/campo/ChamadosPage";
import EstoqueVeiculoPage from "@/pages/campo/EstoqueVeiculoPage";
import RegistroKmPage from "@/pages/campo/RegistroKmPage";
import NotFound from "@/pages/NotFound";
import AcessoExternoPage from "@/pages/AcessoExternoPage";
import AcessoDiretoPage from "@/pages/AcessoDiretoPage";
import PortaisPage from "@/pages/PortaisPage";
import AssistentePage from "@/pages/admin/AssistentePage";
import ErrorBoundary from "@/components/ErrorBoundary";
import GlobalErrorCatcher from "@/components/GlobalErrorCatcher";
import StableLoading from "@/components/StableLoading";
import { isDirectorRole } from "@/lib/directorPermissions";
import ExternoLayout from "@/components/ExternoLayout";
import AguardandoAcesso from "@/components/AguardandoAcesso";
import {
  UserCircle, Stethoscope, FileWarning, CalendarDays, FileCheck,
  Package, Wrench, Headphones, LayoutDashboard, Bell, Activity, ClipboardCheck,
} from "lucide-react";

const EXT_ITEMS_ALMOX = [
  { to: '', label: 'Almoxarifado', icon: Package, end: true },
];

const EXT_ITEMS_OP = [
  { to: '', label: 'Chamados', icon: Headphones, end: true },
  { to: 'tecnicos', label: 'Tecnicos', icon: Wrench },
  { to: 'protocolo', label: 'Protocolo', icon: FileCheck },
];

const EXT_ITEMS_FILIAL = [
  { to: '', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: 'funcionarios', label: 'Funcionarios', icon: UserCircle },
  { to: 'aviso-ferias', label: 'Aviso de Ferias', icon: CalendarDays },
  { to: 'aso', label: 'ASO', icon: Stethoscope },
  { to: 'atestados', label: 'Atestados', icon: FileWarning },
  { to: 'alertas', label: 'Alertas', icon: Bell },
  { to: 'movimento-diario', label: 'Movimento Diario', icon: Activity },
  { to: 'apontamento', label: 'Apontamento', icon: ClipboardCheck },
  { to: 'fechamento', label: 'Fechamento', icon: ClipboardCheck },
];

const EXT_ITEMS_CAMPO = [
  { to: '', label: 'Chamados', icon: Headphones, end: true },
];

const queryClient = new QueryClient();

const RoleRedirect = () => {
  const { userRoles, roleLoading } = useApp();

  if (roleLoading) return <StableLoading label="Carregando permissao de acesso..." />;
  if (userRoles.includes('admin')) return <Navigate to="/admin" replace />;
  if (userRoles.includes('diretor_geral')) return <Navigate to="/admin" replace />;
  if (userRoles.includes('filial_matriz') || userRoles.includes('filial_praia') || userRoles.includes('filial_goiania')) return <Navigate to="/filial" replace />;
  if (userRoles.includes('almoxarifado')) return <Navigate to="/almoxarifado" replace />;
  if (userRoles.includes('operacional')) return <Navigate to="/operacional" replace />;
  if (userRoles.includes('tecnico_campo')) return <Navigate to="/campo" replace />;
  return <AguardandoAcesso />;
};

const AdminHomeRoute = () => {
  const { userRoles } = useApp();
  if (isDirectorRole(userRoles) && !userRoles.includes('admin')) return <DirectorDashboardPage />;
  return <DashboardPage />;
};

const MecanicoRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useApp();
  if (loading) return <StableLoading label="Verificando acesso..." />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AuthGate = () => {
  const { isAuthenticated, loading } = useApp();

  if (loading) return <StableLoading label="Carregando sessao..." />;

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
      <Route path="/" element={<LoginPage />} />
      <Route path="/index" element={<Navigate to="/" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppLayout />}>
        <Route path="/admin" element={<AdminHomeRoute />} />
        <Route path="/admin/implanta-central" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/implanta-central/*" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/diretoria" element={<DirectorDashboardPage />} />
        <Route path="/admin/empresas" element={<EmpresasPage />} />
        <Route path="/admin/base-mestra" element={<BaseMestraPage />} />
        <Route path="/admin/funcionarios" element={<FuncionariosPage />} />
        <Route path="/admin/funcionarios/:id" element={<EmployeeDetailPage />} />
        <Route path="/admin/lancamentos" element={<LancamentosPage />} />
        <Route path="/admin/fechamento" element={<FechamentoPage />} />
        <Route path="/admin/apontamento-contabilidade" element={<ApontamentoContabilidadePage />} />
        <Route path="/admin/fechamento-ponto" element={<FechamentoPontoPage />} />
        <Route path="/admin/fechamentos-filiais" element={<FechamentosFiliaisPage />} />
        <Route path="/admin/relatorio" element={<RelatorioPage />} />
        <Route path="/admin/epi" element={<EPIPage />} />
        <Route path="/admin/uniformes" element={<UniformePage />} />
        <Route path="/admin/relatorio-vr" element={<RelatorioVRPage />} />
        <Route path="/admin/relatorio-vt" element={<RelatorioVTPage />} />
        <Route path="/admin/historico" element={<HistoricoPage />} />
        <Route path="/admin/aso" element={<ASOPage />} />
        <Route path="/admin/pre-cadastro-admissional" element={<PreCadastroAdmissionalPage />} />
        <Route path="/admin/prestadores" element={<PrestadoresPage />} />
        <Route path="/admin/galoes-combustivel" element={<CombustivelPage />} />
        <Route path="/admin/protocolo" element={<Navigate to="/admin/operacional/protocolo" replace />} />
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
        <Route path="/admin/monitoramento" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/gerenciar-usuarios" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/operacional" element={<DespacharChamadoPage />} />
        <Route path="/admin/operacional/protocolo" element={<ProtocoloPage />} />
        <Route path="/admin/chamados" element={<Navigate to="/admin/operacional" replace />} />
        <Route path="/admin/app-mecanico" element={<AppMecanicoAdminPage />} />
        <Route path="/admin/app-operacional" element={<Navigate to="/admin/app-mecanico" replace />} />
        <Route path="/admin/app-operacional/:id" element={<Navigate to="/admin/app-mecanico" replace />} />
        <Route path="/admin/combustivel-qr" element={<Navigate to="/admin/abastecimento-qrcode" replace />} />
        <Route path="/admin/abastecimento-qrcode" element={<CombustivelQRAdminPage />} />
        <Route path="/admin/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="/admin/acessos-externos" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/assistente" element={<AssistentePage />} />
        <Route path="/admin/faturamento/*" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/financeiro/*" element={<Navigate to="/admin" replace />} />
      </Route>

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
        <Route path="/filial/apontamento" element={<FilialApontamentoPage />} />
        <Route path="/filial/fechamento" element={<FilialFechamentoPage />} />
        <Route path="/filial/documentos" element={<FilialDocumentosPage />} />
      </Route>

      <Route element={<AlmoxarifadoLayout />}>
        <Route path="/almoxarifado" element={<AlmoxarifadoPage />} />
      </Route>

      <Route element={<OperacionalLayout />}>
        <Route path="/operacional" element={<DespacharChamadoPage />} />
        <Route path="/operacional/chamados" element={<DespacharChamadoPage />} />
        <Route path="/operacional/protocolo" element={<ProtocoloPage />} />
        <Route path="/operacional/importacao-dados" element={<Navigate to="/operacional" replace />} />
      </Route>

      <Route element={<CampoLayout />}>
        <Route path="/campo" element={<CampoHomePage />} />
        <Route path="/campo/ponto" element={<CampoPontoPage />} />
        <Route path="/campo/chamados" element={<CampoChamadosPage />} />
        <Route path="/campo/estoque" element={<EstoqueVeiculoPage />} />
        <Route path="/campo/km" element={<RegistroKmPage />} />
      </Route>

      <Route path="/faturamento/*" element={<Navigate to="/" replace />} />
      <Route path="/financeiro/*" element={<Navigate to="/" replace />} />
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
            <GlobalErrorCatcher />
            <Routes>
              <Route path="/modulos" element={<ErrorBoundary><AcessoExternoPage /></ErrorBoundary>} />
              <Route path="/acesso/:slug" element={<ErrorBoundary><AcessoDiretoPage /></ErrorBoundary>} />
              <Route path="/acesso-filial" element={<ErrorBoundary><AcessoExternoPage /></ErrorBoundary>} />
              <Route path="/acesso-modulos" element={<Navigate to="/modulos" replace />} />
              <Route path="/portais" element={<ErrorBoundary><PortaisPage /></ErrorBoundary>} />
              <Route path="/acesso-almoxarifado" element={<Navigate to="/modulos" replace />} />
              <Route path="/acesso-operacional" element={<Navigate to="/modulos" replace />} />
              <Route path="/acesso-campo" element={<Navigate to="/modulos" replace />} />
              <Route path="/acesso-rh" element={<Navigate to="/modulos" replace />} />
              <Route path="/acesso-financeiro" element={<Navigate to="/modulos" replace />} />
              <Route path="/acesso-faturamento" element={<Navigate to="/modulos" replace />} />

              <Route path="/acesso-mecanico" element={<ErrorBoundary><MecanicoRouteGuard><AcessoMecanicoPage /></MecanicoRouteGuard></ErrorBoundary>} />
              <Route path="/app-mecanico/:acessoId" element={<ErrorBoundary><MecanicoRouteGuard><MecanicoAppLayout /></MecanicoRouteGuard></ErrorBoundary>}>
                <Route index element={<MecHomePage />} />
                <Route path="ponto" element={<MecPontoPage />} />
                <Route path="chamados" element={<MecChamadosPage />} />
                <Route path="veiculo" element={<MecVeiculoPage />} />
                <Route path="historico" element={<MecHistoricoPage />} />
                <Route path="abastecimento" element={<MecAbastecimentoPage />} />
              </Route>

              <Route path="/financeiro-ext/:acessoId/*" element={<Navigate to="/modulos" replace />} />
              <Route path="/faturamento-ext/:acessoId/*" element={<Navigate to="/modulos" replace />} />

              <Route path="/almoxarifado-ext/:acessoId" element={<ErrorBoundary><ExternoLayout modulo="almoxarifado" titulo="Almoxarifado" cor="bg-orange-600" items={EXT_ITEMS_ALMOX} /></ErrorBoundary>}>
                <Route index element={<AlmoxarifadoPage />} />
                <Route path="entregas" element={<AlmoxarifadoPage />} />
                <Route path="epi" element={<Navigate to="" replace />} />
                <Route path="uniformes" element={<Navigate to="" replace />} />
              </Route>

              <Route path="/operacional-ext/:acessoId" element={<ErrorBoundary><ExternoLayout modulo="operacional" titulo="Operacional" cor="bg-blue-600" items={EXT_ITEMS_OP} /></ErrorBoundary>}>
                <Route index element={<DespacharChamadoPage />} />
                <Route path="chamados" element={<DespacharChamadoPage />} />
                <Route path="tecnicos" element={<AppMecanicoEmReconstrucaoPage />} />
                <Route path="tecnicos/:id" element={<AppMecanicoEmReconstrucaoPage />} />
                <Route path="protocolo" element={<ProtocoloPage />} />
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
                <Route path="apontamento" element={<FilialApontamentoPage />} />
                <Route path="fechamento" element={<FilialFechamentoPage />} />
              </Route>

              <Route path="/campo-ext/:acessoId" element={<ErrorBoundary><ExternoLayout modulo="campo" titulo="Campo" cor="bg-amber-600" items={EXT_ITEMS_CAMPO} /></ErrorBoundary>}>
                <Route index element={<DespacharChamadoPage />} />
                <Route path="chamados" element={<DespacharChamadoPage />} />
              </Route>

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
