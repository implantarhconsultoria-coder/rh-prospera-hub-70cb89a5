import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, BellRing, CheckCircle2, FileText, Inbox, Loader2,
  Mail, Paperclip, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Upload = {
  id: string;
  empresa_id: string;
  tipo_documento: string;
  competencia?: string | null;
  funcionario_nome?: string | null;
  observacao?: string | null;
  arquivo_nome: string;
  tamanho_bytes?: number | null;
  status: string;
  formalizacao_email_status: string;
  formalizacao_email_em?: string | null;
  created_at: string;
  empresa?: { nome?: string; codigo?: string } | null;
  usuario?: { nome?: string; email?: string } | null;
};

type Revisao = {
  id: string;
  origem_tipo: string;
  origem_id: string;
  empresa_id: string;
  status: string;
  observacao?: string | null;
  revisor_nome?: string | null;
  revisado_em?: string | null;
  updated_at: string;
  empresa?: { nome?: string } | null;
};

type EmailDoc = {
  id: string;
  arquivo_original: string;
  status: string;
  competencia?: string | null;
};

type EmailRow = {
  id: string;
  provider: string;
  mailbox?: string | null;
  remetente?: string | null;
  assunto?: string | null;
  recebido_em: string;
  status: string;
  total_anexos: number;
  total_pdfs: number;
  metadata?: {
    categoria?: string;
    categoria_confianca?: number;
    relevante?: boolean;
    attention_status?: 'PENDENTE'|'LIDO'|'RESOLVIDO'|'IGNORADO';
    body_preview?: string;
    competencia?: string | null;
    empresa_id?: string | null;
    empresa_nome?: string | null;
    funcionario_id?: string | null;
    funcionario_nome?: string | null;
  } | null;
  documentos?: EmailDoc[];
};

type ProviderStatus = {
  provider: string;
  configured: boolean;
  mailbox?: string;
  missing?: string[];
};

const brDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
};

const typeLabel: Record<string,string> = {
  folha_processada: 'Folha processada',
  recibos_holerites: 'Recibos / Holerites',
  contrato: 'Contrato de trabalho',
  rescisao: 'Documentos de rescisão',
  ferias: 'Documentos de férias',
  retorno_folha: 'Retorno da contabilidade',
  outro: 'Outro documento',
};

const origemLabel: Record<string,string> = {
  atestado: 'Atestado / afastamento',
  admissao: 'Nova contratação',
  demissao: 'Demissão / rescisão',
  ferias: 'Férias',
  fechamento: 'Fechamento da folha',
  alerta: 'Alteração de salário/função',
};

const categoryLabel: Record<string,string> = {
  FOLHA: 'Folha de pagamento',
  RESCISAO: 'Rescisão',
  ADMISSAO: 'Admissão',
  FERIAS: 'Férias',
  PONTO_HE: 'Ponto / Horas extras',
  ATESTADO: 'Atestado / Afastamento',
  BENEFICIOS: 'VR / VT / Benefícios',
  CONTABILIDADE: 'Contabilidade',
  GUIAS_ENCARGOS: 'Guias / Encargos',
  OUTRO: 'Outros',
};

const attentionClass = (status?: string) => {
  if (status === 'PENDENTE') return 'border-amber-500/25 bg-amber-500/10 text-amber-200';
  if (status === 'LIDO') return 'border-sky-500/25 bg-sky-500/10 text-sky-200';
  if (status === 'RESOLVIDO') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
  return 'border-zinc-700 bg-zinc-900 text-zinc-400';
};

