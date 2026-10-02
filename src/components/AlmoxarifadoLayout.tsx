import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { LogOut, Package } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import StableLoading from '@/components/StableLoading';
import { useOperatorBootstrap } from '@/hooks/useOperatorBootstrap';

const AlmoxarifadoLayout: React.FC = () => {
  const { session, userRoles, roleLoading, logout } = useApp();
  useActivityTracker(session);
  const canBootstrapOperator = Boolean(session?.user?.id) && (userRoles.includes('almoxarifado') || userRoles.includes('admin') || userRoles.includes('diretor_geral'));
  useOperatorBootstrap('almoxarifado', canBootstrapOperator);

  if (roleLoading) return <StableLoading label="Carregando permissão do Almoxarifado..." />;

  const isAdminPreview = userRoles.includes('admin') || userRoles.includes('diretor_geral');
  const hasAccess = userRoles.includes('almoxarifado') || isAdminPreview;
  if (!hasAccess) return <Navigate to="/" replace />;

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
      <header className="sticky top-0 z-40 border-b border-[#2b1c38] bg-[#030609]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1840px] items-center gap-3 px-4 lg:px-6">
          <span className="grid h-9 w-9 place-items-center rounded-[8px] border border-violet-500/25 bg-violet-500/10 text-[#ffb400]">
            <Package className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[12px] font-black tracking-wide text-white">TOPAC RH PRO</div>
            <div className="text-[9px] uppercase tracking-[.16em] text-zinc-600">Almoxarifado</div>
          </div>
          {!isAdminPreview && (
            <button
              type="button"
              onClick={logout}
              className="ml-auto grid h-9 w-9 place-items-center rounded-lg border border-[#30243d] text-zinc-500 transition hover:border-violet-500/40 hover:text-white"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  );
};

export default AlmoxarifadoLayout;
