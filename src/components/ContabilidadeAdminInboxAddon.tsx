import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Paperclip, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type EmailDoc = { id: string; arquivo_original: string };
type EmailRow = {
  id: string;
  remetente?: string | null;
  assunto?: string | null;
  recebido_em: string;
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
type Provider = { configured: boolean; mailbox?: string; provider?: string };

const labels: Record<string, string> = {
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

export default function ContabilidadeAdminInboxAddon() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [provider, setProvider] = useState<Provider>({ configured: false, mailbox: 'adm.matriz@topac.com.br' });

  const api = useCallback(async (payload: Record<string, unknown>, path = '/api/accounting-email-admin') => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error('Sessão administrativa não encontrada.');
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: path.endsWith('accounting-email-sync') ? undefined : JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) throw new Error(body?.error || 'Falha na Central de E-mails.');
    return body;
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const body = await api({ action: 'list' });
      setEmails(Array.isArray(body.rows) ? body.rows : []);
      if (body.provider) setProvider(body.provider);
    } catch (error: any) {
      if (!silent) toast.error(error?.message || 'Não foi possível carregar os e-mails.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const pending = useMemo(
    () => emails.filter((row) => row.metadata?.relevante === true && row.metadata?.attention_status === 'PENDENTE').length,
    [emails],
  );

  const updateStatus = async (id: string, action: 'mark_read' | 'resolve' | 'reopen') => {
    try {
      await api({ action, message_id: id });
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar.');
    }
  };

  const openDoc = async (id: string) => {
    try {
      const body = await api({ action: 'view_document', document_id: id });
      if (body.url) window.open(body.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o anexo.');
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const body = await api({}, '/api/accounting-email-sync');
      toast.success(`Sincronizado: ${body?.result?.created_messages || 0} novo(s).`);
      await load(true);
    } catch (error: any) {
      toast.error(error?.message === 'accounting_email_not_configured' ? 'Microsoft 365 ainda não autorizado.' : error?.message || 'Falha ao sincronizar.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void load(); }}
        className="no-print fixed bottom-5 left-[292px] z-[45] flex items-center gap-2 rounded-full border border-[#6d28d9] bg-[#100918] px-4 py-3 text-sm font-semibold text-white shadow-lg"
      >
        <Mail className="h-5 w-5 text-[#f4b400]" />
        <span>Central de E-mails RH</span>
        {pending > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold">{pending}</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden border-[#38234c] bg-[#05070b] p-0 text-zinc-100">
          <DialogHeader className="border-b border-[#27202d] p-5">
            <div className="flex items-center justify-between gap-3 pr-8">
              <div>
                <DialogTitle>Central de E-mails RH</DialogTitle>
                <p className="mt-1 text-xs text-zinc-500">Folha, admissões, rescisões, férias, ponto, atestados e benefícios.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!provider.configured || syncing} onClick={() => void sync()}>
                  {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                  Sincronizar
                </Button>
                <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="max-h-[76vh] overflow-y-auto p-5">
            <div className={`mb-4 flex items-center gap-3 rounded-xl border p-3 ${provider.configured ? 'border-emerald-500/25' : 'border-amber-500/25'}`}>
              <ShieldCheck className={`h-5 w-5 ${provider.configured ? 'text-emerald-300' : 'text-amber-300'}`} />
              <div className="flex-1">
                <div className="text-sm font-bold">{provider.configured ? 'Microsoft 365 conectado' : 'Microsoft 365 aguardando autorização'}</div>
                <div className="text-xs text-zinc-500">{provider.mailbox || 'adm.matriz@topac.com.br'} · somente leitura</div>
              </div>
              <span className="text-xs font-bold">{provider.configured ? 'ATIVO' : 'PENDENTE'}</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : emails.length === 0 ? (
              <div className="py-16 text-center text-sm text-zinc-500">Nenhum e-mail sincronizado ainda.</div>
            ) : (
              <div className="space-y-2">
                {emails.map((row) => {
                  const meta = row.metadata || {};
                  const status = meta.attention_status || (meta.relevante ? 'PENDENTE' : 'IGNORADO');
                  return (
                    <div key={row.id} className="rounded-xl border border-[#252a33] bg-[#080b10] p-4">
                      <div className="flex items-start gap-3">
                        <Mail className="mt-1 h-5 w-5 shrink-0 text-[#f4b400]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <b>{row.assunto || '(sem assunto)'}</b>
                            <span className="rounded-full border border-[#40344b] px-2 py-0.5 text-[10px]">{status}</span>
                            {meta.categoria && <span className="rounded-full border border-violet-500/25 px-2 py-0.5 text-[10px] text-violet-200">{labels[meta.categoria] || meta.categoria}</span>}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">{row.remetente || '—'} · {new Date(row.recebido_em).toLocaleString('pt-BR')}</div>
                          {meta.body_preview && <p className="mt-2 line-clamp-2 text-xs text-zinc-400">{meta.body_preview}</p>}
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-zinc-300">
                            {meta.empresa_nome && <span>Empresa: <b>{meta.empresa_nome}</b></span>}
                            {meta.funcionario_nome && <span>Funcionário: <b>{meta.funcionario_nome}</b></span>}
                            {meta.competencia && <span>Competência: <b>{meta.competencia}</b></span>}
                          </div>
                          {!!row.documentos?.length && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {row.documentos.map((doc) => (
                                <button key={doc.id} type="button" onClick={() => void openDoc(doc.id)} className="inline-flex items-center gap-1 rounded-md border border-[#4a355e] px-2 py-1 text-[11px]">
                                  <Paperclip className="h-3 w-3" />{doc.arquivo_original}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {meta.relevante && (
                          <div className="flex shrink-0 flex-col gap-2">
                            {status === 'PENDENTE' && <Button size="sm" variant="outline" onClick={() => void updateStatus(row.id, 'mark_read')}>Lido</Button>}
                            {status !== 'RESOLVIDO'
                              ? <Button size="sm" variant="outline" onClick={() => void updateStatus(row.id, 'resolve')}>Resolver</Button>
                              : <Button size="sm" variant="outline" onClick={() => void updateStatus(row.id, 'reopen')}>Reabrir</Button>}
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
