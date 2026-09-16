import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, CircleAlert, FileCheck2, FileUp, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { gerarAutorizacaoExameAdmissionalPdf } from '@/lib/pdfGenerator';

type Requisito = { tipo: string; label: string; obrigatorio: boolean };
type Documento = { tipo: string; nome: string; url?: string; status?: string; created_at?: string };
type Candidate = {
  nome: string; cpf: string; rg: string; data_nascimento: string; endereco: string; email: string; celular: string;
  filiacao: string; escolaridade: string; empresa_nome: string; cnpj: string; funcao: string; setor_ghe: string;
  obra_local: string; data_admissao: string; tipo_admissao: string; exige_toxicologico: boolean;
};
type State = { status: string; requisitos: Requisito[]; documentos: Documento[]; candidato: Candidate; concluido_em?: string | null; aso_gerado_em?: string | null };

const onlyDigits = (value: string) => value.replace(/\D/g, '');
const formatCpf = (value: string) => {
  const d = onlyDigits(value).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};
const formatPhone = (value: string) => {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
};

const api = async (payload: Record<string, unknown>) => {
  const response = await fetch('/api/pre-cadastro-candidato', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    const error:any = new Error(String(data?.error || 'Não foi possível concluir a operação.'));
    error.data = data;
    throw error;
  }
  return data;
};

const Field = ({ label, value, onChange, type = 'text', placeholder = '' }: { label:string; value:string; onChange:(value:string)=>void; type?:string; placeholder?:string }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-semibold text-zinc-300">{label}</span>
    <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="h-12 w-full rounded-xl border border-violet-500/20 bg-[#090b10] px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-violet-400/60" />
  </label>
);

