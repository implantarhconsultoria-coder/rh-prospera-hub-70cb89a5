import React,{useEffect,useMemo,useState}from'react';
import{Archive,CheckCircle2,FileSignature,History,Loader2,Printer,RefreshCw,RotateCcw,UploadCloud}from'lucide-react';
import{toast}from'sonner';
import{useFilialFilter}from'@/hooks/useFilialFilter';
import{useAcessoExternoFiltro}from'@/hooks/useAcessoExternoFiltro';
import{postFilialPortal,uploadFilialSigned}from'@/lib/filialPortalClient';
import{Button}from'@/components/ui/button';
import{Badge}from'@/components/ui/badge';

const label=(d:any)=>{const t=`${d.tipo_documento||''} ${d.categoria||''}`.toUpperCase();if(t.includes('HOLERITE'))return'HOLERITE';if(t.includes('ADIANTAMENTO'))return'ADIANTAMENTO';if(/\bVR\b|REFEICAO/.test(t)&&/\bVT\b|TRANSPORTE/.test(t))return'VR + VT';if(/\bVR\b|REFEICAO/.test(t))return'VR';if(/\bVT\b|TRANSPORTE/.test(t))return'VT';return d.tipo_documento||'RECIBO';};

export default function FilialRecibosHoleritesPage(){
 const filial=useFilialFilter(),ext=useAcessoExternoFiltro();
 const companyId=ext.isExterno?(ext.empresaIds?.[0]||''):(filial.filialCompanyId||'');
 const[docs,setDocs]=useState<any[]>([]),[loading,setLoading]=useState(false),[sending,setSending]=useState(''),[tab,setTab]=useState<'pendentes'|'historico'>('pendentes');
 const carregar=async()=>{if(!companyId)return;setLoading(true);try{const x:any=await postFilialPortal('documents',{},companyId);setDocs(x.documents||[]);}catch(e:any){toast.error(e.message||'Erro ao carregar recibos.')}finally{setLoading(false)}};
 useEffect(()=>{void carregar()},[companyId]);
 const pendentes=useMemo(()=>docs.filter(d=>(d.fluxo?.status||'disponivel')!=='devolvido'),[docs]);
 const historico=useMemo(()=>docs.filter(d=>d.fluxo?.status==='devolvido'),[docs]);
 const rows=tab==='pendentes'?pendentes:historico;
 const imprimir=async(d:any)=>{try{await postFilialPortal('mark_printed',{sourceDocumentoId:d.id},companyId);if(d.download_url)window.open(d.download_url,'_blank','noopener,noreferrer');await carregar()}catch(e:any){toast.error(e.message||'Falha ao abrir documento.')}};
 const devolver=async(d:any,file?:File|null)=>{if(!file)return;setSending(d.id);try{const p:any=await postFilialPortal('prepare_document_upload',{employeeId:d.funcionario_id,fileName:file.name},companyId);await uploadFilialSigned({bucket:p.bucket,path:p.path,token:p.token,file});const k=label(d);await postFilialPortal('finalize_document_upload',{employeeId:d.funcionario_id,storagePath:p.path,fileName:file.name,sourceDocumentoId:d.id,tipoDocumento:`${k} ASSINADO`,categoria:k==='HOLERITE'||k==='ADIANTAMENTO'?'PAGAMENTOS':'RECIBOS',competencia:d.competencia||'',descricao:`${k} assinado e devolvido pela filial`},companyId);toast.success('Assinado salvo na pasta do funcionário e retirado da pendência.');await carregar()}catch(e:any){toast.error(e.message||'Falha ao devolver documento.')}finally{setSending('')}};
 const solicitar=async(d:any)=>{try{await postFilialPortal('request_again',{sourceDocumentoId:d.id},companyId);toast.success('Solicitação registrada para a Matriz.');await carregar()}catch(e:any){toast.error(e.message||'Falha ao solicitar documento.')}};
 return <div className="space-y-5 text-[#f2eef7]">
  <div className="rounded-xl border border-[#3b2850] bg-[#05080b] p-5 flex flex-wrap items-center justify-between gap-3">
   <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-lg border border-violet-500/30 bg-violet-500/10"><FileSignature className="h-5 w-5 text-[#ffc400]"/></div><div><h1 className="text-xl font-black text-white">Recibos / Holerites</h1><p className="text-xs text-zinc-500">Receber, imprimir, assinar e devolver. O fluxo com a contabilidade continua na Matriz.</p></div></div>
   <Button variant="outline" size="sm" onClick={()=>void carregar()} className="border-[#3b2850] bg-[#090b10] text-white"><RefreshCw className={`mr-2 h-4 w-4 ${loading?'animate-spin':''}`}/>Atualizar</Button>
  </div>
  <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-[#28232e] bg-[#05080b] p-4"><div className="text-[10px] uppercase text-zinc-500">Pendentes</div><div className="mt-1 text-2xl font-black text-[#ffc400]">{pendentes.length}</div></div><div className="rounded-xl border border-[#28232e] bg-[#05080b] p-4"><div className="text-[10px] uppercase text-zinc-500">Histórico</div><div className="mt-1 text-2xl font-black text-violet-300">{historico.length}</div></div></div>
  <div className="flex gap-2"><Button onClick={()=>setTab('pendentes')} className={tab==='pendentes'?'bg-violet-700':'bg-[#090b10]'}><Archive className="mr-2 h-4 w-4"/>Pendentes</Button><Button onClick={()=>setTab('historico')} className={tab==='historico'?'bg-violet-700':'bg-[#090b10]'}><History className="mr-2 h-4 w-4"/>Histórico</Button></div>
  <div className="space-y-2">
   {!loading&&rows.length===0&&<div className="rounded-xl border border-dashed border-[#30283a] bg-[#05080b] p-10 text-center text-sm text-zinc-600">Nenhum documento nesta lista.</div>}
   {rows.map(d=>{const st=d.fluxo?.status||'disponivel',k=label(d);return <div key={d.id} className="rounded-xl border border-[#28232e] bg-[#05080b] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><b className="text-white">{d.funcionario_nome}</b><Badge variant="outline">{k}</Badge><Badge variant="outline">{st.toUpperCase()}</Badge></div><div className="mt-1 text-xs text-zinc-500">{d.competencia||'Sem competência'} · {d.nome_arquivo||d.tipo_documento}</div></div>{st!=='devolvido'?<div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>void imprimir(d)}><Printer className="mr-2 h-4 w-4"/>Imprimir</Button><label className="inline-flex h-9 cursor-pointer items-center rounded-md bg-[#ffc400] px-3 text-xs font-black text-black">{sending===d.id?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<UploadCloud className="mr-2 h-4 w-4"/>}Subir assinado<input type="file" className="hidden" onChange={e=>void devolver(d,e.target.files?.[0])}/></label></div>:<div className="flex gap-2"><span className="inline-flex h-9 items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs text-emerald-300"><CheckCircle2 className="mr-2 h-4 w-4"/>Baixado</span><Button size="sm" variant="outline" onClick={()=>void solicitar(d)}><RotateCcw className="mr-2 h-4 w-4"/>Solicitar novamente</Button></div>}</div></div>})}
  </div>
 </div>
}
