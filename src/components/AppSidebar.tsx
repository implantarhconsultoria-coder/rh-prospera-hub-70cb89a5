import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, FileCheck, FileText, LogOut,
  HardHat, Shirt, History, CalendarCheck, FileX, Fuel, Car, Stethoscope,
  UserCheck, Package, ClipboardList, Receipt, ClipboardCheck, Wrench, FileSearch,
  ShoppingCart, Headphones, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { isDirectorRole } from '@/lib/directorPermissions';

interface MenuItem { label: string; icon: React.ElementType; path: string }

const menuItems: MenuItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
  { label: 'Empresas', icon: Building2, path: '/admin/empresas' },
  { label: 'Funcionários', icon: Users, path: '/admin/funcionarios' },
  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento' },
  { label: 'Assinatura Digital', icon: Receipt, path: '/admin/folha-pagamento' },
  { label: 'Fechamentos das Filiais', icon: ClipboardCheck, path: '/admin/fechamentos-filiais' },
  { label: 'Apontamento Contabilidade', icon: ClipboardCheck, path: '/admin/apontamento-contabilidade' },
  { label: 'Rescisões', icon: FileX, path: '/admin/rescisoes' },
];

const operationalItems: MenuItem[] = [
  { label: 'Operacional', icon: ClipboardList, path: '/admin/operacional' },
  { label: 'App Mecânico', icon: Wrench, path: '/admin/app-mecanico' },
  { label: 'Abastecimento QR Code', icon: Fuel, path: '/admin/abastecimento-qrcode' },
  { label: 'Almoxarifado', icon: Package, path: '/admin/almoxarifado' },
  { label: 'Combustível', icon: Fuel, path: '/admin/galoes-combustivel' },
  { label: 'Frota / Documentos', icon: Car, path: '/admin/documentos-ativos' },
  { label: 'Protocolo', icon: FileCheck, path: '/admin/operacional/protocolo' },
  { label: 'Entrega de EPI', icon: HardHat, path: '/admin/epi' },
  { label: 'Uniformes', icon: Shirt, path: '/admin/uniformes' },
  { label: 'Aviso de Férias', icon: CalendarCheck, path: '/admin/aviso-ferias' },
  { label: 'ASO', icon: Stethoscope, path: '/admin/aso' },
  { label: 'Pré-cadastro Admissional', icon: FileSearch, path: '/admin/pre-cadastro-admissional' },
  { label: 'Prestadores', icon: UserCheck, path: '/admin/prestadores' },
  { label: 'Compras', icon: ShoppingCart, path: '/admin/compras' },
  { label: 'Envios para Clínicas', icon: FileText, path: '/admin/emails-contabilidade' },
  { label: 'Histórico', icon: History, path: '/admin/historico' },
];

const directorItems: MenuItem[] = [
  { label: 'Central TOPAC', icon: LayoutDashboard, path: '/admin' },
  { label: 'Envios para Clínicas', icon: FileText, path: '/admin/emails-contabilidade' },
  { label: 'Relatório Geral', icon: FileText, path: '/admin/relatorio' },
];

const LAST_ROUTE_PREFIX = 'topac:last-route:v1:';
const allMenuPaths = Array.from(new Set([...menuItems, ...operationalItems, ...directorItems].map((item) => item.path)))
  .sort((a, b) => b.length - a.length);

const isInsideModule = (pathname: string, basePath: string) =>
  pathname === basePath || (basePath !== '/admin' && pathname.startsWith(`${basePath}/`));

const savedModuleRoute = (basePath: string) => {
  if (typeof window === 'undefined' || basePath === '/admin') return basePath;
  try {
    const saved = window.sessionStorage.getItem(`${LAST_ROUTE_PREFIX}${basePath}`) || '';
    return isInsideModule(saved.split('?')[0], basePath) ? saved : basePath;
  } catch {
    return basePath;
  }
};

interface Props { collapsed: boolean; onToggle: () => void }

const AppSidebar: React.FC<Props> = ({ collapsed, onToggle }) => {
  const { logout, userRoles } = useApp();
  const location = useLocation();
  const isDirector = isDirectorRole(userRoles) && !userRoles.includes('admin');
  const items = isDirector ? directorItems : [...menuItems, ...operationalItems];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const modulePath = allMenuPaths.find((path) => isInsideModule(location.pathname, path));
    if (!modulePath || modulePath === '/admin') return;
    try {
      window.sessionStorage.setItem(
        `${LAST_ROUTE_PREFIX}${modulePath}`,
        `${location.pathname}${location.search}${location.hash}`,
      );
    } catch (error) {
      console.warn('Não foi possível memorizar a rota do módulo:', error);
    }
  }, [location.pathname, location.search, location.hash]);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[#24202c] bg-[#030609] shadow-[18px_0_50px_rgba(0,0,0,.34)] transition-[width] duration-300',
        collapsed ? 'w-[72px]' : 'w-[270px]'
      )}
    >
      <div className="flex h-[86px] shrink-0 items-center border-b border-[#24202c] px-4">
        <div className={cn('flex min-w-0 flex-1 items-center gap-3', collapsed && 'justify-center')}>
          <div className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[8px] border-2 border-[#8b22ff] bg-[#08070a] shadow-[0_0_22px_rgba(139,34,255,.18)]">
            <span className="text-[34px] font-black leading-none text-[#ffbf00]">T</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-[20px] font-black tracking-[-.02em] text-white">TOPAC RH PRO</div>
              <div className="mt-1 text-[11px] font-semibold tracking-wide text-[#a855f7]">Inteligência Operacional</div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onToggle}
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        className="absolute -right-4 top-[101px] z-10 grid h-8 w-8 place-items-center rounded-full border border-[#32263f] bg-[#090b10] text-zinc-400 shadow-lg transition hover:border-[#9b36ff] hover:text-[#c66cff]"
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      <nav className="flex-1 overflow-y-auto px-2 py-3 [scrollbar-color:#4c1d95_transparent] [scrollbar-width:thin]">
        <div className="space-y-[2px]">
          {items.map((item) => {
            const active = isInsideModule(location.pathname, item.path);
            const destination = savedModuleRoute(item.path);
            return (
              <NavLink
                key={item.path}
                to={destination}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'group relative flex h-[38px] items-center gap-3 rounded-[4px] px-3 text-[13px] transition-all duration-150',
                  active
                    ? 'bg-gradient-to-r from-[#251548] via-[#211339] to-[#181023] text-white shadow-[inset_0_0_0_1px_rgba(147,51,234,.12)]'
                    : 'text-[#c9c6ce] hover:bg-white/[0.035] hover:text-white'
                )}
              >
                <item.icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-[#f4b400]' : 'text-[#9b32ff] group-hover:text-[#ba64ff]')} strokeWidth={1.8} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {active && <span className="absolute bottom-0 right-0 top-0 w-[3px] rounded-l-full bg-[#ffc400] shadow-[0_0_12px_rgba(255,196,0,.8)]" />}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <div className="shrink-0 px-4 pb-3 pt-2">
        {!collapsed && (
          <div className="mb-3 rounded-[9px] border border-[#282b32] bg-[#06090d] px-4 py-4">
            <div className="flex items-center gap-3">
              <Headphones className="h-8 w-8 text-[#9b32ff]" strokeWidth={1.6} />
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wide text-white">Suporte interno</div>
                <div className="mt-1 text-[11px] text-zinc-500">TOPAC RH PRO</div>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className={cn('flex h-9 w-full items-center gap-3 rounded-md px-3 text-[12px] text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300', collapsed && 'justify-center')}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
