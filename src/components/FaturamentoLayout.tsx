import React from 'react';
import { Outlet, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { Loader2, FileText, Users, FileSignature, Receipt, TrendingUp, AlertTriangle, LogOut, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ModuleSwitcher from '@/components/ModuleSwitcher';

const ITEMS = [
  { to: '/faturamento', label: 'Dashboard', icon: TrendingUp, end: true },
  { to: '/faturamento/clientes', label: 'Clientes', icon: Users },
  { to: '/faturamento/contratos', label: 'Contratos', icon: FileSignature },
  { to: '/faturamento/faturas', label: 'Faturas', icon: Receipt },
  { to: '/faturamento/medicoes', label: 'Medições', icon: FileText },
  { to: '/faturamento/reajustes', label: 'Reajustes', icon: TrendingUp },
  { to: '/faturamento/pendencias', label: 'Pendências', icon: AlertTriangle },
];

const FaturamentoLayout: React.FC = () => {
  const { session, userRoles, roleLoading, logout } = useApp();
  const nav = useNavigate();
  useActivityTracker(session);

  if (roleLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!userRoles.includes('faturamento') && !userRoles.includes('admin')) return <Navigate to="/" replace />;

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
