import React,{useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Archive, Building2, ChevronDown, Search, Shirt, Users, X} from 'lucide-react';
import {useApp} from '@/context/AppContext';
import {supabase} from '@/integrations/supabase/client';
import {ADMIN_MODULE_GROUPS} from '@/data/adminModules';

const fmt=(n:number)=>new Intl.NumberFormat('pt-BR').format(n);

const AdminHomeCards:React.FC=()=>{
  const nav=useNavigate();
  const {employees,companies,session}=useApp();
  const [query,setQuery]=useState('');
  const [openGroups,setOpenGroups]=useState<string[]>(['frequentes']);
  const [stockAlert,setStockAlert]=useState<number|null>(null);
  const [uniformQuantity,setUniformQuantity]=useState<number|null>(null);
  const firstName=String(session?.user?.user_metadata?.nome_completo||
    session?.user?.user_metadata?.full_name||session?.user?.email?.split('@')[0]||'Administrador').trim().split(/\s+/)[0];
  const active=employees.filter(e=>e.status==='ativo').length;

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
  const groups=useMemo(()=>ADMIN_MODULE_GROUPS.map(group=>({
    ...group,items:group.items.filter(item=>(item.label+' '+item.description+' '+group.title)
      .toLocaleLowerCase('pt-BR').includes(normalized)),
  })).filter(group=>group.items.length),[normalized]);

  const go=(path:string)=>nav(path,{state:{openMobileModule:true}});
  const toggle=(id:string)=>setOpenGroups(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);
  const metrics=[
    {label:'Funcionários ativos',value:fmt(active),path:'/admin/funcionarios',icon:Users,detail:'Consultar pessoas'},
    {label:'Empresas',value:fmt(companies.length),path:'/admin/empresas',icon:Building2,detail:'Consultar unidades'},
    {label:'Estoque em atenção',value:stockAlert===null?'—':fmt(stockAlert),path:'/admin/estoque-interno',icon:Archive,detail:'Precisam de reposição'},
    {label:'Peças de uniformes',value:uniformQuantity===null?'—':fmt(uniformQuantity),path:'/admin/uniformes',icon:Shirt,detail:'Total entre unidades'},
  ] as const;

  return <div className="mx-auto w-full max-w-[1480px] space-y-5 pb-10 text-zinc-100">
    <header className="rounded-2xl border border-violet-500/20 bg-[linear-gradient(115deg,#171022,#080b11_68%)] p-5 md:p-7">
      <div className="text-[10px] font-bold uppercase tracking-[.2em] text-violet-300">TOPAC RH PRO • Central administrativa</div>
      <h1 className="mt-2 text-2xl font-black md:text-3xl">Olá, {firstName}</h1>
      <p className="mt-2 text-sm text-zinc-400">Os mesmos acessos no computador e no celular. Selecione um card para entrar no módulo.</p>
    </header>
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Indicadores da empresa">
      {metrics.map(card=>{
        const Icon=card.icon;
        return <button key={card.label} type="button" onClick={()=>go(card.path)}
          className="min-h-[108px] rounded-xl border border-[#30283a] bg-[#0d1017] p-4 text-left transition hover:border-violet-400 active:scale-[.99]">
          <div className="flex items-start justify-between gap-2"><span className="text-xs text-zinc-400">{card.label}</span><Icon className="h-5 w-5 shrink-0 text-violet-300"/></div>
          <div className="mt-2 text-2xl font-black text-white md:text-3xl">{card.value}</div>
          <div className="mt-2 text-[11px] text-zinc-500">{card.detail}</div>
        </button>;
      })}
    </section>
    <label className="flex h-12 items-center gap-3 rounded-xl border border-[#40304c] bg-[#0d1017] px-4 text-sm focus-within:border-violet-400">
      <Search className="h-5 w-5 text-violet-400"/>
      <input value={query} onChange={e=>setQuery(e.target.value)}
        placeholder="Buscar um módulo: VR, VT, uniformes, estoque, férias..."
        aria-label="Buscar módulo administrativo" className="w-full min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-zinc-500"/>
      {query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpar busca"><X className="h-4 w-4"/></button>}
    </label>
    {groups.map(group=>{
      const expanded=normalized.length>0||openGroups.includes(group.id);
      return <section key={group.id} className="overflow-hidden rounded-2xl border border-[#30283a] bg-[#0b0d14]">
        <button type="button" aria-expanded={expanded} onClick={()=>toggle(group.id)}
          className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-violet-500/10 md:px-5">
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black text-white md:text-lg">{group.title}</span>
            <span className="mt-1 block text-xs text-zinc-500">{group.subtitle}</span>
          </span>
          <span className="rounded-lg border border-violet-500/20 px-2 py-1 text-xs text-violet-300">{group.items.length}</span>
          <ChevronDown className={`h-5 w-5 text-violet-300 transition-transform ${expanded?'rotate-180':''}`}/>
        </button>
        {expanded&&<div className="grid grid-cols-2 gap-3 border-t border-[#30283a] p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:p-4">
          {group.items.map(item=>{
            const Icon=item.icon;
            return <button key={item.path} type="button" onClick={()=>go(item.path)}
              className="flex min-h-[112px] flex-col items-start justify-between rounded-xl border border-[#30283a] bg-[#10121b] p-4 text-left transition hover:border-violet-400 hover:bg-[#241a32] active:scale-[.99]">
              <Icon className="h-6 w-6 text-violet-300"/>
              <span><span className="block text-sm font-bold text-white">{item.label}</span>
                <span className="mt-1 block text-[11px] leading-4 text-zinc-400">{item.description}</span></span>
            </button>;
          })}
        </div>}
      </section>;
    })}
    {!groups.length&&<div className="rounded-xl border border-[#30283a] p-6 text-center text-sm text-zinc-400">Nenhum módulo encontrado. Tente outro termo.</div>}
  </div>;
};
export default AdminHomeCards;
