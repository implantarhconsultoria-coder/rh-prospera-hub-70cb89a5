import { parseBankingText, type BankingData } from './bankingParser';

export type EmployeeSmartData = {
  nome: string;
  cpf: string;
  rg: string;
  cargo: string;
  salarioBase: string;
  dataAdmissao: string;
  telefone: string;
  celular: string;
  email: string;
  endereco: string;
  banking: BankingData;
};

export type EmployeeSmartParseResult = {
  data: EmployeeSmartData;
  identified: string[];
  warnings: string[];
};

const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');

const first = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
};

export const formatCpf = (value: string) => {
  const number = digits(value);
  if (number.length !== 11) return clean(value);
  return `${number.slice(0, 3)}.${number.slice(3, 6)}.${number.slice(6, 9)}-${number.slice(9)}`;
};

export const normalizeDateInput = (value: string) => {
  const raw = clean(value);
  const br = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? raw : '';
};

const normalizeMoney = (value: string) => {
  const raw = clean(value).replace(/R\$/gi, '').replace(/\s/g, '');
  if (!raw) return '';
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,(?=\d{3}\b)/g, '');
  const amount = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(amount) ? String(amount) : '';
};

const normalizePhone = (value: string) => {
  const number = digits(value);
  if (number.length === 11) return `(${number.slice(0, 2)}) ${number.slice(2, 7)}-${number.slice(7)}`;
  if (number.length === 10) return `(${number.slice(0, 2)}) ${number.slice(2, 6)}-${number.slice(6)}`;
  return clean(value);
};

const removeTrailingLabels = (value: string) => clean(value)
  .replace(/\s+(?:cpf|rg|cargo|fun[cç][aã]o|sal[aá]rio|admiss[aã]o|telefone|celular|e-?mail|endere[cç]o|banco|ag[eê]ncia|conta|pix)\b.*$/i, '')
  .replace(/[|;,]+$/g, '')
  .trim();

export const emptyEmployeeSmartData = (): EmployeeSmartData => ({
  nome: '', cpf: '', rg: '', cargo: '', salarioBase: '', dataAdmissao: '',
  telefone: '', celular: '', email: '', endereco: '', banking: parseBankingText('').data,
});

export const parseEmployeeTextLocally = (rawText: string): EmployeeSmartParseResult => {
  const original = String(rawText || '').replace(/\r/g, '').trim();
  const flat = original.replace(/\n+/g, ' | ').replace(/\s+/g, ' ').trim();
  const data = emptyEmployeeSmartData();

  data.nome = removeTrailingLabels(first(flat, [
    /(?:nome\s+completo|nome\s+do\s+(?:funcion[aá]rio|colaborador)|funcion[aá]rio|colaborador|nome)\s*[:-]?\s*([^|]{3,120})/i,
  ]));

  const cpf = first(flat, [
    /\bcpf\s*[:-]?\s*(\d{3}\.?\d{3}\.?\d{3}[-\s]?\d{2}|\d{11})\b/i,
  ]) || flat.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0] || '';
  data.cpf = cpf ? formatCpf(cpf) : '';

  data.rg = first(flat, [
    /\brg\s*[:-]?\s*([0-9A-Z./-]{4,25})\b/i,
    /\bidentidade\s*[:-]?\s*([0-9A-Z./-]{4,25})\b/i,
  ]);

  data.cargo = removeTrailingLabels(first(flat, [
    /(?:cargo\s*\/\s*fun[cç][aã]o|cargo|fun[cç][aã]o)\s*[:-]?\s*([^|]{2,100})/i,
  ]));

  data.salarioBase = normalizeMoney(first(flat, [
    /(?:sal[aá]rio\s+base|sal[aá]rio|remunera[cç][aã]o)\s*[:-]?\s*(?:R\$\s*)?([0-9.,]+)/i,
  ]));

  data.dataAdmissao = normalizeDateInput(first(flat, [
    /(?:data\s+de\s+admiss[aã]o|admiss[aã]o|admitido\s+em)\s*[:-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2})/i,
  ]));

  const labelledCell = first(flat, [/(?:celular|whatsapp|whats)\s*[:-]?\s*(\+?\d[\d\s().-]{8,20})/i]);
  const labelledPhone = first(flat, [/(?:telefone|fone)\s*[:-]?\s*(\+?\d[\d\s().-]{8,20})/i]);
  data.celular = normalizePhone(labelledCell);
  data.telefone = normalizePhone(labelledPhone);
  if (!data.celular && !data.telefone) {
    const genericPhone = flat.match(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/)?.[0] || '';
    data.celular = normalizePhone(genericPhone);
  }

  data.email = first(flat, [/(?:e-?mail)\s*[:-]?\s*([^\s|;,]+@[^\s|;,]+\.[A-Z]{2,})/i]) ||
    flat.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || '';

  data.endereco = removeTrailingLabels(first(flat, [
    /(?:endere[cç]o\s+completo|endere[cç]o|resid[eê]ncia)\s*[:-]?\s*([^|]{5,180})/i,
  ]));

  data.banking = parseBankingText(original).data;
  if (!data.banking.titular && data.nome) data.banking.titular = data.nome;
  if (!data.banking.cpfTitular && data.cpf) data.banking.cpfTitular = data.cpf;

  const identified = Object.entries(data)
    .filter(([key, value]) => key === 'banking'
      ? Object.entries(value as BankingData).some(([field, fieldValue]) => field !== 'textoOriginal' && Boolean(clean(fieldValue)))
      : Boolean(clean(value)))
    .map(([key]) => key);

  const warnings: string[] = [];
  if (!original) warnings.push('Cole uma mensagem antes de analisar.');
  if (!data.nome) warnings.push('Nome não identificado.');
  if (!data.cpf) warnings.push('CPF não identificado.');
  if (!data.cargo) warnings.push('Cargo ou função não identificado.');
  if (!data.dataAdmissao) warnings.push('Data de admissão não identificada.');

  return { data, identified, warnings };
};

export const mergeEmployeeSmartData = (
  local: EmployeeSmartData,
  remote?: Partial<EmployeeSmartData> | null,
): EmployeeSmartData => {
  const source = remote || {};
  const choose = (remoteValue: unknown, localValue: string) => clean(remoteValue) || localValue;
  return {
    nome: choose(source.nome, local.nome),
    cpf: formatCpf(choose(source.cpf, local.cpf)),
    rg: choose(source.rg, local.rg),
    cargo: choose(source.cargo, local.cargo),
    salarioBase: normalizeMoney(choose(source.salarioBase, local.salarioBase)),
    dataAdmissao: normalizeDateInput(choose(source.dataAdmissao, local.dataAdmissao)),
    telefone: normalizePhone(choose(source.telefone, local.telefone)),
    celular: normalizePhone(choose(source.celular, local.celular)),
    email: choose(source.email, local.email),
    endereco: choose(source.endereco, local.endereco),
    banking: {
      ...local.banking,
      ...((source.banking || {}) as Partial<BankingData>),
      textoOriginal: local.banking.textoOriginal,
    },
  };
};
