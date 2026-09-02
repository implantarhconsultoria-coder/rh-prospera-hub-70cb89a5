export type BankingData = {
  banco: string;
  bancoCodigo: string;
  agencia: string;
  conta: string;
  digito: string;
  tipoConta: string;
  titular: string;
  cpfTitular: string;
  chavePix: string;
  tipoChavePix: string;
  textoOriginal: string;
};

export type BankingParseResult = {
  data: BankingData;
  identified: string[];
  warnings: string[];
};

export const emptyBankingData = (): BankingData => ({
  banco: '', bancoCodigo: '', agencia: '', conta: '', digito: '', tipoConta: '',
  titular: '', cpfTitular: '', chavePix: '', tipoChavePix: '', textoOriginal: '',
});

const BANKS: Array<{ aliases: string[]; name: string; code: string }> = [
  { aliases: ['banco do brasil', 'bb'], name: 'Banco do Brasil', code: '001' },
  { aliases: ['caixa economica', 'caixa'], name: 'Caixa Econômica Federal', code: '104' },
  { aliases: ['bradesco'], name: 'Bradesco', code: '237' },
  { aliases: ['itau', 'itaú'], name: 'Itaú Unibanco', code: '341' },
  { aliases: ['santander'], name: 'Santander', code: '033' },
  { aliases: ['nubank', 'nu pagamentos'], name: 'Nubank', code: '260' },
  { aliases: ['banco inter', 'inter'], name: 'Banco Inter', code: '077' },
  { aliases: ['c6 bank', 'c6'], name: 'C6 Bank', code: '336' },
  { aliases: ['sicoob'], name: 'Sicoob', code: '756' },
  { aliases: ['sicredi'], name: 'Sicredi', code: '748' },
  { aliases: ['mercado pago'], name: 'Mercado Pago', code: '323' },
  { aliases: ['pagbank', 'pagseguro'], name: 'PagBank', code: '290' },
  { aliases: ['neon'], name: 'Banco Neon', code: '735' },
  { aliases: ['picpay'], name: 'PicPay', code: '380' },
];

