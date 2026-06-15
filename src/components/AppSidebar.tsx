import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, FileCheck, FileText, LogOut, ChevronLeft, Menu,
  HardHat, Shirt, History, Wallet, CalendarCheck, FileX, Fuel, Car, Stethoscope,
  UserCheck, Package, ClipboardList, ChevronDown, ChevronRight, Receipt, RefreshCw,
  AlertTriangle, ClipboardCheck, ArrowDownCircle, ArrowUpCircle, Truck, Landmark,
  Activity, Layers, CheckSquare, DollarSign, Wrench, FileSearch, ShoppingCart,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { isDirectorRole } from '@/lib/directorPermissions';

interface MenuItem { label: string; icon: React.ElementType; path: string }

const menuItems: MenuItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
  { label: 'Empresas', icon: Building2, path: '/admin/empresas' },
  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento' },
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
  { label: 'Historico', icon: History, path: '/admin/historico' },
];

const directorItems: MenuItem[] = [
  { label: 'Central TOPAC', icon: LayoutDashboard, path: '/admin' },
  { label: 'Financeiro', icon: DollarSign, path: '/admin/financeiro' },
  { label: 'Contas a Receber', icon: ArrowDownCircle, path: '/admin/financeiro/contas-receber' },
  { label: 'Contas a Pagar', icon: ArrowUpCircle, path: '/admin/financeiro/contas-pagar' },
  { label: 'Faturamento', icon: Wallet, path: '/admin/faturamento' },
  { label: 'Clientes', icon: Users, path: '/admin/faturamento/clientes' },
  { label: 'Contratos', icon: FileText, path: '/admin/faturamento/contratos' },
  { label: 'Relatorio Geral', icon: FileText, path: '/admin/relatorio' },
];

const faturamentoItems: MenuItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin/faturamento' },
  { label: 'Clientes', icon: Users, path: '/admin/faturamento/clientes' },
  { label: 'Contratos', icon: FileText, path: '/admin/faturamento/contratos' },
  { label: 'Faturas', icon: Receipt, path: '/admin/faturamento/faturas' },
  { label: 'Medicoes', icon: ClipboardCheck, path: '/admin/faturamento/medicoes' },
  { label: 'Reajustes', icon: RefreshCw, path: '/admin/faturamento/reajustes' },
  { label: 'Pendencias', icon: AlertTriangle, path: '/admin/faturamento/pendencias' },
];

const financeiroItems: MenuItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin/financeiro' },
  { label: 'Contas a Receber', icon: ArrowDownCircle, path: '/admin/financeiro/contas-receber' },
  { label: 'Contas a Pagar', icon: ArrowUpCircle, path: '/admin/financeiro/contas-pagar' },
  { label: 'Fornecedores', icon: Truck, path: '/admin/financeiro/fornecedores' },
  { label: 'Caixa e Bancos', icon: Landmark, path: '/admin/financeiro/bancos' },
  { label: 'Fluxo de Caixa', icon: Activity, path: '/admin/financeiro/fluxo-caixa' },
  { label: 'Conciliacao', icon: CheckSquare, path: '/admin/financeiro/conciliacao' },
  { label: 'Inadimplencia', icon: AlertTriangle, path: '/admin/financeiro/inadimplencia' },
  { label: 'Centros de Custo', icon: Layers, path: '/admin/financeiro/centros-custo' },
];

interface Props { collapsed: boolean; onToggle: () => void }

const AppSidebar: React.FC<Props> = ({ collapsed, onToggle }) => {
  const { logout, userRoles } = useApp();
  const location = useLocation();
  const [fatOpen, setFatOpen] = useState(location.pathname.startsWith('/admin/faturamento'));
  const [finOpen, setFinOpen] = useState(location.pathname.startsWith('/admin/financeiro'));
  const isDirector = isDirectorRole(userRoles) && !userRoles.includes('admin');

  const renderLink = (item: MenuItem) => (
    <NavLink key={item.path} to={item.path} title={collapsed ? item.label : undefined}
      className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all', location.pathname === item.path ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-premium' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')}>
      <item.icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );

  const sectionTitle = (label: string) => !collapsed ? <div className="pt-3 mt-3 border-t border-sidebar-border"><p className="px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 mb-2">{label}</p></div> : <div className="pt-2 mt-2 border-t border-sidebar-border" />;

  const expandable = (label: string, icon: React.ElementType, open: boolean, setOpen: (value: boolean) => void, items: MenuItem[], activePrefix: string) => {
    const Icon = icon;
    if (collapsed) return <>{items.map(renderLink)}</>;
    return <>
      <button onClick={() => setOpen(!open)} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full transition-all', location.pathname.startsWith(activePrefix) ? 'bg-sidebar-primary/40 text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
        <Icon className="w-5 h-5 flex-shrink-0" /><span className="flex-1 text-left">{label}</span>{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && <div className="ml-3 pl-2 border-l border-sidebar-border space-y-1 mt-1">{items.map(renderLink)}</div>}
    </>;
  };

  return (
    <aside className={cn('h-screen gradient-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300 fixed left-0 top-0 z-40', collapsed ? 'w-16' : 'w-64')}>
      <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
        {!collapsed && <div className="admin-sidebar-brand"><div className="admin-sidebar-logo"><img src="/icons/icon-192.png?v=20260524-2" alt="TOPAC RH PRO" className="w-14 h-14 object-contain" /></div><div><h2>TOPAC RH PRO</h2><p>Inteligencia Operacional</p></div></div>}
        <button onClick={onToggle} className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground">{collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}</button>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {(isDirector ? directorItems : menuItems).map(renderLink)}
        {!isDirector && sectionTitle('Operacional')}
        {!isDirector && operationalItems.map(renderLink)}
        {!isDirector && sectionTitle('Faturamento')}
        {!isDirector && expandable('Faturamento', Wallet, fatOpen, setFatOpen, faturamentoItems, '/admin/faturamento')}
        {!isDirector && sectionTitle('Financeiro')}
        {!isDirector && expandable('Financeiro', DollarSign, finOpen, setFinOpen, financeiroItems, '/admin/financeiro')}
      </nav>

      <div className="p-2 border-t border-sidebar-border">
        {!collapsed && <div className="px-3 py-3 mb-2 text-[11px] text-emerald-300/90"><div className="flex items-center gap-2 font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.9)]" />Sistema operacional</div><p className="mt-1 text-sky-100/45">Latencia 12ms . Uptime 99.98%</p></div>}
        <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-destructive/20 hover:text-destructive w-full transition-colors"><LogOut className="w-5 h-5 flex-shrink-0" />{!collapsed && <span>Sair</span>}</button>
      </div>
    </aside>
  );
};

export default AppSidebar;
