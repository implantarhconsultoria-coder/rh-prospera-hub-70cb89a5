import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Clock3, Eye, FileCheck2, Loader2, RefreshCw, Send, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type Company = { id:string; nome:string; cnpj?:string; codigo?:string };
type Cycle = { id:string; empresa_id:string; competencia:string; tipo:'adiantamento'|'pagamento'; status:string; apontamento_liberado_em?:string|null; contabilidade_recebeu_em?:string|null; enviado_em?:string|null; conferido_em?:string|null; observacao?:string|null };
type Doc = { id:string; ciclo_id:string; classificacao:string; status:string; funcionario_id?:string|null; nome_detectado?:string|null; payroll_document_id?:string|null };
type Upload = { id:string; ciclo_id:string; empresa_id:string; arquivo_nome:string; storage_bucket:string; storage_path:string; created_at:string };
type AdminState = { competence:string; companies:Company[]; cycles:Cycle[]; documents:Doc[]; uploads:Upload[] };

const monthLabel = (value:string) => { const [y,m] = String(value||'').split('-'); return y&&m ? `${m}/${y}` : value; };
const statusLabel = (value:string) => ({
  aguardando_envio:'Aguardando contabilidade', aguardando_apontamento:'Aguardando apontamento', liberado:'Apontamento liberado', recebido:'Contabilidade confirmou recebimento',
  processando:'Processando PDFs', aguardando_conferencia:'Aguardando seu OK', conferido:'Conferido / OK', pendencia:'Pendência enviada',
} as Record<string,string>)[value] || value.replace(/_/g,' ');
const statusClass = (value:string) => value === 'conferido' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : value === 'pendencia' ? 'border-rose-500/25 bg-rose-500/10 text-rose-300' : value === 'aguardando_conferencia' ? 'border-amber-500/25 bg-amber-500/10 text-amber-300' : 'border-violet-500/25 bg-violet-500/10 text-violet-300';

