import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import BranchHeader from '@/components/BranchHeader';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';

// Routes allowed per role (admin sees all)
const ROLE_ROUTES: Record<string, string[]> = {
  filial_praia: ['/', '/funcionarios', '/lancamentos', '/relatorio', '/epi', '/uniformes', '/relatorio-vr', '/relatorio-vt', '/protocolo', '/documentos-ativos', '/aviso-ferias', '/aso', '/historico'],
  filial_goiania: ['/', '/funcionarios', '/lancamentos', '/relatorio', '/epi', '/uniformes', '/relatorio-vr', '/relatorio-vt', '/protocolo', '/documentos-ativos', '/aviso-ferias', '/aso', '/historico'],
  almoxarifado: ['/almoxarifado'],
  operacional: ['/', '/operacional', '/gerenciar-usuarios'],
  usuario: ['/'],
};

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { session, userRole, roleLoading } = useApp();
  const location = useLocation();

  useActivityTracker(session);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // User without role → awaiting access
  if (!userRole) {
    return <AguardandoAcesso />;
  }

  // tecnico_campo users should be on /campo routes (handled by CampoLayout)
  if (userRole === 'tecnico_campo') {
    return <Navigate to="/campo" replace />;
  }

  // Redirect restricted roles to their allowed default if trying to access forbidden route
  if (userRole !== 'admin') {
    const allowed = ROLE_ROUTES[userRole] || ['/'];
    const currentBase = '/' + location.pathname.split('/')[1];
    if (!allowed.includes(location.pathname) && !allowed.includes(currentBase)) {
      const defaultRoute = userRole === 'almoxarifado' ? '/almoxarifado'
        : userRole === 'operacional' ? '/operacional/chamados'
        : '/';
      return <Navigate to={defaultRoute} replace />;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {userRole && userRole !== 'admin' && userRole !== 'usuario' && (
        <BranchHeader role={userRole} email={session?.user?.email || ''} />
      )}
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className={cn(
        "transition-all duration-300 min-h-screen",
        collapsed ? "ml-16" : "ml-64",
        userRole && userRole !== 'admin' && userRole !== 'usuario' ? 'pt-0' : ''
      )}>
        <div className="p-6 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
