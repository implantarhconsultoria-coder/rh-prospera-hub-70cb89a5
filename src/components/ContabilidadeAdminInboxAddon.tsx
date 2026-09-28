import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mail, Paperclip, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type EmailDoc = {
  id: string;
  arquivo_original: string;
  status: string;
};

type EmailRow = {
  id: string;
  provider: string;
  mailbox?: string | null;
  remetente?: string | null;
  assunto?: string | null;
  recebido_em: string;
  total_anexos: number;
  total_pdfs: number;
  metadata?: {
    categoria?: string;
    relevante?: boolean;
    attention_status?: string;
    body_preview?: string;
    competencia?: string | null;
    empresa_nome?: string | null;
    funcionario_nome?: string | null;
  } | null;
  documentos?: EmailDoc[];
};

type ProviderStatus = {
  provider: string;
  configured: boolean;
  mailbox?: string;
};

const categoryLabel: Record<string, string> = {
  FOLHA: 'Folha',
  RESCISAO: 'Rescisão',
  ADMISSAO: 'Admissão',
  FERIAS: 'Férias',
  PONTO_HE: 'Ponto / HE',
  ATESTADO: 'Atestado',
  BENEFICIOS: 'VR / VT',
  CONTABILIDADE: 'Contabilidade',
  GUIAS_ENCARGOS: 'Guias / Encargos',
  OUTRO: 'Outros',
};

const brDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

