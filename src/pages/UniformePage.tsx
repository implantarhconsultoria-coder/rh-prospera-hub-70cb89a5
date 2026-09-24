import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UNIFORM_TYPES, type DeliveryItem } from '@/data/deliveries';
import { Shirt, Plus, Trash2, FileText, Search, Package, ArrowDownCircle, RefreshCw, AlertTriangle, History, ChevronDown, ClipboardList, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';

const db = supabase as any;
type Unidade = 'SAO_PAULO' | 'PRAIA_GRANDE' | 'GOIANIA';
type Mode = 'painel' | 'estoque' | 'entregas' | 'historico';
type StockMetric = 'variacoes' | 'quantidade' | 'reposicao' | 'sem_saldo';
type Stock = { id:string; unidade:Unidade; tipo:string; tamanho:string; modelo:string; saldo:number; minimo:number; observacao:string|null; atualizado_em:string };
type RecordedDelivery = { id:string; funcionario_id:string; company_id:string; unidade:Unidade; data_entrega:string; itens:DeliveryItem[]; gerado_por:string; criado_em:string };
type Move={id:string;estoque_id:string;tipo:'entrada'|'contagem'|'saida';quantidade:number;saldo_antes:number;saldo_depois:number;funcionario_id:string|null;criado_em:string;observacao:string|null};
type Line = { key:string; estoqueId:string; quantidade:number };
const UNIDADES:{value:Unidade;label:string}[]=[
  {value:'SAO_PAULO',label:'São Paulo'},
  {value:'PRAIA_GRANDE',label:'Praia Grande'},
  {value:'GOIANIA',label:'Goiânia'},
];
const SIZE_OPTIONS=['M','G','GG','XG','G1','G2','G3'];
const MODELO_OPTIONS=['MANGA CURTA','MANGA LONGA','POLO','PADRAO','USADO'];
const fmt=(n:number)=>new Intl.NumberFormat('pt-BR').format(n);
const UNIFORM_CARDS = [
  {key:'painel',label:'Visão geral',description:'Resumo e orientações',icon:ClipboardList},
  {key:'estoque',label:'Estoque / contagem',description:'Conferir e receber peças',icon:Package},
  {key:'entregas',label:'Entregar e imprimir',description:'Registrar e abater saldo',icon:Shirt},
  {key:'historico',label:'Histórico',description:'Movimentos e reimpressão',icon:History},
] as const;
// Rascunho da ficha recebida em 23/09/2026: NENHUM valor é importado sem conferência.
// A ficha não tem unidade assinalada; alguns números e modelos manuscritos são incertos.
type DraftRow={id:string;tipo:string;modelo:string;tamanho:string;saldo:string;duvidoso:boolean;marcado:boolean};
const INITIAL_SHEET_DRAFT:DraftRow[]=[
  {id:'cm-m',tipo:'Camiseta operacional',modelo:'MANGA CURTA',tamanho:'M',saldo:'8',duvidoso:false,marcado:true},
  {id:'ml-m',tipo:'Camiseta operacional',modelo:'MANGA LONGA',tamanho:'M',saldo:'4',duvidoso:false,marcado:true},
  {id:'cm-g',tipo:'Camiseta operacional',modelo:'MANGA CURTA',tamanho:'G',saldo:'6',duvidoso:false,marcado:true},
  {id:'ml-g',tipo:'Camiseta operacional',modelo:'MANGA LONGA',tamanho:'G',saldo:'3',duvidoso:false,marcado:true},
  {id:'cm-gg',tipo:'Camiseta operacional',modelo:'MANGA CURTA',tamanho:'GG',saldo:'15',duvidoso:true,marcado:false},
  {id:'ml-gg',tipo:'Camiseta operacional',modelo:'MANGA LONGA',tamanho:'GG',saldo:'1',duvidoso:true,marcado:false},
  {id:'cm-g1',tipo:'Camiseta operacional',modelo:'MANGA CURTA',tamanho:'G1',saldo:'6',duvidoso:false,marcado:true},
  {id:'ml-g1',tipo:'Camiseta operacional',modelo:'MANGA LONGA',tamanho:'G1',saldo:'6',duvidoso:false,marcado:true},
  {id:'cm-g2',tipo:'Camiseta operacional',modelo:'MANGA CURTA',tamanho:'G2',saldo:'2',duvidoso:true,marcado:false},
  {id:'cm-g3',tipo:'Camiseta operacional',modelo:'MANGA CURTA',tamanho:'G3',saldo:'4',duvidoso:true,marcado:false},
  {id:'ml-g3',tipo:'Camiseta operacional',modelo:'MANGA LONGA',tamanho:'G3',saldo:'2',duvidoso:true,marcado:false},
  {id:'cal-m',tipo:'Calça operacional',modelo:'PADRAO',tamanho:'M',saldo:'6',duvidoso:false,marcado:true},
  {id:'cal-g',tipo:'Calça operacional',modelo:'PADRAO',tamanho:'G',saldo:'8',duvidoso:false,marcado:true},
  {id:'cal-gg',tipo:'Calça operacional',modelo:'PADRAO',tamanho:'GG',saldo:'7',duvidoso:false,marcado:true},
  {id:'cal-g1',tipo:'Calça operacional',modelo:'PADRAO',tamanho:'G1',saldo:'6',duvidoso:false,marcado:true},
  {id:'cal-g2',tipo:'Calça operacional',modelo:'PADRAO',tamanho:'G2',saldo:'1',duvidoso:true,marcado:false},
  {id:'cal-g3',tipo:'Calça operacional',modelo:'PADRAO',tamanho:'G3',saldo:'1',duvidoso:true,marcado:false},
];

const UniformePage:React.FC=()=>{
  const {companies,employees,session}=useApp();
  const navigate=useNavigate();
  const [mode,setMode]=useState<Mode|null>(null);
  const [metric,setMetric]=useState<StockMetric|null>(null);
  const [draft,setDraft]=useState<DraftRow[]>(INITIAL_SHEET_DRAFT);
  const [draftOpen,setDraftOpen]=useState(false);
  const [draftConfirmed,setDraftConfirmed]=useState(false);
  const [unit,setUnit]=useState<Unidade|''>('');
  const [stock,setStock]=useState<Stock[]>([]);
  const [history,setHistory]=useState<RecordedDelivery[]>([]);
  const [movements,setMovements]=useState<Move[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [stockError,setStockError]=useState('');
  const [type,setType]=useState(UNIFORM_TYPES[0]);
  const [size,setSize]=useState('M');
  const [model,setModel]=useState('MANGA CURTA');
  const [count,setCount]=useState('');
  const [operation,setOperation]=useState<'contagem'|'entrada'>('contagem');
  const [minimum,setMinimum]=useState('0');
  const [observation,setObservation]=useState('');
  const [search,setSearch]=useState('');
  const [selectedEmpId,setSelectedEmpId]=useState('');
  const [lines,setLines]=useState<Line[]>([]);
  const [deliveryDate,setDeliveryDate]=useState(new Date().toISOString().slice(0,10));
  const requestId=useRef<string>(crypto.randomUUID());

  const refresh=useCallback(async()=>{
    setLoading(true);setStockError('');
    const [s,h,m]=await Promise.all([
      db.from('uniforme_estoque').select('id,unidade,tipo,tamanho,modelo,saldo,minimo,observacao,atualizado_em').order('tipo').order('tamanho').order('modelo'),
      db.from('uniforme_entregas').select('id,funcionario_id,company_id,unidade,data_entrega,itens,gerado_por,criado_em').order('criado_em',{ascending:false}).limit(80),
      db.from('uniforme_movimentos').select('id,estoque_id,tipo,quantidade,saldo_antes,saldo_depois,funcionario_id,criado_em,observacao').order('criado_em',{ascending:false}).limit(200),
    ]);
    if(s.error){setStockError('Não foi possível carregar o estoque: '+s.error.message);setStock([]);}
    else setStock((s.data||[]) as Stock[]);
    if(h.error)toast.error('Histórico de uniformes indisponível: '+h.error.message);
    else setHistory((h.data||[]) as RecordedDelivery[]);
    if(m.error)toast.error('Movimentações de uniformes indisponíveis: '+m.error.message);
    else setMovements((m.data||[]) as Move[]);
    setLoading(false);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const unitStock=useMemo(()=>unit?stock.filter(s=>s.unidade===unit):[],[stock,unit]);
  const total=unitStock.reduce((sum,s)=>sum+Number(s.saldo),0);
  const low=unitStock.filter(s=>s.saldo<=s.minimo);
  const soldOut=unitStock.filter(s=>s.saldo===0);
  const visibleStock=unitStock.filter(s=>metric==='reposicao'?low.includes(s):metric==='sem_saldo'?s.saldo===0:true)
    .sort((a,b)=>metric==='quantidade'?Number(b.saldo)-Number(a.saldo):a.tipo.localeCompare(b.tipo,'pt-BR'));
  const toggleMode=(next:Mode)=>{
    setMode(current=>current===next&&metric===null?null:next);
    setMetric(null);
  };
  const toggleMetric=(next:StockMetric)=>{
    if(mode==='estoque'&&metric===next){setMode(null);setMetric(null);}
    else {setMode('estoque');setMetric(next);}
  };
  const emp=employees.find(e=>e.id===selectedEmpId);
  const company=emp?companies.find(c=>c.id===emp.companyId):null;
  const filteredEmps=employees.filter(e=>e.status==='ativo'&&e.categoria==='operacional'&&
    [e.name,e.cargo,e.cpf,e.registro].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))).slice(0,40);
  const available=unitStock.filter(s=>s.saldo>0);
  const selectedStock=(id:string)=>unitStock.find(s=>s.id===id);
  const changed=()=>{requestId.current=crypto.randomUUID();};
  const editLine=(key:string,data:Partial<Line>)=>{setLines(old=>old.map(l=>l.key===key?{...l,...data}:l));changed();};

  const changeDraft=(id:string,change:Partial<DraftRow>)=>{
    setDraft(old=>old.map(row=>row.id===id?{...row,...change}:row));
    setDraftConfirmed(false);
  };
  const importDraft=async()=>{
    if(!unit){toast.error('Selecione primeiro a unidade indicada pelo responsável da contagem.');return;}
    if(!draftConfirmed){toast.error('Confirme que revisou a unidade, modelos e quantidades da ficha.');return;}
    const rows=draft.filter(d=>d.marcado);
    if(!rows.length){toast.error('Marque ao menos uma variação para lançar.');return;}
    if(rows.some(d=>!d.tipo.trim()||!d.modelo.trim()||!d.tamanho.trim()||!/^\d{1,6}$/.test(d.saldo))){
      toast.error('Revise as quantidades: somente inteiros iguais ou maiores que zero.');return;
    }
    const duplicates=rows.map(d=>[d.tipo,d.modelo,d.tamanho].join('|'));
    if(new Set(duplicates).size!==duplicates.length){toast.error('Há duas linhas iguais. Corrija antes de importar.');return;}
    if(rows.some(d=>unitStock.some(s=>s.tipo===d.tipo&&s.modelo===d.modelo&&s.tamanho===d.tamanho))){
      if(!window.confirm('Algumas variações já possuem saldo no banco. Esta contagem vai SUBSTITUIR o saldo atual dessas variações. Deseja continuar?'))return;
    }
    setBusy(true);
    const result=await db.rpc('uniforme_importar_contagem',{p_unidade:unit,p_linhas:rows.map(d=>({
      tipo:d.tipo,tamanho:d.tamanho,modelo:d.modelo,saldo:Number(d.saldo),
    })),p_observacao:'Levantamento físico enviado em 23/09/2026, conferido manualmente antes da importação'});
    setBusy(false);
    if(result.error){toast.error('Nenhum item importado: '+result.error.message);return;}
    toast.success(result.data+' variações importadas para '+UNIDADES.find(u=>u.value===unit)?.label+'.');
    setDraft(old=>old.map(d=>d.marcado?{...d,marcado:false}:d));
    setDraftConfirmed(false);setDraftOpen(false);
    await refresh();
  };
  const stockCount=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!unit){toast.error('Escolha a unidade física antes de registrar a contagem. A ficha digitalizada não marcou a unidade.');return;}
    const quantity=Number(count),min=Number(minimum);
    if(!Number.isSafeInteger(quantity)||quantity<0||!Number.isSafeInteger(min)||min<0||(operation==='entrada'&&quantity===0)){toast.error(operation==='entrada'?'Informe uma quantidade positiva.':'Informe quantidades inteiras maiores ou iguais a zero.');return;}
    if(!type.trim()||!size.trim()||!model.trim()){toast.error('Preencha tipo, tamanho e modelo.');return;}
    setBusy(true);
    const r=operation==='contagem'
      ? await db.rpc('uniforme_contar_estoque',{
          p_unidade:unit,p_tipo:type.trim(),p_tamanho:size.trim(),p_modelo:model.trim(),
          p_saldo:quantity,p_minimo:min,p_observacao:observation.trim()||null,
        })
      : await db.rpc('uniforme_entrar_estoque',{
          p_unidade:unit,p_tipo:type.trim(),p_tamanho:size.trim(),p_modelo:model.trim(),
          p_quantidade:quantity,p_observacao:observation.trim()||null,
        });
    setBusy(false);
    if(r.error){toast.error('Contagem não registrada: '+r.error.message);return;}
    toast.success(operation==='entrada'?'Entrada registrada e saldo somado.':'Contagem salva, com histórico de ajuste.');
    setCount('');setObservation('');
    await refresh();
  };
  const chooseStock=(s:Stock)=>{
    setUnit(s.unidade);setType(s.tipo);setSize(s.tamanho);setModel(s.modelo);
    setCount(String(s.saldo));setMinimum(String(s.minimo));setObservation(s.observacao||'');
  };
  const saveAndPrint=async()=>{
    if(busy)return;
    if(!emp||!company){toast.error('Selecione o funcionário e confirme a empresa.');return;}
    if(!unit){toast.error('Selecione de qual unidade física o uniforme sairá.');return;}
    if(!deliveryDate){toast.error('Informe a data da entrega.');return;}
    if(!lines.length){toast.error('Adicione ao menos um uniforme.');return;}
    if(lines.some(l=>!l.estoqueId||!Number.isSafeInteger(l.quantidade)||l.quantidade<=0)){toast.error('Revise produto e quantidade de todas as linhas.');return;}
    const ids=lines.map(l=>l.estoqueId);
    if(new Set(ids).size!==ids.length){toast.error('Item repetido: reúna a quantidade na mesma linha.');return;}
    if(lines.some(l=>!selectedStock(l.estoqueId)||l.quantidade>Number(selectedStock(l.estoqueId)?.saldo))){toast.error('Há produtos sem saldo suficiente na unidade selecionada.');return;}
    setBusy(true);
    const r=await db.rpc('uniforme_registrar_entrega',{
      p_entrega_id:requestId.current,p_funcionario_id:emp.id,p_company_id:company.id,
      p_unidade:unit,p_data_entrega:deliveryDate,
      p_itens:lines.map(l=>({estoque_id:l.estoqueId,quantidade:l.quantidade})),
    });
    setBusy(false);
    if(r.error){toast.error('A ficha não foi emitida e o estoque não foi baixado: '+r.error.message);return;}
    // A baixa acontece uma só vez, na confirmação; imprimir/reimprimir não provoca outra saída.
    const id=r.data as string;
    const items:DeliveryItem[]=lines.map(l=>{
      const s=selectedStock(l.estoqueId)!;
      return {tipo:s.tipo,descricao:s.modelo,tamanho:s.tamanho,quantidade:l.quantidade,observacao:''};
    });
    const previewData={delivery:{id,type:'uniforme' as const,date:deliveryDate,items},
      employee:emp,company,returnPath:'/admin/uniformes'};
    setLines([]);setSelectedEmpId('');setSearch('');changed();
    await refresh();
    navigate('/entrega-impressao',{state:{previewData}});
    toast.success('Entrega registrada e estoque abatido. Reimpressões não abatem novamente.');
  };
  const reprint=(d:RecordedDelivery)=>{
    const employee=employees.find(e=>e.id===d.funcionario_id);
    const co=companies.find(c=>c.id===d.company_id);
    if(!employee||!co){toast.error('Dados do funcionário ou da empresa indisponíveis para reimprimir.');return;}
    navigate('/entrega-impressao',{state:{previewData:{delivery:{
      id:d.id,type:'uniforme' as const,date:d.data_entrega,items:d.itens,
    },employee,company:co,returnPath:'/admin/uniformes'}}});
  };

  return <div className="space-y-5 animate-fade-in">
    <div className="card-premium p-6 gradient-primary text-primary-foreground flex items-center gap-4">
      <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center"><Shirt className="w-7 h-7"/></div>
      <div><h1 className="text-2xl font-bold font-display">Uniformes • Entregas e Estoque</h1>
        <p className="text-sm text-primary-foreground/75">Saldos por unidade, tamanho e modelo, com baixa vinculada à ficha.</p></div>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Seções de Uniformes — clique para abrir ou fechar">
      {UNIFORM_CARDS.map(item=>{
        const Icon=item.icon;
        const active=mode===item.key&&metric===null;
        return <button type="button" key={item.key} aria-expanded={active} aria-pressed={active}
          onClick={()=>toggleMode(item.key)}
          className={`flex min-h-[108px] flex-col items-start justify-between rounded-xl border p-4 text-left transition hover:border-violet-400 ${active?'border-violet-500 bg-[#241a32]':'border-[#30283a] bg-[#0d1017]'}`}>
          <div className="flex w-full items-center justify-between"><Icon className={`h-5 w-5 ${active?'text-[#ffc400]':'text-violet-400'}`}/><ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${active?'rotate-180':''}`}/></div>
          <div><div className="text-sm font-bold text-white">{item.label}</div><div className="mt-1 text-[11px] text-zinc-400">{item.description}</div></div>
        </button>;
      })}
    </div>
    <div className="flex justify-end"><Button variant="outline" size="sm" onClick={()=>void refresh()} disabled={loading}><RefreshCw className="mr-1 h-4 w-4"/>Atualizar dados</Button></div>
    {mode&&<div className="card-premium p-4">
      <label className="block text-xs font-bold text-muted-foreground mb-2">UNIDADE QUE GUARDA O ESTOQUE</label>
      <select className="w-full sm:w-80 rounded-md border p-2 bg-background text-foreground"
        value={unit} onChange={e=>{setUnit(e.target.value as Unidade|'');setLines([]);changed();}}>
        <option value="">Selecione a unidade física</option>
        {UNIDADES.map(u=><option key={u.value} value={u.value}>{u.label}</option>)}
      </select>
      {!unit&&<p className="mt-2 text-sm text-amber-600">A ficha enviada não identifica a unidade nem informa data/responsável. Escolha a unidade correta antes de lançar o inventário.</p>}
    </div>
    {mode&&stockError&&<div className="border border-destructive rounded-lg p-4 text-sm text-destructive">{stockError}</div>}
    {mode&&unit&&<div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {([
        {key:'variacoes',label:'Variações cadastradas',value:unitStock.length,icon:Package},
        {key:'quantidade',label:'Peças disponíveis',value:fmt(total),icon:Shirt},
        {key:'reposicao',label:'Precisam de reposição',value:low.length,icon:AlertTriangle},
        {key:'sem_saldo',label:'Sem saldo',value:soldOut.length,icon:ArrowDownCircle},
      ] as const).map(item=>{
        const Icon=item.icon,active=mode==='estoque'&&metric===item.key;
        return <button key={item.key} type="button" aria-expanded={active} aria-pressed={active}
          onClick={()=>toggleMetric(item.key)}
          className={`card-premium min-h-[104px] p-4 text-left transition hover:border-violet-400 ${active?'border-violet-500 bg-[#241a32]':''}`}>
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="mt-2 flex items-center justify-between gap-2"><strong className="text-2xl">{item.value}</strong><Icon className={`h-5 w-5 ${active?'text-[#ffc400]':'text-violet-400'}`}/></div>
          <div className="mt-2 text-[10px] text-zinc-500">{active?'Clique para fechar':'Clique para consultar'}</div>
        </button>;
      })}
    </div>}
    {mode==='painel'&&<div className="card-premium p-5 space-y-3">
      <h2 className="font-bold">Controle do estoque</h2>
      <p className="text-sm text-muted-foreground">1. Escolha a unidade e registre a contagem física em Estoque / contagem.</p>
      <p className="text-sm text-muted-foreground">2. Em Entregar e imprimir, selecione o funcionário, o modelo/tamanho e a quantidade disponíveis.</p>
      <p className="text-sm text-muted-foreground">3. Ao confirmar a entrega e gerar a ficha, o saldo é abatido de uma só vez. Reimprimir a mesma ficha não desconta novamente.</p>
      <p className="text-sm text-amber-600">Não importei automaticamente números duvidosos da ficha manuscrita nem atribuí uma unidade não marcada.</p>
      <div className="flex flex-wrap gap-2"><Button onClick={()=>setMode('estoque')}>Cadastrar estoque</Button>
        <Button variant="outline" onClick={()=>setMode('entregas')}>Entregar uniforme</Button></div>
    </div>}
    {mode==='estoque'&&<div className="space-y-4">
      <div className="card-premium p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-bold">Ficha manuscrita recebida • rascunho para conferência</h2>
            <p className="text-xs text-muted-foreground">Os números abaixo foram interpretados da digitalização; nada foi importado automaticamente.</p></div>
          <Button size="sm" variant="outline" onClick={()=>setDraftOpen(v=>!v)}>{draftOpen?'Recolher ficha':'Conferir e importar ficha'}</Button>
        </div>
        {draftOpen&&<>
          <p className="text-sm text-amber-600">A ficha não marca São Paulo, Praia Grande ou Goiânia. Confira a unidade acima. A caligrafia do GG, G2/G3, polos femininas e 20 camisetas usadas precisa de revisão; itens incertos iniciam desmarcados.</p>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-background"><tr className="border-b text-left text-xs text-muted-foreground">
                {['Lançar','Produto','Modelo','Tamanho','Quantidade','Leitura'].map(x=><th key={x} className="p-2">{x}</th>)}
              </tr></thead>
              <tbody>{draft.map(d=><tr key={d.id} className="border-b">
                <td className="p-2"><input type="checkbox" checked={d.marcado} onChange={e=>changeDraft(d.id,{marcado:e.target.checked})}/></td>
                <td className="p-2">{d.tipo}</td>
                <td className="p-2"><Input className="h-8 text-xs min-w-28" value={d.modelo} onChange={e=>changeDraft(d.id,{modelo:e.target.value})}/></td>
                <td className="p-2"><Input className="h-8 w-20 text-xs" value={d.tamanho} onChange={e=>changeDraft(d.id,{tamanho:e.target.value})}/></td>
                <td className="p-2"><Input className="h-8 w-20 text-xs" type="number" min="0" value={d.saldo} onChange={e=>changeDraft(d.id,{saldo:e.target.value})}/></td>
                <td className={'p-2 text-xs '+(d.duvidoso?'text-amber-600':'text-emerald-600')}>{d.duvidoso?'Conferir caligrafia':'Mais legível'}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Não preenchi itens em branco como zero. Polos por tamanho, tamanhos EXG/XGG e camisetas usadas exigem cadastro separado após conferência, para não misturar peças.</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={draftConfirmed} onChange={e=>setDraftConfirmed(e.target.checked)}/>
            Confirmei a unidade física, o tipo/modelo, os tamanhos e os números selecionados.</label>
          <Button type="button" disabled={busy||!unit||!draftConfirmed||!draft.some(d=>d.marcado)} onClick={()=>void importDraft()}>
            Importar {draft.filter(d=>d.marcado).length} variações conferidas
          </Button>
        </>}
      </div>
      <form onSubmit={stockCount} className="card-premium p-5 space-y-4">
        <h2 className="font-bold">Contagem física / entrada de novas peças</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={operation==='contagem'?'default':'outline'} onClick={()=>{setOperation('contagem');setCount('');}}>Definir saldo físico</Button>
          <Button type="button" size="sm" variant={operation==='entrada'?'default':'outline'} onClick={()=>{setOperation('entrada');setCount('');}}>Somar peças recebidas</Button>
        </div>
        <p className="text-xs text-muted-foreground">{operation==='contagem'?'Informe o saldo total que contou fisicamente, não uma entrada. A diferença ficará no histórico.':'Informe apenas as peças que chegaram. O sistema SOMA ao saldo atual e registra a entrada.'}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-muted-foreground">Produto<select value={type} onChange={e=>setType(e.target.value)} className="w-full border rounded p-2 mt-1 bg-background text-foreground">
            {UNIFORM_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">Modelo (ex.: manga curta, polo)
            <Input value={model} onChange={e=>setModel(e.target.value)} list="modelos-uniforme" className="mt-1"/>
            <datalist id="modelos-uniforme">{MODELO_OPTIONS.map(m=><option key={m} value={m}/>)}</datalist>
          </label>
          <label className="text-xs text-muted-foreground">Tamanho
            <Input value={size} onChange={e=>setSize(e.target.value)} list="tamanhos-uniforme" className="mt-1"/>
            <datalist id="tamanhos-uniforme">{SIZE_OPTIONS.map(s=><option key={s} value={s}/>)}</datalist>
          </label>
          <label className="text-xs text-muted-foreground">{operation==='contagem'?'Saldo físico total':'Quantidade recebida'}
            <Input required type="number" min={operation==='entrada'?'1':'0'} step="1" value={count} onChange={e=>setCount(e.target.value)} className="mt-1" placeholder={operation==='contagem'?'Quantidade conferida':'Quantidade que chegou'}/>
          </label>
          <label className="text-xs text-muted-foreground">Estoque mínimo
            <Input type="number" min="0" step="1" value={minimum} onChange={e=>setMinimum(e.target.value)} className="mt-1"/>
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Observação da contagem
            <Input value={observation} onChange={e=>setObservation(e.target.value)} className="mt-1" placeholder="Ex.: inventário inicial da ficha física"/>
          </label>
        </div>
        <Button type="submit" disabled={busy||!unit||!count.trim()}><Plus className="mr-1 h-4 w-4"/>{operation==='entrada'?'Registrar entrada':'Salvar contagem'}</Button>
      </form>
      <div className="card-premium p-5">
        <h2 className="font-bold mb-3">{metric==='reposicao'?'Uniformes que precisam de reposição':metric==='sem_saldo'?'Uniformes sem saldo':metric==='quantidade'?'Quantidades por uniforme':'Saldos cadastrados'} • {UNIDADES.find(u=>u.value===unit)?.label||'Selecione uma unidade'}</h2>
        {loading?<p className="text-sm">Carregando...</p>:!visibleStock.length?<p className="text-sm text-muted-foreground">Nenhuma variação encontrada para este filtro.</p>:
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground">
            {['Uniforme','Modelo','Tamanho','Saldo','Mínimo','Ação'].map(v=><th key={v} className="p-2">{v}</th>)}</tr></thead>
            <tbody>{visibleStock.map(s=><tr key={s.id} className="border-b">
              <td className="p-2">{s.tipo}</td><td className="p-2">{s.modelo}</td><td className="p-2">{s.tamanho}</td>
              <td className={'p-2 font-bold '+(s.saldo<=s.minimo?'text-amber-600':'')}>{s.saldo}</td><td className="p-2">{s.minimo}</td>
              <td className="p-2"><Button size="sm" variant="outline" onClick={()=>chooseStock(s)}>Conferir / editar</Button></td>
            </tr>)}</tbody></table></div>}
      </div>
    </div>}
    {mode==='entregas'&&<div className="space-y-4">
      <div className="card-premium p-5 space-y-3">
        <h2 className="font-bold">1. Funcionário</h2>
        <div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground"/>
          <Input placeholder="Buscar nome, CPF, cargo ou matrícula..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        {search&&!selectedEmpId&&<div className="max-h-52 overflow-y-auto rounded border">
          {filteredEmps.map(e=><button key={e.id} type="button" className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={()=>{setSelectedEmpId(e.id);setSearch('');changed();}}>{e.name} • {companies.find(c=>c.id===e.companyId)?.name}</button>)}
          {filteredEmps.length===0&&<p className="p-3 text-sm">Nenhum encontrado.</p>}
        </div>}
        {emp&&<div className="rounded-md bg-muted p-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span><strong>{emp.name}</strong> • {company?.name} • {emp.cargo}</span>
          <Button variant="outline" size="sm" onClick={()=>{setSelectedEmpId('');changed();}}>Trocar</Button>
        </div>}
        <label className="block text-xs text-muted-foreground">Data de entrega
          <Input type="date" value={deliveryDate} onChange={e=>{setDeliveryDate(e.target.value);changed();}} className="w-48 mt-1"/>
        </label>
      </div>
      <div className="card-premium p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">2. Uniformes a entregar</h2>
          <Button size="sm" disabled={!unit||available.length===0||busy} onClick={()=>{setLines(old=>[...old,{key:crypto.randomUUID(),estoqueId:'',quantidade:1}]);changed();}}><Plus className="h-4 w-4 mr-1"/>Adicionar uniforme</Button></div>
        {!unit&&<p className="text-sm text-amber-600">Selecione primeiro a unidade do estoque, acima.</p>}
        {unit&&available.length===0&&<p className="text-sm text-amber-600">Sem produtos com saldo disponível. Cadastre a contagem física antes da entrega.</p>}
        {lines.map((l)=><div className="grid gap-3 sm:grid-cols-[1fr_110px_42px] items-end border p-3 rounded-lg" key={l.key}>
          <label className="text-xs text-muted-foreground">Uniforme / modelo / tamanho (saldo disponível)
            <select value={l.estoqueId} onChange={e=>editLine(l.key,{estoqueId:e.target.value})} className="w-full border rounded p-2 bg-background text-foreground mt-1">
              <option value="">Selecione uma variação cadastrada</option>
              {available.map(s=><option key={s.id} value={s.id}>{s.tipo} • {s.modelo} • {s.tamanho} — {s.saldo} disponíveis</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Quantidade
            <Input type="number" min="1" step="1" max={selectedStock(l.estoqueId)?.saldo||undefined}
              value={l.quantidade} onChange={e=>editLine(l.key,{quantidade:Number(e.target.value)})} className="mt-1"/>
          </label>
          <Button variant="outline" size="icon" className="text-destructive" onClick={()=>{setLines(old=>old.filter(x=>x.key!==l.key));changed();}}><Trash2 className="h-4 w-4"/></Button>
        </div>)}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <strong>Atenção:</strong> ao clicar em confirmar, a entrega será registrada e o saldo descontado. Imprimir ou reimprimir depois não desconta de novo.
        </div>
        <Button className="gradient-accent text-accent-foreground font-bold" disabled={busy||!emp||!company||!unit||!lines.length}
          onClick={()=>void saveAndPrint()}><FileText className="h-4 w-4 mr-1"/>Confirmar entrega, abater estoque e gerar ficha</Button>
      </div>
    </div>}
    {mode==='historico'&&<div className="card-premium p-5 space-y-3">
      <h2 className="font-bold flex items-center gap-2"><History className="h-4 w-4"/>Entregas confirmadas / reimpressão</h2>
      <p className="text-xs text-muted-foreground">A reimpressão consulta a ficha já registrada: nenhuma segunda baixa de estoque.</p>
      {!unit&&<p className="text-sm text-muted-foreground">Escolha uma unidade para ver suas entregas.</p>}
      {unit&&history.filter(d=>d.unidade===unit).length===0&&<p className="text-sm text-muted-foreground">Nenhuma entrega confirmada nessa unidade.</p>}
      {history.filter(d=>d.unidade===unit).map(d=><div key={d.id} className="border-b py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm"><strong>{employees.find(e=>e.id===d.funcionario_id)?.name||'Funcionário cadastrado'}</strong>
          <p className="text-xs text-muted-foreground">{new Date(d.criado_em).toLocaleString('pt-BR')} • {d.itens.map(i=>i.tipo+' '+i.tamanho+' x'+i.quantidade).join('; ')}</p></div>
        <Button variant="outline" size="sm" onClick={()=>reprint(d)}>Reimprimir ficha</Button>
      </div>)}
      <h3 className="font-bold pt-4">Movimentações de estoque</h3>
      <p className="text-xs text-muted-foreground">Contagens, entradas e saídas confirmadas, com saldo antes/depois.</p>
      {movements.filter(m=>stock.some(s=>s.id===m.estoque_id&&s.unidade===unit)).map(m=>{
        const s=stock.find(s=>s.id===m.estoque_id);
        return <div key={m.id} className="border-b py-2 text-sm flex flex-wrap justify-between gap-2">
          <span>{new Date(m.criado_em).toLocaleString('pt-BR')} • <strong>{m.tipo==='saida'?'Saída':m.tipo==='entrada'?'Entrada':'Contagem'}</strong> • {s?.tipo} {s?.modelo} {s?.tamanho}
            {m.funcionario_id?' • '+(employees.find(e=>e.id===m.funcionario_id)?.name||'Colaborador'):''}</span>
          <span className="font-semibold">{m.saldo_antes} → {m.saldo_depois} ({m.tipo==='saida'?'-':'+'}{m.quantidade})</span>
          {m.observacao&&<p className="basis-full text-xs text-muted-foreground">{m.observacao}</p>}
        </div>;
      })}
    </div>}
  </div>;
};
export default UniformePage;
