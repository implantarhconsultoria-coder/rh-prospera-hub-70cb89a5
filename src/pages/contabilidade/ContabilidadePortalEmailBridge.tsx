import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const BRIDGE_EVENT = 'topac:contabilidade-email-review';

type BridgeDetail = {
  portal: 'principal' | 'goiania';
  token: string;
  upload_id: string;
  empresa_id?: string;
  company_name?: string;
  arquivo_nome?: string;
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
  to: string;
  cc: string;
  subject: string;
  body: string;
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
    'Prezados,',
    '',
    `Segue em anexo o retorno da Contabilidade referente a ${typeLabel}.`,
    '',
    detail.company_name ? `Empresa: ${detail.company_name}` : '',
    detail.funcionario_nome ? `Funcionário: ${detail.funcionario_nome}` : '',
    detail.competencia ? `Competência / referência: ${detail.competencia}` : '',
    detail.arquivo_nome ? `Documento: ${detail.arquivo_nome}` : '',
    detail.observacao ? `Observação: ${detail.observacao}` : '',
    '',
    'O PDF segue anexado para conferência e arquivamento no TOPAC RH PRO.',
    '',
    'Atenciosamente,',
    detail.sender_name || 'Contabilidade',
    'Contabilidade',
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

export default function ContabilidadePortalEmailBridge() {
  const [review, setReview] = useState<ReviewState | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const originalFetch = window.fetch;

    const patchedFetch: typeof window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const isAccountingUpload = url.includes('/api/accounting-portal-upload');
      if (!isAccountingUpload || typeof init?.body !== 'string') {
        return originalFetch.call(window, input, init);
      }

      try {
        const payload = JSON.parse(init.body);
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
              detail: {
                ...payload,
                ...data,
                portal: payload.portal,
                token: payload.token,
                file,
              } satisfies BridgeDetail,
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
    };
  }, []);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<BridgeDetail>).detail;
      if (!detail?.upload_id) return;
      setReview({
        ...detail,
        to: formatEmails(detail.email_to),
        cc: formatEmails(detail.email_cc),
        subject: buildSubject(detail),
        body: buildBody(detail),
      });
    };
    window.addEventListener(BRIDGE_EVENT, handle);
    return () => window.removeEventListener(BRIDGE_EVENT, handle);
  }, []);

  const attachmentName = review?.arquivo_nome || review?.file?.name || 'documento.pdf';
  const canSend = useMemo(() => !!review && parseEmails(review.to).length > 0 && review.subject.trim().length > 0 && review.body.trim().length > 0, [review]);

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
    if (review.file) downloadFile(review.file);
    toast.success(review.file ? 'E-mail manual aberto e PDF baixado para anexar.' : 'E-mail manual aberto.');
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
      const response = await fetch('/api/accounting-portal-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_email',
          portal: review.portal,
          token: review.token,
          upload_id: review.upload_id,
          to,
          cc,
          subject: review.subject.trim(),
          body: review.body.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.message || data?.error || 'Não foi possível enviar o e-mail.');
      toast.success('E-mail enviado ao RH com o PDF anexado.');
      setReview(null);
    } catch (error: any) {
      toast.error(error?.message || 'Falha no envio do e-mail. O PDF permanece salvo na plataforma.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!review} onOpenChange={(open) => { if (!open && !sending) setReview(null); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-[#3a2849] bg-[#05080d] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white"><Mail className="h-5 w-5 text-[#a855f7]" /> Enviar anexos por e-mail</DialogTitle>
        </DialogHeader>

        {review && (
          <div className="space-y-3">
            <div><Label className="text-zinc-300">Para</Label><Input value={review.to} onChange={(e) => setReview((old) => old ? { ...old, to: e.target.value } : old)} className="border-[#49335c] bg-white text-slate-900" /></div>
            <div><Label className="text-zinc-300">Cópia (CC)</Label><Input value={review.cc} onChange={(e) => setReview((old) => old ? { ...old, cc: e.target.value } : old)} className="border-[#49335c] bg-white text-slate-900" /></div>
            <div><Label className="text-zinc-300">Assunto</Label><Input value={review.subject} onChange={(e) => setReview((old) => old ? { ...old, subject: e.target.value } : old)} className="border-[#49335c] bg-white text-slate-900" /></div>
            <div><Label className="text-zinc-300">Mensagem</Label><Textarea value={review.body} onChange={(e) => setReview((old) => old ? { ...old, body: e.target.value } : old)} className="min-h-52 border-[#49335c] bg-white text-slate-900" /></div>
            <div className="rounded-md border border-[#49335c] bg-[#090c11] p-3 text-xs">
              <div className="mb-2 font-semibold text-zinc-200">Anexos (1)</div>
              <div className="flex items-center gap-2 text-zinc-300"><FileText className="h-4 w-4 text-[#b85cff]" /> {attachmentName}</div>
              <div className="mt-1 text-[10px] text-zinc-500">O envio pela plataforma anexa o PDF armazenado no TOPAC RH PRO automaticamente.</div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={openManual} disabled={sending} className="border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 hover:text-amber-100">Abrir e-mail manual</Button>
          <Button onClick={() => void sendPlatform()} disabled={sending || !canSend} className="bg-[#6d28d9] text-white hover:bg-[#7c3aed] disabled:bg-[#4c2a73] disabled:text-white">{sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar pela plataforma</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
