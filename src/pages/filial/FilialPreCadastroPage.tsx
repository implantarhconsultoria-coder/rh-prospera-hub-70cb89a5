import React,{useEffect,useState}from'react';
import{FilePlus2,Loader2,RefreshCw,Send,UploadCloud}from'lucide-react';
import{toast}from'sonner';
import{useFilialFilter}from'@/hooks/useFilialFilter';
import{useAcessoExternoFiltro}from'@/hooks/useAcessoExternoFiltro';
import{postFilialPortal,uploadFilialSigned}from'@/lib/filialPortalClient';
import{Button}from'@/components/ui/button';
import{Input}from'@/components/ui/input';
import{Badge}from'@/components/ui/badge';

const blank={id:'',nome:'',cpf:'',rg:'',funcao:'',dataNascimento:'',dataAdmissao:'',email:'',celular:'',salario:'',valeRefeicao:false,valeTransporte:false,status:'aguardando_validacao'};

export default function FilialPreCadastroPage(){
 const filial=useFilialFilter(),ext=useAcessoExternoFiltro();
 const companyId=ext.isExterno?(ext.empresaIds?.[0]||''):(filial.filialCompanyId||'');
 const[rows,setRows]=useState<any[]>([]),[form,setForm]=useState<any>(blank),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[sending,setSending]=useState(false);
 const load=async()=>{if(!companyId)return;try{const x:any=await postFilialPortal('pre_list',{},companyId);setRows(x.rows||[])}catch(e:any){toast.error(e.message||'Erro ao carregar pré-cadastros.')}};
 useEffect(()=>{void load()},[companyId]);
 const patch=(k:string,v:any)=>setForm((p:any)=>({...p,[k]:v}));
 const select=(r:any)=>setForm({id:r.id||'',nome:r.nome||'',cpf:r.cpf||'',rg:r.rg||'',funcao:r.funcao||'',dataNascimento:r.data_nascimento||'',dataAdmissao:r.data_admissao||'',email:r.email||'',celular:r.celular||'',salario:String(r.salario||''),valeRefeicao:!!r.vale_refeicao,valeTransporte:!!r.vale_transporte,status:r.status||'aguardando_validacao'});
 const salvar=async()=>{setSaving(true);try{const x:any=await postFilialPortal('pre_save',form,companyId);select(x.row);toast.success('Pré-cadastro salvo.');await load()}catch(e:any){toast.error(e.message||'Não foi possível salvar.')}finally{setSaving(false)}};
 const upload=async(file?:File|null,tipo='ficha_solicitacao_emprego')=>{if(!file)return;if(!form.id)return toast.error('Salve o pré-cadastro antes de anexar a ficha.');setUploading(true);try{const p:any=await postFilialPortal('prepare_pre_upload',{preCadastroId:form.id,fileName:file.name},companyId);await uploadFilialSigned({bucket:p.bucket,path:p.path,token:p.token,file});await postFilialPortal('finalize_pre_upload',{preCadastroId:form.id,storagePath:p.path,fileName:file.name,tipoDocumento:tipo},companyId);toast.success('Ficha/documento anexado ao pré-cadastro.');await load()}catch(e:any){toast.error(e.message||'Falha no anexo.')}finally{setUploading(false)}};
 const enviar=async()=>{if(!form.id)return toast.error('Salve antes de enviar.');setSending(true);try{const x:any=await postFilialPortal('pre_send',{preCadastroId:form.id},companyId);toast.success('Pré-cadastro enviado à contabilidade. Matriz e responsáveis estão em cópia.');patch('status','aguardando_aso');await load()}catch(e:any){toast.error(e.message||'Falha no envio para a contabilidade.')}finally{setSending(false)}};
 return <div className="space-y-5 text-[#f2eef7]">
  <div className="rounded-xl border border-[#3b2850] bg-[#05080b] p-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-lg border border-violet-500/30 bg-violet-500/10"><FilePlus2 className="h-5 w-5 text-[#ffc400]"/></div><div><h1 className="text-xl font-black text-white">Pré-Cadastro</h1><p className="text-xs text-zinc-500">Pré-cadastro da filial com ficha anexada e envio direto à contabilidade. O retorno segue para a Matriz com a filial em cópia.</p></div></div>
  <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
   <div className="rounded-xl border border-[#28232e] bg-[#05080b] p-3">
    <div className="mb-3 flex items-center justify-between"><b className="text-sm text-white">Pré-cadastros</b><Button size="sm" variant="ghost" onClick={()=>void load()}><RefreshCw className="h-4 w-4"/></Button></div>
    <Button className="mb-3 w-full bg-violet-700" onClick={()=>setForm(blank)}>Novo pré-cadastro</Button>
    <div className="max-h-[60vh] space-y-2 overflow-auto">{rows.map(r=><button key={r.id} onClick={()=>select(r)} className={`w-full rounded-lg border p-3 text-left ${form.id===r.id?'border-violet-500 bg-violet-500/10':'border-[#28232e] bg-[#080b10]'}`}><div className="text-sm font-bold text-white">{r.nome||'Sem nome'}</div><div className="mt-1 text-[10px] text-zinc-500">{r.funcao||'-'} · {r.cpf||'-'}</div><Badge variant="outline" className="mt-2 text-[9px]">{r.status||'PENDENTE'}</Badge></button>)}</div>
   </div>
   <div className="rounded-xl border border-[#28232e] bg-[#05080b] p-4 space-y-4">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
     <Input value={form.nome} onChange={e=>patch('nome',e.target.value)} placeholder="Nome completo" className="border-[#352742] bg-[#090b10]"/>
     <Input value={form.cpf} onChange={e=>patch('cpf',e.target.value.replace(/\D/g,'').slice(0,11))} placeholder="CPF" className="border-[#352742] bg-[#090b10]"/>
     <Input value={form.rg} onChange={e=>patch('rg',e.target.value)} placeholder="RG" className="border-[#352742] bg-[#090b10]"/>
     <Input value={form.funcao} onChange={e=>patch('funcao',e.target.value)} placeholder="Função" className="border-[#352742] bg-[#090b10]"/>
     <label className="text-[10px] text-zinc-500">Nascimento<Input type="date" value={form.dataNascimento} onChange={e=>patch('dataNascimento',e.target.value)} className="mt-1 border-[#352742] bg-[#090b10]"/></label>
     <label className="text-[10px] text-zinc-500">Admissão prevista<Input type="date" value={form.dataAdmissao} onChange={e=>patch('dataAdmissao',e.target.value)} className="mt-1 border-[#352742] bg-[#090b10]"/></label>
     <Input value={form.email} onChange={e=>patch('email',e.target.value)} placeholder="E-mail" className="border-[#352742] bg-[#090b10]"/>
     <Input value={form.celular} onChange={e=>patch('celular',e.target.value)} placeholder="Celular" className="border-[#352742] bg-[#090b10]"/>
     <Input value={form.salario} onChange={e=>patch('salario',e.target.value)} placeholder="Salário" className="border-[#352742] bg-[#090b10]"/>
    </div>
    <div className="flex flex-wrap gap-4 text-xs text-zinc-300"><label className="flex items-center gap-2"><input type="checkbox" checked={form.valeRefeicao} onChange={e=>patch('valeRefeicao',e.target.checked)}/>VR</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.valeTransporte} onChange={e=>patch('valeTransporte',e.target.checked)}/>VT</label></div>
    <div className="flex flex-wrap gap-2 border-t border-[#28232e] pt-4">
     <Button onClick={()=>void salvar()} disabled={saving} className="bg-violet-700">{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:null}Salvar pré-cadastro</Button>
     <label className={`inline-flex h-10 items-center rounded-md border border-[#3b2850] bg-[#090b10] px-4 text-sm font-semibold text-white ${!form.id?'opacity-50':'cursor-pointer'}`}>{uploading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<UploadCloud className="mr-2 h-4 w-4"/>}Subir ficha<input type="file" className="hidden" disabled={!form.id||uploading} onChange={e=>void upload(e.target.files?.[0])}/></label>
     <Button onClick={()=>void enviar()} disabled={!form.id||sending} className="bg-[#ffc400] font-black text-black hover:bg-[#ffd43b]">{sending?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Send className="mr-2 h-4 w-4"/>}Enviar para Contabilidade</Button>
    </div>
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-zinc-400">Envio do Pré-Cadastro: Contabilidade como destinatária; Matriz e Robson em cópia. O responsável da filial permanece no encadeamento para receber o retorno.</div>
   </div>
  </div>
 </div>
}
