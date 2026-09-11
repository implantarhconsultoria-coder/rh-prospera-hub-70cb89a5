import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, FileCheck, FileText, LogOut, Menu, X, ArrowLeft, Search,
  HardHat, Shirt, History, Clock, CalendarCheck, FileX, Fuel, Car, Stethoscope,
  UserCheck, Package, ClipboardList, ClipboardCheck, Wrench, FileSearch, ShoppingCart,
  ChevronRight, Radar,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import VoiceCommandFab from '@/components/admin-mobile/VoiceCommandFab';
import AssistenteFab from '@/components/assistente/AssistenteFab';
import GlobalSearch, { SearchModule } from '@/components/admin-mobile/GlobalSearch';
import AdminMobileDashboard from '@/components/admin-mobile/AdminMobileDashboard';
import AdminRequestNotifications from '@/components/admin-mobile/AdminRequestNotifications';
import DirectorBlocked from '@/components/DirectorBlocked';
import { isDirectorRole, isDirectorRouteAllowed } from '@/lib/directorPermissions';

type Item = { label: string; icon: React.ElementType; path: string; group: string; tint?: string };

const ALL_ITEMS: Item[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin', group: 'Principal' },
  { label: 'Empresas', icon: Building2, path: '/admin/empresas', group: 'Principal' },
  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento', group: 'Principal' },
  { label: 'Apontamento Contabilidade', icon: ClipboardCheck, path: '/admin/apontamento-contabilidade', group: 'Principal' },
  { label: 'Rescisoes', icon: FileX, path: '/admin/rescisoes', group: 'Principal' },
  { label: 'App Mecanico', icon: Wrench, path: '/admin/app-mecanico', group: 'Operacional' },
  { label: 'Ponto dos Mecanicos', icon: Clock, path: '/admin/fechamento-ponto', group: 'Operacional' },
  { label: 'Abastecimento QR Code', icon: Fuel, path: '/admin/abastecimento-qrcode', group: 'Operacional' },
  { label: 'Chamados Operacionais', icon: ClipboardList, path: '/admin/chamados', group: 'Operacional' },
  { label: 'Almoxarifado', icon: Package, path: '/admin/almoxarifado', group: 'Operacional' },
  { label: 'Combustivel (Galoes)', icon: Fuel, path: '/admin/galoes-combustivel', group: 'Operacional' },
  { label: 'Frota / Documentos', icon: Car, path: '/admin/documentos-ativos', group: 'Operacional' },
  { label: 'Rastreamento da Frota', icon: Radar, path: '/admin/monitoramento', group: 'Operacional' },
  { label: 'Entrega de EPI', icon: HardHat, path: '/admin/epi', group: 'Operacional' },
  { label: 'Uniformes', icon: Shirt, path: '/admin/uniformes', group: 'Operacional' },
  { label: 'Protocolo', icon: FileCheck, path: '/admin/operacional/protocolo', group: 'Operacional' },
  { label: 'Solicitar Férias', icon: CalendarCheck, path: '/admin/aviso-ferias', group: 'Operacional' },
  { label: 'ASO', icon: Stethoscope, path: '/admin/aso', group: 'Operacional' },
  { label: 'Pre-cadastro Admissional', icon: FileSearch, path: '/admin/pre-cadastro-admissional', group: 'Operacional' },
  { label: 'Prestadores', icon: UserCheck, path: '/admin/prestadores', group: 'Operacional' },
  { label: 'Compras', icon: ShoppingCart, path: '/admin/compras', group: 'Operacional' },
  { label: 'Historico', icon: History, path: '/admin/historico', group: 'Operacional' },
];

const HOME_QUICK: Item[] = [
  { label: 'Empresas', icon: Building2, path: '/admin/empresas', group: '', tint: 'border-violet-500/25 bg-[linear-gradient(145deg,rgba(139,92,246,.13),rgba(7,6,12,.98))] text-violet-400' },
  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento', group: '', tint: 'border-emerald-500/20 bg-[linear-gradient(145deg,rgba(16,185,129,.10),rgba(7,6,12,.98))] text-emerald-400' },
  { label: 'EPI', icon: HardHat, path: '/admin/epi', group: '', tint: 'border-orange-500/20 bg-[linear-gradient(145deg,rgba(249,115,22,.10),rgba(7,6,12,.98))] text-orange-400' },
  { label: 'Uniformes', icon: Shirt, path: '/admin/uniformes', group: '', tint: 'border-cyan-500/20 bg-[linear-gradient(145deg,rgba(6,182,212,.10),rgba(7,6,12,.98))] text-cyan-400' },
];

const DIRECTOR_ITEMS: Item[] = [
  { label: 'Central TOPAC', icon: LayoutDashboard, path: '/admin', group: 'Diretoria' },
  { label: 'Relatorio Geral', icon: FileText, path: '/admin/relatorio', group: 'Relatorios' },
];

const DIRECTOR_HOME_QUICK: Item[] = [
  { label: 'Relatorio', icon: FileText, path: '/admin/relatorio', group: '', tint: 'border-violet-500/25 bg-[linear-gradient(145deg,rgba(139,92,246,.13),rgba(7,6,12,.98))] text-violet-400' },
];

