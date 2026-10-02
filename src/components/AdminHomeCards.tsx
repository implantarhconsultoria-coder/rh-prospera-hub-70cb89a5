import React,{useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
  Archive, Building2, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList,
  FileText, HardHat, Package, ReceiptText, Search, Shirt, Users, WalletCards,
  Wrench, X,
} from 'lucide-react';
import {useApp} from '@/context/AppContext';
import {supabase} from '@/integrations/supabase/client';
import {ADMIN_MODULE_GROUPS} from '@/data/adminModules';
import FuncionariosMoneyOverview from '@/components/FuncionariosMoneyOverview';
import {usePrivateModuleAccess} from '@/hooks/usePrivateModuleAccess';

const fmt=(n:number)=>new Intl.NumberFormat('pt-BR').format(n);

type QuickCard = {
  label:string;
  detail:string;
  path:string;
  icon:React.ComponentType<{className?:string}>;
  badge?:string;
};

const AdminHomeCards:React.FC=()=>{
  const nav=useNavigate();
  const {employees,companies,session}=useApp();
  const [query,setQuery]=useState('');
  const [openGroups,setOpenGroups]=useState<string[]>(['frequentes']);
  const [stockAlert,setStockAlert]=useState<number|null>(null);
  const [uniformQuantity,setUniformQuantity]=useState<number|null>(null);
  const {allowed:canViewFrota}=usePrivateModuleAccess('frota_ipva');

  const displayName=String(
    session?.user?.user_metadata?.nome_completo||
    session?.user?.user_metadata?.full_name||
    session?.user?.user_metadata?.name||
    session?.user?.email?.split('@')[0]||
    'Administrador'
  ).trim();
  const firstName=displayName.split(/\s+/)[0]||'Administrador';
  const active=employees.filter(e=>e.status==='ativo').length;

  const hour=new Date().getHours();
  const greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
  const dateLabelRaw=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date());
  const dateLabel=dateLabelRaw.charAt(0).toUpperCase()+dateLabelRaw.slice(1);

  useEffect(()=>{
    let mounted=true;
    const load=async()=>{
      const [office,uniforms]=await Promise.all([
        (supabase.from as any)('estoque_interno_itens').select('saldo_atual,estoque_minimo'),
        (supabase.from as any)('uniforme_estoque').select('saldo'),
      ]);
      if(!mounted)return;
      if(!office.error)setStockAlert((office.data||[]).filter((x:any)=>x.estoque_minimo!==null&&Number(x.saldo_atual)<=Number(x.estoque_minimo)).length);
      if(!uniforms.error)setUniformQuantity((uniforms.data||[]).reduce((s:number,x:any)=>s+Number(x.saldo||0),0));
    };
    void load();
    return ()=>{mounted=false};
  },[]);

  const normalized=query.trim().toLocaleLowerCase('pt-BR');
  const featuredPaths = useMemo(() => new Set([
    '/admin/funcionarios',
    '/admin/empresas',
    '/admin/central-contabilidade',
    '/admin/fechamento-ponto',
    '/admin/folha-pagamento',
    '/admin/uniformes',
    '/admin/estoque-interno',
    '/admin/almoxarifado',
    '/admin/operacional',
  ]), []);

  const groups=useMemo(()=>ADMIN_MODULE_GROUPS.map(group=>({
    ...group,items:group.items.filter(item=>{
      const privateFleet=item.path==='/admin/documentos-ativos'||item.path==='/admin/monitoramento';
      if(privateFleet&&!canViewFrota)return false;
      if(featuredPaths.has(item.path)) return false;
      return (item.label+' '+item.description+' '+group.title).toLocaleLowerCase('pt-BR').includes(normalized);
    }),
  })).filter(group=>group.items.length),[normalized,canViewFrota,featuredPaths]);

  const go=(path:string)=>nav(path,{state:{openMobileModule:true}});
  const toggle=(id:string)=>setOpenGroups(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);

  const metrics=[
    {label:'Funcionários ativos',value:fmt(active),path:'/admin/funcionarios',icon:Users,detail:'Consultar pessoas'},
    {label:'Empresas',value:fmt(companies.length),path:'/admin/empresas',icon:Building2,detail:'Consultar unidades'},
    {label:'Estoque em atenção',value:stockAlert===null?'—':fmt(stockAlert),path:'/admin/estoque-interno',icon:Archive,detail:'Precisam de reposição'},
    {label:'Peças de uniformes',value:uniformQuantity===null?'—':fmt(uniformQuantity),path:'/admin/uniformes',icon:Shirt,detail:'Total entre unidades'},
  ] as const;

  const quick:QuickCard[]=[
    {label:'Funcionários',detail:'Cadastro, histórico e movimentações',path:'/admin/funcionarios',icon:Users},
    {label:'Central da Contabilidade',detail:'Folha, férias, rescisões e retornos',path:'/admin/central-contabilidade',icon:ClipboardList,badge:'FLUXO CENTRAL'},
    {label:'Ponto',detail:'Conferência e registros da jornada',path:'/admin/fechamento-ponto',icon:ClipboardCheck},
    {label:'Assinatura Digital',detail:'Holerites, recibos e pendências',path:'/admin/folha-pagamento',icon:ReceiptText},
    {label:'Uniformes',detail:'Estoque, entrega e impressão',path:'/admin/uniformes',icon:Shirt},
    {label:'Estoque Interno',detail:'Materiais e reposição do escritório',path:'/admin/estoque-interno',icon:Archive},
    {label:'Almoxarifado',detail:'Estoque operacional e movimentações',path:'/admin/almoxarifado',icon:Package},
    {label:'Operacional',detail:'Chamados, mecânicos e solicitações',path:'/admin/operacional',icon:Wrench},
  ];

  return <div className="mx-auto w-full max-w-[1480px] space-y-4 pb-6 text-zinc-100">
    <header className="pr-28 pt-1">
      <h1 className="truncate text-[27px] font-black leading-tight tracking-[-.035em] text-white">
        {greeting}, <span className="text-amber-400">{firstName}</span>
      </h1>
      <p className="mt-1.5 text-[12px] capitalize text-zinc-500">{dateLabel}</p>
    </header>

    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-white">
          <Wrench className="h-4 w-4 text-amber-400"/> CENTRAL ADMINISTRATIVA
        </h2>
        <span className="text-[9px] font-semibold uppercase tracking-[.14em] text-fuchsia-400">Operação</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {quick.map(card=>{
          const Icon=card.icon;
          return <button key={card.path} type="button" onClick={()=>go(card.path)}
            className="grid min-h-[108px] grid-cols-[42px_1fr_14px] items-center gap-2 rounded-xl border border-fuchsia-500/20 bg-[#07070d] p-2.5 text-left text-white transition active:scale-[.985]">
            <span className="grid h-11 w-11 place-items-center text-fuchsia-400">
              <Icon className="h-8 w-8 stroke-[1.45]"/>
            </span>
            <span className="min-w-0">
              <strong className="block text-[12px] font-bold leading-tight">{card.label}</strong>
              <span className="mt-1 block text-[9px] leading-snug text-zinc-400">{card.detail}</span>
              {card.badge&&<em className="mt-1.5 inline-flex rounded-md bg-fuchsia-500/15 px-1.5 py-0.5 text-[7px] not-italic font-bold text-fuchsia-300">{card.badge}</em>}
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-600"/>
          </button>;
        })}
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-fuchsia-500/20 bg-[#07070d]" aria-label="Resumo da empresa">
      <div className="flex items-center justify-between border-b border-fuchsia-500/10 px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-[12px] font-extrabold text-white">
          <ClipboardCheck className="h-4 w-4 text-fuchsia-400"/> RESUMO ADMINISTRATIVO
        </h2>
        <span className="text-[8px] text-zinc-500">Dados atuais</span>
      </div>
      <div className="grid grid-cols-2">
        {metrics.map((card,index)=>{
          const Icon=card.icon;
          return <button key={card.label} type="button" onClick={()=>go(card.path)}
            className={`grid min-h-[82px] grid-cols-[34px_1fr] items-center gap-2 px-3 py-2 text-left transition active:bg-fuchsia-500/5 ${index%2===0?'border-r border-fuchsia-500/10':''} ${index<2?'border-b border-fuchsia-500/10':''}`}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-fuchsia-500/10 text-fuchsia-400"><Icon className="h-4 w-4"/></span>
            <span className="min-w-0">
              <small className="block text-[9px] text-zinc-500">{card.label}</small>
              <strong className="mt-0.5 block truncate text-[15px] font-black text-amber-400">{card.value}</strong>
              <span className="block truncate text-[8px] text-zinc-600">{card.detail}</span>
            </span>
          </button>;
        })}
      </div>
    </section>

    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-[12px] font-extrabold text-white"><WalletCards className="h-4 w-4 text-amber-400"/> VALORES E BASE</h2>
        <span className="text-[8px] text-zinc-600">Mantidos no painel</span>
      </div>
      <FuncionariosMoneyOverview employees={employees} companies={companies}
        onCompanySelect={(companyId)=>go('/admin/funcionarios?empresa='+encodeURIComponent(companyId))}/>
    </section>

    <label className="flex h-12 items-center gap-3 rounded-xl border border-fuchsia-500/25 bg-[#07070d] px-4 text-sm focus-within:border-fuchsia-400">
      <Search className="h-5 w-5 text-fuchsia-400"/>
      <input value={query} onChange={e=>setQuery(e.target.value)}
        placeholder="Buscar módulo: VR, VT, férias, estoque..."
        aria-label="Buscar módulo administrativo" className="w-full min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-zinc-600"/>
      {query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpar busca"><X className="h-4 w-4"/></button>}
    </label>

    {groups.map(group=>{
      const expanded=normalized.length>0||openGroups.includes(group.id);
      return <section key={group.id} className="overflow-hidden rounded-xl border border-fuchsia-500/20 bg-[#07070d]">
        <button type="button" aria-expanded={expanded} onClick={()=>toggle(group.id)}
          className="flex min-h-[62px] w-full items-center gap-3 px-3 py-3 text-left transition active:bg-fuchsia-500/5">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black text-white">{group.title}</span>
            <span className="mt-1 block text-[9px] text-zinc-500">{group.subtitle}</span>
          </span>
          <span className="rounded-md bg-fuchsia-500/10 px-2 py-1 text-[9px] font-bold text-fuchsia-300">{group.items.length}</span>
          <ChevronDown className={`h-4 w-4 text-fuchsia-400 transition-transform ${expanded?'rotate-180':''}`}/>
        </button>
        {expanded&&<div className="grid grid-cols-2 gap-2 border-t border-fuchsia-500/10 p-2">
          {group.items.map(item=>{
            const Icon=item.icon;
            return <button key={item.path} type="button" onClick={()=>go(item.path)}
              className="flex min-h-[94px] flex-col items-start justify-between rounded-xl border border-fuchsia-500/15 bg-[#05050a] p-3 text-left transition active:scale-[.985]">
              <Icon className="h-5 w-5 text-fuchsia-400"/>
              <span><span className="block text-[11px] font-bold text-white">{item.label}</span>
                <span className="mt-1 block text-[8px] leading-3 text-zinc-500">{item.description}</span></span>
            </button>;
          })}
        </div>}
      </section>;
    })}

    {!groups.length&&<div className="rounded-xl border border-fuchsia-500/20 bg-[#07070d] p-6 text-center text-sm text-zinc-400">Nenhum módulo encontrado. Tente outro termo.</div>}
  </div>;
};

export default AdminHomeCards;
