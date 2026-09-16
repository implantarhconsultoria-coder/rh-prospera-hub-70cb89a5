import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check, CheckCircle2, ChevronRight, CircleAlert, FileCheck2, FileUp, Loader2, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { gerarAutorizacaoExameAdmissionalPdf } from '@/lib/pdfGenerator';

type Requisito = { tipo: string; label: string; obrigatorio: boolean };
type Documento = { tipo: string; nome: string; url?: string; status?: string; created_at?: string };
type Candidate = {
  nome: string; cpf: string; rg: string; data_nascimento: string; endereco: string; email: string; celular: string;
  filiacao: string; escolaridade: string; empresa_nome: string; cnpj: string; funcao: string; setor_ghe: string;
  obra_local: string; data_admissao: string; tipo_admissao: string; exige_toxicologico: boolean;
};
type Fse = Record<string, any>;
type State = {
  status: string; requisitos: Requisito[]; documentos: Documento[]; candidato: Candidate; fse?: Fse;
  ficha_concluida_em?: string | null; concluido_em?: string | null; aso_gerado_em?: string | null;
};

const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const formatCpf = (value: unknown) => {
  const d = onlyDigits(value).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};
const formatPhone = (value: unknown) => {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
};
const today = () => new Date().toISOString().slice(0, 10);
const emptyRows = (n:number, factory:()=>Record<string,string>) => Array.from({ length:n }, factory);

const api = async (payload: Record<string, unknown>) => {
  const response = await fetch('/api/pre-cadastro-candidato', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    const error:any = new Error(String(data?.error || 'Não foi possível concluir a operação.'));
    error.data = data;
    throw error;
  }
  return data;
};

const Field = ({ label, value, onChange, type='text', placeholder='', inputMode, readOnly=false }: {
  label:string; value:any; onChange?:(value:string)=>void; type?:string; placeholder?:string;
  inputMode?:React.HTMLAttributes<HTMLInputElement>['inputMode']; readOnly?:boolean;
}) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-semibold text-zinc-300">{label}</span>
    <input type={type} inputMode={inputMode} value={value || ''} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly}
      className={`h-12 w-full rounded-xl border px-3 text-sm text-white outline-none ${readOnly ? 'border-white/10 bg-white/[.035] text-zinc-400' : 'border-violet-500/20 bg-[#090b10] focus:border-violet-400/60'} placeholder:text-zinc-700`} />
  </label>
);

const SelectField = ({ label, value, onChange, options }: { label:string; value:any; onChange:(value:string)=>void; options:string[] }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-semibold text-zinc-300">{label}</span>
    <select value={value || ''} onChange={e=>onChange(e.target.value)} className="h-12 w-full rounded-xl border border-violet-500/20 bg-[#090b10] px-3 text-sm text-white outline-none focus:border-violet-400/60">
      <option value="">Selecione</option>{options.map(x=><option key={x} value={x}>{x}</option>)}
    </select>
  </label>
);

const Area = ({ label, value, onChange, rows=3 }: { label:string; value:any; onChange:(value:string)=>void; rows?:number }) => (
  <label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-300">{label}</span>
    <textarea rows={rows} value={value || ''} onChange={e=>onChange(e.target.value)} className="w-full resize-y rounded-xl border border-violet-500/20 bg-[#090b10] px-3 py-3 text-sm text-white outline-none focus:border-violet-400/60" />
  </label>
);

const Section = ({ number, title, subtitle, children }: { number:string; title:string; subtitle?:string; children:React.ReactNode }) => (
  <section className="rounded-3xl border border-violet-500/20 bg-[#07090d] p-4 shadow-[0_18px_45px_rgba(0,0,0,.28)]">
    <div className="flex gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-500/12 text-xs font-black text-violet-300">{number}</div><div><h2 className="text-base font-black">{title}</h2>{subtitle && <p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p>}</div></div>
    <div className="mt-4">{children}</div>
  </section>
);

