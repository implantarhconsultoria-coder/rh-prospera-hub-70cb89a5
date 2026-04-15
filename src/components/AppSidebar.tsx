import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, CalendarDays,
  FileCheck, FileText, Settings, LogOut, ChevronLeft, Menu,
  Database, HardHat, Shirt, UtensilsCrossed, Bus, History,
  Clock, Wallet, CalendarCheck, FileX, Fuel, Car, Cog,
  Stethoscope, UserCheck,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';

const menuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Empresas', icon: Building2, path: '/empresas' },
  { label: 'Base Mestra', icon: Database, path: '/base-mestra' },
  { label: 'Funcionários', icon: Users, path: '/funcionarios' },
  { label: 'Lançamentos Mensais', icon: CalendarDays, path: '/lancamentos' },
  { label: 'Fechamento', icon: FileCheck, path: '/fechamento' },
  { label: 'Relatório', icon: FileText, path: '/relatorio' },
];

const operationalItems = [
  { label: 'Entrega de EPI', icon: HardHat, path: '/epi' },
  { label: 'Uniformes', icon: Shirt, path: '/uniformes' },
  { label: 'Relatório VR', icon: UtensilsCrossed, path: '/relatorio-vr' },
  { label: 'Relatório VT', icon: Bus, path: '/relatorio-vt' },
  { label: 'Combustível', icon: Fuel, path: '/combustivel' },
  { label: 'Protocolo', icon: FileCheck, path: '/protocolo' },
  { label: 'Compressores', icon: Cog, path: '/compressores' },
  { label: 'Doc. Veículos', icon: Car, path: '/documentos-ativos' },
  { label: 'Aviso de Férias', icon: CalendarCheck, path: '/aviso-ferias' },
  { label: 'ASO', icon: Stethoscope, path: '/aso' },
  { label: 'Prestadores', icon: UserCheck, path: '/prestadores' },
  { label: 'Histórico', icon: History, path: '/historico' },
];

const upcomingItems = [
  { label: 'Ponto Digital', icon: Clock, path: '#', disabled: true },
  { label: 'Folha de Pagamento', icon: Wallet, path: '#', disabled: true },
  { label: 'Rescisões', icon: FileX, path: '#', disabled: true },
];

const bottomItems = [
  { label: 'Configurações', icon: Settings, path: '/configuracoes' },
];

interface Props { collapsed: boolean; onToggle: () => void; }

const AppSidebar: React.FC<Props> = ({ collapsed, onToggle }) => {
  const { logout } = useApp();
  const location = useLocation();

  const renderLink = (item: { label: string; icon: React.ElementType; path: string }) => (
    <NavLink key={item.path} to={item.path}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
        location.pathname === item.path
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-premium"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}>
      <item.icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );

  return (
    <aside className={cn(
      "h-screen gradient-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300 fixed left-0 top-0 z-40",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 gradient-accent rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-sidebar-primary-foreground font-display leading-tight">Topac RH</h2>
              <p className="text-[10px] text-sidebar-foreground/60">Multiempresa PRO</p>
            </div>
          </div>
        )}
        <button onClick={onToggle} className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground">
          {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {menuItems.map(renderLink)}

        {!collapsed && (
          <div className="pt-3 mt-3 border-t border-sidebar-border">
            <p className="px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 mb-2">Operacional</p>
          </div>
        )}
        {collapsed && <div className="pt-2 mt-2 border-t border-sidebar-border" />}
        {operationalItems.map(renderLink)}

        {!collapsed && (
          <div className="pt-3 mt-3 border-t border-sidebar-border">
            <p className="px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 mb-2">Próximos Módulos</p>
          </div>
        )}
        {collapsed && <div className="pt-2 mt-2 border-t border-sidebar-border" />}
        {upcomingItems.map(item => (
          <div key={item.label}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/40 cursor-not-allowed">
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
            {!collapsed && <span className="ml-auto text-[9px] bg-sidebar-accent/50 rounded px-1.5 py-0.5">Em breve</span>}
          </div>
        ))}

        {!collapsed && <div className="pt-3 mt-3 border-t border-sidebar-border" />}
        {collapsed && <div className="pt-2 mt-2 border-t border-sidebar-border" />}
        {bottomItems.map(renderLink)}
      </nav>

      <div className="p-2 border-t border-sidebar-border">
        <button onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-destructive/20 hover:text-destructive w-full transition-colors">
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
