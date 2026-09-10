import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Package, Hash, Search, ShoppingCart, AlertTriangle, X, Loader2, FileText, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';

type Tab = 'entrada' | 'saida' | 'estoque' | 'codigos' | 'consulta' | 'compras';
type DrawerData = { kind: 'entrada' | 'saida' | 'estoque'; row: any } | null;
const db = supabase as any;
const PAGE_SIZE = 500;

const n = (v: any) => Number(v || 0);
const fmtNum = (v: any) => n(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtMoney = (v: any) => n(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (v: any) => v ? new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const fmtTime = (row: any) => row?.hora_informada === false ? 'Horário não informado na planilha' : row?.created_at ? new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
const sortCode = (a: any, b: any) => String(a.codigo_topac || '').localeCompare(String(b.codigo_topac || ''), 'pt-BR', { numeric: true });

const priorityClass: Record<string,string> = {
  'URGENTE': 'bg-red-500/15 text-red-500 border-red-500/30',
  'CRÍTICO': 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  'NO PRAZO': 'bg-amber-500/15 text-amber-500 border-amber-500/30',
};

const AlmoxarifadoPlanilhaView: React.FC = () => {
  const { session, employees } = useApp();
  const uid = session?.user?.id;
  const [tab, setTab] = useState<Tab>('entrada');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stock, setStock] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [exits, setExits] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [entryOffset, setEntryOffset] = useState(0);
  const [exitOffset, setExitOffset] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [drawer, setDrawer] = useState<DrawerData>(null);

  const [entItem, setEntItem] = useState(''); const [entQtd, setEntQtd] = useState(''); const [entFornecedor, setEntFornecedor] = useState('');
  const [entNf, setEntNf] = useState(''); const [entValor, setEntValor] = useState(''); const [entObs, setEntObs] = useState(''); const [entFile, setEntFile] = useState<File|null>(null);
  const [saiItem, setSaiItem] = useState(''); const [saiQtd, setSaiQtd] = useState(''); const [saiFunc, setSaiFunc] = useState('');
  const [saiPat, setSaiPat] = useState(''); const [saiFicha, setSaiFicha] = useState(''); const [saiSerie, setSaiSerie] = useState(''); const [saiMotivo, setSaiMotivo] = useState(''); const [saiObs, setSaiObs] = useState('');
  const [consultaItem, setConsultaItem] = useState<any>(null); const [consultaMeses, setConsultaMeses] = useState<any[]>([]); const [consultaIntel, setConsultaIntel] = useState<any>(null);

  const itemMap = useMemo(() => new Map(stock.map(i => [i.id, i])), [stock]);
  const activeEmployees = useMemo(() => [...employees].filter((e:any) => e.status === 'ativo').sort((a:any,b:any) => a.name.localeCompare(b.name,'pt-BR')), [employees]);

  const fetchBase = async () => {
    setLoading(true);
    const [s, e, x, p] = await Promise.all([
      db.from('almoxarifado_estoque_resumo').select('*').eq('ativo', true),
      db.from('almoxarifado_entradas').select('*').order('created_at', { ascending: false }).range(0, PAGE_SIZE - 1),
      db.from('almoxarifado_saidas').select('*').order('created_at', { ascending: false }).range(0, PAGE_SIZE - 1),
      db.from('almoxarifado_compras_priorizadas').select('*').not('prioridade', 'is', null),
    ]);
    if (s.error) toast.error(`Estoque: ${s.error.message}`); else setStock((s.data || []).sort(sortCode));
    if (!e.error) setEntries(e.data || []); if (!x.error) setExits(x.data || []);
    if (!p.error) setPurchases((p.data || []).sort((a:any,b:any) => ['URGENTE','CRÍTICO','NO PRAZO'].indexOf(a.prioridade)-['URGENTE','CRÍTICO','NO PRAZO'].indexOf(b.prioridade)));
    setEntryOffset(PAGE_SIZE); setExitOffset(PAGE_SIZE); setLoading(false);
  };
  useEffect(() => { fetchBase(); }, []);

  const loadMore = async (kind:'entrada'|'saida') => {
    if (kind === 'entrada') {
      const { data, error } = await db.from('almoxarifado_entradas').select('*').order('created_at',{ascending:false}).range(entryOffset, entryOffset+PAGE_SIZE-1);
      if (!error) { setEntries(v => [...v, ...(data||[])]); setEntryOffset(v => v+PAGE_SIZE); }
    } else {
      const { data, error } = await db.from('almoxarifado_saidas').select('*').order('created_at',{ascending:false}).range(exitOffset, exitOffset+PAGE_SIZE-1);
      if (!error) { setExits(v => [...v, ...(data||[])]); setExitOffset(v => v+PAGE_SIZE); }
    }
  };

  const refresh = async () => { await fetchBase(); };

  const handleEntrada = async () => {
    const qtd = n(entQtd); const valor = n(entValor); if (!uid || !entItem || qtd <= 0) return toast.error('Selecione o item e informe a quantidade.');
    setBusy(true);
    try {
      let nfUrl = '';
      if (entFile) {
        const path = `nf/${uid}/${Date.now()}-${entFile.name}`;
        const up = await supabase.storage.from('documentos-ativos').upload(path, entFile);
        if (up.error) throw up.error;
        nfUrl = supabase.storage.from('documentos-ativos').getPublicUrl(path).data.publicUrl;
      }
      const { error } = await db.from('almoxarifado_entradas').insert({ user_id: uid, item_id: entItem, quantidade: qtd, fornecedor: entFornecedor || null,
        valor_unitario: valor, valor_total: qtd*valor, nota_fiscal: entNf || null, nota_fiscal_url: nfUrl || null, observacao: entObs || null,
        data_entrada: new Date().toISOString().slice(0,10), responsavel_nome: session?.user?.email || 'Usuário', hora_informada: true });
      if (error) throw error;
      toast.success('Entrada registrada e saldo atualizado.'); setEntQtd(''); setEntFornecedor(''); setEntNf(''); setEntValor(''); setEntObs(''); setEntFile(null); await refresh();
    } catch (err:any) { toast.error(err?.message || 'Erro ao registrar entrada.'); } finally { setBusy(false); }
  };

  const handleSaida = async () => {
    const qtd = n(saiQtd); const item = itemMap.get(saiItem); const emp:any = activeEmployees.find((e:any) => e.id === saiFunc);
    if (!uid || !item || qtd <= 0 || !emp) return toast.error('Selecione item, quantidade e funcionário/mecânico.');
    if (qtd > n(item.saldo)) return toast.error('Estoque insuficiente.');
    setBusy(true);
    try {
      const { error } = await db.from('almoxarifado_saidas').insert({ user_id: uid, item_id: saiItem, quantidade: qtd, funcionario_id: emp.id,
        funcionario_nome: emp.name, mecanico_nome: emp.name, motivo: saiMotivo || 'Retirada de material', observacao: saiObs || null,
        patrimonio: saiPat || null, ficha: saiFicha || null, numero_serie: saiSerie || null, quantidade_entregue: qtd, quantidade_devolvida: 0,
        data_saida: new Date().toISOString().slice(0,10), responsavel_liberacao: session?.user?.email || 'Usuário', hora_informada: true });
      if (error) throw error;
      toast.success('Saída registrada e estoque baixado.'); setSaiQtd(''); setSaiFunc(''); setSaiPat(''); setSaiFicha(''); setSaiSerie(''); setSaiMotivo(''); setSaiObs(''); await refresh();
    } catch (err:any) { toast.error(err?.message || 'Erro ao registrar saída.'); } finally { setBusy(false); }
  };

  const openConsulta = async (item:any) => {
    setConsultaItem(item); setConsultaMeses([]); setConsultaIntel(null);
    const [m, i] = await Promise.all([
      db.from('almoxarifado_consumo_mensal').select('*').eq('item_id', item.id).order('ano',{ascending:true}).order('mes',{ascending:true}),
      db.from('almoxarifado_inteligencia').select('*').eq('item_id', item.id).maybeSingle(),
    ]);
    if (!m.error) setConsultaMeses(m.data || []); if (!i.error) setConsultaIntel(i.data || null);
  };

  const q = searchText.trim().toLowerCase();
  const filteredStock = useMemo(() => !q ? stock : stock.filter(i => [i.codigo_topac,i.codigo_alternativo,i.nome,i.aplicacao].some((v:any) => String(v||'').toLowerCase().includes(q))), [q,stock]);
  const filteredEntries = useMemo(() => !q ? entries : entries.filter(r => { const i=itemMap.get(r.item_id); return [i?.codigo_topac,i?.nome,r.fornecedor,r.responsavel_nome,r.nota_fiscal].some(v => String(v||'').toLowerCase().includes(q)); }), [q,entries,itemMap]);
  const filteredExits = useMemo(() => !q ? exits : exits.filter(r => { const i=itemMap.get(r.item_id); return [i?.codigo_topac,i?.nome,r.funcionario_nome,r.mecanico_nome,r.patrimonio,r.ficha].some(v => String(v||'').toLowerCase().includes(q)); }), [q,exits,itemMap]);
  const filteredPurchases = useMemo(() => !q ? purchases : purchases.filter(r => [r.codigo_topac,r.nome,r.aplicacao,r.prioridade].some((v:any) => String(v||'').toLowerCase().includes(q))), [q,purchases]);

  const tabs = [
    {key:'entrada' as Tab,label:'Entrada',icon:ArrowDown},{key:'saida' as Tab,label:'Saída',icon:ArrowUp},{key:'estoque' as Tab,label:'Estoque',icon:Package},
    {key:'codigos' as Tab,label:'Códigos',icon:Hash},{key:'consulta' as Tab,label:'Consulta',icon:Search},{key:'compras' as Tab,label:'Compras',icon:ShoppingCart},
  ];

  const TableShell: React.FC<{children:React.ReactNode}> = ({children}) => <div className="overflow-auto rounded-xl border bg-card">{children}</div>;
  const td = 'px-3 py-2.5 text-sm border-b border-border/50'; const th = 'px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground text-left border-b bg-muted/30';

  if (loading) return <div className="min-h-[320px] flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin"/>Carregando Almoxarifado...</div>;

  return <div className="space-y-4">
    <div className="card-premium p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center"><Package className="w-5 h-5 text-primary"/></div><div><h1 className="text-xl font-bold">Almoxarifado</h1><p className="text-sm text-muted-foreground">Entrada, saída, estoque, consulta e reposição com rastreabilidade.</p></div></div></div>

    <div className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5">
      {tabs.map(t => { const Icon=t.icon; return <button key={t.key} onClick={()=>{setTab(t.key);setSearchText('')}} className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${tab===t.key?'bg-primary text-primary-foreground':'hover:bg-muted text-muted-foreground'}`}><Icon className="w-4 h-4"/>{t.label}{t.key==='compras' && purchases.length>0 && <span className="ml-1 rounded-full bg-red-500 text-white text-[10px] min-w-5 h-5 px-1 flex items-center justify-center">{purchases.length}</span>}</button>})}
    </div>

    <div className="flex items-center gap-2"><Search className="w-4 h-4 text-muted-foreground"/><Input value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder={tab==='saida'?'Buscar código, material, mecânico, patrimônio ou ficha...':'Buscar código ou descrição...'} className="max-w-xl"/></div>

    {tab==='entrada' && <div className="space-y-4">
      <div className="card-premium p-4 grid md:grid-cols-6 gap-3"><select className="h-10 rounded-md border bg-background px-3 text-sm md:col-span-2" value={entItem} onChange={e=>setEntItem(e.target.value)}><option value="">Item / Código TOPAC</option>{stock.map(i=><option key={i.id} value={i.id}>{i.codigo_topac} — {i.nome}</option>)}</select><Input type="number" min="0" step="any" placeholder="Quantidade" value={entQtd} onChange={e=>setEntQtd(e.target.value)}/><Input placeholder="Fornecedor" value={entFornecedor} onChange={e=>setEntFornecedor(e.target.value)}/><Input placeholder="Nº NF" value={entNf} onChange={e=>setEntNf(e.target.value)}/><Input type="number" step="any" placeholder="R$ unidade" value={entValor} onChange={e=>setEntValor(e.target.value)}/><Textarea placeholder="Observação" value={entObs} onChange={e=>setEntObs(e.target.value)} className="md:col-span-4"/><input type="file" accept="application/pdf,image/*" onChange={e=>setEntFile(e.target.files?.[0]||null)} className="text-xs md:col-span-1"/><Button onClick={handleEntrada} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<ArrowDown className="w-4 h-4 mr-2"/>}Registrar entrada</Button></div>
      <TableShell><table className="w-full"><thead><tr><th className={th}>Data</th><th className={th}>Código</th><th className={th}>Material</th><th className={th}>Qtd.</th><th className={th}>Responsável</th><th className={th}>Fornecedor</th></tr></thead><tbody>{filteredEntries.map(r=>{const i=itemMap.get(r.item_id);return <tr key={r.id} onClick={()=>setDrawer({kind:'entrada',row:r})} className="cursor-pointer hover:bg-muted/50"><td className={td}>{fmtDate(r.data_entrada||r.created_at)}</td><td className={td}>{i?.codigo_topac||'—'}</td><td className={td}>{i?.nome||'Item histórico'}</td><td className={td}>{fmtNum(r.quantidade)}</td><td className={td}>{r.responsavel_nome||'—'}</td><td className={td}>{r.fornecedor||'—'}</td></tr>})}</tbody></table></TableShell><Button variant="outline" onClick={()=>loadMore('entrada')}>Carregar mais entradas</Button>
    </div>}

    {tab==='saida' && <div className="space-y-4">
      <div className="card-premium p-4 grid md:grid-cols-6 gap-3"><select className="h-10 rounded-md border bg-background px-3 text-sm md:col-span-2" value={saiItem} onChange={e=>setSaiItem(e.target.value)}><option value="">Item / Código TOPAC</option>{stock.map(i=><option key={i.id} value={i.id}>{i.codigo_topac} — {i.nome} ({fmtNum(i.saldo)})</option>)}</select><Input type="number" min="0" step="any" placeholder="Quantidade" value={saiQtd} onChange={e=>setSaiQtd(e.target.value)}/><select className="h-10 rounded-md border bg-background px-3 text-sm md:col-span-2" value={saiFunc} onChange={e=>setSaiFunc(e.target.value)}><option value="">Funcionário / Mecânico</option>{activeEmployees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}</select><Input placeholder="Patrimônio" value={saiPat} onChange={e=>setSaiPat(e.target.value)}/><Input placeholder="Nº ficha / OS" value={saiFicha} onChange={e=>setSaiFicha(e.target.value)}/><Input placeholder="Nº série" value={saiSerie} onChange={e=>setSaiSerie(e.target.value)}/><Input placeholder="Motivo" value={saiMotivo} onChange={e=>setSaiMotivo(e.target.value)}/><Textarea placeholder="Observação" value={saiObs} onChange={e=>setSaiObs(e.target.value)} className="md:col-span-2"/><Button onClick={handleSaida} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<ArrowUp className="w-4 h-4 mr-2"/>}Registrar saída</Button></div>
      <TableShell><table className="w-full"><thead><tr><th className={th}>Data</th><th className={th}>Código</th><th className={th}>Material</th><th className={th}>Qtd.</th><th className={th}>Quem pegou</th></tr></thead><tbody>{filteredExits.map(r=>{const i=itemMap.get(r.item_id);return <tr key={r.id} onClick={()=>setDrawer({kind:'saida',row:r})} className="cursor-pointer hover:bg-muted/50"><td className={td}>{fmtDate(r.data_saida||r.created_at)}</td><td className={td}>{i?.codigo_topac||'—'}</td><td className={td}>{i?.nome||'Item histórico'}</td><td className={td}>{fmtNum(r.quantidade)}</td><td className={td}>{r.mecanico_nome||r.funcionario_nome||'—'}</td></tr>})}</tbody></table></TableShell><Button variant="outline" onClick={()=>loadMore('saida')}>Carregar mais saídas</Button>
    </div>}

    {tab==='estoque' && <TableShell><table className="w-full"><thead><tr><th className={th}>Código</th><th className={th}>Descrição</th><th className={th}>Aplicação</th><th className={th}>Entrada</th><th className={th}>Saída</th><th className={th}>Saldo</th><th className={th}>Mínimo</th><th className={th}>Status</th></tr></thead><tbody>{filteredStock.map(i=><tr key={i.id} onClick={()=>setDrawer({kind:'estoque',row:i})} className="cursor-pointer hover:bg-muted/50"><td className={td}>{i.codigo_topac}</td><td className={`${td} font-medium`}>{i.nome}</td><td className={td}>{i.aplicacao||'—'}</td><td className={td}>{fmtNum(i.entradas_total)}</td><td className={td}>{fmtNum(i.saidas_total)}</td><td className={`${td} font-bold`}>{fmtNum(i.saldo)}</td><td className={td}>{fmtNum(i.estoque_minimo)}</td><td className={td}><Badge variant={i.status_atual==='COMPRAR'?'destructive':'secondary'}>{i.status_atual}</Badge></td></tr>)}</tbody></table></TableShell>}

    {tab==='codigos' && <TableShell><table className="w-full"><thead><tr><th className={th}>Código TOPAC</th><th className={th}>Código alternativo</th><th className={th}>Descrição</th><th className={th}>Aplicação</th></tr></thead><tbody>{filteredStock.map(i=><tr key={i.id} className="hover:bg-muted/50"><td className={`${td} font-bold`}>{i.codigo_topac}</td><td className={td}>{i.codigo_alternativo||'—'}</td><td className={td}>{i.nome}</td><td className={td}>{i.aplicacao||'—'}</td></tr>)}</tbody></table></TableShell>}

    {tab==='consulta' && <div className="grid lg:grid-cols-[380px_1fr] gap-4"><div className="rounded-xl border bg-card max-h-[600px] overflow-auto">{filteredStock.slice(0,150).map(i=><button key={i.id} onClick={()=>openConsulta(i)} className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 ${consultaItem?.id===i.id?'bg-primary/10':''}`}><div className="text-xs text-muted-foreground">{i.codigo_topac}</div><div className="text-sm font-medium">{i.nome}</div></button>)}</div><div className="card-premium p-5">{!consultaItem?<div className="text-sm text-muted-foreground">Pesquise e clique em um item para abrir a consulta completa.</div>:<div className="space-y-5"><div><div className="text-xs text-muted-foreground">Código {consultaItem.codigo_topac}</div><h2 className="text-lg font-bold">{consultaItem.nome}</h2><div className="text-sm text-muted-foreground">{consultaItem.aplicacao||'Sem aplicação informada'}</div></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Saldo" value={fmtNum(consultaItem.saldo)}/><Stat label="Mínimo" value={fmtNum(consultaItem.estoque_minimo)}/><Stat label="Consumo 90d" value={fmtNum(consultaIntel?.consumo_90d)}/><Stat label="Média mensal" value={fmtNum(consultaIntel?.media_mensal)}/><Stat label="Último valor" value={fmtMoney(consultaIntel?.ultimo_valor)}/><Stat label="Valor em estoque" value={fmtMoney(n(consultaItem.saldo)*n(consultaIntel?.ultimo_valor||consultaItem.valor_unitario))}/><Stat label="Última saída" value={fmtDate(consultaIntel?.ultima_saida||consultaItem.ultima_saida)}/><Stat label="Fornecedor" value={consultaIntel?.ultimo_fornecedor||'—'}/></div><div><h3 className="text-sm font-bold mb-2">Consumo mensal</h3><div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">{consultaMeses.slice(-12).map(m=><div key={`${m.ano}-${m.mes}`} className="rounded-lg border px-3 py-2 text-sm"><span className="text-muted-foreground">{String(m.mes).padStart(2,'0')}/{m.ano}</span><strong className="float-right">{fmtNum(m.consumo)}</strong></div>)}</div></div></div>}</div></div>}

    {tab==='compras' && <div className="space-y-4"><div className="grid md:grid-cols-3 gap-3">{['URGENTE','CRÍTICO','NO PRAZO'].map(pr=><div key={pr} className={`rounded-xl border p-4 ${priorityClass[pr]}`}><div className="text-xs font-bold">{pr}</div><div className="text-2xl font-bold mt-1">{purchases.filter(x=>x.prioridade===pr).length}</div><div className="text-xs mt-1 opacity-80">item(ns) exigindo ação</div></div>)}</div><TableShell><table className="w-full"><thead><tr><th className={th}>Prioridade</th><th className={th}>Código</th><th className={th}>Material</th><th className={th}>Saldo</th><th className={th}>Mínimo</th><th className={th}>Consumo/mês</th><th className={th}>Cobertura</th><th className={th}>Comprar</th></tr></thead><tbody>{filteredPurchases.map(r=><tr key={r.item_id} className="hover:bg-muted/50"><td className={td}><span className={`inline-flex px-2 py-1 rounded-md border text-xs font-bold ${priorityClass[r.prioridade]}`}>{r.prioridade}</span></td><td className={td}>{r.codigo_topac}</td><td className={`${td} font-medium`}>{r.nome}</td><td className={td}>{fmtNum(r.saldo)}</td><td className={td}>{fmtNum(r.minimo_calculado)}</td><td className={td}>{fmtNum(r.media_mensal)}</td><td className={td}>{r.cobertura_dias==null?'—':`${fmtNum(r.cobertura_dias)} dias`}</td><td className={`${td} font-bold`}>{fmtNum(r.quantidade_sugerida)} un</td></tr>)}</tbody></table></TableShell>{purchases.length===0&&<div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Nenhum item precisa de compra neste momento.</div>}</div>}

    {drawer && <DetailDrawer data={drawer} item={drawer.kind==='estoque'?drawer.row:itemMap.get(drawer.row.item_id)} onClose={()=>setDrawer(null)}/>} 
  </div>;
};

