import { applyTopacEmailPolicy } from '@/lib/emailPolicy';

/** Abre o cliente de e-mail padrão ou envia anexos pelo endpoint da plataforma. */
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
  attachmentNames?: readonly string[];
  attachmentContentTypes?: readonly string[];
}

export interface EmailAttachmentInput {
  attachmentBlob: Blob;
  attachmentName: string;
  attachmentContentType?: string;
  documentId?: string;
  documentName?: string;
}

export const openEmailClient = ({ to, cc, subject, body, moduleOrigin, attachmentNames, attachmentContentTypes }: EmailParams) => {
  const policy = applyTopacEmailPolicy({ subject, body, cc, moduleOrigin, attachmentNames, attachmentContentTypes });
  const enc = encodeURIComponent;
  const params: string[] = [];
  if (policy.cc.length) params.push(`cc=${policy.cc.map(enc).join(',')}`);
  params.push(`subject=${enc(subject)}`);
  params.push(`body=${enc(policy.body)}`);
  window.location.href = `mailto:${to.map(enc).join(',')}?${params.join('&')}`;
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

const contentTypeToExtension = (contentType: string) => {
  const type = contentType.toLowerCase();
  if (type.includes('spreadsheetml.sheet')) return 'xlsx';
  if (type.includes('text/csv') || type.includes('csv')) return 'csv';
  if (type.includes('pdf')) return 'pdf';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  if (type.includes('wordprocessingml.document')) return 'docx';
  if (type.includes('msword')) return 'doc';
  return 'bin';
};

const hasFileExtension = (value: string) => /\.[a-z0-9]{2,8}$/i.test(value);
const ensureAttachmentBlob = (blob: Blob, contentType: string) => blob.type === contentType ? blob : new Blob([blob], { type: contentType });
const ensurePdfBlob = (blob: Blob) => ensureAttachmentBlob(blob, PDF_CONTENT_TYPE);

const openPdfPreview = (blob: Blob) => {
  const url = URL.createObjectURL(ensurePdfBlob(blob));
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  return Boolean(win);
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

const parseEmailApiResponse = async (response: Response) => {
  const text = await response.text().catch(() => '');
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 400) }; }
};

const buildEmailApiErrorMessage = (data: any, status?: number) => {
  if (data?.error === 'missing_email_provider_env') {
    const missing = Array.isArray(data?.missing) && data.missing.length ? ` Variáveis ausentes: ${data.missing.join(', ')}.` : '';
    return `${data?.message || 'Envio de e-mail não configurado no servidor.'}${missing}`;
  }
  if (data?.error === 'dados_invalidos') return data?.message || 'Preencha destinatário, assunto, mensagem e anexos antes de enviar.';
  if (data?.error === 'email_provider_failed') return data?.message || 'Falha no provedor de e-mail configurado.';
  if (data?.error === 'email_send_failed') return data?.message || 'O envio automático pelo servidor não foi concluído.';
  if (status === 404) return 'A rota de envio de e-mail não foi encontrada na publicação atual.';
  if (status && status >= 500) return 'O servidor de e-mail respondeu com falha temporária.';
  return data?.message || data?.error || 'O envio automático pelo servidor não foi concluído.';
};

export const sendEmailWithPdfAttachment = async ({
  to, cc, subject, body, attachmentBlob, attachmentName, attachments,
  senderUserId, senderName, senderEmail, moduleOrigin, documentId, documentName, authToken,
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
    const cleanAttachmentName = hasFileExtension(safeName) ? safeName : `${safeName}.${contentTypeToExtension(attachmentContentType)}`;
    return {
      attachmentName: cleanAttachmentName,
      attachmentBase64,
      attachmentContentType,
      attachmentSize: normalizedBlob.size,
      documentId: attachment.documentId,
      documentName: attachment.documentName || cleanAttachmentName,
    };
  }));

  const policy = applyTopacEmailPolicy({
    subject,
    body,
    cc,
    moduleOrigin,
    attachmentNames: normalizedAttachments.map((item) => item.attachmentName),
    attachmentContentTypes: normalizedAttachments.map((item) => item.attachmentContentType),
  });
  const firstAttachment = normalizedAttachments[0];
  const documentNames = normalizedAttachments.map((item) => item.documentName || item.attachmentName).join('; ');

  const response = await fetch('/api/send-email-pdf', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({
      to,
      cc: policy.cc,
      subject,
      body: policy.body,
      attachments: normalizedAttachments,
      attachmentName: firstAttachment.attachmentName,
      attachmentBase64: firstAttachment.attachmentBase64,
      attachmentContentType: firstAttachment.attachmentContentType,
      attachmentSize: firstAttachment.attachmentSize,
      senderUserId,
      senderName: policy.institutional ? 'Administrador Topac RH PRO Multiempresas' : senderName,
      senderEmail,
      moduleOrigin,
      documentId: documentId || firstAttachment.documentId,
      documentName: documentName || documentNames,
    }),
  });
  const data = await parseEmailApiResponse(response);
  if (!response.ok || data?.ok === false) throw new Error(buildEmailApiErrorMessage(data, response.status));
  return data;
};

export const downloadEmailWithAttachment = async ({
  to, cc, subject, body, attachmentBlob, attachmentName,
  senderUserId, senderName, senderEmail, moduleOrigin, documentId, documentName, authToken,
}: EmailParams & { attachmentBlob: Blob; attachmentName: string; fileName?: string }) => {
  const safeName = safeFileName(attachmentName);
  const cleanAttachmentName = hasFileExtension(safeName) ? safeName : `${safeName}.pdf`;
  try {
    await sendEmailWithPdfAttachment({
      to, cc, subject, body, attachmentBlob, attachmentName: cleanAttachmentName,
      senderUserId, senderName, senderEmail, moduleOrigin, documentId, documentName, authToken,
    });
    return { ok: true, mode: 'platform_email' };
  } catch (error: any) {
    openPdfPreview(attachmentBlob);
    throw new Error(error?.message || 'O envio automático pelo servidor não foi concluído.');
  }
};

export const CC_OBRIGATORIO = ['adm.matriz@topac.com.br', 'robson@topac.com.br'] as const;
export const DESTINATARIOS_CONTABILIDADE = ['marisa@aatconsultoria.com.br', 'lucilene@aatconsultoria.com.br', 'dp@aatconsultoria.com.br'] as const;
export const DESTINATARIOS_ASO = ['agendamento@ponteaereaseguranca.com.br'] as const;

export const getDestinatariosFerias = (unidade: string): readonly string[] => {
  const normalized = String(unidade || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return normalized.includes('GOIANIA') || normalized.includes('GOIANA')
    ? ['requisicao@incocontabilidade.com.br']
    : DESTINATARIOS_CONTABILIDADE;
};

export const getDestinatariosRescisao = (unidade: string): readonly string[] => getDestinatariosFerias(unidade);
export const DESTINATARIOS = {
  ferias: getDestinatariosFerias(''),
  rescisao: getDestinatariosRescisao(''),
  aso: DESTINATARIOS_ASO,
} as const;
