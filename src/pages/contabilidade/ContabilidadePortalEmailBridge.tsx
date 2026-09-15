import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const BRIDGE_EVENT = 'topac:contabilidade-email-review';
const REVIEW_RPC = '/rest/v1/rpc/contabilidade_portal_revisar_sessao';

type BridgeDetail = {
  mode?: 'upload' | 'confirmation';
  portal: 'principal' | 'goiania';
  token: string;
  upload_id?: string;
  origem_tipo?: string;
  origem_id?: string;
  empresa_id?: string;
  company_name?: string;
  arquivo_nome?: string;
  attachment_name?: string | null;
  attachment_url?: string | null;
  has_attachment?: boolean;
  tipo_documento?: string;
  type_label?: string;
  competencia?: string | null;
  funcionario_nome?: string | null;
  observacao?: string | null;
  sender_name?: string;
  sender_email?: string;
  email_to?: string[];
  email_cc?: string[];
  file?: File | null;
};

type ReviewState = BridgeDetail & {
  mode: 'upload' | 'confirmation';
  to: string;
  cc: string;
  subject: string;
  body: string;
};

type PendingConfirmation = {
  resolve: (response: Response) => void;
  originalFetch: typeof window.fetch;
  input: RequestInfo | URL;
  init?: RequestInit;
};

const parseEmails = (value: string) => {
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((email) => email.trim().toLowerCase())));
};
const formatEmails = (items?: string[]) => (items || []).join('; ');

const getTypeLabel = (detail: BridgeDetail) => detail.type_label || ({
  recibos_holerites: 'Recibos / Holerites',
  folha_processada: 'Folha processada',
  contrato: 'Contrato de trabalho',
  rescisao: 'Documentos de rescisão',
  ferias: 'Documentos de férias',
  retorno_folha: 'Retorno da contabilidade',
  outro: 'Documento de retorno',
}[String(detail.tipo_documento || '')] || 'Documento de retorno');

const buildSubject = (detail: BridgeDetail) => {
  const parts = ['Retorno da Contabilidade', getTypeLabel(detail), detail.company_name || 'TOPAC'];
  if (detail.funcionario_nome) parts.push(detail.funcionario_nome);
  if (detail.competencia) parts.push(String(detail.competencia));
  return parts.filter(Boolean).join(' - ');
};

const buildBody = (detail: BridgeDetail) => {
  const typeLabel = getTypeLabel(detail);
  return [
    'Prezados,', '',
    `Segue em anexo o retorno da Contabilidade referente a ${typeLabel}.`, '',
    detail.company_name ? `Empresa: ${detail.company_name}` : '',
    detail.funcionario_nome ? `Funcionário: ${detail.funcionario_nome}` : '',
    detail.competencia ? `Competência / referência: ${detail.competencia}` : '',
    detail.arquivo_nome ? `Documento: ${detail.arquivo_nome}` : '',
    detail.observacao ? `Observação: ${detail.observacao}` : '', '',
    'O PDF segue anexado para conferência e arquivamento no TOPAC RH PRO.', '',
    'Atenciosamente,', detail.sender_name || 'Contabilidade', 'Contabilidade',
  ].filter((line, index, list) => line !== '' || (index > 0 && list[index - 1] !== '')).join('\n');
};

const findSelectedPdf = () => {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  for (const input of inputs) {
    const file = input.files?.[0];
    if (file && (/\.pdf$/i.test(file.name) || file.type === 'application/pdf')) return file;
  }
  return null;
};

const downloadFile = (file: File) => {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
};

const cancelledRpcResponse = () => new Response(JSON.stringify({
  code: 'contabilidade_email_cancelado',
  message: 'Confirmação cancelada. O e-mail não foi enviado e a conferência não foi registrada.',
}), { status: 409, headers: { 'content-type': 'application/json' } });

