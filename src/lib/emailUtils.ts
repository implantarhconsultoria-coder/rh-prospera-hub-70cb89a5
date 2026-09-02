import { applyTopacEmailPolicy } from '@/lib/emailPolicy';
import { supabase } from '@/integrations/supabase/client';

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

type StoredEmailAttachment = {
  storageBucket: string;
  storagePath: string;
  attachmentName: string;
  attachmentContentType: string;
  attachmentSize: number;
  documentId?: string;
  documentName: string;
};

export const EMAIL_ATTACHMENT_BUCKET = 'email-anexos-temporarios';
export const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_EMAIL_ATTACHMENTS = 30;
const PDF_CONTENT_TYPE = 'application/pdf';

export const EMAIL_GOIANIA = 'adm.gyn@topac.com.br' as const;
const EMAIL_GOIANIA_ANTIGO = 'gyn@topac.com.br';

export const normalizeTopacRecipients = (emails: readonly string[] = []): string[] =>
  Array.from(new Set(
    emails
      .map((email) => String(email || '').trim().toLowerCase())
      .filter(Boolean)
      .map((email) => email === EMAIL_GOIANIA_ANTIGO ? EMAIL_GOIANIA : email),
  ));

export const openEmailClient = ({ to, cc, subject, body, moduleOrigin, attachmentNames, attachmentContentTypes }: EmailParams) => {
  const policy = applyTopacEmailPolicy({ subject, body, cc, moduleOrigin, attachmentNames, attachmentContentTypes });
  const normalizedTo = normalizeTopacRecipients(to);
  const enc = encodeURIComponent;
  const params: string[] = [];
  if (policy.cc.length) params.push(`cc=${policy.cc.map(enc).join(',')}`);
  params.push(`subject=${enc(subject)}`);
  params.push(`body=${enc(policy.body)}`);
  window.location.href = `mailto:${normalizedTo.map(enc).join(',')}?${params.join('&')}`;
};

const safeFileName = (value: string) =>
  (value || 'email')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim()
    .slice(0, 150);

const safePathSegment = (value: string) =>
  safeFileName(value)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 120) || 'anexo';

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

const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const parseEmailApiResponse = async (response: Response) => {
  const text = await response.text().catch(() => '');
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 400) }; }
};

