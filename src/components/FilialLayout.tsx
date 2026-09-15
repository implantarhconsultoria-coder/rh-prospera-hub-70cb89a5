import React, { useState } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import FilialModernSidebar from '@/components/FilialModernSidebar';
import EmployeeSmartEditOverlay from '@/components/EmployeeSmartEditOverlay';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Loader2, LogOut } from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';
import ModuleSwitcher from '@/components/ModuleSwitcher';
import { Button } from '@/components/ui/button';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import SupportCenter from '@/components/SupportCenter';

const FilialLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { userRole, userRoles, roleLoading, logout, employees } = useApp();
  const { filialCompanyId, isAdminPreview } = useFilialFilter();
  const navigate = useNavigate();
  const location = useLocation();

  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!userRole && !userRoles.includes('admin')) return <AguardandoAcesso />;

  const isFilialRole = userRole === 'filial_matriz' || userRole === 'filial_praia' || userRole === 'filial_goiania';
  const acessoAdminValido = userRoles.includes('admin') && isAdminPreview && Boolean(filialCompanyId);

  if (!isFilialRole && !acessoAdminValido) return <Navigate to="/admin" replace />;
  if (!filialCompanyId) return <AguardandoAcesso />;

  const employeeDetailMatch = location.pathname.match(/^\/filial\/funcionarios\/([^/]+)$/);
  if (employeeDetailMatch) {
    const employee = employees.find((item) => item.id === employeeDetailMatch[1]);
    if (employee && employee.companyId !== filialCompanyId) {
      return <Navigate to="/filial/funcionarios" replace />;
    }
  }

  const trocarUsuario = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const themeVars = {
    '--background': '225 38% 3%',
    '--foreground': '0 0% 96%',
    '--card': '225 28% 5%',
    '--card-foreground': '0 0% 96%',
    '--popover': '225 28% 5%',
    '--popover-foreground': '0 0% 96%',
    '--primary': '43 100% 50%',
    '--primary-foreground': '230 45% 4%',
    '--secondary': '269 35% 12%',
    '--secondary-foreground': '0 0% 95%',
    '--muted': '225 20% 10%',
    '--muted-foreground': '230 8% 58%',
    '--accent': '271 91% 60%',
    '--accent-foreground': '0 0% 100%',
    '--border': '270 35% 22%',
    '--input': '230 18% 16%',
    '--ring': '270 91% 60%',
  } as React.CSSProperties;

  return (
    <div style={themeVars} className="topac-neon-skin min-h-screen bg-[#020609] text-zinc-100">
      <FilialModernSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="fixed right-3 top-3 z-50 flex items-center gap-2 no-print">
        {userRoles.includes('admin') && <ModuleSwitcher />}
        {!userRoles.includes('admin') && <Button type="button" variant="outline" size="sm" onClick={trocarUsuario} className="gap-2 shadow-md"><LogOut className="h-4 w-4" />Trocar usuário</Button>}
      </div>
      <main className={cn('min-h-screen transition-[margin] duration-300', collapsed ? 'ml-[72px]' : 'ml-[270px]')}>
        <div className="mx-auto max-w-[1680px] p-[18px] pt-20"><ErrorBoundary><Outlet /></ErrorBoundary></div>
      </main>
      <EmployeeSmartEditOverlay />
      <SupportCenter />
    </div>
  );
};

export default FilialLayout;