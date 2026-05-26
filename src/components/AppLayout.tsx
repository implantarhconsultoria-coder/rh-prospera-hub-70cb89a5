import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import AdminMobileLayout from '@/components/AdminMobileLayout';
import AssistenteFab from '@/components/assistente/AssistenteFab';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Search, RefreshCw, Circle, X, Building2, User, FileText } from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';
import StableLoading from '@/components/StableLoading';
import ModuleSwitcher from '@/components/ModuleSwitcher';
import DirectorBlocked from '@/components/DirectorBlocked';
import { isDirectorRole, isDirectorRouteAllowed } from '@/lib/directorPermissions';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem('topac_layout_mode') || 'premium');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { session, userRole, userRoles, roleLoading, companies, employees, refreshData, refreshEntries } = useApp();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();

  useActivityTracker(session);

  const isDirector = isDirectorRole(userRoles);

  const globalResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const moduleResults = [
      ['Dashboard', '/admin'], ['Empresas', '/admin/empresas'], ['Funcionarios', '/admin/funcionarios'],
      ['Pre-cadastro admissional', '/admin/pre-cadastro-admissional'], ['ASO', '/admin/aso'],
      ['Atestados', '/admin/atestados'], ['Fechamento', '/admin/fechamento'],
      ['Faturamento', '/admin/faturamento'], ['Importacao de dados', '/admin/faturamento/importacao-dados'],
      ['Financeiro', '/admin/financeiro'], ['Frota / Documentos', '/admin/documentos-ativos'],
      ['Almoxarifado', '/admin/almoxarifado'], ['Abastecimento QR Code', '/admin/abastecimento-qrcode'],
    ]
      .filter(([label, path]) => `${label} ${path}`.toLowerCase().includes(q))
      .map(([label, path]) => ({ label, subtitle: 'Modulo', path, icon: FileText }));

    const companyResults = companies
      .filter(c => `${c.name} ${c.cnpj} ${(c as any).codigo || ''}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map(c => ({ label: c.name, subtitle: `Empresa ${c.cnpj || ''}`, path: `/admin/empresas?empresa=${c.id}`, icon: Building2 }));

    const employeeResults = employees
      .filter(e => `${e.name} ${e.cpf} ${e.cargo} ${companies.find(c => c.id === e.companyId)?.name || ''} ${e.status}`.toLowerCase().includes(q))
      .slice(0, 12)
      .map(e => ({ label: e.name, subtitle: `${e.cpf || 'CPF pendente'} - ${companies.find(c => c.id === e.companyId)?.name || ''} - ${e.status}`, path: `/admin/funcionarios/${e.id}`, icon: User }));

    return [...moduleResults, ...companyResults, ...employeeResults].slice(0, 20);
  }, [searchQuery, companies, employees]);

  useEffect(() => {
    const syncLayout = () => setLayoutMode(localStorage.getItem('topac_layout_mode') || 'premium');
    window.addEventListener('storage', syncLayout);
    window.addEventListener('topac-layout-change', syncLayout);
    return () => {
      window.removeEventListener('storage', syncLayout);
      window.removeEventListener('topac-layout-change', syncLayout);
    };
  }, []);

  if (roleLoading) {
    return <StableLoading label="Carregando permissao do usuario..." />;
  }

  if (!userRole) return <AguardandoAcesso />;

  const handleRefresh = async () => {
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent('topac:refresh-current', { detail: { path: location.pathname } }));
    try {
      await Promise.all([refreshData(), refreshEntries()]);
      toast.success('Dados reais recarregados');
    } catch (error: any) {
      toast.error(`Erro ao atualizar: ${error?.message || 'tente novamente'}`);
    } finally {
      setRefreshing(false);
    }
  };

  // Only admin and diretor_geral can access central panel
  if (userRole !== 'admin' && !isDirector) {
    const redirect = userRole?.startsWith('filial_') ? '/filial'
      : userRole === 'almoxarifado' ? '/almoxarifado'
      : userRole === 'faturamento' ? '/faturamento'
      : userRole === 'financeiro' ? '/financeiro'
      : userRole === 'operacional' ? '/operacional'
      : userRole === 'tecnico_campo' ? '/campo'
      : '/';
    return <Navigate to={redirect} replace />;
  }

  if (isMobile) {
    return <ErrorBoundary><AdminMobileLayout /></ErrorBoundary>;
  }

  return (
    <div className={cn(layoutMode === 'premium' && 'admin-command', 'min-h-screen bg-background text-foreground')}>
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className={cn(
        "transition-all duration-300 min-h-screen",
        collapsed ? "ml-16" : "ml-64"
      )}>
        <header className="admin-command-topbar no-print">
          <div className="flex items-center gap-2 text-[11px] text-sky-200/80">
            <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
            <span>Nucleo TOPAC online</span>
            <span className="text-sky-400/50">.</span>
            <span>central-rh</span>
            <span className="text-sky-400/50">.</span>
            <span>v2.4.1</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-sky-100/80">
            <button onClick={() => setSearchOpen(true)} className="inline-flex items-center gap-2 hover:text-emerald-300">
              <Search className="h-3.5 w-3.5" />
              Buscar / executar
            </button>
            <button onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-2 hover:text-emerald-300 disabled:opacity-60">
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              Atualizar
            </button>
            <ModuleSwitcher />
          </div>
        </header>
        <div className="p-7 max-w-[1600px] mx-auto">
          <ErrorBoundary>
            {isDirector && !isDirectorRouteAllowed(location.pathname) ? <DirectorBlocked /> : <Outlet />}
          </ErrorBoundary>
        </div>
      </main>
      {searchOpen && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm no-print" onClick={() => setSearchOpen(false)}>
          <div className="mx-auto mt-24 w-[min(720px,92vw)] rounded-2xl border border-emerald-500/30 bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-border p-4">
              <Search className="h-5 w-5 text-primary" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && globalResults[0]) {
                    navigate(globalResults[0].path);
                    setSearchOpen(false);
                  }
                }}
                placeholder="Buscar por nome, CPF, empresa, documento, status, modulo..."
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <button onClick={() => setSearchOpen(false)} className="rounded-lg p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {searchQuery && globalResults.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</div>
              )}
              {!searchQuery && (
                <div className="p-6 text-center text-sm text-muted-foreground">Digite para localizar e pressione Enter para abrir o primeiro resultado.</div>
              )}
              {globalResults.map((item) => (
                <button
                  key={`${item.path}-${item.label}`}
                  onClick={() => { navigate(item.path); setSearchOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-muted"
                >
                  <item.icon className="h-4 w-4 text-primary" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block text-xs text-muted-foreground">{item.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <AssistenteFab />
    </div>
  );
};

export default AppLayout;