const Stat: React.FC<{label:string;value:any}> = ({label,value}) => <div className="rounded-xl border bg-muted/20 p-3"><div className="text-[11px] text-muted-foreground uppercase">{label}</div><div className="text-sm font-bold mt-1">{value}</div></div>;

const DetailDrawer: React.FC<{data:NonNullable<DrawerData>;item:any;onClose:()=>void}> = ({data,item,onClose}) => {
  const r=data.row; const isStock=data.kind==='estoque';
  return <div className="fixed inset-0 z-50 bg-black/45" onClick={onClose}><aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-background border-l shadow-2xl overflow-auto" onClick={e=>e.stopPropagation()}><div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between"><div><div className="text-xs text-muted-foreground">{isStock?'Ficha do item':data.kind==='saida'?'Detalhes da saída':'Detalhes da entrada'}</div><div className="font-bold">{item?.codigo_topac} — {item?.nome}</div></div><button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5"/></button></div><div className="p-5 space-y-5">
    {isStock?<><div className="grid grid-cols-2 gap-3"><Stat label="Saldo atual" value={fmtNum(r.saldo)}/><Stat label="Estoque mínimo" value={fmtNum(r.estoque_minimo)}/><Stat label="Entradas" value={fmtNum(r.entradas_total)}/><Stat label="Saídas" value={fmtNum(r.saidas_total)}/><Stat label="Última saída" value={fmtDate(r.ultima_saida)}/><Stat label="Último pedido" value={fmtDate(r.planilha_ultimo_pedido)}/></div><Detail label="Código alternativo" value={r.codigo_alternativo}/><Detail label="Aplicação" value={r.aplicacao}/><Detail label="Observações" value={r.observacoes}/></>:<><div className="rounded-xl border p-4 space-y-2"><div className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary"/><strong>{fmtDate(data.kind==='saida'?r.data_saida:r.data_entrada)} — {fmtTime(r)}</strong></div></div>{data.kind==='saida'?<><Detail label="Quem pegou" value={r.mecanico_nome||r.funcionario_nome}/><Detail label="Quantidade" value={`${fmtNum(r.quantidade)} un`}/><Detail label="Patrimônio / veículo" value={r.patrimonio||r.veiculo}/><Detail label="Ficha / OS" value={r.ficha||r.ordem_servico}/><Detail label="Número de série" value={r.numero_serie}/><Detail label="Liberado por" value={r.responsavel_liberacao}/><Detail label="Motivo" value={r.motivo}/><Detail label="Observação" value={r.observacao||r.observacoes}/></>:<><Detail label="Responsável" value={r.responsavel_nome}/><Detail label="Quantidade" value={`${fmtNum(r.quantidade)} un`}/><Detail label="Fornecedor" value={r.fornecedor}/><Detail label="Nota fiscal" value={r.nota_fiscal}/><Detail label="Valor unitário" value={fmtMoney(r.valor_unitario)}/><Detail label="Valor total" value={fmtMoney(r.valor_total)}/><Detail label="Observação" value={r.observacao||r.observacoes}/>{r.nota_fiscal_url&&<a className="inline-flex items-center gap-2 text-primary underline" href={r.nota_fiscal_url} target="_blank" rel="noreferrer"><FileText className="w-4 h-4"/>Abrir nota fiscal</a>}</>}</>}
  </div></aside></div>;
};
const Detail: React.FC<{label:string;value:any}> = ({label,value}) => <div className="border-b pb-3"><div className="text-[11px] uppercase text-muted-foreground">{label}</div><div className="text-sm font-medium mt-1">{value||'—'}</div></div>;

export default AlmoxarifadoPlanilhaView;
