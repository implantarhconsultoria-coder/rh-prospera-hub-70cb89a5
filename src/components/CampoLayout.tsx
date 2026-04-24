import React from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Clock, ClipboardList, MoreHorizontal, LogOut, Package, Gauge } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
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
  const { session, userRoles, roleLoading, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  // Allow tecnico_campo OR admin (admin in preview/test mode)
  const canAccess = userRoles.includes('tecnico_campo') || userRoles.includes('admin');
  if (!canAccess) return <AguardandoAcesso />;
  const isAdminPreview = userRoles.includes('admin');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-lg border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/30">
            <span className="text-white font-bold text-xs">T</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white font-display leading-none">Topac Campo</h1>
            {isAdminPreview && <p className="text-[9px] text-amber-400 font-medium uppercase tracking-wider mt-0.5">Modo Visualização Admin</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdminPreview && (
            <button onClick={() => navigate('/admin')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
              ← Central
            </button>
          )}
          <button onClick={logout} className="p-2 rounded-lg hover:bg-white/10 text-white/70">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="p-4 max-w-lg mx-auto text-white">
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </div>
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-xl border-t border-white/5 safe-area-bottom shadow-2xl">
        <div className="flex justify-around items-center max-w-lg mx-auto px-2 py-1.5">
          {tabs.map(tab => {
            const active = location.pathname === tab.path;
            return (
              <NavLink key={tab.path} to={tab.path}
                className={cn(
                  "flex flex-col items-center py-2 px-3 text-[10px] font-medium transition-all min-w-0 rounded-xl",
                  active ? "text-primary" : "text-white/50"
                )}>
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-0.5 transition-all", active && "bg-primary/15")}>
                  <tab.icon className={cn("w-5 h-5", active ? "text-primary" : "text-white/60")} />
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
