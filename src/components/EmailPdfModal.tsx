import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { applyTopacEmailPolicy } from '@/lib/emailPolicy';
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
  checklistItems?: { label: string; found: boolean; required?: boolean; detail?: string }[];
  missingWarnings?: string[];
  senderUserId?: string;
  senderName?: string;
  senderEmail?: string;
  moduleOrigin?: string;
  documentId?: string;
  documentName?: string;
  afterSend?: () => Promise<void> | void;
};

type EmailAttachment = NonNullable<EmailPdfDraft['attachments']>[number];
type EmailPdfModalProps = { open: boolean; draft: EmailPdfDraft | null; onOpenChange: (open: boolean) => void };

const ATESTADO_TO = ['marisa@aatconsultoria.com.br', 'lucilene@aatconsultoria.com.br', 'dp@aatconsultoria.com.br'];
const ATESTADO_CC = ['adm.matriz@topac.com.br', 'robson@topac.com.br'];

const parseEmails = (value: string) => {
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((email) => email.trim().toLowerCase())));
};
const formatEmails = (value?: readonly string[]) => (value || []).join('; ');
const isAtestadoSubject = (value: string) => value.trim().toUpperCase().startsWith('ATESTADO');
const isAdmissionalSubject = (value: string) => value.trim().toLowerCase().startsWith('documentação admissional');

const normalizeText = (value?: string) => String(value || '')
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/^\d{10,}-/, '').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();

const attachmentCategory = (attachment: EmailAttachment) => {
  const text = normalizeText(`${attachment.label || ''} ${attachment.documentName || ''} ${attachment.attachmentName || ''}`);
  if (text.includes('aso') || text.includes('guia aso')) return 'aso';
  if (text.includes('dados cadastrais') || text.includes('ficha de solicitacao')) return 'dados-cadastrais';
  if (text.includes('ctps') || text.includes('contrato digital')) return 'ctps-contrato-digital';
  return '';
};

const dedupeAttachments = (attachments: EmailAttachment[] = []) => {
  const output: EmailAttachment[] = [];
  const keys = new Set<string>();
  attachments.forEach((attachment) => {
    if (!attachment?.attachmentBlob || !attachment.attachmentName) return;
    const category = attachmentCategory(attachment);
    const name = normalizeText(attachment.attachmentName || attachment.documentName || 'anexo');
    const key = category || `${name}:${attachment.attachmentBlob.size || 0}`;
    if (keys.has(key)) return;
    keys.add(key);
    output.push(attachment);
  });
  return output;
};

const getSaoPauloHour = () => Number(new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false,
}).formatToParts(new Date()).find((part) => part.type === 'hour')?.value || new Date().getHours());
const getGreeting = () => getSaoPauloHour() < 12 ? 'Bom dia' : getSaoPauloHour() < 18 ? 'Boa tarde' : 'Boa noite';
const getBodyField = (body: string, label: string) => body.split('\n')
  .find((item) => item.trim().toLowerCase().startsWith(`${label.toLowerCase()}:`))
  ?.split(':').slice(1).join(':').trim() || '';

