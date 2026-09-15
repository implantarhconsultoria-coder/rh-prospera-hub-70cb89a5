import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, FileText, History, Home, Search, Wrench,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import VoiceCommandFab from '@/components/admin-mobile/VoiceCommandFab';
import AssistenteFab from '@/components/assistente/AssistenteFab';
import GlobalSearch, { SearchModule } from '@/components/admin-mobile/GlobalSearch';
import AdminMobileDashboard from '@/components/admin-mobile/AdminMobileDashboard';
import AdminRequestNotifications from '@/components/admin-mobile/AdminRequestNotifications';
import DirectorBlocked from '@/components/DirectorBlocked';
import { isDirectorRole, isDirectorRouteAllowed } from '@/lib/directorPermissions';

type SearchItem = { label: string; path: string };

const SEARCH_ITEMS: SearchItem[] = [
  { label: 'Dashboard', path: '/admin' },
  { label: 'Empresas', path: '/admin/empresas' },
  { label: 'Central da Contabilidade', path: '/admin/central-contabilidade' },
  { label: 'Pré-cadastro', path: '/admin/central-contabilidade?modulo=pre-cadastro' },
  { label: 'Rescisões', path: '/admin/central-contabilidade?modulo=rescisao' },
  { label: 'Solicitar Férias', path: '/admin/central-contabilidade?modulo=ferias' },
  { label: 'ASO', path: '/admin/central-contabilidade?modulo=aso' },
  { label: 'Envio para Clínicas', path: '/admin/central-contabilidade?modulo=clinicas' },
  { label: 'Fechamento', path: '/admin/central-contabilidade' },
  { label: 'Ponto', path: '/admin/fechamento-ponto' },
  { label: 'Assinatura Digital / Holerites', path: '/admin/folha-pagamento' },
  { label: 'EPI', path: '/admin/epi' },
  { label: 'Uniformes', path: '/admin/uniformes' },
  { label: 'Almoxarifado', path: '/admin/almoxarifado' },
  { label: 'Frota / Documentos', path: '/admin/documentos-ativos' },
  { label: 'Abastecimento', path: '/admin/abastecimento-qrcode' },
  { label: 'App Mecânicos', path: '/admin/app-mecanico' },
  { label: 'Operacional', path: '/admin/operacional' },
  { label: 'Relatórios', path: '/admin/relatorio' },
  { label: 'Compras', path: '/admin/compras' },
  { label: 'Histórico', path: '/admin/historico' },
];

const AdminMobileLayout: React.FC = () => {
  const { session, userRoles } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const isDirector = isDirectorRole(userRoles) && !userRoles.includes('admin');
  const isHome = location.pathname === '/admin';

  const searchModules: SearchModule[] = useMemo(
    () => SEARCH_ITEMS.map(item => ({ label: item.label, path: item.path })),
    [],
  );

  if (isDirector && !isDirectorRouteAllowed(location.pathname)) return <DirectorBlocked />;

  const bottomItems = [
    { label: 'Início', icon: Home, path: '/admin', active: location.pathname === '/admin' },
    { label: 'Empresas', icon: Building2, path: '/admin/empresas', active: location.pathname.startsWith('/admin/empresas') || location.pathname.startsWith('/admin/funcionarios') },
    { label: 'Documentos', icon: FileText, path: '/admin/folha-pagamento', active: location.pathname.startsWith('/admin/folha-pagamento') },
    { label: 'Operação', icon: Wrench, path: '/admin/app-mecanico', active: location.pathname.startsWith('/admin/app-mecanico') },
    { label: 'Histórico', icon: History, path: '/admin/historico', active: location.pathname.startsWith('/admin/historico') },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_-10%,rgba(168,85,247,.18),transparent_28%),radial-gradient(circle_at_100%_14%,rgba(59,130,246,.10),transparent_24%),#05030b] text-zinc-100">
      <style>{`
        .mobile-admin-home-shell > div > section:first-child > div:nth-child(2) {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .mobile-admin-home-shell > div > section:first-child > div:nth-child(2)::before {
          content: '';
          width: 28px;
          height: 28px;
          flex: 0 0 28px;
          border-radius: 7px;
          background: url('/icons/icon-192.png?v=20260524-2') center / cover no-repeat;
          box-shadow: 0 0 12px rgba(217,70,239,.22);
        }
      `}</style>

      {!isHome && (
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-fuchsia-500/15 bg-[#07040e]/94 px-3 backdrop-blur-xl">
          <Button size="icon" variant="ghost" className="rounded-full text-zinc-300 hover:bg-fuchsia-500/10 hover:text-white" onClick={() => nav(-1)} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-white">TOPAC RH PRO</div>
            <div className="truncate text-[10px] text-zinc-500">{session?.user?.email}</div>
          </div>
          <Button size="icon" variant="ghost" className="rounded-full text-zinc-300 hover:bg-fuchsia-500/10" onClick={() => setSearchOpen(true)} aria-label="Buscar">
            <Search className="h-5 w-5" />
          </Button>
          {!isDirector && <AdminRequestNotifications />}
        </header>
      )}

      <main className={isHome ? 'pb-8' : 'px-3 pt-3 pb-28'}>
        {isHome ? (
          isDirector ? <Outlet /> : <div className="mobile-admin-home-shell"><AdminMobileDashboard onSearch={() => setSearchOpen(true)} /></div>
        ) : <Outlet />}
      </main>

      {!isHome && (
        <nav className="fixed bottom-2 left-1/2 z-50 grid w-[calc(100%-16px)] max-w-lg -translate-x-1/2 grid-cols-5 rounded-[24px] border border-fuchsia-500/20 bg-[#090611]/94 px-1.5 pb-[calc(7px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_45px_rgba(0,0,0,.50),0_0_35px_rgba(168,85,247,.08)] backdrop-blur-xl">
          {bottomItems.map(item => (
            <button
              key={item.path}
              type="button"
              onClick={() => nav(item.path)}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-semibold transition active:scale-95 ${item.active ? 'text-fuchsia-300' : 'text-zinc-500'}`}
            >
              <item.icon className={`h-[22px] w-[22px] ${item.active ? 'drop-shadow-[0_0_8px_rgba(232,121,249,.75)]' : ''}`} />
              <span>{item.label}</span>
              {item.active && <span className="absolute bottom-0 h-[2px] w-7 rounded-full bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,.9)]" />}
            </button>
          ))}
        </nav>
      )}

      {isHome && (
        <div className="fixed right-3 top-[calc(12px+env(safe-area-inset-top))] z-40 flex items-center gap-1">
          <button onClick={() => setSearchOpen(true)} className="grid h-10 w-10 place-items-center rounded-full border border-fuchsia-500/20 bg-[#0b0712]/90 text-zinc-300 backdrop-blur-xl" aria-label="Buscar">
            <Search className="h-4.5 w-4.5" />
          </button>
          {!isDirector && <div className="rounded-full border border-fuchsia-500/20 bg-[#0b0712]/90 backdrop-blur-xl"><AdminRequestNotifications /></div>}
        </div>
      )}

      {!isHome && (
        <>
          <VoiceCommandFab />
          <AssistenteFab />
        </>
      )}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} query={searchQ} onQuery={setSearchQ} modules={searchModules} />
    </div>
  );
};

export default AdminMobileLayout;
