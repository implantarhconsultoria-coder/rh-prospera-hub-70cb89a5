import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, FileCheck, FileText, LogOut, ChevronLeft, Menu,
  HardHat, Shirt, History, CalendarCheck, FileX, Fuel, Car, Stethoscope,
  UserCheck, Package, ClipboardList, Receipt, ClipboardCheck, Wrench, FileSearch, ShoppingCart,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { isDirectorRole } from '@/lib/directorPermissions';

interface MenuItem { label: string; icon: React.ElementType; path: string }

const menuItems: MenuItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
  { label: 'Empresas', icon: Building2, path: '/admin/empresas' },
  { label: 'Funcionarios', icon: Users, path: '/admin/funcionarios' },
  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento' },
  { label: 'Assinatura Digital', icon: Receipt, path: '/admin/folha-pagamento' },
  { label: 'Fechamentos das Filiais', icon: ClipboardCheck, path: '/admin/fechamentos-filiais' },
  { label: 'Apontamento Contabilidade', icon: ClipboardCheck, path: '/admin/apontamento-contabilidade' },
  { label: 'Rescisoes', icon: FileX, path: '/admin/rescisoes' },
];

const operationalItems: MenuItem[] = [
  { label: 'Operacional', icon: ClipboardList, path: '/admin/operacional' },
  { label: 'App Mecanico', icon: Wrench, path: '/admin/app-mecanico' },
  { label: 'Abastecimento QR Code', icon: Fuel, path: '/admin/abastecimento-qrcode' },
  { label: 'Almoxarifado', icon: Package, path: '/admin/almoxarifado' },
  { label: 'Combustivel (Galoes)', icon: Fuel, path: '/admin/galoes-combustivel' },
  { label: 'Frota / Documentos', icon: Car, path: '/admin/documentos-ativos' },
  { label: 'Protocolo', icon: FileCheck, path: '/admin/operacional/protocolo' },
  { label: 'Entrega de EPI', icon: HardHat, path: '/admin/epi' },
  { label: 'Uniformes', icon: Shirt, path: '/admin/uniformes' },
  { label: 'Aviso de Ferias', icon: CalendarCheck, path: '/admin/aviso-ferias' },
  { label: 'ASO', icon: Stethoscope, path: '/admin/aso' },
  { label: 'Pre-cadastro Admissional', icon: FileSearch, path: '/admin/pre-cadastro-admissional' },
  { label: 'Prestadores', icon: UserCheck, path: '/admin/prestadores' },
  { label: 'Compras', icon: ShoppingCart, path: '/admin/compras' },
  { label: 'Envios para Clinicas', icon: FileText, path: '/admin/emails-contabilidade' },
  { label: 'Historico', icon: History, path: '/admin/historico' },
];

const directorItems: MenuItem[] = [
  { label: 'Central TOPAC', icon: LayoutDashboard, path: '/admin' },
  { label: 'Envios para Clinicas', icon: FileText, path: '/admin/emails-contabilidade' },
  { label: 'Relatorio Geral', icon: FileText, path: '/admin/relatorio' },
];

interface Props { collapsed: boolean; onToggle: () => void }

const AppSidebar: React.FC<Props> = ({ collapsed, onToggle }) => {
  const { logout, userRoles } = useApp();
  const location = useLocation();
  const isDirector = isDirectorRole(userRoles) && !userRoles.includes('admin');

  const renderLink = (item: MenuItem) => {
    const active = location.pathname === item.path;
    return (
      <NavLink
        key={item.path}
        to={item.path}
        title={collapsed ? item.label : undefined}
        className={cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
          active
            ? 'bg-gradient-to-r from-violet-600/95 via-violet-500/90 to-fuchsia-500/80 text-white shadow-[0_0_24px_rgba(124,58,237,.28)] ring-1 ring-violet-300/20'
            : 'text-zinc-300 hover:bg-white/[0.055] hover:text-white'
        )}
      >
        {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-yellow-300 shadow-[0_0_12px_rgba(253,224,71,.9)]" />}
        <item.icon className={cn('h-[18px] w-[18px] flex-shrink-0 transition-colors', active ? 'text-yellow-300' : 'text-violet-300 group-hover:text-yellow-300')} />
        {!collapsed && <span className="font-medium">{item.label}</span>}
      </NavLink>
    );
  };

  const sectionTitle = (label: string) => !collapsed ? (
    <div className="mt-4 border-t border-violet-500/15 pt-4">
      <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.24em] text-yellow-300/65">{label}</p>
    </div>
  ) : <div className="mt-3 border-t border-violet-500/15 pt-3" />;

  return (
    <aside className={cn(
      'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-violet-500/20 bg-[#07060a] shadow-[18px_0_60px_rgba(0,0,0,.28)] transition-all duration-300',
      collapsed ? 'w-16' : 'w-64'
    )}>
      <div className="relative border-b border-violet-500/20 px-3 py-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(124,58,237,.22),transparent_38%),radial-gradient(circle_at_90%_85%,rgba(250,204,21,.08),transparent_35%)]" />
        <div className="relative flex items-center justify-between gap-2">
          {!collapsed && (
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border border-violet-400/35 bg-black/50 shadow-[0_0_22px_rgba(124,58,237,.25)]">
                <img src="/icons/icon-192.png?v=20260524-2" alt="TOPAC RH PRO" className="h-9 w-9 object-contain" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-black tracking-[0.12em] text-white">TOPAC RH PRO</div>
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-yellow-300/70">Central operacional</div>
              </div>
            </div>
          )}
          <button onClick={onToggle} className="relative rounded-lg border border-violet-500/20 bg-white/[0.03] p-1.5 text-zinc-300 transition hover:border-yellow-300/40 hover:text-yellow-300">
            {collapsed ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin] [scrollbar-color:rgba(124,58,237,.35)_transparent]">
        {(isDirector ? directorItems : menuItems).map(renderLink)}
        {!isDirector && sectionTitle('Operacional')}
        {!isDirector && operationalItems.map(renderLink)}
      </nav>

      <div className="border-t border-violet-500/20 p-2">
        {!collapsed && (
          <div className="mb-2 rounded-xl border border-violet-500/15 bg-white/[0.025] px-3 py-3 text-[11px]">
            <div className="flex items-center gap-2 font-semibold text-zinc-100">
              <span className="h-2 w-2 rounded-full bg-yellow-300 shadow-[0_0_12px_rgba(253,224,71,.85)]" />
              Sistema operacional
            </div>
            <p className="mt-1 text-zinc-500">TOPAC RH PRO • ambiente ativo</p>
          </div>
        )}
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300">
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
