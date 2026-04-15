import React from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Clock, ClipboardList, MoreHorizontal, LogOut, Package, Gauge } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';

const tabs = [
  { label: 'Início', icon: Home, path: '/campo' },
  { label: 'Ponto', icon: Clock, path: '/campo/ponto' },
  { label: 'Chamados', icon: ClipboardList, path: '/campo/chamados' },
  { label: 'Estoque', icon: Package, path: '/campo/estoque' },
  { label: 'KM', icon: Gauge, path: '/campo/km' },
];

const CampoLayout: React.FC = () => {
  const { session, userRole, roleLoading, logout } = useApp();
  const location = useLocation();

  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (!userRole) return <AguardandoAcesso />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="text-sm font-bold text-foreground font-display">Topac Campo</h1>
        <button onClick={logout} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        <div className="p-4 max-w-lg mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border safe-area-bottom">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          {tabs.map(tab => {
            const active = location.pathname === tab.path;
            return (
              <NavLink key={tab.path} to={tab.path}
                className={cn(
                  "flex flex-col items-center py-2 px-3 text-[10px] font-medium transition-colors min-w-0",
                  active ? "text-primary" : "text-muted-foreground"
                )}>
                <tab.icon className={cn("w-5 h-5 mb-0.5", active && "text-primary")} />
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