const buildAtestadoBody = (originalBody: string) => {
  const funcionario = getBodyField(originalBody, 'Funcionario') || 'colaborador informado';
  const empresa = getBodyField(originalBody, 'Empresa');
  const dataDocumento = getBodyField(originalBody, 'Data do documento');
  const observacao = getBodyField(originalBody, 'Observacao/descricao');
  const referencia = [empresa ? `da empresa ${empresa}` : '', dataDocumento ? `referente ao dia ${dataDocumento}` : ''].filter(Boolean).join(', ');
  return [
    `${getGreeting()},`, '',
    `Encaminho, em anexo, o atestado médico do(a) colaborador(a) ${funcionario}${referencia ? `, ${referencia}` : ''}.`, '',
    observacao && observacao.toLowerCase() !== 'sem observacao/descricao.' ? `Observação: ${observacao}.` : '',
    observacao && observacao.toLowerCase() !== 'sem observacao/descricao.' ? '' : '',
    'Por gentileza, realizem o devido lançamento e confirmem o recebimento deste e-mail.', '',
    'Atenciosamente,', 'Rodrigo de Souza Sabino',
  ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
};

const buildAdmissionalBody = (originalBody: string) => {
  const lines = originalBody.split('\n').map((line) => line.trim()).filter(Boolean);
  const intro = lines.find((line) => line.toLowerCase().startsWith('segue ')) || 'Segue documentação admissional do colaborador informado.';
  const admissionDate = lines.find((line) => /^data de admiss[aã]o/i.test(line));
  return [
    'Prezados,', '', intro, admissionDate || '', '',
    'Solicito, por gentileza, a conferência da documentação enviada e a validação dos dados necessários para continuidade do processo admissional.', '',
    'Documentos anexados conforme pré-cadastro realizado na plataforma Topac RH PRO.', '',
    'Atenciosamente,', 'Rodrigo de Souza Sabino', 'Administrador da Plataforma Topac RH PRO Multiempresas',
  ].filter((line, index, list) => line !== '' || (index > 0 && list[index - 1] !== '')).join('\n');
};

const downloadAttachmentFallback = (attachment: { attachmentBlob: Blob; attachmentName: string }) => {
  const url = URL.createObjectURL(attachment.attachmentBlob);
  const link = document.createElement('a');
  link.href = url; link.download = attachment.attachmentName || 'anexo'; link.rel = 'noopener noreferrer';
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
};

const getFriendlyEmailError = (message?: string) => {
  const value = String(message || '').trim();
  if (!value || value === 'email_send_failed') return 'O envio automático pelo servidor não foi concluído.';
  if (value === 'pdf_anexo_vazio') return 'O anexo não foi gerado corretamente.';
  return value;
};

export const EmailPdfModal: React.FC<EmailPdfModalProps> = ({ open, draft, onOpenChange }) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const preparedAttachments = useMemo(() => {
    const source = draft?.attachments?.length
      ? draft.attachments
      : draft?.attachmentBlob && draft?.attachmentName
        ? [{ attachmentBlob: draft.attachmentBlob, attachmentName: draft.attachmentName, documentId: draft.documentId, documentName: draft.documentName }]
        : [];
    return dedupeAttachments(source);
  }, [draft]);

  const applyPolicy = (bodyValue: string, ccValues: readonly string[]) => applyTopacEmailPolicy({
    subject: draft?.subject || subject,
    body: bodyValue,
    cc: ccValues,
    moduleOrigin: draft?.moduleOrigin,
    attachmentNames: preparedAttachments.map((item) => item.attachmentName),
    attachmentContentTypes: preparedAttachments.map((item) => item.attachmentContentType || item.attachmentBlob.type),
  });

  useEffect(() => {
    if (!draft || !open) return;
    const atestado = isAtestadoSubject(draft.subject || '');
    const admissional = isAdmissionalSubject(draft.subject || '');
    const baseBody = atestado ? buildAtestadoBody(draft.body || '') : admissional ? buildAdmissionalBody(draft.body || '') : draft.body || '';
    const baseCc = atestado ? ATESTADO_CC : draft.cc || [];
    const policy = applyTopacEmailPolicy({
      subject: draft.subject,
      body: baseBody,
      cc: baseCc,
      moduleOrigin: draft.moduleOrigin,
      attachmentNames: preparedAttachments.map((item) => item.attachmentName),
      attachmentContentTypes: preparedAttachments.map((item) => item.attachmentContentType || item.attachmentBlob.type),
    });
    setTo(formatEmails(atestado ? ATESTADO_TO : draft.to));
    setCc(formatEmails(policy.cc));
    setSubject(draft.subject || '');
    setBody(policy.body);
  }, [draft, open, preparedAttachments]);

  const getPreparedEmail = () => {
    const atestado = isAtestadoSubject(subject);
    const toList = atestado ? [...ATESTADO_TO] : parseEmails(to);
    const inputCc = atestado ? [...ATESTADO_CC] : parseEmails(cc);
    const policy = applyPolicy(body, inputCc);
    return { toList, ccList: policy.cc, preparedBody: policy.body, attachments: preparedAttachments };
  };

  const validate = (attachments: EmailAttachment[]) => {
    const { toList } = getPreparedEmail();
    if (!toList.length) { toast.error('Informe ao menos um destinatário.'); return false; }
    if (!subject.trim()) { toast.error('Informe o assunto do e-mail.'); return false; }
    if (!body.trim()) { toast.error('Informe a mensagem do e-mail.'); return false; }
    if (!attachments.length) { toast.error('Nenhum anexo foi localizado para o e-mail.'); return false; }
    return true;
  };

  const handleManualSend = (showToast = true) => {
    if (!draft) return false;
    const { toList, ccList, preparedBody, attachments } = getPreparedEmail();
    if (!validate(attachments)) return false;
    openEmailClient({
      to: toList, cc: ccList, subject: subject.trim(), body: preparedBody,
      moduleOrigin: draft.moduleOrigin,
      attachmentNames: attachments.map((item) => item.attachmentName),
      attachmentContentTypes: attachments.map((item) => item.attachmentContentType || item.attachmentBlob.type),
    });
    attachments.forEach(downloadAttachmentFallback);
    if (showToast) toast.success('E-mail manual aberto e anexos baixados. Anexe os arquivos antes de enviar.');
    return true;
  };

  const handleSend = async () => {
    if (!draft) return;
    const { toList, ccList, preparedBody, attachments } = getPreparedEmail();
    if (!validate(attachments)) return;
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      const authUser = session?.user;
      await sendEmailWithPdfAttachment({
        to: toList,
        cc: ccList,
        subject: subject.trim(),
        body: preparedBody,
        attachments,
        senderUserId: draft.senderUserId || authUser?.id,
        senderName: draft.senderName || String(authUser?.user_metadata?.nome_completo || authUser?.email || ''),
        senderEmail: draft.senderEmail || authUser?.email,
        moduleOrigin: draft.moduleOrigin || 'documentos',
        documentId: draft.documentId,
        documentName: draft.documentName || draft.attachmentName || attachments.map((item) => item.documentName || item.attachmentName).join('; '),
        authToken: session?.access_token,
      });
      try { await draft.afterSend?.(); } catch (historyError) {
        console.error('E-mail enviado, mas houve erro ao atualizar histórico:', historyError);
        toast.warning('E-mail enviado, mas o histórico não foi atualizado automaticamente.');
      }
      toast.success('E-mail enviado com anexos.');
      onOpenChange(false);
    } catch (error: any) {
      const friendlyMessage = getFriendlyEmailError(error?.message);
      handleManualSend(false);
      toast.warning(`${friendlyMessage} O e-mail manual foi aberto e os anexos foram baixados.`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !sending && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Enviar anexos por e-mail</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Para</Label><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="destinatario@empresa.com.br" /></div>
          <div><Label>Cópia (CC)</Label><Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="copia@empresa.com.br" /></div>
          <div><Label>Assunto</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div><Label>Mensagem</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-52" /></div>

          {!!draft?.missingWarnings?.length && <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800"><div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Atenção</div>{draft.missingWarnings.map((warning) => <div key={warning}>• {warning}</div>)}</div>}
          {!!draft?.checklistItems?.length && <div className="space-y-1 rounded-md border p-3 text-xs">{draft.checklistItems.map((item) => <div key={item.label} className="flex items-start gap-2">{item.found ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />}<div><div>{item.label}</div>{item.detail && <div className="text-muted-foreground">{item.detail}</div>}</div></div>)}</div>}
          <div className="space-y-1 rounded-md border p-3 text-xs"><div className="mb-1 font-semibold">Anexos ({preparedAttachments.length})</div>{preparedAttachments.map((attachment) => <div key={`${attachment.attachmentName}-${attachment.attachmentBlob.size}`} className="flex items-center gap-2"><FileText className="h-4 w-4" /> {attachment.attachmentName}</div>)}</div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0"><Button variant="outline" onClick={() => handleManualSend()} disabled={sending}>Abrir e-mail manual</Button><Button onClick={handleSend} disabled={sending}>{sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enviar pela plataforma</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailPdfModal;
