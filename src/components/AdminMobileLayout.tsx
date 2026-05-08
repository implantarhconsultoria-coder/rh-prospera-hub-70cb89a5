import React, { useState, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, CalendarDays, FileCheck, FileText, Settings, LogOut, Menu, X, ArrowLeft, Search,
  Database, HardHat, Shirt, UtensilsCrossed, Bus, History, Clock, Wallet, CalendarCheck, FileX, Fuel, Car,
  Stethoscope, UserCheck, Package, Monitor, Shield, ClipboardList, Receipt, RefreshCw, AlertTriangle, ClipboardCheck,
  ArrowDownCircle, ArrowUpCircle, Truck, Landmark, Activity, Layers, CheckSquare, DollarSign, Wrench, FileSearch, Wand2,
  ShoppingCart, Sparkles, ChevronRight, Bell,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import VoiceCommandFab from '@/components/admin-mobile/VoiceCommandFab';
import AssistenteFab from '@/components/assistente/AssistenteFab';
import GlobalSearch, { SearchModule } from '@/components/admin-mobile/GlobalSearch';

type Item = { label: string; icon: React.ElementType; path: string; group: string; tint?: string };

const ALL_ITEMS: Item[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin', group: 'Principal' },
  { label: 'Empresas', icon: Building2, path: '/admin/empresas', group: 'Principal' },
  { label: 'Base Mestra', icon: Database, path: '/admin/base-mestra', group: 'Principal' },
  { label: 'Funcionários', icon: Users, path: '/admin/funcionarios', group: 'Principal' },
  { label: 'Lançamentos Mensais', icon: CalendarDays, path: '/admin/lancamentos', group: 'Principal' },
  { label: 'Fechamentos Filiais', icon: ClipboardCheck, path: '/admin/fechamentos-filiais', group: 'Principal' },
  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento', group: 'Principal' },
  { label: 'Fechamento por Ponto', icon: Clock, path: '/admin/fechamento-ponto', group: 'Principal' },
  { label: 'Folha de Pagamento', icon: Wallet, path: '/admin/folha-pagamento', group: 'Principal' },
  { label: 'Rescisões', icon: FileX, path: '/admin/rescisoes', group: 'Principal' },
  { label: 'Relatório', icon: FileText, path: '/admin/relatorio', group: 'Principal' },

  { label: 'Entrega de EPI', icon: HardHat, path: '/admin/epi', group: 'Operacional' },
  { label: 'Uniformes', icon: Shirt, path: '/admin/uniformes', group: 'Operacional' },
  { label: 'Relatório VR', icon: UtensilsCrossed, path: '/admin/relatorio-vr', group: 'Operacional' },
  { label: 'Relatório VT', icon: Bus, path: '/admin/relatorio-vt', group: 'Operacional' },
  { label: 'Combustível (Galões)', icon: Fuel, path: '/admin/galoes-combustivel', group: 'Operacional' },
  { label: 'Protocolo', icon: FileCheck, path: '/admin/protocolo', group: 'Operacional' },
  { label: 'Doc. Veículos', icon: Car, path: '/admin/documentos-ativos', group: 'Operacional' },
  { label: 'Aviso de Férias', icon: CalendarCheck, path: '/admin/aviso-ferias', group: 'Operacional' },
  { label: 'Importar Atestados', icon: FileSearch, path: '/admin/atestados', group: 'Operacional' },
  { label: 'Importar p/ Fechamento', icon: Wand2, path: '/admin/importar-fechamento', group: 'Operacional' },
  { label: 'Conferência de Ponto', icon: ClipboardCheck, path: '/admin/conferencia-ponto', group: 'Operacional' },
  { label: 'ASO', icon: Stethoscope, path: '/admin/aso', group: 'Operacional' },
  { label: 'Prestadores', icon: UserCheck, path: '/admin/prestadores', group: 'Operacional' },
  { label: 'Almoxarifado', icon: Package, path: '/admin/almoxarifado', group: 'Operacional' },
  { label: 'Compras', icon: ShoppingCart, path: '/admin/compras', group: 'Operacional' },
  { label: 'Despachar Chamados', icon: ClipboardList, path: '/admin/chamados', group: 'Operacional' },
  { label: 'App Mecânico', icon: Wrench, path: '/admin/app-mecanico', group: 'Operacional' },
  { label: 'Abastecimento QRCode', icon: Fuel, path: '/admin/abastecimento-qrcode', group: 'Operacional' },
  { label: 'Histórico', icon: History, path: '/admin/historico', group: 'Operacional' },

  { label: 'Faturamento', icon: Wallet, path: '/admin/faturamento', group: 'Faturamento' },
  { label: 'Clientes', icon: Users, path: '/admin/faturamento/clientes', group: 'Faturamento' },
  { label: 'Contratos', icon: FileText, path: '/admin/faturamento/contratos', group: 'Faturamento' },
  { label: 'Faturas', icon: Receipt, path: '/admin/faturamento/faturas', group: 'Faturamento' },
  { label: 'Medições', icon: ClipboardCheck, path: '/admin/faturamento/medicoes', group: 'Faturamento' },
  { label: 'Reajustes', icon: RefreshCw, path: '/admin/faturamento/reajustes', group: 'Faturamento' },
  { label: 'Pendências', icon: AlertTriangle, path: '/admin/faturamento/pendencias', group: 'Faturamento' },
  { label: 'DN4 Automatizado', icon: Sparkles, path: '/admin/faturamento/dn4', group: 'Faturamento' },

  { label: 'Financeiro', icon: DollarSign, path: '/admin/financeiro', group: 'Financeiro' },
  { label: 'Contas a Receber', icon: ArrowDownCircle, path: '/admin/financeiro/contas-receber', group: 'Financeiro' },
  { label: 'Contas a Pagar', icon: ArrowUpCircle, path: '/admin/financeiro/contas-pagar', group: 'Financeiro' },
  { label: 'Fornecedores', icon: Truck, path: '/admin/financeiro/fornecedores', group: 'Financeiro' },
  { label: 'Caixa e Bancos', icon: Landmark, path: '/admin/financeiro/bancos', group: 'Financeiro' },
  { label: 'Fluxo de Caixa', icon: Activity, path: '/admin/financeiro/fluxo-caixa', group: 'Financeiro' },
  { label: 'Conciliação', icon: CheckSquare, path: '/admin/financeiro/conciliacao', group: 'Financeiro' },
  { label: 'Inadimplência', icon: AlertTriangle, path: '/admin/financeiro/inadimplencia', group: 'Financeiro' },
  { label: 'Centros de Custo', icon: Layers, path: '/admin/financeiro/centros-custo', group: 'Financeiro' },

  { label: 'Gerenciar Usuários', icon: Shield, path: '/admin/gerenciar-usuarios', group: 'Administração' },
  { label: 'Acessos Externos', icon: Shield, path: '/admin/acessos-externos', group: 'Administração' },
  { label: 'Monitoramento', icon: Monitor, path: '/admin/monitoramento', group: 'Administração' },
  { label: 'Configurações', icon: Settings, path: '/admin/configuracoes', group: 'Administração' },
];

// Cards da home — compactos, com tonalidades discretas
const HOME_QUICK: Item[] = [
  { label: 'Funcionários', icon: Users, path: '/admin/funcionarios', group: '', tint: 'from-blue-500/15 to-blue-500/5 text-blue-600 dark:text-blue-400' },
  { label: 'Empresas', icon: Building2, path: '/admin/empresas', group: '', tint: 'from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400' },
  { label: 'Lançamentos', icon: CalendarDays, path: '/admin/lancamentos', group: '', tint: 'from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400' },
  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento', group: '', tint: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400' },
  { label: 'EPI', icon: HardHat, path: '/admin/epi', group: '', tint: 'from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400' },
  { label: 'Uniformes', icon: Shirt, path: '/admin/uniformes', group: '', tint: 'from-cyan-500/15 to-cyan-500/5 text-cyan-600 dark:text-cyan-400' },
  { label: 'VR', icon: UtensilsCrossed, path: '/admin/relatorio-vr', group: '', tint: 'from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-400' },
  { label: 'VT', icon: Bus, path: '/admin/relatorio-vt', group: '', tint: 'from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400' },
  { label: 'Combustível', icon: Fuel, path: '/admin/galoes-combustivel', group: '', tint: 'from-red-500/15 to-red-500/5 text-red-600 dark:text-red-400' },
  { label: 'Doc. Veículos', icon: Car, path: '/admin/documentos-ativos', group: '', tint: 'from-indigo-500/15 to-indigo-500/5 text-indigo-600 dark:text-indigo-400' },
  { label: 'Almoxarifado', icon: Package, path: '/admin/almoxarifado', group: '', tint: 'from-teal-500/15 to-teal-500/5 text-teal-600 dark:text-teal-400' },
  { label: 'Apontamento', icon: Clock, path: '/admin/conferencia-ponto', group: '', tint: 'from-fuchsia-500/15 to-fuchsia-500/5 text-fuchsia-600 dark:text-fuchsia-400' },
  { label: 'Faturamento', icon: Wallet, path: '/admin/faturamento', group: '', tint: 'from-green-500/15 to-green-500/5 text-green-600 dark:text-green-400' },
  { label: 'Financeiro', icon: DollarSign, path: '/admin/financeiro', group: '', tint: 'from-lime-500/15 to-lime-500/5 text-lime-600 dark:text-lime-400' },
  { label: 'Relatórios', icon: FileText, path: '/admin/relatorio', group: '', tint: 'from-slate-500/15 to-slate-500/5 text-slate-600 dark:text-slate-400' },
  { label: 'App Mecânico', icon: Wrench, path: '/admin/app-mecanico', group: '', tint: 'from-yellow-500/15 to-yellow-500/5 text-yellow-700 dark:text-yellow-400' },
];

