import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendEmailWithPdfAttachment } from '@/lib/emailUtils';
import { getLoggedUserSignature, replaceEmailSignature } from '@/lib/userSignature';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type EmailPdfDraft = {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  attachmentBlob?: Blob;
  attachmentName?: string;
  attachments?: {
    attachmentBlob: Blob;
    attachmentName: string;
    attachmentContentType?: string;
    documentId?: string;
    documentName?: string;
    label?: string;
  }[];
  checklistItems?: {
    label: string;
    found: boolean;
    required?: boolean;
    detail?: string;
  }[];
  missingWarnings?: string[];
  senderUserId?: string;
  senderName?: string;
  senderEmail?: string;
  moduleOrigin?: string;
  documentId?: string;
  documentName?: string;
  afterSend?: () => Promise<void> | void;
  onOpenMissingDocuments?: () => void;
};

type EmailPdfModalProps = {
  open: boolean;
  draft: EmailPdfDraft | null;
  onOpenChange: (open: boolean) => void;
};

const parseEmails = (value: string) => {
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((email) => email.trim().toLowerCase())));
};

const formatEmails = (value?: string[]) => (value || []).join('; ');

export const EmailPdfModal: React.FC<EmailPdfModalProps> = ({ open, draft, onOpenChange }) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!draft || !open) return;
    let active = true;
    setTo(formatEmails(draft.to));
    setCc(formatEmails(draft.cc));
    setSubject(draft.subject || '');
    setBody(draft.body || '');
    getLoggedUserSignature()
      .then((signature) => {
        if (active) setBody(replaceEmailSignature(draft.body || '', signature.text));
      })
      .catch((error) => {
        console.warn('Nao foi possivel aplicar assinatura do usuario logado:', error);
      });
    return () => {
      active = false;
    };
  }, [draft, open]);

  const handleSend = async () => {
    if (!draft) return;
    const toList = parseEmails(to);
    const ccList = parseEmails(cc);
    const attachments = draft.attachments?.length
      ? draft.attachments
      : draft.attachmentBlob && draft.attachmentName
        ? [{ attachmentBlob: draft.attachmentBlob, attachmentName: draft.attachmentName, documentId: draft.documentId, documentName: draft.documentName }]
        : [];
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
    if (!attachments.length) {
      toast.error('Nenhum PDF foi localizado para anexar ao e-mail.');
      return;
    }

    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      const authUser = session?.user;
      const signature = await getLoggedUserSignature();
      const signedBody = replaceEmailSignature(body.trim(), signature.text);
      await sendEmailWithPdfAttachment({
        to: toList,
        cc: ccList,
        subject: subject.trim(),
        body: signedBody,
        attachments,
        senderUserId: draft.senderUserId || authUser?.id,
        senderName: signature.name || String(authUser?.user_metadata?.nome_completo || authUser?.email || ''),
        senderEmail: draft.senderEmail || signature.email || authUser?.email,
        moduleOrigin: draft.moduleOrigin || 'documentos',
        documentId: draft.documentId,
        documentName: draft.documentName || draft.attachmentName,
        authToken: session?.access_token,
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
          {draft?.checklistItems?.length ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-3 text-sm">
              <p className="mb-2 font-medium">Documentos que serao enviados:</p>
              <div className="space-y-1">
                {draft.checklistItems.map((item) => (
                  <div key={item.label} className={item.found ? 'flex items-start gap-2 text-foreground' : 'flex items-start gap-2 text-amber-700'}>
                    {item.found ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />}
                    <div>
                      <span>{item.found ? 'OK' : 'Atencao'} {item.label}</span>
                      {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {draft.missingWarnings?.length ? (
                <div className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {draft.missingWarnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              ) : null}
              {draft.onOpenMissingDocuments && draft.missingWarnings?.length ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={draft.onOpenMissingDocuments}
                  disabled={sending}
                >
                  Abrir documentos faltantes
                </Button>
              ) : null}
            </div>
          ) : null}
          {draft?.attachmentName && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              Anexo: <span className="font-medium">{draft.attachmentName}</span>
            </div>
          )}
          {draft?.attachments?.length ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <p className="mb-1 font-medium">Anexos ({draft.attachments.length}):</p>
              <ul className="space-y-1">
                {draft.attachments.map((attachment) => (
                  <li key={`${attachment.attachmentName}-${attachment.documentId || attachment.label || ''}`} className="text-xs text-muted-foreground">
                    {attachment.label ? `${attachment.label}: ` : ''}<span className="font-medium text-foreground">{attachment.attachmentName}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