const documentTypedInfo = (tipo:string, fse:Fse) => {
  if (tipo === 'documento_identificacao') return [fse.rg && `RG/CIN ${fse.rg}`, fse.rg_uf && `UF ${fse.rg_uf}`, fse.cpf && `CPF ${formatCpf(fse.cpf)}`].filter(Boolean).join(' • ');
  if (tipo === 'comprovante_endereco') return [fse.logradouro, fse.numero, fse.bairro, fse.cidade, fse.estado, fse.cep].filter(Boolean).join(' • ');
  if (tipo === 'ctps') return [fse.ctps && `CTPS ${fse.ctps}`, fse.ctps_serie && `Série ${fse.ctps_serie}`].filter(Boolean).join(' • ');
  if (tipo === 'pis_nis') return fse.pis ? `PIS/NIS ${fse.pis}` : '';
  if (tipo === 'titulo_eleitoral') return [fse.titulo_eleitor && `Título ${fse.titulo_eleitor}`, fse.zona && `Zona ${fse.zona}`, fse.secao && `Seção ${fse.secao}`].filter(Boolean).join(' • ');
  if (tipo === 'cnh') return [fse.cnh && `CNH ${fse.cnh}`, fse.cnh_categoria && `Cat. ${fse.cnh_categoria}`, fse.cnh_validade && `Val. ${fse.cnh_validade}`].filter(Boolean).join(' • ');
  if (tipo === 'reservista') return fse.reservista ? `Reservista ${fse.reservista}` : '';
  return '';
};

