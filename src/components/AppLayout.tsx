import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
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
import {
  Archive, Search, RefreshCw, X, Building2, User, FileText,
  Bell, Moon, Menu, ChevronDown,
} from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';
import StableLoading from '@/components/StableLoading';
import ModuleSwitcher from '@/components/ModuleSwitcher';
import DirectorBlocked from '@/components/DirectorBlocked';
import { isDirectorRole, isDirectorRouteAllowed } from '@/lib/directorPermissions';
import { toast } from 'sonner';

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
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
      ['Dashboard', '/admin'], ['Empresas', '/admin/empresas'], ['Funcionários', '/admin/funcionarios'],
      ['Pré-cadastro admissional', '/admin/pre-cadastro-admissional'], ['ASO', '/admin/aso'],
      ['Fechamento', '/admin/fechamento'], ['EPI', '/admin/epi'],
      ['Frota / Documentos', '/admin/documentos-ativos'], ['Almoxarifado', '/admin/almoxarifado'],
      ['Abastecimento QR Code', '/admin/abastecimento-qrcode'], ['Assinatura Digital', '/admin/folha-pagamento'],
    ]
      .filter(([label, path]) => `${label} ${path}`.toLowerCase().includes(q))
      .map(([label, path]) => ({ label, subtitle: 'Módulo', path, icon: FileText }));

    const companyResults = companies
      .filter(c => `${c.name} ${c.cnpj} ${(c as any).codigo || ''}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map(c => ({ label: c.name, subtitle: `Empresa ${c.cnpj || ''}`, path: `/admin/empresas?empresa=${c.id}`, icon: Building2 }));

    const employeeResults = employees
      .filter(e => `${e.name} ${e.cpf} ${e.cargo} ${companies.find(c => c.id === e.companyId)?.name || ''} ${e.status}`.toLowerCase().includes(q))
      .slice(0, 12)
      .map(e => ({ label: e.name, subtitle: `${e.cpf || 'CPF pendente'} • ${companies.find(c => c.id === e.companyId)?.name || ''}`, path: `/admin/funcionarios/${e.id}`, icon: User }));

    return [...moduleResults, ...companyResults, ...employeeResults].slice(0, 20);
  }, [searchQuery, companies, employees]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  if (roleLoading) return <StableLoading label="Carregando permissão do usuário..." />;
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
  const displayName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || session?.user?.email || 'Administrador';
  const firstTwo = displayName.split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = firstTwo.map((part: string) => part.charAt(0).toUpperCase()).join('').slice(0, 2) || 'AD';

  const themeVars = {
    '--background': '225 38% 3%',
    '--foreground': '0 0% 96%',
    '--card': '225 28% 5%',
    '--card-foreground': '0 0% 96%',
    '--popover': '225 28% 5%',
    '--popover-foreground': '0 0% 96%',
    '--primary': '43 100% 50%',
    '--primary-foreground': '230 45% 4%',
    '--secondary': '269 35% 12%',
    '--secondary-foreground': '0 0% 95%',
    '--muted': '225 20% 10%',
    '--muted-foreground': '230 8% 58%',
    '--accent': '271 91% 60%',
    '--accent-foreground': '0 0% 100%',
    '--border': '270 35% 22%',
    '--input': '230 18% 16%',
    '--ring': '270 91% 60%',
  } as React.CSSProperties;

  return (
    <div style={themeVars} className="min-h-screen bg-[#020609] text-zinc-100">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />

      <main className={cn('min-h-screen transition-[margin] duration-300', collapsed ? 'ml-[72px]' : 'ml-[270px]')}>
        <header className="no-print sticky top-0 z-30 flex h-[62px] items-center border-b border-[#211c29] bg-[#030609]/95 px-5 backdrop-blur-xl">
          <button
            onClick={() => setCollapsed(v => !v)}
            className="mr-4 grid h-9 w-9 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
            aria-label="Alternar menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-[38px] w-[min(650px,48vw)] items-center gap-3 rounded-[7px] border border-[#2d2932] bg-[#07090d] px-4 text-left text-[12px] text-zinc-500 transition hover:border-[#5d3278]"
          >
            <Search className="h-4 w-4 text-zinc-500" />
            <span className="flex-1 truncate">Buscar funcionários, empresas, documentos...</span>
            <kbd className="rounded border border-[#2d2932] bg-[#0d0f13] px-2 py-0.5 text-[10px] text-zinc-500">Ctrl + K</kbd>
          </button>

          <div className="ml-auto flex h-full items-center gap-3">
            <button className="relative grid h-9 w-9 place-items-center rounded-full text-zinc-300 transition hover:bg-white/[0.04] hover:text-white" aria-label="Notificações">
              <Bell className="h-5 w-5" />
              <span className="absolute right-[2px] top-[1px] grid h-[16px] min-w-[16px] place-items-center rounded-full bg-[#7c2cff] px-1 text-[9px] font-bold text-white">8</span>
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-full text-zinc-300 transition hover:bg-white/[0.04] hover:text-white" aria-label="Tema escuro">
              <Moon className="h-[19px] w-[19px]" />
            </button>

            <div className="mx-1 h-8 w-px bg-[#25212a]" />

            <div className="flex items-center gap-3 pr-1">
              <div className="grid h-10 w-10 place-items-center rounded-full border border-[#7f2bc2] bg-[#17101e] text-[13px] font-semibold text-white">{initials}</div>
              <div className="hidden min-w-0 xl:block">
                <div className="max-w-[150px] truncate text-[12px] font-semibold text-white">{displayName}</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">{isDirector ? 'Diretor' : 'Administrador'}</div>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-zinc-500 xl:block" />
            </div>

            <div className="ml-2"><ModuleSwitcher /></div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Atualizar dados"
              className="grid h-9 w-9 place-items-center rounded-md border border-[#2b2532] bg-[#080a0e] text-zinc-400 transition hover:border-[#7c2cff] hover:text-[#b85cff] disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </button>

            {userRole === 'admin' && (
              <button
                onClick={() => setArchiveCoverOpen(true)}
                title="Capa para arquivar"
                className="grid h-9 w-9 place-items-center rounded-md border border-[#2b2532] bg-[#080a0e] text-zinc-400 transition hover:border-[#7c2cff] hover:text-[#b85cff]"
              >
                <Archive className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-[1680px] p-[18px]">
          {showEpiAlert && <EpiSemestralAlert />}
          <ErrorBoundary>{isDirector && !isDirectorRouteAllowed(location.pathname) ? <DirectorBlocked /> : <Outlet />}</ErrorBoundary>
        </div>
      </main>

      {searchOpen && (
        <div className="no-print fixed inset-0 z-[70] bg-black/78 backdrop-blur-sm" onClick={() => setSearchOpen(false)}>
          <div className="mx-auto mt-24 w-[min(760px,92vw)] overflow-hidden rounded-xl border border-[#5d287b] bg-[#06090d] shadow-[0_30px_110px_rgba(0,0,0,.78),0_0_60px_rgba(139,34,255,.12)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-[#28222f] p-4">
              <Search className="h-5 w-5 text-[#a742ff]" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && globalResults[0]) { navigate(globalResults[0].path); setSearchOpen(false); } }}
                placeholder="Buscar por nome, CPF, empresa, documento, status ou módulo..."
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
              />
              <button onClick={() => setSearchOpen(false)} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[56vh] overflow-y-auto p-2">
              {searchQuery && globalResults.length === 0 && <div className="p-8 text-center text-sm text-zinc-500">Nenhum registro encontrado.</div>}
              {!searchQuery && <div className="p-8 text-center text-sm text-zinc-500">Digite para localizar e pressione Enter para abrir o primeiro resultado.</div>}
              {globalResults.map((item) => (
                <button key={`${item.path}-${item.label}`} onClick={() => { navigate(item.path); setSearchOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-[#171021]">
                  <item.icon className="h-4 w-4 text-[#a742ff]" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-zinc-100">{item.label}</span>
                    <span className="block text-xs text-zinc-600">{item.subtitle}</span>
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