export default function CandidatoDocumentosPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<State | null>(null);
  const [form, setForm] = useState<Partial<Candidate>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api({ action:'state', token });
      const next:State = { status:data.status, requisitos:data.requisitos || [], documentos:data.documentos || [], candidato:data.candidato || {}, concluido_em:data.concluido_em, aso_gerado_em:data.aso_gerado_em };
      setState(next); setForm(next.candidato); setDone(next.status === 'concluido');
    } catch (e:any) {
      setError(e?.message === 'link_expirado' ? 'Este link expirou. Solicite um novo link ao RH.' : 'Este link não está disponível. Confirme o endereço recebido com o RH.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const tiposEnviados = useMemo(() => new Set((state?.documentos || []).map(d => d.tipo)), [state?.documentos]);
  const faltandoDocs = useMemo(() => (state?.requisitos || []).filter(r => r.obrigatorio && !tiposEnviados.has(r.tipo)), [state?.requisitos, tiposEnviados]);
  const faltandoCampos = useMemo(() => {
    const list:string[] = [];
    if (!String(form.nome || '').trim()) list.push('Nome completo');
    if (onlyDigits(String(form.cpf || '')).length !== 11) list.push('CPF');
    if (!String(form.data_nascimento || '').trim()) list.push('Data de nascimento');
    if (!String(form.endereco || '').trim()) list.push('Endereço');
    if (onlyDigits(String(form.celular || '')).length < 10) list.push('Celular');
    return list;
  }, [form]);

  const saveFields = async (silent = false) => {
    setSaving(true);
    try {
      await api({ action:'save_fields', token, fields:{
        nome:form.nome || '', cpf:onlyDigits(String(form.cpf || '')), rg:form.rg || '', data_nascimento:form.data_nascimento || null,
        endereco:form.endereco || '', email:form.email || '', celular:onlyDigits(String(form.celular || '')), filiacao:form.filiacao || '', escolaridade:form.escolaridade || '',
      }});
      if (!silent) await load();
      return true;
    } catch (e:any) { setError(e?.message || 'Não foi possível salvar os dados.'); return false; }
    finally { setSaving(false); }
  };

  const requestUpload = async (tipo:string, file:File) => {
    const signed = await api({ action:'create_upload', token, tipo, fileName:file.name, contentType:file.type || 'application/octet-stream' });
    const { error:uploadError } = await supabase.storage.from(signed.bucket).uploadToSignedUrl(signed.path, signed.uploadToken, file, { contentType:file.type || 'application/octet-stream' });
    if (uploadError) throw uploadError;
    return signed;
  };

  const uploadDoc = async (tipo:string, file?:File | null) => {
    if (!file) return;
    setUploading(tipo); setError('');
    try {
      const signed = await requestUpload(tipo, file);
      await api({ action:'register_upload', token, tipo, path:signed.path, fileName:file.name });
      await load();
    } catch (e:any) { setError(e?.message || `Não foi possível enviar ${file.name}.`); }
    finally { setUploading(''); }
  };

  const gerarAsoAutomatico = async (candidate:Candidate) => {
    const pdf = gerarAutorizacaoExameAdmissionalPdf({
      empresa:candidate.empresa_nome || '', cnpj:candidate.cnpj || '', nome:candidate.nome || '', cpf:candidate.cpf || '', rg:candidate.rg || '',
      funcao:candidate.funcao || '', dataAdmissao:candidate.data_admissao || '', dataNascimento:candidate.data_nascimento || '', setorGhe:candidate.setor_ghe || '',
      dataExame:new Date().toISOString().slice(0,10), tipoExame:candidate.tipo_admissao || 'Admissional', obraLocal:candidate.obra_local || '',
      trabalhoAltura:false, espacoConfinado:false, toxicologico:!!candidate.exige_toxicologico, responsavelContato:'ROBSON CHAFI SERVILIO - CEL 11 94292-0385',
    });
    const file = new File([pdf.blob], pdf.fileName, { type:'application/pdf' });
    const signed = await requestUpload('guia_aso', file);
    await api({ action:'register_aso', token, path:signed.path, fileName:file.name });
  };

  const finalize = async () => {
    setError('');
    if (faltandoDocs.length || faltandoCampos.length) {
      setError('Complete todos os dados e documentos obrigatórios antes de finalizar.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveFields(true);
      if (!saved) return;
      const result = await api({ action:'finalize', token });
      if (result.aso_ready && result.candidato) await gerarAsoAutomatico(result.candidato as Candidate);
      setDone(true);
      await load();
    } catch (e:any) {
      const docs = e?.data?.documentos || [];
      const fields = e?.data?.campos || [];
      setError([...docs, ...fields].length ? `Ainda falta: ${[...docs, ...fields].join(', ')}.` : (e?.message || 'Não foi possível finalizar.'));
    } finally { setSaving(false); }
  };

  if (loading && !state) return <div className="min-h-screen bg-[#030609] text-white grid place-items-center"><Loader2 className="h-7 w-7 animate-spin text-violet-400" /></div>;
  if (error && !state) return <div className="min-h-screen bg-[#030609] px-5 text-white grid place-items-center"><div className="max-w-md rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center"><CircleAlert className="mx-auto mb-3 h-8 w-8 text-red-400" /><div className="font-bold">Link indisponível</div><p className="mt-2 text-sm text-zinc-400">{error}</p></div></div>;
  if (!state) return null;

  if (done) return (
    <div className="min-h-screen bg-[#030609] px-4 py-10 text-white">
      <div className="mx-auto max-w-lg rounded-3xl border border-emerald-500/25 bg-[#070b0d] p-7 text-center shadow-2xl">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
        <h1 className="mt-4 text-2xl font-black">Documentação enviada</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Seus dados e documentos foram entregues ao RH. O pré-cadastro foi atualizado e a guia do ASO segue automaticamente para a próxima etapa.</p>
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-left text-sm"><b>{state.candidato.nome}</b><div className="mt-1 text-zinc-500">{state.candidato.empresa_nome || 'TOPAC'}</div></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(124,58,237,.16),transparent_28%),#030609] px-3 py-5 text-white">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="rounded-3xl border border-violet-500/20 bg-[#07090d]/95 p-5 shadow-2xl">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-violet-500/30 bg-violet-500/10 font-black text-amber-400">T</div><div><div className="text-lg font-black">TOPAC RH PRO</div><div className="text-xs text-zinc-500">Pré-cadastro admissional seguro</div></div></div>
          <div className="mt-5"><div className="text-xl font-black">{state.candidato.nome || 'Seu pré-cadastro'}</div><div className="mt-1 text-sm text-zinc-500">{state.candidato.empresa_nome || 'Empresa em definição pelo RH'}</div></div>
        </header>

        {error && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

        <section className="rounded-3xl border border-violet-500/20 bg-[#07090d] p-4">
          <h2 className="text-base font-black">1. Complete sua ficha</h2>
          <p className="mt-1 text-xs text-zinc-500">Essas informações alimentam diretamente o seu pré-cadastro.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Nome completo *" value={String(form.nome || '')} onChange={v=>setForm(p=>({...p,nome:v}))} />
            <Field label="CPF *" value={formatCpf(String(form.cpf || ''))} onChange={v=>setForm(p=>({...p,cpf:v}))} inputMode="numeric" />
            <Field label="RG" value={String(form.rg || '')} onChange={v=>setForm(p=>({...p,rg:v}))} />
            <Field label="Data de nascimento *" type="date" value={String(form.data_nascimento || '')} onChange={v=>setForm(p=>({...p,data_nascimento:v}))} />
            <Field label="Celular / WhatsApp *" value={formatPhone(String(form.celular || ''))} onChange={v=>setForm(p=>({...p,celular:v}))} />
            <Field label="E-mail" type="email" value={String(form.email || '')} onChange={v=>setForm(p=>({...p,email:v}))} />
            <div className="sm:col-span-2"><Field label="Endereço completo *" value={String(form.endereco || '')} onChange={v=>setForm(p=>({...p,endereco:v}))} /></div>
            <Field label="Filiação" value={String(form.filiacao || '')} onChange={v=>setForm(p=>({...p,filiacao:v}))} />
            <Field label="Escolaridade" value={String(form.escolaridade || '')} onChange={v=>setForm(p=>({...p,escolaridade:v}))} />
          </div>
          <button disabled={saving} onClick={()=>void saveFields()} className="mt-4 h-11 w-full rounded-xl border border-violet-500/25 bg-violet-500/10 text-sm font-bold text-violet-200 disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar dados e continuar'}</button>
        </section>

        <section className="rounded-3xl border border-violet-500/20 bg-[#07090d] p-4">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-black">2. Envie os documentos</h2><p className="mt-1 text-xs text-zinc-500">Foto nítida ou PDF. Todos os itens obrigatórios precisam ficar verdes.</p></div><div className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-zinc-400">{state.requisitos.length - faltandoDocs.length}/{state.requisitos.length}</div></div>
          <div className="mt-4 space-y-2">
            {state.requisitos.map(req => {
              const sent = tiposEnviados.has(req.tipo);
              return <label key={req.tipo} className={`block rounded-2xl border p-3 ${sent ? 'border-emerald-500/25 bg-emerald-500/[.06]' : 'border-white/10 bg-white/[.02]'}`}>
                <div className="flex items-center gap-3"><div className={`grid h-9 w-9 place-items-center rounded-xl ${sent ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/10 text-violet-300'}`}>{sent ? <CheckCircle2 className="h-5 w-5"/> : <FileUp className="h-5 w-5"/>}</div><div className="min-w-0 flex-1"><div className="text-sm font-bold">{req.label}</div><div className="text-[11px] text-zinc-500">{sent ? 'Recebido — toque para substituir' : 'Obrigatório'}</div></div>{uploading===req.tipo && <Loader2 className="h-4 w-4 animate-spin"/>}</div>
                <input className="hidden" type="file" accept="image/*,.pdf,application/pdf" disabled={!!uploading} onChange={e=>void uploadDoc(req.tipo,e.target.files?.[0])}/>
              </label>;
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-amber-500/20 bg-[#08090c] p-4">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-amber-400"/><div><div className="font-bold">Finalização bloqueada até ficar completo</div><div className="mt-1 text-xs leading-5 text-zinc-500">Faltam {faltandoDocs.length} documento(s) e {faltandoCampos.length} campo(s) obrigatório(s).</div></div></div>
          <button onClick={()=>void finalize()} disabled={saving || !!uploading || faltandoDocs.length>0 || faltandoCampos.length>0} className="mt-4 flex h-13 min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"><FileCheck2 className="h-5 w-5"/>{saving ? 'Finalizando...' : 'Finalizar e enviar ao RH'}</button>
        </section>
      </div>
    </div>
  );
}
