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

const safeFileName = (value: string) =>
  (value || 'email')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 150);

const openPdfPreview = (blob: Blob, fileName: string) => {
  const pdf = new Blob([blob], { type: 'application/pdf' });
  const url = URL.createObjectURL(pdf);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  return { opened: Boolean(win), fileName };
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

  openPdfPreview(attachmentBlob, cleanAttachmentName);
  openEmailClient({
    to,
    cc,
    subject,
    body: `${body}\n\nO PDF foi aberto automaticamente em outra aba. Anexe o PDF aberto antes de enviar.`,
  });
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