const ContabilidadeFolhaAdminAddon: React.FC = () => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<AdminState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [issueCycle, setIssueCycle] = useState<string | null>(null);
  const [issueText, setIssueText] = useState('');

  useEffect(() => {
    const mount = () => {
      if (window.location.pathname !== '/admin/central-contabilidade') { setHost(null); return; }
      const headings = Array.from(document.querySelectorAll('h1'));
      const heading = headings.find(el => /Central da Contabilidade/i.test(el.textContent || ''));
      const root = heading?.closest('.space-y-5.animate-fade-in') as HTMLElement | null;
      if (!root) return;
      let element = root.querySelector<HTMLElement>('[data-contabilidade-folha-admin-host="true"]');
      if (!element) {
        element = document.createElement('div');
        element.dataset.contabilidadeFolhaAdminHost = 'true';
        root.prepend(element);
      }
      setHost(element);
    };
    mount();
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList:true, subtree:true });
    const timer = window.setInterval(mount, 700);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, []);

  const api = useCallback(async (action:string, payload:Record<string,unknown> = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch('/api/accounting-payroll-flow', {
      method:'POST', headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` },
      body:JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || 'Operação não concluída.');
    return result;
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await api('admin_state');
      setState({ competence:String(result.competence||''), companies:result.companies||[], cycles:result.cycles||[], documents:result.documents||[], uploads:result.uploads||[] });
    } catch (error:any) { if (!silent) toast.error(error?.message || 'Não foi possível carregar o fluxo da folha.'); }
    finally { if (!silent) setLoading(false); }
  }, [api]);

  useEffect(() => { if (host) void load(); }, [host, load]);
  useEffect(() => { if (!host) return; const timer = window.setInterval(() => void load(true), 30_000); return () => window.clearInterval(timer); }, [host, load]);

  const companyMap = useMemo(() => new Map((state?.companies||[]).map(c => [c.id,c])), [state?.companies]);
  const cycleRows = useMemo(() => [...(state?.cycles||[])].sort((a,b) => a.tipo.localeCompare(b.tipo) || (companyMap.get(a.empresa_id)?.nome||'').localeCompare(companyMap.get(b.empresa_id)?.nome||'', 'pt-BR')), [state?.cycles, companyMap]);

  const releasePayment = async (cycle:Cycle) => {
    setBusy(cycle.id);
    try { await api('admin_release_payment', { empresa_id:cycle.empresa_id, competencia:cycle.competencia }); toast.success('Pagamento liberado para a contabilidade.'); await load(true); }
    catch (error:any) { toast.error(error?.message || 'Não foi possível liberar o Pagamento.'); }
    finally { setBusy(null); }
  };

  const approve = async (cycle:Cycle) => {
    setBusy(cycle.id);
    try {
      const result = await api('admin_approve_cycle', { ciclo_id:cycle.id });
      toast.success(`Conferido / OK. ${Number(result.documentos_liberados||0)} recibo(s) liberado(s) na Assinatura Digital.`);
      await load(true);
    } catch (error:any) { toast.error(error?.message || 'Não foi possível concluir a conferência.'); }
    finally { setBusy(null); }
  };

  const markPending = async (cycle:Cycle) => {
    if (!issueText.trim()) return toast.error('Descreva a pendência.');
    setBusy(cycle.id);
    try { await api('admin_mark_pending', { ciclo_id:cycle.id, observacao:issueText.trim() }); toast.success('Pendência enviada para a contabilidade.'); setIssueCycle(null); setIssueText(''); await load(true); }
    catch (error:any) { toast.error(error?.message || 'Não foi possível registrar a pendência.'); }
    finally { setBusy(null); }
  };

  const openUpload = async (upload:Upload) => {
    setBusy(upload.id);
    try { const result = await api('admin_view_file', { bucket:upload.storage_bucket, path:upload.storage_path }); window.open(result.url, '_blank', 'noopener,noreferrer'); }
    catch (error:any) { toast.error(error?.message || 'PDF indisponível.'); }
    finally { setBusy(null); }
  };

  if (!host) return null;
  return createPortal(
    <section className="mb-5 overflow-hidden rounded-xl border border-[#352741] bg-[#05070b] shadow-[0_18px_50px_rgba(0,0,0,.22)]">
      <div className="flex flex-col gap-3 border-b border-[#28212f] bg-[radial-gradient(circle_at_10%_0%,rgba(139,34,255,.15),transparent_38%)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#a855f7]">Fluxo mensal · {monthLabel(state?.competence||'')}</div><h2 className="mt-1 text-lg font-black text-white">Adiantamento e Pagamento</h2><p className="mt-1 text-xs text-zinc-500">Você libera o Pagamento após enviar o apontamento e dá o OK final nos PDFs enviados pela contabilidade.</p></div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="border-[#3c2d49] bg-[#090b10] text-zinc-300">{loading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<RefreshCw className="mr-2 h-4 w-4"/>}Atualizar</Button>
      </div>
      {loading && !state ? <div className="flex h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-violet-400" /></div> : <div className="grid gap-3 p-4 xl:grid-cols-2">
        {cycleRows.map(cycle => {
          const company = companyMap.get(cycle.empresa_id);
          const docs = (state?.documents||[]).filter(d => d.ciclo_id===cycle.id);
          const uploads = (state?.uploads||[]).filter(u => u.ciclo_id===cycle.id);
          const identified = docs.filter(d => d.classificacao==='identificado').length;
          const review = docs.filter(d => ['revisao','erro'].includes(d.classificacao)).length;
          const isPaymentLocked = cycle.tipo==='pagamento' && !cycle.apontamento_liberado_em;
          return <div key={cycle.id} className="rounded-xl border border-[#2a2630] bg-[#080a0e] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3">{cycle.tipo==='pagamento'?<FileCheck2 className="h-5 w-5 text-cyan-300"/>:<WalletCards className="h-5 w-5 text-violet-300"/>}<div><div className="text-[10px] uppercase text-zinc-600">{cycle.tipo==='pagamento'?'Pagamento':'Adiantamento'}</div><div className="text-sm font-black text-white">{company?.nome||'Empresa'}</div></div></div><span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${statusClass(cycle.status)}`}>{statusLabel(cycle.status)}</span></div>
            <div className="mt-3 grid grid-cols-3 gap-2"><Mini label="PDFs" value={uploads.length}/><Mini label="Reconhecidos" value={identified}/><Mini label="Revisar" value={review}/></div>
            {cycle.observacao && <div className="mt-3 rounded-md border border-rose-500/20 bg-rose-500/[.04] p-2.5 text-[11px] text-rose-200">{cycle.observacao}</div>}
            {uploads.length>0 && <div className="mt-3 flex flex-wrap gap-2">{uploads.slice(0,5).map(upload => <button key={upload.id} onClick={()=>void openUpload(upload)} disabled={busy===upload.id} className="inline-flex items-center gap-1.5 rounded-md border border-[#3a3044] bg-[#0a0c11] px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 hover:border-violet-500/50">{busy===upload.id?<Loader2 className="h-3 w-3 animate-spin"/>:<Eye className="h-3 w-3"/>}{upload.arquivo_nome.length>28?`${upload.arquivo_nome.slice(0,25)}...`:upload.arquivo_nome}</button>)}</div>}
            <div className="mt-4 flex flex-wrap gap-2">
              {isPaymentLocked && <Button size="sm" onClick={()=>void releasePayment(cycle)} disabled={busy===cycle.id} className="bg-cyan-600 text-white hover:bg-cyan-500">{busy===cycle.id?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Send className="mr-2 h-4 w-4"/>}Apontamento enviado · liberar</Button>}
              {cycle.status==='aguardando_conferencia' && <><Button size="sm" onClick={()=>void approve(cycle)} disabled={busy===cycle.id} className="bg-emerald-600 text-white hover:bg-emerald-500">{busy===cycle.id?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<CheckCircle2 className="mr-2 h-4 w-4"/>}Conferir e dar OK</Button><Button size="sm" variant="outline" onClick={()=>{setIssueCycle(cycle.id);setIssueText('');}} className="border-rose-500/30 bg-rose-500/[.04] text-rose-200"><AlertTriangle className="mr-2 h-4 w-4"/>Informar pendência</Button></>}
              {cycle.status==='conferido' && <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[.04] px-3 py-2 text-[11px] font-bold text-emerald-300"><CheckCircle2 className="h-4 w-4"/>OK finalizado</span>}
              {!isPaymentLocked && !['aguardando_conferencia','conferido'].includes(cycle.status) && <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/15 px-3 py-2 text-[11px] text-amber-200"><Clock3 className="h-4 w-4"/>{cycle.tipo==='pagamento'&&cycle.apontamento_liberado_em?'Aguardando retorno da contabilidade':'Aguardando envio dos PDFs'}</span>}
            </div>
            {issueCycle===cycle.id && <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/[.035] p-3"><textarea value={issueText} onChange={e=>setIssueText(e.target.value)} placeholder="Explique o que precisa ser corrigido..." className="min-h-[80px] w-full rounded-md border border-[#493248] bg-[#05070b] p-3 text-xs text-white outline-none focus:border-rose-500/50"/><div className="mt-2 flex gap-2"><Button size="sm" onClick={()=>void markPending(cycle)} disabled={busy===cycle.id||!issueText.trim()} className="bg-rose-600 text-white">Enviar pendência</Button><Button size="sm" variant="ghost" onClick={()=>{setIssueCycle(null);setIssueText('');}} className="text-zinc-400">Cancelar</Button></div></div>}
          </div>;
        })}
      </div>}
    </section>,
    host,
  );
};

const Mini=({label,value}:{label:string;value:number})=><div className="rounded-md border border-[#25222a] bg-[#06080b] p-2.5"><div className="text-lg font-black text-white">{value}</div><div className="text-[9px] font-bold uppercase text-zinc-600">{label}</div></div>;

export default ContabilidadeFolhaAdminAddon;
