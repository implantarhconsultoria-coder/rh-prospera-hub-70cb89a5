/**
 * Abre o cliente de e-mail padrao (Outlook etc.) com campos preenchidos.
 */
export interface EmailParams {
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  body: string;
}

export const openEmailClient = ({ to, cc, subject, body }: EmailParams) => {
  const enc = encodeURIComponent;
  const params: string[] = [];
  if (cc?.length) params.push(`cc=${cc.map(enc).join(',')}`);
  params.push(`subject=${enc(subject)}`);
  params.push(`body=${enc(body)}`);
  const mailto = `mailto:${to.map(enc).join(',')}?${params.join('&')}`;
  window.location.href = mailto;
};

const PDF_CONTENT_TYPE = 'application/pdf';

const safeFileName = (value: string) =>
  (value || 'email')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 150);

const ensurePdfBlob = (blob: Blob) =>
  blob.type === PDF_CONTENT_TYPE ? blob : new Blob([blob], { type: PDF_CONTENT_TYPE });

const openPdfPreview = (blob: Blob, fileName: string) => {
  const pdf = ensurePdfBlob(blob);
  const url = URL.createObjectURL(pdf);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  return { opened: Boolean(win), fileName };
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] || '' : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(ensurePdfBlob(blob));
  });

const sendPdfByPlatform = async ({
  to,
  cc,
  subject,
  body,
  attachmentBlob,
  attachmentName,
}: EmailParams & { attachmentBlob: Blob; attachmentName: string }) => {
  const pdfBlob = ensurePdfBlob(attachmentBlob);
  const attachmentBase64 = await blobToBase64(pdfBlob);
  if (!attachmentBase64) throw new Error('pdf_anexo_vazio');

  const response = await fetch('/api/send-email-pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      to,
      cc: cc || [],
      subject,
      body,
      attachmentName,
      attachmentBase64,
      attachmentContentType: PDF_CONTENT_TYPE,
      attachmentSize: pdfBlob.size,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || 'email_send_failed');
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
}: EmailParams & {
  attachmentBlob: Blob;
  attachmentName: string;
  fileName?: string;
}) => {
  const cleanAttachmentName = safeFileName(attachmentName).endsWith('.pdf')
    ? safeFileName(attachmentName)
    : `${safeFileName(attachmentName)}.pdf`;

  try {
    await sendPdfByPlatform({
      to,
      cc,
      subject,
      body,
      attachmentBlob,
      attachmentName: cleanAttachmentName,
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

export const getDestinatariosRescisao = (unidade: string): readonly string[] => {
  return getDestinatariosFerias(unidade);
};

export const DESTINATARIOS = {
  ferias: getDestinatariosFerias(''),
  rescisao: getDestinatariosRescisao(''),
  aso: DESTINATARIOS_ASO,
} as const;
