import React, { useEffect, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendEmailWithPdfAttachment } from '@/lib/emailUtils';
import { toast } from 'sonner';

export type EmailPdfDraft = {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  attachmentBlob: Blob;
  attachmentName: string;
  afterSend?: () => Promise<void> | void;
};

type EmailPdfModalProps = {
  open: boolean;
  draft: EmailPdfDraft | null;
  onOpenChange: (open: boolean) => void;
};

const parseEmails = (value: string) =>
  value
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);

const formatEmails = (value?: string[]) => (value || []).join('; ');

export const EmailPdfModal: React.FC<EmailPdfModalProps> = ({ open, draft, onOpenChange }) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!draft || !open) return;
    setTo(formatEmails(draft.to));
    setCc(formatEmails(draft.cc));
    setSubject(draft.subject || '');
    setBody(draft.body || '');
  }, [draft, open]);

  const handleSend = async () => {
    if (!draft) return;
    const toList = parseEmails(to);
    const ccList = parseEmails(cc);
    if (toList.length === 0) {
      toast.error('Informe ao menos um destinatario.');
      return;
    }
    if (!subject.trim()) {
      toast.error('Informe o assunto do e-mail.');
      return;
    }
    if (!body.trim()) {
      toast.error('Informe a mensagem do e-mail.');
      return;
    }

    setSending(true);
    try {
      await sendEmailWithPdfAttachment({
        to: toList,
        cc: ccList,
        subject: subject.trim(),
        body: body.trim(),
        attachmentBlob: draft.attachmentBlob,
        attachmentName: draft.attachmentName,
      });
      try {
        await draft.afterSend?.();
      } catch (historyError) {
        console.error('E-mail enviado, mas houve erro ao atualizar historico:', historyError);
        toast.warning('E-mail enviado, mas nao foi possivel atualizar o historico automaticamente.');
      }
      toast.success('E-mail enviado com PDF anexado.');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível enviar o e-mail agora.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !sending && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Enviar PDF por e-mail
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Para</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="destinatario@empresa.com.br" />
          </div>
          <div>
            <Label>Cc</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="copia@empresa.com.br" />
          </div>
          <div>
            <Label>Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} />
          </div>
          {draft?.attachmentName && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              Anexo: <span className="font-medium">{draft.attachmentName}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSend} disabled={sending || !draft}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailPdfModal;
