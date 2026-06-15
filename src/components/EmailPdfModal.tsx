import React, { useEffect, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendEmailWithPdfAttachment } from '@/lib/emailUtils';
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

const getSaoPauloHour = () => {
  const hour = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date()).find((part) => part.type === 'hour')?.value;
  return Number(hour || new Date().getHours());
};

const getGreeting = () => {
  const hour = getSaoPauloHour();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

const getBodyField = (body: string, label: string) => {
  const line = body.split('\n').find((item) => item.trim().toLowerCase().startsWith(`${label.toLowerCase()}:`));
  return line?.slice(line.indexOf(':') + 1).trim() || '';
};

const buildAtestadoBody = (originalBody: string) => {
  const funcionario = getBodyField(originalBody, 'Funcionario') || 'colaborador informado';
  const empresa = getBodyField(originalBody, 'Empresa');
  const dataDocumento = getBodyField(originalBody, 'Data do documento');
  const observacao = getBodyField(originalBody, 'Observacao/descricao');
  const referencia = [empresa ? `da empresa ${empresa}` : '', dataDocumento ? `referente ao dia ${dataDocumento}` : '']
    .filter(Boolean)
    .join(', ');

  return [
    `${getGreeting()},`,
    '',
    `Encaminho, em anexo, o atestado médico do(a) colaborador(a) ${funcionario}${referencia ? `, ${referencia}` : ''}.`,
    '',
    observacao && observacao.toLowerCase() !== 'sem observacao/descricao.'
      ? `Observação: ${observacao}.`
      : '',
    observacao && observacao.toLowerCase() !== 'sem observacao/descricao.' ? '' : '',
    'Por gentileza, realizem o devido lançamento e confirmem o recebimento deste e-mail.',
    '',
    'Atenciosamente,',
    'Rodrigo de Souza Sabino',
  ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
};

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
    setBody(draft.subject.trim().toUpperCase().startsWith('ATESTADO')
      ? buildAtestadoBody(draft.body || '')
      : draft.body || '');
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
      toast.error('Nenhum anexo foi localizado para o e-mail.');
      return;
    }

    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      const authUser = session?.user;
      await sendEmailWithPdfAttachment({
        to: toList,
        cc: ccList,
        subject: subject.trim(),
        body: body.trim(),
        attachments,
        senderUserId: draft.senderUserId || authUser?.id,
        senderName: draft.senderName || String(authUser?.user_metadata?.nome_completo || authUser?.email || ''),
        senderEmail: draft.senderEmail || authUser?.email,
        moduleOrigin: draft.moduleOrigin || 'documentos',
        documentId: draft.documentId,
        documentName: draft.documentName || draft.attachmentName || attachments.map((item) => item.documentName || item.attachmentName).join('; '),
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
