import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, Clock3, FileCheck2, FileText,
  Loader2, RefreshCw, Send, UploadCloud, Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import FechamentoPage from '@/pages/FechamentoPage';
import { toast } from 'sonner';

type TabKey = 'visao' | 'movimentacoes' | 'documentos' | 'fechamento';
type Revisao = { id:string; origem_tipo:string; origem_id:string; empresa_id:string; status:string; observacao?:string|null; revisor_nome?:string|null; revisado_em?:string|null; source_updated_at?:string|null; created_at:string; updated_at?:string|null };
type Upload = { id:string; portal_user_id:string; empresa_id:string; tipo_documento:string; competencia?:string|null; funcionario_nome?:string|null; observacao?:string|null; arquivo_nome:string; tamanho_bytes?:number|null; status:string; formalizacao_email_status?:string|null; formalizacao_email_em?:string|null; formalizacao_destinos?:string[]|null; origem_tipo?:string|null; origem_id?:string|null; created_at:string };
type PortalUser = { id:string; nome:string; email?:string|null; portal:string };

const brDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(d);
};
const tipoLabel = (value?: string | null) => ({
  recibos_holerites:'Recibos / Holerites', folha_processada:'Folha processada', contrato:'Contrato de trabalho',
  rescisao:'Documentos de rescisão', ferias:'Documentos de férias', retorno_folha:'Retorno da contabilidade', outro:'Outro documento',
}[String(value || '')] || String(value || 'Documento').replace(/_/g, ' '));
const statusLabel = (value?: string | null) => ({
  conferido:'Conferido', pendencia:'Pendência', retificacao:'Retificação', aguardando_analise:'Aguardando análise',
  enviado:'Formalizado', erro_envio_email:'Falha no e-mail', processando:'Processando', aguardando_configuracao:'Aguardando configuração',
}[String(value || '')] || String(value || '—').replace(/_/g, ' '));
const emailOk = (value?: string | null) => value === 'enviado';

