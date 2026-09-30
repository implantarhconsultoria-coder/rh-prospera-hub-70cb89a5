import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Archive, Building2, ChevronDown, ClipboardList, FileText, Home,
  Menu, Package, Search, Settings, Shirt, Users, Wrench, X,
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
import { usePrivateModuleAccess } from '@/hooks/usePrivateModuleAccess';

type SearchItem = { label: string; path: string };

const SEARCH_ITEMS: SearchItem[] = [
  { label: 'Dashboard', path: '/admin' },
  { label: 'VR', path: '/admin/relatorio-vr' },
  { label: 'VT', path: '/admin/relatorio-vt' },
  { label: 'Funcionários', path: '/admin/funcionarios' },
  { label: 'Empresas', path: '/admin/empresas' },
  { label: 'Central da Contabilidade', path: '/admin/central-contabilidade' },
  { label: 'Apontamento Inteligente', path: '/admin/apontamento-inteligente' },
  { label: 'Fechamento', path: '/admin/fechamento' },
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
  const [moreOpen, setMoreOpen] = useState(false);
  const { allowed: canViewFrota } = usePrivateModuleAccess('frota_ipva');

  const [moduleOpen,setModuleOpen] = useState(Boolean((location.state as any)?.openMobileModule || location.pathname === '/admin/apontamento-inteligente'));
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
      setModuleOpen(Boolean((location.state as any)?.openMobileModule || location.pathname === '/admin/apontamento-inteligente'));
    }else if((location.state as any)?.openMobileModule || location.pathname === '/admin/apontamento-inteligente'){
      setModuleOpen(true);
    }
  },[moduleKey,location.key,location.state]);

  const isDirector = isDirectorRole(userRoles) && !userRoles.includes('admin');
  const isHome = location.pathname === '/admin';
  const isPeople = location.pathname.startsWith('/admin/funcionarios') || location.pathname.startsWith('/admin/empresas');
  const isAccounting = location.pathname.startsWith('/admin/central-contabilidade')
    || location.pathname.startsWith('/admin/apontamento-inteligente')
    || location.pathname.startsWith('/admin/fechamento');
  const isOperation = location.pathname.startsWith('/admin/operacional')
    || location.pathname.startsWith('/admin/app-mecanico')
    || location.pathname.startsWith('/admin/abastecimento-qrcode');

  const displayName=String(
    session?.user?.user_metadata?.nome_completo||
    session?.user?.user_metadata?.full_name||
    session?.user?.user_metadata?.name||
    session?.user?.email?.split('@')[0]||
    'Administrador'
  ).trim();
  const initials=displayName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('').slice(0,2)||'AD';

  const searchModules: SearchModule[] = useMemo(
    () => SEARCH_ITEMS
      .filter(item => canViewFrota || !['/admin/documentos-ativos','/admin/monitoramento'].includes(item.path))
      .map(item => ({ label: item.label, path: item.path })),
    [canViewFrota],
  );

  if (isDirector && !isDirectorRouteAllowed(location.pathname)) return <DirectorBlocked />;

  const go=(path:string)=> {
    setMoreOpen(false);
    nav(path,{state:{openMobileModule:true}});
  };

  const moreItems = [
    { label:'Empresas', detail:'Empresas e filiais', path:'/admin/empresas', icon:Building2 },
    { label:'Filial Praia Grande', detail:'Abrir portal da unidade', path:'/filial', icon:Building2, previewCodigo:'topac-pg' },
    { label:'Filial Goiânia', detail:'Abrir portal da unidade', path:'/filial', icon:Building2, previewCodigo:'topac-gyn' },
    { label:'Documentos', detail:'Holerites e assinaturas', path:'/admin/folha-pagamento', icon:FileText },
    { label:'Uniformes', detail:'Estoque e entrega', path:'/admin/uniformes', icon:Shirt },
    { label:'Estoque', detail:'Materiais internos', path:'/admin/estoque-interno', icon:Archive },
    { label:'App Mecânico', detail:'Gestão do aplicativo', path:'/admin/app-mecanico', icon:Wrench },
    { label:'Configurações', detail:'Preferências administrativas', path:'/admin/configuracoes', icon:Settings },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_84%_-7%,rgba(126,34,206,.14),transparent_30%),radial-gradient(circle_at_4%_30%,rgba(88,28,135,.07),transparent_28%),#030309] text-zinc-100">
      {!isHome && (
        <header className="sticky top-0 z-40 border-b border-fuchsia-500/15 bg-[#030309]/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="flex h-14 items-center gap-2 px-3">
            <Button size="icon" variant="ghost" className="rounded-full border border-fuchsia-500/20 bg-[#08080e] text-zinc-300 hover:bg-fuchsia-500/10 hover:text-white" onClick={() => nav('/admin')} aria-label="Voltar para o início">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-black text-white">{moduleLabel}</div>
              <div className="truncate text-[10px] text-zinc-500">TOPAC RH PRO • {displayName}</div>
            </div>
            <Button size="icon" variant="ghost" className="rounded-full border border-fuchsia-500/20 bg-[#08080e] text-zinc-300 hover:bg-fuchsia-500/10" onClick={() => setSearchOpen(true)} aria-label="Buscar">
              <Search className="h-5 w-5" />
            </Button>
            {!isDirector && <AdminRequestNotifications />}
          </div>
        </header>
      )}

      <main className={isHome ? 'pb-32' : 'px-3 pt-3 pb-32'}>
        {isHome ? (
          isDirector
            ? <Outlet />
            : <div className="mobile-admin-home-shell">
                <div className="px-3 pt-[calc(18px+env(safe-area-inset-top))]"><AdminHomeCards /></div>
              </div>
        ) : isNativeCardModule ? <Outlet /> : <div className="space-y-3">
          <button type="button" aria-expanded={moduleOpen} aria-controls="topac-mobile-module-content"
            onClick={()=>setModuleOpen(open=>!open)}
            className={`flex w-full min-h-[78px] items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[.99] ${moduleOpen?'border-fuchsia-500/40 bg-[#13091b]':'border-fuchsia-500/20 bg-[#07070d]'}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fuchsia-500/10 text-fuchsia-400"><Package className="h-5 w-5"/></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black capitalize text-white">{moduleLabel}</span>
              <span className="mt-1 block text-[10px] text-zinc-500">{moduleOpen?'Toque para recolher':'Toque para abrir as informações'}</span>
            </span>
            <ChevronDown className={`h-5 w-5 shrink-0 text-fuchsia-400 transition-transform ${moduleOpen?'rotate-180':''}`}/>
          </button>
          {moduleOpen&&<div id="topac-mobile-module-content" className="min-w-0"><Outlet /></div>}
        </div>}
      </main>

      {moreOpen && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/75 p-3 backdrop-blur-sm" onClick={()=>setMoreOpen(false)}>
          <div className="mx-auto w-full max-w-lg rounded-[24px] border border-fuchsia-500/25 bg-[#08080e] p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl" onClick={event=>event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-fuchsia-400">Mais opções</p>
                <h2 className="mt-1 text-lg font-black text-white">Administração</h2>
              </div>
              <button onClick={()=>setMoreOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-fuchsia-500/20 text-zinc-400" aria-label="Fechar">
                <X className="h-4 w-4"/>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {moreItems.map(item=>{
                const Icon=item.icon;
                return <button key={`${item.path}-${item.label}`} type="button" onClick={()=>{
                  if ('previewCodigo' in item && item.previewCodigo) {
                    sessionStorage.setItem('admin_filial_preview_codigo', item.previewCodigo);
                  }
                  go(item.path);
                }}
                  className="rounded-xl border border-fuchsia-500/15 bg-[#05050a] p-3 text-left text-white active:scale-[.985]">
                  <Icon className="mb-3 h-5 w-5 text-fuchsia-400"/>
                  <strong className="block text-sm">{item.label}</strong>
                  <span className="mt-1 block text-[10px] text-zinc-500">{item.detail}</span>
                </button>;
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-2 left-1/2 z-50 grid w-[calc(100%-18px)] max-w-lg -translate-x-1/2 grid-cols-5 items-end rounded-[24px] border border-fuchsia-500/20 bg-[#07070df5] px-1.5 pb-[calc(7px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_35px_rgba(0,0,0,.45)] backdrop-blur-xl">
        <button onClick={()=>go('/admin')} className={`flex min-h-14 flex-col items-center justify-end gap-1 text-[8px] ${isHome?'text-fuchsia-400':'text-zinc-500'}`}>
          <Home className="h-6 w-6"/><span>Início</span>
        </button>

        <button onClick={()=>go('/admin/funcionarios')} className={`flex min-h-14 flex-col items-center justify-end gap-1 text-[8px] ${isPeople?'text-fuchsia-400':'text-zinc-500'}`}>
          <Users className="h-6 w-6"/><span>Pessoas</span>
        </button>

        <button onClick={()=>go('/admin/central-contabilidade')} className={`relative -translate-y-1 flex min-h-16 flex-col items-center justify-end gap-0.5 text-[8px] ${isAccounting?'text-fuchsia-300':'text-zinc-200'}`}>
          <span className={`grid h-14 w-14 place-items-center rounded-full border bg-[radial-gradient(circle_at_45%_35%,#6d1da8,#1b0927_68%,#08070d)] shadow-[0_0_28px_rgba(168,85,247,.38)] ${isAccounting?'border-fuchsia-300':'border-fuchsia-400/80'}`}>
            <ClipboardList className="h-7 w-7"/>
          </span>
          <span>Contabilidade</span>
        </button>

        <button onClick={()=>go('/admin/operacional')} className={`flex min-h-14 flex-col items-center justify-end gap-1 text-[8px] ${isOperation?'text-fuchsia-400':'text-zinc-500'}`}>
          <Wrench className="h-6 w-6"/><span>Operação</span>
        </button>

        <button onClick={()=>setMoreOpen(true)} className="flex min-h-14 flex-col items-center justify-end gap-1 text-[8px] text-zinc-500">
          <Menu className="h-6 w-6"/><span>Mais</span>
        </button>
      </nav>

      {isHome && (
        <div className="fixed right-3 top-[calc(12px+env(safe-area-inset-top))] z-40 flex items-center gap-1.5">
          <button onClick={() => setSearchOpen(true)} className="grid h-10 w-10 place-items-center rounded-full border border-fuchsia-500/20 bg-[#08080e]/95 text-zinc-300 backdrop-blur-xl" aria-label="Buscar">
            <Search className="h-[18px] w-[18px]" />
          </button>
          {!isDirector && <div className="grid h-10 w-10 place-items-center rounded-full border border-fuchsia-500/20 bg-[#08080e]/95 backdrop-blur-xl"><AdminRequestNotifications /></div>}
          <div className="grid h-10 w-10 place-items-center rounded-full border border-fuchsia-500/55 bg-[#09070d] text-[11px] font-black text-white">{initials}</div>
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