export default function CandidatoDocumentosPage() {
  const { token='' } = useParams<{token:string}>();
  const location = useLocation();
  const navigate = useNavigate();
  const docsStage = location.pathname.includes('/pre-cadastro/documentos/');
  const [state, setState] = useState<State|null>(null);
  const [fse, setFse] = useState<Fse>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [reviewFicha, setReviewFicha] = useState(false);
  const [reviewDocs, setReviewDocs] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api({ action:'state', token });
      const next:State = { status:data.status, requisitos:data.requisitos||[], documentos:data.documentos||[], candidato:data.candidato||{}, fse:data.fse||{}, ficha_concluida_em:data.ficha_concluida_em, concluido_em:data.concluido_em, aso_gerado_em:data.aso_gerado_em };
      setState(next);
      const existing = data.fse || {};
      setFse((current:Fse) => Object.keys(current).length ? current : {
        cargo_pretendido:next.candidato.funcao || '', data_preenchimento:today(), nome:next.candidato.nome || '', cpf:next.candidato.cpf || '', rg:next.candidato.rg || '',
        data_nascimento:next.candidato.data_nascimento || '', celular:next.candidato.celular || '', email:next.candidato.email || '',
        logradouro:next.candidato.endereco || '', escolaridade_nivel:next.candidato.escolaridade || '',
        filhos:emptyRows(3,()=>({nome:'',nascimento:''})), formacao_tecnica:emptyRows(3,()=>({curso:'',ano:''})),
        experiencias:emptyRows(3,()=>({empresa:'',cidade:'',uf:'',fone:'',admissao:'',demissao:'',salario:'',cargo:'',iniciativa_propria:'',justificativa:''})),
        referencias:emptyRows(3,()=>({nome:'',fone:''})), ...existing,
      });
      setDone(next.status === 'concluido');
    } catch (e:any) {
      setError(e?.message === 'link_expirado' ? 'Este link expirou. Solicite um novo link ao RH.' : 'Este link não está disponível. Confirme o endereço recebido com o RH.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(()=>{ void load(); },[load]);
  useEffect(()=>{
    if (!loading && state && docsStage && !state.ficha_concluida_em && state.status !== 'concluido') navigate(`/pre-cadastro/ficha/${token}`, { replace:true });
  },[loading,state,docsStage,navigate,token]);

  const set = (key:string, value:any) => { setFse(p=>({...p,[key]:value})); setReviewFicha(false); };
  const setArray = (key:string, index:number, field:string, value:string) => setFse(p=>({ ...p, [key]:(Array.isArray(p[key]) ? p[key] : []).map((row:any,i:number)=>i===index?{...row,[field]:value}:row) }));

  const tiposEnviados = useMemo(()=>new Set((state?.documentos||[]).map(d=>d.tipo)),[state?.documentos]);
  const faltandoDocs = useMemo(()=>(state?.requisitos||[]).filter(r=>r.obrigatorio&&!tiposEnviados.has(r.tipo)),[state?.requisitos,tiposEnviados]);
  const fichaMissing = useMemo(()=>{
    const missing:string[]=[];
    if(!String(fse.nome||'').trim()) missing.push('Nome completo');
    if(onlyDigits(fse.cpf).length!==11) missing.push('CPF');
    if(!fse.data_nascimento) missing.push('Data de nascimento');
    if(onlyDigits(fse.celular).length<10) missing.push('Celular');
    if(!String(fse.logradouro||'').trim()) missing.push('Rua / Logradouro');
    if(!String(fse.numero||'').trim()) missing.push('Número');
    if(!String(fse.bairro||'').trim()) missing.push('Bairro');
    if(!String(fse.cidade||'').trim()) missing.push('Cidade');
    if(!String(fse.estado||'').trim()) missing.push('Estado');
    if(!String(fse.escolaridade_nivel||'').trim()) missing.push('Formação escolar');
    if(!fse.declaracao_aceita) missing.push('Declaração final');
    return missing;
  },[fse]);

  const saveFse = async (complete=false) => {
    setSaving(true); setError('');
    try {
      const data = await api({ action:complete?'complete_fse':'save_fse', token, fse:{...fse, cpf:onlyDigits(fse.cpf), celular:onlyDigits(fse.celular)} });
      if (complete) { await load(); navigate(`/pre-cadastro/documentos/${token}`); }
      return data;
    } catch(e:any) {
      const fields=e?.data?.campos||[];
      setError(fields.length?`Revise antes de concluir: ${fields.join(', ')}.`:(e?.message||'Não foi possível salvar a ficha.'));
      return null;
    } finally { setSaving(false); }
  };

  const requestUpload = async (tipo:string, file:File) => {
    const signed=await api({action:'create_upload',token,tipo,fileName:file.name,contentType:file.type||'application/octet-stream'});
    const {error:uploadError}=await supabase.storage.from(signed.bucket).uploadToSignedUrl(signed.path,signed.uploadToken,file,{contentType:file.type||'application/octet-stream'});
    if(uploadError) throw uploadError;
    return signed;
  };
  const uploadDoc = async (tipo:string,file?:File|null) => {
    if(!file)return; setUploading(tipo);setError('');
    try{const signed=await requestUpload(tipo,file);await api({action:'register_upload',token,tipo,path:signed.path,fileName:file.name});await load();}
    catch(e:any){setError(e?.message||`Não foi possível enviar ${file.name}.`);}finally{setUploading('');}
  };

  const gerarAsoAutomatico = async (candidate:Candidate) => {
    const pdf=gerarAutorizacaoExameAdmissionalPdf({empresa:candidate.empresa_nome||'',cnpj:candidate.cnpj||'',nome:candidate.nome||'',cpf:candidate.cpf||'',rg:candidate.rg||'',funcao:candidate.funcao||'',dataAdmissao:candidate.data_admissao||'',dataNascimento:candidate.data_nascimento||'',setorGhe:candidate.setor_ghe||'',dataExame:today(),tipoExame:candidate.tipo_admissao||'Admissional',obraLocal:candidate.obra_local||'',trabalhoAltura:false,espacoConfinado:false,toxicologico:!!candidate.exige_toxicologico,responsavelContato:'ROBSON CHAFI SERVILIO - CEL 11 94292-0385'});
    const file=new File([pdf.blob],pdf.fileName,{type:'application/pdf'});const signed=await requestUpload('guia_aso',file);await api({action:'register_aso',token,path:signed.path,fileName:file.name});
  };

  const finalize = async () => {
    setError('');
    if(faltandoDocs.length){setError(`Ainda falta: ${faltandoDocs.map(x=>x.label).join(', ')}.`);return;}
    setSaving(true);
    try{const result=await api({action:'finalize',token});if(result.aso_ready&&result.candidato)await gerarAsoAutomatico(result.candidato as Candidate);setDone(true);await load();}
    catch(e:any){const docs=e?.data?.documentos||[];const fields=e?.data?.campos||[];setError([...docs,...fields].length?`Ainda falta: ${[...docs,...fields].join(', ')}.`:(e?.message||'Não foi possível finalizar.'));}
    finally{setSaving(false);}
  };

  const DocumentCards = ({ title='Documentos', subtitle }: { title?:string; subtitle?:string }) => (
    <div>
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-black">{title}</h3>{subtitle&&<p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p>}</div><div className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-zinc-400">{tiposEnviados.size}/{state?.requisitos.length||0}</div></div>
      <div className="mt-3 space-y-2">{(state?.requisitos||[]).map(req=>{const sent=tiposEnviados.has(req.tipo);const typed=documentTypedInfo(req.tipo,fse);return <label key={req.tipo} className={`block rounded-2xl border p-3 ${sent?'border-emerald-500/25 bg-emerald-500/[.06]':'border-white/10 bg-white/[.02]'}`}>
        <div className="flex items-start gap-3"><div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${sent?'bg-emerald-500/15 text-emerald-400':'bg-violet-500/10 text-violet-300'}`}>{sent?<FileCheck2 className="h-5 w-5"/>:<FileUp className="h-5 w-5"/>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-bold">{req.label}</span>{req.obrigatorio&&<span className="text-[9px] font-black uppercase tracking-wider text-amber-400">obrigatório</span>}</div>{typed&&<div className="mt-1 break-words text-[11px] text-zinc-500">Preenchido: {typed}</div>}<div className={`mt-1 text-[11px] ${sent?'text-emerald-400':'text-zinc-600'}`}>{sent?'Anexo recebido. Toque para substituir.':'Anexe uma foto nítida ou PDF.'}</div></div></div>
        <input className="sr-only" type="file" accept="image/*,.pdf,application/pdf" disabled={uploading===req.tipo} onChange={e=>void uploadDoc(req.tipo,e.target.files?.[0])}/>{uploading===req.tipo&&<div className="mt-2 flex items-center gap-2 text-xs text-violet-300"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Enviando...</div>}
      </label>})}</div>
    </div>
  );

  if(loading&&!state)return <div className="grid min-h-screen place-items-center bg-[#030609] text-white"><Loader2 className="h-7 w-7 animate-spin text-violet-400"/></div>;
  if(error&&!state)return <div className="grid min-h-screen place-items-center bg-[#030609] px-5 text-white"><div className="max-w-md rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center"><CircleAlert className="mx-auto mb-3 h-8 w-8 text-red-400"/><div className="font-bold">Link indisponível</div><p className="mt-2 text-sm text-zinc-400">{error}</p></div></div>;
  if(!state)return null;

  if(done)return <div className="min-h-screen bg-[#030609] px-4 py-10 text-white"><div className="mx-auto max-w-lg rounded-3xl border border-emerald-500/25 bg-[#070b0d] p-7 text-center shadow-2xl"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400"/><h1 className="mt-4 text-2xl font-black">Pré-cadastro concluído</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Sua ficha e seus documentos foram enviados ao RH. A guia do ASO foi criada automaticamente e o processo segue para a próxima etapa.</p><div className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-left text-sm"><b>{state.candidato.nome}</b><div className="mt-1 text-zinc-500">{state.candidato.empresa_nome||'TOPAC'}</div></div></div></div>;

  if(docsStage)return <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(124,58,237,.16),transparent_28%),#030609] px-3 py-5 text-white"><div className="mx-auto max-w-xl space-y-4"><header className="rounded-3xl border border-violet-500/20 bg-[#07090d]/95 p-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-violet-500/30 bg-violet-500/10 font-black text-amber-400">T</div><div><div className="text-lg font-black">TOPAC RH PRO</div><div className="text-xs text-zinc-500">Documentação para contratação</div></div></div><div className="mt-5"><div className="text-xl font-black">{state.candidato.nome||'Candidato'}</div><div className="mt-1 text-sm text-zinc-500">Ficha FSE concluída • agora confira os documentos</div></div></header>{error&&<div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
    <Section number="✓" title="Ficha recebida"><div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[.06] p-3"><CheckCircle2 className="h-5 w-5 text-emerald-400"/><div><div className="text-sm font-bold">Sua ficha já alimentou o pré-cadastro</div><div className="mt-1 text-xs text-zinc-500">Você pode voltar à ficha para corrigir enquanto a documentação não for finalizada.</div></div></div><button onClick={()=>navigate(`/pre-cadastro/ficha/${token}`)} className="mt-3 text-xs font-bold text-violet-300">Voltar e revisar ficha</button></Section>
    <Section number="2" title="Documentos" subtitle="Os dados digitados na ficha aparecem junto do anexo. Todos os itens obrigatórios precisam ficar verdes."><DocumentCards/></Section>
    {!reviewDocs?<button onClick={()=>{if(faltandoDocs.length)setError(`Ainda falta: ${faltandoDocs.map(x=>x.label).join(', ')}.`);else{setError('');setReviewDocs(true);}}} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 text-sm font-black text-black">Conferir documentação <ChevronRight className="h-4 w-4"/></button>:<section className="rounded-3xl border border-amber-400/25 bg-amber-400/[.05] p-4"><h2 className="text-base font-black">Conferência final</h2><p className="mt-1 text-xs leading-5 text-zinc-400">Confira seu nome, empresa e se todos os documentos enviados estão corretos. Depois de concluir, o RH recebe o processo e a guia do ASO é criada automaticamente.</p><div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm"><b>{state.candidato.nome}</b><div className="mt-1 text-zinc-500">{state.candidato.empresa_nome} • {state.candidato.funcao}</div><div className="mt-2 text-emerald-400">{state.requisitos.filter(r=>r.obrigatorio).length} documentos obrigatórios conferidos</div></div><button disabled={saving} onClick={()=>void finalize()} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-black text-black disabled:opacity-50">{saving?<Loader2 className="h-5 w-5 animate-spin"/>:<ShieldCheck className="h-5 w-5"/>}{saving?'Finalizando...':'Conferir e concluir'}</button><button onClick={()=>setReviewDocs(false)} className="mt-3 w-full text-xs font-semibold text-zinc-500">Voltar e corrigir</button></section>}
  </div></div>;

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(124,58,237,.16),transparent_28%),#030609] px-3 py-5 text-white"><div className="mx-auto max-w-xl space-y-4"><header className="rounded-3xl border border-violet-500/20 bg-[#07090d]/95 p-5 shadow-2xl"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-violet-500/30 bg-violet-500/10 font-black text-amber-400">T</div><div><div className="text-lg font-black">TOPAC RH PRO</div><div className="text-xs text-zinc-500">Ficha de Solicitação de Emprego • FSE-2026</div></div></div><div className="mt-5"><div className="text-xl font-black">Preencha sua ficha</div><div className="mt-1 text-sm leading-6 text-zinc-500">Os dados vão diretamente para o pré-cadastro. Você também pode anexar agora as fotos dos documentos que já tiver.</div></div></header>{error&&<div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

    <Section number="1" title="Vaga pretendida"><div className="grid gap-3 sm:grid-cols-2"><Field label="Cargo pretendido" value={state.candidato.funcao||fse.cargo_pretendido} readOnly/><Field label="Data do preenchimento" type="date" value={fse.data_preenchimento||today()} onChange={v=>set('data_preenchimento',v)}/></div></Section>

    <Section number="2" title="Dados pessoais"><div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Nome completo *" value={fse.nome} onChange={v=>set('nome',v)}/></div><Field label="Filiação - Pai" value={fse.pai} onChange={v=>set('pai',v)}/><Field label="Filiação - Mãe" value={fse.mae} onChange={v=>set('mae',v)}/><SelectField label="Estado civil" value={fse.estado_civil} onChange={v=>set('estado_civil',v)} options={['Casado(a)','Solteiro(a)','Divorciado(a)','Viúvo(a)','Outros']}/><Field label="Data de nascimento *" type="date" value={fse.data_nascimento} onChange={v=>set('data_nascimento',v)}/><Field label="Naturalidade" value={fse.naturalidade} onChange={v=>set('naturalidade',v)}/><Field label="UF nascimento" value={fse.uf_nascimento} onChange={v=>set('uf_nascimento',v)}/><Field label="Nacionalidade" value={fse.nacionalidade} onChange={v=>set('nacionalidade',v)}/><Field label="Nº de dependentes" inputMode="numeric" value={fse.dependentes} onChange={v=>set('dependentes',v)}/></div><div className="mt-4 space-y-2"><div className="text-xs font-bold text-zinc-300">Filhos(as) menores de 18 anos</div>{(fse.filhos||emptyRows(3,()=>({nome:'',nascimento:''}))).map((row:any,i:number)=><div key={i} className="grid grid-cols-[1fr_130px] gap-2"><Field label={`Nome ${i+1}`} value={row.nome} onChange={v=>setArray('filhos',i,'nome',v)}/><Field label="Nascimento" type="date" value={row.nascimento} onChange={v=>setArray('filhos',i,'nascimento',v)}/></div>)}</div></Section>

    <Section number="3" title="Documentos" subtitle="Preencha os números. Se já tiver a foto ou PDF, anexe agora e ela já seguirá para a etapa de documentos."><div className="grid gap-3 sm:grid-cols-2"><Field label="CPF *" inputMode="numeric" value={formatCpf(fse.cpf)} onChange={v=>set('cpf',v)}/><Field label="RG / CIN" value={fse.rg} onChange={v=>set('rg',v)}/><Field label="UF do RG" value={fse.rg_uf} onChange={v=>set('rg_uf',v)}/><Field label="Carteira de Trabalho" value={fse.ctps} onChange={v=>set('ctps',v)}/><Field label="Série CTPS" value={fse.ctps_serie} onChange={v=>set('ctps_serie',v)}/><Field label="PIS / NIS" value={fse.pis} onChange={v=>set('pis',v)}/><Field label="Reservista" value={fse.reservista} onChange={v=>set('reservista',v)}/><Field label="Título de Eleitor" value={fse.titulo_eleitor} onChange={v=>set('titulo_eleitor',v)}/><Field label="Zona" value={fse.zona} onChange={v=>set('zona',v)}/><Field label="Seção" value={fse.secao} onChange={v=>set('secao',v)}/><Field label="CNH" value={fse.cnh} onChange={v=>set('cnh',v)}/><Field label="UF CNH" value={fse.cnh_uf} onChange={v=>set('cnh_uf',v)}/><Field label="Validade CNH" type="date" value={fse.cnh_validade} onChange={v=>set('cnh_validade',v)}/><Field label="Categoria CNH" value={fse.cnh_categoria} onChange={v=>set('cnh_categoria',v)}/><Field label="1ª Habilitação" type="date" value={fse.cnh_primeira_habilitacao} onChange={v=>set('cnh_primeira_habilitacao',v)}/><div className="sm:col-span-2"><Area label="Observação sobre documentos" value={fse.observacao_documentos} onChange={v=>set('observacao_documentos',v)} rows={2}/></div></div><div className="mt-5 border-t border-white/10 pt-4"><DocumentCards title="Anexar documentos agora" subtitle="Pode fotografar ou escolher uma imagem/PDF já salvo no celular."/></div></Section>

    <Section number="4" title="Endereço e contato"><div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Rua / Logradouro *" value={fse.logradouro} onChange={v=>set('logradouro',v)}/></div><Field label="Nº *" value={fse.numero} onChange={v=>set('numero',v)}/><Field label="Bairro *" value={fse.bairro} onChange={v=>set('bairro',v)}/><Field label="CEP" inputMode="numeric" value={fse.cep} onChange={v=>set('cep',v)}/><Field label="Cidade *" value={fse.cidade} onChange={v=>set('cidade',v)}/><Field label="Estado *" value={fse.estado} onChange={v=>set('estado',v)}/><Field label="Fone fixo / Recados" value={fse.fone_recados} onChange={v=>set('fone_recados',v)}/><Field label="Celular / WhatsApp *" inputMode="tel" value={formatPhone(fse.celular)} onChange={v=>set('celular',v)}/><Field label="E-mail" type="email" value={fse.email} onChange={v=>set('email',v)}/></div></Section>

    <Section number="5" title="Formação escolar"><div className="grid gap-3 sm:grid-cols-2"><SelectField label="Escolaridade *" value={fse.escolaridade_nivel} onChange={v=>set('escolaridade_nivel',v)} options={['Ensino Fundamental Completo','Ensino Fundamental Incompleto','Ensino Médio Completo','Ensino Médio Incompleto','Ensino Superior Incompleto','Ensino Superior Completo']}/><Field label="Ano" value={fse.escolaridade_ano} onChange={v=>set('escolaridade_ano',v)}/><SelectField label="Você estuda?" value={fse.estuda} onChange={v=>set('estuda',v)} options={['Sim','Não']}/><Field label="Qual horário" value={fse.horario_estudo} onChange={v=>set('horario_estudo',v)}/><div className="sm:col-span-2"><Field label="Curso / Instituição" value={fse.curso_instituicao} onChange={v=>set('curso_instituicao',v)}/></div></div></Section>

    <Section number="6" title="Formação técnica"><div className="space-y-2">{(fse.formacao_tecnica||emptyRows(3,()=>({curso:'',ano:''}))).map((row:any,i:number)=><div key={i} className="grid grid-cols-[1fr_130px] gap-2"><Field label={`Curso ${i+1}`} value={row.curso} onChange={v=>setArray('formacao_tecnica',i,'curso',v)}/><Field label="Conclusão" value={row.ano} onChange={v=>setArray('formacao_tecnica',i,'ano',v)}/></div>)}</div></Section>

    <Section number="7" title="Experiência profissional - 3 últimas empresas"><div className="space-y-4">{(fse.experiencias||emptyRows(3,()=>({}))).map((row:any,i:number)=><div key={i} className="rounded-2xl border border-white/10 bg-white/[.02] p-3"><div className="mb-3 text-xs font-black text-violet-300">EMPRESA {i+1}</div><div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Empresa" value={row.empresa} onChange={v=>setArray('experiencias',i,'empresa',v)}/></div><Field label="Cidade" value={row.cidade} onChange={v=>setArray('experiencias',i,'cidade',v)}/><Field label="UF" value={row.uf} onChange={v=>setArray('experiencias',i,'uf',v)}/><Field label="Fone" value={row.fone} onChange={v=>setArray('experiencias',i,'fone',v)}/><Field label="Cargo" value={row.cargo} onChange={v=>setArray('experiencias',i,'cargo',v)}/><Field label="Admissão" type="date" value={row.admissao} onChange={v=>setArray('experiencias',i,'admissao',v)}/><Field label="Demissão" type="date" value={row.demissao} onChange={v=>setArray('experiencias',i,'demissao',v)}/><Field label="Último salário" inputMode="decimal" value={row.salario} onChange={v=>setArray('experiencias',i,'salario',v)}/><SelectField label="Saiu por iniciativa própria?" value={row.iniciativa_propria} onChange={v=>setArray('experiencias',i,'iniciativa_propria',v)} options={['Sim','Não']}/><div className="sm:col-span-2"><Field label="Justifique" value={row.justificativa} onChange={v=>setArray('experiencias',i,'justificativa',v)}/></div></div></div>)}</div></Section>

    <Section number="8" title="Referências pessoais"><div className="space-y-2">{(fse.referencias||emptyRows(3,()=>({nome:'',fone:''}))).map((row:any,i:number)=><div key={i} className="grid grid-cols-[1fr_145px] gap-2"><Field label={`Nome ${i+1}`} value={row.nome} onChange={v=>setArray('referencias',i,'nome',v)}/><Field label="Fone" value={row.fone} onChange={v=>setArray('referencias',i,'fone',v)}/></div>)}</div></Section>

    <Section number="9" title="Dados para EPI"><div className="grid grid-cols-3 gap-2"><Field label="Camisa nº" value={fse.epi_camisa} onChange={v=>set('epi_camisa',v)}/><Field label="Calça nº" value={fse.epi_calca} onChange={v=>set('epi_calca',v)}/><Field label="Bota nº" value={fse.epi_bota} onChange={v=>set('epi_bota',v)}/></div></Section>
    <Section number="10" title="Principais atribuições"><Area label="Descreva suas principais atribuições / atividades" value={fse.atribuicoes} onChange={v=>set('atribuicoes',v)} rows={4}/></Section>
    <Section number="11" title="Outras informações"><Area label="Outras informações que deseja registrar" value={fse.outras_informacoes} onChange={v=>set('outras_informacoes',v)} rows={4}/></Section>
    <Section number="12" title="Declaração e confirmação"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-3 text-xs leading-5 text-zinc-400">Declaro que as informações acima são verídicas e autorizo a confirmação das mesmas ou de outras informações necessárias ao processo de contratação.</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Local / UF" value={fse.local_uf} onChange={v=>set('local_uf',v)}/><Field label="Data" type="date" value={fse.data_declaracao||today()} onChange={v=>set('data_declaracao',v)}/></div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/[.05] p-3"><input type="checkbox" checked={!!fse.declaracao_aceita} onChange={e=>set('declaracao_aceita',e.target.checked)} className="mt-1 h-5 w-5 accent-violet-500"/><span className="text-sm leading-5"><b>Confirmo que conferi os dados acima</b><span className="mt-1 block text-xs text-zinc-500">Esta confirmação fica registrada com data e hora no seu pré-cadastro.</span></span></label></Section>

    <div className="grid gap-2 sm:grid-cols-2"><button disabled={saving} onClick={()=>void saveFse(false)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-violet-500/25 bg-violet-500/[.08] text-sm font-bold text-violet-200 disabled:opacity-50"><Save className="h-4 w-4"/>{saving?'Salvando...':'Salvar e continuar depois'}</button><button onClick={()=>{if(fichaMissing.length)setError(`Antes de conferir, complete: ${fichaMissing.join(', ')}.`);else{setError('');setReviewFicha(true);window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});}}} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-amber-400 text-sm font-black text-black">Conferir ficha <ChevronRight className="h-4 w-4"/></button></div>

    {reviewFicha&&<section className="rounded-3xl border border-amber-400/25 bg-amber-400/[.05] p-4"><div className="flex items-center gap-2"><Check className="h-5 w-5 text-amber-400"/><h2 className="text-base font-black">Conferência da ficha</h2></div><p className="mt-2 text-xs leading-5 text-zinc-400">Confira os dados principais antes de concluir. Os anexos que você já mandou serão mantidos na próxima etapa.</p><div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm"><div><span className="text-zinc-500">Nome:</span> {fse.nome}</div><div><span className="text-zinc-500">CPF:</span> {formatCpf(fse.cpf)}</div><div><span className="text-zinc-500">Nascimento:</span> {fse.data_nascimento}</div><div><span className="text-zinc-500">Celular:</span> {formatPhone(fse.celular)}</div><div><span className="text-zinc-500">Endereço:</span> {[fse.logradouro,fse.numero,fse.bairro,fse.cidade,fse.estado].filter(Boolean).join(' • ')}</div><div><span className="text-zinc-500">Vaga:</span> {state.candidato.funcao}</div></div><button disabled={saving} onClick={()=>void saveFse(true)} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-black text-black disabled:opacity-50">{saving?<Loader2 className="h-5 w-5 animate-spin"/>:<CheckCircle2 className="h-5 w-5"/>}{saving?'Concluindo ficha...':'Concluir ficha e seguir para documentos'}</button><button onClick={()=>setReviewFicha(false)} className="mt-3 w-full text-xs font-semibold text-zinc-500">Voltar e corrigir</button></section>}
  </div></div>;
}
