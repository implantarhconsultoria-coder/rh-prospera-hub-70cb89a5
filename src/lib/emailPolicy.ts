export const TOPAC_REPORT_CC = ['adm.matriz@topac.com.br', 'robson@topac.com.br'] as const;
export const TOPAC_REPORT_SIGNATURE = 'Atenciosamente,\nAdministrador Topac RH PRO Multiempresas';
const EMAILS_REMOVIDOS = new Set(['lucilene' + '@aatconsultoria.com.br']);

export const ACCOUNTING_VANESSA = 'dp@aatconsultoria.com.br' as const;
export const ACCOUNTING_MARISA = 'marisa@aatconsultoria.com.br' as const;
export const GOIANIA_ADMIN_EMAIL = 'adm.gyn@topac.com.br' as const;
export const GOIANIA_ACCOUNTING_EMAIL = 'requisicao@incocontabilidade.com.br' as const;

export type EmailPolicyInput = {
  to?: readonly string[];
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
  values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).filter((email) => !EMAILS_REMOVIDOS.has(email)),
));

const routingText = (input: EmailPolicyInput) => normalize([
  input.subject,
  input.body,
  input.moduleOrigin,
  ...(input.attachmentNames || []),
].join(' '));

const isGoianiaContext = (input: EmailPolicyInput) => {
  const text = routingText(input);
  return text.includes('goiania') || text.includes('goiana') || /\bgyn\b/.test(text);
};

const isFechamentoOuApontamento = (input: EmailPolicyInput) => {
  const text = routingText(input);
  return text.includes('fechamento') || text.includes('apontamento');
};

const accountingCcFor = (to: readonly string[] = []) => {
  const recipients = uniqueEmails(to);
  const goesToVanessa = recipients.includes(ACCOUNTING_VANESSA);
  const goesToMarisa = recipients.includes(ACCOUNTING_MARISA);
  const isAccounting = recipients.some((email) => email.endsWith('@aatconsultoria.com.br'));
  if (!isAccounting) return [] as string[];

  return uniqueEmails([
    ...(goesToVanessa && !goesToMarisa ? [ACCOUNTING_MARISA] : []),
    ...(goesToMarisa && !goesToVanessa ? [ACCOUNTING_VANESSA] : []),
    ...TOPAC_REPORT_CC,
  ]);
};

export const applyTopacEmailPolicy = (input: EmailPolicyInput) => {
  const report = isReportOrSpreadsheetEmail(input);
  const goiania = isGoianiaContext(input);
  const fechamentoOuApontamento = goiania && isFechamentoOuApontamento(input);
  const policyTo = uniqueEmails([
    ...(input.to || []),
    ...(fechamentoOuApontamento ? [GOIANIA_ACCOUNTING_EMAIL] : []),
  ]);
  const accountingCc = accountingCcFor(policyTo);
  const mandatoryCc = uniqueEmails([
    ...(input.cc || []),
    ...accountingCc,
    ...(goiania ? [GOIANIA_ADMIN_EMAIL] : []),
    ...(report ? TOPAC_REPORT_CC : []),
  ]);

  if (!report) {
    return {
      to: policyTo,
      body: String(input.body || '').trim(),
      cc: mandatoryCc,
      institutional: accountingCc.length > 0 || goiania,
    };
  }

  const content = stripExistingSignature(String(input.body || ''));
  return {
    to: policyTo,
    body: `${content}${content ? '\n\n' : ''}${TOPAC_REPORT_SIGNATURE}`,
    cc: mandatoryCc,
    institutional: true,
  };
};
