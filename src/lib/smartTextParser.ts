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
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sanitizeMessage = (value: unknown) => String(value || '')
  .replace(/\r/g, '')
  .replace(/[*_`]/g, '')
  .replace(/^[\s•●▪◦►▶➤➜✓✔-]+/gm, '')
  .trim();

const splitSegments = (text: string) => text
  .split(/\n+|\s*[|;]\s*/)
  .map(clean)
  .filter(Boolean);

const first = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
};

const valueFromSegments = (segments: string[], labels: string[]) => {
  const labelPattern = labels.map(escapeRegex).join('|');
  const pattern = new RegExp(`^(?:${labelPattern})\\s*[:=\\-]?\\s*(.+)$`, 'i');
  for (const segment of segments) {
    const match = segment.match(pattern);
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
  const number = digits(value).replace(/^55(?=\d{10,11}$)/, '');
  if (number.length === 11) return `(${number.slice(0, 2)}) ${number.slice(2, 7)}-${number.slice(7)}`;
  if (number.length === 10) return `(${number.slice(0, 2)}) ${number.slice(2, 6)}-${number.slice(6)}`;
  return clean(value);
};

const removeTrailingLabels = (value: string) => clean(value)
  .replace(/\s+(?:cpf|rg|identidade|cargo|fun[cç][aã]o|sal[aá]rio|remunera[cç][aã]o|admiss[aã]o|telefone|fone|celular|whatsapp|e-?mail|endere[cç]o|banco|ag[eê]ncia|conta|pix|chave\s+pix)\s*[:=\-].*$/i, '')
  .replace(/[|;,]+$/g, '')
  .trim();

export const emptyEmployeeSmartData = (): EmployeeSmartData => ({
  nome: '', cpf: '', rg: '', cargo: '', salarioBase: '', dataAdmissao: '',
  telefone: '', celular: '', email: '', endereco: '', banking: parseBankingText('').data,
});

export const parseEmployeeTextLocally = (rawText: string): EmployeeSmartParseResult => {
  const original = sanitizeMessage(rawText);
  const segments = splitSegments(original);
  const flat = original.replace(/\n+/g, ' | ').replace(/\s+/g, ' ').trim();
  const data = emptyEmployeeSmartData();

  data.nome = removeTrailingLabels(
    valueFromSegments(segments, ['nome completo', 'nome do funcionário', 'nome do funcionario', 'nome do colaborador', 'funcionário', 'funcionario', 'colaborador', 'nome']) || first(flat, [
      /(?:nome\s+completo|nome\s+do\s+(?:funcion[aá]rio|colaborador)|funcion[aá]rio|colaborador|nome)\s*[:=\-]?\s*(.+?)(?=\s+(?:cpf|rg|identidade|cargo|fun[cç][aã]o|sal[aá]rio|admiss[aã]o|telefone|celular|e-?mail|endere[cç]o|banco)\s*[:=\-]|\s*[|;]|$)/i,
    ]),
  );

  const cpf = valueFromSegments(segments, ['cpf', 'cpf do funcionário', 'cpf do funcionario', 'cpf do colaborador']) || first(flat, [
    /\bcpf\s*[:=\-]?\s*(\d{3}\.?\d{3}\.?\d{3}[-\s]?\d{2}|\d{11})\b/i,
  ]) || flat.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0] || '';
  data.cpf = cpf ? formatCpf(cpf) : '';

  data.rg = removeTrailingLabels(
    valueFromSegments(segments, ['rg', 'identidade', 'registro geral']) || first(flat, [
      /\brg\s*[:=\-]?\s*([0-9A-Z./-]{4,25})\b/i,
      /\bidentidade\s*[:=\-]?\s*([0-9A-Z./-]{4,25})\b/i,
    ]),
  );

  data.cargo = removeTrailingLabels(
    valueFromSegments(segments, ['cargo / função', 'cargo / funcao', 'cargo/função', 'cargo/funcao', 'cargo', 'função', 'funcao']) || first(flat, [
      /(?:cargo\s*\/\s*fun[cç][aã]o|cargo|fun[cç][aã]o)\s*[:=\-]?\s*(.+?)(?=\s+(?:sal[aá]rio|remunera[cç][aã]o|admiss[aã]o|telefone|celular|e-?mail|endere[cç]o|banco)\s*[:=\-]|\s*[|;]|$)/i,
    ]),
  );

  data.salarioBase = normalizeMoney(
    valueFromSegments(segments, ['salário base', 'salario base', 'salário', 'salario', 'remuneração', 'remuneracao']) || first(flat, [
      /(?:sal[aá]rio\s+base|sal[aá]rio|remunera[cç][aã]o)\s*[:=\-]?\s*(?:R\$\s*)?([0-9.,]+)/i,
    ]),
  );

  data.dataAdmissao = normalizeDateInput(
    removeTrailingLabels(valueFromSegments(segments, ['data de admissão', 'data de admissao', 'admissão', 'admissao', 'admitido em']) || first(flat, [
      /(?:data\s+de\s+admiss[aã]o|admiss[aã]o|admitido\s+em)\s*[:=\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2})/i,
    ])),
  );

  const phonePattern = /((?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4})/i;
  const labelledCell = valueFromSegments(segments, ['celular', 'whatsapp', 'whats']) || first(flat, [
    new RegExp(`(?:celular|whatsapp|whats)\\s*[:=\\-]?\\s*${phonePattern.source}`, 'i'),
  ]);
  const labelledPhone = valueFromSegments(segments, ['telefone', 'fone']) || first(flat, [
    new RegExp(`(?:telefone|fone)\\s*[:=\\-]?\\s*${phonePattern.source}`, 'i'),
  ]);
  data.celular = normalizePhone(removeTrailingLabels(labelledCell));
  data.telefone = normalizePhone(removeTrailingLabels(labelledPhone));
  if (!data.celular && !data.telefone) {
    const genericPhone = flat.match(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]\d{4}/)?.[0] || '';
    data.celular = normalizePhone(genericPhone);
  }

  data.email = removeTrailingLabels(
    valueFromSegments(segments, ['e-mail', 'email', 'e mail']) || first(flat, [
      /(?:e-?mail)\s*[:=\-]?\s*([^\s|;,]+@[^\s|;,]+\.[A-Z]{2,})/i,
    ]) || flat.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || '',
  );

  data.endereco = removeTrailingLabels(
    valueFromSegments(segments, ['endereço completo', 'endereco completo', 'endereço', 'endereco', 'residência', 'residencia']) || first(flat, [
      /(?:endere[cç]o\s+completo|endere[cç]o|resid[eê]ncia)\s*[:=\-]?\s*(.+?)(?=\s+(?:banco|ag[eê]ncia|conta|pix|chave\s+pix)\s*[:=\-]|\s*[|;]|$)/i,
    ]),
  );

  const bankingResult = parseBankingText(original);
  data.banking = bankingResult.data;
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
  if (!data.nome && !data.cpf) warnings.push('Identidade não confirmada; confira o funcionário de destino antes de aplicar.');
  if (!data.cargo) warnings.push('Cargo ou função não identificado.');
  if (!data.dataAdmissao) warnings.push('Data de admissão não identificada.');
  warnings.push(...bankingResult.warnings.filter((warning) => warning.includes('ambíguo')));

  return { data, identified, warnings };
};

const preferDeterministic = (localValue: string, remoteValue: unknown) => clean(localValue) || clean(remoteValue);

export const mergeEmployeeSmartData = (
  local: EmployeeSmartData,
  remote?: Partial<EmployeeSmartData> | null,
): EmployeeSmartData => {
  const source = remote || {};
  const remoteBanking = (source.banking || {}) as Partial<BankingData>;
  return {
    nome: preferDeterministic(local.nome, source.nome),
    cpf: formatCpf(preferDeterministic(local.cpf, source.cpf)),
    rg: preferDeterministic(local.rg, source.rg),
    cargo: preferDeterministic(local.cargo, source.cargo),
    salarioBase: normalizeMoney(preferDeterministic(local.salarioBase, source.salarioBase)),
    dataAdmissao: normalizeDateInput(preferDeterministic(local.dataAdmissao, source.dataAdmissao)),
    telefone: normalizePhone(preferDeterministic(local.telefone, source.telefone)),
    celular: normalizePhone(preferDeterministic(local.celular, source.celular)),
    email: preferDeterministic(local.email, source.email),
    endereco: preferDeterministic(local.endereco, source.endereco),
    banking: {
      banco: preferDeterministic(local.banking.banco, remoteBanking.banco),
      bancoCodigo: preferDeterministic(local.banking.bancoCodigo, remoteBanking.bancoCodigo),
      agencia: preferDeterministic(local.banking.agencia, remoteBanking.agencia),
      conta: preferDeterministic(local.banking.conta, remoteBanking.conta),
      digito: preferDeterministic(local.banking.digito, remoteBanking.digito),
      tipoConta: preferDeterministic(local.banking.tipoConta, remoteBanking.tipoConta),
      titular: preferDeterministic(local.banking.titular, remoteBanking.titular),
      cpfTitular: preferDeterministic(local.banking.cpfTitular, remoteBanking.cpfTitular),
      chavePix: preferDeterministic(local.banking.chavePix, remoteBanking.chavePix),
      tipoChavePix: preferDeterministic(local.banking.tipoChavePix, remoteBanking.tipoChavePix),
      textoOriginal: local.banking.textoOriginal,
    },
  };
};
