import React, { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import AdminMobileLayout from '@/components/AdminMobileLayout';
import AssistenteFab from '@/components/assistente/AssistenteFab';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Loader2, Search, RefreshCw, Circle } from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';
import ModuleSwitcher from '@/components/ModuleSwitcher';
import DirectorBlocked from '@/components/DirectorBlocked';
import { isDirectorRole, isDirectorRouteAllowed } from '@/lib/directorPermissions';
import { useLocation } from 'react-router-dom';

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem('topac_layout_mode') || 'premium');
  const { session, userRole, userRoles, roleLoading } = useApp();
  const isMobile = useIsMobile();
  const location = useLocation();

  useActivityTracker(session);

  useEffect(() => {
    const syncLayout = () => setLayoutMode(localStorage.getItem('topac_layout_mode') || 'premium');
    window.addEventListener('storage', syncLayout);
    window.addEventListener('topac-layout-change', syncLayout);
    return () => {
      window.removeEventListener('storage', syncLayout);
      window.removeEventListener('topac-layout-change', syncLayout);
    };
  }, []);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!userRole) return <AguardandoAcesso />;

  const isDirector = isDirectorRole(userRoles);

  // Only admin and diretor_geral can access central panel
  if (userRole !== 'admin' && !isDirector) {
    const redirect = userRole?.startsWith('filial_') ? '/filial'
      : userRole === 'almoxarifado' ? '/filial'
      : userRole === 'faturamento' ? '/faturamento'
      : userRole === 'financeiro' ? '/financeiro'
      : '/';
    return <Navigate to={redirect} replace />;
  }

  if (isMobile) {
    return <ErrorBoundary><AdminMobileLayout /></ErrorBoundary>;
  }

  return (
    <div className={cn(layoutMode === 'premium' && 'admin-command', 'min-h-screen bg-background text-foreground')}>
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className={cn(
        "transition-all duration-300 min-h-screen",
        collapsed ? "ml-16" : "ml-64"
      )}>
        <header className="admin-command-topbar no-print">
          <div className="flex items-center gap-2 text-[11px] text-sky-200/80">
            <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
            <span>Nucleo TOPAC online</span>
            <span className="text-sky-400/50">.</span>
            <span>central-rh</span>
            <span className="text-sky-400/50">.</span>
            <span>v2.4.1</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-sky-100/80">
            <button className="inline-flex items-center gap-2 hover:text-emerald-300">
              <Search className="h-3.5 w-3.5" />
              Buscar / executar
            </button>
            <button className="inline-flex items-center gap-2 hover:text-emerald-300">
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>
            <ModuleSwitcher />
          </div>
        </header>
        <div className="p-7 max-w-[1600px] mx-auto">
          <ErrorBoundary>
            {isDirector && !isDirectorRouteAllowed(location.pathname) ? <DirectorBlocked /> : <Outlet />}
          </ErrorBoundary>
        </div>
      </main>
      <AssistenteFab />
    </div>
  );
};

export default AppLayout;
