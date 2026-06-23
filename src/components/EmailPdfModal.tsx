import React, { useEffect, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { openEmailClient, sendEmailWithPdfAttachment } from '@/lib/emailUtils';
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

const ATESTADO_TO = [
  'marisa@aatconsultoria.com.br',
  'lucilene@aatconsultoria.com.br',
  'dp@aatconsultoria.com.br',
];
const ATESTADO_CC = ['adm.matriz@topac.com.br', 'robson@topac.com.br'];

const parseEmails = (value: string) => {
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((email) => email.trim().toLowerCase())));
};

const formatEmails = (value?: string[]) => (value || []).join('; ');
const isAtestadoSubject = (value: string) => value.trim().toUpperCase().startsWith('ATESTADO');
const isAdmissionalSubject = (value: string) => value.trim().toLowerCase().startsWith('documentação admissional');

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

const buildAdmissionalBody = (originalBody: string) => {
  const lines = originalBody.split('\n').map((line) => line.trim()).filter(Boolean);
  const intro = lines.find((line) => line.toLowerCase().startsWith('segue ')) || 'Segue documentação admissional do colaborador informado.';
  const admissionDate = lines.find((line) => line.toLowerCase().startsWith('data de admissão') || line.toLowerCase().startsWith('data de admissao'));

  return [
    'Prezados,',
    '',
    intro,
    admissionDate || '',
    '',
    'Solicito, por gentileza, a conferência da documentação enviada e a validação dos dados necessários para continuidade do processo admissional, incluindo:',
    '',
    '- Registro e enquadramento da função;',
    '- Conferência de insalubridade, quando aplicável;',
    '- Liberação e controle de Vale Refeição (VR);',
    '- Entrega, controle e registro dos EPIs obrigatórios;',
    '- Validação de ASO, ficha admissional e demais documentos anexados;',
    '- Atualização dos dados no cadastro do colaborador e nos controles internos da empresa.',
    '',
    'Documentos anexados conforme pré-cadastro realizado na plataforma TopacRH PRO.',
    '',
    'Fico à disposição para qualquer ajuste ou complementação necessária.',
    '',
    'Atenciosamente,',
    '',
    'Rodrigo de Souza Sabino',
    'Administrador da Plataforma TopacRH PRO Multiempresas',
  ].filter((line, index, list) => line !== '' || (index > 0 && list[index - 1] !== '')).join('\n');
};

const downloadAttachmentFallback = (attachment: { attachmentBlob: Blob; attachmentName: string }) => {
  const url = URL.createObjectURL(attachment.attachmentBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.attachmentName || 'anexo.pdf';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
};

const getFriendlyEmailError = (message?: string) => {
  const value = String(message || '').trim();
  if (!value || value === 'email_send_failed') {
    return 'O envio automático pelo servidor não foi concluído.';
  }
  if (value === 'pdf_anexo_vazio') {
    return 'O anexo não foi gerado corretamente.';
  }
  return value;
};

export const EmailPdfModal: React.FC<EmailPdfModalProps> = ({ open, draft, onOpenChange }) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!draft || !open) return;
    const atestado = isAtestadoSubject(draft.subject || '');
    const admissional = isAdmissionalSubject(draft.subject || '');
    setTo(formatEmails(atestado ? ATESTADO_TO : draft.to));
    setCc(formatEmails(atestado ? ATESTADO_CC : draft.cc));
    setSubject(draft.subject || '');
    setBody(atestado ? buildAtestadoBody(draft.body || '') : admissional ? buildAdmissionalBody(draft.body || '') : draft.body || '');
  }, [draft, open]);

  const getPreparedEmail = () => {
    const atestado = isAtestadoSubject(subject);
    const toList = atestado ? [...ATESTADO_TO] : parseEmails(to);
    const ccList = atestado ? [...ATESTADO_CC] : parseEmails(cc);
    const attachments = draft?.attachments?.length
      ? draft.attachments
      : draft?.attachmentBlob && draft?.attachmentName
        ? [{ attachmentBlob: draft.attachmentBlob, attachmentName: draft.attachmentName, documentId: draft.documentId, documentName: draft.documentName }]
        : [];
    return { toList, ccList, attachments };
  };

  const validateEmailDraft = (attachments: { attachmentBlob: Blob; attachmentName: string }[]) => {
    if (!draft) return false;
    const { toList } = getPreparedEmail();
    if (toList.length === 0) {
      toast.error('Informe ao menos um destinatario.');
      return false;
    }
    if (!subject.trim()) {
      toast.error('Informe o assunto do e-mail.');
      return false;
    }
    if (!body.trim()) {
      toast.error('Informe a mensagem do e-mail.');
      return false;
    }
    if (!attachments.length) {
      toast.error('Nenhum anexo foi localizado para o e-mail.');
      return false;
    }
    return true;
  };

  const handleManualSend = (showToast = true) => {
    if (!draft) return false;
    const { toList, ccList, attachments } = getPreparedEmail();
    if (!validateEmailDraft(attachments)) return false;
    openEmailClient({ to: toList, cc: ccList, subject: subject.trim(), body: body.trim() });
    attachments.forEach(downloadAttachmentFallback);
    if (showToast) toast.success('E-mail manual aberto e anexos baixados. Anexe os arquivos baixados antes de enviar.');
    return true;
  };

  const handleSend = async () => {
    if (!draft) return;
    const { toList, ccList, attachments } = getPreparedEmail();
    if (!validateEmailDraft(attachments)) return;

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
      const friendlyMessage = getFriendlyEmailError(error?.message);
      handleManualSend(false);
      toast.warning(`${friendlyMessage} Abri o e-mail manual preenchido e baixei os anexos para envio imediato.`);
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

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button type="button" variant="secondary" onClick={() => handleManualSend(true)} disabled={sending || !draft}>
            <Mail className="mr-2 h-4 w-4" /> Enviar manual
          </Button>
          <Button type="button" onClick={handleSend} disabled={sending || !draft}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Enviar automático
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailPdfModal;
