/**
 * Abre o cliente de e-mail padrao (Outlook etc.) com campos preenchidos.
 */
import { applyLoggedUserSignatureToBody } from '@/lib/userSignature';

export interface EmailParams {
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  body: string;
  senderUserId?: string;
  senderName?: string;
  senderEmail?: string;
  moduleOrigin?: string;
  documentId?: string;
  documentName?: string;
  authToken?: string;
}

export interface EmailAttachmentInput {
  attachmentBlob: Blob;
  attachmentName: string;
  attachmentContentType?: string;
  documentId?: string;
  documentName?: string;
}

export const openEmailClient = async ({ to, cc, subject, body }: EmailParams) => {
  const signedBody = await applyLoggedUserSignatureToBody(body);
  const enc = encodeURIComponent;
  const params: string[] = [];
  if (cc?.length) params.push(`cc=${cc.map(enc).join(',')}`);
  params.push(`subject=${enc(subject)}`);
  params.push(`body=${enc(signedBody)}`);
  const mailto = `mailto:${to.map(enc).join(',')}?${params.join('&')}`;
  window.location.href = mailto;
};

const PDF_CONTENT_TYPE = 'application/pdf';

const safeFileName = (value: string) =>
  (value || 'email')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim()
    .slice(0, 150);

const ensurePdfBlob = (blob: Blob) =>
  blob.type === PDF_CONTENT_TYPE ? blob : new Blob([blob], { type: PDF_CONTENT_TYPE });

const contentTypeToExtension = (contentType: string) => {
  const type = contentType.toLowerCase();
  if (type.includes('pdf')) return 'pdf';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  if (type.includes('wordprocessingml.document')) return 'docx';
  if (type.includes('msword')) return 'doc';
  return 'pdf';
};

const hasFileExtension = (value: string) => /\.[a-z0-9]{2,8}$/i.test(value);

const ensureAttachmentBlob = (blob: Blob, contentType: string) =>
  blob.type === contentType ? blob : new Blob([blob], { type: contentType });

const openPdfPreview = (blob: Blob, fileName: string) => {
  const pdf = ensurePdfBlob(blob);
  const url = URL.createObjectURL(pdf);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  return { opened: Boolean(win), fileName };
};

const blobToBase64 = (blob: Blob, contentType = blob.type || PDF_CONTENT_TYPE) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] || '' : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(ensureAttachmentBlob(blob, contentType));
  });

const buildEmailApiErrorMessage = (data: any) => {
  if (data?.error === 'missing_email_provider_env') {
    const missing = Array.isArray(data?.missing) && data.missing.length
      ? ` Variáveis ausentes: ${data.missing.join(', ')}.`
      : '';
    const alternatives = Array.isArray(data?.alternatives) && data.alternatives.length
      ? ` Configure uma destas opções: ${data.alternatives.map((group: string[]) => group.join(' + ')).join(' ou ')}.`
      : '';
    return `${data?.message || 'Envio de e-mail não configurado no servidor.'}${missing}${alternatives}`;
  }

  if (data?.error === 'dados_invalidos') {
    return data?.message || 'Preencha destinatário, assunto, mensagem e PDF antes de enviar.';
  }

  if (data?.error === 'email_provider_failed') {
    return data?.message || 'Falha no provedor de e-mail configurado.';
  }

  return data?.message || data?.error || 'email_send_failed';
};