const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeSearch = (value: unknown) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sanitizeMessage = (value: unknown) => String(value || '')
  .replace(/\r/g, '')
  .replace(/[*_`]/g, '')
  .replace(/^[\s•●▪◦►▶➤➜✓✔-]+/gm, '')
  .trim();

const first = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
};

const splitSegments = (text: string) => text
  .split(/\n+|\s*[|;]\s*/)
  .map(clean)
  .filter(Boolean);

const valueFromSegments = (segments: string[], labels: string[]) => {
  const labelPattern = labels.map(escapeRegex).join('|');
  const pattern = new RegExp(`^(?:${labelPattern})\\s*[:=\\-]?\\s*(.+)$`, 'i');
  for (const segment of segments) {
    const match = segment.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
};

const trimAtNextBankLabel = (value: string) => clean(value)
  .replace(/\s+(?:c[oó]d(?:igo)?\s+(?:do\s+)?banco|ag[eê]ncia|ag\.?|n[uú]mero\s+da\s+conta|conta(?:\s+(?:corrente|poupan[cç]a|sal[aá]rio|pagamento))?|c\/c|d[ií]gito|dv|titular|favorecido|benefici[aá]rio|cpf|chave\s+pix|pix|tipo\s+(?:de\s+conta|pix|da\s+chave\s+pix))\s*[:=\-].*$/i, '')
  .replace(/[|;,]+$/g, '')
  .trim();

const formatCpf = (value: string) => {
  const number = digits(value);
  return number.length === 11
    ? `${number.slice(0, 3)}.${number.slice(3, 6)}.${number.slice(6, 9)}-${number.slice(9)}`
    : clean(value);
};

const inferPixType = (key: string, sourceText: string) => {
  const value = clean(key);
  const number = digits(value);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'E-mail';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return 'Chave aleatória';
  if (/\bcpf\b/i.test(sourceText) && number.length === 11) return 'CPF';
  if (/\bcnpj\b/i.test(sourceText) && number.length === 14) return 'CNPJ';
  if (/\b(?:telefone|celular|whatsapp|fone)\b/i.test(sourceText) && number.length >= 10 && number.length <= 13) return 'Telefone';
  if (/^\+?55/.test(value) || /[()]/.test(value)) return 'Telefone';
  return '';
};

const splitAccount = (value: string) => {
  const raw = clean(value).replace(/\s/g, '');
  const match = raw.match(/^(.+?)[-/]([0-9A-Za-z])$/);
  return {
    conta: clean(match?.[1] || raw),
    digito: clean(match?.[2] || ''),
  };
};

export const parseBankingText = (rawText: string): BankingParseResult => {
  const original = sanitizeMessage(rawText);
  const segments = splitSegments(original);
  const flat = original.replace(/\n+/g, ' | ').replace(/\s+/g, ' ').trim();
  const searchable = normalizeSearch(flat);
  const data = emptyBankingData();
  data.textoOriginal = String(rawText || '').replace(/\r/g, '').trim();

  const bankByName = BANKS.find((bank) => bank.aliases.some((alias) => {
    const normalizedAlias = normalizeSearch(alias);
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegex(normalizedAlias)}(?:$|[^a-z0-9])`, 'i').test(searchable);
  }));
  const explicitBank = trimAtNextBankLabel(
    valueFromSegments(segments, ['banco', 'instituição', 'instituicao']) || first(flat, [
      /\bbanco\s*[:=\-]?\s*(.+?)(?=\s+(?:c[oó]d(?:igo)?\s+(?:do\s+)?banco|ag[eê]ncia|ag\.?|conta|c\/c|pix|chave\s+pix|cpf|titular)\s*[:=\-]|\s*[|;]|$)/i,
      /\binstitui[cç][aã]o\s*[:=\-]?\s*(.+?)(?=\s+(?:ag[eê]ncia|conta|pix|cpf|titular)\s*[:=\-]|\s*[|;]|$)/i,
    ]),
  );
  const bankCode = first(flat, [
    /(?:c[oó]digo\s+do\s+banco|c[oó]d\.?\s*banco|banco\s+c[oó]digo)\s*[:=\-]?\s*(\d{3})/i,
    /\bbanco\s*[:=\-]?\s*(\d{3})\b/i,
  ]);
  const bankByCode = BANKS.find((bank) => bank.code === bankCode);
  data.banco = bankByName?.name || bankByCode?.name || explicitBank.replace(/^\d{3}\s*[-–—]?\s*/, '');
  data.bancoCodigo = bankCode || bankByName?.code || '';

  const agencyRaw = valueFromSegments(segments, ['agência', 'agencia', 'ag.', 'ag']) || first(flat, [
    /(?:ag[eê]ncia|ag\.)\s*[:=\-]?\s*([0-9A-Za-z.-]{1,15})/i,
  ]);
  data.agencia = trimAtNextBankLabel(agencyRaw).replace(/[^0-9A-Za-z.-]/g, '');

  const accountRaw = trimAtNextBankLabel(
    valueFromSegments(segments, ['número da conta', 'numero da conta', 'conta corrente', 'conta poupança', 'conta poupanca', 'conta salário', 'conta salario', 'conta pagamento', 'conta', 'c/c']) || first(flat, [
      /(?:n[uú]mero\s+da\s+conta|conta\s+(?:corrente|poupan[cç]a|sal[aá]rio|pagamento)|c\/c)\s*[:=\-]?\s*([0-9A-Za-z.]+(?:\s*[-/]\s*[0-9A-Za-z])?)/i,
      /\bconta\s*[:=\-]\s*([0-9A-Za-z.]+(?:\s*[-/]\s*[0-9A-Za-z])?)/i,
    ]),
  );
  const account = splitAccount(accountRaw);
  data.conta = account.conta.replace(/[^0-9A-Za-z.]/g, '');
  data.digito = account.digito || clean(first(flat, [/(?:d[ií]gito|d[ií]g\.?|dv)\s*[:=\-]?\s*([0-9A-Za-z])/i]));

  const accountType = first(flat, [/(?:tipo\s+de\s+conta|conta)\s*[:=\-]?\s*(corrente|poupan[cç]a|sal[aá]rio|pagamento)/i]) ||
    (flat.match(/conta\s+(corrente|poupan[cç]a|sal[aá]rio|pagamento)/i)?.[1] || '');
  data.tipoConta = clean(accountType).replace(/^./, (char) => char.toUpperCase());

  data.titular = trimAtNextBankLabel(
    valueFromSegments(segments, ['nome do titular', 'titular', 'favorecido', 'beneficiário', 'beneficiario']) || first(flat, [
      /(?:nome\s+do\s+titular|titular|favorecido|benefici[aá]rio)\s*[:=\-]?\s*(.+?)(?=\s+(?:cpf|pix|chave\s+pix|ag[eê]ncia|conta)\s*[:=\-]|\s*[|;]|$)/i,
    ]),
  );

  const cpf = valueFromSegments(segments, ['cpf do titular', 'cpf titular', 'cpf']) || first(flat, [
    /(?:cpf(?:\s+do\s+titular)?)\s*[:=\-]?\s*(\d{3}\.?\d{3}\.?\d{3}[-\s]?\d{2}|\d{11})/i,
  ]) || (flat.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0] || '');
  data.cpfTitular = cpf ? formatCpf(cpf) : '';

  const labelledPix = trimAtNextBankLabel(
    valueFromSegments(segments, ['chave pix', 'pix']) || first(flat, [
      /(?:chave\s+pix|pix)\s*[:=\-]?\s*(.+?)(?=\s+(?:tipo\s+(?:da\s+chave\s+)?pix|banco|ag[eê]ncia|conta|cpf|titular)\s*[:=\-]|\s*[|;]|$)/i,
    ]),
  );
  const inferredRandom = flat.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0] || '';
  data.chavePix = labelledPix || inferredRandom;
  data.tipoChavePix = first(flat, [/(?:tipo\s+da\s+chave\s+pix|tipo\s+pix)\s*[:=\-]?\s*(cpf|cnpj|telefone|celular|e-?mail|aleat[oó]ria|chave\s+aleat[oó]ria)/i]);
  data.tipoChavePix = data.tipoChavePix
    ? clean(data.tipoChavePix).replace(/^./, (char) => char.toUpperCase())
    : inferPixType(data.chavePix, flat);

  const identified = Object.entries(data)
    .filter(([key, value]) => key !== 'textoOriginal' && Boolean(clean(value)))
    .map(([key]) => key);
  const warnings: string[] = [];
  if (!original) warnings.push('Cole os dados bancários antes de analisar.');
  if (!data.banco) warnings.push('Banco não identificado.');
  if (!data.agencia) warnings.push('Agência não identificada.');
  if (!data.conta) warnings.push('Conta não identificada.');
  if (!data.titular) warnings.push('Titular não identificado.');
  if (!data.cpfTitular) warnings.push('CPF do titular não identificado.');
  if (!data.chavePix) warnings.push('Chave PIX não identificada.');
  if (data.chavePix && !data.tipoChavePix) warnings.push('Tipo da chave PIX ambíguo; revise antes de salvar.');

  return { data, identified, warnings };
};
