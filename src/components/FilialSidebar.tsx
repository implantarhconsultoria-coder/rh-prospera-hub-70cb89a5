import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarCheck, Stethoscope,
  FileCheck, Bell, Building2, ChevronLeft, Menu, LogOut, CalendarDays, Lock, UploadCloud,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';

const menuItems = [
  { label: 'Painel da Filial', icon: LayoutDashboard, path: '/filial' },
  { label: 'Funcionarios', icon: Users, path: '/filial/funcionarios' },
  { label: 'Movimento Diario', icon: CalendarDays, path: '/filial/movimento-diario' },
  { label: 'Fechamento', icon: Lock, path: '/filial/fechamento' },
  { label: 'Documentos', icon: UploadCloud, path: '/filial/atestados' },
  { label: 'Aviso de Ferias', icon: CalendarCheck, path: '/filial/aviso-ferias' },
  { label: 'ASO / Agendamento', icon: Stethoscope, path: '/filial/aso' },
  { label: 'Protocolos', icon: FileCheck, path: '/filial/protocolo' },
  { label: 'Alertas', icon: Bell, path: '/filial/alertas' },
];

interface Props { collapsed: boolean; onToggle: () => void; }

const FilialSidebar: React.FC<Props> = ({ collapsed, onToggle }) => {
  const { logout, userRole, session } = useApp();
  const location = useLocation();

  const portalTitle = userRole === 'filial_praia' ? 'RH Praia Grande' : 'RH Goiania';
  const portalColor = userRole === 'filial_praia' ? 'bg-blue-500' : 'bg-emerald-500';
  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || session?.user?.email || '';

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
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", portalColor)}>
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-sidebar-primary-foreground font-display leading-tight">{portalTitle}</h2>
              <p className="text-[10px] text-sidebar-foreground/60">Portal Filial</p>
            </div>
          </div>
        )}
        <button onClick={onToggle} className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground">
          {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 py-2 border-b border-sidebar-border">
          <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wider">Logado como</p>
          <p className="text-xs text-sidebar-foreground truncate font-medium">{userName}</p>
        </div>
      )}

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {menuItems.map(renderLink)}
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

export default FilialSidebar;
