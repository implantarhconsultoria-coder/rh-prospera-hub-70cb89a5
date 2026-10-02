import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import AdminMobileLayout from '@/components/AdminMobileLayout';
import EmployeeSmartEditOverlay from '@/components/EmployeeSmartEditOverlay';
import EpiSemestralAlert from '@/components/EpiSemestralAlert';
import ArchiveCoverDialog from '@/components/ArchiveCoverDialog';
import FechamentoEtiquetasAddon from '@/components/FechamentoEtiquetasAddon';
import CabinetLabelsAddon from '@/components/CabinetLabelsAddon';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  Archive, Search, RefreshCw, X, Building2, User, FileText,
  Moon, Menu, ChevronDown, LayoutGrid,
} from 'lucide-react';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';
import StableLoading from '@/components/StableLoading';
import { ADMIN_MODULE_GROUPS } from '@/data/adminModules';
import AdminRequestNotifications from '@/components/admin-mobile/AdminRequestNotifications';
import DirectorBlocked from '@/components/DirectorBlocked';
import { isDirectorRole, isDirectorRouteAllowed } from '@/lib/directorPermissions';
import { toast } from 'sonner';
import { usePrivateModuleAccess } from '@/hooks/usePrivateModuleAccess';

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [archiveCoverOpen, setArchiveCoverOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moduleMenuQuery, setModuleMenuQuery] = useState('');
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const { session, userRole, userRoles, roleLoading, companies, employees, refreshData, refreshEntries } = useApp();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { allowed: canViewFrota } = usePrivateModuleAccess('frota_ipva');

  useActivityTracker(session);

  const isDirector = isDirectorRole(userRoles) && !userRoles.includes('admin');
  const legacyRemoved = location.pathname.startsWith('/admin/faturamento') || location.pathname.startsWith('/admin/financeiro');

  const globalResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const moduleResults = [
      ['Dashboard', '/admin'], ['Empresas', '/admin/empresas'], ['Funcionários', '/admin/funcionarios'],
      ['Pré-cadastro admissional', '/admin/pre-cadastro-admissional'], ['ASO', '/admin/aso'],
      ['Fechamento', '/admin/fechamento'], ['Ponto dos Mecânicos', '/admin/fechamento-ponto'], ['Apontamento Inteligente', '/admin/apontamento-inteligente'], ['VR', '/admin/relatorio-vr'], ['VT', '/admin/relatorio-vt'], ['Uniformes', '/admin/uniformes'], ['EPI', '/admin/epi'],
      ...(canViewFrota ? [['Frota / Documentos', '/admin/documentos-ativos']] : []), ['Almoxarifado', '/admin/almoxarifado'], ['Estoque Interno', '/admin/estoque-interno'],
      ['Relatório de Abastecimento', '/admin/abastecimento-qrcode'], ['Assinatura Digital', '/admin/folha-pagamento'],
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
  }, [searchQuery, companies, employees, canViewFrota]);

  const accessGroups = useMemo(() => {
    const q = moduleMenuQuery.trim().toLowerCase();
    return ADMIN_MODULE_GROUPS
      .map(group => ({
        ...group,
        items: group.items.filter(item => {
          if (!canViewFrota && ['/admin/documentos-ativos','/admin/monitoramento'].includes(item.path)) return false;
          if (isDirector && !isDirectorRouteAllowed(item.path)) return false;
          if (!q) return true;
          return `${item.label} ${item.description} ${item.path}`.toLowerCase().includes(q);
        }),
      }))
      .filter(group => group.items.length > 0);
  }, [moduleMenuQuery, canViewFrota, isDirector]);

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

  useEffect(() => {
    if (!userMenuOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false);
    };
    window.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeOnOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    document.body.classList.add('topac-neon-body');
    return () => document.body.classList.remove('topac-neon-body');
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

  if (isMobile) {
    return (
      <div className="topac-neon-skin min-h-screen bg-[#020609] text-zinc-100">
        <ErrorBoundary><AdminMobileLayout /></ErrorBoundary>
      </div>
    );
  }

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
    <div style={themeVars} className="topac-neon-skin min-h-screen bg-[#020609] text-zinc-100">
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
            {userRole === 'admin' && <AdminRequestNotifications />}
            <button className="grid h-9 w-9 place-items-center rounded-full text-zinc-300 transition hover:bg-white/[0.04] hover:text-white" aria-label="Tema escuro">
              <Moon className="h-[19px] w-[19px]" />
            </button>

            <div className="mx-1 h-8 w-px bg-[#25212a]" />

            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(open => !open)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-1.5 py-1 pr-2 transition hover:bg-white/[0.04]',
                  userMenuOpen && 'bg-white/[0.05]',
                )}
                aria-expanded={userMenuOpen}
                aria-label="Abrir acessos e módulos"
              >
                <div className="grid h-10 w-10 place-items-center rounded-full border border-[#7f2bc2] bg-[#17101e] text-[13px] font-semibold text-white">{initials}</div>
                <div className="hidden min-w-0 xl:block text-left">
                  <div className="max-w-[165px] truncate text-[12px] font-semibold text-white">{displayName}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">{isDirector ? 'Diretor' : 'Administrador'} · acessos</div>
                </div>
                <ChevronDown className={cn('hidden h-4 w-4 text-zinc-500 transition-transform xl:block', userMenuOpen && 'rotate-180')} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-[48px] z-[80] w-[min(820px,82vw)] overflow-hidden rounded-2xl border border-[#4d2a61] bg-[#06080d]/98 shadow-[0_28px_100px_rgba(0,0,0,.78),0_0_40px_rgba(126,34,206,.12)] backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-4 border-b border-white/[.06] p-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[.14em] text-fuchsia-400">Acessos rápidos</div>
                      <div className="mt-1 text-base font-black text-white">Portais e módulos da plataforma</div>
                      <div className="mt-1 text-[10px] text-zinc-500">Tudo concentrado na seta do administrador.</div>
                    </div>
                    <div className="relative w-[270px]">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                      <input
                        value={moduleMenuQuery}
                        onChange={event => setModuleMenuQuery(event.target.value)}
                        placeholder="Filtrar módulos..."
                        className="h-9 w-full rounded-lg border border-[#302637] bg-[#090b10] pl-9 pr-3 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-fuchsia-500/50"
                      />
                    </div>
                  </div>

                  <div className="max-h-[72vh] overflow-y-auto p-4">
                    {!moduleMenuQuery.trim() && (
                      <div className="mb-5">
                        <div className="mb-2 px-1 text-[9px] font-black uppercase tracking-[.14em] text-zinc-600">Portais</div>
                        <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
                          <button onClick={() => { navigate('/admin'); setUserMenuOpen(false); }} className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[.05] p-3 text-left transition hover:border-fuchsia-400/45 hover:bg-fuchsia-500/[.09]">
                            <LayoutGrid className="mb-2 h-4 w-4 text-fuchsia-400" />
                            <strong className="block text-xs text-white">Administração</strong>
                            <span className="mt-1 block text-[9px] text-zinc-600">Painel principal</span>
                          </button>
                          <button onClick={() => { sessionStorage.setItem('admin_filial_preview_codigo','topac-pg'); navigate('/filial'); setUserMenuOpen(false); }} className="rounded-xl border border-fuchsia-500/20 bg-[#0b0910] p-3 text-left transition hover:border-fuchsia-400/45">
                            <Building2 className="mb-2 h-4 w-4 text-fuchsia-400" />
                            <strong className="block text-xs text-white">Praia Grande</strong>
                            <span className="mt-1 block text-[9px] text-zinc-600">Portal da filial</span>
                          </button>
                          <button onClick={() => { sessionStorage.setItem('admin_filial_preview_codigo','topac-gyn'); navigate('/filial'); setUserMenuOpen(false); }} className="rounded-xl border border-fuchsia-500/20 bg-[#0b0910] p-3 text-left transition hover:border-fuchsia-400/45">
                            <Building2 className="mb-2 h-4 w-4 text-fuchsia-400" />
                            <strong className="block text-xs text-white">Goiânia</strong>
                            <span className="mt-1 block text-[9px] text-zinc-600">Portal da filial</span>
                          </button>
                          <button onClick={() => { navigate('/almoxarifado'); setUserMenuOpen(false); }} className="rounded-xl border border-fuchsia-500/20 bg-[#0b0910] p-3 text-left transition hover:border-fuchsia-400/45">
                            <Archive className="mb-2 h-4 w-4 text-fuchsia-400" />
                            <strong className="block text-xs text-white">Almoxarifado</strong>
                            <span className="mt-1 block text-[9px] text-zinc-600">Portal operacional</span>
                          </button>
                          <button onClick={() => { navigate('/operacional'); setUserMenuOpen(false); }} className="rounded-xl border border-fuchsia-500/20 bg-[#0b0910] p-3 text-left transition hover:border-fuchsia-400/45">
                            <FileText className="mb-2 h-4 w-4 text-fuchsia-400" />
                            <strong className="block text-xs text-white">Operacional</strong>
                            <span className="mt-1 block text-[9px] text-zinc-600">Portal compartilhado</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {accessGroups.map(group => (
                        <section key={group.id}>
                          <div className="mb-2 flex items-end justify-between gap-2 px-1">
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-[.12em] text-zinc-400">{group.title}</div>
                              <div className="mt-0.5 text-[9px] text-zinc-700">{group.subtitle}</div>
                            </div>
                            <div className="text-[9px] text-zinc-700">{group.items.length} acesso(s)</div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                            {group.items.map(item => {
                              const Icon = item.icon;
                              const active = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path + '/'));
                              return (
                                <button
                                  key={item.path}
                                  type="button"
                                  onClick={() => { navigate(item.path); setUserMenuOpen(false); setModuleMenuQuery(''); }}
                                  className={cn(
                                    'flex min-h-[66px] items-center gap-3 rounded-xl border p-3 text-left transition',
                                    active
                                      ? 'border-fuchsia-400/40 bg-fuchsia-500/[.09]'
                                      : 'border-white/[.06] bg-[#090b10] hover:border-fuchsia-500/25 hover:bg-fuchsia-500/[.04]',
                                  )}
                                >
                                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-fuchsia-500/15 bg-fuchsia-500/[.06] text-fuchsia-400">
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0">
                                    <strong className="block truncate text-[11px] text-white">{item.label}</strong>
                                    <span className="mt-0.5 block line-clamp-2 text-[9px] leading-relaxed text-zinc-600">{item.description}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                      {accessGroups.length === 0 && (
                        <div className="py-10 text-center text-xs text-zinc-600">Nenhum módulo encontrado para esse filtro.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

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
      <CabinetLabelsAddon />
      <ArchiveCoverDialog open={archiveCoverOpen} onOpenChange={setArchiveCoverOpen} />
      <EmployeeSmartEditOverlay />
    </div>
  );
};

export default AppLayout;
