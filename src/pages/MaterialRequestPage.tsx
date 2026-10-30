import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Search, Printer, ClipboardList, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { EPI_TYPES } from '@/data/deliveries';

type MaterialType = 'EPI' | 'UNIFORME';
type Item = { nome: string; descricao: string; ca: string; tamanho: string; quantidade: number };
type RequestRow = {
  id:string; tipo:MaterialType; funcionario_id:string; company_id:string; funcionario_nome:string;
  empresa_nome:string; cargo:string; data_solicitacao:string; itens_solicitados:Item[];
  justificativa:string; solicitado_por_nome:string; status:string; created_at:string;
};
const db=supabase as any;
const dateBr=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('pt-BR');
const statusLabels:Record<string,string>={solicitada:'Solicitada',em_analise:'Em análise',atendida_parcial:'Atendida parcialmente',atendida:'Atendida',cancelada:'Cancelada'};

const MaterialRequestPage:React.FC<{tipo:MaterialType;onClose?:()=>void}> = ({tipo,onClose})=>{
 const {companies,employees,session}=useApp();
 const [search,setSearch]=useState('');
 const [employeeId,setEmployeeId]=useState('');
 const [items,setItems]=useState<Item[]>([{nome:'',descricao:'',ca:'',tamanho:'',quantidade:1}]);
 const [justificativa,setJustificativa]=useState('');
 const [requests,setRequests]=useState<RequestRow[]>([]);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [selected,setSelected]=useState<RequestRow|null>(null);
 const employee=employees.find(e=>e.id===employeeId);
 const company=employee?companies.find(c=>c.id===employee.companyId):null;
 const filtered=useMemo(()=>employees.filter(e=>e.status==='ativo'&&[e.name,e.cargo,e.cpf,e.registro].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))).slice(0,30),[employees,search]);
 const reload=useCallback(async()=>{
  setLoading(true);
  const {data,error}=await db.from('topac_material_solicitacoes').select('*').eq('tipo',tipo).order('created_at',{ascending:false}).limit(200);
  if(error)toast.error('Não foi possível carregar solicitações: '+error.message);
  else setRequests((data||[]) as RequestRow[]);
  setLoading(false);
 },[tipo]);
 useEffect(()=>{void reload()},[reload]);
 const updateItem=(i:number,patch:Partial<Item>)=>setItems(old=>old.map((item,index)=>index===i?{...item,...patch}:item));
 const addItem=()=>setItems(old=>[...old,{nome:'',descricao:'',ca:'',tamanho:'',quantidade:1}]);
 const save=async()=>{
  if(!employee||!company)return toast.error('Selecione o funcionário.');
  const clean=items.map(i=>({...i,nome:i.nome.trim(),descricao:i.descricao.trim(),ca:i.ca.trim(),tamanho:i.tamanho.trim(),quantidade:Number(i.quantidade)}));
  if(!clean.length||clean.some(i=>!i.nome||!Number.isSafeInteger(i.quantidade)||i.quantidade<1))return toast.error('Informe o material e uma quantidade inteira válida em cada linha.');
  if(!session?.user)return toast.error('Sessão inválida. Entre novamente.');
  setSaving(true);
  const requester=session.user.user_metadata?.nome_completo||session.user.user_metadata?.full_name||session.user.email||'Sistema';
  const {error}=await db.from('topac_material_solicitacoes').insert({
   tipo,funcionario_id:employee.id,company_id:company.id,funcionario_nome:employee.name,
   empresa_nome:company.name,cargo:employee.cargo||'',itens_solicitados:clean,
   justificativa:justificativa.trim(),solicitado_por:session.user.id,solicitado_por_nome:requester,
  });
  setSaving(false);
  if(error)return toast.error('Solicitação não registrada: '+error.message);
  toast.success('Solicitação registrada.');
  setEmployeeId('');setSearch('');setItems([{nome:'',descricao:'',ca:'',tamanho:'',quantidade:1}]);setJustificativa('');
  await reload();
 };
 const setStatus=async(row:RequestRow,status:string)=>{
  const patch:any={status};
  if(status==='atendida'){patch.atendido_por=session?.user?.id||null;patch.atendido_por_nome=session?.user?.email||'Sistema';patch.atendido_em=new Date().toISOString();}
  const {error}=await db.from('topac_material_solicitacoes').update(patch).eq('id',row.id);
  if(error)toast.error(error.message);else{toast.success('Status atualizado.');setSelected(null);await reload();}
 };
 const print=()=>{if(!selected)return;window.print()};
 return <div className="space-y-5">
  <style>{`@media print{body *{visibility:hidden!important}#material-request-print,#material-request-print *{visibility:visible!important}#material-request-print{position:absolute;inset:0;width:100%;padding:24px!important;background:white!important;color:black!important}.no-print{display:none!important}}`}</style>
  <div className="card-premium p-5 space-y-4 no-print">
   <div className="flex flex-wrap justify-between items-center gap-2"><div><h2 className="text-lg font-bold">Solicitação de {tipo==='EPI'?'EPI':'Uniformes'}</h2><p className="text-xs text-muted-foreground">Registre o pedido antes da separação e da entrega física.</p></div><Button variant="outline" size="sm" onClick={()=>void reload()} disabled={loading}><RefreshCw className="w-4 h-4 mr-1"/>Atualizar</Button></div>
   <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar funcionário por nome, CPF, função ou matrícula" value={search} onChange={e=>{setSearch(e.target.value);setEmployeeId('')}}/></div>
   {search&&!employeeId&&<div className="border rounded-lg max-h-48 overflow-y-auto">{filtered.map(e=>{const co=companies.find(c=>c.id===e.companyId);return <button type="button" key={e.id} onClick={()=>{setEmployeeId(e.id);setSearch(e.name)}} className="w-full text-left p-3 text-sm border-b last:border-0 hover:bg-muted/50 flex justify-between gap-3"><strong>{e.name}</strong><span className="text-xs text-muted-foreground">{co?.name} · {e.cargo}</span></button>})}{!filtered.length&&<p className="p-3 text-sm text-muted-foreground">Nenhum funcionário ativo encontrado.</p>}</div>}
   {employee&&company&&<div className="rounded-lg bg-muted/30 p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"><div><span className="block text-xs text-muted-foreground">Funcionário</span><strong>{employee.name}</strong></div><div><span className="block text-xs text-muted-foreground">Empresa</span>{company.name}</div><div><span className="block text-xs text-muted-foreground">Cargo</span>{employee.cargo||'—'}</div><div><span className="block text-xs text-muted-foreground">Matrícula</span>{employee.registro||'—'}</div></div>}
   {employee&&<div className="space-y-3">
    <div className="flex items-center justify-between"><strong className="text-sm">Materiais solicitados</strong><Button size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1"/>Adicionar item</Button></div>
    {items.map((item,i)=><div key={i} className="grid grid-cols-2 md:grid-cols-6 gap-2 border rounded-lg p-3 items-end">
     <div className="col-span-2 md:col-span-2"><label className="text-xs text-muted-foreground">Material / item</label>{tipo==='EPI'?<><Input list="epi-material-catalog" value={item.nome} onChange={e=>updateItem(i,{nome:e.target.value})} placeholder="Selecione ou digite o EPI"/><datalist id="epi-material-catalog">{EPI_TYPES.map(t=><option key={t} value={t}/>)}</datalist></>:<Input value={item.nome} onChange={e=>updateItem(i,{nome:e.target.value})} placeholder="Ex.: Camiseta operacional"/>}</div>
     <div><label className="text-xs text-muted-foreground">Descrição / modelo</label><Input value={item.descricao} onChange={e=>updateItem(i,{descricao:e.target.value})} placeholder="Opcional"/></div>
     <div><label className="text-xs text-muted-foreground">{tipo==='EPI'?'CA':'Tamanho'}</label><Input value={tipo==='EPI'?item.ca:item.tamanho} onChange={e=>updateItem(i,tipo==='EPI'?{ca:e.target.value}:{tamanho:e.target.value})} placeholder="Opcional"/></div>
     <div><label className="text-xs text-muted-foreground">Quantidade</label><Input type="number" min={1} step={1} value={item.quantidade} onChange={e=>updateItem(i,{quantidade:Number(e.target.value)})}/></div>
     <Button variant="ghost" size="icon" className="text-destructive" onClick={()=>setItems(old=>old.filter((_,idx)=>idx!==i))} disabled={items.length===1}><Trash2 className="w-4 h-4"/></Button>
    </div>)}
    <div><label className="text-xs text-muted-foreground">Justificativa / observação</label><Input value={justificativa} onChange={e=>setJustificativa(e.target.value)} placeholder="Informe o motivo da solicitação (opcional)"/></div>
    <div className="flex flex-wrap gap-2"><Button onClick={()=>void save()} disabled={saving}>{saving?'Registrando...':<><ClipboardList className="w-4 h-4 mr-2"/>Registrar solicitação</>}</Button><Button variant="outline" onClick={()=>{setEmployeeId('');setSearch('');setItems([{nome:'',descricao:'',ca:'',tamanho:'',quantidade:1}]);}}>Limpar</Button></div>
   </div>}
  </div>
  <div className="card-premium p-5 no-print"><h3 className="font-bold mb-3">Solicitações registradas</h3>{loading?<p className="text-sm text-muted-foreground">Carregando...</p>:<div className="divide-y">{requests.map(row=><div key={row.id} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-2"><div><strong className="text-sm">{row.funcionario_nome}</strong><p className="text-xs text-muted-foreground">{row.empresa_nome} · {dateBr(row.data_solicitacao)} · {row.itens_solicitados.length} item(ns)</p></div><div className="flex items-center gap-2"><span className="text-xs rounded-full bg-muted px-2 py-1">{statusLabels[row.status]||row.status}</span><Button size="sm" variant="outline" onClick={()=>setSelected(row)}>Abrir ficha</Button></div></div>)}{!requests.length&&<p className="py-5 text-sm text-muted-foreground">Nenhuma solicitação registrada.</p>}</div>}</div>
  {selected&&<div id="material-request-print" className="bg-white text-black p-6 rounded-lg"><div className="flex justify-between items-center mb-5 no-print"><Button variant="outline" onClick={()=>setSelected(null)}>Voltar</Button><Button onClick={print}><Printer className="w-4 h-4 mr-2"/>Imprimir / Salvar PDF</Button></div><div className="text-center border-b-2 border-black pb-4 mb-4"><h1 className="text-xl font-bold">TOPAC RH PRO</h1><h2 className="font-bold">FICHA DE SOLICITAÇÃO DE {tipo==='EPI'?'EPI':'UNIFORMES'}</h2><p className="text-sm">Solicitação em {dateBr(selected.data_solicitacao)}</p></div><div className="grid grid-cols-2 gap-3 text-sm mb-5"><div><b>Funcionário:</b> {selected.funcionario_nome}</div><div><b>Empresa:</b> {selected.empresa_nome}</div><div><b>Cargo:</b> {selected.cargo||'—'}</div><div><b>Solicitante:</b> {selected.solicitado_por_nome}</div><div><b>Status:</b> {statusLabels[selected.status]||selected.status}</div><div><b>Protocolo:</b> {selected.id.slice(0,8).toUpperCase()}</div></div><table className="w-full text-sm border-collapse mb-4"><thead><tr>{['Material','Descrição','CA / Tamanho','Quantidade'].map(x=><th key={x} className="border border-black p-2 text-left">{x}</th>)}</tr></thead><tbody>{selected.itens_solicitados.map((item,i)=><tr key={i}><td className="border border-black p-2">{item.nome}</td><td className="border border-black p-2">{item.descricao||'—'}</td><td className="border border-black p-2">{item.ca||item.tamanho||'—'}</td><td className="border border-black p-2">{item.quantidade}</td></tr>)}</tbody></table><p className="text-sm mb-8"><b>Justificativa:</b> {selected.justificativa||'—'}</p><div className="grid grid-cols-2 gap-10 mt-12 text-center text-xs"><div className="border-t border-black pt-2">Assinatura do solicitante</div><div className="border-t border-black pt-2">Responsável pelo atendimento</div></div><div className="no-print flex flex-wrap gap-2 mt-6"><label className="text-xs self-center">Atualizar status:</label><select className="border rounded p-2 text-sm" value={selected.status} onChange={e=>setSelected({...selected,status:e.target.value})}>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><Button size="sm" onClick={()=>void setStatus(selected,selected.status)}>Salvar status</Button></div></div>}
 </div>
};
export default MaterialRequestPage;
