export const TOPAC_REPORT_CC = ['adm.matriz@topac.com.br', 'robson@topac.com.br'] as const;
export const TOPAC_REPORT_SIGNATURE = 'Atenciosamente,\nAdministrador Topac RH PRO Multiempresas';

export type EmailPolicyInput = {
  subject?: string;
  body?: string;
  cc?: readonly string[];
  moduleOrigin?: string;
  attachmentNames?: readonly string[];
  attachmentContentTypes?: readonly string[];
};

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const REPORT_TERMS = ['relatorio', 'planilha', 'modelo 1', 'modelo 2', 'modelo 3', 'modelo 4', 'modelo 5', 'xlsx', 'csv'];

export const isReportOrSpreadsheetEmail = (input: EmailPolicyInput) => {
  const text = normalize([
    input.subject,
    input.moduleOrigin,
    ...(input.attachmentNames || []),
    ...(input.attachmentContentTypes || []),
  ].join(' '));
  return REPORT_TERMS.some((term) => text.includes(term)) ||
    text.includes('spreadsheetml') ||
    text.includes('text/csv');
};

const stripExistingSignature = (body: string) => {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  const signatureIndex = lines.findIndex((line) => /^\s*(atenciosamente|cordialmente|att\.?|grato|obrigado)\s*[,.:;-]?\s*$/i.test(line));
  return (signatureIndex >= 0 ? lines.slice(0, signatureIndex) : lines)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const uniqueEmails = (values: readonly string[] = []) => Array.from(new Set(
  values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean),
));

export const applyTopacEmailPolicy = (input: EmailPolicyInput) => {
  const report = isReportOrSpreadsheetEmail(input);
  if (!report) {
    return {
      body: String(input.body || '').trim(),
      cc: uniqueEmails(input.cc),
      institutional: false,
    };
  }

  const content = stripExistingSignature(String(input.body || ''));
  return {
    body: `${content}${content ? '\n\n' : ''}${TOPAC_REPORT_SIGNATURE}`,
    cc: uniqueEmails([...(input.cc || []), ...TOPAC_REPORT_CC]),
    institutional: true,
  };
};
