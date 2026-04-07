import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/context/AppContext";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EmpresasPage from "@/pages/EmpresasPage";
import BaseMestraPage from "@/pages/BaseMestraPage";
import FuncionariosPage from "@/pages/FuncionariosPage";
import EmployeeDetailPage from "@/pages/EmployeeDetailPage";
import LancamentosPage from "@/pages/LancamentosPage";
import FechamentoPage from "@/pages/FechamentoPage";
import RelatorioPage from "@/pages/RelatorioPage";
import ConfiguracoesPage from "@/pages/ConfiguracoesPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const AuthGate = () => {
  const { isAuthenticated } = useApp();
  if (!isAuthenticated) return <LoginPage />;
  return (
    <BrowserRouter>
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
          <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppProvider>
        <AuthGate />
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
