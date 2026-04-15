import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import CompressoresPage from "@/pages/CompressoresPage";
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
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

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
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/empresas" element={<EmpresasPage />} />
        <Route path="/base-mestra" element={<BaseMestraPage />} />
        <Route path="/funcionarios" element={<FuncionariosPage />} />
        <Route path="/funcionarios/:id" element={<EmployeeDetailPage />} />
        <Route path="/lancamentos" element={<LancamentosPage />} />
        <Route path="/fechamento" element={<FechamentoPage />} />
        <Route path="/relatorio" element={<RelatorioPage />} />
        <Route path="/epi" element={<EPIPage />} />
        <Route path="/uniformes" element={<UniformePage />} />
        <Route path="/relatorio-vr" element={<RelatorioVRPage />} />
        <Route path="/relatorio-vt" element={<RelatorioVTPage />} />
        <Route path="/historico" element={<HistoricoPage />} />
        <Route path="/aso" element={<ASOPage />} />
        <Route path="/prestadores" element={<PrestadoresPage />} />
        <Route path="/combustivel" element={<CombustivelPage />} />
        <Route path="/protocolo" element={<ProtocoloPage />} />
        <Route path="/compressores" element={<CompressoresPage />} />
        <Route path="/documentos-ativos" element={<DocumentosVeiculosPage />} />
        <Route path="/aviso-ferias" element={<AvisoFeriasPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
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
            {/* Print routes — outside auth gate, no login required */}
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
