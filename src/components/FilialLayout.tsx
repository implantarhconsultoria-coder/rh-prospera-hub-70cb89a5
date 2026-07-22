import React, { useState } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import FilialSidebar from '@/components/FilialSidebar';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Loader2, LogOut } from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';
import ModuleSwitcher from '@/components/ModuleSwitcher';
import { Button } from '@/components/ui/button';

const FilialLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { userRole, roleLoading, logout } = useApp();
  const navigate = useNavigate();

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!userRole) return <AguardandoAcesso />;

  if (userRole !== 'filial_matriz' && userRole !== 'filial_praia' && userRole !== 'filial_goiania') {
    return <Navigate to="/" replace />;
  }

  const trocarUsuario = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <FilialSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={trocarUsuario}
        className="fixed right-3 top-3 z-50 gap-2 shadow-md no-print"
      >
        <LogOut className="h-4 w-4" />
        Trocar usuário
      </Button>

      <main className={cn(
        'transition-all duration-300 min-h-screen',
        collapsed ? 'ml-16' : 'ml-64'
      )}>
        <div className="p-6 pt-16 max-w-[1600px] mx-auto">
          <div className="flex justify-end mb-3 no-print"><ModuleSwitcher /></div>
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

export default FilialLayout;
