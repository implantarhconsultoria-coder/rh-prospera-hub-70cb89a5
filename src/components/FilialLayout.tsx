import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import FilialSidebar from '@/components/FilialSidebar';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';
import ModuleSwitcher from '@/components/ModuleSwitcher';

const FilialLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { session, userRole, roleLoading } = useApp();

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!userRole) return <AguardandoAcesso />;

  // Only filial roles allowed
  if (userRole !== 'filial_praia' && userRole !== 'filial_goiania') {
    const redirect = userRole === 'admin' ? '/'
      : userRole === 'tecnico_campo' ? '/mecanico'
      : userRole === 'operacional' ? '/mecanico'
      : '/';
    return <Navigate to={redirect} replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <FilialSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className={cn(
        "transition-all duration-300 min-h-screen",
        collapsed ? "ml-16" : "ml-64"
      )}>
        <div className="p-6 max-w-[1600px] mx-auto">
          <div className="flex justify-end mb-3 no-print"><ModuleSwitcher /></div>
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

export default FilialLayout;
