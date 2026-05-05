import React from 'react';
import { Outlet, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { Loader2, Wallet, ArrowDownCircle, ArrowUpCircle, Building, Landmark, TrendingDown, AlertTriangle, Layers, GitMerge, LogOut, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import FooterSobre from '@/components/FooterSobre';

const ITEMS = [
  { to: '/financeiro', label: 'Dashboard', icon: Wallet, end: true },
  { to: '/financeiro/contas-receber', label: 'Contas a Receber', icon: ArrowDownCircle },
  { to: '/financeiro/contas-pagar', label: 'Contas a Pagar', icon: ArrowUpCircle },
  { to: '/financeiro/fornecedores', label: 'Fornecedores', icon: Building },
  { to: '/financeiro/bancos', label: 'Bancos', icon: Landmark },
  { to: '/financeiro/fluxo-caixa', label: 'Fluxo de Caixa', icon: TrendingDown },
  { to: '/financeiro/inadimplencia', label: 'Inadimplência', icon: AlertTriangle },
  { to: '/financeiro/centros-custo', label: 'Centros de Custo', icon: Layers },
  { to: '/financeiro/conciliacao', label: 'Conciliação', icon: GitMerge },
];

const FinanceiroLayout: React.FC = () => {
  const { session, userRoles, roleLoading, logout } = useApp();
  const nav = useNavigate();
  useActivityTracker(session);

  if (roleLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!userRoles.includes('financeiro') && !userRoles.includes('admin')) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-cyan-600 flex items-center justify-center"><Building2 className="w-5 h-5 text-white" /></div>
          <div>
            <div className="font-bold text-sm">Portal Financeiro</div>
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
      <main className="ml-64 min-h-screen flex flex-col">
        <div className="p-6 max-w-[1600px] mx-auto flex-1 w-full"><Outlet /></div>
        <FooterSobre />
      </main>
    </div>
  );
};

export default FinanceiroLayout;
