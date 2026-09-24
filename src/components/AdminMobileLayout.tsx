import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, ChevronDown, FileText, Home, Search, Wrench, Shirt, Archive, Package,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import VoiceCommandFab from '@/components/admin-mobile/VoiceCommandFab';
import AssistenteFab from '@/components/assistente/AssistenteFab';
import GlobalSearch, { SearchModule } from '@/components/admin-mobile/GlobalSearch';
import AdminHomeCards from '@/components/AdminHomeCards';
import AdminRequestNotifications from '@/components/admin-mobile/AdminRequestNotifications';
import DirectorBlocked from '@/components/DirectorBlocked';
import { isDirectorRole, isDirectorRouteAllowed } from '@/lib/directorPermissions';


type SearchItem = { label: string; path: string };

const SEARCH_ITEMS: SearchItem[] = [
  { label: 'Dashboard', path: '/admin' },
  { label: 'VR', path: '/admin/relatorio-vr' },
  { label: 'VT', path: '/admin/relatorio-vt' },
  { label: 'Funcionários', path: '/admin/funcionarios' },
  { label: 'Empresas', path: '/admin/empresas' },
  { label: 'Empresas', path: '/admin/empresas' },
  { label: 'Central da Contabilidade', path: '/admin/central-contabilidade' },
  { label: 'Pré-cadastro', path: '/admin/central-contabilidade?modulo=pre-cadastro' },
  { label: 'Rescisões', path: '/admin/central-contabilidade?modulo=rescisao' },
  { label: 'Solicitar Férias', path: '/admin/central-contabilidade?modulo=ferias' },
  { label: 'ASO', path: '/admin/central-contabilidade?modulo=aso' },
  { label: 'Envio para Clínicas', path: '/admin/central-contabilidade?modulo=clinicas' },
  { label: 'Ponto', path: '/admin/fechamento-ponto' },
  { label: 'Assinatura Digital / Holerites', path: '/admin/folha-pagamento' },
  { label: 'EPI', path: '/admin/epi' },
  { label: 'Uniformes / Estoque de Uniformes', path: '/admin/uniformes' },
  { label: 'Estoque Interno do Escritório', path: '/admin/estoque-interno' },
  { label: 'Tela da Equipe do Escritório', path: '/estoque-interno' },
  { label: 'Almoxarifado', path: '/admin/almoxarifado' },
  { label: 'Etiquetas', path: '/admin/etiquetas' },
  { label: 'Combustível', path: '/admin/galoes-combustivel' },
  { label: 'Rastreamento da Frota', path: '/admin/monitoramento' },
  { label: 'Prestadores', path: '/admin/prestadores' },
  { label: 'Histórico de Documentos', path: '/admin/historico' },
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
  const [moduleOpen,setModuleOpen] = useState(Boolean((location.state as any)?.openMobileModule));
  const isNativeCardModule = ['/admin/estoque-interno','/admin/uniformes','/admin/epi']
    .some(path=>location.pathname===path || location.pathname.startsWith(path+'/'));
  const moduleItem = [...SEARCH_ITEMS].filter(item=>item.path.startsWith('/admin/')
    && (location.pathname===item.path || location.pathname.startsWith(item.path+'/')))
    .sort((a,b)=>b.path.length-a.path.length)[0];
  const moduleLabel=moduleItem?.label||location.pathname.split('/').filter(Boolean).slice(1).join(' / ').replace(/-/g,' ')||'Módulo';
  const moduleKey=moduleItem?.path||location.pathname;
  const lastModule=useRef(moduleKey);
  useEffect(()=>{
    if(lastModule.current!==moduleKey){
      lastModule.current=moduleKey;
      setModuleOpen(Boolean((location.state as any)?.openMobileModule));
    }else if((location.state as any)?.openMobileModule){
      setModuleOpen(true);
    }
  },[moduleKey,location.key,location.state]);
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
    { label: 'Uniformes', icon: Shirt, path: '/admin/uniformes', active: location.pathname.startsWith('/admin/uniformes') },
    { label: 'Estoque', icon: Archive, path: '/admin/estoque-interno', active: location.pathname.startsWith('/admin/estoque-interno') },
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
          <Button size="icon" variant="ghost" className="rounded-full text-zinc-300 hover:bg-fuchsia-500/10 hover:text-white" onClick={() => nav('/admin')} aria-label="Voltar para o início">
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

      <main className={isHome ? 'pb-8' : 'px-3 pt-3 pb-32'}>
        {isHome ? (
          isDirector ? <Outlet /> : <div className="mobile-admin-home-shell"><div className="px-3 pt-[calc(18px+env(safe-area-inset-top))]"><AdminHomeCards /></div></div>
        ) : isNativeCardModule ? <Outlet /> : <div className="space-y-3">
          <button type="button" aria-expanded={moduleOpen} aria-controls="topac-mobile-module-content"
            onClick={()=>setModuleOpen(open=>!open)}
            className={`flex w-full min-h-[82px] items-center gap-3 rounded-xl border p-4 text-left transition active:scale-[.99] ${moduleOpen?'border-violet-500 bg-[#241a32]':'border-[#30283a] bg-[#0d1017]'}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-violet-500/30 bg-violet-500/10"><Package className="h-5 w-5 text-violet-300"/></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black capitalize text-white">{moduleLabel}</span>
              <span className="mt-1 block text-[11px] text-zinc-400">{moduleOpen?'Toque para fechar':'Toque para abrir as informações'}</span></span>
            <ChevronDown className={`h-5 w-5 shrink-0 text-violet-300 transition-transform ${moduleOpen?'rotate-180':''}`}/>
          </button>
          {moduleOpen&&<div id="topac-mobile-module-content" className="min-w-0"><Outlet /></div>}
        </div>}
      </main>

      {!isHome && (
        <nav className="fixed bottom-2 left-1/2 z-50 grid w-[calc(100%-16px)] max-w-xl -translate-x-1/2 grid-cols-6 rounded-[24px] border border-fuchsia-500/20 bg-[#090611]/94 px-1.5 pb-[calc(7px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_45px_rgba(0,0,0,.50),0_0_35px_rgba(168,85,247,.08)] backdrop-blur-xl">
          {bottomItems.map(item => (
            <button
              key={item.path}
              type="button"
              onClick={() => nav(item.path,{state:{openMobileModule:true}})}
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