export const sendEmailWithPdfAttachment = async ({
  to,
  cc,
  subject,
  body,
  attachmentBlob,
  attachmentName,
  attachments,
  senderUserId,
  senderName,
  senderEmail,
  moduleOrigin,
  documentId,
  documentName,
  authToken,
}: EmailParams & {
  attachmentBlob?: Blob;
  attachmentName?: string;
  attachments?: EmailAttachmentInput[];
}) => {
  const rawAttachments = attachments?.length
    ? attachments
    : attachmentBlob && attachmentName
      ? [{ attachmentBlob, attachmentName, documentId, documentName }]
      : [];

  if (!rawAttachments.length) throw new Error('pdf_anexo_vazio');

  const normalizedAttachments = await Promise.all(rawAttachments.map(async (attachment) => {
    const attachmentContentType = attachment.attachmentContentType || attachment.attachmentBlob.type || PDF_CONTENT_TYPE;
    const normalizedBlob = ensureAttachmentBlob(attachment.attachmentBlob, attachmentContentType);
    const attachmentBase64 = await blobToBase64(normalizedBlob, attachmentContentType);
    if (!attachmentBase64) throw new Error('pdf_anexo_vazio');
    const safeName = safeFileName(attachment.attachmentName);
    const cleanAttachmentName = hasFileExtension(safeName)
      ? safeName
      : `${safeName}.${contentTypeToExtension(attachmentContentType)}`;
    return {
      attachmentName: cleanAttachmentName,
      attachmentBase64,
      attachmentContentType,
      attachmentSize: normalizedBlob.size,
      documentId: attachment.documentId,
      documentName: attachment.documentName || cleanAttachmentName,
    };
  }));

  const firstAttachment = normalizedAttachments[0];
  const documentNames = normalizedAttachments.map((item) => item.documentName || item.attachmentName).join('; ');

  const response = await fetch('/api/send-email-pdf', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({
      to,
      cc: cc || [],
      subject,
      body,
      attachments: normalizedAttachments,
      attachmentName: firstAttachment.attachmentName,
      attachmentBase64: firstAttachment.attachmentBase64,
      attachmentContentType: firstAttachment.attachmentContentType,
      attachmentSize: firstAttachment.attachmentSize,
      senderUserId,
      senderName,
      senderEmail,
      moduleOrigin,
      documentId: documentId || firstAttachment.documentId,
      documentName: documentName || documentNames,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(buildEmailApiErrorMessage(data));
  }
  return data;
};

export const downloadEmailWithAttachment = async ({
  to,
  cc,
  subject,
  body,
  attachmentBlob,
  attachmentName,
  senderUserId,
  senderName,
  senderEmail,
  moduleOrigin,
  documentId,
  documentName,
  authToken,
}: EmailParams & {
  attachmentBlob: Blob;
  attachmentName: string;
  fileName?: string;
}) => {
  const cleanAttachmentName = safeFileName(attachmentName).endsWith('.pdf')
    ? safeFileName(attachmentName)
    : `${safeFileName(attachmentName)}.pdf`;

  try {
    await sendEmailWithPdfAttachment({
      to,
      cc,
      subject,
      body,
      attachmentBlob,
      attachmentName: cleanAttachmentName,
      senderUserId,
      senderName,
      senderEmail,
      moduleOrigin,
      documentId,
      documentName,
      authToken,
    });
    return { ok: true, mode: 'platform_email' };
  } catch (error: any) {
    openPdfPreview(attachmentBlob, cleanAttachmentName);
    throw new Error(error?.message || 'email_send_failed');
  }
};

export const CC_OBRIGATORIO = ['adm.matriz@topac.com.br', 'robson@topac.com.br'] as const;

export const DESTINATARIOS_ASO = ['agendamento@ponteaereaseguranca.com.br'] as const;

export const getDestinatariosFerias = (unidade: string): readonly string[] => {
  const u = (unidade || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (u.includes('GOIANIA') || u.includes('GOIANA')) {
    return ['requisicao@incocontabilidade.com.br'];
  }

  return [
    'marisa@aatconsultoria.com.br',
    'lucilene@aatconsultoria.com.br',
    'dp@aatconsultoria.com.br',
  ];
};

export const getDestinatariosAtestadoContabilidade = (unidade: string): readonly string[] => {
  const u = (unidade || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (u.includes('GOIANIA') || u.includes('GOIANA')) {
    return ['gyn@topac.com.br', 'requisicao@incocontabilidade.com.br'];
  }

  return [
    'marisa@aatconsultoria.com.br',
    'lucilene@aatconsultoria.com.br',
    'dp@aatconsultoria.com.br',
  ];
};

export const getDestinatariosRescisao = (unidade: string): readonly string[] => {
  return getDestinatariosFerias(unidade);
};

export const DESTINATARIOS = {
  ferias: getDestinatariosFerias(''),
  rescisao: getDestinatariosRescisao(''),
  aso: DESTINATARIOS_ASO,
} as const;
