export type SmartConfidence = 'high' | 'medium' | 'low';
export type SmartFieldStatus = 'ok' | 'review' | 'missing' | 'invalid' | 'conflict';

export type SmartCandidate<T> = {
  value: T;
  display: string;
};

export type SmartField<T> = {
  value: T | null;
  display: string;
  confidence: SmartConfidence;
  status: SmartFieldStatus;
  message?: string;
  candidates?: SmartCandidate<T>[];
};

export type SmartCompanyValue = {
  id: string;
  name: string;
};

export type SmartBenefitValue = {
  enabled: boolean | null;
  dailyValue: number | null;
};

export type SmartAdmissionResult = {
  empresa: SmartField<SmartCompanyValue>;
  nome: SmartField<string>;
  cpf: SmartField<string>;
  rg: SmartField<string>;
  dataNascimento: SmartField<string>;
  dataAdmissao: SmartField<string>;
  funcao: SmartField<string>;
  setorGhe: SmartField<string>;
  obraLocal: SmartField<string>;
  salario: SmartField<number>;
  email: SmartField<string>;
  celular: SmartField<string>;
  vr: SmartField<SmartBenefitValue>;
  vt: SmartField<SmartBenefitValue>;
  insalubridade: SmartField<boolean>;
};

export type SmartCompanySource = {
  id: string;
  name?: string | null;
  nome?: string | null;
  razaoSocial?: string | null;
  razao_social?: string | null;
};

export type SmartInterpreterOptions = {
  companies?: SmartCompanySource[];
  roles?: string[];
};

type TextMatch<T> = {
  value: T;
  display: string;
  start: number;
  end: number;
  confidence: SmartConfidence;
  invalid?: boolean;
  message?: string;
};

const NOT_INFORMED = 'NÃO INFORMADO';

