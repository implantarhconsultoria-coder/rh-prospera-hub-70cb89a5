import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Loader2, MessageCircle, RefreshCw, Send, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

type InviteRow = {
  id: string;
  nome: string;
  celular: string;
  whatsapp: string;
  public_token: string;
  url: string;
  status: string;
  created_at?: string | null;
};

const digits = (value: string) => value.replace(/\D/g, '');
const normalizePhoneInput = (value: string) => {
  let number = digits(value);
  if ((number.length === 12 || number.length === 13) && number.startsWith('55')) number = number.slice(2);
  return number;
};

const formatPhone = (value: string) => {
  const number = normalizePhoneInput(value);
  if (number.length === 11) return `(${number.slice(0, 2)}) ${number.slice(2, 7)}-${number.slice(7)}`;
  if (number.length === 10) return `(${number.slice(0, 2)}) ${number.slice(2, 6)}-${number.slice(6)}`;
  return value;
};

const whatsappMessage = (row: InviteRow) => [
  `Olá, ${row.nome}.`,
  '',
  'Você recebeu um link da TOPAC para preencher seus dados e documentos para continuidade do processo.',
  '',
  'Acesse pelo link abaixo:',
  '',
  row.url,
  '',
  'Preencha todas as informações solicitadas e envie os documentos diretamente pela plataforma.',
].join('\n');

const badgeClass = (status: string) => {
  if (status === 'CONCLUÍDO') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (status === 'EM ANÁLISE' || status === 'DOCUMENTOS ENVIADOS' || status === 'PREENCHIDO') return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
  if (status === 'LINK ACESSADO' || status === 'PREENCHIMENTO INICIADO' || status === 'AGUARDANDO FINALIZAÇÃO') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-primary/30 bg-primary/10 text-primary';
};

const PreCadastroConvite: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [celular, setCelular] = useState('');
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [duplicate, setDuplicate] = useState<InviteRow | null>(null);

  const validPhone = useMemo(() => {
    const value = normalizePhoneInput(celular);
    return value.length === 10 || value.length === 11;
  }, [celular]);

  const accessToken = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sessão administrativa não encontrada. Entre novamente no sistema.');
    return token;
  };

  const api = async (body: Record<string, unknown>) => {
    const token = await accessToken();
    const response = await fetch('/api/pre-cadastro-convite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Falha ao processar o convite.');
    return data;
  };

  const carregar = async () => {
    setListLoading(true);
    try {
      const data = await api({ action: 'list' });
      setRows(data.rows || []);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar os convites.');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (open) void carregar();
  }, [open]);

  const copiar = async (row: InviteRow) => {
    try {
      await navigator.clipboard.writeText(row.url);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar o link neste navegador.');
    }
  };

  const abrirWhatsApp = async (row: InviteRow) => {
    const phone = digits(row.whatsapp);
    if (phone.length < 12) return toast.error('Celular inválido para WhatsApp.');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage(row))}`;
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) return toast.error('O navegador bloqueou a abertura do WhatsApp. Libere pop-ups e tente novamente.');
    try {
      const data = await api({ action: 'mark-sent', id: row.id });
      if (data?.candidate) {
        setRows(current => current.map(item => item.id === row.id ? data.candidate : item));
        if (duplicate?.id === row.id) setDuplicate(data.candidate);
      }
    } catch (error) {
      console.warn('[pre-cadastro-convite-mark-sent]', error);
    }
  };

  const gerar = async () => {
    const nomeLimpo = nome.replace(/\s+/g, ' ').trim();
    if (nomeLimpo.length < 2) return toast.error('Informe o nome do candidato.');
    if (!validPhone) return toast.error('Informe um celular válido com DDD.');
    setLoading(true);
    setDuplicate(null);
    try {
      const data = await api({ action: 'invite', nome: nomeLimpo, celular });
      if (data.duplicate) {
        setDuplicate(data.existing);
        toast.warning('Já existe um pré-cadastro aberto para este número.');
        return;
      }
      const row: InviteRow = data.candidate;
      setRows(current => [row, ...current.filter(item => item.id !== row.id)]);
      setNome('');
      setCelular('');
      toast.success('Link individual gerado. Abrindo WhatsApp.');
      await abrirWhatsApp(row);
    } catch (error: any) {
      const message = String(error?.message || '');
      toast.error(message === 'celular_invalido' ? 'Celular inválido. Informe DDD + número.' : message === 'nome_candidato_obrigatorio' ? 'Informe o nome do candidato.' : message || 'Não foi possível gerar o convite.');
    } finally {
      setLoading(false);
    }
  };

  const abrirCadastro = (row: InviteRow) => {
    const url = new URL(window.location.href);
    url.searchParams.set('pre', row.id);
    window.location.href = url.toString();
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="shadow-sm">
        <UserPlus className="mr-2 h-4 w-4" />Enviar link para candidato
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enviar link para candidato</DialogTitle>
          </DialogHeader>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="mb-4 text-sm text-muted-foreground">Informe somente nome e celular. O candidato preencherá os demais dados pelo link individual.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome do candidato</span>
                <Input value={nome} onChange={event => setNome(event.target.value)} placeholder="Nome do candidato" autoComplete="off" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Celular / WhatsApp</span>
                <Input value={celular} onChange={event => setCelular(event.target.value)} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="off" />
              </label>
            </div>
            <Button type="button" className="mt-4 w-full sm:w-auto" onClick={() => void gerar()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Gerar e enviar link
            </Button>
          </div>

          {duplicate && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="font-semibold">Já existe um pré-cadastro aberto para este número.</div>
              <div className="mt-1 text-sm text-muted-foreground">{duplicate.nome} • {formatPhone(duplicate.celular)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => abrirCadastro(duplicate)}><ExternalLink className="mr-2 h-4 w-4" />Abrir cadastro</Button>
                <Button type="button" size="sm" onClick={() => void abrirWhatsApp(duplicate)}><MessageCircle className="mr-2 h-4 w-4" />Reenviar link</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void copiar(duplicate)}><Copy className="mr-2 h-4 w-4" />Copiar link</Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div><div className="font-semibold">Convites recentes</div><div className="text-xs text-muted-foreground">Status do preenchimento e ações rápidas.</div></div>
              <Button type="button" size="sm" variant="outline" onClick={() => void carregar()} disabled={listLoading}><RefreshCw className={`mr-2 h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />Atualizar</Button>
            </div>
            {rows.map(row => (
              <div key={row.id} className="rounded-xl border bg-background p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><div className="font-semibold">{row.nome || 'Candidato'}</div><div className="text-xs text-muted-foreground">{formatPhone(row.celular)}</div></div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${badgeClass(row.status)}`}>{row.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => abrirCadastro(row)}><ExternalLink className="mr-2 h-4 w-4" />Abrir cadastro</Button>
                  <Button type="button" size="sm" onClick={() => void abrirWhatsApp(row)}><MessageCircle className="mr-2 h-4 w-4" />Reenviar link</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void copiar(row)}><Copy className="mr-2 h-4 w-4" />Copiar link</Button>
                </div>
              </div>
            ))}
            {!listLoading && rows.length === 0 && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhum convite gerado por este fluxo ainda.</div>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PreCadastroConvite;