export default function ContabilidadePortalEmailBridge() {
  const [review, setReview] = useState<ReviewState | null>(null);
  const [sending, setSending] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const pendingConfirmation = useRef<PendingConfirmation | null>(null);

  useEffect(() => {
    const originalFetch = window.fetch;

    const patchedFetch: typeof window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const bodyText = typeof init?.body === 'string' ? init.body : '';

      if (url.includes(REVIEW_RPC) && bodyText) {
        try {
          const payload = JSON.parse(bodyText);
          if (payload?.p_status === 'conferido' && payload?.p_token && payload?.p_portal && payload?.p_origem_tipo && payload?.p_origem_id) {
            setPreparing(true);
            const prepareResponse = await originalFetch.call(window, '/api/accounting-review-email-flow', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'prepare',
                portal: payload.p_portal,
                token: payload.p_token,
                origem_tipo: payload.p_origem_tipo,
                origem_id: payload.p_origem_id,
                observacao: payload.p_observacao || null,
              }),
            });
            const prepared = await prepareResponse.json().catch(() => ({}));
            setPreparing(false);
            if (!prepareResponse.ok || !prepared?.ok) {
              const message = prepared?.message || prepared?.error || 'Não foi possível preparar o e-mail da conferência.';
              toast.error(message);
              return new Response(JSON.stringify({ code: 'email_prepare_failed', message }), {
                status: prepareResponse.status || 500,
                headers: { 'content-type': 'application/json' },
              });
            }

            setReview({
              mode: 'confirmation',
              portal: payload.p_portal,
              token: payload.p_token,
              origem_tipo: payload.p_origem_tipo,
              origem_id: payload.p_origem_id,
              observacao: payload.p_observacao || null,
              attachment_name: prepared.attachment_name || null,
              attachment_url: prepared.attachment_url || null,
              has_attachment: prepared.has_attachment === true,
              sender_name: prepared.sender_name || 'Contabilidade',
              to: formatEmails(prepared.to),
              cc: formatEmails(prepared.cc),
              subject: String(prepared.subject || ''),
              body: String(prepared.body || ''),
            });

            return await new Promise<Response>((resolve) => {
              pendingConfirmation.current = { resolve, originalFetch, input, init };
            });
          }
        } catch (error) {
          setPreparing(false);
          console.error('[contabilidade-email-bridge] falha ao preparar confirmação', error);
        }
      }

      const isAccountingUpload = url.includes('/api/accounting-portal-upload');
      if (!isAccountingUpload || !bodyText) return originalFetch.call(window, input, init);

      try {
        const payload = JSON.parse(bodyText);
        if (payload?.action !== 'finalize') return originalFetch.call(window, input, init);
        const file = findSelectedPdf();
        const response = await originalFetch.call(window, input, {
          ...init,
          body: JSON.stringify({ ...payload, defer_email: true }),
        });
        if (response.ok) {
          const data = await response.clone().json().catch(() => null);
          if (data?.ok && data?.upload_id) {
            window.dispatchEvent(new CustomEvent(BRIDGE_EVENT, {
              detail: { ...payload, ...data, portal: payload.portal, token: payload.token, file } satisfies BridgeDetail,
            }));
          }
        }
        return response;
      } catch {
        return originalFetch.call(window, input, init);
      }
    };

    window.fetch = patchedFetch;
    return () => {
      if (window.fetch === patchedFetch) window.fetch = originalFetch;
      if (pendingConfirmation.current) {
        pendingConfirmation.current.resolve(cancelledRpcResponse());
        pendingConfirmation.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<BridgeDetail>).detail;
      if (!detail?.upload_id) return;
      setReview({
        ...detail,
        mode: 'upload',
        to: formatEmails(detail.email_to),
        cc: formatEmails(detail.email_cc),
        subject: buildSubject(detail),
        body: buildBody(detail),
      });
    };
    window.addEventListener(BRIDGE_EVENT, handle);
    return () => window.removeEventListener(BRIDGE_EVENT, handle);
  }, []);

  useEffect(() => {
    let employeeCard: HTMLElement | null = null;
    let handler: (() => void) | null = null;
    let keyboard: ((event: KeyboardEvent) => void) | null = null;

    const enhance = () => {
      if (employeeCard) return;
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('main section > div, main section > button'));
      const target = candidates.find((el) => (el.textContent || '').includes('Funcionários ativos') && /^\s*\d+\s*Funcionários ativos/i.test((el.textContent || '').replace(/\s+/g, ' ').trim()));
      if (!target || target.tagName === 'BUTTON') return;
      employeeCard = target;
      target.setAttribute('role', 'button');
      target.setAttribute('tabindex', '0');
      target.setAttribute('title', 'Clique para acessar as empresas e funcionários ativos');
      target.classList.add('cursor-pointer', 'transition', 'hover:border-[#7c2cff]');
      handler = () => {
        const headings = Array.from(document.querySelectorAll<HTMLElement>('h2'));
        const heading = headings.find((el) => el.textContent?.trim() === 'Empresas');
        const section = heading?.closest('section');
        const companyButtons = section ? Array.from(section.querySelectorAll<HTMLButtonElement>('button')) : [];
        if (companyButtons.length === 1) companyButtons[0].click();
        else section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      keyboard = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handler?.();
        }
      };
      target.addEventListener('click', handler);
      target.addEventListener('keydown', keyboard);
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (employeeCard && handler) employeeCard.removeEventListener('click', handler);
      if (employeeCard && keyboard) employeeCard.removeEventListener('keydown', keyboard);
    };
  }, []);

  const attachmentName = review?.mode === 'confirmation'
    ? review.attachment_name || ''
    : review?.arquivo_nome || review?.file?.name || 'documento.pdf';
  const attachmentCount = review ? (review.mode === 'confirmation' ? (review.has_attachment ? 1 : 0) : 1) : 0;
  const canSend = useMemo(() => !!review && parseEmails(review.to).length > 0 && review.subject.trim().length > 0 && review.body.trim().length > 0, [review]);

  const cancelReview = () => {
    if (sending) return;
    if (review?.mode === 'confirmation' && pendingConfirmation.current) {
      pendingConfirmation.current.resolve(cancelledRpcResponse());
      pendingConfirmation.current = null;
      toast.info('Confirmação cancelada. Nada foi enviado.');
    }
    setReview(null);
  };

  const openManual = () => {
    if (!review) return;
    const to = parseEmails(review.to);
    const cc = parseEmails(review.cc);
    if (!to.length) return toast.error('Informe ao menos um destinatário.');
    const params = new URLSearchParams();
    if (cc.length) params.set('cc', cc.join(','));
    params.set('subject', review.subject.trim());
    params.set('body', review.body.trim());
    window.location.href = `mailto:${to.join(',')}?${params.toString()}`;
    if (review.mode === 'upload' && review.file) downloadFile(review.file);
    if (review.mode === 'confirmation' && review.attachment_url) window.open(review.attachment_url, '_blank', 'noopener,noreferrer');
    toast.success(attachmentCount ? 'E-mail manual aberto. O documento também foi aberto para anexar.' : 'E-mail manual aberto.');
  };

  const sendPlatform = async () => {
    if (!review) return;
    const to = parseEmails(review.to);
    const cc = parseEmails(review.cc);
    if (!to.length) return toast.error('Informe ao menos um destinatário.');
    if (!review.subject.trim()) return toast.error('Informe o assunto.');
    if (!review.body.trim()) return toast.error('Informe a mensagem.');

    setSending(true);
    try {
      if (review.mode === 'confirmation') {
        const pending = pendingConfirmation.current;
        if (!pending || !review.origem_tipo || !review.origem_id) throw new Error('A confirmação perdeu a referência do movimento. Abra o item novamente.');
        const response = await fetch('/api/accounting-review-email-flow', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send', portal: review.portal, token: review.token,
            origem_tipo: review.origem_tipo, origem_id: review.origem_id,
            observacao: review.observacao || null, to, cc,
            subject: review.subject.trim(), body: review.body.trim(),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.message || data?.error || 'Não foi possível enviar o e-mail.');

        const rpcResponse = await pending.originalFetch.call(window, pending.input, pending.init);
        pending.resolve(rpcResponse);
        pendingConfirmation.current = null;
        setReview(null);
        toast.success(data.attached ? 'E-mail enviado com o documento. Registrando conferência...' : 'E-mail enviado. Registrando conferência...');
        return;
      }

      const response = await fetch('/api/accounting-portal-upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_email', portal: review.portal, token: review.token,
          upload_id: review.upload_id, to, cc,
          subject: review.subject.trim(), body: review.body.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.message || data?.error || 'Não foi possível enviar o e-mail.');
      toast.success('E-mail enviado ao RH com o PDF anexado.');
      setReview(null);
    } catch (error: any) {
      toast.error(error?.message || 'Falha no envio do e-mail. O registro permanece disponível na plataforma.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {preparing && <div className="fixed inset-x-0 top-0 z-[100] flex justify-center p-2 pointer-events-none"><div className="flex items-center gap-2 rounded-full border border-violet-500/30 bg-[#0b0711]/95 px-4 py-2 text-xs font-semibold text-violet-100 shadow-xl"><Loader2 className="h-4 w-4 animate-spin" />Preparando e-mail da conferência...</div></div>}
      <Dialog open={!!review} onOpenChange={(open) => { if (!open) cancelReview(); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-[#3a2849] bg-[#05080d] text-zinc-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white"><Mail className="h-5 w-5 text-[#a855f7]" /> {review?.mode === 'confirmation' ? 'Confirmar e enviar e-mail ao RH' : 'Enviar anexos por e-mail'}</DialogTitle>
          </DialogHeader>

          {review && (
            <div className="space-y-3">
              {review.mode === 'confirmation' && <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[.05] p-3 text-xs text-emerald-200">Mesmo fluxo do fechamento: revise o e-mail pronto abaixo. A conferência só será registrada depois que o envio for concluído.</div>}
              <div><Label className="text-zinc-300">Para</Label><Input value={review.to} onChange={(e) => setReview((old) => old ? { ...old, to: e.target.value } : old)} className="border-[#49335c] bg-white text-slate-900" /></div>
              <div><Label className="text-zinc-300">Cópia (CC)</Label><Input value={review.cc} onChange={(e) => setReview((old) => old ? { ...old, cc: e.target.value } : old)} className="border-[#49335c] bg-white text-slate-900" /></div>
              <div><Label className="text-zinc-300">Assunto</Label><Input value={review.subject} onChange={(e) => setReview((old) => old ? { ...old, subject: e.target.value } : old)} className="border-[#49335c] bg-white text-slate-900" /></div>
              <div><Label className="text-zinc-300">Mensagem</Label><Textarea value={review.body} onChange={(e) => setReview((old) => old ? { ...old, body: e.target.value } : old)} className="min-h-52 border-[#49335c] bg-white text-slate-900" /></div>
              <div className="rounded-md border border-[#49335c] bg-[#090c11] p-3 text-xs">
                <div className="mb-2 font-semibold text-zinc-200">Anexos ({attachmentCount})</div>
                {attachmentCount ? <div className="flex items-center gap-2 text-zinc-300"><FileText className="h-4 w-4 text-[#b85cff]" /> {attachmentName || 'Documento compartilhado'}</div> : <div className="text-zinc-500">Este movimento não possui arquivo anexado. O e-mail será enviado com as informações do registro.</div>}
                <div className="mt-1 text-[10px] text-zinc-500">Quando houver documento, o envio pela plataforma anexa o arquivo armazenado no TOPAC RH PRO automaticamente.</div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={openManual} disabled={sending} className="border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 hover:text-amber-100">Abrir e-mail manual</Button>
            <Button onClick={() => void sendPlatform()} disabled={sending || !canSend} className="bg-[#6d28d9] text-white hover:bg-[#7c3aed] disabled:bg-[#4c2a73] disabled:text-white">{sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{review?.mode === 'confirmation' ? 'Confirmar e enviar' : 'Enviar pela plataforma'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
