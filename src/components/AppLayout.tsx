import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import AdminMobileLayout from '@/components/AdminMobileLayout';
import AssistenteFab from '@/components/assistente/AssistenteFab';
import EmployeeSmartEditOverlay from '@/components/EmployeeSmartEditOverlay';
import EpiSemestralAlert from '@/components/EpiSemestralAlert';
import ArchiveCoverDialog from '@/components/ArchiveCoverDialog';
import FechamentoEtiquetasAddon from '@/components/FechamentoEtiquetasAddon';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Archive, Search, RefreshCw, Circle, X, Building2, User, FileText } from 'lucide-react';
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
  const [archiveCoverOpen, setArchiveCoverOpen] = useState(false);
  const { session, userRole, userRoles, roleLoading, companies, employees, refreshData, refreshEntries } = useApp();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();

  useActivityTracker(session);

  const isDirector = isDirectorRole(userRoles) && !userRoles.includes('admin');
  const legacyRemoved = location.pathname.startsWith('/admin/faturamento') || location.pathname.startsWith('/admin/financeiro');

  const globalResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const moduleResults = [
      ['Dashboard', '/admin'], ['Empresas', '/admin/empresas'], ['Funcionarios', '/admin/funcionarios'],
      ['Pre-cadastro admissional', '/admin/pre-cadastro-admissional'], ['ASO', '/admin/aso'],
      ['Fechamento', '/admin/fechamento'], ['EPI', '/admin/epi'],
      ['Frota / Documentos', '/admin/documentos-ativos'],
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

  if (roleLoading) return <StableLoading label="Carregando permissao do usuario..." />;
  if (!userRole) return <AguardandoAcesso />;
  if (legacyRemoved) return <Navigate to="/admin" replace />;

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

  if (userRole !== 'admin' && !isDirector) {
    const redirect = userRole?.startsWith('filial_') ? '/filial'
      : userRole === 'almoxarifado' ? '/almoxarifado'
      : userRole === 'operacional' ? '/operacional'
      : userRole === 'tecnico_campo' ? '/campo'
      : '/';
    return <Navigate to={redirect} replace />;
  }

  if (isMobile) return <ErrorBoundary><AdminMobileLayout /></ErrorBoundary>;

  const showEpiAlert = location.pathname === '/admin' || location.pathname === '/admin/diretoria';
  const themeVars = {
    '--background': '260 32% 4%',
    '--foreground': '0 0% 96%',
    '--card': '260 24% 7%',
    '--card-foreground': '0 0% 96%',
    '--popover': '260 24% 7%',
    '--popover-foreground': '0 0% 96%',
    '--primary': '48 96% 53%',
    '--primary-foreground': '260 40% 7%',
    '--secondary': '268 30% 13%',
    '--secondary-foreground': '0 0% 95%',
    '--muted': '265 20% 11%',
    '--muted-foreground': '260 8% 62%',
    '--accent': '267 83% 58%',
    '--accent-foreground': '0 0% 100%',
    '--border': '267 45% 23%',
    '--input': '267 45% 20%',
    '--ring': '48 96% 53%',
    '--sidebar-background': '260 35% 4%',
    '--sidebar-foreground': '0 0% 88%',
    '--sidebar-primary': '267 83% 58%',
    '--sidebar-primary-foreground': '0 0% 100%',
    '--sidebar-accent': '267 28% 12%',
    '--sidebar-accent-foreground': '0 0% 96%',
    '--sidebar-border': '267 45% 20%',
  } as React.CSSProperties;

  return (
    <div
      style={themeVars}
      className={cn(layoutMode === 'premium' && 'admin-command', 'min-h-screen bg-[#050507] text-zinc-100')}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_75%_-5%,rgba(124,58,237,.16),transparent_26%),radial-gradient(circle_at_25%_105%,rgba(250,204,21,.06),transparent_28%)]" />
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className={cn('relative min-h-screen transition-all duration-300', collapsed ? 'ml-16' : 'ml-64')}>
        <header className="no-print sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-violet-500/20 bg-[#07060a]/90 px-7 backdrop-blur-xl shadow-[0_14px_35px_rgba(0,0,0,.22)]">
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <Circle className="h-2 w-2 fill-yellow-300 text-yellow-300 shadow-[0_0_10px_rgba(253,224,71,.7)]" />
            <span className="font-semibold text-zinc-200">TOPAC RH PRO</span>
            <span className="text-violet-400/60">•</span>
            <span>central-rh</span>
            <span className="text-violet-400/60">•</span>
            <span>online</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <button onClick={() => setSearchOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-violet-500/15 bg-white/[0.025] px-3 py-2 text-zinc-300 transition hover:border-yellow-300/35 hover:text-yellow-300">
              <Search className="h-3.5 w-3.5" />Buscar
            </button>
            {userRole === 'admin' && (
              <button onClick={() => setArchiveCoverOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-violet-500/15 bg-white/[0.025] px-3 py-2 text-zinc-300 transition hover:border-yellow-300/35 hover:text-yellow-300">
                <Archive className="h-3.5 w-3.5" />Capa para arquivar
              </button>
            )}
            <button onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-violet-500/15 bg-white/[0.025] px-3 py-2 text-zinc-300 transition hover:border-yellow-300/35 hover:text-yellow-300 disabled:opacity-60">
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />Atualizar
            </button>
            <div className="ml-1 rounded-xl border border-violet-500/20 bg-violet-500/10 p-0.5"><ModuleSwitcher /></div>
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] p-7">
          {showEpiAlert && <EpiSemestralAlert />}
          <ErrorBoundary>{isDirector && !isDirectorRouteAllowed(location.pathname) ? <DirectorBlocked /> : <Outlet />}</ErrorBoundary>
        </div>
      </main>

      {searchOpen && (
        <div className="no-print fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm" onClick={() => setSearchOpen(false)}>
          <div className="mx-auto mt-24 w-[min(720px,92vw)] overflow-hidden rounded-2xl border border-violet-400/30 bg-[#0b0910] shadow-[0_30px_100px_rgba(0,0,0,.65),0_0_50px_rgba(124,58,237,.14)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-violet-500/20 p-4">
              <Search className="h-5 w-5 text-yellow-300" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && globalResults[0]) { navigate(globalResults[0].path); setSearchOpen(false); } }}
                placeholder="Buscar por nome, CPF, empresa, documento, status, modulo..."
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
              />
              <button onClick={() => setSearchOpen(false)} className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {searchQuery && globalResults.length === 0 && <div className="p-6 text-center text-sm text-zinc-500">Nenhum registro encontrado.</div>}
              {!searchQuery && <div className="p-6 text-center text-sm text-zinc-500">Digite para localizar e pressione Enter para abrir o primeiro resultado.</div>}
              {globalResults.map((item) => (
                <button key={`${item.path}-${item.label}`} onClick={() => { navigate(item.path); setSearchOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-violet-500/10">
                  <item.icon className="h-4 w-4 text-yellow-300" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-zinc-100">{item.label}</span>
                    <span className="block text-xs text-zinc-500">{item.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <FechamentoEtiquetasAddon />
      <ArchiveCoverDialog open={archiveCoverOpen} onOpenChange={setArchiveCoverOpen} />
      <EmployeeSmartEditOverlay />
      <AssistenteFab />
    </div>
  );
};

export default AppLayout;