export default function ContabilidadeAdminInboxAddon() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [provider, setProvider] = useState<ProviderStatus>({
    provider: 'NAO_CONFIGURADO',
    configured: false,
    mailbox: 'adm.matriz@topac.com.br',
  });
  const lastPending = useRef<number | null>(null);

  const token = useCallback(async () => {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (!accessToken) throw new Error('Sessão administrativa não encontrada.');
    return accessToken;
  }, []);

  const callAdmin = useCallback(async (payload: Record<string, unknown>) => {
    const accessToken = await token();
    const response = await fetch('/api/accounting-email-admin', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) throw new Error(body?.error || 'Falha na Central de E-mails.');
    return body;
  }, [token]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const body = await callAdmin({ action: 'list' });
      const rows = Array.isArray(body.rows) ? body.rows : [];
      setEmails(rows);
      if (body.provider) setProvider(body.provider);

      const pending = Number(body?.counts?.pending || 0);
      if (lastPending.current !== null && pending > lastPending.current) {
        const diff = pending - lastPending.current;
        toast.info(`${diff} novo${diff > 1 ? 's' : ''} e-mail${diff > 1 ? 's' : ''} de RH precisa${diff > 1 ? 'm' : ''} de atenção.`);
      }
      lastPending.current = pending;
    } catch (error: any) {
      if (!silent) toast.error(error?.message || 'Não foi possível carregar os e-mails.');
    } finally {
      setLoading(false);
    }
  }, [callAdmin]);

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const pendingCount = useMemo(
    () => emails.filter((row) => row.metadata?.relevante === true && row.metadata?.attention_status === 'PENDENTE').length,
    [emails],
  );

  const relevantCount = useMemo(
    () => emails.filter((row) => row.metadata?.relevante === true).length,
    [emails],
  );

  const ordered = useMemo(() => [...emails].sort((a, b) => {
    const aPending = a.metadata?.attention_status === 'PENDENTE' ? 1 : 0;
    const bPending = b.metadata?.attention_status === 'PENDENTE' ? 1 : 0;
    if (aPending !== bPending) return bPending - aPending;
    return new Date(b.recebido_em).getTime() - new Date(a.recebido_em).getTime();
  }), [emails]);

  const changeStatus = async (row: EmailRow, action: 'mark_read' | 'resolve' | 'reopen') => {
    setBusyId(row.id);
    try {
      await callAdmin({ action, message_id: row.id });
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar o e-mail.');
    } finally {
      setBusyId(null);
    }
  };

  const openDocument = async (documentId: string) => {
    setBusyId(documentId);
    try {
      const body = await callAdmin({ action: 'view_document', document_id: documentId });
      if (!body.url) throw new Error('Anexo indisponível.');
      window.open(body.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o anexo.');
    } finally {
      setBusyId(null);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const accessToken = await token();
      const response = await fetch('/api/accounting-email-sync', {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) {
        if (body?.error === 'accounting_email_not_configured') {
          throw new Error('A conta Microsoft 365 ainda não foi autorizada no servidor.');
        }
        throw new Error(body?.error || 'Falha ao sincronizar.');
      }
      toast.success(`Sincronizado: ${body?.result?.created_messages || 0} novo(s), ${body?.result?.relevant_messages || 0} relevante(s).`);
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Erro na sincronização.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="no-print fixed bottom-5 left-[292px] z-[45] flex items-center gap-2 rounded-full border border-[#6d28d9] bg-[#100918] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_50px_rgba(0,0,0,.55),0_0_25px_rgba(124,44,255,.18)] transition hover:bg-[#1a0d28]"
      >
        <Mail className="h-5 w-5 text-[#f4b400]" />
        <span>Central de E-mails RH</span>
        {pendingCount > 0 && (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold">
            {pendingCount}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden border-[#38234c] bg-[#05070b] p-0 text-zinc-100">
          <DialogHeader className="border-b border-[#27202d] p-5 pb-4">
            <div className="flex items-center justify-between gap-3 pr-8">
              <div>
                <DialogTitle className="text-xl">Central de E-mails RH</DialogTitle>
                <p className="mt-1 text-xs text-zinc-500">Folha, admissões, rescisões, férias, ponto, atestados e benefícios.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={syncing || !provider.configured}
                  onClick={() => void syncNow()}
                  className="border-[#5b3b76] bg-[#130b1d] text-zinc-200"
                >
                  {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                  Sincronizar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void load()}
                  className="border-[#3b3241] bg-[#0a0d12] text-zinc-300"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="max-h-[78vh] overflow-y-auto p-5">
            <div className={`mb-4 rounded-xl border p-3 ${provider.configured ? 'border-emerald-500/20 bg-emerald-500/[.045]' : 'border-amber-500/20 bg-amber-500/[.045]'}`}>
              <div className="flex items-center gap-3">
                <div className={`grid h-9 w-9 place-items-center rounded-lg ${provider.configured ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">
                    {provider.configured ? 'Microsoft 365 conectado' : 'Microsoft 365 aguardando autorização'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {provider.mailbox || 'adm.matriz@topac.com.br'} · somente leitura
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${provider.configured ? 'border-emerald-500/25 text-emerald-300' : 'border-amber-500/25 text-amber-300'}`}>
                  {provider.configured ? 'ATIVO' : 'PENDENTE'}
                </span>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Metric label="Precisam de atenção" value={pendingCount} icon={AlertTriangle} />
              <Metric label="E-mails RH identificados" value={relevantCount} icon={Mail} />
              <Metric label="Total sincronizado" value={emails.length} icon={CheckCircle2} />
            </div>

            {loading ? (
              <div className="flex justify-center py-16 text-zinc-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : ordered.length === 0 ? (
              <div className="py-16 text-center text-sm text-zinc-500">
                {provider.configured ? 'Nenhum e-mail sincronizado ainda.' : 'A janela está pronta. Falta autorizar a conta Microsoft 365.'}
              </div>
            ) : (
              <div className="space-y-2">
                {ordered.map((row) => {
                  const meta = row.metadata || {};
                  const status = meta.attention_status || (meta.relevante ? 'PENDENTE' : 'IGNORADO');
                  const pending = status === 'PENDENTE';
                  const resolved = status === 'RESOLVIDO';

                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border p-4 ${pending ? 'border-amber-500/25 bg-amber-500/[.035]' : 'border-[#252a33] bg-[#080b10]'}`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${meta.relevante ? 'bg-[#211132] text-[#f4b400]' : 'bg-zinc-900 text-zinc-600'}`}>
                          <Mail className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-zinc-100">{row.assunto || '(sem assunto)'}</span>
                            <span className="rounded-full border border-[#40344b] px-2 py-0.5 text-[10px] font-bold text-zinc-400">{status}</span>
                            {meta.categoria && (
                              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-200">
                                {categoryLabel[meta.categoria] || meta.categoria}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            De: {row.remetente || '—'} · {brDateTime(row.recebido_em)}
                          </div>
                          {meta.body_preview && (
                            <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                              {meta.body_preview}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {meta.empresa_nome && <Tag label="Empresa" value={meta.empresa_nome} />}
                            {meta.funcionario_nome && <Tag label="Funcionário" value={meta.funcionario_nome} />}
                            {meta.competencia && <Tag label="Competência" value={meta.competencia} />}
                          </div>

                          {!!row.documentos?.length && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {row.documentos.map((doc) => (
                                <button
                                  type="button"
                                  key={doc.id}
                                  disabled={busyId === doc.id}
                                  onClick={() => void openDocument(doc.id)}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-[#4a355e] bg-[#100b17] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-violet-500 disabled:opacity-50"
                                >
                                  {busyId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                                  {doc.arquivo_original}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {meta.relevante && (
                          <div className="flex shrink-0 flex-col gap-2">
                            {pending && (
                              <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void changeStatus(row, 'mark_read')}>
                                Marcar lido
                              </Button>
                            )}
                            {!resolved ? (
                              <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void changeStatus(row, 'resolve')} className="border-emerald-500/25 text-emerald-200">
                                Resolver
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void changeStatus(row, 'reopen')} className="border-amber-500/25 text-amber-200">
                                Reabrir
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-[#252a33] bg-[#080b10] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">{label}</span>
        <Icon className="h-4 w-4 text-[#a855f7]" />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-[#31263d] bg-[#0c0c12] px-2 py-1 text-[10px] text-zinc-300">
      {label}: <b>{value}</b>
    </span>
  );
}
