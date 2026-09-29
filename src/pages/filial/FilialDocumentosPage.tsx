import React, { useEffect, useMemo, useState } from 'react';
import { FileCheck2, FolderOpen, Loader2, RefreshCw, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';
import { postFilialPortal, uploadFilialSigned } from '@/lib/filialPortalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

const detectarDocumento = (name:string) => {
  const n = normalize(name);
  if (/ATESTADO|DECLARACAO.*HORA/.test(n)) return { tipo:'ATESTADO', categoria:'ATESTADO' };
  if (/ASO|EXAME/.test(n)) return { tipo:'ASO', categoria:'ASO' };
  if (/HOLERITE|CONTRACHEQUE|FOLHA/.test(n)) return { tipo:'Holerite', categoria:'PAGAMENTOS' };
  if (/RECIBO.*(VR|REFEICAO)|VALE.*REFEICAO/.test(n)) return { tipo:'Recibo VR', categoria:'VR' };
  if (/RECIBO.*(VT|TRANSPORTE)|VALE.*TRANSPORTE/.test(n)) return { tipo:'Recibo VT', categoria:'VT' };
  if (/ADIANTAMENTO/.test(n)) return { tipo:'Recibo de Adiantamento', categoria:'PAGAMENTOS' };
  if (/FERIAS/.test(n)) return { tipo:'FERIAS', categoria:'FERIAS' };
  if (/CONTRATO|EXPERIENCIA/.test(n)) return { tipo:'CONTRATO', categoria:'CONTRATO' };
  if (/EPI/.test(n)) return { tipo:'EPI', categoria:'EPI' };
  if (/UNIFORME/.test(n)) return { tipo:'UNIFORME', categoria:'UNIFORME' };
  if (/RESCISAO/.test(n)) return { tipo:'RESCISAO', categoria:'RECIBOS' };
  return { tipo:'OUTROS', categoria:'OUTROS' };
};

const FilialDocumentosPage: React.FC = () => {
  const filial = useFilialFilter();
  const ext = useAcessoExternoFiltro();
  const companyId = ext.isExterno ? ext.empresaIds?.[0] || '' : filial.filialCompanyId || '';
  const [employees,setEmployees]=useState<any[]>([]);
  const [employeeId,setEmployeeId]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [tipo,setTipo]=useState('OUTROS');
  const [categoria,setCategoria]=useState('OUTROS');
  const [docs,setDocs]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [uploading,setUploading]=useState(false);

  const employee = useMemo(()=>employees.find(e=>e.id===employeeId),[employees,employeeId]);

  const carregarFuncionarios = async () => {
    if (!companyId) return;
    try {
      const data:any = await postFilialPortal('employees',{},companyId);
      setEmployees((data.employees || []).sort((a:any,b:any)=>String(a.nome).localeCompare(String(b.nome),'pt-BR')));
    } catch(e:any){ toast.error(e.message || 'Erro ao carregar funcionários.'); }
  };

  const carregarDocs = async (id=employeeId) => {
    if (!id || !companyId) { setDocs([]); return; }
    setLoading(true);
    try {
      const data:any = await postFilialPortal('employee_documents',{employeeId:id},companyId);
      setDocs(data.documents || []);
    } catch(e:any){ toast.error(e.message || 'Erro ao carregar documentos.'); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ void carregarFuncionarios(); },[companyId]);
  useEffect(()=>{ void carregarDocs(); },[employeeId]);

  const escolherArquivo = (f?:File|null) => {
    if (!f) return;
    setFile(f);
    const found=detectarDocumento(f.name);
    setTipo(found.tipo);
    setCategoria(found.categoria);
  };

  const enviar = async () => {
    if (!file || !employeeId || !companyId) return toast.error('Selecione funcionário e arquivo.');
    setUploading(true);
    try {
      const prep:any = await postFilialPortal('prepare_document_upload',{employeeId,fileName:file.name},companyId);
      await uploadFilialSigned({bucket:prep.bucket,path:prep.path,token:prep.token,file});
      await postFilialPortal('finalize_document_upload',{
        employeeId,storagePath:prep.path,fileName:file.name,tipoDocumento:tipo,categoria,
        descricao:`${tipo} enviado pela filial`,
      },companyId);
      toast.success(`${tipo} identificado e salvo na pasta de ${employee?.nome || 'funcionário'}.`);
      setFile(null);
      await carregarDocs(employeeId);
    } catch(e:any){ toast.error(e.message || 'Não foi possível salvar o documento.'); }
    finally { setUploading(false); }
  };

  return <div className="space-y-5 text-[#f2eef7]">
    <div className="rounded-xl border border-[#3b2850] bg-[#05080b] p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-lg border border-violet-500/30 bg-violet-500/10"><FolderOpen className="h-5 w-5 text-[#ffc400]"/></div>
        <div><h1 className="text-xl font-black text-white">Documentos</h1><p className="text-xs text-zinc-500">Envie qualquer documento. O sistema identifica a categoria e arquiva na pasta do funcionário.</p></div>
      </div>
    </div>

    <div className="rounded-xl border border-[#28232e] bg-[#05080b] p-4">
      <div className="grid gap-3 md:grid-cols-[1.2fr_1.2fr_.8fr_.8fr_auto]">
        <select value={employeeId} onChange={e=>setEmployeeId(e.target.value)} className="h-10 rounded-md border border-[#352742] bg-[#090b10] px-3 text-sm text-white">
          <option value="">Selecione o funcionário</option>
          {employees.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e=>escolherArquivo(e.target.files?.[0])} className="border-[#352742] bg-[#090b10]"/>
        <Input value={tipo} onChange={e=>setTipo(e.target.value)} className="border-[#352742] bg-[#090b10]" placeholder="Tipo"/>
        <Input value={categoria} onChange={e=>setCategoria(e.target.value)} className="border-[#352742] bg-[#090b10]" placeholder="Categoria"/>
        <Button onClick={()=>void enviar()} disabled={uploading||!file||!employeeId} className="bg-[#ffc400] font-black text-black hover:bg-[#ffd43b]">
          {uploading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<UploadCloud className="mr-2 h-4 w-4"/>}Salvar
        </Button>
      </div>
      {file && <div className="mt-3 text-xs text-zinc-400">Identificado: <b className="text-violet-300">{tipo}</b> · {file.name}</div>}
    </div>

    <div className="rounded-xl border border-[#28232e] bg-[#05080b] p-4">
      <div className="mb-3 flex items-center justify-between"><div><h2 className="font-black text-white">Pasta do funcionário</h2><p className="text-xs text-zinc-500">{employee?.nome || 'Selecione um funcionário'}</p></div><Button variant="outline" size="sm" onClick={()=>void carregarDocs()} disabled={!employeeId||loading} className="border-[#3b2850] bg-[#090b10] text-white"><RefreshCw className={`mr-2 h-4 w-4 ${loading?'animate-spin':''}`}/>Atualizar</Button></div>
      <div className="space-y-2">
        {!employeeId && <div className="rounded-lg border border-dashed border-[#30283a] p-8 text-center text-sm text-zinc-600">Escolha um funcionário.</div>}
        {employeeId && !loading && docs.length===0 && <div className="rounded-lg border border-dashed border-[#30283a] p-8 text-center text-sm text-zinc-600">Nenhum documento arquivado.</div>}
        {docs.map(d=><div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#28232e] bg-[#080b10] p-3">
          <div className="min-w-0"><div className="truncate text-sm font-bold text-white">{d.nome_arquivo || d.tipo_documento}</div><div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500"><Badge variant="outline" className="border-violet-500/20 text-violet-300">{d.categoria || d.tipo_documento}</Badge><span>{d.competencia || ''}</span><span>{d.created_at?new Date(d.created_at).toLocaleDateString('pt-BR'):''}</span></div></div>
          {d.download_url && <a href={d.download_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border border-[#3b2850] px-3 text-xs font-bold text-white hover:bg-violet-500/10"><FileCheck2 className="mr-2 h-4 w-4"/>Abrir</a>}
        </div>)}
      </div>
    </div>
  </div>;
};

export default FilialDocumentosPage;
