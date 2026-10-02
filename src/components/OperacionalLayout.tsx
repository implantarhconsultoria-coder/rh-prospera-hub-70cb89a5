import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { ClipboardList, Loader2, LogOut } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';

const OperacionalLayout: React.FC = () => {
  const { session, userRole, userRoles, roleLoading, logout } = useApp();

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-[#020609] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#ffb400]" />
      </div>
    );
  }

  if (!userRole) return <AguardandoAcesso />;

  const isAdminPreview = userRoles.includes('admin') || userRoles.includes('diretor_geral');
  if (userRole !== 'operacional' && !isAdminPreview) {
    const redirect = userRole === 'tecnico_campo'
      ? '/campo'
      : userRole?.startsWith('filial_')
        ? '/filial'
        : '/';
    return <Navigate to={redirect} replace />;
  }

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
        <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center gap-3 px-4 lg:px-6">
          <span className="grid h-9 w-9 place-items-center rounded-[8px] border border-violet-500/25 bg-violet-500/10 text-[#ffb400]">
            <ClipboardList className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[12px] font-black tracking-wide text-white">TOPAC RH PRO</div>
            <div className="text-[9px] uppercase tracking-[.16em] text-zinc-600">Operacional</div>
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
          {isAdminPreview && (
            <div className="ml-auto truncate text-[10px] text-zinc-600">{session?.user?.email || ''}</div>
          )}
        </div>
      </header>

      <main className="min-h-[calc(100vh-56px)] bg-[radial-gradient(circle_at_12%_0%,rgba(168,47,255,.07),transparent_28%),#020609]">
        <div className="mx-auto w-full max-w-[1680px] p-4 lg:p-[18px]">
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

export default OperacionalLayout;
