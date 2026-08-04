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
const first = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
};

const formatCpf = (value: string) => {
  const number = digits(value);
  return number.length === 11
    ? `${number.slice(0, 3)}.${number.slice(3, 6)}.${number.slice(6, 9)}-${number.slice(9)}`
    : clean(value);
};

const inferPixType = (key: string) => {
  const value = clean(key);
  const number = digits(value);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'E-mail';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return 'Chave aleatória';
  if (number.length === 11 && !value.startsWith('+')) return 'CPF';
  if (number.length >= 10 && number.length <= 13) return 'Telefone';
  if (number.length === 14) return 'CNPJ';
  return value ? 'Outro' : '';
};

export const parseBankingText = (rawText: string): BankingParseResult => {
  const original = String(rawText || '').replace(/\r/g, '').trim();
  const flat = original.replace(/\n+/g, ' | ').replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const data = emptyBankingData();
  data.textoOriginal = original;

  const bankByName = BANKS.find((bank) => bank.aliases.some((alias) => lower.includes(alias)));
  const explicitBank = first(flat, [/(?:banco|institui[cç][aã]o)\s*[:\-]?\s*([^|,;\n]{2,60})/i])
    .replace(/\s+(?:ag[eê]ncia|conta|pix).*$/i, '').trim();
  const bankCode = first(flat, [/(?:c[oó]digo\s+do\s+banco|c[oó]d\.?\s*banco|banco\s+c[oó]digo)\s*[:\-]?\s*(\d{3})/i]);
  const bankByCode = BANKS.find((bank) => bank.code === bankCode);
  data.banco = bankByName?.name || bankByCode?.name || explicitBank;
  data.bancoCodigo = bankCode || bankByName?.code || '';

  data.agencia = first(flat, [/(?:ag[eê]ncia|ag\.)\s*[:\-]?\s*([0-9A-Za-z.-]{1,15})/i])
    .replace(/[^0-9A-Za-z.-]/g, '');

  const accountRaw = first(flat, [/(?:n[uú]mero\s+da\s+conta|conta(?:\s+(?:corrente|poupan[cç]a|sal[aá]rio|pagamento))?|c\/c)\s*[:\-]?\s*([0-9A-Za-z.\/-]+(?:\s*[-/]\s*[0-9A-Za-z])?)/i]);
  const accountMatch = accountRaw.match(/^(.+?)[-\/]([0-9A-Za-z])$/);
  data.conta = clean(accountMatch?.[1] || accountRaw).replace(/\s/g, '');
  data.digito = clean(accountMatch?.[2] || first(flat, [/(?:d[ií]gito|d[ií]g\.?|dv)\s*[:\-]?\s*([0-9A-Za-z])/i]));

  const accountType = first(flat, [/(?:tipo\s+de\s+conta|conta)\s*[:\-]?\s*(corrente|poupan[cç]a|sal[aá]rio|pagamento)/i]) ||
    (lower.match(/conta\s+(corrente|poupan[cç]a|sal[aá]rio|pagamento)/i)?.[1] || '');
  data.tipoConta = clean(accountType).replace(/^./, (char) => char.toUpperCase());

  data.titular = first(flat, [/(?:nome\s+do\s+titular|titular|favorecido|benefici[aá]rio)\s*[:\-]?\s*([^|,;\n]{3,100})/i])
    .replace(/\s+(?:cpf|pix|ag[eê]ncia|conta).*$/i, '').trim();

  const cpf = first(flat, [/(?:cpf(?:\s+do\s+titular)?)\s*[:\-]?\s*(\d{3}\.?\d{3}\.?\d{3}[-\s]?\d{2}|\d{11})/i]) ||
    (flat.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0] || '');
  data.cpfTitular = cpf ? formatCpf(cpf) : '';

  const labelledPix = first(flat, [/(?:chave\s+pix|pix)\s*[:\-]?\s*([^|,;\n]{3,120})/i])
    .replace(/\s+(?:tipo\s+da\s+chave|tipo\s+pix).*$/i, '').trim();
  const inferredEmail = flat.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || '';
  const inferredRandom = flat.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0] || '';
  data.chavePix = labelledPix || inferredRandom || inferredEmail;
  data.tipoChavePix = first(flat, [/(?:tipo\s+da\s+chave\s+pix|tipo\s+pix)\s*[:\-]?\s*(cpf|cnpj|telefone|celular|e-?mail|aleat[oó]ria|chave\s+aleat[oó]ria)/i]);
  data.tipoChavePix = data.tipoChavePix
    ? clean(data.tipoChavePix).replace(/^./, (char) => char.toUpperCase())
    : inferPixType(data.chavePix);

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

  return { data, identified, warnings };
};
