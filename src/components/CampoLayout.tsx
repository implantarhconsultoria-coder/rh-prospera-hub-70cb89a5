import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ClipboardList, Clock, Gauge, Home, Loader2, LogOut, Package } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';

const tabs = [
  { label: 'Início', icon: Home, path: '/campo' },
  { label: 'Ponto', icon: Clock, path: '/campo/ponto' },
  { label: 'Chamados', icon: ClipboardList, path: '/campo/chamados' },
  { label: 'Estoque', icon: Package, path: '/campo/estoque' },
  { label: 'KM', icon: Gauge, path: '/campo/km' },
];

const CampoLayout: React.FC = () => {
  const { userRoles, roleLoading, logout } = useApp();
  const location = useLocation();

  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#020609]"><Loader2 className="w-8 h-8 animate-spin text-[#ffb400]" /></div>;
  }

  const isAdminPreview = userRoles.includes('admin') || userRoles.includes('diretor_geral');
  const canAccess = userRoles.includes('tecnico_campo') || isAdminPreview;
  if (!canAccess) return <AguardandoAcesso />;

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
    <div style={themeVars} className="topac-neon-skin min-h-screen bg-[#020609] text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[#2b1c38] bg-[#030609]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-lg items-center gap-3 px-4">
          <div className="grid h-8 w-8 place-items-center rounded-[8px] border border-violet-500/25 bg-violet-500/10 text-[11px] font-black text-[#ffb400]">T</div>
          <div>
            <div className="text-[11px] font-black tracking-wide text-white">TOPAC RH PRO</div>
            <div className="text-[8px] uppercase tracking-[.16em] text-zinc-600">Campo</div>
          </div>
          {!isAdminPreview && (
            <button onClick={logout} className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-[#30243d] text-zinc-500 hover:text-white" title="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 bg-[radial-gradient(circle_at_50%_0%,rgba(168,47,255,.07),transparent_34%),#020609]">
        <div className="p-4 max-w-lg mx-auto text-white">
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#2b1c38] bg-[#030609]/97 backdrop-blur-xl safe-area-bottom">
        <div className="flex justify-around items-center max-w-lg mx-auto px-2 py-1.5">
          {tabs.map(tab => {
            const active = location.pathname === tab.path;
            return (
              <NavLink key={tab.path} to={tab.path}
                className={cn(
                  "flex flex-col items-center py-1.5 px-3 text-[9px] font-semibold transition-all min-w-0 rounded-xl",
                  active ? "text-[#ffb400]" : "text-zinc-600"
                )}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-0.5 transition-all", active && "border border-violet-500/25 bg-violet-500/10")}>
                  <tab.icon className={cn("w-4.5 h-4.5", active ? "text-[#ffb400]" : "text-zinc-600")} />
                </div>
                {tab.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default CampoLayout;