export default function ContabilidadeAdminInboxAddon() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [provider, setProvider] = useState<ProviderStatus>({ provider:'NAO_CONFIGURADO', configured:false });
  const [tab, setTab] = useState<'emails'|'documentos'|'conferencias'>('emails');
  const lastPendingRef = useRef<number | null>(null);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sessão administrativa não encontrada.');
    return token;
  }, []);

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await getToken();
      const [u, r, emailResponse] = await Promise.all([
        supabase
          .from('contabilidade_portal_uploads')
          .select('id,empresa_id,tipo_documento,competencia,funcionario_nome,observacao,arquivo_nome,tamanho_bytes,status,formalizacao_email_status,formalizacao_email_em,created_at,empresa:empresas(nome,codigo),usuario:contabilidade_portal_usuarios(nome,email)')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('contabilidade_portal_revisoes')
          .select('id,origem_tipo,origem_id,empresa_id,status,observacao,revisor_nome,revisado_em,updated_at,empresa:empresas(nome)')
          .order('updated_at', { ascending: false })
          .limit(100),
        fetch('/api/accounting-email-admin', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
          body:JSON.stringify({ action:'list' }),
        }),
      ]);
      if (u.error) throw u.error;
      if (r.error) throw r.error;
      const emailBody = await emailResponse.json().catch(() => ({}));
      if (!emailResponse.ok || !emailBody?.ok) throw new Error(emailBody?.error || 'Não foi possível carregar os e-mails.');

      setUploads((u.data || []) as any);
      setRevisoes((r.data || []) as any);
      setEmails((emailBody.rows || []) as EmailRow[]);
      setProvider(emailBody.provider || { provider:'NAO_CONFIGURADO', configured:false });

      const nextPending = Number(emailBody?.counts?.pending || 0);
      if (lastPendingRef.current !== null && nextPending > lastPendingRef.current) {
        const novos = nextPending - lastPendingRef.current;
        toast.info(`${novos} novo${novos > 1 ? 's' : ''} e-mail${novos > 1 ? 's' : ''} de RH precisa${novos > 1 ? 'm' : ''} de atenção.`);
      }
      lastPendingRef.current = nextPending;
    } catch (error: any) {
      if (!silent) toast.error(error?.message || 'Não foi possível carregar a Central de E-mails.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void carregar(true); }, [carregar]);
  useEffect(() => {
    const timer = window.setInterval(() => void carregar(true), 60_000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const hoje = useMemo(() => {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    return uploads.filter((u) => u.created_at.slice(0,10) === ymd).length;
  }, [uploads]);

  const pendencias = useMemo(() => revisoes.filter((r) => r.status === 'pendencia').length, [revisoes]);
  const emailsFalha = useMemo(() => uploads.filter((u) => !['enviado','pendente','processando'].includes(u.formalizacao_email_status)).length, [uploads]);
  const emailPendentes = useMemo(() => emails.filter((e) => e.metadata?.relevante === true && e.metadata?.attention_status === 'PENDENTE').length, [emails]);
  const emailRelevantes = useMemo(() => emails.filter((e) => e.metadata?.relevante === true), [emails]);
  const orderedEmails = useMemo(() => [...emails].sort((a,b) => {
    const ap = a.metadata?.attention_status === 'PENDENTE' ? 1 : 0;
    const bp = b.metadata?.attention_status === 'PENDENTE' ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return new Date(b.recebido_em).getTime() - new Date(a.recebido_em).getTime();
  }), [emails]);

  const abrirPdf = async (upload: Upload) => {
    try {
      const token = await getToken();
      const response = await fetch('/api/accounting-portal-admin-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ upload_id: upload.id }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok || !body?.url) throw new Error(body?.error || 'Não foi possível abrir o PDF.');
      window.open(body.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao abrir documento.');
    }
  };

  const emailAction = async (action: 'mark_read'|'resolve'|'reopen', messageId: string) => {
    setBusyId(messageId);
    try {
      const token = await getToken();
      const response = await fetch('/api/accounting-email-admin', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body:JSON.stringify({ action, message_id:messageId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Não foi possível atualizar o e-mail.');
      await carregar(true);
    } catch (error:any) {
      toast.error(error?.message || 'Erro ao atualizar o e-mail.');
    } finally {
      setBusyId(null);
    }
  };

  const abrirEmailDoc = async (documentId: string) => {
    setBusyId(documentId);
    try {
      const token = await getToken();
      const response = await fetch('/api/accounting-email-admin', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body:JSON.stringify({ action:'view_document', document_id:documentId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok || !body?.url) throw new Error(body?.error || 'Documento indisponível.');
      window.open(body.url, '_blank', 'noopener,noreferrer');
    } catch (error:any) {
      toast.error(error?.message || 'Não foi possível abrir o anexo.');
    } finally {
      setBusyId(null);
    }
  };

  const sincronizar = async () => {
    setSyncing(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/accounting-email-sync', {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) {
        if (body?.error === 'accounting_email_not_configured') throw new Error('A conexão Microsoft 365 ainda precisa ser autorizada no servidor.');
        throw new Error(body?.error || 'Falha ao sincronizar e-mails.');
      }
      toast.success(`Sincronização concluída: ${body?.result?.created_messages || 0} novo(s), ${body?.result?.relevant_messages || 0} relevante(s).`);
      await carregar(true);
    } catch (error:any) {
      toast.error(error?.message || 'Erro na sincronização.');
    } finally {
      setSyncing(false);
    }
  };

  return <>
    <button
      type="button"
      onClick={() => { setOpen(true); void carregar(); }}
      className="no-print fixed z-[45] bottom-5 left-[292px] flex items-center gap-2 rounded-full border border-[#6d28d9] bg-[#100918] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_50px_rgba(0,0,0,.55),0_0_25px_rgba(124,44,255,.18)] hover:bg-[#1a0d28] transition"
      title="Central de E-mails RH"
    >
      <Mail className="h-5 w-5 text-[#f4b400]" />
      <span>Central de E-mails RH</span>
      {emailPendentes > 0 && <span className="grid min-w-6 h-6 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold">{emailPendentes}</span>}
    </button>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden bg-[#05070b] border-[#38234c] text-zinc-100 p-0">
        <DialogHeader className="p-5 pb-4 border-b border-[#27202d]">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="text-xl">Central de E-mails RH</DialogTitle>
              <p className="text-xs text-zinc-500 mt-1">E-mails corporativos de RH/folha, documentos da contabilidade e conferências em um único lugar.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void sincronizar()} disabled={syncing || !provider.configured} className="border-[#5b3b76] bg-[#130b1d] text-zinc-200">
                {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Mail className="h-4 w-4 mr-2"/>}Sincronizar agora
              </Button>
              <Button size="sm" variant="outline" onClick={() => void carregar()} disabled={loading} className="border-[#3b3241] bg-[#0a0d12] text-zinc-300">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Atualizar
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 overflow-y-auto">
          <div className={`mb-4 rounded-xl border p-3 ${provider.configured ? 'border-emerald-500/20 bg-emerald-500/[.045]' : 'border-amber-500/20 bg-amber-500/[.045]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`grid h-9 w-9 place-items-center rounded-lg ${provider.configured ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                  <ShieldCheck className="h-5 w-5"/>
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{provider.configured ? 'Microsoft 365 conectado ao servidor' : 'Microsoft 365 aguardando autorização'}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">{provider.mailbox || 'adm.matriz@topac.com.br'} · acesso somente leitura nesta fase</div>
                </div>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${provider.configured ? 'border-emerald-500/25 text-emerald-300' : 'border-amber-500/25 text-amber-300'}`}>
                {provider.configured ? 'ATIVO' : 'CONFIGURAÇÃO PENDENTE'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5 lg:grid-cols-4">
            <MiniCard label="E-mails pendentes" value={emailPendentes} icon={BellRing} />
            <MiniCard label="E-mails RH identificados" value={emailRelevantes} icon={Mail} />
            <MiniCard label="Documentos hoje" value={hoje} icon={FileText} />
            <MiniCard label="Pendências contabilidade" value={pendencias + emailsFalha} icon={AlertTriangle} />
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto">
            <button onClick={() => setTab('emails')} className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${tab === 'emails' ? 'bg-[#7c2cff] text-white' : 'bg-[#101218] text-zinc-400'}`}>E-mails ({emails.length})</button>
            <button onClick={() => setTab('documentos')} className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${tab === 'documentos' ? 'bg-[#7c2cff] text-white' : 'bg-[#101218] text-zinc-400'}`}>Documentos do portal ({uploads.length})</button>
            <button onClick={() => setTab('conferencias')} className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${tab === 'conferencias' ? 'bg-[#7c2cff] text-white' : 'bg-[#101218] text-zinc-400'}`}>Conferências ({revisoes.length})</button>
          </div>

          {loading ? <div className="py-16 flex items-center justify-center gap-2 text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div> : tab === 'emails' ? (
            <div className="space-y-2">
              {emails.length === 0 && <Empty text={provider.configured ? 'Nenhum e-mail sincronizado ainda.' : 'A estrutura está pronta. Falta autorizar a conta Microsoft 365 para iniciar a coleta.'} />}
              {orderedEmails.map((email) => {
                const meta = email.metadata || {};
                const status = meta.attention_status || (meta.relevante ? 'PENDENTE' : 'IGNORADO');
                return <div key={email.id} className={`rounded-xl border p-4 ${status === 'PENDENTE' ? 'border-amber-500/25 bg-amber-500/[.035]' : 'border-[#252a33] bg-[#080b10]'}`}>
                  <div className="flex items-start gap-4">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${meta.relevante ? 'bg-[#211132] text-[#f4b400]' : 'bg-zinc-900 text-zinc-600'}`}><Mail className="h-5 w-5"/></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-zinc-100">{email.assunto || '(sem assunto)'}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${attentionClass(status)}`}>{status}</span>
                        {meta.categoria && <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-200">{categoryLabel[meta.categoria] || meta.categoria}</span>}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">De: {email.remetente || '—'} · {brDateTime(email.recebido_em)}</div>
                      {meta.body_preview && <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">{meta.body_preview}</div>}

                      {(meta.empresa_nome || meta.funcionario_nome || meta.competencia) && <div className="mt-3 flex flex-wrap gap-2">
                        {meta.empresa_nome && <span className="rounded-md border border-[#31263d] bg-[#0c0c12] px-2 py-1 text-[10px] text-zinc-300">Empresa: <b>{meta.empresa_nome}</b></span>}
                        {meta.funcionario_nome && <span className="rounded-md border border-[#31263d] bg-[#0c0c12] px-2 py-1 text-[10px] text-zinc-300">Funcionário: <b>{meta.funcionario_nome}</b></span>}
                        {meta.competencia && <span className="rounded-md border border-[#31263d] bg-[#0c0c12] px-2 py-1 text-[10px] text-zinc-300">Competência: <b>{meta.competencia}</b></span>}
                      </div>}

                      {!!email.documentos?.length && <div className="mt-3 flex flex-wrap gap-2">
                        {email.documentos.map((doc) => <button key={doc.id} disabled={busyId === doc.id} onClick={() => void abrirEmailDoc(doc.id)} className="inline-flex items-center gap-1.5 rounded-md border border-[#4a355e] bg-[#100b17] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-violet-500 disabled:opacity-50">
                          {busyId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Paperclip className="h-3.5 w-3.5"/>}{doc.arquivo_original}
                        </button>)}
                      </div>}
                    </div>

                    {meta.relevante && <div className="flex shrink-0 flex-col gap-2">
                      {status === 'PENDENTE' && <Button size="sm" variant="outline" disabled={busyId === email.id} onClick={() => void emailAction('mark_read', email.id)} className="border-sky-500/25 bg-sky-500/5 text-sky-200">Marcar lido</Button>}
                      {status !== 'RESOLVIDO' && <Button size="sm" variant="outline" disabled={busyId === email.id} onClick={() => void emailAction('resolve', email.id)} className="border-emerald-500/25 bg-emerald-500/5 text-emerald-200">Resolver</Button>}
                      {status === 'RESOLVIDO' && <Button size="sm" variant="outline" disabled={busyId === email.id} onClick={() => void emailAction('reopen', email.id)} className="border-amber-500/25 bg-amber-500/5 text-amber-200">Reabrir</Button>}
                    </div>}
                  </div>
                </div>;
              })}
            </div>
          ) : tab === 'documentos' ? (
            <div className="space-y-2">
              {uploads.length === 0 && <Empty text="Nenhum documento enviado pelo portal ainda." />}
              {uploads.map((u) => <div key={u.id} className="rounded-xl border border-[#252a33] bg-[#080b10] p-4 flex items-start gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#15101d] text-[#f4b400]"><FileText className="h-5 w-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold truncate">{u.arquivo_nome}</span>{u.formalizacao_email_status === 'enviado' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"><BadgeCheck className="h-3 w-3" />E-mail formalizado</span>}</div>
                  <div className="mt-1 text-xs text-zinc-500">{u.empresa?.nome || 'Empresa'} · {typeLabel[u.tipo_documento] || u.tipo_documento}{u.competencia ? ` · ${u.competencia}` : ''}</div>
                  <div className="mt-2 text-xs text-zinc-400">Enviado por <b>{u.usuario?.nome || 'Contabilidade'}</b> em {brDateTime(u.created_at)}</div>
                  {u.funcionario_nome && <div className="text-xs text-zinc-400 mt-1">Funcionário: {u.funcionario_nome}</div>}
                  {u.observacao && <div className="text-xs text-zinc-300 mt-2 rounded-lg bg-white/[.03] border border-white/[.05] p-2">{u.observacao}</div>}
                </div>
                <Button size="sm" variant="outline" className="border-[#3b3241] bg-[#0b0e13]" onClick={() => void abrirPdf(u)}>Abrir PDF</Button>
              </div>)}
            </div>
          ) : (
            <div className="space-y-2">
              {revisoes.length === 0 && <Empty text="Nenhuma conferência registrada pela contabilidade ainda." />}
              {revisoes.map((r) => <div key={r.id} className="rounded-xl border border-[#252a33] bg-[#080b10] p-4 flex items-start gap-4">
                <div className={`grid h-10 w-10 place-items-center rounded-lg ${r.status === 'pendencia' ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{r.status === 'pendencia' ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{origemLabel[r.origem_tipo] || r.origem_tipo} · {r.empresa?.nome || 'Empresa'}</div>
                  <div className="text-xs text-zinc-500 mt-1">{r.status === 'pendencia' ? 'Devolvido com pendência' : 'Conferido / OK'} por <b>{r.revisor_nome || 'Contabilidade'}</b> · {brDateTime(r.revisado_em || r.updated_at)}</div>
                  {r.observacao && <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-xs text-rose-100">{r.observacao}</div>}
                </div>
              </div>)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function MiniCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return <div className="rounded-xl border border-[#252a33] bg-[#080b10] p-3"><div className="flex items-center justify-between"><span className="text-[11px] text-zinc-500">{label}</span><Icon className="h-4 w-4 text-[#a855f7]" /></div><div className="text-2xl font-bold mt-2">{value}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="py-14 text-center text-sm text-zinc-500">{text}</div>;
}