const AdminMobileLayout: React.FC = () => {
  const { logout, session, userRoles } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const isDirector = isDirectorRole(userRoles) && !userRoles.includes('admin');
  const visibleItems = isDirector ? DIRECTOR_ITEMS : ALL_ITEMS;
  const quickItems = isDirector ? DIRECTOR_HOME_QUICK : HOME_QUICK;
  const searchModules: SearchModule[] = useMemo(() => visibleItems.map(i => ({ label: i.label, path: i.path })), [visibleItems]);
  const profileLabel = isDirector ? 'Diretor Geral' : 'Admin';
  const displayName = (session?.user?.user_metadata?.name || session?.user?.user_metadata?.nome || session?.user?.email?.split('@')[0] || profileLabel).toString();
  const isHome = location.pathname === '/admin';

  const current = useMemo(() => visibleItems
    .filter(i => location.pathname === i.path || (i.path !== '/admin' && location.pathname.startsWith(i.path)))
    .sort((a, b) => b.path.length - a.path.length)[0], [location.pathname, visibleItems]);

  const grouped = useMemo(() => {
    const map: Record<string, Item[]> = {};
    visibleItems.forEach(i => { (map[i.group] ||= []).push(i); });
    return map;
  }, [visibleItems]);

  const go = (path: string) => { setDrawerOpen(false); nav(path); };
  const initials = (session?.user?.email || 'A').slice(0, 1).toUpperCase();

  if (isDirector && !isDirectorRouteAllowed(location.pathname)) return <DirectorBlocked />;

  return (
    <div className="min-h-screen bg-[#03030a] text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-fuchsia-500/15 bg-[#05050c]/95 px-3 backdrop-blur-xl">
        {!isHome ? (
          <Button size="icon" variant="ghost" className="rounded-full text-zinc-300" onClick={() => nav(-1)} aria-label="Voltar"><ArrowLeft className="w-5 h-5" /></Button>
        ) : (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-fuchsia-500/25 bg-[linear-gradient(145deg,#ffb400,#9f2cff)] shadow-[0_0_24px_rgba(168,85,247,.16)]"><Building2 className="w-5 h-5 text-black" /></div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate leading-tight">{current?.label || 'Painel Admin'}</div>
          <div className="text-[10px] text-zinc-600 truncate">{session?.user?.email}</div>
        </div>
        <Button size="icon" variant="ghost" className="rounded-full text-zinc-300" onClick={() => setSearchOpen(true)} aria-label="Buscar"><Search className="w-5 h-5" /></Button>
        {!isDirector && <AdminRequestNotifications />}
        <Button size="icon" variant="ghost" className="rounded-full text-zinc-300" onClick={() => setDrawerOpen(true)} aria-label="Menu"><Menu className="w-5 h-5" /></Button>
      </header>

      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-[88%] max-w-sm flex-col border-l border-fuchsia-500/20 bg-[#07070d] animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-white/[.06] p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 font-bold text-fuchsia-300">{initials}</div>
                <div><div className="text-sm font-semibold leading-tight">{profileLabel}</div><div className="text-[10px] text-zinc-600 truncate max-w-[180px]">{session?.user?.email}</div></div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setDrawerOpen(false)}><X className="w-5 h-5" /></Button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-5">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">{group}</div>
                  <div className="space-y-1">
                    {items.map(it => (
                      <button key={it.path} onClick={() => go(it.path)} className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition', location.pathname === it.path ? 'border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300' : 'text-zinc-300 hover:bg-white/[.04] active:bg-white/[.06]')}>
                        <it.icon className="w-4 h-4 shrink-0 opacity-90" /><span className="flex-1 truncate">{it.label}</span><ChevronRight className="w-4 h-4 opacity-40" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <div className="p-3 border-t border-white/[.06]"><Button size="lg" variant="outline" className="w-full rounded-xl border-fuchsia-500/20 bg-transparent" onClick={async () => { await logout(); nav('/'); }}><LogOut className="w-4 h-4 mr-2" /> Sair</Button></div>
          </aside>
        </>
      )}

      <main className="flex-1 px-3 pt-3 pb-24">
        {isHome ? (
          <div className="space-y-4">
            <div className="px-1 pt-1">
              <h1 className="text-2xl font-black tracking-tight text-white">{isDirector ? 'Painel executivo' : `Olá, ${displayName}`}</h1>
              <p className="text-sm text-zinc-600 mt-0.5">{isDirector ? 'Indicadores e relatórios liberados.' : 'O que vamos fazer hoje?'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {quickItems.map(it => (
                <button key={it.path} onClick={() => go(it.path)} className={cn('relative min-h-[112px] overflow-hidden rounded-2xl border p-4 text-left shadow-[0_10px_35px_rgba(0,0,0,.18)] active:scale-[.98] transition', it.tint)}>
                  <div className="flex items-start justify-between gap-2"><it.icon className="w-7 h-7" /><ChevronRight className="h-4 w-4 text-zinc-700" /></div>
                  <div className="mt-4 font-bold text-sm text-white">{it.label}</div>
                </button>
              ))}
            </div>
            {isDirector ? <Outlet /> : <AdminMobileDashboard />}
          </div>
        ) : <Outlet />}
      </main>

      <VoiceCommandFab />
      <AssistenteFab />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} query={searchQ} onQuery={setSearchQ} modules={searchModules} />
    </div>
  );
};

export default AdminMobileLayout;
