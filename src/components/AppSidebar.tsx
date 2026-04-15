import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, CalendarDays,
  FileCheck, FileText, Settings, LogOut, ChevronLeft, Menu,
  Database, HardHat, Shirt, UtensilsCrossed, Bus, History,
  Clock, Wallet, CalendarCheck, FileX, Fuel, Car,
  Stethoscope, UserCheck, Package, Monitor, Shield, ClipboardList,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/hooks/useUserRole';

interface MenuItem {
  label: string;
  icon: React.ElementType;
  path: string;
  disabled?: boolean;
  roles?: AppRole[]; // if undefined, admin-only
}

const ALL_ROLES: AppRole[] = ['admin', 'filial_praia', 'filial_goiania', 'almoxarifado', 'usuario', 'tecnico_campo', 'operacional'];
const RH_ROLES: AppRole[] = ['admin', 'filial_praia', 'filial_goiania'];
const ADMIN_ONLY: AppRole[] = ['admin'];

const menuItems: MenuItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: RH_ROLES },
  { label: 'Empresas', icon: Building2, path: '/empresas', roles: ADMIN_ONLY },
  { label: 'Base Mestra', icon: Database, path: '/base-mestra', roles: ADMIN_ONLY },
  { label: 'Funcionários', icon: Users, path: '/funcionarios', roles: RH_ROLES },
  { label: 'Lançamentos Mensais', icon: CalendarDays, path: '/lancamentos', roles: RH_ROLES },
  { label: 'Fechamento', icon: FileCheck, path: '/fechamento', roles: ADMIN_ONLY },
  { label: 'Relatório', icon: FileText, path: '/relatorio', roles: RH_ROLES },
];

const operationalItems: MenuItem[] = [
  { label: 'Entrega de EPI', icon: HardHat, path: '/epi', roles: RH_ROLES },
  { label: 'Uniformes', icon: Shirt, path: '/uniformes', roles: RH_ROLES },
  { label: 'Relatório VR', icon: UtensilsCrossed, path: '/relatorio-vr', roles: RH_ROLES },
  { label: 'Relatório VT', icon: Bus, path: '/relatorio-vt', roles: RH_ROLES },
  { label: 'Combustível', icon: Fuel, path: '/combustivel', roles: ADMIN_ONLY },
  { label: 'Protocolo', icon: FileCheck, path: '/protocolo', roles: RH_ROLES },
  { label: 'Doc. Veículos', icon: Car, path: '/documentos-ativos', roles: RH_ROLES },
  { label: 'Aviso de Férias', icon: CalendarCheck, path: '/aviso-ferias', roles: RH_ROLES },
  { label: 'ASO', icon: Stethoscope, path: '/aso', roles: RH_ROLES },
  { label: 'Prestadores', icon: UserCheck, path: '/prestadores', roles: ADMIN_ONLY },
  { label: 'Almoxarifado', icon: Package, path: '/almoxarifado', roles: ['admin', 'almoxarifado'] },
  { label: 'Despachar Chamados', icon: ClipboardList, path: '/operacional/chamados', roles: ['admin', 'operacional'] },
  { label: 'Histórico', icon: History, path: '/historico', roles: RH_ROLES },
];

const adminItems: MenuItem[] = [
  { label: 'Gerenciar Usuários', icon: Shield, path: '/gerenciar-usuarios', roles: ADMIN_ONLY },
  { label: 'Monitoramento', icon: Monitor, path: '/monitoramento', roles: ADMIN_ONLY },
  { label: 'Configurações', icon: Settings, path: '/configuracoes', roles: ADMIN_ONLY },
];

const upcomingItems: MenuItem[] = [
  { label: 'Ponto Digital', icon: Clock, path: '#', disabled: true, roles: ADMIN_ONLY },
  { label: 'Folha de Pagamento', icon: Wallet, path: '#', disabled: true, roles: ADMIN_ONLY },
  { label: 'Rescisões', icon: FileX, path: '#', disabled: true, roles: ADMIN_ONLY },
];

const filterByRole = (items: MenuItem[], role: AppRole | null): MenuItem[] => {
  const r = role || 'usuario';
  return items.filter(item => item.roles?.includes(r));
};

interface Props { collapsed: boolean; onToggle: () => void; }

const AppSidebar: React.FC<Props> = ({ collapsed, onToggle }) => {
  const { logout, userRole } = useApp();
  const location = useLocation();

  const filteredMenu = filterByRole(menuItems, userRole);
  const filteredOps = filterByRole(operationalItems, userRole);
  const filteredAdmin = filterByRole(adminItems, userRole);
  const filteredUpcoming = filterByRole(upcomingItems, userRole);

  const portalTitle = userRole === 'filial_praia' ? 'RH Praia Grande'
    : userRole === 'filial_goiania' ? 'RH Goiânia'
    : userRole === 'almoxarifado' ? 'Almoxarifado'
    : 'Topac RH';

  const portalSub = userRole === 'filial_praia' ? 'Portal Filial'
    : userRole === 'filial_goiania' ? 'Portal Filial'
    : userRole === 'almoxarifado' ? 'Portal Operacional'
    : 'Multiempresa PRO';

  const renderLink = (item: MenuItem) => (
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
              <h2 className="text-sm font-bold text-sidebar-primary-foreground font-display leading-tight">{portalTitle}</h2>
              <p className="text-[10px] text-sidebar-foreground/60">{portalSub}</p>
            </div>
          </div>
        )}
        <button onClick={onToggle} className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground">
          {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {filteredMenu.map(renderLink)}

        {filteredOps.length > 0 && (
          <>
            {!collapsed && (
              <div className="pt-3 mt-3 border-t border-sidebar-border">
                <p className="px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 mb-2">Operacional</p>
              </div>
            )}
            {collapsed && <div className="pt-2 mt-2 border-t border-sidebar-border" />}
            {filteredOps.map(renderLink)}
          </>
        )}

        {filteredAdmin.length > 0 && (
          <>
            {!collapsed && (
              <div className="pt-3 mt-3 border-t border-sidebar-border">
                <p className="px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 mb-2">Administração</p>
              </div>
            )}
            {collapsed && <div className="pt-2 mt-2 border-t border-sidebar-border" />}
            {filteredAdmin.map(renderLink)}
          </>
        )}

        {filteredUpcoming.length > 0 && (
          <>
            {!collapsed && (
              <div className="pt-3 mt-3 border-t border-sidebar-border">
                <p className="px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 mb-2">Próximos Módulos</p>
              </div>
            )}
            {collapsed && <div className="pt-2 mt-2 border-t border-sidebar-border" />}
            {filteredUpcoming.map(item => (
              <div key={item.label}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/40 cursor-not-allowed">
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && <span className="ml-auto text-[9px] bg-sidebar-accent/50 rounded px-1.5 py-0.5">Em breve</span>}
              </div>
            ))}
          </>
        )}
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