const CentralContabilidadePage: React.FC = () => {
  const { companies } = useApp();
  const [tab, setTab] = useState<TabKey>('visao');
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const userMap = useMemo(() => new Map(portalUsers.map((u) => [u.id, u])), [portalUsers]);

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        supabase.from('contabilidade_portal_revisoes' as any).select('*').order('updated_at', { ascending:false }).limit(250),
        supabase.from('contabilidade_portal_uploads' as any).select('*').order('created_at', { ascending:false }).limit(250),
        supabase.from('contabilidade_portal_usuarios' as any).select('id,nome,email,portal').eq('ativo', true),
      ]);
      if (a.error) throw a.error; if (b.error) throw b.error; if (c.error) throw c.error;
      setRevisoes((a.data || []) as any); setUploads((b.data || []) as any); setPortalUsers((c.data || []) as any);
    } catch (e:any) { toast.error(e?.message || 'Não foi possível carregar a Central da Contabilidade.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { const timer = window.setInterval(() => void carregar(true), 60_000); return () => window.clearInterval(timer); }, [carregar]);

  const pendencias = useMemo(() => revisoes.filter((r) => ['pendencia','retificacao','aguardando_analise'].includes(r.status)), [revisoes]);
  const conferidos = useMemo(() => revisoes.filter((r) => r.status === 'conferido'), [revisoes]);
  const errosEmail = useMemo(() => uploads.filter((u) => !!u.formalizacao_email_status && !emailOk(u.formalizacao_email_status)), [uploads]);
  const hoje = useMemo(() => {
    const key = new Date().toLocaleDateString('en-CA');
    return uploads.filter((u) => new Date(u.created_at).toLocaleDateString('en-CA') === key).length + revisoes.filter((r) => new Date(r.updated_at || r.created_at).toLocaleDateString('en-CA') === key).length;
  }, [uploads, revisoes]);

  const authToken = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    return data.session.access_token;
  };

  const chamarAdmin = async (action:string, uploadId:string) => {
    const token = await authToken();
    const response = await fetch('/api/accounting-central-admin', { method:'POST', headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` }, body:JSON.stringify({ action, upload_id:uploadId }) });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(data?.message || data?.error || 'Operação não concluída.');
    return data;
  };

  const abrirUpload = async (u:Upload) => {
    setBusyId(u.id);
    try { const data = await chamarAdmin('view_upload', u.id); if (!data.url) throw new Error('Documento indisponível.'); window.open(data.url, '_blank', 'noopener,noreferrer'); }
    catch (e:any) { toast.error(e?.message || 'Erro ao abrir documento.'); }
    finally { setBusyId(null); }
  };

  const reenviarFormalizacao = async (u:Upload) => {
    setBusyId(u.id);
    try {
      const data = await chamarAdmin('retry_email', u.id);
      if (data.email_status === 'enviado') toast.success('Formalização enviada por e-mail.');
      else toast.error(`Documento recebido, mas o e-mail ainda não saiu: ${statusLabel(data.email_status)}.`);
      await carregar(true);
    } catch (e:any) { toast.error(e?.message || 'Erro ao reenviar formalização.'); }
    finally { setBusyId(null); }
  };

  const tabs:Array<{key:TabKey;label:string;icon:React.ElementType}> = [
    { key:'visao', label:'Visão geral', icon:Building2 }, { key:'movimentacoes', label:'Conferências', icon:FileCheck2 },
    { key:'documentos', label:'Documentos recebidos', icon:UploadCloud }, { key:'fechamento', label:'Fechamento', icon:Send },
  ];

  return <div className="space-y-5 animate-fade-in">
    <section className="overflow-hidden rounded-xl border border-[#2b2335] bg-[#05070b] shadow-[0_18px_50px_rgba(0,0,0,.24)]">
      <div className="flex flex-col gap-5 border-b border-[#28212f] bg-[radial-gradient(circle_at_10%_0%,rgba(139,34,255,.17),transparent_36%)] px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="text-[11px] font-bold uppercase tracking-[.18em] text-[#a855f7]">Administração TOPAC RH PRO</div><h1 className="mt-1 text-2xl font-black text-white">Central da Contabilidade</h1><p className="mt-1 max-w-3xl text-sm text-zinc-400">Acompanhe o que a contabilidade conferiu, o que ela devolveu para o RH e formalize os envios da folha sem sair da central.</p></div>
        <button onClick={() => void carregar()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#3b2b4b] bg-[#0b0d12] px-4 py-2 text-xs font-bold text-zinc-200 hover:border-[#8b22ff]"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`} /> Atualizar</button>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4"><MetricCard icon={AlertTriangle} label="Pendências / retificações" value={pendencias.length} tone="amber" /><MetricCard icon={CheckCircle2} label="Conferidos" value={conferidos.length} tone="green" /><MetricCard icon={FileText} label="Documentos recebidos" value={uploads.length} tone="purple" /><MetricCard icon={Clock3} label="Movimentações hoje" value={hoje} tone="blue" /></div>
      <div className="flex gap-1 overflow-x-auto border-t border-[#211b28] bg-[#07090d] px-3 py-2">{tabs.map(({key,label,icon:Icon}) => <button key={key} onClick={() => setTab(key)} className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-bold ${tab===key?'bg-[#25123d] text-white ring-1 ring-[#7131a8]':'text-zinc-500 hover:bg-white/[.035] hover:text-zinc-200'}`}><Icon className={`h-4 w-4 ${tab===key?'text-[#ffc400]':'text-[#8b22ff]'}`} />{label}</button>)}</div>
    </section>

    {loading ? <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-[#27222e] bg-[#05070b]"><Loader2 className="h-6 w-6 animate-spin text-[#a855f7]" /></div> : tab === 'fechamento' ? <FechamentoPage /> : tab === 'visao' ? <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Últimas conferências" icon={FileCheck2}>{revisoes.length===0?<Empty text="Nenhuma conferência registrada."/>:revisoes.slice(0,8).map((r)=><div key={r.id} className="flex items-start justify-between gap-3 border-b border-[#1f2026] py-3 last:border-0"><div className="min-w-0"><div className="truncate text-sm font-bold text-zinc-100">{String(r.origem_tipo||'Movimentação').replace(/_/g,' ')}</div><div className="mt-1 text-xs text-zinc-500">{companyMap.get(r.empresa_id)||'Empresa'} · {r.revisor_nome||'Contabilidade'} · {brDateTime(r.revisado_em||r.created_at)}</div>{r.observacao&&<div className="mt-1 line-clamp-2 text-xs text-zinc-400">{r.observacao}</div>}</div><StatusBadge value={r.status}/></div>)}</Panel>
      <Panel title="Últimos documentos recebidos" icon={UploadCloud}>{uploads.length===0?<Empty text="Nenhum documento recebido."/>:uploads.slice(0,8).map((u)=><div key={u.id} className="flex items-center justify-between gap-3 border-b border-[#1f2026] py-3 last:border-0"><div className="min-w-0"><div className="truncate text-sm font-bold text-zinc-100">{u.arquivo_nome}</div><div className="mt-1 text-xs text-zinc-500">{companyMap.get(u.empresa_id)||'Empresa'} · {userMap.get(u.portal_user_id)?.nome||'Contabilidade'} · {brDateTime(u.created_at)}</div></div><button onClick={()=>void abrirUpload(u)} disabled={busyId===u.id} className="rounded-md border border-[#3a2c48] px-3 py-1.5 text-xs font-bold text-zinc-200 hover:border-[#8b22ff]">Abrir</button></div>)}</Panel>
      {errosEmail.length>0&&<div className="xl:col-span-2"><Panel title="Formalizações de e-mail com falha" icon={AlertTriangle}><div className="grid gap-2 lg:grid-cols-2">{errosEmail.slice(0,12).map((u)=><div key={u.id} className="rounded-lg border border-rose-500/20 bg-rose-500/[.045] p-3"><div className="text-sm font-bold text-white">{u.arquivo_nome}</div><div className="mt-1 text-xs text-zinc-500">{companyMap.get(u.empresa_id)||'Empresa'} · {brDateTime(u.created_at)}</div><div className="mt-3 flex items-center justify-between gap-2"><StatusBadge value={u.formalizacao_email_status||'erro_envio_email'}/><button onClick={()=>void reenviarFormalizacao(u)} disabled={busyId===u.id} className="inline-flex items-center gap-2 rounded-md bg-[#7c24d6] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{busyId===u.id?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Send className="h-3.5 w-3.5"/>}Reenviar formalização</button></div></div>)}</div></Panel></div>}
    </div> : tab === 'movimentacoes' ? <Panel title="Conferências feitas pela contabilidade" icon={Users}>{revisoes.length===0?<Empty text="Nenhuma conferência registrada."/>:<div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead className="border-b border-[#29242f] text-[10px] uppercase text-zinc-500"><tr><th className="px-3 py-3">Movimento</th><th className="px-3 py-3">Empresa</th><th className="px-3 py-3">Contabilidade</th><th className="px-3 py-3">Data / hora</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Observação</th></tr></thead><tbody>{revisoes.map((r)=><tr key={r.id} className="border-b border-[#1b1c21]"><td className="px-3 py-3 font-bold text-zinc-200">{String(r.origem_tipo||'Movimentação').replace(/_/g,' ')}</td><td className="px-3 py-3 text-zinc-400">{companyMap.get(r.empresa_id)||'—'}</td><td className="px-3 py-3 text-zinc-400">{r.revisor_nome||'—'}</td><td className="px-3 py-3 text-zinc-400">{brDateTime(r.revisado_em||r.created_at)}</td><td className="px-3 py-3"><StatusBadge value={r.status}/></td><td className="max-w-[340px] px-3 py-3 text-zinc-400">{r.observacao||'—'}</td></tr>)}</tbody></table></div>}</Panel> : <Panel title="Documentos enviados pela contabilidade para o RH" icon={UploadCloud}>{uploads.length===0?<Empty text="Nenhum documento recebido."/>:<div className="space-y-2">{uploads.map((u)=><div key={u.id} className="grid gap-3 rounded-lg border border-[#24212a] bg-[#080a0e] p-4 lg:grid-cols-[1.5fr_.8fr_.8fr_.8fr_auto] lg:items-center"><div className="min-w-0"><div className="truncate text-sm font-bold text-white">{u.arquivo_nome}</div><div className="mt-1 text-xs text-zinc-500">{tipoLabel(u.tipo_documento)}{u.funcionario_nome?` · ${u.funcionario_nome}`:''}</div></div><Info label="Empresa" value={companyMap.get(u.empresa_id)||'—'}/><Info label="Enviado por" value={userMap.get(u.portal_user_id)?.nome||'Contabilidade'}/><div><div className="text-[10px] uppercase text-zinc-600">Formalização</div><div className="mt-1"><StatusBadge value={u.formalizacao_email_status||'—'}/></div></div><div className="flex gap-2 lg:justify-end"><button onClick={()=>void abrirUpload(u)} disabled={busyId===u.id} className="rounded-md border border-[#423051] px-3 py-2 text-xs font-bold text-zinc-200">Abrir PDF</button>{!emailOk(u.formalizacao_email_status)&&<button onClick={()=>void reenviarFormalizacao(u)} disabled={busyId===u.id} className="rounded-md bg-[#7c24d6] px-3 py-2 text-xs font-bold text-white">Reenviar e-mail</button>}</div></div>)}</div>}</Panel>}
  </div>;
};

const Panel=({title,icon:Icon,children}:{title:string;icon:React.ElementType;children:React.ReactNode})=><section className="rounded-xl border border-[#27222e] bg-[#05070b] p-5"><div className="mb-4 flex items-center gap-2"><Icon className="h-4 w-4 text-[#ffc400]"/><h2 className="text-sm font-black uppercase tracking-wide text-white">{title}</h2></div>{children}</section>;
const Empty=({text}:{text:string})=><div className="py-10 text-center text-sm text-zinc-600">{text}</div>;
const Info=({label,value}:{label:string;value:string})=><div><div className="text-[10px] uppercase text-zinc-600">{label}</div><div className="mt-1 text-xs font-semibold text-zinc-300">{value}</div></div>;
const MetricCard=({icon:Icon,label,value,tone}:{icon:React.ElementType;label:string;value:number;tone:'amber'|'green'|'purple'|'blue'})=>{const tones={amber:'text-amber-300 border-amber-500/20 bg-amber-500/[.055]',green:'text-emerald-300 border-emerald-500/20 bg-emerald-500/[.055]',purple:'text-violet-300 border-violet-500/20 bg-violet-500/[.055]',blue:'text-sky-300 border-sky-500/20 bg-sky-500/[.055]'};return <div className={`rounded-lg border p-4 ${tones[tone]}`}><div className="flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div><Icon className="h-4 w-4"/></div><div className="mt-2 text-2xl font-black text-white">{value}</div></div>};
const StatusBadge=({value}:{value?:string|null})=>{const v=String(value||'—');const cls=v==='conferido'||v==='enviado'?'border-emerald-500/25 bg-emerald-500/10 text-emerald-300':v.includes('erro')||v==='pendencia'?'border-rose-500/25 bg-rose-500/10 text-rose-300':v==='retificacao'?'border-violet-500/25 bg-violet-500/10 text-violet-300':'border-amber-500/25 bg-amber-500/10 text-amber-300';return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${cls}`}>{statusLabel(v)}</span>};

export default CentralContabilidadePage;
