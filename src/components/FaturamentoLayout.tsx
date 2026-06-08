import React, { useState } from 'react';
import { Outlet, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2, FileText, Users, FileSignature, Receipt, TrendingUp, AlertTriangle, LogOut, Building2, ClipboardCheck, Menu, ArrowLeft, X, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ModuleSwitcher from '@/components/ModuleSwitcher';

const ITEMS = [
  { to: '/faturamento', label: 'Dashboard', icon: TrendingUp, end: true },
  { to: '/faturamento/clientes', label: 'Clientes', icon: Users },
  { to: '/faturamento/importacao-dados', label: 'Importacao DN4', icon: FileUp },
  { to: '/faturamento/contratos', label: 'Contratos', icon: FileSignature },
  { to: '/faturamento/medicoes', label: 'Medições', icon: FileText },
  { to: '/faturamento/conferencia', label: 'Conferência', icon: ClipboardCheck },
  { to: '/faturamento/faturas', label: 'Faturas', icon: Receipt },
  { to: '/faturamento/reajustes', label: 'Reajustes', icon: TrendingUp },
  { to: '/faturamento/pendencias', label: 'Pendências', icon: AlertTriangle },
];

const FaturamentoLayout: React.FC = () => {
  const { session, userRoles, roleLoading, logout } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useActivityTracker(session);

  if (roleLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!userRoles.includes('faturamento') && !userRoles.includes('admin')) return <Navigate to="/" replace />;

  // ============ MOBILE ============
  if (isMobile) {
    const canBack = location.pathname !== '/faturamento';
    const current = ITEMS.find(i => i.end ? location.pathname === i.to : location.pathname.startsWith(i.to));
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 bg-card border-b border-border flex items-center gap-2 px-3 h-14">
          {canBack ? (
            <Button size="icon" variant="ghost" onClick={() => nav(-1)} aria-label="Voltar">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{current?.label || 'Faturamento'}</div>
            <div className="text-[10px] text-muted-foreground truncate">{session?.user?.email}</div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setDrawerOpen(true)} aria-label="Menu">
            <Menu className="w-6 h-6" />
          </Button>
        </header>

        {/* Drawer */}
        {drawerOpen && (
          <>
            <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setDrawerOpen(false)} />
            <aside className="fixed right-0 top-0 z-50 h-full w-[80%] max-w-xs bg-card border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <span className="font-semibold text-sm">Menu</span>
                <Button size="icon" variant="ghost" onClick={() => setDrawerOpen(false)}><X className="w-5 h-5" /></Button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-2">
                {ITEMS.map(it => (
                  <NavLink key={it.to} to={it.to} end={it.end} onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) => cn(
                      'flex items-center gap-3 px-4 py-4 rounded-xl text-base font-medium transition',
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground active:bg-muted',
                    )}>
                    <it.icon className="w-5 h-5" /> {it.label}
                  </NavLink>
                ))}
              </nav>
              <div className="p-3 border-t border-border">
                <Button size="lg" variant="outline" className="w-full" onClick={async () => { await logout(); nav('/'); }}>
                  <LogOut className="w-4 h-4 mr-2" /> Sair
                </Button>
              </div>
            </aside>
          </>
        )}

        <main className="flex-1 p-3 pb-20">
          <Outlet />
        </main>
      </div>
    );
  }

  // ============ DESKTOP (intocado) ============
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center"><Building2 className="w-5 h-5 text-white" /></div>
          <div>
            <div className="font-bold text-sm">Portal Faturamento</div>
            <div className="text-[10px] text-muted-foreground">Topac RH PRO</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {ITEMS.map(it => (
            <NavLink key={it.to} to={it.to} end={it.end}
              className={({ isActive }) => cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition',
                isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
              )}>
              <it.icon className="w-4 h-4" /> {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="text-xs text-muted-foreground truncate">{session?.user?.email}</div>
          <Button size="sm" variant="outline" className="w-full" onClick={async () => { await logout(); nav('/'); }}>
            <LogOut className="w-3 h-3 mr-1" /> Sair
          </Button>
        </div>
      </aside>
      <main className="ml-64 min-h-screen">
        <div className="p-6 max-w-[1600px] mx-auto">
          <div className="flex justify-end mb-3 no-print"><ModuleSwitcher /></div>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default FaturamentoLayout;
