import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, Download, FileSearch, FileText, FolderLock, Landmark, Mail, Paperclip, RefreshCw, Save, ShieldAlert, Sparkles, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { useFeriados } from '@/hooks/useFeriados';
import { extractPdfTextByLines, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { readAdmissionDossier, businessDaysForAdmission, benefitAmount, buildAdmissionDossierPdf } from '@/lib/admissionDossierHelpers';
import { emptyBankingData, parseBankingText, type BankingData } from '@/lib/bankingParser';
import BankingDataEditor from '@/components/BankingDataEditor';
import EmailPdfModal, { type EmailPdfDraft } from '@/components/EmailPdfModal';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Company = { id: string; name: string; cnpj?: string };
type Draft = {
  id?: string; empresa_id: string; empresa_nome: string; cnpj: string; status: string;
  nome: string; cpf: string; rg: string; data_nascimento: string; data_admissao: string;
  funcao: string; salario: string; email: string; celular: string; endereco: string;
  filiacao: string; escolaridade: string; experiencia: string; epi: string;
  vale_refeicao: boolean; vale_transporte: boolean;
};
type StoredDoc = { id: string; pre_cadastro_id: string; tipo_documento: string; nome_arquivo: string; arquivo_url: string; created_at: string };
type Stage = {
  pre_cadastro_id: string; dados_bancarios: Partial<BankingData>;
  vr_diario: number | null; vt_diario: number | null;
  contrato_documento_id: string | null; contrato_recebido_em: string | null;
  pasta_funcionario: string | null; efetivado_em: string | null;
  finance_enviado_em: string | null;
};
type Listed = { form: Draft; stage: Stage };
const emptyDraft = (): Draft => ({
  empresa_id: '', empresa_nome: '', cnpj: '', status: 'aguardando_validacao',
  nome: '', cpf: '', rg: '', data_nascimento: '', data_admissao: '',
  funcao: '', salario: '', email: '', celular: '', endereco: '',
  filiacao: '', escolaridade: '', experiencia: '', epi: '',
  vale_refeicao: false, vale_transporte: false,
});
const CLEAN = (s: unknown) => String(s || '').trim();
const currency = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const banks = Object.keys(emptyBankingData()) as Array<keyof BankingData>;
const YYYY_MM = () => {
  const now = new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0')].join('-');
};

const AdmissionDossierWorkspace: React.FC<{
  companies: Company[];
  onApproved?: () => Promise<unknown> | unknown;
}> = ({ companies, onApproved }) => {
  const { session } = useApp();
  const [open,setOpen] = useState(false);
  const [rows,setRows] = useState<Listed[]>([]);
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);
  const [draft,setDraft] = useState<Draft>(emptyDraft());
  const [bank,setBank] = useState<BankingData>(emptyBankingData());
  const [vrDaily,setVrDaily] = useState('');
  const [vtDaily,setVtDaily] = useState('');
  const [stage,setStage] = useState<Stage | null>(null);
  const [docs,setDocs] = useState<StoredDoc[]>([]);
  const [files,setFiles] = useState<File[]>([]);
  const [text,setText] = useState('');
  const [review,setReview] = useState<string[]>([]);
  const [readBusy,setReadBusy] = useState(false);
  const [confirmContract,setConfirmContract] = useState(false);
  const [competencia,setCompetencia] = useState(YYYY_MM());
  const [dirty,setDirty] = useState(false);
  const [preview,setPreview] = useState<Blob | null>(null);
  const [emailDraft,setEmailDraft] = useState<EmailPdfDraft | null>(null);
  const { datas: feriados, loading: loadingFeriados } = useFeriados(competencia,draft.empresa_id);

  const companiesSorted = useMemo(() => [...companies].sort((a,b) => a.name.localeCompare(b.name,'pt-BR')), [companies]);
  const locked = !!stage?.efetivado_em;
  const update = (patch: Partial<Draft>) => { if (locked) return; setDraft(prev => ({...prev,...patch})); setDirty(true); };

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data: staged, error: stageErr } = await (supabase as any).from('admission_dossier_workflow').select('*');
      if (stageErr) throw stageErr;
      const ids = (staged || []).map((row: Stage) => row.pre_cadastro_id);
      if (!ids.length) { setRows([]); return; }
      const { data: prereg, error } = await (supabase as any).from('pre_cadastros_admissionais').select('*').in('id', ids);
      if (error) throw error;
      const stageMap = new Map((staged || []).map((row: Stage) => [row.pre_cadastro_id,row]));
      setRows((prereg || []).map((row: Draft & { id: string }) =>
        ({ form: row, stage: stageMap.get(row.id) as Stage })).sort((a: Listed,b: Listed) =>
        (a.form.empresa_nome || '').localeCompare(b.form.empresa_nome || '','pt-BR') ||
        (a.form.nome || '').localeCompare(b.form.nome || '','pt-BR')));
    } catch (error: any) {
      toast.error('Falha ao carregar dossiês: ' + (error?.message || error));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) void fetchRows(); },[open,fetchRows]);

  const fetchDocs = useCallback(async (id: string) => {
    const { data,error } = await (supabase as any).from('pre_cadastro_documentos').select('*')
      .eq('pre_cadastro_id',id).order('created_at',{ascending:true});
    if(error) throw error;
    setDocs((data || []) as StoredDoc[]);
  },[]);

  const newDossier = () => {
    setDraft(emptyDraft());setStage(null);setBank(emptyBankingData());
    setVrDaily('');setVtDaily('');setFiles([]);setDocs([]);setText('');
    setReview([]);setConfirmContract(false);setDirty(false);
  };
  const openRow = async (item: Listed) => {
    if (files.length && !window.confirm('Há anexos ainda não salvos. Descartar a seleção local?')) return;
    const f=item.form;
    setDraft({ ...emptyDraft(), ...f, salario: f.salario === null ? '' : String(f.salario || '') });
    setStage(item.stage);
    setBank({ ...emptyBankingData(), ...(item.stage.dados_bancarios || {}) });
    setVrDaily(item.stage.vr_diario === null ? '' : String(item.stage.vr_diario));
    setVtDaily(item.stage.vt_diario === null ? '' : String(item.stage.vt_diario));
    setFiles([]);setText('');setReview([]);setConfirmContract(!!item.stage.contrato_documento_id);setDirty(false);
    try { await fetchDocs(f.id!); } catch (error: any) { toast.error(error?.message || 'Falha ao carregar anexos.'); }
  };

  const applyText = (raw: string) => {
    if (locked) return toast.error('Este dossiê já foi aprovado. Atualize o funcionário na ficha oficial.');
    if (!raw.trim()) return toast.error('Cole dados do candidato ou carregue uma ficha.');
    const read = readAdmissionDossier(raw);
    const parsed = parseBankingText(raw);
    const incomingBank = { ...read.banking };
    banks.forEach(key => { if (!CLEAN(incomingBank[key]) && CLEAN(parsed.data[key])) incomingBank[key]=parsed.data[key]; });
    const conflicts: string[] = [];
    setDraft(current => {
      const next = {...current};
      for (const [key,value] of Object.entries(read.fields)) {
        const field = key as keyof Draft;
        if (!value || !(field in next)) continue;
        const previous = CLEAN(next[field]);
        if (previous && previous.normalize('NFD').toUpperCase() !== CLEAN(value).normalize('NFD').toUpperCase()) {
          conflicts.push('Campo ' + field + ': valor existente diferente do arquivo; mantenha ou corrija manualmente.');
        } else if (!previous) (next as any)[field]=value;
      }
      return next;
    });
    setBank(current => {
      const next={...current};
      banks.forEach(key => {
        if (key==='textoOriginal' && !incomingBank[key]) return;
        const previous=CLEAN(current[key]),incoming=CLEAN(incomingBank[key]);
        if (!incoming) return;
        if (previous && previous !== incoming && key!=='textoOriginal')
          conflicts.push('Dados bancários: confira ' + key + ' antes de salvar.');
        else if (!previous) next[key]=incoming;
      });
      return next;
    });
    setReview(Array.from(new Set([...read.warnings,...conflicts])));
    setDirty(true);
    toast.success('Informações identificadas e transferidas para os campos vazios. Revise os avisos.');
  };

  const dataUrl = (file: File) => new Promise<string>((resolve,reject) => {
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result || ''));
    reader.onerror=()=>reject(new Error('Erro ao ler imagem.'));
    reader.readAsDataURL(file);
  });

  const readFiles = async (list: File[]) => {
    if (locked) return toast.error('Após aprovação, use o histórico documental do funcionário.');
    if (!list.length) return;
    setReadBusy(true);
    setFiles(current => [...current,...list]);
    try {
      let extracted='';
      const warnings:string[]=[];
      for (const file of list) {
        let chunk='';
        let images:string[]=[];
        if (/\.pdf$/i.test(file.name) || file.type==='application/pdf') {
          const bytes=new Uint8Array(await file.arrayBuffer());
          chunk=await extractPdfTextByLines(bytes).catch(()=>'');
          if(chunk.length < 150) images=(await renderPdfPagesToDataUrls(bytes,1.45,4)).pageUrls;
        } else if(file.type.startsWith('image/')) images=[await dataUrl(file)];
        else {warnings.push(file.name + ': formato de leitura não reconhecido.');continue;}
        if(images.length){
          const {data,error}=await supabase.functions.invoke('ocr-pre-cadastro',{body:{
            fileName:file.name,mimeType:file.type || 'application/octet-stream',text:chunk,images,
          }});
          if(error) {warnings.push(file.name+': leitura por imagem indisponível.');}
          else{
            const result=(data?.data || data || {}) as any;
            const fields=result.campos || {};
            chunk+='\n'+Object.entries(fields).filter(([,v]) => (v as any)?.valor)
              .map(([key,v])=>key.replace(/_/g,' ')+': '+String((v as any).valor)).join('\n');
            if(result.pendencias?.length) warnings.push(...result.pendencias);
          }
        }
        extracted+='\n'+chunk;
      }
      setText(current => [current,extracted.trim()].filter(Boolean).join('\n'));
      if(extracted.trim()) applyText(extracted);
      if(warnings.length) setReview(current => [...current,...warnings]);
      if(!extracted.trim()) toast.warning('Anexos selecionados. Preencha ou confira os campos manualmente antes de salvar.');
    } catch(error:any) {toast.error('Falha na leitura: '+(error?.message || error));}
    finally {setReadBusy(false);}
  };

  const uploadFile = async (file:File,id:string,kind:string) => {
    const safe=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,100);
    const path='pre-cadastro-dossie/'+id+'/'+crypto.randomUUID()+'-'+safe;
    const bucket='documentos-admissionais';
    const {error:storageError}=await supabase.storage.from(bucket).upload(path,file,{upsert:false});
    if(storageError) throw storageError;
    const url=supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    const {data,error}=await (supabase as any).from('pre_cadastro_documentos').insert({
      pre_cadastro_id:id,tipo_documento:kind,nome_arquivo:file.name,arquivo_url:url,status:'recebido',
    }).select('*').single();
    if(error) throw error;
    return data as StoredDoc;
  };

  const save = async () => {
    if (locked) return toast.error('A ficha oficial já foi criada. Não regrave o pré-cadastro.');
    if(!session?.user?.id) return toast.error('Sessão expirada.');
    if(!draft.nome.trim() || !draft.empresa_id) return toast.error('Informe nome e empresa para guardar este dossiê.');
    const selected=companies.find(co=>co.id===draft.empresa_id);
    if(!selected) return toast.error('Empresa não identificada.');
    setBusy(true);
    try{
      const row:any={
        empresa_id:selected.id,empresa_nome:selected.name,cnpj:selected.cnpj||'',
        nome:draft.nome.trim(),cpf:draft.cpf,rg:draft.rg,
        data_nascimento:draft.data_nascimento||null,data_admissao:draft.data_admissao||null,
        funcao:draft.funcao,salario:draft.salario===''?null:Number(draft.salario),
        email:draft.email,celular:draft.celular,endereco:draft.endereco,
        filiacao:draft.filiacao,escolaridade:draft.escolaridade,experiencia:draft.experiencia,
        epi:draft.epi,vale_refeicao:draft.vale_refeicao,vale_transporte:draft.vale_transporte,
        status:draft.status || 'aguardando_validacao',
      };
      if(!draft.id) row.criado_por=session.user.id;
      const req=draft.id
        ? (supabase as any).from('pre_cadastros_admissionais').update(row).eq('id',draft.id).select('*').single()
        : (supabase as any).from('pre_cadastros_admissionais').insert(row).select('*').single();
      const {data,error}=await req;
      if(error) throw error;
      const saved=data as Draft;
      const id=saved.id!;
      const {data:staged,error:stageError}=await (supabase as any).from('admission_dossier_workflow')
        .upsert({pre_cadastro_id:id,dados_bancarios:bank,
          vr_diario:vrDaily===''?null:Number(vrDaily),
          vt_diario:vtDaily===''?null:Number(vtDaily),
          updated_at:new Date().toISOString()},{onConflict:'pre_cadastro_id'}).select('*').single();
      if(stageError) throw stageError;
      setDraft({...draft,...saved,salario:saved.salario===null?'':String(saved.salario||'')});
      setStage(staged as Stage);
      setDirty(false);
      const failed:File[]=[];
      let uploaded=0;
      for(const file of files){
        try {await uploadFile(file,id,'documentacao_admissional');uploaded++;}
        catch(error:any){failed.push(file);toast.error(file.name+': '+(error?.message||'falha no upload'));}
      }
      setFiles(failed);
      await fetchDocs(id);
      await fetchRows();
      toast.success('Dossiê salvo em triagem. '+uploaded+' anexo(s) arquivado(s). Nenhum funcionário foi admitido.');
    }catch(error:any){toast.error('Falha ao salvar dossiê: '+(error?.message || error));}
    finally{setBusy(false);}
  };

  const receiveContract = async (file:File | undefined) => {
    if (locked) return toast.error('Contrato já oficializado. Use o histórico do funcionário para novos anexos.');
    if(!file) return;
    if(!draft.id) return toast.error('Salve o dossiê antes de anexar contrato.');
    if(!confirmContract) return toast.error('Marque a confirmação de recebimento do contrato primeiro.');
    setBusy(true);
    try{
      const doc=await uploadFile(file,draft.id,'contrato_recebido');
      const {data,error}=await (supabase as any).from('admission_dossier_workflow').update({
        contrato_documento_id:doc.id,contrato_recebido_em:new Date().toISOString(),updated_at:new Date().toISOString(),
      }).eq('pre_cadastro_id',draft.id).select('*').single();
      if(error) throw error;
      setStage(data as Stage);await fetchDocs(draft.id);await fetchRows();
      toast.success('Contrato recebido e vinculado ao dossiê. OK disponível após conferir todos os dados.');
    }catch(error:any){toast.error('Contrato não confirmado: '+(error?.message||error));}
    finally{setBusy(false);}
  };

  const copyOriginalsToEmployeeFolder = async (employeeId: string, folder: string) => {
    let copied=0;
    const failures:string[]=[];
    for (const doc of docs) {
      if (!doc.arquivo_url) continue;
      try {
        const response=await fetch(doc.arquivo_url);
        if (!response.ok) throw new Error('Origem indisponível (HTTP '+response.status+').');
        const blob=await response.blob();
        const safe=doc.nome_arquivo.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_');
        const path=folder+'/'+doc.id+'_'+safe;
        const {error:uploadError}=await supabase.storage.from('documentos-funcionarios')
          .upload(path,blob,{upsert:false,contentType:blob.type||'application/octet-stream'});
        if(uploadError) throw uploadError;
        const url=supabase.storage.from('documentos-funcionarios').getPublicUrl(path).data.publicUrl;
        const {error:updateError}=await (supabase as any).from('documentos_funcionario').update({
          arquivo_url:url,storage_bucket:'documentos-funcionarios',storage_path:path,
        }).eq('funcionario_id',employeeId).eq('origem','pre_cadastro').ilike('observacao','%'+doc.id+'%');
        if(updateError) throw updateError;
        copied++;
      }catch(error:any){failures.push(doc.nome_arquivo+': '+(error?.message||error));}
    }
    return {copied,failures};
  };

  const approve = async () => {
    if(!draft.id || !stage?.contrato_documento_id) return toast.error('O OK exige o contrato recebido.');
    if(dirty || files.length) return toast.error('Salve primeiro os dados e anexos pendentes.');
    if(!window.confirm('Confirmar recebimento do contrato e aprovação? O funcionário será cadastrado na empresa selecionada.')) return;
    setBusy(true);
    try{
      const {data,error}=await (supabase as any).rpc('admin_dossie_aprovar_com_contrato',{p_id:draft.id});
      if(error) throw error;
      const employeeId=String(data||'');
      const {data:official,error:stageError}=await (supabase as any).from('admission_dossier_workflow')
        .select('*').eq('pre_cadastro_id',draft.id).single();
      if(stageError) throw stageError;
      const stageValue=official as Stage;
      setStage(stageValue);
      setDraft(prev=>({...prev,status:'cadastro_oficial'}));
      setDirty(false);
      const folder=stageValue.pasta_funcionario || '';
      const result=folder ? await copyOriginalsToEmployeeFolder(employeeId,folder)
        : {copied:0,failures:['Pasta física não localizada; documentos preservados no histórico.']};
      await fetchRows();
      await onApproved?.();
      if(result.failures.length) toast.warning('Admissão aprovada e documentos associados; '+result.copied+' cópia(s) movida(s) para a pasta da empresa. Pendências: '+result.failures.join(' | '),{duration:12000});
      else toast.success('Admissão aprovada. '+result.copied+' documento(s) copiado(s) na pasta oficial da empresa; originais preservados.');
    }catch(error:any){toast.error('OK não executado: '+(error?.message||error));}
    finally{setBusy(false);}
  };

  const dossierValues = () => ({
    empresa:draft.empresa_nome,nome:draft.nome,cpf:draft.cpf,rg:draft.rg,
    data_nascimento:draft.data_nascimento,funcao:draft.funcao,salario:draft.salario,
    data_admissao:draft.data_admissao,celular:draft.celular,email:draft.email,endereco:draft.endereco,
    filiacao:draft.filiacao,escolaridade:draft.escolaridade,epi:draft.epi,
    banco:bank.banco,agencia:bank.agencia,conta:bank.conta+(bank.digito?'-'+bank.digito:''),
    titular:bank.titular,cpf_titular:bank.cpfTitular,pix:bank.chavePix,
    vr_diario:draft.vale_refeicao?currency(Number(vrDaily)):'Não',
    vt_diario:draft.vale_transporte?currency(Number(vtDaily)):'Não',
    status:stage?.efetivado_em?'Admissão aprovada':'Aguardando contrato / conferência',
  });

  const buildPdf = async (includeDocuments:boolean) => {
    const source=includeDocuments?docs.filter(d=>d.arquivo_url)
      .map(d=>({url:d.arquivo_url,name:d.nome_arquivo})):[];
    return buildAdmissionDossierPdf(dossierValues(),source);
  };
  const downloadDossier = async () => {
    if(!draft.nome) return toast.error('Informe ao menos o nome.');
    setBusy(true);
    try {
      const blob=await buildPdf(true);
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='DOSSIE_'+draft.nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_')+'.pdf';
      document.body.appendChild(a);a.click();a.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),120000);
      toast.success('Dossiê consolidado preparado; os originais permanecem armazenados separadamente.');
    }catch(error:any){toast.error('PDF não gerado: '+(error?.message||error));}
    finally{setBusy(false);}
  };
  const previewDossier = async () => {
    setBusy(true);
    try {setPreview(await buildPdf(true));}
    catch(error:any){toast.error('Prévia indisponível: '+(error?.message||error));}
    finally{setBusy(false);}
  };

  const days=businessDaysForAdmission(competencia,draft.data_admissao,feriados);
  const totalVr=draft.vale_refeicao?benefitAmount(Number(vrDaily),days):0;
  const totalVt=draft.vale_transporte?benefitAmount(Number(vtDaily),days):0;
  const canFinance=!!stage && !!draft.id && !dirty && files.length===0 &&
    (draft.vale_refeicao || draft.vale_transporte) &&
    !!draft.empresa_id && !!bank.banco && !!bank.agencia && !!bank.conta &&
    !!bank.titular && !!bank.cpfTitular && !!draft.data_admissao && days>0 &&
    (!draft.vale_refeicao || Number(vrDaily)>0) &&
    (!draft.vale_transporte || Number(vtDaily)>0) && !loadingFeriados;

  const prepareFinance = async () => {
    if(!canFinance || !draft.id) return toast.error('Salve o dossiê e confira empresa, admissão prevista, conta bancária, dias úteis e valores diários de VR/VT. Não é necessário aguardar o contrato.');
    setBusy(true);
    try{
      const body=[
        'Prezados, boa tarde.','',
        stage?.efetivado_em
          ? 'Solicitação de pagamento de benefícios admissionais:'
          : 'PROGRAMAÇÃO ANTECIPADA DE BENEFÍCIOS — CANDIDATO AINDA NÃO ADMITIDO:',
        (stage?.efetivado_em ? 'Funcionário: ' : 'Candidato: ')+draft.nome,'CPF: '+draft.cpf,
        'Empresa contratante: '+draft.empresa_nome,'CNPJ: '+draft.cnpj,
        (stage?.efetivado_em ? 'Data de admissão: ' : 'Admissão prevista: ')+draft.data_admissao,'Competência: '+competencia,
        'Dias úteis elegíveis: '+days+' (desde a admissão; feriados cadastrados descontados)','',
        'DADOS BANCÁRIOS',
        'Banco: '+bank.banco,'Agência: '+bank.agencia,'Conta: '+bank.conta+(bank.digito?'-'+bank.digito:''),
        'Titular: '+bank.titular,'CPF titular: '+bank.cpfTitular,'Chave PIX: '+bank.chavePix,'',
        'VR — Vale-Refeição: '+(draft.vale_refeicao ? currency(Number(vrDaily))+' ao dia x '+days+' = '+currency(totalVr) : 'Não aplicado'),
        'VT — Vale-Transporte: '+(draft.vale_transporte ? currency(Number(vtDaily))+' ao dia x '+days+' = '+currency(totalVt) : 'Não aplicado'),
        '',
        'Os valores de VR e VT estão separados para pagamento e conferência.',
        stage?.efetivado_em
          ? 'Favor confirmar o processamento e o comprovante, mantendo o fluxo interno usual.'
          : 'Envio antecipado exclusivamente para planejamento financeiro. O contrato ainda não foi recebido/aprovado, a admissão NÃO foi autorizada por este e-mail e os dados/valores devem ser reconfirmados antes de qualquer pagamento.',
      ].join('\n');
      const blob=await buildPdf(false);
      const snapshot={competencia,dias_uteis:days,vr_diario:Number(vrDaily)||0,vt_diario:Number(vtDaily)||0,
        valor_vr:totalVr,valor_vt:totalVt,empresa_id:draft.empresa_id,funcionario_nome:draft.nome,
        dados_bancarios:bank,programacao_antecipada:!stage?.efetivado_em};
      const {error}=await (supabase as any).from('admission_dossier_workflow').update({
        finance_snapshot:snapshot,finance_preparado_em:new Date().toISOString(),
      }).eq('pre_cadastro_id',draft.id);
      if(error) throw error;
      setEmailDraft({
        to:['marisa@aatconsultoria.com.br','dp@aatconsultoria.com.br'],cc:[],
        subject:(stage?.efetivado_em?'Pagamento':'Programação antecipada')+' VR e VT admissional - '+draft.nome+' - '+draft.empresa_nome,
        body,attachmentBlob:blob,attachmentName:'DOSSIE_FINANCEIRO_'+draft.id+'.pdf',
        senderUserId:session?.user?.id,senderEmail:session?.user?.email,
        moduleOrigin:'dossie_admissional_contabilidade',documentName:'Programação de benefícios admissionais de '+draft.nome,
        afterSend:async()=>{
          const {error:sentErr}=await (supabase as any).from('admission_dossier_workflow').update({
            finance_enviado_em:new Date().toISOString(),finance_enviado_por:session?.user?.id,
          }).eq('pre_cadastro_id',draft.id);
          if(sentErr) throw sentErr;
          setStage(prev=>prev?{...prev,finance_enviado_em:new Date().toISOString()}:prev);
          await fetchRows();
        },
      });
    }catch(error:any){toast.error('Envio para a contabilidade não preparado: '+(error?.message||error));}
    finally{setBusy(false);}
  };

  const statusBadge = (item:Listed) => item.stage.efetivado_em ? 'Admitido'
    : item.stage.contrato_documento_id ? 'Contrato recebido • aguardando OK'
    : 'Triagem • aguardando contrato';

  return (
    <div className="overflow-hidden rounded-2xl border border-violet-400/50 bg-gradient-to-br from-[#23113e] via-[#100c21] to-[#07131e] shadow-[0_10px_42px_rgba(168,85,247,.12)]">
      <button type="button" className="flex w-full items-center justify-between gap-3 p-5 text-left" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>
        <span><strong className="flex items-center gap-2 text-lg text-white"><Sparkles className="text-amber-300"/> DOSSIÊ ADMISSIONAL INTELIGENTE</strong>
          <span className="mt-1 block text-xs text-zinc-200">Texto, ficha, PDF único, documentação, banco, benefícios e liberação somente após contrato. Pré-cadastro anterior preservado.</span></span>
        <span className="rounded-lg border border-amber-400/40 bg-amber-400/15 px-3 py-2 text-xs font-bold text-amber-200">{open?'RECOLHER':'ABRIR NOVO FLUXO'}</span>
      </button>
      {open && <div className="space-y-5 border-t border-violet-400/20 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><strong className="text-white">Candidatos em triagem</strong><p className="text-xs text-zinc-300">Agrupamento visual por empresa, nomes em ordem alfabética.</p></div>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>void fetchRows()} disabled={loading}><RefreshCw size={14}/></Button>
            <Button size="sm" onClick={newDossier} className="bg-amber-400 font-bold text-zinc-950 hover:bg-amber-300">+ Novo dossiê</Button></div>
        </div>
        {loading&&<p className="text-sm text-zinc-200">Carregando dossiês...</p>}
        {rows.length>0&&<div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(item=><button key={item.form.id} type="button" onClick={()=>void openRow(item)}
            className={'rounded-xl border p-3 text-left transition-colors '+(draft.id===item.form.id?'border-amber-400 bg-amber-400/15':'border-violet-400/30 bg-black/30 hover:border-fuchsia-400')}>
            <strong className="block truncate text-sm text-white">{item.form.nome}</strong>
            <span className="mt-1 block truncate text-xs text-fuchsia-200">{item.form.empresa_nome}</span>
            <span className={'mt-2 block text-xs '+(item.stage.efetivado_em?'text-emerald-300':item.stage.contrato_documento_id?'text-amber-300':'text-zinc-300')}>{statusBadge(item)}</span>
          </button>)}
        </div>}
        <div className="rounded-xl border border-cyan-400/40 bg-cyan-400/5 p-4">
          <div className="flex items-center gap-2 text-base font-bold text-cyan-200"><FileSearch size={18}/> 1. Ler e organizar o material recebido</div>
          <p className="mt-1 text-xs text-zinc-300">Cole a mensagem ou selecione ficha/PDF único. Campos já preenchidos não serão substituídos silenciosamente. A empresa contratante deve ser selecionada manualmente.</p>
          <Textarea value={text} onChange={e=>setText(e.target.value)} className="mt-3 min-h-28 bg-[#0a1222] text-white" placeholder="Cole aqui informações pessoais, endereço e dados bancários do candidato..."/>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" disabled={!text.trim()||busy} onClick={()=>applyText(text)} className="bg-cyan-500 font-bold text-zinc-950 hover:bg-cyan-400"><Sparkles size={15} className="mr-1"/> Ler texto e preencher</Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-violet-300/50 px-3 py-2 text-sm text-white">
              <Upload size={15}/> {readBusy?'Lendo arquivos...':'Ficha / PDF único / outros documentos'}
              <input type="file" multiple accept=".pdf,image/png,image/jpeg" className="hidden" disabled={readBusy||busy||locked}
                onChange={e=>{void readFiles(Array.from(e.target.files||[]));e.currentTarget.value='';}}/>
            </label>
          </div>
          {!!files.length&&<p className="mt-2 text-xs text-amber-200">{files.length} arquivo(s) selecionado(s) aguardando salvar no dossiê.</p>}
          {!!review.length&&<div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-100"><strong>Conferência necessária:</strong>
            {review.map((w,i)=><p key={i} className="mt-1">• {w}</p>)}</div>}
        </div>
        <div className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-400/5 p-4">
          <strong className="text-base text-fuchsia-200">2. Dados completos do candidato</strong>
          <fieldset disabled={locked} className="space-y-3">
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs text-zinc-200">Empresa contratante
              <select value={draft.empresa_id} onChange={e=>{const co=companies.find(v=>v.id===e.target.value);update({empresa_id:co?.id||'',empresa_nome:co?.name||'',cnpj:co?.cnpj||''});}}
                className="mt-1 h-10 w-full rounded-md border border-fuchsia-300/30 bg-[#0a1222] px-2 text-white">
                <option value="">Selecionar empresa correta</option>
                {companiesSorted.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {([
              ['Nome completo','nome'],['CPF','cpf'],['RG','rg'],['Data de nascimento','data_nascimento'],
              ['Data prevista da admissão','data_admissao'],['Função','funcao'],['Salário-base previsto','salario'],
              ['Celular','celular'],['E-mail','email'],['Endereço','endereco'],
              ['Filiação','filiacao'],['Escolaridade','escolaridade'],['Histórico profissional','experiencia'],
              ['Medidas EPI','epi'],
            ] as Array<[string,keyof Draft]>).map(([label,key])=><label key={key} className="text-xs text-zinc-200">{label}
              <Input type={key==='data_nascimento'||key==='data_admissao'?'date':key==='salario'?'number':'text'}
                value={String(draft[key]||'')} onChange={e=>update({[key]:e.target.value})}
                className="mt-1 border-fuchsia-300/30 bg-[#0a1222] text-white"/>
            </label>)}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-zinc-200">Vale-refeição
              <select value={draft.vale_refeicao?'sim':'nao'} onChange={e=>update({vale_refeicao:e.target.value==='sim'})}
                className="mt-1 h-10 w-full rounded-md border border-amber-300/30 bg-[#0a1222] px-2 text-white">
                <option value="nao">Não</option><option value="sim">Sim</option>
              </select></label>
            <label className="text-xs text-zinc-200">Vale-transporte
              <select value={draft.vale_transporte?'sim':'nao'} onChange={e=>update({vale_transporte:e.target.value==='sim'})}
                className="mt-1 h-10 w-full rounded-md border border-amber-300/30 bg-[#0a1222] px-2 text-white">
                <option value="nao">Não</option><option value="sim">Sim</option>
              </select></label>
            {draft.vale_refeicao&&<label className="text-xs text-zinc-200">VR diário (R$)
              <Input type="number" min="0" step=".01" value={vrDaily} onChange={e=>{setVrDaily(e.target.value);setDirty(true);}}
                className="mt-1 border-amber-300/30 bg-[#0a1222] text-white"/></label>}
            {draft.vale_transporte&&<label className="text-xs text-zinc-200">VT diário (R$)
              <Input type="number" min="0" step=".01" value={vtDaily} onChange={e=>{setVtDaily(e.target.value);setDirty(true);}}
                className="mt-1 border-amber-300/30 bg-[#0a1222] text-white"/></label>}
          </div>
          </fieldset>
        </div>
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-4">
          <strong className="flex items-center gap-2 text-base text-emerald-200"><Landmark size={17}/> 3. Dados bancários — mesmo cadastro</strong>
          <p className="mt-1 text-xs text-zinc-200">Nada de preencher novamente no cadastro de baixo. Após o OK, estes dados alimentam a ficha oficial do funcionário.</p>
          <fieldset disabled={locked} className="mt-3 rounded-xl border border-emerald-400/20 bg-[#0a1222] p-3 text-white">
            <BankingDataEditor value={bank} onChange={b=>{setBank(b);setDirty(true);}}
              defaultHolder={draft.nome} defaultCpf={draft.cpf}/>
          </fieldset>
        </div>
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
          <strong className="flex items-center gap-2 text-base text-amber-200"><FolderLock size={18}/> 4. Pasta provisória e contrato</strong>
          <p className="mt-1 text-xs text-zinc-200">Os documentos aguardam aqui. A pasta do funcionário na empresa só é formada após seu OK e o contrato recebido.</p>
          {!!docs.length&&<div className="mt-3 space-y-2">{docs.map(doc=><div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/20 bg-black/20 p-2">
            <span className="min-w-0 text-xs text-zinc-100"><Paperclip size={13} className="mr-1 inline"/>{doc.nome_arquivo} • {doc.tipo_documento}</span>
            <a className="text-xs font-semibold text-cyan-200 underline" href={doc.arquivo_url} target="_blank" rel="noopener noreferrer">Abrir original</a>
          </div>)}</div>}
          {stage?.pasta_funcionario&&<p className="mt-3 break-all rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2 text-xs text-emerald-200">Pasta oficial: {draft.empresa_nome} / Funcionários / {draft.nome}</p>}
          <label className="mt-4 flex items-center gap-2 text-xs text-amber-100"><input type="checkbox" checked={confirmContract} onChange={e=>setConfirmContract(e.target.checked)}/> Confirmo que recebi o contrato de trabalho deste candidato.</label>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-400 bg-amber-400/20 px-3 py-2 text-sm font-semibold text-amber-100">
            <Upload size={15}/> Anexar contrato recebido
            <input type="file" accept=".pdf,image/png,image/jpeg" className="hidden" disabled={!confirmContract||busy||!draft.id||locked}
              onChange={e=>{void receiveContract(e.target.files?.[0]);e.currentTarget.value='';}}/>
          </label>
          <p className="mt-2 text-xs text-zinc-300">{stage?.contrato_documento_id?'Contrato arquivado e identificado.':'Sem contrato: OK bloqueado.'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={locked||busy||readBusy||!draft.nome||!draft.empresa_id} onClick={()=>void save()} className="bg-amber-400 font-bold text-zinc-950 hover:bg-amber-300"><Save size={15} className="mr-1"/> Salvar dossiê provisório</Button>
            <Button variant="outline" disabled={busy||!draft.nome} onClick={()=>void previewDossier()}><FileSearch size={15} className="mr-1"/> Visualizar PDF</Button>
            <Button variant="outline" disabled={busy||!draft.nome} onClick={()=>void downloadDossier()}><Download size={15} className="mr-1"/> Baixar dossiê</Button>
            <Button disabled={busy||!stage?.contrato_documento_id||!!stage?.efetivado_em||dirty||files.length>0}
              onClick={()=>void approve()} className="bg-emerald-500 font-black text-zinc-950 hover:bg-emerald-400">
              <BadgeCheck size={16} className="mr-1"/> OK — admitir e organizar pasta
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-cyan-400/40 bg-cyan-400/5 p-4">
          <strong className="flex items-center gap-2 text-base text-cyan-200"><Mail size={18}/> 5. Programar VR e VT com a Contabilidade</strong>
          <p className="mt-1 text-xs text-zinc-200">Pode enviar antes do contrato para permitir a programação. Salve primeiro o dossiê com banco, data prevista e valores; VR e VT seguem separados pelos dias úteis elegíveis da competência, descontando feriados cadastrados.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3"><label className="text-xs text-zinc-200">Competência
            <Input type="month" value={competencia} onChange={e=>setCompetencia(e.target.value)} className="mt-1 border-cyan-300/30 bg-[#0a1222] text-white"/></label>
            <span className="text-sm text-white">Dias úteis elegíveis: <strong className="text-amber-300">{loadingFeriados?'Conferindo...':days}</strong></span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-fuchsia-400/50 bg-fuchsia-500/15 p-4">
              <p className="text-sm font-semibold text-fuchsia-200">VR — Vale-Refeição</p>
              <p className="mt-2 text-2xl font-black text-white">{currency(totalVr)}</p>
              <p className="text-xs text-zinc-200">{draft.vale_refeicao?currency(Number(vrDaily))+' por dia × '+days:'Não aplicado'}</p>
            </div>
            <div className="rounded-xl border border-cyan-400/50 bg-cyan-500/15 p-4">
              <p className="text-sm font-semibold text-cyan-200">VT — Vale-Transporte</p>
              <p className="mt-2 text-2xl font-black text-white">{currency(totalVt)}</p>
              <p className="text-xs text-zinc-200">{draft.vale_transporte?currency(Number(vtDaily))+' por dia × '+days:'Não aplicado'}</p>
            </div>
          </div>
          <Button className="mt-3 bg-cyan-400 font-bold text-zinc-950 hover:bg-cyan-300" disabled={!canFinance||busy}
            onClick={()=>void prepareFinance()}><ArrowRight size={16} className="mr-1"/> {stage?.efetivado_em?'Enviar benefícios à Contabilidade':'Enviar programação à Contabilidade'}</Button>
          {!stage?.efetivado_em&&<p className="mt-2 flex items-center gap-1 text-xs text-amber-200"><ShieldAlert size={13}/> Programação não libera admissão, contrato, pasta oficial ou pagamento automático. O OK da admissão continua bloqueado até você anexar e confirmar o contrato.</p>}
          {!!stage?.finance_enviado_em&&<p className="mt-2 flex items-center gap-1 text-xs text-emerald-200"><CheckCircle2 size={13}/> Encaminhado à contabilidade em {new Date(stage.finance_enviado_em).toLocaleString('pt-BR')}</p>}
        </div>
      </div>}
      <Dialog open={!!preview} onOpenChange={v=>{if(!v)setPreview(null);}}>
        <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Dossiê para conferência</DialogTitle></DialogHeader>
          <PdfDocumentViewer sourceBlob={preview} title="Dossiê admissional" filename="DOSSIE_ADMISSIONAL.pdf"/>
        </DialogContent>
      </Dialog>
      <EmailPdfModal open={!!emailDraft} draft={emailDraft} onOpenChange={v=>{if(!v)setEmailDraft(null);}}/>
    </div>
  );
};

export default AdmissionDossierWorkspace;
