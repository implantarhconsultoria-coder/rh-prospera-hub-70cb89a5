import React, { useState } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import FilialSidebar from '@/components/FilialSidebar';
import EmployeeSmartEditOverlay from '@/components/EmployeeSmartEditOverlay';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Loader2, LogOut } from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';
import ModuleSwitcher from '@/components/ModuleSwitcher';
import { Button } from '@/components/ui/button';
import { useFilialFilter } from '@/hooks/useFilialFilter';

const FilialLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { userRole, userRoles, roleLoading, logout } = useApp();
  const { filialCompanyId, isAdminPreview } = useFilialFilter();
  const navigate = useNavigate();

  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!userRole && !userRoles.includes('admin')) return <AguardandoAcesso />;

  const isFilialRole = userRole === 'filial_matriz' || userRole === 'filial_praia' || userRole === 'filial_goiania';
  const acessoAdminValido = userRoles.includes('admin') && isAdminPreview && Boolean(filialCompanyId);

  if (!isFilialRole && !acessoAdminValido) return <Navigate to="/admin" replace />;

  const trocarUsuario = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <FilialSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="fixed right-3 top-3 z-50 flex items-center gap-2 no-print">
        <ModuleSwitcher />
        {!userRoles.includes('admin') && <Button type="button" variant="outline" size="sm" onClick={trocarUsuario} className="gap-2 shadow-md"><LogOut className="h-4 w-4" />Trocar usuário</Button>}
      </div>
      <main className={cn('transition-all duration-300 min-h-screen', collapsed ? 'ml-16' : 'ml-64')}>
        <div className="p-6 pt-20 max-w-[1600px] mx-auto"><ErrorBoundary><Outlet /></ErrorBoundary></div>
      </main>
      <EmployeeSmartEditOverlay />
    </div>
  );
};

export default FilialLayout;
