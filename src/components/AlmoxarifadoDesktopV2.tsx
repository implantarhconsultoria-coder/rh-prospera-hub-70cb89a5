import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownToLine, ArrowLeft, Box, Car, CheckCircle2, ClipboardList,
  FileSignature, FileText, History, Loader2, Package, Plus, Search, Settings, ShoppingCart,
  Trash2, Upload, UserRoundCog, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import AlmoxarifadoExcelImporter from '@/components/AlmoxarifadoExcelImporter';

const db = supabase as any;
const ROXO = '#6D28D9';
const ROXO_ESCURO = '#4C1D95';
const fmt = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const money = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (v: unknown) => v ? new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

type Mode = 'home'|'entrada'|'saida'|'carro'|'mecanico'|'estoque'|'relatorios'|'assinatura'|'config';
type CartRow = { item_id: string; quantidade: number; nome: string; codigo: string };

function ActionCard({ icon: Icon, title, subtitle, tone, onClick }: any) {
  const tones: any = {
    green: 'border-emerald-200 bg-emerald-50/80 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50/80 text-blue-700',
    orange: 'border-amber-200 bg-amber-50/80 text-amber-700',
    purple: 'border-violet-200 bg-violet-50/80 text-violet-700',
  };
  return <button onClick={onClick} className={`min-h-[120px] rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${tones[tone]}`}>
    <div className="flex items-start justify-between gap-4"><span className="grid h-12 w-12 place-items-center rounded-xl bg-white/75 shadow-sm"><Icon className="h-7 w-7"/></span><span className="text-2xl opacity-60">›</span></div>
    <div className="mt-4 text-lg font-black text-slate-950">{title}</div><div className="mt-1 text-sm opacity-80">{subtitle}</div>
  </button>;
}