const formatBytes = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1).replace('.', ',')} MB`;
};

const buildEmailApiErrorMessage = (data: any, status?: number) => {
  if (data?.error === 'missing_email_provider_env') {
    const missing = Array.isArray(data?.missing) && data.missing.length ? ` Variáveis ausentes: ${data.missing.join(', ')}.` : '';
    return `${data?.message || 'Envio de e-mail não configurado no servidor.'}${missing}`;
  }
  if (data?.error === 'dados_invalidos') return data?.message || 'Preencha destinatário, assunto, mensagem e anexos antes de enviar.';
  if (data?.error === 'attachment_too_large') return data?.message || 'Um dos anexos ultrapassa o limite permitido para envio.';
  if (data?.error === 'attachments_total_too_large') return data?.message || 'Os anexos somados ultrapassam o limite do provedor de e-mail.';
  if (data?.error === 'attachment_reference_invalid') return data?.message || 'A referência temporária de um anexo é inválida. Gere o envio novamente.';
  if (data?.error === 'attachment_download_failed') return data?.message || 'Não foi possível recuperar um dos anexos temporários. Tente novamente.';
  if (data?.error === 'email_provider_failed') return data?.message || 'Falha no provedor de e-mail configurado.';
  if (data?.error === 'email_send_failed') return data?.message || 'O envio automático pelo servidor não foi concluído.';
  if (status === 413) return data?.message || 'Os anexos são grandes demais para o envio automático. Reduza os arquivos e tente novamente.';
  if (status === 401 || status === 403) return data?.message || 'Sua sessão não tem autorização para enviar este e-mail. Entre novamente na plataforma.';
  if (status === 404) return 'A rota de envio de e-mail não foi encontrada na publicação atual.';
  if (status && status >= 500) return data?.message || 'O servidor de e-mail respondeu com falha temporária.';
  return data?.message || data?.error || 'O envio automático pelo servidor não foi concluído.';
};

const cleanupStoredAttachments = async (attachments: StoredEmailAttachment[]) => {
  const paths = attachments.map((item) => item.storagePath).filter(Boolean);
  if (!paths.length) return;
  try { await supabase.storage.from(EMAIL_ATTACHMENT_BUCKET).remove(paths); } catch { /* limpeza defensiva */ }
};

const uploadEmailAttachments = async (
  attachments: EmailAttachmentInput[],
  userId: string,
): Promise<StoredEmailAttachment[]> => {
  if (attachments.length > MAX_EMAIL_ATTACHMENTS) {
    throw new Error(`O envio aceita no máximo ${MAX_EMAIL_ATTACHMENTS} anexos por e-mail.`);
  }
  if (!userId) throw new Error('Sua sessão expirou. Entre novamente para enviar anexos pela plataforma.');

  const uploaded: StoredEmailAttachment[] = [];
  try {
    for (const attachment of attachments) {
      const attachmentContentType = attachment.attachmentContentType || attachment.attachmentBlob.type || PDF_CONTENT_TYPE;
      const normalizedBlob = ensureAttachmentBlob(attachment.attachmentBlob, attachmentContentType);
      if (!normalizedBlob.size) throw new Error('pdf_anexo_vazio');
      if (normalizedBlob.size > MAX_EMAIL_ATTACHMENT_BYTES) {
        throw new Error(`O arquivo ${attachment.attachmentName || 'anexo'} tem ${formatBytes(normalizedBlob.size)}. O limite por arquivo é ${formatBytes(MAX_EMAIL_ATTACHMENT_BYTES)}.`);
      }

      const safeName = safeFileName(attachment.attachmentName);
      const cleanAttachmentName = hasFileExtension(safeName) ? safeName : `${safeName}.${contentTypeToExtension(attachmentContentType)}`;
      const storagePath = `${userId}/${new Date().toISOString().slice(0, 10)}/${randomId()}-${safePathSegment(cleanAttachmentName)}`;
      const { error } = await supabase.storage
        .from(EMAIL_ATTACHMENT_BUCKET)
        .upload(storagePath, normalizedBlob, { contentType: attachmentContentType, upsert: false, cacheControl: '3600' });
      if (error) throw new Error(`Não foi possível preparar o anexo ${cleanAttachmentName}: ${error.message}`);

      uploaded.push({
        storageBucket: EMAIL_ATTACHMENT_BUCKET,
        storagePath,
        attachmentName: cleanAttachmentName,
        attachmentContentType,
        attachmentSize: normalizedBlob.size,
        documentId: attachment.documentId,
        documentName: attachment.documentName || cleanAttachmentName,
      });
    }
    return uploaded;
  } catch (error) {
    await cleanupStoredAttachments(uploaded);
    throw error;
  }
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

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const effectiveAuthToken = authToken || session?.access_token || '';
  const authenticatedUserId = session?.user?.id || '';
  if (!effectiveAuthToken || !authenticatedUserId) {
    throw new Error('Sua sessão expirou. Entre novamente para enviar anexos pela plataforma.');
  }

  const policy = applyTopacEmailPolicy({
    subject,
    body,
    cc,
    moduleOrigin,
    attachmentNames: rawAttachments.map((item) => item.attachmentName),
    attachmentContentTypes: rawAttachments.map((item) => item.attachmentContentType || item.attachmentBlob.type || PDF_CONTENT_TYPE),
  });

  const storedAttachments = await uploadEmailAttachments(rawAttachments, authenticatedUserId);
  const documentNames = storedAttachments.map((item) => item.documentName || item.attachmentName).join('; ');
  const normalizedTo = normalizeTopacRecipients(to);
  let response: Response;
  try {
    response = await fetch('/api/send-email-pdf', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${effectiveAuthToken}`,
      },
      body: JSON.stringify({
        to: normalizedTo,
        cc: policy.cc,
        subject,
        body: policy.body,
        attachments: storedAttachments,
        senderUserId: authenticatedUserId || senderUserId,
        senderName: policy.institutional ? 'Administrador Topac RH PRO Multiempresas' : senderName,
        senderEmail,
        moduleOrigin,
        documentId: documentId || storedAttachments[0]?.documentId,
        documentName: documentName || documentNames,
      }),
    });
  } catch (error) {
    await cleanupStoredAttachments(storedAttachments);
    throw error;
  }

  const data = await parseEmailApiResponse(response);
  if (!response.ok || data?.ok === false) {
    await cleanupStoredAttachments(storedAttachments);
    throw new Error(buildEmailApiErrorMessage(data, response.status));
  }
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
