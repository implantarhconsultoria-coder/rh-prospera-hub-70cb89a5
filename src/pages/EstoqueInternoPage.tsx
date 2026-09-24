import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Archive, ArrowDownCircle, ArrowUpCircle, Download, FileText, History, Loader2, LogOut, Package, Plus, RefreshCw, Search, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';

type WithdrawalItem = { codigo: number; quantidade: string };
type StockItem = {
  id: string; codigo: number; descricao: string; aplicacao: string | null;
  unidade: string; saldo_atual: number; saldo_inicial: number; ultima_movimentacao?: string | null;
  estoque_minimo: number | null; estoque_maximo: number | null;
};
type Movement = {
  id: string; item_id: string; tipo: 'entrada' | 'saida'; quantidade: number;
  data_movimento: string | null; destinatario: string | null; origem_responsavel: string | null;
  preco_unitario: number | null; observacao: string | null; ator_email: string | null;
  historico_importado: boolean; data_suspeita: boolean; linha_origem: number | null; cancelado_em: string | null;
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
// A planilha antiga registra todos os produtos desde 2020; a vitrine prioriza
// materiais com movimentação confirmada desde 2024. O resto permanece pesquisável.
const ACTIVE_PRODUCT_SINCE = '2024-01-01';
const CURRENT_MOVEMENTS_SINCE = '2020-01-01';
const brQty = (n: number) => Number(n || 0).toLocaleString('pt-BR', {maximumFractionDigits:3});
const brDate = (s: string | null) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data (planilha)';
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
  const [quantity, setQuantity] = useState('1');
  const [withdrawalItems, setWithdrawalItems] = useState<WithdrawalItem[]>([]);
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
  const [month, setMonth] = useState('');
  const [productScope, setProductScope] = useState<'atual' | 'arquivo' | 'todos'>('atual');
  const [movementScope, setMovementScope] = useState<'atual' | 'arquivo' | 'todos'>('atual');
  const [materialSearch, setMaterialSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterItem, setFilterItem] = useState('');
  const [correction, setCorrection] = useState<{kind:'editar_produto'|'ajustar_saldo'|'editar_movimento'|'cancelar_movimento';item?:StockItem;move?:Movement}|null>(null);
  const [fields,setFields] = useState<Record<string,string>>({});
  const [reason,setReason] = useState('');
  const [audit,setAudit] = useState<any[]>([]);

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
    const [r, activity] = await Promise.all([
      db.from('estoque_interno_itens')
        .select('id,codigo,descricao,aplicacao,unidade,saldo_atual,saldo_inicial,estoque_minimo,estoque_maximo')
        .order('codigo',{ascending:true}),
      db.from('estoque_interno_atividade_produtos').select('item_id,ultima_movimentacao'),
    ]);
    if (r.error || activity.error) {
      setAccess(null);setItems([]);setMoves([]);
      setAccessError('Não foi possível carregar os produtos: '+(r.error?.message || activity.error?.message));
    } else {
      const dates = new Map<string, string | null>((activity.data || []).map((row: any) => [row.item_id, row.ultima_movimentacao]));
      setAccess(currentAccess);
      setItems(((r.data || []) as StockItem[]).map(item => ({
        ...item, ultima_movimentacao: dates.get(item.id) || null,
      })));
    }
    setInitializing(false);
  },[session?.user?.id,email]);
  const loadMoves = useCallback(async () => {
    if (!access) return;
    let q = db.from('estoque_interno_movimentos').select(
      'id,item_id,tipo,quantidade,data_movimento,destinatario,origem_responsavel,preco_unitario,observacao,ator_email,historico_importado,data_suspeita,linha_origem,cancelado_em',
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
    if (month) {
      const parts=month.split('-');
      const nextMonth=new Date(Date.UTC(Number(parts[0]),Number(parts[1]),1)).toISOString().slice(0,10);
      q=q.gte('data_movimento',month+'-01').lt('data_movimento',nextMonth);
    } else if (movementScope==='atual') {
      q=q.gte('data_movimento',CURRENT_MOVEMENTS_SINCE)
        .lte('data_movimento',new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}))
        .eq('data_suspeita',false);
    } else if (movementScope==='arquivo') {
      const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
      q=q.or('data_movimento.lt.'+CURRENT_MOVEMENTS_SINCE+',data_movimento.is.null,data_movimento.gt.'+today+',data_suspeita.eq.true');
    }
    const r=await q.order('data_movimento',{ascending:false,nullsFirst:false})
      .order('linha_origem',{ascending:false,nullsFirst:false}).range(page*80,page*80+79);
    if (r.error) toast.error('Erro ao carregar movimentações: '+r.error.message);
    else {setMoves((r.data||[]) as Movement[]);setMoveCount(r.count||0);}
  },[access,filterType,filterItem,month,movementScope,page,tab,movementSearch,items]);

  const loadAudit=useCallback(async()=>{
    if(!access?.pode_gerenciar)return;
    const r=await db.from('estoque_interno_auditoria')
      .select('id,operacao,item_id,ator_nome,ator_email,motivo,dados_anteriores,dados_novos,criado_em')
      .order('criado_em',{ascending:false}).limit(100);
    if(r.error)toast.error('Histórico de correções: '+r.error.message);
    else setAudit(r.data||[]);
  },[access?.pode_gerenciar]);
  const openCorrection=(kind:'editar_produto'|'ajustar_saldo'|'editar_movimento'|'cancelar_movimento',item?:StockItem,move?:Movement)=>{
    if(!access?.pode_gerenciar)return;
    setCorrection({kind,item,move});setReason('');
    setFields(move?{tipo:move.tipo,quantidade:String(move.quantidade),data_movimento:move.data_movimento||'',
      destinatario:move.destinatario||'',observacao:move.observacao||'',
      preco_unitario:move.preco_unitario===null?'':String(move.preco_unitario)}
      :item?{codigo:String(item.codigo),descricao:item.descricao,unidade:item.unidade,
        aplicacao:item.aplicacao||'',estoque_minimo:item.estoque_minimo===null?'':String(item.estoque_minimo),
        estoque_maximo:item.estoque_maximo===null?'':String(item.estoque_maximo),
        saldo_atual:String(item.saldo_atual)}:{});
  };
  const submitCorrection=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!correction||busy||!access?.pode_gerenciar)return;
    if(reason.trim().length<5){toast.error('Informe o motivo da correção (mínimo 5 caracteres)');return;}
    const number=(key:string)=>fields[key]===''?null:Number((fields[key]||'').replace(',','.'));
    let dados:Record<string,unknown>={};
    if(correction.kind==='ajustar_saldo'){
      dados={saldo_atual:number('saldo_atual')};
      if(dados.saldo_atual===null||!Number.isFinite(Number(dados.saldo_atual))||Number(dados.saldo_atual)<0){toast.error('Saldo inválido');return;}
    }else if(correction.kind==='editar_produto'){
      dados={codigo:Number(fields.codigo),descricao:fields.descricao,unidade:fields.unidade,
        aplicacao:fields.aplicacao,estoque_minimo:number('estoque_minimo'),estoque_maximo:number('estoque_maximo')};
    }else if(correction.kind==='editar_movimento'){
      dados={tipo:fields.tipo,quantidade:number('quantidade'),data_movimento:fields.data_movimento,
        destinatario:fields.destinatario,observacao:fields.observacao,preco_unitario:number('preco_unitario')};
      if(!dados.quantidade||!Number.isFinite(Number(dados.quantidade))){toast.error('Quantidade inválida');return;}
    }
    setBusy(true);
    try{
      const r=await db.rpc('estoque_interno_corrigir',{
        p_operacao:correction.kind,p_item_id:correction.item?.id||correction.move?.item_id||null,
        p_movimento_id:correction.move?.id||null,p_dados:dados,p_motivo:reason.trim()
      });
      if(r.error)throw r.error;
      toast.success('Correção salva com motivo, responsável e histórico.');
      setCorrection(null);await load(true);await loadMoves();await loadAudit();
    }catch(error:any){toast.error('Correção não realizada: '+(error?.message||'erro desconhecido'));}
    finally{setBusy(false);}
  };
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
  useEffect(()=>{if(tab==='historico'&&access?.pode_gerenciar)void loadAudit();},[tab,loadAudit,access?.pode_gerenciar]);

  const itemById=useMemo(()=>new Map(items.map(i=>[i.id,i])),[items]);
  const selected=items.find(i=>String(i.codigo)===code);
  const withdrawalTotal=withdrawalItems.reduce((sum,item)=>sum+Number(item.quantidade||0),0);
  const addWithdrawalItem=()=>{
    if(!selected){toast.error('Escolha um material para adicionar');return;}
    const qty=Number(quantity.replace(',','.'));
    if(!Number.isFinite(qty)||qty<=0){toast.error('Informe a quantidade do material');return;}
    const already=withdrawalItems.find(item=>item.codigo===selected.codigo);
    const combined=Number(((already?Number(already.quantidade):0)+qty).toFixed(3));
    if(combined>Number(selected.saldo_atual)){
      toast.error('Saldo insuficiente para '+selected.descricao+'. Disponível: '+brQty(Number(selected.saldo_atual))+' '+selected.unidade);
      return;
    }
    if(!already&&withdrawalItems.length>=50){toast.error('Limite de 50 produtos por saída');return;}
    setWithdrawalItems(current=>already
      ? current.map(item=>item.codigo===selected.codigo?{...item,quantidade:String(combined)}:item)
      : [...current,{codigo:selected.codigo,quantidade:String(qty)}]);
    setCode('');
    setMaterialSearch('');
    setQuantity('1');
  };
  const removeWithdrawalItem=(codigo:number)=>{
    setWithdrawalItems(current=>current.filter(item=>item.codigo!==codigo));
  };
  const isCurrentProduct=(item:StockItem)=>!!item.ultima_movimentacao&&item.ultima_movimentacao>=ACTIVE_PRODUCT_SINCE;
  const currentProducts=items.filter(isCurrentProduct);
  const legacyProducts=items.filter(i=>!isCurrentProduct(i));
  const attention=currentProducts.filter(i=>i.estoque_minimo!==null && Number(i.estoque_minimo)>=0 && Number(i.saldo_atual)<=Number(i.estoque_minimo));
  const filtered=items.filter(i=>{
      const searching=search.trim().length>0;
      // Busca textual e indicadores pesquisam TODO o cadastro, inclusive o arquivo.
      if(searching || productScope==='todos')return true;
      return productScope==='arquivo'?!isCurrentProduct(i):isCurrentProduct(i);
    })
    .filter(i=>(String(i.codigo)+' '+i.descricao+' '+(i.aplicacao||''))
      .toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
    .filter(i=>productMetric==='reposicao'?attention.includes(i):productMetric==='sem_saldo'?Number(i.saldo_atual)===0:true)
    .sort((a,b)=>productMetric==='quantidade'?Number(b.saldo_atual)-Number(a.saldo_atual):a.codigo-b.codigo);
  const selectableForMove=items.filter(i=>{
    const needle=materialSearch.toLocaleLowerCase('pt-BR').trim();
    const matches=(String(i.codigo)+' '+i.descricao+' '+(i.aplicacao||''))
      .toLocaleLowerCase('pt-BR').includes(needle);
    return matches && (tab==='entrada'||Number(i.saldo_atual)>0)
      && (needle.length>0 || isCurrentProduct(i) || String(i.codigo)===code);
  });
  const toggleTab=(next:Tab)=>{
    setTab(current=>current===next&&productMetric===null?null:next);
    setProductMetric(null);
    setPage(0);
  };
  const toggleMetric=(next:ProductMetric)=>{
    if(tab==='produtos'&&productMetric===next){setTab(null);setProductMetric(null);}
    else {setTab('produtos');setProductMetric(next);setProductScope('atual');}
    setSearch('');
    setPage(0);
  };
  const totalQty=currentProducts.reduce((s,i)=>s+Number(i.saldo_atual||0),0);
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
    if(!access?.pode_movimentar){toast.error('Acesso sem permissão para movimentar');return;}
    if(busy)return;
    if(tab==='saida'){
      if(!withdrawalItems.length){toast.error('Adicione pelo menos um produto à saída');return;}
      if(!destination.trim()){toast.error('Informe para quem foi entregue');return;}
      for(const entry of withdrawalItems){
        const current=items.find(i=>i.codigo===entry.codigo);
        const requested=Number(entry.quantidade.replace(',','.'));
        if(!current||!Number.isFinite(requested)||requested<=0){
          toast.error('Confira a quantidade e o produto em cada item');return;
        }
        if(requested>Number(current.saldo_atual)){
          toast.error('Saldo insuficiente para '+current.descricao+'. Disponível: '+brQty(Number(current.saldo_atual))+' '+current.unidade);
          return;
        }
      }
      setBusy(true);
      try {
        const result=await db.rpc('estoque_interno_movimentar_lote',{
          p_itens:withdrawalItems.map(entry=>({
            codigo:entry.codigo, quantidade:Number(entry.quantidade.replace(',','.')),
          })),
          p_destinatario:destination.trim(),
          p_observacao:notes.trim()||null,
        });
        if(result.error)throw result.error;
        toast.success(withdrawalItems.length+' produto(s) entregues. Saldos atualizados numa única saída.');
        setWithdrawalItems([]);setCode('');setMaterialSearch('');setQuantity('1');
        setDestination('');setNotes('');setPage(0);
        await load(true);await loadMoves();
      } catch(error:any){
        toast.error('Saída não registrada: '+(error?.message||'verifique o estoque e tente novamente'));
      } finally {
        setBusy(false);
      }
      return;
    }
    if(!selected){toast.error('Selecione um produto');return;}
    const qty=Number(quantity.replace(',','.'));
    if(!Number.isFinite(qty)||qty<=0){toast.error('Informe uma quantidade maior que zero');return;}
    setBusy(true);
    try {
      const r=await db.rpc('estoque_interno_movimentar',{
        p_codigo:selected.codigo,p_tipo:'entrada',p_quantidade:qty,
        p_destinatario:destination.trim()||null,p_observacao:notes.trim()||null,
        p_preco_unitario:unitCost ? Number(unitCost.replace(',','.')) : null,
      });
      if(r.error)throw r.error;
      toast.success('Entrada registrada e saldo atualizado');
      setQuantity('1');setDestination('');setNotes('');setUnitCost('');
      await load(true);setPage(0);await loadMoves();
    } catch(error:any){
      toast.error(error?.message||'Erro ao registrar entrada');
    } finally {
      setBusy(false);
    }
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
    doc.text('Produtos nesta lista: '+filtered.length+'  |  Itens em atenção: '+attention.length+'  |  Quantidade total: '+brQty(totalQty),14,32);
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
            return <button key={t.key} type="button" aria-pressed={tab===t.key&&productMetric===null}
              aria-expanded={tab===t.key&&productMetric===null} onClick={()=>toggleTab(t.key)}
              className={'flex min-h-[102px] flex-col items-start justify-between rounded-xl border p-4 text-left transition hover:border-violet-400 '+(tab===t.key&&productMetric===null?'border-violet-500 bg-[#241a32]':'border-[#30283a] bg-[#0d1017]')}>
              <Icon className={'h-6 w-6 '+(tab===t.key?'text-[#ffc400]':'text-violet-400')}/>
              <div><div className="text-base font-bold text-white">{t.label}</div><div className="mt-1 text-xs text-zinc-400">{hint}</div></div>
            </button>;
          })}
        </nav>
        <div className="flex gap-2">
          {!staffPortal&&TABS.filter(t=>t.key==='visao'||t.key==='relatorios').map(t=>{const Icon=t.icon;return <button key={t.key} type="button" onClick={()=>toggleTab(t.key)} aria-pressed={tab===t.key} aria-expanded={tab===t.key} className={'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold '+(tab===t.key?'border-violet-500 bg-[#312048] text-[#ffc400]':'border-[#30283a] text-zinc-400 hover:text-white')}><Icon className="h-4 w-4"/>{t.label}</button>;})}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores do estoque — clique para abrir detalhes">
        {([
          {key:'produtos',title:'Produtos em uso',value:currentProducts.length,Icon:Package,color:'text-violet-400'},
          {key:'quantidade',title:'Quantidade em uso',value:brQty(totalQty),Icon:Archive,color:'text-emerald-400'},
          {key:'reposicao',title:'Em uso: precisam de reposição',value:attention.length,Icon:TriangleAlert,color:'text-amber-400'},
          {key:'sem_saldo',title:'Em uso: sem saldo',value:currentProducts.filter(i=>Number(i.saldo_atual)===0).length,Icon:ArrowDownCircle,color:'text-red-400'},
        ] as const).map(metric=>{
          const isOpen=tab==='produtos'&&productMetric===metric.key;
          const Icon=metric.Icon;
          return <button key={metric.key} type="button" aria-expanded={isOpen}
            aria-pressed={isOpen} onClick={()=>toggleMetric(metric.key)}
            className={wrapBox+' text-left transition hover:border-violet-400 '+(isOpen?'border-violet-500 bg-[#241a32]':'')}>
            <div className="text-xs text-zinc-400">{metric.title}</div>
            <div className="mt-3 flex items-center justify-between"><strong className="text-3xl">{metric.value}</strong><Icon className={'h-7 w-7 '+metric.color}/></div>
            <div className="mt-2 text-[11px] text-zinc-500">{isOpen?'Clique para fechar':'Clique para consultar'}</div>
          </button>;
        })}
      </div>
      {tab==='visao'&&<>
        <div className={'grid gap-4 '+(!staffPortal?'xl:grid-cols-2':'')}>
          <section className={wrapBox}><h2 className="mb-3 text-lg font-bold">Estoque em atenção</h2><div className="max-h-[440px] overflow-y-auto">{attention.length?attention.slice(0,25).map(i=><button onClick={()=>{setCode(String(i.codigo));setTab('entrada');}} key={i.id} className="flex w-full items-center justify-between border-b border-[#29242e] py-3 text-left text-sm hover:text-[#ffc400]"><span><span className="mr-2 text-zinc-500">{i.codigo}</span>{i.descricao}</span><span className="ml-2 shrink-0 font-bold text-amber-400">{brQty(Number(i.saldo_atual))} {i.unidade}</span></button>):<p className="text-sm text-zinc-500">Nenhum item abaixo do mínimo informado.</p>}</div></section>
          {!staffPortal&&<section className={wrapBox}><h2 className="mb-3 text-lg font-bold">Controle e rastreabilidade</h2><div className="space-y-3 text-sm text-zinc-300"><p>Inventário histórico importado e identificado como origem Excel.</p><p>Cada entrada e saída nova grava usuário autenticado, data, quantidade e saldo anterior e posterior.</p><p>As datas ausentes ou inconsistentes do arquivo original permanecem sinalizadas, sem data fabricada.</p><p>Este controle não altera os materiais, cargas ou saldos do almoxarifado dos mecânicos.</p></div><button onClick={()=>setTab('historico')} className="mt-4 text-sm font-bold text-violet-400 hover:underline">Abrir histórico completo →</button></section>}
        </div>

      </>}
      {tab==='produtos'&&<section className={wrapBox}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{productMetric==='reposicao'?'Produtos que precisam de reposição':productMetric==='sem_saldo'?'Produtos sem saldo':productMetric==='quantidade'?'Quantidades disponíveis por produto':'Materiais do escritório'}</h2><div className="flex gap-2">{!staffPortal&&access.pode_gerenciar&&<button className={primaryButton} onClick={()=>setProductOpen(!productOpen)}><Plus className="h-4 w-4"/> Produto</button>}{!staffPortal&&<button className="rounded-lg border border-[#44334f] px-4 text-sm hover:border-violet-500" onClick={()=>downloadCSV()}>Exportar CSV</button>}</div></div>
        {productOpen&&<form onSubmit={submitItem} className="mb-5 grid gap-3 rounded-xl border border-violet-500/40 p-4 md:grid-cols-3">
          <input required type="number" min="1" placeholder="Código" className={inputStyle} value={newItem.codigo} onChange={e=>setNewItem({...newItem,codigo:e.target.value})}/>
          <input required placeholder="Descrição" className={inputStyle} value={newItem.descricao} onChange={e=>setNewItem({...newItem,descricao:e.target.value})}/>
          <input placeholder="Unidade" className={inputStyle} value={newItem.unidade} onChange={e=>setNewItem({...newItem,unidade:e.target.value})}/>
          <input placeholder="Aplicação" className={inputStyle} value={newItem.aplicacao} onChange={e=>setNewItem({...newItem,aplicacao:e.target.value})}/>
          <input placeholder="Mínimo" type="number" className={inputStyle} value={newItem.minimo} onChange={e=>setNewItem({...newItem,minimo:e.target.value})}/>
          <input placeholder="Máximo" type="number" className={inputStyle} value={newItem.maximo} onChange={e=>setNewItem({...newItem,maximo:e.target.value})}/>
          <button disabled={busy} className={primaryButton}>Cadastrar produto</button>
        </form>}
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Filtrar produtos atuais e de arquivo">
          {([
            {key:'atual',label:'Em uso',count:currentProducts.length},
            {key:'arquivo',label:'Arquivo / antigos',count:legacyProducts.length},
            {key:'todos',label:'Todos',count:items.length},
          ] as const).map(scope=><button key={scope.key} type="button" aria-pressed={productScope===scope.key}
            onClick={()=>{setProductScope(scope.key);setProductMetric(null);setSearch('');}}
            className={'rounded-lg border px-3 py-2 text-xs font-bold '+(productScope===scope.key?'border-violet-400 bg-violet-500/20 text-white':'border-[#44334f] text-zinc-400 hover:text-white')}>
            {scope.label} ({scope.count})
          </button>)}
        </div>
        <p className="mb-3 text-xs text-zinc-400">Em uso: produtos movimentados desde 2024 ou cadastrados agora. Os mais antigos ficam no arquivo, sem alterar saldo ou histórico; a busca encontra todos.</p>
        <div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500"/><input className={inputStyle+' pl-10'} placeholder="Pesquisar também nos produtos antigos por código, material ou aplicação..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <p className="mb-3 text-xs text-zinc-500">{filtered.length} produto(s) encontrado(s){productMetric==='quantidade'?' • Quantidade total: '+brQty(totalQty):''}</p>
        <div className="max-h-[68vh] overflow-auto rounded-lg border border-[#30283a]" aria-label="Produtos com cabeçalho fixo durante a rolagem">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 z-20 bg-[#15121b] text-xs uppercase text-zinc-300 shadow-[0_2px_0_#44334f]"><tr>{['Código','Produto / aplicação','Unidade','Saldo','Mínimo','Máximo','Situação','Ações'].map(h=><th scope="col" key={h} className="sticky top-0 bg-[#15121b] border-b border-[#44334f] p-3">{h}</th>)}</tr></thead>
            <tbody>{filtered.map(i=>{
              const low=attention.includes(i),zero=Number(i.saldo_atual)===0;
              return <tr key={i.id} className="border-b border-[#241f29] hover:bg-white/[.03]">
                <td className="p-3 font-bold text-violet-400">{i.codigo}</td>
                <td className="p-3 font-semibold">{i.descricao}<div className="mt-1 text-xs font-normal text-zinc-500">{i.aplicacao||'Material do escritório'}</div></td>
                <td className="p-3 text-zinc-400">{i.unidade}</td>
                <td className={'p-3 font-black tabular-nums '+(zero?'text-red-400':low?'text-amber-400':'text-[#ffc400]')}>{brQty(Number(i.saldo_atual))}</td>
                <td className="p-3 text-zinc-400">{i.estoque_minimo??'—'}</td><td className="p-3 text-zinc-400">{i.estoque_maximo??'—'}</td>
                <td className={'p-3 font-semibold '+(zero?'text-red-400':low?'text-amber-400':'text-emerald-400')}>{zero?'SEM SALDO':low?'REPOR':'DISPONÍVEL'}</td>
                <td className="p-3"><div className="flex gap-3"><button onClick={()=>{setCode(String(i.codigo));setTab('entrada');}} className="text-xs font-bold text-emerald-400 hover:underline">Entrada</button><button disabled={zero} onClick={()=>{setCode(String(i.codigo));setTab('saida');}} className="text-xs font-bold text-amber-400 hover:underline disabled:opacity-30">Saída</button>{access.pode_gerenciar&&<><button type="button" onClick={()=>openCorrection('editar_produto',i)} className="text-xs font-bold text-violet-300 hover:underline">Editar</button><button type="button" onClick={()=>openCorrection('ajustar_saldo',i)} className="text-xs font-bold text-[#ffc400] hover:underline">Ajustar saldo</button></>}</div></td>
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
            <input type="search" value={materialSearch} onChange={e=>setMaterialSearch(e.target.value)}
              placeholder="Buscar produto pelo nome ou código, inclusive no arquivo" className={inputStyle+' mb-1'} />
            <select required={tab==='entrada'} value={code} onChange={e=>setCode(e.target.value)} className={inputStyle}>
              <option value="">Selecione pelo código ou descrição</option>
              {selectableForMove.map(i=><option key={i.id} value={i.codigo}>{i.codigo} — {i.descricao} • Saldo {brQty(Number(i.saldo_atual))}{!isCurrentProduct(i)?' • Arquivo':''}</option>)}
            </select>
            <span className="text-[11px] text-zinc-500">
              {selectableForMove.length} produto(s) na seleção.
              {tab==='saida'?' Saídas mostram apenas materiais com saldo; procure pelo nome para encontrar itens antigos.':' Pesquise para localizar também materiais antigos.'}
            </span>
          </label>
          {selected&&<div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-sm"><strong>{selected.descricao}</strong><div className="mt-1 text-zinc-300">Saldo disponível: <b className="text-[#ffc400]">{brQty(Number(selected.saldo_atual))} {selected.unidade}</b></div></div>}
          <label className="grid gap-1 text-xs text-zinc-400">Quantidade
            <input required={tab==='entrada'} type="number" step="any" min="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="1" className={inputStyle}/>
          </label>
          {tab==='saida'&&<>
            <button type="button" disabled={busy||!access.pode_movimentar}
              onClick={addWithdrawalItem}
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-violet-500 bg-violet-500/15 px-4 text-sm font-bold text-violet-100 hover:bg-violet-500/25 disabled:opacity-40">
              <Plus className="h-5 w-5"/> Adicionar produto à saída
            </button>
            <div className="overflow-hidden rounded-xl border border-[#4d3a62] bg-[#11101a]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#4d3a62] bg-[#20182c] px-4 py-3">
                <div><h3 className="text-sm font-black text-white">Itens desta saída</h3>
                  <p className="mt-1 text-xs text-zinc-400">Como na entrega de EPI: adicione quantos materiais precisar, confira e confirme tudo junto.</p></div>
                <span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs font-bold text-violet-200">{withdrawalItems.length} produto(s)</span>
              </div>
              {withdrawalItems.length===0
                ? <p className="px-4 py-7 text-center text-sm text-zinc-400">Nenhum produto adicionado. Escolha o material e clique em “Adicionar produto à saída”.</p>
                : <div className="divide-y divide-[#35283f]">{withdrawalItems.map((entry,index)=>{
                    const product=items.find(item=>item.codigo===entry.codigo);
                    const qty=Number(entry.quantidade.replace(',','.'));
                    const invalid=!product||!Number.isFinite(qty)||qty<=0||qty>Number(product.saldo_atual);
                    return <div key={entry.codigo} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_125px_45px] md:items-end">
                      <div className="min-w-0">
                        <div className="mb-1 text-[11px] font-bold text-violet-300">ITEM {index+1} · CÓDIGO {entry.codigo}</div>
                        <div className="text-sm font-semibold text-white">{product?.descricao||'Produto não encontrado'}</div>
                        <div className="mt-1 text-xs text-zinc-400">Saldo: {brQty(Number(product?.saldo_atual||0))} {product?.unidade||''}</div>
                      </div>
                      <label className="grid gap-1 text-xs text-zinc-400">Quantidade
                        <input aria-label={'Quantidade de '+(product?.descricao||entry.codigo)} type="number" min="0.001" step="any"
                          className={inputStyle+(invalid?' border-red-400':'')}
                          value={entry.quantidade}
                          onChange={e=>setWithdrawalItems(current=>current.map(it=>it.codigo===entry.codigo?{...it,quantidade:e.target.value}:it))}/>
                      </label>
                      <button type="button" title={'Remover '+(product?.descricao||entry.codigo)} aria-label={'Remover '+(product?.descricao||entry.codigo)}
                        onClick={()=>removeWithdrawalItem(entry.codigo)}
                        className="flex h-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">
                        <Trash2 className="h-4 w-4"/>
                      </button>
                      {invalid&&<p className="text-xs text-red-400 md:col-span-3">Quantidade inválida ou acima do saldo disponível. Corrija antes de confirmar.</p>}
                    </div>;
                  })}</div>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#4d3a62] bg-[#181320] px-4 py-3 text-xs text-zinc-300">
                <span>Você pode editar a quantidade ou remover um item sem perder os demais.</span>
                <strong>{withdrawalItems.length} produto(s) · {brQty(withdrawalTotal)} unidade(s) de diferentes materiais</strong>
              </div>
            </div>
          </>}
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
          <button disabled={busy||!access.pode_movimentar||(tab==='saida'&&withdrawalItems.length===0)} className={primaryButton+' min-h-12'}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}{tab==='saida'?'Confirmar saída de '+withdrawalItems.length+' produto(s)':'Confirmar entrada'}</button>
        </form>
      </section>}
      {(isStockTab||tab==='historico'||(!staffPortal&&tab==='relatorios'))&&<section className={wrapBox}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{tab==='entrada'?'Lista de entradas':tab==='saida'?'Lista de saídas':tab==='historico'?'Histórico de movimentações':'Relatórios'}</h2><p className="text-xs text-zinc-500">{moveCount} registros nos filtros • 80 por página</p></div><div className="flex gap-2"><button className="rounded-lg border border-[#44334f] px-4 py-2 text-sm hover:border-violet-400" onClick={()=>downloadCSV(true)}><Download className="mr-2 inline h-4 w-4"/>CSV da página</button>{tab==='relatorios'&&<><button className="rounded-lg border border-[#44334f] px-4 py-2 text-sm" onClick={()=>downloadCSV()}>Estoque CSV</button><button className={primaryButton} onClick={downloadPDF}><FileText className="h-4 w-4"/>Estoque PDF</button></>}</div></div>
        <div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500"/><input aria-label="Pesquisar produto nas movimentações" className={inputStyle+' pl-10'} placeholder="Pesquisar produto pelo código, nome ou aplicação..." value={movementSearch} onChange={e=>{setMovementSearch(e.target.value);setPage(0);}}/></div>
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Período das movimentações">
          {([
            {key:'atual',label:'Movimentos de 2020 até hoje'},
            {key:'arquivo',label:'Arquivo / datas antigas ou suspeitas'},
            {key:'todos',label:'Todo o histórico'},
          ] as const).map(scope=><button key={scope.key} type="button" aria-pressed={movementScope===scope.key&&!month}
            onClick={()=>{setMovementScope(scope.key);setMonth('');setPage(0);}}
            className={'rounded-lg border px-3 py-2 text-xs font-bold '+(movementScope===scope.key&&!month?'border-violet-400 bg-violet-500/20 text-white':'border-[#44334f] text-zinc-400 hover:text-white')}>
            {scope.label}
          </button>)}
        </div>
        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <label className="text-xs text-zinc-400">Competência<input type="month" className={inputStyle+' mt-1'} value={month} onChange={e=>{setMonth(e.target.value);setPage(0);}}/></label>
          {!isStockTab&&<label className="text-xs text-zinc-400">Tipo<select className={inputStyle+' mt-1'} value={filterType} onChange={e=>{setFilterType(e.target.value);setPage(0);}}><option value="">Todos</option><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label>}
          <label className="text-xs text-zinc-400">Produto<select className={inputStyle+' mt-1'} value={filterItem} onChange={e=>{setFilterItem(e.target.value);setPage(0);}}><option value="">Todos</option>{items.map(i=><option key={i.id} value={i.id}>{i.codigo} — {i.descricao}</option>)}</select></label>
          <div className="flex items-end"><button className="h-10 rounded-lg border border-[#44334f] px-4 text-sm hover:border-violet-400" onClick={()=>{setMovementScope('todos');setMonth('');setFilterType('');setFilterItem('');setPage(0);}}>Todo o histórico</button></div>
        </div>
        <div className="overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-xs uppercase text-zinc-500"><tr>{['Data','Tipo','Código / Produto','Qtd.','Para quem / Origem','Responsável','Observações','Correção'].map(h=><th key={h} className="border-b border-[#352d3d] p-3">{h}</th>)}</tr></thead><tbody>{moves.map(m=>{const i=itemById.get(m.item_id);return <tr key={m.id} className="border-b border-[#251f2b]"><td className={'p-3 whitespace-nowrap '+(m.data_suspeita?'text-amber-400':'text-zinc-400')}>{brDate(m.data_movimento)}{m.data_suspeita&&<TriangleAlert className="ml-1 inline h-3 w-3"/>}</td><td className={'p-3 font-semibold '+(m.tipo==='entrada'?'text-emerald-400':'text-amber-400')}>{m.tipo.toUpperCase()}</td><td className="p-3"><span className="text-violet-400">{i?.codigo||'—'} </span>{i?.descricao||'Produto'}</td><td className="p-3">{brQty(Number(m.quantidade))}</td><td className="p-3">{m.destinatario||m.origem_responsavel||'—'}</td><td className="p-3 text-xs text-zinc-400">{m.historico_importado?'Histórico Excel':m.ator_email||'—'}</td><td className="p-3 text-xs text-zinc-400">{m.observacao||'—'}{m.cancelado_em&&<strong className="block text-red-400">CANCELADO</strong>}</td><td className="p-3">{access.pode_gerenciar&&!m.historico_importado&&!m.cancelado_em&&<div className="flex gap-3"><button type="button" onClick={()=>openCorrection('editar_movimento',undefined,m)} className="text-xs font-bold text-violet-300">Editar</button><button type="button" onClick={()=>openCorrection('cancelar_movimento',undefined,m)} className="text-xs font-bold text-red-400">Excluir</button></div>}</td></tr>;})}</tbody></table></div>
        <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button className="rounded-lg border border-[#44334f] px-3 py-2 disabled:opacity-30" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page+1} / {Math.max(1,Math.ceil(moveCount/80))}</span><button className="rounded-lg border border-[#44334f] px-3 py-2 disabled:opacity-30" disabled={(page+1)*80>=moveCount} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
        {tab==='relatorios'&&<p className="mt-3 text-xs text-zinc-500">CSV de movimentações exporta os registros da página exibida. PDF e CSV de estoque exportam a posição atual dos materiais.</p>}
      </section>}
      {tab==='historico'&&access.pode_gerenciar&&<section className={wrapBox}>
        <h2 className="mb-2 text-xl font-bold">Auditoria de correções</h2>
        <p className="mb-4 text-xs text-zinc-400">Responsável, motivo, data e valores anteriores e novos de cada correção.</p>
        <div className="max-h-[400px] space-y-2 overflow-y-auto">
          {audit.length===0&&<p className="text-sm text-zinc-500">Nenhuma correção registrada.</p>}
          {audit.map(a=><article key={a.id} className="rounded-lg border border-[#44334f] p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><strong className="text-violet-300">{a.operacao.replaceAll('_',' ').toUpperCase()}</strong><span className="text-xs text-zinc-400">{new Date(a.criado_em).toLocaleString('pt-BR')}</span></div>
            <p>{a.ator_nome} · {a.ator_email}</p><p className="mt-1 text-[#ffc400]">Motivo: {a.motivo}</p>
            <details className="mt-2 text-xs text-zinc-400"><summary className="cursor-pointer">Ver dados anteriores e novos</summary>
              <pre className="overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(a.dados_anteriores,null,2)}{'\n'}DEPOIS: {JSON.stringify(a.dados_novos,null,2)}</pre>
            </details>
          </article>)}
        </div>
      </section>}
    </div>
    {correction&&<div role="dialog" aria-modal="true" aria-label="Correção de estoque" className="fixed inset-0 z-[100] flex items-center justify-center overflow-auto bg-black/80 p-4">
      <form onSubmit={submitCorrection} className="w-full max-w-xl space-y-4 rounded-xl border border-violet-500 bg-[#101019] p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{
          correction.kind==='ajustar_saldo'?'Ajustar saldo manualmente':
          correction.kind==='editar_produto'?'Editar produto':
          correction.kind==='cancelar_movimento'?'Excluir lançamento':'Editar entrada / saída'
        }</h2><button type="button" onClick={()=>setCorrection(null)} className="rounded-lg border px-3 py-1">Fechar</button></div>
        <p className="text-sm text-zinc-400">{correction.item?.descricao||itemById.get(correction.move?.item_id||'')?.descricao||'Movimentação'}</p>
        {correction.kind==='cancelar_movimento'&&<p className="rounded-lg border border-red-500/40 p-3 text-sm text-red-200">O lançamento será cancelado, preservado no histórico e o saldo recalculado.</p>}
        {correction.kind==='ajustar_saldo'&&<label className="block text-sm">Novo saldo físico<input required type="number" min="0" step="0.001" className={inputStyle+' mt-1'} value={fields.saldo_atual||''} onChange={e=>setFields(f=>({...f,saldo_atual:e.target.value}))}/><small className="mt-1 block text-zinc-400">Saldo anterior: {brQty(Number(correction.item?.saldo_atual||0))}</small></label>}
        {correction.kind==='editar_produto'&&<div className="grid gap-3 sm:grid-cols-2">{([
          ['codigo','Código','number'],['descricao','Descrição','text'],['unidade','Unidade','text'],['aplicacao','Aplicação','text'],['estoque_minimo','Mínimo','number'],['estoque_maximo','Máximo','number']
        ] as const).map(([key,label,type])=><label key={key} className="text-sm">{label}<input type={type} required={['codigo','descricao','unidade'].includes(key)} min={type==='number'?'0':undefined} step={type==='number'?'any':undefined} className={inputStyle+' mt-1'} value={fields[key]||''} onChange={e=>setFields(f=>({...f,[key]:e.target.value}))}/></label>)}</div>}
        {correction.kind==='editar_movimento'&&<div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Tipo<select className={inputStyle+' mt-1'} value={fields.tipo||'entrada'} onChange={e=>setFields(f=>({...f,tipo:e.target.value}))}><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label>
          {([
            ['quantidade','Quantidade','number'],['data_movimento','Data','date'],['destinatario','Destinatário / origem','text'],['preco_unitario','Valor unitário','number'],['observacao','Observação','text']
          ] as const).map(([key,label,type])=><label key={key} className="text-sm">{label}<input type={type} required={key==='quantidade'} min={type==='number'?'0':undefined} step={type==='number'?'any':undefined} className={inputStyle+' mt-1'} value={fields[key]||''} onChange={e=>setFields(f=>({...f,[key]:e.target.value}))}/></label>)}
        </div>}
        <label className="block text-sm font-bold text-[#ffc400]">Motivo obrigatório<textarea required minLength={5} rows={3} className={inputStyle+' mt-1 h-auto py-2'} placeholder="O que estava errado e por que está corrigindo?" value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setCorrection(null)} className="rounded-lg border px-4 py-2">Cancelar</button>
          <button disabled={busy||reason.trim().length<5} className={primaryButton}>{busy?'Salvando...':'Confirmar e registrar auditoria'}</button>
        </div>
      </form>
    </div>}
  </main>;
}