function Stat({ icon: Icon, label, value, danger=false }: any) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${danger?'bg-red-50 text-red-500':'bg-violet-50 text-violet-700'}`}><Icon className="h-5 w-5"/></span><div><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div><div className={`text-2xl font-black ${danger?'text-red-600':'text-slate-950'}`}>{value}</div></div></div></div>;
}

const AlmoxarifadoDesktopV2: React.FC = () => {
  const { session, employees, companies } = useApp();
  const [mode,setMode] = useState<Mode>('home');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [stock,setStock] = useState<any[]>([]);
  const [entries,setEntries] = useState<any[]>([]);
  const [exits,setExits] = useState<any[]>([]);
  const [alerts,setAlerts] = useState<any[]>([]);
  const [loads,setLoads] = useState<any[]>([]);
  const [links,setLinks] = useState<any[]>([]);
  const [assets,setAssets] = useState<any[]>([]);
  const [search,setSearch] = useState('');
  const [selectedPerson,setSelectedPerson] = useState('');
  const [selectedItem,setSelectedItem] = useState('');
  const [qty,setQty] = useState('1');
  const [cart,setCart] = useState<CartRow[]>([]);
  const [obs,setObs] = useState('');
  const [entItem,setEntItem] = useState(''); const [entQty,setEntQty] = useState(''); const [entSupplier,setEntSupplier] = useState('');
  const [entNf,setEntNf] = useState(''); const [entValue,setEntValue] = useState(''); const [entFile,setEntFile] = useState<File|null>(null);

  const activeEmployees = useMemo(() => [...employees].filter((e:any)=>e.status==='ativo'||e.ativo===true).sort((a:any,b:any)=>String(a.name||a.nome).localeCompare(String(b.name||b.nome),'pt-BR')), [employees]);
  const employeeName=(e:any)=>e.name||e.nome||'';
  const employeeCompany=(e:any)=>companies.find((c:any)=>c.id===(e.companyId||e.company_id||e.empresa_id))?.name || 'Empresa não informada';
  const person = activeEmployees.find((e:any)=>e.id===selectedPerson);
  const vehicleLink = links.find((l:any)=>l.funcionario_id===selectedPerson && l.status==='ativo');
  const vehicle = assets.find((a:any)=>a.id===vehicleLink?.ativo_id);

  const fetchData = async () => {
    setLoading(true);
    const [s,e,x,a,c,l,v] = await Promise.all([
      db.from('almoxarifado_estoque_resumo').select('*').eq('ativo',true),
      db.from('almoxarifado_entradas').select('*').order('data_entrada',{ascending:false}).limit(150),
      db.from('almoxarifado_saidas').select('*').order('data_saida',{ascending:false}).limit(150),
      db.from('almoxarifado_compras_priorizadas').select('*').not('prioridade','is',null),
      db.from('almoxarifado_cargas').select('*').order('created_at',{ascending:false}).limit(150),
      db.from('mecanico_veiculo_vinculos').select('funcionario_id,ativo_id,status'),
      db.from('ativos').select('id,descricao,placa,marca,modelo,status').eq('status','ativo'),
    ]);
    if (s.error) toast.error(`Estoque: ${s.error.message}`); else setStock((s.data||[]).sort((a:any,b:any)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR')));
    if (!e.error) setEntries(e.data||[]); if(!x.error)setExits(x.data||[]); if(!a.error)setAlerts(a.data||[]); if(!c.error)setLoads(c.data||[]); if(!l.error)setLinks(l.data||[]); if(!v.error)setAssets(v.data||[]);
    setLoading(false);
  };
  useEffect(()=>{void fetchData();},[]);

  const filteredStock=useMemo(()=>{const q=search.trim().toLowerCase(); return !q?stock:stock.filter((i:any)=>[i.codigo_topac,i.codigo_alternativo,i.nome,i.aplicacao].some(v=>String(v||'').toLowerCase().includes(q)));},[stock,search]);
  const itemMap=useMemo(()=>new Map(stock.map((i:any)=>[i.id,i])),[stock]);
  const lowStock=useMemo(()=>alerts.filter((a:any)=>a.prioridade).sort((a:any,b:any)=>String(a.nome).localeCompare(String(b.nome),'pt-BR')),[alerts]);
  const recent=useMemo(()=>[
    ...entries.slice(0,8).map((r:any)=>({type:'Entrada',when:r.data_entrada,who:r.fornecedor||r.responsavel_nome,qty:r.quantidade,item:itemMap.get(r.item_id)})),
    ...exits.slice(0,8).map((r:any)=>({type:'Saída',when:r.data_saida,who:r.funcionario_nome||r.mecanico_nome,qty:-Number(r.quantidade||0),item:itemMap.get(r.item_id)})),
  ].sort((a:any,b:any)=>String(b.when||'').localeCompare(String(a.when||''))).slice(0,8),[entries,exits,itemMap]);

  const addCart=()=>{const i=itemMap.get(selectedItem); const q=Number(qty); if(!i||q<=0)return toast.error('Selecione o material e a quantidade.'); if(q>Number(i.saldo||0))return toast.error('Quantidade maior que o saldo disponível.'); setCart(v=>{const found=v.find(x=>x.item_id===i.id); if(found)return v.map(x=>x.item_id===i.id?{...x,quantidade:x.quantidade+q}:x); return [...v,{item_id:i.id,quantidade:q,nome:i.nome,codigo:i.codigo_topac}];}); setSelectedItem('');setQty('1');};

  const saveLoad=async(type:'retirada'|'carro'|'mecanico')=>{if(!selectedPerson)return toast.error('Selecione quem vai receber.'); if(!cart.length)return toast.error('Adicione os materiais.'); setBusy(true); try{
    const {data,error}=await db.rpc('almoxarifado_criar_carga_v2',{p_tipo:type,p_funcionario_id:selectedPerson,p_veiculo:type==='carro'?(vehicle?.descricao||[vehicle?.marca,vehicle?.modelo].filter(Boolean).join(' ')):null,p_placa:type==='carro'?vehicle?.placa:null,p_itens:cart.map(x=>({item_id:x.item_id,quantidade:x.quantidade})),p_observacoes:obs||null});
    if(error)throw error; toast.success(`Protocolo ${data?.protocolo||''} criado e estoque baixado.`); setCart([]);setObs('');setSelectedPerson('');await fetchData();setMode('assinatura');
  }catch(err:any){toast.error(err?.message||'Não foi possível registrar a saída.');}finally{setBusy(false);}};

  const saveEntry=async()=>{const q=Number(entQty); const value=Number(entValue||0); if(!entItem||q<=0)return toast.error('Selecione item e quantidade.'); setBusy(true); try{let url=''; if(entFile){const path=`almoxarifado/nf/${Date.now()}-${entFile.name}`; const up=await supabase.storage.from('documentos-ativos').upload(path,entFile);if(up.error)throw up.error;url=supabase.storage.from('documentos-ativos').getPublicUrl(path).data.publicUrl;}
    const {error}=await db.from('almoxarifado_entradas').insert({user_id:session?.user?.id,item_id:entItem,quantidade:q,fornecedor:entSupplier||null,valor_unitario:value,valor_total:q*value,nota_fiscal:entNf||null,nota_fiscal_url:url||null,data_entrada:new Date().toISOString().slice(0,10),responsavel_nome:session?.user?.email||'Almoxarifado',hora_informada:true}); if(error)throw error;toast.success('Entrada registrada. Estoque atualizado.');setEntQty('');setEntSupplier('');setEntNf('');setEntValue('');setEntFile(null);await fetchData();setMode('home');
  }catch(err:any){toast.error(err?.message||'Erro ao registrar entrada.');}finally{setBusy(false);}};

  const signLoad=async(row:any)=>{const signer=window.prompt('Nome de quem está assinando o protocolo:',row.funcionario_nome||'');if(!signer)return;const {error}=await db.rpc('almoxarifado_assinar_carga_v2',{p_carga_id:row.id,p_nome:signer});if(error)return toast.error(error.message);toast.success('Protocolo assinado e enviado ao histórico do funcionário.');await fetchData();};

  if(loading)return <div className="grid min-h-[480px] place-items-center bg-[#F7F8FC]"><div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin"/>Carregando Almoxarifado...</div></div>;

  const personOptions=(mode==='carro'?activeEmployees.filter((e:any)=>{const n=employeeName(e).toUpperCase();return n!=='GR'&&!n.includes('LEONEL')&&links.some((l:any)=>l.funcionario_id===e.id&&l.status==='ativo');}):activeEmployees);
  const Back=()=>mode==='home'?null:<button onClick={()=>{setMode('home');setCart([]);setSearch('')}} className="mb-4 flex items-center gap-2 text-sm font-bold text-violet-700"><ArrowLeft className="h-4 w-4"/>Voltar ao painel</button>;

  const OperationPanel=({type,title}:any)=><div className="space-y-5"><Back/><div><h2 className="text-2xl font-black text-slate-950">{title}</h2><p className="text-sm text-slate-500">Selecione o recebedor, pesquise os materiais e monte o protocolo.</p></div><div className="grid gap-4 xl:grid-cols-[360px_1fr]"><div className="rounded-2xl border bg-white p-5 shadow-sm"><label className="text-xs font-bold uppercase text-slate-500">Quem vai receber</label><select value={selectedPerson} onChange={e=>setSelectedPerson(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Pesquisar / selecionar...</option>{personOptions.map((e:any)=><option key={e.id} value={e.id}>{employeeName(e)} — {employeeCompany(e)}</option>)}</select>{type==='carro'&&person&&<div className="mt-3 rounded-xl bg-violet-50 p-3 text-sm"><b>{vehicle?.descricao||[vehicle?.marca,vehicle?.modelo].filter(Boolean).join(' ')||'Veículo não vinculado'}</b><div className="text-violet-700">{vehicle?.placa||'Sem placa cadastrada'}</div></div>}<Textarea value={obs} onChange={e=>setObs(e.target.value)} placeholder="Observação do protocolo" className="mt-4"/></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="grid gap-2 md:grid-cols-[1fr_140px_auto]"><select value={selectedItem} onChange={e=>setSelectedItem(e.target.value)} className="h-11 rounded-xl border bg-white px-3 text-sm"><option value="">Material / código...</option>{stock.map((i:any)=><option key={i.id} value={i.id}>{i.nome} — {i.codigo_topac} — saldo {fmt(i.saldo)}</option>)}</select><Input type="number" min="0.01" step="any" value={qty} onChange={e=>setQty(e.target.value)}/><Button onClick={addCart} style={{background:ROXO}}><Plus className="mr-1 h-4 w-4"/>Adicionar</Button></div><div className="mt-4 divide-y rounded-xl border">{cart.length===0?<div className="p-8 text-center text-sm text-slate-400">Nenhum material adicionado.</div>:cart.map(x=><div key={x.item_id} className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><b className="block truncate text-sm">{x.nome}</b><span className="text-xs text-slate-500">{x.codigo} • Qtd. {fmt(x.quantidade)}</span></div><button onClick={()=>setCart(v=>v.filter(y=>y.item_id!==x.item_id))} className="text-red-500"><Trash2 className="h-4 w-4"/></button></div>)}</div><Button className="mt-4 w-full" style={{background:ROXO}} disabled={busy||!cart.length} onClick={()=>saveLoad(type)}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<ClipboardList className="mr-2 h-4 w-4"/>}Gerar protocolo e baixar estoque</Button></div></div></div>;

  return <div className="min-h-screen bg-[#F7F8FC] text-slate-900"><div className="mx-auto w-full max-w-[1780px] px-5 py-6 lg:px-8">
    {mode==='home'&&<><div className="mb-6 flex items-end justify-between gap-4"><div><div className="text-sm font-bold text-violet-700">TOPAC RH PRO • ALMOXARIFADO</div><h1 className="mt-1 text-3xl font-black tracking-tight">Olá, Almoxarifado</h1><p className="mt-1 text-slate-500">O que vamos fazer hoje?</p></div><div className="hidden text-right lg:block"><div className="text-xs text-slate-400">Base oficial importada</div><div className="text-sm font-bold">Estoque central TOPAC</div></div></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><ActionCard icon={FileText} title="Entrada por Nota" subtitle="Importar ou registrar nota fiscal" tone="green" onClick={()=>setMode('entrada')}/><ActionCard icon={ArrowDownToLine} title="Saída / Retirada" subtitle="Material para consumo" tone="blue" onClick={()=>setMode('saida')}/><ActionCard icon={Car} title="Carga para Carro" subtitle="Motoristas do aplicativo" tone="orange" onClick={()=>setMode('carro')}/><ActionCard icon={Wrench} title="Carga para Mecânicos" subtitle="Matriz, filiais e empresas do grupo" tone="purple" onClick={()=>setMode('mecanico')}/></div>
    <button onClick={()=>setMode('assinatura')} className="mt-4 w-full rounded-2xl border border-violet-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-violet-100 text-violet-700"><FileSignature className="h-6 w-6"/></span><div><div className="font-black">ASSINATURA DIGITAL</div><div className="text-sm text-slate-500">Protocolos do Almoxarifado</div></div></div><div className="flex gap-8 text-right"><div><div className="text-xs text-slate-400">ASSINADOS</div><div className="text-2xl font-black text-emerald-600">{loads.filter((x:any)=>x.status_assinatura==='assinado').length}</div></div><div><div className="text-xs text-slate-400">PENDENTES</div><div className="text-2xl font-black text-amber-500">{loads.filter((x:any)=>x.status_assinatura!=='assinado').length}</div></div></div></div></button>
    <div className="mt-4 grid gap-4 md:grid-cols-2"><Stat icon={Box} label="Itens cadastrados" value={stock.length}/><Stat icon={AlertTriangle} label="Alertas de reposição" value={lowStock.length} danger/></div>
    <div className="mt-4 rounded-2xl border bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-black">Estoque Atual</h2><p className="text-xs text-slate-400">Ordenado alfabeticamente • código TOPAC preservado</p></div><div className="relative w-full lg:w-[520px]"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><Input value={search} onChange={e=>setSearch(e.target.value)} className="pl-9" placeholder="Pesquisar item, código ou aplicação..."/></div></div><div className="max-h-[520px] overflow-auto"><table className="w-full min-w-[980px] text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Código</th><th className="p-3">Descrição</th><th className="p-3">Aplicação</th><th className="p-3 text-right">Estoque</th><th className="p-3 text-right">Mínimo</th><th className="p-3">Status</th></tr></thead><tbody>{filteredStock.map((i:any)=><tr key={i.id} className="border-t hover:bg-violet-50/40"><td className="p-3 font-bold text-violet-700">{i.codigo_topac}</td><td className="p-3 font-semibold">{i.nome}</td><td className="p-3 text-slate-500">{i.aplicacao||'—'}</td><td className="p-3 text-right font-bold">{fmt(i.saldo)}</td><td className="p-3 text-right">{fmt(i.estoque_minimo)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${i.status_atual==='COMPRAR'?'bg-red-50 text-red-600':'bg-emerald-50 text-emerald-600'}`}>{i.status_atual}</span></td></tr>)}</tbody></table></div></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-2"><div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><b>Itens que precisam de reposição</b><button onClick={()=>setMode('estoque')} className="text-xs font-bold text-violet-700">Ver todos</button></div><div className="space-y-2">{lowStock.slice(0,6).map((a:any)=><div key={a.item_id} className="flex items-center gap-3 rounded-xl bg-red-50/60 p-3"><AlertTriangle className="h-5 w-5 text-red-500"/><div className="min-w-0 flex-1"><b className="block truncate text-sm">{a.nome}</b><span className="text-xs text-slate-500">Saldo {fmt(a.saldo)} • mínimo {fmt(a.estoque_minimo)}</span></div><span className="text-xs font-black text-red-600">{a.prioridade}</span></div>)}{!lowStock.length&&<div className="py-8 text-center text-sm text-slate-400">Nenhum alerta neste momento.</div>}</div></div><div className="rounded-2xl border bg-white p-4 shadow-sm"><b>Últimas movimentações</b><div className="mt-3 divide-y">{recent.map((r:any,i:number)=><div key={i} className="flex items-center gap-3 py-3"><span className={`grid h-9 w-9 place-items-center rounded-full ${r.type==='Entrada'?'bg-emerald-50 text-emerald-600':'bg-red-50 text-red-500'}`}>{r.type==='Entrada'?<Plus className="h-4 w-4"/>:<ArrowDownToLine className="h-4 w-4"/>}</span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{r.type} • {r.item?.nome||'Item'}</b><span className="text-xs text-slate-500">{date(r.when)} • {r.who||'—'}</span></div><b className={r.qty>=0?'text-emerald-600':'text-red-500'}>{r.qty>=0?'+':''}{fmt(r.qty)}</b></div>)}</div></div></div>
    <div className="mt-4 grid gap-3 md:grid-cols-4"><button onClick={()=>setMode('estoque')} className="rounded-xl border bg-white p-4 text-left"><Package className="mb-2 h-5 w-5 text-violet-700"/><b>Estoque / Códigos</b><div className="text-xs text-slate-500">Base completa</div></button><button onClick={()=>setMode('relatorios')} className="rounded-xl border bg-white p-4 text-left"><History className="mb-2 h-5 w-5 text-blue-600"/><b>Relatórios</b><div className="text-xs text-slate-500">Entradas e saídas</div></button><button onClick={()=>setMode('assinatura')} className="rounded-xl border bg-white p-4 text-left"><FileSignature className="mb-2 h-5 w-5 text-violet-700"/><b>Assinatura Digital</b><div className="text-xs text-slate-500">Protocolos</div></button><button onClick={()=>setMode('config')} className="rounded-xl border bg-white p-4 text-left"><Settings className="mb-2 h-5 w-5 text-slate-600"/><b>Configurações</b><div className="text-xs text-slate-500">Importação da planilha</div></button></div></>}

    {mode==='entrada'&&<div className="space-y-5"><Back/><div><h2 className="text-2xl font-black">Entrada por Nota</h2><p className="text-sm text-slate-500">A nota fica arquivada e a entrada alimenta o estoque.</p></div><div className="rounded-2xl border bg-white p-6 shadow-sm"><div className="grid gap-3 lg:grid-cols-3"><select value={entItem} onChange={e=>setEntItem(e.target.value)} className="h-11 rounded-xl border px-3 text-sm lg:col-span-2"><option value="">Material / código...</option>{stock.map((i:any)=><option key={i.id} value={i.id}>{i.nome} — {i.codigo_topac}</option>)}</select><Input type="number" placeholder="Quantidade" value={entQty} onChange={e=>setEntQty(e.target.value)}/><Input placeholder="Fornecedor" value={entSupplier} onChange={e=>setEntSupplier(e.target.value)}/><Input placeholder="Número da NF" value={entNf} onChange={e=>setEntNf(e.target.value)}/><Input type="number" step="any" placeholder="Valor unitário" value={entValue} onChange={e=>setEntValue(e.target.value)}/><label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 text-sm text-slate-500 lg:col-span-2"><Upload className="h-4 w-4"/>{entFile?.name||'Selecionar PDF da nota'}<input className="hidden" type="file" accept="application/pdf,image/*" onChange={e=>setEntFile(e.target.files?.[0]||null)}/></label><Button onClick={saveEntry} disabled={busy} style={{background:ROXO}}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Plus className="mr-2 h-4 w-4"/>}Registrar entrada</Button></div></div><div className="rounded-2xl border bg-white p-4"><b>Últimas entradas</b><div className="mt-3 max-h-[500px] overflow-auto">{entries.map((r:any)=><div key={r.id} className="grid grid-cols-[120px_1fr_100px_1fr] gap-3 border-t py-2 text-sm"><span>{date(r.data_entrada)}</span><span>{itemMap.get(r.item_id)?.nome||'Item'}</span><b>+ {fmt(r.quantidade)}</b><span className="text-slate-500">{r.fornecedor||r.responsavel_nome||'—'}</span></div>)}</div></div></div>}
    {mode==='saida'&&<OperationPanel type="retirada" title="Saída / Retirada"/>}
    {mode==='carro'&&<OperationPanel type="carro" title="Carga para Carro"/>}
    {mode==='mecanico'&&<OperationPanel type="mecanico" title="Carga para Mecânicos"/>}
    {mode==='estoque'&&<div><Back/><div className="rounded-2xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b p-4"><div><h2 className="text-xl font-black">Estoque e Códigos</h2><p className="text-xs text-slate-500">{stock.length} registros ativos</p></div><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar..." className="max-w-md"/></div><div className="max-h-[75vh] overflow-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{['Descrição','Código TOPAC','Segundo código','Aplicação','Saldo','Mínimo','Última entrada','Última saída','Status'].map(h=><th key={h} className="p-3 text-left text-xs uppercase text-slate-500">{h}</th>)}</tr></thead><tbody>{filteredStock.map((i:any)=><tr key={i.id} className="border-t"><td className="p-3 font-semibold">{i.nome}</td><td className="p-3 text-violet-700 font-bold">{i.codigo_topac}</td><td className="p-3">{i.codigo_alternativo||'—'}</td><td className="p-3">{i.aplicacao||'—'}</td><td className="p-3 font-bold">{fmt(i.saldo)}</td><td className="p-3">{fmt(i.estoque_minimo)}</td><td className="p-3">{date(i.ultima_entrada)}</td><td className="p-3">{date(i.ultima_saida)}</td><td className="p-3">{i.status_atual}</td></tr>)}</tbody></table></div></div></div>}
    {mode==='relatorios'&&<div><Back/><h2 className="mb-4 text-2xl font-black">Relatórios e Histórico</h2><div className="grid gap-4 xl:grid-cols-2"><div className="rounded-2xl border bg-white p-4"><b>Entradas</b><div className="mt-3 max-h-[650px] overflow-auto">{entries.map((r:any)=><div key={r.id} className="border-t py-2 text-sm"><b>{date(r.data_entrada)} • {itemMap.get(r.item_id)?.nome||'Item'}</b><div className="text-slate-500">Qtd. {fmt(r.quantidade)} • NF {r.nota_fiscal||'—'} • {r.fornecedor||'—'}</div></div>)}</div></div><div className="rounded-2xl border bg-white p-4"><b>Saídas</b><div className="mt-3 max-h-[650px] overflow-auto">{exits.map((r:any)=><div key={r.id} className="border-t py-2 text-sm"><b>{date(r.data_saida)} • {itemMap.get(r.item_id)?.nome||'Item'}</b><div className="text-slate-500">Qtd. {fmt(r.quantidade)} • {r.funcionario_nome||r.mecanico_nome||'—'}</div></div>)}</div></div></div></div>}
    {mode==='assinatura'&&<div><Back/><div className="mb-4"><h2 className="text-2xl font-black">Assinatura Digital • Almoxarifado</h2><p className="text-sm text-slate-500">O protocolo assinado também é registrado na documentação do funcionário.</p></div><div className="rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50"><tr>{['Protocolo','Data','Tipo','Funcionário','Veículo','Status','Ação'].map(h=><th key={h} className="p-3 text-left text-xs uppercase text-slate-500">{h}</th>)}</tr></thead><tbody>{loads.map((r:any)=><tr key={r.id} className="border-t"><td className="p-3 font-bold text-violet-700">{r.protocolo||'—'}</td><td className="p-3">{date(r.data_carga)}</td><td className="p-3 capitalize">{r.tipo||'mecânico'}</td><td className="p-3">{r.funcionario_nome}</td><td className="p-3">{[r.veiculo,r.placa].filter(Boolean).join(' • ')||'—'}</td><td className="p-3">{r.status_assinatura==='assinado'?<span className="inline-flex items-center gap-1 font-bold text-emerald-600"><CheckCircle2 className="h-4 w-4"/>Assinado</span>:<span className="font-bold text-amber-600">Pendente</span>}</td><td className="p-3">{r.status_assinatura!=='assinado'&&<Button size="sm" onClick={()=>signLoad(r)} style={{background:ROXO}}>Assinar</Button>}</td></tr>)}</tbody></table></div></div>}
    {mode==='config'&&<div className="space-y-4"><Back/><div><h2 className="text-2xl font-black">Configurações do Almoxarifado</h2><p className="text-sm text-slate-500">Carga inicial e manutenção da base oficial.</p></div><AlmoxarifadoExcelImporter companyCode="topac-matriz" companyName="Estoque Central TOPAC"/><div className="rounded-2xl border bg-white p-5"><div className="flex gap-3"><ShoppingCart className="h-5 w-5 text-violet-700"/><div><b>Regra de reposição</b><p className="text-sm text-slate-500">Os alertas são calculados pelo saldo, mínimo cadastrado e consumo histórico.</p></div></div></div></div>}
  </div></div>;
};
export default AlmoxarifadoDesktopV2;
