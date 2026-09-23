import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UNIFORM_TYPES, type DeliveryItem } from '@/data/deliveries';
import { Shirt, Plus, Trash2, FileText, Search, Package, ArrowDownCircle, RefreshCw, AlertTriangle, History } from 'lucide-react';
import { toast } from 'sonner';

const db = supabase as any;
type Unidade = 'SAO_PAULO' | 'PRAIA_GRANDE' | 'GOIANIA';
type Mode = 'painel' | 'estoque' | 'entregas' | 'historico';
type Stock = { id:string; unidade:Unidade; tipo:string; tamanho:string; modelo:string; saldo:number; minimo:number; observacao:string|null; atualizado_em:string };
type RecordedDelivery = { id:string; funcionario_id:string; company_id:string; unidade:Unidade; data_entrega:string; itens:DeliveryItem[]; gerado_por:string; criado_em:string };
type Line = { key:string; estoqueId:string; quantidade:number };
const UNIDADES:{value:Unidade;label:string}[]=[
  {value:'SAO_PAULO',label:'São Paulo'},
  {value:'PRAIA_GRANDE',label:'Praia Grande'},
  {value:'GOIANIA',label:'Goiânia'},
];
const SIZE_OPTIONS=['M','G','GG','XG','G1','G2','G3'];
const MODELO_OPTIONS=['MANGA CURTA','MANGA LONGA','POLO','PADRAO','USADO'];
const fmt=(n:number)=>new Intl.NumberFormat('pt-BR').format(n);

const UniformePage:React.FC=()=>{
  const {companies,employees,session}=useApp();
  const navigate=useNavigate();
  const [mode,setMode]=useState<Mode>('painel');
  const [unit,setUnit]=useState<Unidade|''>('');
  const [stock,setStock]=useState<Stock[]>([]);
  const [history,setHistory]=useState<RecordedDelivery[]>([]);
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
    const [s,h]=await Promise.all([
      db.from('uniforme_estoque').select('id,unidade,tipo,tamanho,modelo,saldo,minimo,observacao,atualizado_em').order('tipo').order('tamanho').order('modelo'),
      db.from('uniforme_entregas').select('id,funcionario_id,company_id,unidade,data_entrega,itens,gerado_por,criado_em').order('criado_em',{ascending:false}).limit(80),
    ]);
    if(s.error){setStockError('Não foi possível carregar o estoque: '+s.error.message);setStock([]);}
    else setStock((s.data||[]) as Stock[]);
    if(h.error)toast.error('Histórico de uniformes indisponível: '+h.error.message);
    else setHistory((h.data||[]) as RecordedDelivery[]);
    setLoading(false);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const unitStock=useMemo(()=>unit?stock.filter(s=>s.unidade===unit):[],[stock,unit]);
  const total=unitStock.reduce((sum,s)=>sum+Number(s.saldo),0);
  const low=unitStock.filter(s=>s.saldo<=s.minimo);
  const soldOut=unitStock.filter(s=>s.saldo===0);
  const emp=employees.find(e=>e.id===selectedEmpId);
  const company=emp?companies.find(c=>c.id===emp.companyId):null;
  const filteredEmps=employees.filter(e=>e.status==='ativo'&&e.categoria==='operacional'&&
    [e.name,e.cargo,e.cpf,e.registro].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))).slice(0,40);
  const available=unitStock.filter(s=>s.saldo>0);
  const selectedStock=(id:string)=>unitStock.find(s=>s.id===id);
  const changed=()=>{requestId.current=crypto.randomUUID();};
  const editLine=(key:string,data:Partial<Line>)=>{setLines(old=>old.map(l=>l.key===key?{...l,...data}:l));changed();};

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
    <div className="card-premium p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {([['painel','Visão geral'],['estoque','Estoque / contagem'],['entregas','Entregar e imprimir'],['historico','Histórico / reimprimir']] as [Mode,string][]).map(([key,label])=>
          <Button key={key} size="sm" variant={mode===key?'default':'outline'} onClick={()=>setMode(key)}>{label}</Button>)}
      </div>
      <Button variant="outline" size="sm" onClick={()=>void refresh()} disabled={loading}><RefreshCw className="mr-1 h-4 w-4"/>Atualizar</Button>
    </div>
    <div className="card-premium p-4">
      <label className="block text-xs font-bold text-muted-foreground mb-2">UNIDADE QUE GUARDA O ESTOQUE</label>
      <select className="w-full sm:w-80 rounded-md border p-2 bg-background text-foreground"
        value={unit} onChange={e=>{setUnit(e.target.value as Unidade|'');setLines([]);changed();}}>
        <option value="">Selecione a unidade física</option>
        {UNIDADES.map(u=><option key={u.value} value={u.value}>{u.label}</option>)}
      </select>
      {!unit&&<p className="mt-2 text-sm text-amber-600">A ficha enviada não identifica a unidade nem informa data/responsável. Escolha a unidade correta antes de lançar o inventário.</p>}
    </div>
    {stockError&&<div className="border border-destructive rounded-lg p-4 text-sm text-destructive">{stockError}</div>}
    {unit&&<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[[ 'Variações cadastradas',unitStock.length,Package],['Peças disponíveis',fmt(total),Shirt],
      ['Precisam de reposição',low.length,AlertTriangle],['Sem saldo',soldOut.length,ArrowDownCircle]].map(([label,value,Icon]:any)=>
        <div key={label} className="card-premium p-4"><p className="text-xs text-muted-foreground">{label}</p>
          <div className="flex justify-between items-center mt-2"><strong className="text-2xl">{value}</strong><Icon className="w-5 h-5 text-primary"/></div></div>)}
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
        <h2 className="font-bold mb-3">Saldos cadastrados • {UNIDADES.find(u=>u.value===unit)?.label||'Selecione uma unidade'}</h2>
        {loading?<p className="text-sm">Carregando...</p>:!unitStock.length?<p className="text-sm text-muted-foreground">Nenhuma variação cadastrada nessa unidade.</p>:
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground">
            {['Uniforme','Modelo','Tamanho','Saldo','Mínimo','Ação'].map(v=><th key={v} className="p-2">{v}</th>)}</tr></thead>
            <tbody>{unitStock.map(s=><tr key={s.id} className="border-b">
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
    </div>}
  </div>;
};
export default UniformePage;
