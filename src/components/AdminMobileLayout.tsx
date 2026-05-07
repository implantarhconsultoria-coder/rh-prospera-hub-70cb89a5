import React, { useState, useMemo } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, CalendarDays, FileCheck, FileText, Settings, LogOut, Menu, X, ArrowLeft, Search,
  Database, HardHat, Shirt, UtensilsCrossed, Bus, History, Clock, Wallet, CalendarCheck, FileX, Fuel, Car,
  Stethoscope, UserCheck, Package, Monitor, Shield, ClipboardList, Receipt, RefreshCw, AlertTriangle, ClipboardCheck,
  ArrowDownCircle, ArrowUpCircle, Truck, Landmark, Activity, Layers, CheckSquare, DollarSign, Wrench, FileSearch, Wand2,
  ShoppingCart, Sparkles, ChevronRight,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Item = { label: string; icon: React.ElementType; path: string; group: string };

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

// Atalhos da home mobile (cards grandes)
const HOME_QUICK: Item[] = [
  { label: 'Funcionários', icon: Users, path: '/admin/funcionarios', group: '' },
  { label: 'Empresas', icon: Building2, path: '/admin/empresas', group: '' },
  { label: 'Lançamentos', icon: CalendarDays, path: '/admin/lancamentos', group: '' },
  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento', group: '' },
  { label: 'Faturamento', icon: Wallet, path: '/admin/faturamento', group: '' },
  { label: 'Financeiro', icon: DollarSign, path: '/admin/financeiro', group: '' },
  { label: 'Almoxarifado', icon: Package, path: '/admin/almoxarifado', group: '' },
  { label: 'App Mecânico', icon: Wrench, path: '/admin/app-mecanico', group: '' },
  { label: 'Combustível', icon: Fuel, path: '/admin/galoes-combustivel', group: '' },
  { label: 'Doc. Veículos', icon: Car, path: '/admin/documentos-ativos', group: '' },
  { label: 'Relatórios', icon: FileText, path: '/admin/relatorio', group: '' },
  { label: 'Histórico', icon: History, path: '/admin/historico', group: '' },
];

const AdminMobileLayout: React.FC = () => {
  const { logout, session } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const isHome = location.pathname === '/admin';
  const current = useMemo(() => {
    return ALL_ITEMS
      .filter(i => location.pathname === i.path || (i.path !== '/admin' && location.pathname.startsWith(i.path)))
      .sort((a, b) => b.path.length - a.path.length)[0];
  }, [location.pathname]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ALL_ITEMS;
    return ALL_ITEMS.filter(i => i.label.toLowerCase().includes(q));
  }, [search]);

  const grouped = useMemo(() => {
    const map: Record<string, Item[]> = {};
    filtered.forEach(i => { (map[i.group] ||= []).push(i); });
    return map;
  }, [filtered]);

  const goAndClose = (path: string) => {
    setDrawerOpen(false);
    setSearch('');
    nav(path);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Topbar */}
      <header className="sticky top-0 z-40 bg-card border-b border-border flex items-center gap-2 px-3 h-14">
        {!isHome ? (
          <Button size="icon" variant="ghost" onClick={() => nav(-1)} aria-label="Voltar">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{current?.label || 'Admin'}</div>
          <div className="text-[10px] text-muted-foreground truncate">{session?.user?.email}</div>
        </div>
        <Button size="icon" variant="ghost" onClick={() => setDrawerOpen(true)} aria-label="Menu">
          <Menu className="w-6 h-6" />
        </Button>
      </header>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-[88%] max-w-sm bg-card border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="font-semibold text-sm">Menu Admin</span>
              <Button size="icon" variant="ghost" onClick={() => setDrawerOpen(false)}><X className="w-5 h-5" /></Button>
            </div>
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar módulo..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-11"
                  autoFocus
                />
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-4">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{group}</div>
                  <div className="space-y-1">
                    {items.map(it => (
                      <button
                        key={it.path}
                        onClick={() => goAndClose(it.path)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition',
                          location.pathname === it.path
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/40 text-foreground active:bg-muted',
                        )}
                      >
                        <it.icon className="w-5 h-5 shrink-0" />
                        <span className="flex-1">{it.label}</span>
                        <ChevronRight className="w-4 h-4 opacity-50" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-6">Nenhum módulo encontrado.</div>
              )}
            </nav>
            <div className="p-3 border-t border-border">
              <Button size="lg" variant="outline" className="w-full" onClick={async () => { await logout(); nav('/'); }}>
                <LogOut className="w-4 h-4 mr-2" /> Sair
              </Button>
            </div>
          </aside>
        </>
      )}

      {/* Conteúdo */}
      <main className="flex-1 p-3 pb-20">
        {isHome ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold">Olá 👋</h1>
              <p className="text-sm text-muted-foreground">Acesso rápido aos módulos</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar módulo, funcionário, empresa..."
                onFocus={() => setDrawerOpen(true)}
                className="pl-9 h-12"
                readOnly
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {HOME_QUICK.map(it => (
                <button
                  key={it.path}
                  onClick={() => nav(it.path)}
                  className="aspect-square rounded-2xl bg-card border border-border shadow-sm active:scale-95 transition flex flex-col items-center justify-center gap-2 p-3"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <it.icon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-center leading-tight">{it.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
};

export default AdminMobileLayout;