const SEARCH_MODULES: SearchModule[] = ALL_ITEMS.map(i => ({ label: i.label, path: i.path }));

const AdminMobileLayout: React.FC = () => {
  const { logout, session } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  const isHome = location.pathname === '/admin';
  const current = useMemo(() => {
    return ALL_ITEMS
      .filter(i => location.pathname === i.path || (i.path !== '/admin' && location.pathname.startsWith(i.path)))
      .sort((a, b) => b.path.length - a.path.length)[0];
  }, [location.pathname]);

  const grouped = useMemo(() => {
    const map: Record<string, Item[]> = {};
    ALL_ITEMS.forEach(i => { (map[i.group] ||= []).push(i); });
    return map;
  }, []);

  const go = (path: string) => { setDrawerOpen(false); nav(path); };
  const initials = (session?.user?.email || 'A').slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      {/* Topbar — compacto, premium */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-card/85 border-b border-border/60 flex items-center gap-2 px-3 h-14">
        {!isHome ? (
          <Button size="icon" variant="ghost" className="rounded-full" onClick={() => nav(-1)} aria-label="Voltar">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate leading-tight">{current?.label || 'Painel Admin'}</div>
          <div className="text-[10px] text-muted-foreground truncate">{session?.user?.email}</div>
        </div>
        <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setSearchOpen(true)} aria-label="Buscar">
          <Search className="w-5 h-5" />
        </Button>
        <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setDrawerOpen(true)} aria-label="Menu">
          <Menu className="w-5 h-5" />
        </Button>
      </header>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-[88%] max-w-sm bg-card border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold">
                  {initials}
                </div>
                <div>
                  <div className="text-sm font-semibold leading-tight">Admin</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{session?.user?.email}</div>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setDrawerOpen(false)}><X className="w-5 h-5" /></Button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-5">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{group}</div>
                  <div className="space-y-1">
                    {items.map(it => (
                      <button
                        key={it.path}
                        onClick={() => go(it.path)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition',
                          location.pathname === it.path
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-foreground hover:bg-muted/60 active:bg-muted',
                        )}
                      >
                        <it.icon className="w-4 h-4 shrink-0 opacity-90" />
                        <span className="flex-1 truncate">{it.label}</span>
                        <ChevronRight className="w-4 h-4 opacity-40" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <div className="p-3 border-t border-border">
              <Button size="lg" variant="outline" className="w-full rounded-xl" onClick={async () => { await logout(); nav('/'); }}>
                <LogOut className="w-4 h-4 mr-2" /> Sair
              </Button>
            </div>
          </aside>
        </>
      )}

      {/* Conteúdo */}
      <main className="flex-1 px-3 pt-3 pb-24">
        {isHome ? (
          <div className="space-y-5">
            {/* Hero saudação */}
            <div className="px-1 pt-1">
              <h1 className="text-2xl font-bold tracking-tight">Olá, Rodrigo 👋</h1>
              <p className="text-sm text-muted-foreground mt-0.5">O que vamos fazer hoje?</p>
            </div>

            {/* Search bar (abre overlay) */}
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2 px-4 h-12 rounded-2xl bg-card border border-border shadow-sm text-left text-sm text-muted-foreground active:scale-[0.99] transition"
            >
              <Search className="w-4 h-4" />
              <span>Buscar funcionário, empresa, módulo...</span>
            </button>

            {/* Grid 3 colunas — cards compactos */}
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Acesso rápido</h2>
                <button onClick={() => setDrawerOpen(true)} className="text-xs text-primary font-medium">Ver tudo</button>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {HOME_QUICK.map(it => (
                  <button
                    key={it.path}
                    onClick={() => nav(it.path)}
                    className="aspect-square rounded-2xl bg-card border border-border/60 shadow-sm active:scale-95 transition flex flex-col items-center justify-center gap-1.5 p-2"
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br',
                      it.tint || 'from-primary/15 to-primary/5 text-primary',
                    )}>
                      <it.icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-medium text-center leading-tight line-clamp-2">{it.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dica rodapé */}
            <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold">Comando de voz</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Toque no microfone e diga, por exemplo: <i>"abrir funcionário Rafael Olimpio"</i> ou <i>"imprimir recibo de VR do Diego"</i>.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* Busca global */}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        query={searchQ}
        onQuery={setSearchQ}
        modules={SEARCH_MODULES}
      />

      {/* FAB Voz (somente admin — este layout só renderiza para admin) */}
      <VoiceCommandFab />
      <AssistenteFab />
    </div>
  );
};

export default AdminMobileLayout;
