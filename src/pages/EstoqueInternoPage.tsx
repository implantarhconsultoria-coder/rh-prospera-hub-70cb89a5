import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Archive, ArrowDownCircle, ArrowUpCircle, Download, FileText, History, Loader2, LogOut, Package, Plus, RefreshCw, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';

type StockItem = {
  id: string; codigo: number; descricao: string; aplicacao: string | null;
  unidade: string; saldo_atual: number; saldo_inicial: number;
  estoque_minimo: number | null; estoque_maximo: number | null;
};
type Movement = {
  id: string; item_id: string; tipo: 'entrada' | 'saida'; quantidade: number;
  data_movimento: string | null; destinatario: string | null; origem_responsavel: string | null;
  preco_unitario: number | null; observacao: string | null; ator_email: string | null;
  historico_importado: boolean; data_suspeita: boolean; linha_origem: number | null;
};
type Access = { nome: string; email: string; ativo: boolean; pode_movimentar: boolean; pode_gerenciar: boolean; };
type Tab = 'visao' | 'produtos' | 'entrada' | 'saida' | 'historico' | 'relatorios';
const TABS: Array<{key: Tab; label: string; icon: React.ElementType}> = [
  {key:'visao',label:'Visão geral',icon:Package},
  {key:'produtos',label:'Produtos',icon:Archive},
  {key:'entrada',label:'Entradas',icon:ArrowUpCircle},
  {key:'saida',label:'Saídas',icon:ArrowDownCircle},
  {key:'historico',label:'Histórico',icon:History},
  {key:'relatorios',label:'Relatórios',icon:FileText},
];
const db = supabase as any;
const brQty = (n: number) => Number(n || 0).toLocaleString('pt-BR', {maximumFractionDigits:3});
const brDate = (s: string | null) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data (planilha)';
const nowMonth = () => new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'}).slice(0,7);
const safeCsv = (x: unknown) => {
  const s = String(x ?? '');
  const guarded = /^[=+\-@]/.test(s.trim()) ? "'" + s : s;
  return '"' + guarded.replace(/"/g,'""') + '"';
};
const wrapBox = 'rounded-xl border border-[#30283a] bg-[#0d1017] p-4 md:p-5';
const inputStyle = 'h-10 w-full rounded-lg border border-[#3d3448] bg-[#080b10] px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-500';
const primaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#ffc400] px-4 text-sm font-bold text-black hover:bg-[#ffe082] disabled:cursor-not-allowed disabled:opacity-40';

export default function EstoqueInternoPage() {
  const { session, logout } = useApp();
  const location = useLocation();
  const standalone = location.pathname === '/estoque-interno';
  const email = (session?.user?.email || '').toLowerCase();
  const [access, setAccess] = useState<Access | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [items, setItems] = useState<StockItem[]>([]);
  const [moves, setMoves] = useState<Movement[]>([]);
  const [moveCount, setMoveCount] = useState(0);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<Tab>('visao');
  const [search, setSearch] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [quantity, setQuantity] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [productOpen, setProductOpen] = useState(false);
  const [newItem, setNewItem] = useState({codigo:'', descricao:'', unidade:'Unidade', aplicacao:'', minimo:'', maximo:''});
  const [month, setMonth] = useState(nowMonth());
  const [filterType, setFilterType] = useState('');
  const [filterItem, setFilterItem] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!email) {setInitializing(false); return;}
    if (!quiet) setInitializing(true);
    const a = await db.from('estoque_interno_acessos').select('nome,email,ativo,pode_movimentar,pode_gerenciar').eq('email',email).maybeSingle();
    if (a.error || !a.data?.ativo) {
      setAccess(null);setItems([]);setMoves([]);setInitializing(false);
      if (a.error) toast.error('Falha ao verificar a permissão: ' + a.error.message);
      return;
    }
    setAccess(a.data as Access);
    const r = await db.from('estoque_interno_itens')
      .select('id,codigo,descricao,aplicacao,unidade,saldo_atual,saldo_inicial,estoque_minimo,estoque_maximo')
      .order('codigo',{ascending:true});
    if (r.error) toast.error('Erro ao carregar o inventário: ' + r.error.message);
    else setItems((r.data || []) as StockItem[]);
    setInitializing(false);
  },[email]);

  const loadMoves = useCallback(async () => {
    if (!access) return;
    let q = db.from('estoque_interno_movimentos').select(
      'id,item_id,tipo,quantidade,data_movimento,destinatario,origem_responsavel,preco_unitario,observacao,ator_email,historico_importado,data_suspeita,linha_origem',
      {count:'exact'}
    );
    const activeType = tab === 'entrada' || tab === 'saida' ? tab : filterType;
    if (activeType) q=q.eq('tipo',activeType);
    if (filterItem) q=q.eq('item_id',filterItem);
    if (movementSearch.trim()) {
      const needle = movementSearch.toLocaleLowerCase('pt-BR').trim();
      const matchingIds = items.filter(i => (String(i.codigo)+' '+i.descricao+' '+(i.aplicacao||''))
        .toLocaleLowerCase('pt-BR').includes(needle)).map(i=>i.id);
      if (!matchingIds.length) {setMoves([]);setMoveCount(0);return;}
      q=q.in('item_id',matchingIds);
    }
    if (month) { const parts=month.split('-'); const nextMonth=new Date(Date.UTC(Number(parts[0]),Number(parts[1]),1)).toISOString().slice(0,10); q=q.gte('data_movimento',month+'-01').lt('data_movimento',nextMonth); }
    const r=await q.order('data_movimento',{ascending:false,nullsFirst:false})
      .order('linha_origem',{ascending:false,nullsFirst:false}).range(page*80,page*80+79);
    if (r.error) toast.error('Erro ao carregar movimentações: '+r.error.message);
    else {setMoves((r.data||[]) as Movement[]);setMoveCount(r.count||0);}
  },[access,filterType,filterItem,month,page,tab,movementSearch,items]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{void loadMoves();},[loadMoves]);

  const itemById=useMemo(()=>new Map(items.map(i=>[i.id,i])),[items]);
  const selected=items.find(i=>String(i.codigo)===code);
  const filtered=items.filter(i=>(String(i.codigo)+' '+i.descricao+' '+(i.aplicacao||''))
    .toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const attention=items.filter(i=>i.estoque_minimo!==null && Number(i.estoque_minimo)>=0 && Number(i.saldo_atual)<=Number(i.estoque_minimo));
  const totalQty=items.reduce((s,i)=>s+Number(i.saldo_atual||0),0);
  const isStockTab=tab==='entrada'||tab==='saida';
  const refresh=async()=>{setRefreshing(true);await load(true);await loadMoves();setRefreshing(false);};

  const submitMovement=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!access?.pode_movimentar||!selected) {toast.error('Selecione um produto');return;}
    const qty=Number(quantity.replace(',','.'));
    if(!Number.isFinite(qty)||qty<=0) {toast.error('Informe uma quantidade maior que zero');return;}
    if(tab==='saida'&&!destination.trim()){toast.error('Informe o destinatário');return;}
    setBusy(true);
    const r=await db.rpc('estoque_interno_movimentar',{
      p_codigo:selected.codigo,p_tipo:tab,p_quantidade:qty,
      p_destinatario:destination.trim()||null,p_observacao:notes.trim()||null,
      p_preco_unitario:tab==='entrada'&&unitCost ? Number(unitCost.replace(',','.')) : null
    });
    setBusy(false);
    if(r.error){toast.error(r.error.message);return;}
    toast.success((tab==='entrada'?'Entrada':'Saída')+' registrada e saldo atualizado');
    setQuantity('');setDestination('');setNotes('');setUnitCost('');
    await load(true);setPage(0);await loadMoves();
  };

  const submitItem=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);
    const r=await db.rpc('estoque_interno_cadastrar_item',{
      p_codigo:Number(newItem.codigo),p_descricao:newItem.descricao,
      p_unidade:newItem.unidade,p_aplicacao:newItem.aplicacao||null,
      p_minimo:newItem.minimo===''?null:Number(newItem.minimo.replace(',','.')),
      p_maximo:newItem.maximo===''?null:Number(newItem.maximo.replace(',','.'))
    });
    setBusy(false);
    if(r.error){toast.error(r.error.message);return;}
    toast.success('Produto cadastrado');setProductOpen(false);
    setNewItem({codigo:'',descricao:'',unidade:'Unidade',aplicacao:'',minimo:'',maximo:''});
    await load(true);
  };

  const downloadCSV=(onlyMoves=false)=>{
    const header=onlyMoves
      ? ['Data','Tipo','Código','Produto','Quantidade','Unidade','Destinatário','Responsável','Observação','Origem']
      : ['Código','Produto','Aplicação','Unidade','Saldo','Mínimo','Máximo','Situação'];
    const rows=onlyMoves
      ? moves.map(m=>{const it=itemById.get(m.item_id);return [m.data_movimento||'',m.tipo,it?.codigo||'',it?.descricao||'',m.quantidade,it?.unidade||'',m.destinatario||'',m.ator_email||m.origem_responsavel||'',m.observacao||'',m.historico_importado?'Histórico Excel':'Plataforma'];})
      : filtered.map(i=>[i.codigo,i.descricao,i.aplicacao||'',i.unidade,i.saldo_atual,i.estoque_minimo??'',i.estoque_maximo??'',attention.includes(i)?'REPOR':'DISPONÍVEL']);
    const csv='\ufeff'+[header,...rows].map(row=>row.map(safeCsv).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download=onlyMoves?'TOPAC_Estoque_Interno_Movimentacoes.csv':'TOPAC_Estoque_Interno_Posicao.csv';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const downloadPDF=()=>{
    const doc=new jsPDF({unit:'mm',format:'a4'});
    doc.setFontSize(17);doc.text('TOPAC RH PRO | ESTOQUE INTERNO',14,17);
    doc.setFontSize(10);doc.text('Escritório | Posição atual | '+new Date().toLocaleString('pt-BR'),14,25);
    doc.text('Produtos: '+items.length+'  |  Itens em atenção: '+attention.length+'  |  Quantidade total: '+brQty(totalQty),14,32);
    let y=42;doc.setFontSize(8);
    for(const it of filtered){
      if(y>280){doc.addPage();y=18;}
      doc.text(String(it.codigo).padStart(3,'0')+'  '+it.descricao.slice(0,53),14,y);
      doc.text('Saldo '+brQty(Number(it.saldo_atual))+' '+it.unidade,173,y,{align:'right'});
      y+=5.5;
    }
    doc.save('TOPAC_Estoque_Interno_Posicao.pdf');
  };

  if(initializing)return <div className="flex min-h-[70vh] items-center justify-center gap-2 bg-[#05070c] text-zinc-300"><Loader2 className="h-5 w-5 animate-spin"/> Carregando Estoque Interno...</div>;
  if(!access)return <main className="flex min-h-[70vh] items-center justify-center bg-[#05070c] p-4"><div className={wrapBox+' max-w-xl text-center'}><ShieldCheck className="mx-auto mb-4 h-10 w-10 text-violet-400"/><h1 className="text-2xl font-bold text-white">Acesso restrito ao escritório</h1><p className="mt-2 text-sm text-zinc-400">A conta {email||'atual'} não está autorizada para o Estoque Interno. Solicite acesso ao administrador da TOPAC.</p></div></main>;

  return <main className={(standalone?'min-h-screen ':'')+'bg-[#05070c] p-4 pb-12 text-white md:p-7'}>
    {standalone&&<header className="mx-auto mb-6 flex max-w-[1500px] items-center justify-between border-b border-[#332943] pb-5">
      <div><div className="text-xl font-black">TOPAC <span className="text-violet-400">RH PRO</span></div><div className="text-xs text-zinc-500">Ambiente do Escritório</div></div>
      <button onClick={()=>void logout()} className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white"><LogOut className="h-4 w-4"/> Sair</button>
    </header>}
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-[11px] font-bold uppercase tracking-[.18em] text-violet-400">TOPAC RH PRO • ESCRITÓRIO</div><h1 className="mt-1 text-3xl font-black">Estoque Interno</h1><p className="mt-1 text-sm text-zinc-500">Materiais administrativos • controle independente do almoxarifado operacional</p></div>
        <div className="flex items-center gap-3"><span className="rounded-lg border border-[#443050] px-3 py-2 text-xs text-zinc-300">{access.nome}</span><button onClick={()=>void refresh()} disabled={refreshing} className="rounded-lg border border-[#493552] p-2 hover:border-violet-400" title="Atualizar"><RefreshCw className={'h-5 w-5 '+(refreshing?'animate-spin':'')}/></button></div>
      </div>
      <div className="space-y-3">
        <nav aria-label="Acesso rápido ao estoque" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {TABS.filter(t=>t.key==='produtos'||t.key==='entrada'||t.key==='saida'||t.key==='historico').map(t=>{
            const Icon=t.icon;
            const hint=t.key==='produtos'?'Consultar e pesquisar materiais':t.key==='entrada'?'Registrar e consultar entradas':t.key==='saida'?'Registrar e consultar saídas':'Pesquisar movimentações';
            return <button key={t.key} type="button" aria-pressed={tab===t.key} onClick={()=>{setTab(t.key);setPage(0);}}
              className={'flex min-h-[102px] flex-col items-start justify-between rounded-xl border p-4 text-left transition hover:border-violet-400 '+(tab===t.key?'border-violet-500 bg-[#241a32]':'border-[#30283a] bg-[#0d1017]')}>
              <Icon className={'h-6 w-6 '+(tab===t.key?'text-[#ffc400]':'text-violet-400')}/>
              <div><div className="text-base font-bold text-white">{t.label}</div><div className="mt-1 text-xs text-zinc-400">{hint}</div></div>
            </button>;
          })}
        </nav>
        <div className="flex gap-2">
          {TABS.filter(t=>t.key==='visao'||t.key==='relatorios').map(t=>{const Icon=t.icon;return <button key={t.key} onClick={()=>{setTab(t.key);setPage(0);}} aria-pressed={tab===t.key} className={'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold '+(tab===t.key?'border-violet-500 bg-[#312048] text-[#ffc400]':'border-[#30283a] text-zinc-400 hover:text-white')}><Icon className="h-4 w-4"/>{t.label}</button>;})}
        </div>
      </div>
      {tab==='visao'&&<>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Produtos cadastrados',items.length,Package,'text-violet-400'],['Quantidade total',brQty(totalQty),Archive,'text-emerald-400'],['Precisam de reposição',attention.length,TriangleAlert,'text-amber-400'],['Sem saldo',items.filter(i=>Number(i.saldo_atual)===0).length,ArrowDownCircle,'text-red-400']].map(([title,val,Icon,color]:any)=><div key={title} className={wrapBox}><div className="text-xs text-zinc-400">{title}</div><div className="mt-3 flex items-center justify-between"><strong className="text-3xl">{val}</strong><Icon className={'h-7 w-7 '+color}/></div></div>)}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <section className={wrapBox}><h2 className="mb-3 text-lg font-bold">Estoque em atenção</h2><div className="max-h-[440px] overflow-y-auto">{attention.length?attention.slice(0,25).map(i=><button onClick={()=>{setCode(String(i.codigo));setTab('entrada');}} key={i.id} className="flex w-full items-center justify-between border-b border-[#29242e] py-3 text-left text-sm hover:text-[#ffc400]"><span><span className="mr-2 text-zinc-500">{i.codigo}</span>{i.descricao}</span><span className="ml-2 shrink-0 font-bold text-amber-400">{brQty(Number(i.saldo_atual))} {i.unidade}</span></button>):<p className="text-sm text-zinc-500">Nenhum item abaixo do mínimo informado.</p>}</div></section>
          <section className={wrapBox}><h2 className="mb-3 text-lg font-bold">Controle e rastreabilidade</h2><div className="space-y-3 text-sm text-zinc-300"><p>Inventário histórico importado e identificado como origem Excel.</p><p>Cada entrada e saída nova grava usuário autenticado, data, quantidade e saldo anterior e posterior.</p><p>As datas ausentes ou inconsistentes do arquivo original permanecem sinalizadas, sem data fabricada.</p><p>Este controle não altera os materiais, cargas ou saldos do almoxarifado dos mecânicos.</p></div><button onClick={()=>setTab('historico')} className="mt-4 text-sm font-bold text-violet-400 hover:underline">Abrir histórico completo →</button></section>
        </div>
      </>}
      {tab==='produtos'&&<section className={wrapBox}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Materiais do escritório</h2><div className="flex gap-2">{access.pode_gerenciar&&<button className={primaryButton} onClick={()=>setProductOpen(!productOpen)}><Plus className="h-4 w-4"/> Produto</button>}<button className="rounded-lg border border-[#44334f] px-4 text-sm hover:border-violet-500" onClick={()=>downloadCSV()}>Exportar CSV</button></div></div>
        {productOpen&&<form onSubmit={submitItem} className="mb-5 grid gap-3 rounded-xl border border-violet-500/40 p-4 md:grid-cols-3">
          <input required type="number" min="1" placeholder="Código" className={inputStyle} value={newItem.codigo} onChange={e=>setNewItem({...newItem,codigo:e.target.value})}/>
          <input required placeholder="Descrição" className={inputStyle} value={newItem.descricao} onChange={e=>setNewItem({...newItem,descricao:e.target.value})}/>
          <input placeholder="Unidade" className={inputStyle} value={newItem.unidade} onChange={e=>setNewItem({...newItem,unidade:e.target.value})}/>
          <input placeholder="Aplicação" className={inputStyle} value={newItem.aplicacao} onChange={e=>setNewItem({...newItem,aplicacao:e.target.value})}/>
          <input placeholder="Mínimo" type="number" className={inputStyle} value={newItem.minimo} onChange={e=>setNewItem({...newItem,minimo:e.target.value})}/>
          <input placeholder="Máximo" type="number" className={inputStyle} value={newItem.maximo} onChange={e=>setNewItem({...newItem,maximo:e.target.value})}/>
          <button disabled={busy} className={primaryButton}>Cadastrar produto</button>
        </form>}
        <div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500"/><input className={inputStyle+' pl-10'} placeholder="Código, material ou aplicação..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <p className="mb-3 text-xs text-zinc-500">{filtered.length} produto(s) encontrado(s)</p>
        <div className="overflow-x-auto rounded-lg border border-[#30283a]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#15121b] text-xs uppercase text-zinc-400"><tr>{['Código','Produto / aplicação','Unidade','Saldo','Mínimo','Máximo','Situação','Ações'].map(h=><th key={h} className="border-b border-[#352d3d] p-3">{h}</th>)}</tr></thead>
            <tbody>{filtered.map(i=>{
              const low=attention.includes(i),zero=Number(i.saldo_atual)===0;
              return <tr key={i.id} className="border-b border-[#241f29] hover:bg-white/[.03]">
                <td className="p-3 font-bold text-violet-400">{i.codigo}</td>
                <td className="p-3 font-semibold">{i.descricao}<div className="mt-1 text-xs font-normal text-zinc-500">{i.aplicacao||'Material do escritório'}</div></td>
                <td className="p-3 text-zinc-400">{i.unidade}</td>
                <td className={'p-3 font-black tabular-nums '+(zero?'text-red-400':low?'text-amber-400':'text-[#ffc400]')}>{brQty(Number(i.saldo_atual))}</td>
                <td className="p-3 text-zinc-400">{i.estoque_minimo??'—'}</td><td className="p-3 text-zinc-400">{i.estoque_maximo??'—'}</td>
                <td className={'p-3 font-semibold '+(zero?'text-red-400':low?'text-amber-400':'text-emerald-400')}>{zero?'SEM SALDO':low?'REPOR':'DISPONÍVEL'}</td>
                <td className="p-3"><div className="flex gap-3"><button onClick={()=>{setCode(String(i.codigo));setTab('entrada');}} className="text-xs font-bold text-emerald-400 hover:underline">Entrada</button><button disabled={zero} onClick={()=>{setCode(String(i.codigo));setTab('saida');}} className="text-xs font-bold text-amber-400 hover:underline disabled:opacity-30">Saída</button></div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {filtered.length===0&&<p className="py-8 text-center text-sm text-zinc-500">Nenhum material corresponde à busca.</p>}
      </section>}
      {isStockTab&&<section className={wrapBox+' max-w-3xl'}>
        <div className="mb-5 flex items-center gap-3">{tab==='entrada'?<ArrowUpCircle className="h-8 w-8 text-emerald-400"/>:<ArrowDownCircle className="h-8 w-8 text-amber-400"/>}<div><h2 className="text-xl font-bold">{tab==='entrada'?'Registrar entrada':'Registrar saída'}</h2><p className="text-xs text-zinc-500">Os saldos são atualizados pelo banco em uma única operação auditável.</p></div></div>
        <form onSubmit={submitMovement} className="grid gap-4">
          <label className="grid gap-1 text-xs text-zinc-400">Material
            <select required value={code} onChange={e=>setCode(e.target.value)} className={inputStyle}><option value="">Selecione pelo código ou descrição</option>{items.map(i=><option key={i.id} value={i.codigo}>{i.codigo} — {i.descricao}</option>)}</select>
          </label>
          {selected&&<div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-sm"><strong>{selected.descricao}</strong><div className="mt-1 text-zinc-300">Saldo disponível: <b className="text-[#ffc400]">{brQty(Number(selected.saldo_atual))} {selected.unidade}</b></div></div>}
          <label className="grid gap-1 text-xs text-zinc-400">Quantidade
            <input required type="number" step="any" min="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="0" className={inputStyle}/>
          </label>
          <label className="grid gap-1 text-xs text-zinc-400">{tab==='saida'?'Para quem foi entregue? *':'Fornecedor / origem (opcional)'}
            <input required={tab==='saida'} value={destination} onChange={e=>setDestination(e.target.value)} placeholder={tab==='saida'?'Nome do funcionário ou setor':'Compra, transferência, fornecedor...'} className={inputStyle}/>
          </label>
          {tab==='entrada'&&<label className="grid gap-1 text-xs text-zinc-400">Preço unitário (opcional)
            <input type="number" step="any" min="0" value={unitCost} onChange={e=>setUnitCost(e.target.value)} className={inputStyle}/>
          </label>}
          <label className="grid gap-1 text-xs text-zinc-400">Observação (opcional)
            <textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} className={inputStyle+' h-auto py-2'}/>
          </label>
          <button disabled={busy||!access.pode_movimentar} className={primaryButton}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}Confirmar {tab==='entrada'?'entrada':'saída'}</button>
        </form>
      </section>}
      {(isStockTab||tab==='historico'||tab==='relatorios')&&<section className={wrapBox}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{tab==='entrada'?'Lista de entradas':tab==='saida'?'Lista de saídas':tab==='historico'?'Histórico de movimentações':'Relatórios'}</h2><p className="text-xs text-zinc-500">{moveCount} registros nos filtros • 80 por página</p></div><div className="flex gap-2"><button className="rounded-lg border border-[#44334f] px-4 py-2 text-sm hover:border-violet-400" onClick={()=>downloadCSV(true)}><Download className="mr-2 inline h-4 w-4"/>CSV da página</button>{tab==='relatorios'&&<><button className="rounded-lg border border-[#44334f] px-4 py-2 text-sm" onClick={()=>downloadCSV()}>Estoque CSV</button><button className={primaryButton} onClick={downloadPDF}><FileText className="h-4 w-4"/>Estoque PDF</button></>}</div></div>
        <div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500"/><input aria-label="Pesquisar produto nas movimentações" className={inputStyle+' pl-10'} placeholder="Pesquisar produto pelo código, nome ou aplicação..." value={movementSearch} onChange={e=>{setMovementSearch(e.target.value);setPage(0);}}/></div>
        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <label className="text-xs text-zinc-400">Competência<input type="month" className={inputStyle+' mt-1'} value={month} onChange={e=>{setMonth(e.target.value);setPage(0);}}/></label>
          {!isStockTab&&<label className="text-xs text-zinc-400">Tipo<select className={inputStyle+' mt-1'} value={filterType} onChange={e=>{setFilterType(e.target.value);setPage(0);}}><option value="">Todos</option><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label>}
          <label className="text-xs text-zinc-400">Produto<select className={inputStyle+' mt-1'} value={filterItem} onChange={e=>{setFilterItem(e.target.value);setPage(0);}}><option value="">Todos</option>{items.map(i=><option key={i.id} value={i.id}>{i.codigo} — {i.descricao}</option>)}</select></label>
          <div className="flex items-end"><button className="h-10 rounded-lg border border-[#44334f] px-4 text-sm hover:border-violet-400" onClick={()=>{setMonth('');setFilterType('');setFilterItem('');setPage(0);}}>Todo o histórico</button></div>
        </div>
        <div className="overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-xs uppercase text-zinc-500"><tr>{['Data','Tipo','Código / Produto','Qtd.','Para quem / Origem','Responsável','Observações'].map(h=><th key={h} className="border-b border-[#352d3d] p-3">{h}</th>)}</tr></thead><tbody>{moves.map(m=>{const i=itemById.get(m.item_id);return <tr key={m.id} className="border-b border-[#251f2b]"><td className={'p-3 whitespace-nowrap '+(m.data_suspeita?'text-amber-400':'text-zinc-400')}>{brDate(m.data_movimento)}{m.data_suspeita&&<TriangleAlert className="ml-1 inline h-3 w-3"/>}</td><td className={'p-3 font-semibold '+(m.tipo==='entrada'?'text-emerald-400':'text-amber-400')}>{m.tipo.toUpperCase()}</td><td className="p-3"><span className="text-violet-400">{i?.codigo||'—'} </span>{i?.descricao||'Produto'}</td><td className="p-3">{brQty(Number(m.quantidade))}</td><td className="p-3">{m.destinatario||m.origem_responsavel||'—'}</td><td className="p-3 text-xs text-zinc-400">{m.historico_importado?'Histórico Excel':m.ator_email||'—'}</td><td className="p-3 text-xs text-zinc-400">{m.observacao||'—'}</td></tr>;})}</tbody></table></div>
        <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button className="rounded-lg border border-[#44334f] px-3 py-2 disabled:opacity-30" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page+1} / {Math.max(1,Math.ceil(moveCount/80))}</span><button className="rounded-lg border border-[#44334f] px-3 py-2 disabled:opacity-30" disabled={(page+1)*80>=moveCount} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
        {tab==='relatorios'&&<p className="mt-3 text-xs text-zinc-500">CSV de movimentações exporta os registros da página exibida. PDF e CSV de estoque exportam a posição atual dos materiais.</p>}
      </section>}
    </div>
  </main>;
}
