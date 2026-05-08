import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FilePlus2, ListChecks, History, FileBarChart2, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/admin/faturamento/importacao', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/faturamento/importacao/novo', label: 'Novo Faturamento', icon: FilePlus2 },
  { to: '/admin/faturamento/importacao/conferencia', label: 'Conferência', icon: ListChecks },
  { to: '/admin/faturamento/importacao/historico', label: 'Histórico', icon: History },
  { to: '/admin/faturamento/importacao/relatorio', label: 'Relatório', icon: FileBarChart2 },
];

const FaturamentoDN4Layout: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <Wallet className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h1 className="text-xl font-bold font-display leading-tight">Base de Faturamento</h1>
        <p className="text-xs text-muted-foreground">Importação de dados, conferência e relatórios.</p>
      </div>
    </div>

    <nav className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )
          }
        >
          <t.icon className="w-4 h-4" /> {t.label}
        </NavLink>
      ))}
    </nav>

    <Outlet />
  </div>
);

export default FaturamentoDN4Layout;
