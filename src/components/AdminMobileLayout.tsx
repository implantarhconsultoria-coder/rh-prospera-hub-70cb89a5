import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, FileCheck, FileText, LogOut, Menu, X, ArrowLeft, Search,
  HardHat, Shirt, History, Clock, CalendarCheck, FileX, Fuel, Car, Stethoscope,
  UserCheck, Package, ClipboardList, ClipboardCheck, Wrench, FileSearch, ShoppingCart,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import VoiceCommandFab from '@/components/admin-mobile/VoiceCommandFab';
import AssistenteFab from '@/components/assistente/AssistenteFab';
import GlobalSearch, { SearchModule } from '@/components/admin-mobile/GlobalSearch';
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
  { label: 'Entrega de EPI', icon: HardHat, path: '/admin/epi', group: 'Operacional' },
  { label: 'Uniformes', icon: Shirt, path: '/admin/uniformes', group: 'Operacional' },
  { label: 'Protocolo', icon: FileCheck, path: '/admin/operacional/protocolo', group: 'Operacional' },
  { label: 'Aviso de Ferias', icon: CalendarCheck, path: '/admin/aviso-ferias', group: 'Operacional' },
  { label: 'ASO', icon: Stethoscope, path: '/admin/aso', group: 'Operacional' },
  { label: 'Pre-cadastro Admissional', icon: FileSearch, path: '/admin/pre-cadastro-admissional', group: 'Operacional' },
  { label: 'Prestadores', icon: UserCheck, path: '/admin/prestadores', group: 'Operacional' },
  { label: 'Compras', icon: ShoppingCart, path: '/admin/compras', group: 'Operacional' },
  { label: 'Historico', icon: History, path: '/admin/historico', group: 'Operacional' },
];

const HOME_QUICK: Item[] = [
  { label: 'Empresas', icon: Building2, path: '/admin/empresas', group: '', tint: 'from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400' },
  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento', group: '', tint: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400' },
  { label: 'EPI', icon: HardHat, path: '/admin/epi', group: '', tint: 'from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400' },
  { label: 'Uniformes', icon: Shirt, path: '/admin/uniformes', group: '', tint: 'from-cyan-500/15 to-cyan-500/5 text-cyan-600 dark:text-cyan-400' },
];

const DIRECTOR_ITEMS: Item[] = [
  { label: 'Central TOPAC', icon: LayoutDashboard, path: '/admin', group: 'Diretoria' },
  { label: 'Relatorio Geral', icon: FileText, path: '/admin/relatorio', group: 'Relatorios' },
];

const DIRECTOR_HOME_QUICK: Item[] = [
  { label: 'Relatorio', icon: FileText, path: '/admin/relatorio', group: '', tint: 'from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400' },
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
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-card/85 border-b border-border/60 flex items-center gap-2 px-3 h-14">
        {!isHome ? (
          <Button size="icon" variant="ghost" className="rounded-full" onClick={() => nav(-1)} aria-label="Voltar"><ArrowLeft className="w-5 h-5" /></Button>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 shadow-md shadow-primary/20"><Building2 className="w-5 h-5 text-primary-foreground" /></div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate leading-tight">{current?.label || 'Painel Admin'}</div>
          <div className="text-[10px] text-muted-foreground truncate">{session?.user?.email}</div>
        </div>
        <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setSearchOpen(true)} aria-label="Buscar"><Search className="w-5 h-5" /></Button>
        <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setDrawerOpen(true)} aria-label="Menu"><Menu className="w-5 h-5" /></Button>
      </header>

      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-[88%] max-w-sm bg-card border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold">{initials}</div>
                <div><div className="text-sm font-semibold leading-tight">{profileLabel}</div><div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{session?.user?.email}</div></div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setDrawerOpen(false)}><X className="w-5 h-5" /></Button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-5">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{group}</div>
                  <div className="space-y-1">
                    {items.map(it => (
                      <button key={it.path} onClick={() => go(it.path)} className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition', location.pathname === it.path ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-muted/60 active:bg-muted')}>
                        <it.icon className="w-4 h-4 shrink-0 opacity-90" /><span className="flex-1 truncate">{it.label}</span><ChevronRight className="w-4 h-4 opacity-40" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <div className="p-3 border-t border-border"><Button size="lg" variant="outline" className="w-full rounded-xl" onClick={async () => { await logout(); nav('/'); }}><LogOut className="w-4 h-4 mr-2" /> Sair</Button></div>
          </aside>
        </>
      )}

      <main className="flex-1 px-3 pt-3 pb-24">
        {isHome ? (
          <div className="space-y-5">
            <div className="px-1 pt-1">
              <h1 className="text-2xl font-bold tracking-tight">{isDirector ? 'Painel executivo' : `Ola, ${displayName}`}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{isDirector ? 'Indicadores e relatorios liberados.' : 'O que vamos fazer hoje?'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {quickItems.map(it => (
                <button key={it.path} onClick={() => go(it.path)} className={cn('rounded-2xl border border-border/70 bg-gradient-to-br p-4 text-left min-h-[104px] shadow-sm active:scale-[.98] transition', it.tint)}>
                  <it.icon className="w-6 h-6 mb-3" /><div className="font-semibold text-sm text-foreground">{it.label}</div>
                </button>
              ))}
            </div>
            <Outlet />
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
