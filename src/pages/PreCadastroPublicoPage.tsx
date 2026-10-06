import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, ChevronLeft, ChevronRight, FileCheck2, Loader2, LockKeyhole, Upload, Camera, Trash2, AlertTriangle } from 'lucide-react';
import { Toaster as Sonner, toast } from 'sonner';

type Candidate = Record<string, any>;
type Bank = Record<string, any>;
type Transport = { usa_vt?: boolean; ida?: Record<string, number>; volta?: Record<string, number> };
type Doc = { id: string; tipo: string; nome: string; mimeType?: string; obrigatorio?: boolean; entregarDepois?: boolean; url?: string };
type Draft = { id: string; token: string; status: string; etapa: number; candidato: Candidate; banco: Bank; transporte: Transport; ctpsTipo: string; pendencias: any[]; correcao?: any; finalizadoEm?: string | null; documentos: Doc[] };

const STEPS = ['Dados', 'Documentos', 'Banco', 'Transporte', 'Revisão'];
const emptyTransport: Transport = { usa_vt: true, ida: { onibus: 0, metro: 0, trem: 0, intermunicipal: 0 }, volta: { onibus: 0, metro: 0, trem: 0, intermunicipal: 0 } };
const cleanDigits = (v: string) => v.replace(/\D/g, '');

async function api(body: Record<string, any>) {
  const response = await fetch('/api/pre-cadastro-publico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error: any = new Error(data?.error || 'Falha na comunicação com o sistema.');
    error.payload = data;
    throw error;
  }
  return data;
}

const Field = ({ label, value, onChange, type = 'text', required, placeholder, inputMode }: any) => (
  <label className="space-y-1.5">
    <span className="text-sm font-medium text-slate-800">{label}{required && <span className="text-red-600"> *</span>}</span>
    <Input value={value || ''} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder} inputMode={inputMode} className="h-11 bg-white" />
  </label>
);

const SelectField = ({ label, value, onChange, required, children }: any) => (
  <label className="space-y-1.5">
    <span className="text-sm font-medium text-slate-800">{label}{required && <span className="text-red-600"> *</span>}</span>
    <select value={value || ''} onChange={e => onChange(e.target.value)} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm">
      <option value="">Selecione</option>{children}
    </select>
  </label>
);

const PreCadastroPublicoPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState(1);
  const [candidate, setCandidate] = useState<Candidate>({});
  const [bank, setBank] = useState<Bank>({});
  const [transport, setTransport] = useState<Transport>(emptyTransport);
  const [ctpsTipo, setCtpsTipo] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [pendencias, setPendencias] = useState<any[]>([]);

  const tokenFromUrl = () => new URLSearchParams(window.location.search).get('token') || '';
  const persistToken = (token: string) => {
    window.localStorage.setItem('topac-pre-cadastro-token', token);
    const url = new URL(window.location.href); url.searchParams.set('token', token); window.history.replaceState({}, '', url.toString());
  };

  const applyDraft = (data: Draft) => {
    setDraft(data); setCandidate(data.candidato || {}); setBank(data.banco || {});
    setTransport({ ...emptyTransport, ...(data.transporte || {}), ida: { ...emptyTransport.ida, ...(data.transporte?.ida || {}) }, volta: { ...emptyTransport.volta, ...(data.transporte?.volta || {}) } });
    setCtpsTipo(data.ctpsTipo || ''); setDocs(data.documentos || []); setPendencias(data.pendencias || []); setStep(Math.min(5, Math.max(1, Number(data.etapa || 1))));
  };

  const load = async (token: string) => {
    const result = await api({ action: 'load', token }); applyDraft(result.data); persistToken(token);
  };

  useEffect(() => {
    (async () => {
      try {
        const known = tokenFromUrl() || window.localStorage.getItem('topac-pre-cadastro-token') || '';
        if (known) {
          try { await load(known); return; } catch { window.localStorage.removeItem('topac-pre-cadastro-token'); }
        }
        const result = await api({ action: 'start' }); persistToken(result.token); await load(result.token);
      } catch (error: any) { toast.error(error.message || 'Não foi possível abrir o cadastro.'); }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async (targetStep = step) => {
    if (!draft) return;
    setSaving(true);
    try {
      await api({ action: 'save', token: draft.token, candidato: candidate, banco: bank, transporte: transport, ctpsTipo, etapa: targetStep });
      setDraft(prev => prev ? { ...prev, etapa: targetStep } : prev);
    } finally { setSaving(false); }
  };

  const go = async (target: number) => {
    try { await save(target); setStep(target); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (error: any) { toast.error(error.message || 'Não foi possível salvar.'); }
  };

  const hasDoc = (tipo: string) => docs.some(d => d.tipo === tipo);
  const isPending = (tipo: string) => pendencias.some((p: any) => String(p?.tipo || p) === tipo);

  const uploadDoc = async (tipo: string, file: File, obrigatorio = false) => {
    if (!draft) return;
    if (file.size > 15 * 1024 * 1024) return toast.error('Arquivo acima de 15 MB.');
    const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    setUploading(tipo);
    try {
      const signed = await api({ action: 'upload-url', token: draft.token, tipo, fileName: file.name, mimeType });
      const { error } = await supabase.storage.from(signed.bucket).uploadToSignedUrl(signed.path, signed.uploadToken, file, { contentType: mimeType });
      if (error) throw error;
      await api({ action: 'attach', token: draft.token, tipo, path: signed.path, fileName: file.name, mimeType, size: file.size, obrigatorio });
      await load(draft.token);
      toast.success('Documento anexado.');
    } catch (error: any) { toast.error(error.message || 'Falha ao anexar documento.'); }
    finally { setUploading(''); }
  };

  const removeDoc = async (doc: Doc) => {
    if (!draft) return;
    setUploading(doc.tipo);
    try { await api({ action: 'remove-document', token: draft.token, documentId: doc.id }); await load(draft.token); }
    catch (error: any) { toast.error(error.message || 'Não foi possível remover o documento.'); }
    finally { setUploading(''); }
  };

  const markPending = async (tipo: string, label: string) => {
    if (!draft) return;
    try { const result = await api({ action: 'mark-pending', token: draft.token, tipo, label }); setPendencias(result.pendencias || []); toast.success(`${label} ficará como pendência para entrega posterior.`); }
    catch (error: any) { toast.error(error.message || 'Não foi possível registrar a pendência.'); }
  };

  const DocCard = ({ tipo, label, required = false, allowLater = false, hint }: { tipo: string; label: string; required?: boolean; allowLater?: boolean; hint?: string }) => {
    const doc = docs.find(d => d.tipo === tipo);
    const pending = isPending(tipo);
    return <div className={`rounded-xl border p-4 ${doc ? 'border-emerald-200 bg-emerald-50/50' : pending ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div><div className="font-semibold text-slate-900">{label}{required && <span className="text-red-600"> *</span>}</div>{hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
          <div className={`mt-2 text-xs font-medium ${doc ? 'text-emerald-700' : pending ? 'text-amber-700' : 'text-slate-500'}`}>{doc ? `✓ ${doc.nome}` : pending ? '⚠ Entregar depois' : 'Não enviado'}</div>
        </div>
        {doc && <Button type="button" variant="ghost" size="icon" onClick={() => removeDoc(doc)} disabled={uploading === tipo}><Trash2 className="h-4 w-4" /></Button>}
      </div>
      {!doc && <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><Camera className="h-4 w-4" /> Tirar foto<input className="hidden" type="file" accept="image/*" capture="environment" disabled={!!uploading} onChange={e => { const f=e.target.files?.[0]; if(f) void uploadDoc(tipo,f,required); e.currentTarget.value=''; }} /></label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><Upload className="h-4 w-4" /> Arquivo/PDF<input className="hidden" type="file" accept=".pdf,image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={e => { const f=e.target.files?.[0]; if(f) void uploadDoc(tipo,f,required); e.currentTarget.value=''; }} /></label>
        {allowLater && !pending && <Button type="button" variant="outline" onClick={() => markPending(tipo,label)}>Entregar depois</Button>}
        {uploading === tipo && <span className="inline-flex items-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</span>}
      </div>}
    </div>;
  };

  const clientMissing = useMemo(() => {
    const missing: string[] = [];
    const req = [['Nome completo', candidate.nome],['CPF', candidate.cpf],['RG', candidate.rg],['Data de nascimento', candidate.data_nascimento],['Estado civil', candidate.estado_civil],['Celular', candidate.celular],['E-mail', candidate.email],['Nome da mãe', candidate.nome_mae],['CEP', candidate.cep],['Rua', candidate.rua],['Número', candidate.numero],['Bairro', candidate.bairro],['Cidade', candidate.cidade],['Estado', candidate.estado],['Banco', bank.banco],['Agência', bank.agencia],['Conta', bank.conta],['Tipo de conta', bank.tipo_conta],['Titular', bank.titular],['CPF do titular', bank.cpf_titular],['PIX', bank.pix],['Tipo do PIX', bank.tipo_pix],['CTPS', ctpsTipo]];
    req.forEach(([l,v]) => { if (!String(v || '').trim()) missing.push(String(l)); });
    if (!hasDoc('documento_identificacao')) missing.push('Documento de identificação');
    if (!hasDoc('comprovante_residencia')) missing.push('Comprovante de residência');
    if (!hasDoc('ctps')) missing.push('Carteira de Trabalho');
    if (!candidate.cpf_no_documento && !hasDoc('cpf')) missing.push('Documento/Comprovante de CPF');
    if (candidate.tem_dependentes && !hasDoc('dependentes')) missing.push('Documentos dos dependentes');
    if (transport.usa_vt !== false) {
      const sum=(o:any)=>['onibus','metro','trem','intermunicipal'].reduce((a,k)=>a+Number(o?.[k]||0),0);
      if (sum(transport.ida) <= 0) missing.push('Condução de ida'); if (sum(transport.volta) <= 0) missing.push('Condução de volta');
    }
    return [...new Set(missing)];
  }, [candidate, bank, transport, ctpsTipo, docs]);

  const finalize = async () => {
    if (!draft) return;
    try {
      await save(5);
      const result = await api({ action: 'finalize', token: draft.token });
      setDraft(prev => prev ? { ...prev, status: result.status, finalizadoEm: result.completedAt } : prev);
      window.localStorage.removeItem('topac-pre-cadastro-token');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      const missing = error?.payload?.missing;
      if (Array.isArray(missing) && missing.length) toast.error(`Faltam: ${missing.join(', ')}`); else toast.error(error.message || 'Não foi possível finalizar.');
    }
  };

  const updateTransport = (direction: 'ida'|'volta', key: string, value: string) => setTransport(prev => ({ ...prev, [direction]: { ...(prev[direction] || {}), [key]: Math.max(0, Number(value || 0)) } }));

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-violet-700" /></div>;
  if (!draft) return <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center text-center"><div><AlertTriangle className="mx-auto h-10 w-10 text-amber-500"/><h1 className="mt-3 text-xl font-bold">Não foi possível abrir o cadastro</h1><p className="mt-2 text-slate-500">Atualize a página ou solicite novamente o link ao RH.</p></div><Sonner richColors /></div>;
  if (draft.finalizadoEm && draft.status !== 'correcao_solicitada') return <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center"><div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-sm border"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600"/><h1 className="mt-4 text-2xl font-bold text-slate-900">Cadastro enviado com sucesso</h1><p className="mt-3 text-slate-600">Seus dados e documentos foram enviados ao RH. Caso seja necessária alguma correção ou documentação adicional, entraremos em contato.</p><div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500"><LockKeyhole className="mx-auto mb-2 h-5 w-5"/>Seus documentos ficam armazenados em área protegida do TOPAC RH PRO.</div></div><Sonner richColors /></div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <Sonner richColors position="top-center" />
    <header className="border-b bg-white"><div className="mx-auto max-w-3xl px-4 py-5"><div className="text-xs font-bold tracking-[0.2em] text-violet-700">TOPAC RH PRO</div><h1 className="mt-1 text-xl font-bold">Pré-Cadastro Admissional</h1><p className="mt-1 text-sm text-slate-500">Preencha seus dados e envie os documentos solicitados. Empresa, cargo e salário serão definidos pelo RH depois.</p></div></header>
    <main className="mx-auto max-w-3xl px-4 py-6 pb-28">
      {draft.correcao && <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4"><div className="font-semibold text-amber-900">Correção solicitada pelo RH</div><div className="mt-1 text-sm text-amber-800">{draft.correcao?.observacao || draft.correcao?.motivo || 'Revise os dados solicitados e envie novamente.'}</div></div>}
      <div className="mb-6 grid grid-cols-5 gap-1.5">{STEPS.map((name,i) => <div key={name}><div className={`h-1.5 rounded-full ${step >= i+1 ? 'bg-violet-700' : 'bg-slate-200'}`} /><div className={`mt-1 text-center text-[10px] sm:text-xs ${step===i+1?'font-semibold text-violet-700':'text-slate-400'}`}>{name}</div></div>)}</div>

      <section className="rounded-2xl border bg-white p-5 sm:p-6 shadow-sm">
        {step === 1 && <div className="space-y-5"><div><h2 className="text-lg font-bold">1. Seus dados</h2><p className="text-sm text-slate-500">Campos com * são obrigatórios.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Nome completo" required value={candidate.nome} onChange={(v:string)=>setCandidate({...candidate,nome:v})}/></div>
            <Field label="CPF" required value={candidate.cpf} inputMode="numeric" onChange={(v:string)=>setCandidate({...candidate,cpf:v})}/><Field label="RG" required value={candidate.rg} onChange={(v:string)=>setCandidate({...candidate,rg:v})}/>
            <Field label="Data de nascimento" required type="date" value={candidate.data_nascimento} onChange={(v:string)=>setCandidate({...candidate,data_nascimento:v})}/>
            <SelectField label="Sexo" value={candidate.sexo} onChange={(v:string)=>setCandidate({...candidate,sexo:v})}><option>Feminino</option><option>Masculino</option><option>Outro</option><option>Prefiro não informar</option></SelectField>
            <SelectField label="Estado civil" required value={candidate.estado_civil} onChange={(v:string)=>setCandidate({...candidate,estado_civil:v})}><option>Solteiro(a)</option><option>Casado(a)</option><option>Divorciado(a)</option><option>Viúvo(a)</option><option>União estável</option></SelectField>
            <Field label="Celular / WhatsApp" required value={candidate.celular} inputMode="tel" onChange={(v:string)=>setCandidate({...candidate,celular:v})}/><Field label="E-mail" required type="email" value={candidate.email} onChange={(v:string)=>setCandidate({...candidate,email:v})}/>
            <Field label="Nome da mãe" required value={candidate.nome_mae} onChange={(v:string)=>setCandidate({...candidate,nome_mae:v})}/><Field label="Nome do pai" value={candidate.nome_pai} onChange={(v:string)=>setCandidate({...candidate,nome_pai:v})}/>
            <Field label="PIS/NIS (se possuir)" value={candidate.pis} onChange={(v:string)=>setCandidate({...candidate,pis:v})}/><Field label="Título de eleitor" value={candidate.titulo_eleitor} onChange={(v:string)=>setCandidate({...candidate,titulo_eleitor:v})}/>
            <Field label="CEP" required value={candidate.cep} inputMode="numeric" onChange={(v:string)=>setCandidate({...candidate,cep:v})}/><Field label="Rua / Avenida" required value={candidate.rua} onChange={(v:string)=>setCandidate({...candidate,rua:v})}/>
            <Field label="Número" required value={candidate.numero} onChange={(v:string)=>setCandidate({...candidate,numero:v})}/><Field label="Complemento" value={candidate.complemento} onChange={(v:string)=>setCandidate({...candidate,complemento:v})}/>
            <Field label="Bairro" required value={candidate.bairro} onChange={(v:string)=>setCandidate({...candidate,bairro:v})}/><Field label="Cidade" required value={candidate.cidade} onChange={(v:string)=>setCandidate({...candidate,cidade:v})}/><Field label="Estado / UF" required value={candidate.estado} onChange={(v:string)=>setCandidate({...candidate,estado:v})}/>
          </div>
          <label className="flex items-center gap-3 rounded-xl border p-4"><input type="checkbox" checked={!!candidate.tem_dependentes} onChange={e=>setCandidate({...candidate,tem_dependentes:e.target.checked})} className="h-4 w-4"/><span><b>Tenho dependentes</b><span className="block text-xs text-slate-500">Se marcar, os documentos dos dependentes serão solicitados.</span></span></label>
        </div>}

        {step === 2 && <div className="space-y-4"><div><h2 className="text-lg font-bold">2. Documentos</h2><p className="text-sm text-slate-500">Envie foto legível ou PDF. Escolaridade e reservista podem ficar para depois.</p></div>
          <DocCard tipo="documento_identificacao" label="Documento de identificação (RG/CNH)" required />
          <label className="flex items-center gap-3 rounded-xl border p-4 bg-slate-50"><input type="checkbox" checked={!!candidate.cpf_no_documento} onChange={e=>setCandidate({...candidate,cpf_no_documento:e.target.checked})} className="h-4 w-4"/><span className="text-sm">Meu CPF já aparece no documento de identificação enviado.</span></label>
          {!candidate.cpf_no_documento && <DocCard tipo="cpf" label="Documento / comprovante de CPF" required />}
          <DocCard tipo="comprovante_residencia" label="Comprovante de residência" required />
          <div className="rounded-xl border p-4"><SelectField label="Qual Carteira de Trabalho você possui?" required value={ctpsTipo} onChange={setCtpsTipo}><option value="Digital">Digital</option><option value="Física">Física</option><option value="Ambas">Ambas</option></SelectField></div>
          <DocCard tipo="ctps" label="Carteira de Trabalho" required hint="Pode ser print/foto da CTPS Digital ou foto da carteira física." />
          <DocCard tipo="titulo_eleitor" label="Título de eleitor" />
          <DocCard tipo="certidao" label="Certidão (quando aplicável)" />
          {candidate.tem_dependentes && <DocCard tipo="dependentes" label="Documentos dos dependentes" required />}
          <DocCard tipo="escolaridade" label="Comprovante de escolaridade" allowLater />
          <DocCard tipo="reservista" label="Reservista (quando aplicável)" allowLater />
        </div>}

        {step === 3 && <div className="space-y-5"><div><h2 className="text-lg font-bold">3. Conta bancária e PIX</h2><p className="text-sm text-slate-500">Informe uma conta para recebimento.</p></div><div className="grid gap-4 sm:grid-cols-2">
          <Field label="Banco" required value={bank.banco} onChange={(v:string)=>setBank({...bank,banco:v})}/><Field label="Agência" required value={bank.agencia} onChange={(v:string)=>setBank({...bank,agencia:v})}/>
          <Field label="Conta" required value={bank.conta} onChange={(v:string)=>setBank({...bank,conta:v})}/><Field label="Dígito" value={bank.digito} onChange={(v:string)=>setBank({...bank,digito:v})}/>
          <SelectField label="Tipo de conta" required value={bank.tipo_conta} onChange={(v:string)=>setBank({...bank,tipo_conta:v})}><option>Corrente</option><option>Poupança</option><option>Conta salário</option><option>Pagamento</option></SelectField>
          <Field label="Titular da conta" required value={bank.titular} onChange={(v:string)=>setBank({...bank,titular:v})}/><Field label="CPF do titular" required value={bank.cpf_titular} inputMode="numeric" onChange={(v:string)=>setBank({...bank,cpf_titular:v})}/>
          <SelectField label="Tipo da chave PIX" required value={bank.tipo_pix} onChange={(v:string)=>setBank({...bank,tipo_pix:v})}><option>CPF</option><option>Celular</option><option>E-mail</option><option>Chave aleatória</option></SelectField>
          <div className="sm:col-span-2"><Field label="Chave PIX" required value={bank.pix} onChange={(v:string)=>setBank({...bank,pix:v})}/></div>
        </div></div>}

        {step === 4 && <div className="space-y-5"><div><h2 className="text-lg font-bold">4. Condução — ida e volta</h2><p className="text-sm text-slate-500">Não informe linha nem empresa de transporte. Apenas quantas conduções usa por trecho.</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><Button type="button" variant={transport.usa_vt !== false ? 'default':'outline'} onClick={()=>setTransport({...transport,usa_vt:true})}>Uso vale-transporte</Button><Button type="button" variant={transport.usa_vt === false ? 'default':'outline'} onClick={()=>setTransport({...transport,usa_vt:false})}>Não uso vale-transporte</Button></div>
          {transport.usa_vt !== false && <div className="grid gap-5 md:grid-cols-2">{(['ida','volta'] as const).map(direction => <div key={direction} className="rounded-xl border p-4"><h3 className="mb-3 font-bold uppercase">{direction}</h3><div className="space-y-3">{[['onibus','Ônibus municipal'],['metro','Metrô'],['trem','Trem'],['intermunicipal','Ônibus intermunicipal']].map(([key,label])=><label key={key} className="flex items-center justify-between gap-4"><span className="text-sm">{label}</span><Input type="number" min="0" max="10" inputMode="numeric" value={transport[direction]?.[key] ?? 0} onChange={e=>updateTransport(direction,key,e.target.value)} className="w-24 text-center"/></label>)}</div></div>)}</div>}
          <div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900">O valor não é digitado por você. O RH define a unidade de trabalho e o TOPAC RH PRO aplica as tarifas/regras cadastradas depois.</div>
        </div>}

        {step === 5 && <div className="space-y-5"><div><h2 className="text-lg font-bold">5. Revisão e envio</h2><p className="text-sm text-slate-500">Confira antes de finalizar. Depois do envio, o RH fará a conferência e definirá empresa, cargo e salário.</p></div>
          <div className="grid gap-2">{[['Dados pessoais',!!candidate.nome && !!candidate.cpf],['Documento de identificação',hasDoc('documento_identificacao')],['Comprovante de residência',hasDoc('comprovante_residencia')],['CTPS',hasDoc('ctps') && !!ctpsTipo],['Conta bancária',!!bank.banco && !!bank.conta],['PIX',!!bank.pix],['Transporte',transport.usa_vt===false || (Object.values(transport.ida||{}).some(Number) && Object.values(transport.volta||{}).some(Number))]].map(([label,ok]:any)=><div key={label} className={`flex items-center gap-3 rounded-lg border p-3 ${ok?'border-emerald-200 bg-emerald-50':'border-red-200 bg-red-50'}`}>{ok?<CheckCircle2 className="h-5 w-5 text-emerald-600"/>:<AlertTriangle className="h-5 w-5 text-red-600"/>}<span className="text-sm font-medium">{label}</span></div>)}</div>
          {pendencias.length>0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="font-semibold text-amber-900">Pendências que poderão ser entregues depois</div><ul className="mt-2 list-disc pl-5 text-sm text-amber-800">{pendencias.map((p:any)=><li key={p.tipo}>{p.label||p.tipo}</li>)}</ul></div>}
          {clientMissing.length>0 ? <div className="rounded-xl border border-red-200 bg-red-50 p-4"><div className="font-semibold text-red-900">Faltam {clientMissing.length} item(ns) obrigatório(s)</div><div className="mt-1 text-sm text-red-700">{clientMissing.join(', ')}</div></div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><FileCheck2 className="mr-2 inline h-5 w-5"/>Tudo certo para enviar ao RH.</div>}
          <Button type="button" className="h-12 w-full text-base" disabled={clientMissing.length>0 || saving || !!uploading} onClick={finalize}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileCheck2 className="mr-2 h-5 w-5"/>}Finalizar cadastro</Button>
        </div>}
      </section>

      <div className="mt-4 flex items-center justify-between gap-3">{step>1?<Button variant="outline" onClick={()=>go(step-1)} disabled={saving}><ChevronLeft className="mr-1 h-4 w-4"/>Voltar</Button>:<span/>}{step<5?<Button onClick={()=>go(step+1)} disabled={saving}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:null}Salvar e continuar<ChevronRight className="ml-1 h-4 w-4"/></Button>:null}</div>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500"><LockKeyhole className="h-4 w-4"/>Seus arquivos são enviados para armazenamento privado e vinculados somente ao seu pré-cadastro.</div>
    </main>
  </div>;
};

export default PreCadastroPublicoPage;