const stripAccents = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const normalizeSmartText = (value: unknown) => stripAccents(String(value ?? ''))
  .toLowerCase()
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const titleCase = (value: string) => value
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('pt-BR')
  .replace(/(^|[\s/(-])([a-záàâãéèêíïóôõöúçñ])/giu, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('pt-BR')}`);

const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export const formatSmartCpf = (value: unknown) => {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return String(value ?? '').trim();
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

export const isValidSmartCpf = (value: unknown) => {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const numbers = digits.split('').map(Number);
  for (let position = 9; position <= 10; position += 1) {
    let total = 0;
    for (let index = 0; index < position; index += 1) total += numbers[index] * (position + 1 - index);
    let digit = (total * 10) % 11;
    if (digit === 10) digit = 0;
    if (numbers[position] !== digit) return false;
  }
  return true;
};

export const formatSmartRg = (value: unknown) => {
  const digits = onlyDigits(value);
  if (digits.length === 9) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d)/, '$1.$2.$3-$4');
  return String(value ?? '').trim();
};

export const formatSmartPhone = (value: unknown) => {
  const digits = onlyDigits(value);
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return String(value ?? '').trim();
};

const formatDateDisplay = (iso: string) => {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
};

export const normalizeSmartDate = (value: unknown) => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const fullYear = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${fullYear.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

export const formatSmartMoney = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const parseMoney = (raw: string) => {
  const compact = raw.replace(/\s/g, '').replace(/^r\$/i, '');
  if (!compact) return null;
  let normalized = compact;
  if (compact.includes(',') && compact.includes('.')) normalized = compact.replace(/\./g, '').replace(',', '.');
  else if (compact.includes(',')) normalized = compact.replace(',', '.');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(compact)) normalized = compact.replace(/\./g, '');
  const number = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : null;
};

const missingField = <T>(): SmartField<T> => ({
  value: null,
  display: NOT_INFORMED,
  confidence: 'low',
  status: 'missing',
});

const uniqueMatches = <T>(matches: TextMatch<T>[], key: (value: T) => string) => {
  const map = new Map<string, TextMatch<T>>();
  matches.forEach((match) => {
    const id = key(match.value);
    if (!map.has(id)) map.set(id, match);
  });
  return [...map.values()];
};

const fieldFromMatches = <T>(matches: TextMatch<T>[], key: (value: T) => string): SmartField<T> => {
  const unique = uniqueMatches(matches, key);
  if (!unique.length) return missingField<T>();
  if (unique.length > 1) {
    return {
      value: null,
      display: 'CONFLITO ENCONTRADO',
      confidence: 'low',
      status: 'conflict',
      message: 'Foram encontradas informações diferentes para este campo.',
      candidates: unique.map(({ value, display }) => ({ value, display })),
    };
  }
  const item = unique[0];
  return {
    value: item.value,
    display: item.display,
    confidence: item.invalid ? 'low' : item.confidence,
    status: item.invalid ? 'invalid' : item.confidence === 'high' ? 'ok' : 'review',
    message: item.message,
  };
};

const findRegexMatches = (text: string, regex: RegExp) => {
  const result: RegExpExecArray[] = [];
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const matcher = new RegExp(regex.source, flags);
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) !== null) {
    result.push(match);
    if (match[0].length === 0) matcher.lastIndex += 1;
  }
  return result;
};

const normalizeCompanyLabel = (company: SmartCompanySource) => String(company.name || company.nome || company.razaoSocial || company.razao_social || '').trim();

const findCompanyMatches = (text: string, options: SmartInterpreterOptions): TextMatch<SmartCompanyValue>[] => {
  const normalized = normalizeSmartText(text);
  const found: TextMatch<SmartCompanyValue>[] = [];
  for (const company of options.companies || []) {
    const name = normalizeCompanyLabel(company);
    if (!name || !company.id) continue;
    const companyNormalized = normalizeSmartText(name);
    const exactIndex = normalized.indexOf(companyNormalized);
    let matched = exactIndex >= 0;
    let start = exactIndex;
    let end = exactIndex >= 0 ? exactIndex + companyNormalized.length : -1;

    if (!matched && companyNormalized.includes('topac')) {
      const qualifiers = [
        ['matriz', /\btopac\s+(?:sao paulo\s+)?matriz\b/i],
        ['praia', /\btopac\s+(?:filial\s+)?praia(?:\s+grande)?\b/i],
        ['goiania', /\btopac\s+(?:filial\s+)?goiania\b/i],
      ] as const;
      for (const [word, regex] of qualifiers) {
        if (!companyNormalized.includes(word)) continue;
        const alias = regex.exec(normalized);
        if (!alias) continue;
        matched = true;
        start = alias.index;
        end = alias.index + alias[0].length;
        break;
      }
    }

    if (matched) {
      found.push({
        value: { id: company.id, name },
        display: name.toLocaleUpperCase('pt-BR'),
        start: Math.max(start, 0),
        end: Math.max(end, 0),
        confidence: 'high',
      });
    }
  }
  return found;
};

const findEmailMatches = (text: string): TextMatch<string>[] => findRegexMatches(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)
  .map((match) => ({ value: match[0], display: match[0], start: match.index, end: match.index + match[0].length, confidence: 'high' as const }));

const findCpfMatches = (text: string): TextMatch<string>[] => {
  const explicit = findRegexMatches(text, /\bcpf\s*[:\-]?\s*((?:\d[.\s-]?){11})\b/gi).map((match) => {
    const digits = onlyDigits(match[1]);
    return {
      value: digits,
      display: formatSmartCpf(digits),
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'high' as const,
      invalid: !isValidSmartCpf(digits),
      message: isValidSmartCpf(digits) ? undefined : 'CPF com estrutura de 11 dígitos, mas o dígito verificador não confere. Revise sem alterar os números informados.',
    };
  });
  if (explicit.length) return explicit;

  return findRegexMatches(text, /(?<!\d)(\d{11})(?!\d)/g).map((match) => {
    const digits = onlyDigits(match[1]);
    return {
      value: digits,
      display: formatSmartCpf(digits),
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'medium' as const,
      invalid: !isValidSmartCpf(digits),
      message: isValidSmartCpf(digits) ? 'CPF identificado pelo formato. Recomenda-se conferência.' : 'Número de 11 dígitos identificado como possível CPF, porém o dígito verificador não confere. Revise.',
    };
  });
};

const findRgMatches = (text: string): TextMatch<string>[] => findRegexMatches(text, /\brg\s*[:\-]?\s*((?:\d[.\s-]?){7,10}[\dxX]?)/gi)
  .map((match) => {
    const raw = match[1].trim();
    const digits = onlyDigits(raw);
    return {
      value: digits || raw,
      display: formatSmartRg(digits || raw),
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'high' as const,
    };
  });

const DATE_SOURCE = '(\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4})';
const findDateMatches = (text: string, type: 'birth' | 'admission') => {
  const source = type === 'birth'
    ? `\\b(?:data\\s+(?:de\\s+)?nascimento|nascimento|nasceu)\\s*[:\\-]?\\s*${DATE_SOURCE}`
    : `\\b(?:data\\s+(?:de\\s+)?admiss[aã]o|admiss[aã]o|admitir|entra(?:\\s+dia)?|entrada|in[ií]cio)\\s*[:\\-]?\\s*${DATE_SOURCE}`;
  return findRegexMatches(text, new RegExp(source, 'gi')).flatMap((match) => {
    const raw = match[1];
    const iso = normalizeSmartDate(raw);
    if (!iso) return [];
    return [{ value: iso, display: formatDateDisplay(iso), start: match.index, end: match.index + match[0].length, confidence: 'high' as const }];
  });
};

const findUnlabeledDates = (text: string, occupied: Array<{ start: number; end: number }>) => findRegexMatches(text, /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g)
  .filter((match) => !occupied.some((range) => match.index >= range.start && match.index < range.end))
  .flatMap((match) => {
    const iso = normalizeSmartDate(match[0]);
    return iso ? [{ value: iso, display: formatDateDisplay(iso), start: match.index, end: match.index + match[0].length, confidence: 'medium' as const }] : [];
  });

const findSalaryMatches = (text: string): TextMatch<number>[] => {
  const matches: TextMatch<number>[] = [];
  findRegexMatches(text, /\b(?:sal[aá]rio|sal|remunera[cç][aã]o)(?:\s+inicial)?\s*[:\-]?\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d{3,7}(?:[.,]\d{1,2})?)(?:\s+inicial)?\b/gi).forEach((match) => {
    const value = parseMoney(match[1]);
    if (value === null) return;
    matches.push({ value, display: formatSmartMoney(value), start: match.index, end: match.index + match[0].length, confidence: 'high' });
  });
  return matches;
};

const findUnlabeledSalary = (text: string, occupied: Array<{ start: number; end: number }>): TextMatch<number>[] => {
  const matches = findRegexMatches(text, /(?<!\d)(\d{3,7}(?:[.,]\d{1,2})?)(?!\d)/g);
  return matches.flatMap((match) => {
    if (occupied.some((range) => match.index >= range.start && match.index < range.end)) return [];
    const value = parseMoney(match[1]);
    if (value === null || value < 500 || value > 1000000) return [];
    return [{ value, display: formatSmartMoney(value), start: match.index, end: match.index + match[0].length, confidence: 'medium' as const }];
  });
};

const findPhoneMatches = (text: string): TextMatch<string>[] => findRegexMatches(text, /\b(?:cel(?:ular)?|telefone|whatsapp)\s*[:\-]?\s*(\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4})\b/gi)
  .flatMap((match) => {
    const digits = onlyDigits(match[1]);
    if (![10, 11].includes(digits.length)) return [];
    return [{ value: digits, display: formatSmartPhone(digits), start: match.index, end: match.index + match[0].length, confidence: 'high' as const }];
  });

const benefitPattern = (kind: 'vr' | 'vt') => kind === 'vr'
  ? /\b(?:vr|vale[\s-]*refei[cç][aã]o|refei[cç][aã]o|alimenta[cç][aã]o)\b/gi
  : /\b(?:vt|vale[\s-]*transporte|transporte)\b/gi;

const findBenefitMatches = (text: string, kind: 'vr' | 'vt'): TextMatch<SmartBenefitValue>[] => {
  const labels = findRegexMatches(text, benefitPattern(kind));
  const results: TextMatch<SmartBenefitValue>[] = [];
  for (const label of labels) {
    const nextLabelIndexes = [
      ...findRegexMatches(text.slice(label.index + label[0].length), /\b(?:vr|vt|vale[\s-]*(?:refei[cç][aã]o|transporte)|insalubridade|cpf|rg|cel(?:ular)?|telefone|whatsapp|sal[aá]rio|admiss[aã]o|nascimento|email|e-mail)\b/gi).map((match) => label.index + label[0].length + match.index),
      text.length,
    ];
    const end = Math.min(...nextLabelIndexes.filter((index) => index > label.index));
    const segment = text.slice(label.index, Math.min(end, label.index + 90));
    const normalized = normalizeSmartText(segment);
    const negative = /\b(?:nao|não|sem|nao recebe|não recebe)\b/i.test(segment);
    const positive = /\b(?:sim|recebe|vai receber)\b/i.test(segment);
    const amountMatch = segment.match(/(?:r\$\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:reais?)?(?:\s*(?:\/|por\s+)?dia)?/i);
    let amount = amountMatch ? parseMoney(amountMatch[1]) : null;
    if (amount !== null && amount > 500) amount = null;
    const explicitlyUnknown = /(?:ainda\s+)?(?:nao|não)\s+sei(?:\s+o)?\s+valor|sem\s+valor|valor\s+depois|valor\s+ainda\s+(?:nao|não)\s+definido|ainda\s+(?:nao|não)\s+definido/i.test(segment);

    let enabled: boolean | null = null;
    if (negative && !explicitlyUnknown) enabled = false;
    else if (positive || amount !== null || explicitlyUnknown) enabled = true;

    if (enabled === null) continue;
    const display = enabled
      ? amount !== null
        ? `${kind.toUpperCase()}: SIM — ${formatSmartMoney(amount)}/dia`
        : `${kind.toUpperCase()}: SIM — valor ainda não informado`
      : `${kind.toUpperCase()}: NÃO`;

    results.push({
      value: { enabled, dailyValue: enabled ? amount : null },
      display,
      start: label.index,
      end: Math.max(label.index + label[0].length, amountMatch ? label.index + (amountMatch.index || 0) + amountMatch[0].length : label.index + label[0].length),
      confidence: positive || negative || explicitlyUnknown ? 'high' : 'medium',
      message: normalized.includes('transporte') && kind === 'vr' ? 'Revise o benefício identificado.' : undefined,
    });
  }
  return results;
};

const findInsalubridadeMatches = (text: string): TextMatch<boolean>[] => {
  const results: TextMatch<boolean>[] = [];
  findRegexMatches(text, /\b(?:sem\s+insalubridade|(?:nao|não)\s+(?:tem|recebe)\s+insalubridade|insalubridade\s*[:\-]?\s*(?:nao|não|sem|0))\b/gi).forEach((match) => {
    results.push({ value: false, display: 'NÃO', start: match.index, end: match.index + match[0].length, confidence: 'high' });
  });
  findRegexMatches(text, /\binsalubridade\s*[:\-]?\s*(?:sim|recebe|com)\b/gi).forEach((match) => {
    results.push({ value: true, display: 'SIM', start: match.index, end: match.index + match[0].length, confidence: 'high' });
  });
  return results;
};

const findLabeledText = (text: string, labels: string[], stopWords: string[]): TextMatch<string>[] => {
  const labelSource = labels.join('|');
  const stopSource = stopWords.join('|');
  const regex = new RegExp(`\\b(?:${labelSource})\\s*[:\\-]?\\s*([^\\n,;]+?)(?=\\s+\\b(?:${stopSource})\\b|$)`, 'gi');
  return findRegexMatches(text, regex).flatMap((match) => {
    const value = match[1].trim().replace(/[.;,]+$/, '');
    return value ? [{ value, display: value, start: match.index, end: match.index + match[0].length, confidence: 'high' as const }] : [];
  });
};

const findRoleMatches = (text: string, roles: string[]): TextMatch<string>[] => {
  const normalized = normalizeSmartText(text);
  return roles
    .filter(Boolean)
    .map((role) => ({ role, normalizedRole: normalizeSmartText(role) }))
    .filter(({ normalizedRole }) => normalizedRole.length >= 3 && normalized.includes(normalizedRole))
    .map(({ role, normalizedRole }) => {
      const start = normalized.indexOf(normalizedRole);
      return { value: titleCase(role), display: titleCase(role), start, end: start + normalizedRole.length, confidence: 'high' as const };
    });
};

const maskRanges = (text: string, ranges: Array<{ start: number; end: number }>) => {
  const chars = [...text];
  ranges.forEach(({ start, end }) => {
    for (let index = Math.max(0, start); index < Math.min(chars.length, end); index += 1) chars[index] = ' ';
  });
  return chars.join(' ');
};

const findNameMatches = (text: string, occupied: Array<{ start: number; end: number }>): TextMatch<string>[] => {
  const masked = maskRanges(text, occupied)
    .replace(/\b(?:sal[aá]rio|sal|inicial|admiss[aã]o|admitir|entrada|entra|in[ií]cio|nascimento|nasceu|cpf|rg|cel(?:ular)?|telefone|whatsapp|email|e-mail|empresa|contratante|fun[cç][aã]o|cargo|setor|ghe|obra|local|vr|vt|vale|refei[cç][aã]o|transporte|alimenta[cç][aã]o|insalubridade|sim|nao|não|sem|valor|dia|reais?)\b/gi, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^\p{L}\s'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const titleCandidates = findRegexMatches(masked, /\b([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][\p{L}'’-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][\p{L}'’-]+){1,5})\b/gu);
  if (titleCandidates.length) {
    return titleCandidates.map((match) => ({ value: match[1].trim(), display: match[1].trim(), start: match.index, end: match.index + match[0].length, confidence: 'high' as const }));
  }

  const words = masked.split(/\s+/).filter((word) => word.length >= 2);
  if (words.length >= 2 && words.length <= 6) {
    const value = titleCase(words.join(' '));
    return [{ value, display: value, start: 0, end: text.length, confidence: 'medium' }];
  }
  return [];
};

const benefitKey = (value: SmartBenefitValue) => `${value.enabled === null ? 'null' : value.enabled ? '1' : '0'}:${value.dailyValue ?? ''}`;

export const interpretarPreCadastroLivre = (rawText: string, options: SmartInterpreterOptions = {}): SmartAdmissionResult => {
  const text = String(rawText || '').trim();
  if (!text) {
    return {
      empresa: missingField(), nome: missingField(), cpf: missingField(), rg: missingField(), dataNascimento: missingField(), dataAdmissao: missingField(),
      funcao: missingField(), setorGhe: missingField(), obraLocal: missingField(), salario: missingField(), email: missingField(), celular: missingField(),
      vr: missingField(), vt: missingField(), insalubridade: missingField(),
    };
  }

  const companyMatches = findCompanyMatches(text, options);
  const emailMatches = findEmailMatches(text);
  const cpfMatches = findCpfMatches(text);
  const rgMatches = findRgMatches(text);
  const birthMatches = findDateMatches(text, 'birth');
  const admissionMatches = findDateMatches(text, 'admission');
  const phoneMatches = findPhoneMatches(text);
  const vrMatches = findBenefitMatches(text, 'vr');
  const vtMatches = findBenefitMatches(text, 'vt');
  const insalubridadeMatches = findInsalubridadeMatches(text);
  const roleMatches = findRoleMatches(text, options.roles || []);
  const setorMatches = findLabeledText(text, ['setor(?:\\s*\\/\\s*ghe)?', 'ghe'], ['obra', 'local', 'sal[aá]rio', 'email', 'e-mail', 'celular', 'telefone', 'vr', 'vt', 'insalubridade']);
  const obraMatches = findLabeledText(text, ['obra(?:\\s*\\/\\s*local)?', 'local'], ['setor', 'ghe', 'sal[aá]rio', 'email', 'e-mail', 'celular', 'telefone', 'vr', 'vt', 'insalubridade']);
  const salaryMatches = findSalaryMatches(text);

  const occupiedBeforeDates = [companyMatches, emailMatches, cpfMatches, rgMatches, birthMatches, admissionMatches, phoneMatches, vrMatches, vtMatches, insalubridadeMatches, roleMatches, setorMatches, obraMatches, salaryMatches].flat();
  const unlabeledDates = findUnlabeledDates(text, occupiedBeforeDates);
  if (!birthMatches.length && unlabeledDates.length === 1) birthMatches.push(unlabeledDates[0]);
  else if (!birthMatches.length && admissionMatches.length && unlabeledDates.length) {
    const admissionDateValues = new Set(admissionMatches.map((item) => item.value));
    const remaining = unlabeledDates.filter((item) => !admissionDateValues.has(item.value));
    if (remaining.length === 1) birthMatches.push(remaining[0]);
  }

  const occupiedBeforeSalary = [companyMatches, emailMatches, cpfMatches, rgMatches, birthMatches, admissionMatches, phoneMatches, vrMatches, vtMatches, insalubridadeMatches, roleMatches, setorMatches, obraMatches, salaryMatches].flat();
  if (!salaryMatches.length) salaryMatches.push(...findUnlabeledSalary(text, occupiedBeforeSalary));

  const occupiedBeforeName = [companyMatches, emailMatches, cpfMatches, rgMatches, birthMatches, admissionMatches, phoneMatches, vrMatches, vtMatches, insalubridadeMatches, roleMatches, setorMatches, obraMatches, salaryMatches].flat();
  const nameMatches = findNameMatches(text, occupiedBeforeName);

  return {
    empresa: fieldFromMatches(companyMatches, (value) => value.id),
    nome: fieldFromMatches(nameMatches, normalizeSmartText),
    cpf: fieldFromMatches(cpfMatches, onlyDigits),
    rg: fieldFromMatches(rgMatches, onlyDigits),
    dataNascimento: fieldFromMatches(birthMatches, (value) => value),
    dataAdmissao: fieldFromMatches(admissionMatches, (value) => value),
    funcao: fieldFromMatches(roleMatches, normalizeSmartText),
    setorGhe: fieldFromMatches(setorMatches, normalizeSmartText),
    obraLocal: fieldFromMatches(obraMatches, normalizeSmartText),
    salario: fieldFromMatches(salaryMatches, (value) => value.toFixed(2)),
    email: fieldFromMatches(emailMatches, (value) => value.toLocaleLowerCase()),
    celular: fieldFromMatches(phoneMatches, onlyDigits),
    vr: fieldFromMatches(vrMatches, benefitKey),
    vt: fieldFromMatches(vtMatches, benefitKey),
    insalubridade: fieldFromMatches(insalubridadeMatches, (value) => value ? '1' : '0'),
  };
};

export const SMART_FIELD_ORDER = [
  'empresa', 'nome', 'cpf', 'rg', 'dataNascimento', 'dataAdmissao', 'funcao', 'setorGhe', 'obraLocal', 'salario', 'email', 'celular', 'vr', 'vt', 'insalubridade',
] as const;

export const SMART_FIELD_LABELS: Record<(typeof SMART_FIELD_ORDER)[number], string> = {
  empresa: 'Empresa contratante',
  nome: 'Nome',
  cpf: 'CPF',
  rg: 'RG',
  dataNascimento: 'Data de nascimento',
  dataAdmissao: 'Data de admissão',
  funcao: 'Função',
  setorGhe: 'Setor/GHE',
  obraLocal: 'Obra/Local',
  salario: 'Salário',
  email: 'E-mail',
  celular: 'Celular',
  vr: 'VR',
  vt: 'VT',
  insalubridade: 'Insalubridade',
};

export const SMART_NOT_INFORMED = NOT_INFORMED;
