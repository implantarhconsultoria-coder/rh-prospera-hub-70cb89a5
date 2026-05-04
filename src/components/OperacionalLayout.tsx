import React from 'react';
import { Outlet, Navigate, NavLink, useLocation } from 'react-router-dom';
import { ClipboardList, LogOut } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';

const OperacionalLayout: React.FC = () => {
  const { userRole, roleLoading, logout } = useApp();
  const location = useLocation();

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!userRole) return <AguardandoAcesso />;

  // Permitir admin OU operacional (admin pode usar o dispatcher)
  if (userRole !== 'operacional' && userRole !== 'admin') {
    const redirect = userRole === 'tecnico_campo' ? '/'
      : userRole?.startsWith('filial_') ? '/filial'
      : '/';
    return <Navigate to={redirect} replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-sm font-bold text-foreground font-display">Topac Operacional</h1>
        </div>
        <button onClick={logout} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
          <LogOut className="w-4 h-4" />
        </button>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-[1200px] mx-auto">
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

export default OperacionalLayout;
