import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
type StockEmployee = { id: string; nome: string; cargo: string | null; status: string | null; company_id: string | null; };
type Tab = 'visao' | 'produtos' | 'entrada' | 'saida' | 'historico' | 'relatorios';
type ProductMetric = 'produtos' | 'quantidade' | 'reposicao' | 'sem_saldo';
const TABS: Array<{key: Tab; label: string; icon: React.ElementType}> = [
  {key:'visao',label:'Visão geral',icon:Package},
  {key:'produtos',label:'Produtos',icon:Archive},
  {key:'entrada',label:'Entradas',icon:ArrowUpCircle},
  {key:'saida',label:'Saídas',icon:ArrowDownCircle},
  {key:'historico',label:'Histórico',icon:History},
  {key:'relatorios',label:'Relatórios',icon:FileText},
];
const db = supabase as any;
// Somente a lista de destinatários da saída do estoque do escritório.
// A filial Praia Grande entra apenas pelos dois nomes expressamente autorizados.
const STOCK_RECIPIENT_COMPANIES = [
  'fc7b015f-e53a-49cf-a714-19b647220933', // LMT
  '447c276c-572b-4ec7-9b87-b5de4206f431', // TOPAC MATRIZ
  '67275dcd-150b-44bc-a445-bd31efc31ca9', // ALQUI OBRAS
] as const;
const STOCK_PRAIA_COMPANY = '92c89397-d788-48d4-bc1a-f23f3e64e637';
const STOCK_PRAIA_RECIPIENTS = new Set([
  'ANTONIO CARLOS SERVILIO',
  'EDENILSON PEREIRA VITOR',
]);
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
  const { session, logout, userRoles } = useApp();
  const location = useLocation();
  const standalone = location.pathname === '/estoque-interno';
  const staffPortal = standalone;
  const isTopacAdmin = userRoles.includes('admin');
  const email = (session?.user?.email || '').toLowerCase();
  const [access, setAccess] = useState<Access | null>(null);
  const [accessError, setAccessError] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [items, setItems] = useState<StockItem[]>([]);
  const [moves, setMoves] = useState<Movement[]>([]);
  const [moveCount, setMoveCount] = useState(0);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<Tab | null>(null);
  const [productMetric, setProductMetric] = useState<ProductMetric | null>(null);
  const [search, setSearch] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [quantity, setQuantity] = useState('');
  const [destination, setDestination] = useState('');
  const [employees, setEmployees] = useState<StockEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState('');
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [recipientIndex, setRecipientIndex] = useState(0);
  const [employeeRetry, setEmployeeRetry] = useState(0);
  const [notes, setNotes] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [productOpen, setProductOpen] = useState(false);
  const [newItem, setNewItem] = useState({codigo:'', descricao:'', unidade:'Unidade', aplicacao:'', minimo:'', maximo:''});
  const [month, setMonth] = useState(nowMonth());
  const [filterType, setFilterType] = useState('');
  const [filterItem, setFilterItem] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!session?.user?.id) {
      setAccess(null);setAccessError('');setInitializing(false);
      return;
    }
    if (!quiet) setInitializing(true);
    setAccessError('');
    // Consultar a tabela existente diretamente: uma RPC recém-criada pode não
    // constar no schema cache do PostgREST, mesmo já estando no PostgreSQL.
    const a = await db.from('estoque_interno_acessos')
      .select('nome,email,ativo,pode_movimentar,pode_gerenciar')
      .eq('email',email).maybeSingle();
    let currentAccess: Access | null = !a.error && a.data?.ativo ? a.data as Access : null;

    if (!currentAccess) {
      // A role oficial de administrador é independente da lista de colaboradores
      // autorizados; todas as consultas e escritas seguem protegidas no servidor.
      const admin = await db.from('user_roles').select('role')
        .eq('user_id',session.user.id).eq('role','admin').maybeSingle();
      if (!admin.error && admin.data?.role === 'admin') {
        currentAccess = {
          nome: session.user.user_metadata?.nome_completo || session.user.user_metadata?.full_name || 'Administrador TOPAC',
          email, ativo: true, pode_movimentar: true, pode_gerenciar: true,
        };
      } else {
        setAccess(null);setItems([]);setMoves([]);
        setAccessError(a.error
          ? 'Falha ao consultar o acesso: '+a.error.message
          : admin.error
            ? 'Falha ao confirmar a função de administrador: '+admin.error.message
            : 'Sua conta não possui permissão ativa para o Estoque Interno.');
        setInitializing(false);
        return;
      }
    }
    const r = await db.from('estoque_interno_itens')
      .select('id,codigo,descricao,aplicacao,unidade,saldo_atual,saldo_inicial,estoque_minimo,estoque_maximo')
      .order('codigo',{ascending:true});
    if (r.error) {
      setAccess(null);setItems([]);setMoves([]);
      setAccessError('Não foi possível carregar os produtos: '+r.error.message);
    } else {
      setAccess(currentAccess);
      setItems((r.data || []) as StockItem[]);
    }
    setInitializing(false);
  },[session?.user?.id,email]);
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

  // Mostra os colaboradores reais da TOPAC, sem CPF, telefone, salario ou dados bancarios.
  // Carrega ao abrir Saídas para que os nomes apareçam mesmo antes de digitar.
  useEffect(()=>{
    if (!access || tab!=='saida') return;
    let cancelled = false;
    const getEmployees = async () => {
      setEmployeesLoading(true);
      setEmployeesError('');
      const result = await db.from('funcionarios')
        .select('id,nome,cargo,status,company_id')
        .in('company_id',[...STOCK_RECIPIENT_COMPANIES,STOCK_PRAIA_COMPANY])
        .eq('ativo',true)
        .is('excluido_em',null)
        .order('nome',{ascending:true})
        .limit(300);
      if (cancelled) return;
      setEmployeesLoading(false);
      if (result.error) {
        setEmployees([]);
        setEmployeesError('Não foi possível carregar funcionários. Digite o destinatário manualmente.');
        return;
      }
      const seen = new Set<string>();
      setEmployees(((result.data||[]) as StockEmployee[])
        .filter(employee => {
          if (!employee.nome?.trim()) return false;
          const isPraia = employee.company_id === STOCK_PRAIA_COMPANY;
          if (isPraia) return STOCK_PRAIA_RECIPIENTS.has(employee.nome.trim().toLocaleUpperCase('pt-BR'));
          return STOCK_RECIPIENT_COMPANIES.some(id=>id===employee.company_id)
            && !['desligado','excluido'].includes((employee.status||'').toLocaleLowerCase('pt-BR'));
        })
        .filter(employee => {
          const key = employee.nome.trim().toLocaleLowerCase('pt-BR');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }));
    };
    void getEmployees();
    return ()=>{cancelled=true;};
  },[access?.email,tab,employeeRetry]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{void loadMoves();},[loadMoves]);

  const itemById=useMemo(()=>new Map(items.map(i=>[i.id,i])),[items]);
  const selected=items.find(i=>String(i.codigo)===code);
  const attention=items.filter(i=>i.estoque_minimo!==null && Number(i.estoque_minimo)>=0 && Number(i.saldo_atual)<=Number(i.estoque_minimo));
  const filtered=items.filter(i=>(String(i.codigo)+' '+i.descricao+' '+(i.aplicacao||''))
    .toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
    .filter(i=>productMetric==='reposicao'?attention.includes(i):productMetric==='sem_saldo'?Number(i.saldo_atual)===0:true)
    .sort((a,b)=>productMetric==='quantidade'?Number(b.saldo_atual)-Number(a.saldo_atual):a.codigo-b.codigo);
  const toggleTab=(next:Tab)=>{
    setTab(current=>current===next&&productMetric===null?null:next);
    setProductMetric(null);
    setPage(0);
  };
  const toggleMetric=(next:ProductMetric)=>{
    if(tab==='produtos'&&productMetric===next){setTab(null);setProductMetric(null);}
    else {setTab('produtos');setProductMetric(next);}
    setSearch('');
    setPage(0);
  };
  const totalQty=items.reduce((s,i)=>s+Number(i.saldo_atual||0),0);
  const suggestedEmployees = useMemo(() => {
    const needle = destination.trim().toLocaleLowerCase('pt-BR');
    return (needle ? employees.filter(e => (e.nome+' '+(e.cargo||'')).toLocaleLowerCase('pt-BR').includes(needle)) : employees);
  },[destination,employees]);
  const pickEmployee = (employee: StockEmployee) => {
    setDestination(employee.nome.trim());
    setRecipientOpen(false);
    setRecipientIndex(0);
  };
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
  if(!access)return <main className="flex min-h-[70vh] items-center justify-center bg-[#05070c] p-4"><div className={wrapBox+' max-w-xl text-center'}><ShieldCheck className="mx-auto mb-4 h-10 w-10 text-violet-400"/><h1 className="text-2xl font-bold text-white">Não foi possível abrir o Estoque Interno</h1><p className="mt-2 text-sm text-zinc-400">{accessError||'Aguardando autenticação da conta.'}</p><p className="mt-2 text-xs text-zinc-500">Conta: {email||'não identificada'}</p><button type="button" className={primaryButton+' mt-5'} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Tentar novamente</button></div></main>;

  return <main className={(standalone?'min-h-screen ':'')+'bg-[#05070c] p-4 pb-12 text-white md:p-7'}>
    {standalone&&<header className="mx-auto mb-6 flex max-w-[1500px] items-center justify-between gap-3 border-b border-[#332943] pb-5">
      <div><div className="text-xl font-black">TOPAC <span className="text-violet-400">RH PRO</span></div><div className="mt-1 text-xs font-semibold tracking-wider text-[#ffc400]">PORTAL EXCLUSIVO DO ESCRITÓRIO</div></div>
      <div className="flex items-center gap-2">
        {isTopacAdmin&&<Link to="/admin/estoque-interno" className="rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200 hover:border-violet-400">Voltar à minha tela administrativa</Link>}
        <button onClick={()=>void logout()} className="flex items-center gap-2 rounded-lg border border-[#44334f] px-3 py-2 text-xs text-zinc-300 hover:text-white"><LogOut className="h-4 w-4"/> Encerrar acesso</button>
      </div>
    </header>}
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-[11px] font-bold uppercase tracking-[.18em] text-violet-400">{staffPortal?'PAINEL DA EQUIPE • ESCRITÓRIO':'TOPAC RH PRO • ESCRITÓRIO'}</div><h1 className="mt-1 text-3xl font-black">{staffPortal?'Materiais do Escritório':'Estoque Interno'}</h1><p className="mt-1 text-sm text-zinc-500">{staffPortal?'Consulte produtos, registre entradas e saídas e acompanhe o histórico.':'Materiais administrativos • controle independente do almoxarifado operacional'}</p></div>
        <div className="flex items-center gap-3">
          {!staffPortal&&isTopacAdmin&&<Link to="/estoque-interno" className="rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200 hover:border-violet-400">Ver a tela da equipe</Link>}
          <span className="rounded-lg border border-[#443050] px-3 py-2 text-xs text-zinc-300">{access.nome}</span>
          <button onClick={()=>void refresh()} disabled={refreshing} className="rounded-lg border border-[#493552] p-2 hover:border-violet-400" title="Atualizar"><RefreshCw className={'h-5 w-5 '+(refreshing?'animate-spin':'')}/></button>
        </div>
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
          {!staffPortal&&TABS.filter(t=>t.key==='visao'||t.key==='relatorios').map(t=>{const Icon=t.icon;return <button key={t.key} onClick={()=>{setTab(t.key);setPage(0);}} aria-pressed={tab===t.key} className={'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold '+(tab===t.key?'border-violet-500 bg-[#312048] text-[#ffc400]':'border-[#30283a] text-zinc-400 hover:text-white')}><Icon className="h-4 w-4"/>{t.label}</button>;})}
        </div>
      </div>
      {(staffPortal||tab==='visao')&&<>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Produtos cadastrados',items.length,Package,'text-violet-400'],['Quantidade total',brQty(totalQty),Archive,'text-emerald-400'],['Precisam de reposição',attention.length,TriangleAlert,'text-amber-400'],['Sem saldo',items.filter(i=>Number(i.saldo_atual)===0).length,ArrowDownCircle,'text-red-400']].map(([title,val,Icon,color]:any)=><div key={title} className={wrapBox}><div className="text-xs text-zinc-400">{title}</div><div className="mt-3 flex items-center justify-between"><strong className="text-3xl">{val}</strong><Icon className={'h-7 w-7 '+color}/></div></div>)}
        </div>
        <div className={'grid gap-4 '+(!staffPortal?'xl:grid-cols-2':'')}>
          <section className={wrapBox}><h2 className="mb-3 text-lg font-bold">Estoque em atenção</h2><div className="max-h-[440px] overflow-y-auto">{attention.length?attention.slice(0,25).map(i=><button onClick={()=>{setCode(String(i.codigo));setTab('entrada');}} key={i.id} className="flex w-full items-center justify-between border-b border-[#29242e] py-3 text-left text-sm hover:text-[#ffc400]"><span><span className="mr-2 text-zinc-500">{i.codigo}</span>{i.descricao}</span><span className="ml-2 shrink-0 font-bold text-amber-400">{brQty(Number(i.saldo_atual))} {i.unidade}</span></button>):<p className="text-sm text-zinc-500">Nenhum item abaixo do mínimo informado.</p>}</div></section>
          {!staffPortal&&<section className={wrapBox}><h2 className="mb-3 text-lg font-bold">Controle e rastreabilidade</h2><div className="space-y-3 text-sm text-zinc-300"><p>Inventário histórico importado e identificado como origem Excel.</p><p>Cada entrada e saída nova grava usuário autenticado, data, quantidade e saldo anterior e posterior.</p><p>As datas ausentes ou inconsistentes do arquivo original permanecem sinalizadas, sem data fabricada.</p><p>Este controle não altera os materiais, cargas ou saldos do almoxarifado dos mecânicos.</p></div><button onClick={()=>setTab('historico')} className="mt-4 text-sm font-bold text-violet-400 hover:underline">Abrir histórico completo →</button></section>}
        </div>
      </>}
      {tab==='produtos'&&<section className={wrapBox}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Materiais do escritório</h2><div className="flex gap-2">{!staffPortal&&access.pode_gerenciar&&<button className={primaryButton} onClick={()=>setProductOpen(!productOpen)}><Plus className="h-4 w-4"/> Produto</button>}{!staffPortal&&<button className="rounded-lg border border-[#44334f] px-4 text-sm hover:border-violet-500" onClick={()=>downloadCSV()}>Exportar CSV</button>}</div></div>
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
          {tab==='saida'?<div className="grid gap-1 text-xs text-zinc-400">
            <label htmlFor="estoque-interno-destinatario">Para quem foi entregue? *</label>
            <div className="relative">
              <input id="estoque-interno-destinatario" required autoComplete="off" role="combobox"
                aria-autocomplete="list" aria-expanded={recipientOpen} aria-controls="estoque-interno-funcionarios"
                value={destination} onFocus={()=>{setRecipientOpen(true);setRecipientIndex(0);}}
                onBlur={()=>setRecipientOpen(false)}
                onChange={e=>{setDestination(e.target.value);setRecipientOpen(true);setRecipientIndex(0);}}
                onKeyDown={e=>{
                  if (e.key==='Escape') setRecipientOpen(false);
                  if (e.key==='ArrowDown' && recipientOpen) {e.preventDefault();setRecipientIndex(i=>Math.min(i+1,Math.max(0,suggestedEmployees.length-1)));}
                  if (e.key==='ArrowUp' && recipientOpen) {e.preventDefault();setRecipientIndex(i=>Math.max(0,i-1));}
                  if (e.key==='Enter' && recipientOpen && suggestedEmployees.length>0) {e.preventDefault();pickEmployee(suggestedEmployees[recipientIndex]||suggestedEmployees[0]);}
                }}
                placeholder="Clique para escolher o funcionário ou digite um setor" className={inputStyle+' pr-10'}/>
              <Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-violet-400"/>
              {recipientOpen&&<div id="estoque-interno-funcionarios" role="listbox" aria-label="Funcionários da TOPAC"
                className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-lg border border-violet-500/50 bg-[#11121c] p-1 shadow-2xl">
                {employeesLoading&&<p className="px-3 py-3 text-xs text-zinc-400">Carregando funcionários...</p>}
                {!employeesLoading&&employeesError&&<div className="px-3 py-2 text-xs text-amber-300">{employeesError}
                  <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>setEmployeeRetry(n=>n+1)} className="ml-2 underline">Tentar novamente</button>
                </div>}
                {!employeesLoading&&!employeesError&&suggestedEmployees.length===0&&<p className="px-3 py-3 text-xs text-zinc-400">Nenhum funcionário encontrado. Você pode informar outro nome ou setor.</p>}
                {!employeesLoading&&!employeesError&&suggestedEmployees.map((employee,index)=><button
                  type="button" role="option" aria-selected={index===recipientIndex} key={employee.id}
                  onMouseDown={e=>e.preventDefault()} onClick={()=>pickEmployee(employee)}
                  className={'flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm hover:bg-violet-500/20 '+(index===recipientIndex?'bg-violet-500/20 text-white':'text-zinc-200')}>
                  <span className="font-semibold">{employee.nome}</span>
                  {employee.cargo&&<span className="text-[11px] text-zinc-400">{employee.cargo}</span>}
                </button>)}
              </div>}
            </div>
            <p className="text-[11px] text-zinc-500">Selecione um funcionário da lista. Para setor ou visitante, informe o nome manualmente.</p>
          </div>:<label className="grid gap-1 text-xs text-zinc-400">Fornecedor / origem (opcional)
            <input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Compra, transferência, fornecedor..." className={inputStyle}/>
          </label>}
          {tab==='entrada'&&<label className="grid gap-1 text-xs text-zinc-400">Preço unitário (opcional)
            <input type="number" step="any" min="0" value={unitCost} onChange={e=>setUnitCost(e.target.value)} className={inputStyle}/>
          </label>}
          <label className="grid gap-1 text-xs text-zinc-400">Observação (opcional)
            <textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} className={inputStyle+' h-auto py-2'}/>
          </label>
          <button disabled={busy||!access.pode_movimentar} className={primaryButton}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}Confirmar {tab==='entrada'?'entrada':'saída'}</button>
        </form>
      </section>}
      {(isStockTab||tab==='historico'||(!staffPortal&&tab==='relatorios'))&&<section className={wrapBox}>
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
