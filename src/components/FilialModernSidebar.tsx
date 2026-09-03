import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarCheck, Stethoscope, FileCheck, Bell,
  Building2, ChevronLeft, Menu, LogOut, CalendarDays, Lock, UploadCloud,
  Send, Headphones,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { cn } from '@/lib/utils';

const menuItems = [
  { label: 'Painel da Filial', icon: LayoutDashboard, path: '/filial' },
  { label: 'Funcionários', icon: Users, path: '/filial/funcionarios' },
  { label: 'Movimento Diário', icon: CalendarDays, path: '/filial/movimento-diario' },
  { label: 'Apontamento', icon: Send, path: '/filial/apontamento' },
  { label: 'Fechamento', icon: Lock, path: '/filial/fechamento' },
  { label: 'Documentos', icon: UploadCloud, path: '/filial/atestados' },
  { label: 'Aviso de Férias', icon: CalendarCheck, path: '/filial/aviso-ferias' },
  { label: 'ASO / Agendamento', icon: Stethoscope, path: '/filial/aso' },
  { label: 'Protocolos', icon: FileCheck, path: '/filial/protocolo' },
  { label: 'Alertas', icon: Bell, path: '/filial/alertas' },
];

interface Props { collapsed: boolean; onToggle: () => void }

const labelForCompany = (name = '', codigo = '') => {
  const raw = `${name} ${codigo}`.toLocaleLowerCase('pt-BR');
  if (raw.includes('praia') || raw.includes('topac-pg')) return 'RH Praia Grande';
  if (raw.includes('goi') || raw.includes('gyn') || raw.includes('0003')) return 'RH Goiânia';
  if (raw.includes('matriz') || raw.includes('0001')) return 'RH Matriz';
  return name ? `RH ${name}` : 'RH Filial';
};

const FilialModernSidebar: React.FC<Props> = ({ collapsed, onToggle }) => {
  const { logout, session, companies } = useApp();
  const { filialCompanyId, filialCodigo } = useFilialFilter();
  const location = useLocation();
  const company = companies.find(item => item.id === filialCompanyId) || companies.find(item => String((item as any).codigo || '') === filialCodigo);
  const portalTitle = labelForCompany(company?.name || '', String((company as any)?.codigo || filialCodigo || ''));
  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || session?.user?.email || '';

  return (
    <aside className={cn(
      'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[#24202c] bg-[#030609] shadow-[18px_0_50px_rgba(0,0,0,.34)] transition-[width] duration-300',
      collapsed ? 'w-[72px]' : 'w-[270px]',
    )}>
      <div className="flex h-[86px] shrink-0 items-center border-b border-[#24202c] px-4">
        <div className={cn('flex min-w-0 flex-1 items-center gap-3', collapsed && 'justify-center')}>
          <div className="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-[9px] border border-violet-500/50 bg-[#0b0b10] shadow-[0_0_22px_rgba(139,34,255,.18)]">
            <Building2 className="h-6 w-6 text-[#ffc400]" />
          </div>
          {!collapsed && <div className="min-w-0"><div className="truncate text-[16px] font-black text-white">{portalTitle}</div><div className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wider text-violet-400">Portal Filial • {company?.name || 'TOPAC'}</div></div>}
        </div>
      </div>

      <button onClick={onToggle} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} className="absolute -right-4 top-[101px] z-10 grid h-8 w-8 place-items-center rounded-full border border-[#32263f] bg-[#090b10] text-zinc-400 shadow-lg transition hover:border-violet-500 hover:text-violet-300">
        {collapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {!collapsed && <div className="border-b border-[#24202c] px-4 py-3"><div className="text-[9px] uppercase tracking-[.16em] text-zinc-600">Logado como</div><div className="mt-1 truncate text-xs font-medium text-zinc-300">{userName}</div></div>}

      <nav className="flex-1 overflow-y-auto px-2 py-3 [scrollbar-color:#4c1d95_transparent] [scrollbar-width:thin]">
        <div className="space-y-[2px]">
          {menuItems.map(item => {
            const active = location.pathname === item.path || (item.path !== '/filial' && location.pathname.startsWith(`${item.path}/`));
            return <NavLink key={item.path} to={item.path} title={collapsed ? item.label : undefined} className={cn('group relative flex h-[40px] items-center gap-3 rounded-[5px] px-3 text-[12px] transition-all', active ? 'bg-gradient-to-r from-[#251548] via-[#211339] to-[#181023] text-white' : 'text-zinc-400 hover:bg-white/[0.035] hover:text-white')}>
              <item.icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-[#ffc400]' : 'text-violet-500 group-hover:text-violet-300')} strokeWidth={1.8} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {active && <span className="absolute bottom-0 right-0 top-0 w-[3px] rounded-l-full bg-[#ffc400] shadow-[0_0_12px_rgba(255,196,0,.8)]" />}
            </NavLink>;
          })}
        </div>
      </nav>

      <div className="shrink-0 space-y-2 px-3 pb-3">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('topac:open-support'))} className={cn('flex w-full items-center gap-3 rounded-lg border border-[#282b32] bg-[#06090d] px-3 py-3 text-left text-zinc-300 transition hover:border-violet-500/60 hover:bg-violet-500/5', collapsed && 'justify-center px-2')}>
          <Headphones className="h-5 w-5 shrink-0 text-violet-400" />
          {!collapsed && <span><strong className="block text-[11px] uppercase tracking-wide text-white">Suporte interno</strong><span className="text-[10px] text-zinc-500">E-mail • WhatsApp • Técnico</span></span>}
        </button>
        <button onClick={logout} className={cn('flex h-9 w-full items-center gap-3 rounded-md px-3 text-[12px] text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300', collapsed && 'justify-center')}><LogOut className="h-4 w-4 shrink-0" />{!collapsed && <span>Sair</span>}</button>
      </div>
    </aside>
  );
};

export default FilialModernSidebar;
