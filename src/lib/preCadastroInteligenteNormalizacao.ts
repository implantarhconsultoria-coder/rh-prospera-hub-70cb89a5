import {
  formatSmartCpf,
  formatSmartMoney,
  formatSmartPhone,
  formatSmartRg,
  interpretarPreCadastroLivre,
  isValidSmartCpf,
  normalizeSmartDate,
  normalizeSmartText,
  type SmartAdmissionResult,
  type SmartBenefitValue,
  type SmartCandidate,
  type SmartCompanyValue,
  type SmartField,
  type SmartInterpreterOptions,
} from '@/lib/preCadastroInteligente';

const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const isLikelyBrazilianMobile = (digits: string) => /^[1-9][1-9]9\d{8}$/.test(digits);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const titleCase = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR').replace(/(^|\s)([a-záàâãéèêíïóôõöúçñ])/giu, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('pt-BR')}`);

const missingField = <T>(): SmartField<T> => ({
  value: null,
  display: 'NÃO INFORMADO',
  confidence: 'low',
  status: 'missing',
});

const okField = <T>(value: T, display: string, confidence: 'high' | 'medium' = 'high'): SmartField<T> => ({
  value,
  display,
  confidence,
  status: confidence === 'high' ? 'ok' : 'review',
});

const isExplicitlyMissing = (value: string) => /^(?:n[aã]o\s+informad[oa]|sem\s+informa[cç][aã]o|n\/?a|-)$/i.test(value.trim());

const parseMoney = (raw: string) => {
  const compact = String(raw || '').replace(/\s/g, '').replace(/^r\$/i, '');
  if (!compact) return null;
  let normalized = compact;
  if (compact.includes(',') && compact.includes('.')) normalized = compact.replace(/\./g, '').replace(',', '.');
  else if (compact.includes(',')) normalized = compact.replace(',', '.');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(compact)) normalized = compact.replace(/\./g, '');
  const number = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : null;
};

const normalizeStructuredInput = (rawText: string) => String(rawText || '')
  .split(/\r?\n/)
  .map((line) => line
    .replace(/^\s*(?:[-•]\s*)?(?:\d{1,2}[.)]\s*)?/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s*(?:=>|→|->)\s*/g, ': ')
    .trim())
  .filter(Boolean)
  .join('\n');

type StructuredKey = keyof SmartAdmissionResult;
type StructuredRow = { key: StructuredKey; value: string };

const structuredKeyFromLabel = (rawLabel: string): StructuredKey | null => {
  const label = normalizeSmartText(rawLabel)
    .replace(/[.*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^(?:empresa(?:\s+contratante)?|contratante)$/.test(label)) return 'empresa';
  if (/^(?:nome|nome completo)$/.test(label)) return 'nome';
  if (label === 'cpf') return 'cpf';
  if (label === 'rg') return 'rg';
  if (/^(?:data\s+(?:de\s+)?nascimento|nascimento)$/.test(label)) return 'dataNascimento';
  if (/^(?:data\s+(?:de\s+)?admissao|admissao)$/.test(label)) return 'dataAdmissao';
  if (/^(?:funcao|cargo)$/.test(label)) return 'funcao';
  if (/^(?:setor\s*\/\s*ghe|setor|ghe)$/.test(label)) return 'setorGhe';
  if (/^(?:obra\s*\/\s*local|obra|local)$/.test(label)) return 'obraLocal';
  if (/^(?:salario|remuneracao)$/.test(label)) return 'salario';
  if (/^(?:e-mail|email)$/.test(label)) return 'email';
  if (/^(?:celular|telefone|whatsapp)$/.test(label)) return 'celular';
  if (/^(?:vr|vale refeicao|vale-refeicao)$/.test(label)) return 'vr';
  if (/^(?:vt|vale transporte|vale-transporte)$/.test(label)) return 'vt';
  if (label === 'insalubridade') return 'insalubridade';
  return null;
};

const extractStructuredRows = (rawText: string): StructuredRow[] => {
  const rows: StructuredRow[] = [];
  for (const rawLine of String(rawText || '').split(/\r?\n/)) {
    const line = rawLine
      .replace(/^\s*(?:[-•]\s*)?(?:\d{1,2}[.)]\s*)?/, '')
      .replace(/\*\*|__|`/g, '')
      .trim();
    if (!line) continue;
    const match = line.match(/^(.{1,45}?)\s*(?:=>|→|->|:|=)\s*(.+?)\s*$/);
    if (!match) continue;
    const key = structuredKeyFromLabel(match[1]);
    if (!key) continue;
    rows.push({ key, value: match[2].trim().replace(/^\*+|\*+$/g, '').trim() });
  }
  return rows;
};

const companyFieldFromValue = (rawValue: string, options: SmartInterpreterOptions): SmartField<SmartCompanyValue> | null => {
  if (isExplicitlyMissing(rawValue)) return missingField<SmartCompanyValue>();
  const wanted = normalizeSmartText(rawValue);
  const companies = options.companies || [];
  const matches = companies.filter((company) => {
    const name = normalizeSmartText(company.name || company.nome || company.razaoSocial || company.razao_social || '');
    if (!name) return false;
    if (name === wanted || name.includes(wanted) || wanted.includes(name)) return true;
    const wantedWords = wanted.split(/\s+/).filter((word) => word.length >= 3 && !['filial', 'empresa'].includes(word));
    return wantedWords.length >= 2 && wantedWords.every((word) => name.includes(word));
  });

  if (matches.length === 1) {
    const company = matches[0];
    const name = String(company.name || company.nome || company.razaoSocial || company.razao_social || '').trim();
    return okField({ id: company.id, name }, name.toLocaleUpperCase('pt-BR'));
  }
  if (matches.length > 1) {
    return {
      value: null,
      display: 'CONFLITO ENCONTRADO',
      confidence: 'low',
      status: 'conflict',
      message: 'Mais de uma empresa cadastrada corresponde ao nome informado.',
      candidates: matches.map((company) => {
        const name = String(company.name || company.nome || company.razaoSocial || company.razao_social || '').trim();
        return { value: { id: company.id, name }, display: name.toLocaleUpperCase('pt-BR') };
      }),
    };
  }
  return null;
};

const parseBenefitField = (rawValue: string, kind: 'VR' | 'VT'): SmartField<SmartBenefitValue> => {
  if (isExplicitlyMissing(rawValue)) return missingField<SmartBenefitValue>();
  const normalized = normalizeSmartText(rawValue);
  const negative = /^(?:nao|não|sem)\b/.test(rawValue.trim()) || /\b(?:nao|não)\s+recebe\b/i.test(rawValue);
  const positive = /\b(?:sim|recebe|vai receber)\b/i.test(rawValue);
  const unknownValue = /valor\s+(?:ainda\s+)?(?:nao|não)\s+informado|valor\s+ainda\s+(?:nao|não)\s+definido|ainda\s+(?:nao|não)\s+sei|sem\s+valor/i.test(rawValue);
  const amountMatch = rawValue.match(/r\$\s*(\d{1,4}(?:\.\d{3})*(?:,\d{1,2})?|\d{1,4}(?:[.,]\d{1,2})?)/i)
    || rawValue.match(/\b(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:\/\s*dia|por\s+dia|dia)\b/i);
  const amount = amountMatch ? parseMoney(amountMatch[1]) : null;

  let enabled: boolean | null = null;
  if (negative && !unknownValue) enabled = false;
  else if (positive || amount !== null || unknownValue || normalized === 'sim') enabled = true;

  if (enabled === null) return missingField<SmartBenefitValue>();
  const value: SmartBenefitValue = { enabled, dailyValue: enabled ? amount : null };
  const display = enabled
    ? amount !== null
      ? `${kind}: SIM — ${formatSmartMoney(amount)}/dia`
      : `${kind}: SIM — valor ainda não informado`
    : `${kind}: NÃO`;
  return okField(value, display);
};

const applyStructuredRows = (rawText: string, result: SmartAdmissionResult, options: SmartInterpreterOptions) => {
  const rows = extractStructuredRows(rawText);
  if (!rows.length) return result;

  const latest = new Map<StructuredKey, string>();
  rows.forEach((row) => latest.set(row.key, row.value));

  for (const [key, rawValue] of latest.entries()) {
    if (key === 'empresa') {
      const field = companyFieldFromValue(rawValue, options);
      result.empresa = field || {
        value: null,
        display: rawValue.toLocaleUpperCase('pt-BR'),
        confidence: 'low',
        status: 'review',
        message: 'Empresa informada no texto, mas não localizada com segurança no cadastro. Selecione a empresa correta.',
      };
      continue;
    }

    if (key === 'nome') {
      result.nome = isExplicitlyMissing(rawValue) ? missingField<string>() : okField(titleCase(rawValue), titleCase(rawValue));
      continue;
    }

    if (key === 'cpf') {
      if (isExplicitlyMissing(rawValue)) result.cpf = missingField<string>();
      else {
        const digits = onlyDigits(rawValue);
        result.cpf = {
          value: digits || rawValue,
          display: formatSmartCpf(digits || rawValue),
          confidence: digits.length === 11 && isValidSmartCpf(digits) ? 'high' : 'medium',
          status: digits.length === 11 && isValidSmartCpf(digits) ? 'ok' : 'review',
          message: digits.length === 11 && !isValidSmartCpf(digits) ? 'CPF preservado exatamente como informado. O dígito verificador não confere; revise antes de salvar.' : undefined,
        };
      }
      continue;
    }

    if (key === 'rg') {
      if (isExplicitlyMissing(rawValue)) result.rg = missingField<string>();
      else {
        const digits = onlyDigits(rawValue);
        result.rg = okField(digits || rawValue, formatSmartRg(digits || rawValue));
      }
      continue;
    }

    if (key === 'dataNascimento' || key === 'dataAdmissao') {
      if (isExplicitlyMissing(rawValue)) result[key] = missingField<string>();
      else {
        const iso = normalizeSmartDate(rawValue);
        result[key] = iso
          ? okField(iso, rawValue.trim())
          : { value: null, display: rawValue, confidence: 'low', status: 'invalid', message: 'Data não reconhecida. Use dia/mês/ano.' };
      }
      continue;
    }

    if (key === 'funcao') {
      if (isExplicitlyMissing(rawValue)) result.funcao = missingField<string>();
      else {
        const wanted = normalizeSmartText(rawValue);
        const role = (options.roles || []).find((item) => normalizeSmartText(item) === wanted)
          || (options.roles || []).find((item) => normalizeSmartText(item).includes(wanted) || wanted.includes(normalizeSmartText(item)));
        const value = titleCase(role || rawValue);
        result.funcao = okField(value, value, role ? 'high' : 'medium');
        if (!role) result.funcao.message = 'Função identificada no texto. Confira se corresponde à função cadastrada antes de transferir.';
      }
      continue;
    }

    if (key === 'setorGhe' || key === 'obraLocal') {
      result[key] = isExplicitlyMissing(rawValue) ? missingField<string>() : okField(rawValue.trim(), rawValue.trim());
      continue;
    }

    if (key === 'salario') {
      if (isExplicitlyMissing(rawValue)) result.salario = missingField<number>();
      else {
        const amount = parseMoney(rawValue);
        result.salario = amount === null
          ? { value: null, display: rawValue, confidence: 'low', status: 'invalid', message: 'Salário não reconhecido.' }
          : okField(amount, formatSmartMoney(amount));
      }
      continue;
    }

    if (key === 'email') {
      if (isExplicitlyMissing(rawValue)) result.email = missingField<string>();
      else {
        const email = rawValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || rawValue.trim();
        result.email = okField(email, email);
      }
      continue;
    }

    if (key === 'celular') {
      if (isExplicitlyMissing(rawValue)) result.celular = missingField<string>();
      else {
        const digits = onlyDigits(rawValue);
        result.celular = [10, 11].includes(digits.length)
          ? okField(digits, formatSmartPhone(digits))
          : { value: digits || rawValue, display: formatSmartPhone(digits || rawValue), confidence: 'low', status: 'review', message: 'Celular preservado como informado; confira a quantidade de dígitos.' };
      }
      continue;
    }

    if (key === 'vr') {
      result.vr = parseBenefitField(rawValue, 'VR');
      continue;
    }

    if (key === 'vt') {
      result.vt = parseBenefitField(rawValue, 'VT');
      continue;
    }

    if (key === 'insalubridade') {
      if (isExplicitlyMissing(rawValue)) result.insalubridade = missingField<boolean>();
      else {
        const normalized = normalizeSmartText(rawValue);
        if (/^(?:nao|sem|0|false)\b/.test(normalized)) result.insalubridade = okField(false, 'NÃO');
        else if (/^(?:sim|com|recebe|1|true)\b/.test(normalized)) result.insalubridade = okField(true, 'SIM');
        else result.insalubridade = { value: null, display: rawValue, confidence: 'low', status: 'invalid', message: 'Insalubridade não reconhecida. Informe SIM ou NÃO.' };
      }
    }
  }

  return result;
};

const candidateToCpfField = (candidate: SmartCandidate<string>): SmartField<string> => {
  const digits = onlyDigits(candidate.value);
  const valid = isValidSmartCpf(digits);
  return {
    value: digits,
    display: formatSmartCpf(digits),
    confidence: valid ? 'medium' : 'low',
    status: valid ? 'review' : 'invalid',
    message: valid
      ? 'CPF identificado pela estrutura. Recomenda-se conferência.'
      : 'CPF com 11 dígitos identificado, mas o dígito verificador não confere. Os dígitos informados foram preservados.',
  };
};

const mobileField = (digits: string, confidence: 'high' | 'medium' = 'medium'): SmartField<string> => ({
  value: digits,
  display: formatSmartPhone(digits),
  confidence,
  status: confidence === 'high' ? 'ok' : 'review',
  message: confidence === 'medium' ? 'Celular identificado pelo padrão brasileiro de 11 dígitos. Recomenda-se conferência.' : undefined,
});

const resolveDocumentVsPhone = (rawText: string, result: SmartAdmissionResult) => {
  const allElevenDigitRuns = [...rawText.matchAll(/(?<!\d)\d{11}(?!\d)/g)].map((match) => match[0]);
  const uniqueRuns = [...new Set(allElevenDigitRuns)];
  const mobileRuns = uniqueRuns.filter(isLikelyBrazilianMobile);
  const nonMobileRuns = uniqueRuns.filter((digits) => !isLikelyBrazilianMobile(digits));

  if (result.cpf.status === 'conflict' && result.cpf.candidates?.length) {
    const cpfCandidates = result.cpf.candidates.filter((candidate) => !isLikelyBrazilianMobile(onlyDigits(candidate.value)));
    if (cpfCandidates.length === 1) result.cpf = candidateToCpfField(cpfCandidates[0]);
  }

  if (result.cpf.status === 'missing' && nonMobileRuns.length === 1) {
    result.cpf = candidateToCpfField({ value: nonMobileRuns[0], display: formatSmartCpf(nonMobileRuns[0]) });
  }

  if (result.celular.status === 'missing' && mobileRuns.length === 1) {
    const cpfDigits = result.cpf.value ? onlyDigits(result.cpf.value) : '';
    if (mobileRuns[0] !== cpfDigits) result.celular = mobileField(mobileRuns[0]);
  }

  return result;
};

const resolveCompanyAlias = (rawText: string, result: SmartAdmissionResult, options: SmartInterpreterOptions) => {
  if (result.empresa.status !== 'missing') return result;
  const text = normalizeSmartText(rawText);
  const aliases = [
    { pattern: /\btopac\s+(?:sao paulo\s+)?matriz\b/, words: ['topac', 'matriz'] },
    { pattern: /\btopac\s+(?:filial\s+)?praia(?:\s+grande)?\b/, words: ['topac', 'praia'] },
    { pattern: /\btopac\s+(?:filial\s+)?goiania\b/, words: ['topac', 'goiania'] },
  ];
  const alias = aliases.find((item) => item.pattern.test(text));
  if (!alias) return result;

  const matches = (options.companies || []).filter((company) => {
    const companyName = normalizeSmartText(company.name || company.nome || company.razaoSocial || company.razao_social || '');
    return alias.words.every((word) => companyName.includes(word));
  });

  if (matches.length === 1) {
    const company = matches[0];
    const name = String(company.name || company.nome || company.razaoSocial || company.razao_social || '').trim();
    const value: SmartCompanyValue = { id: company.id, name };
    result.empresa = {
      value,
      display: name.toLocaleUpperCase('pt-BR'),
      confidence: 'high',
      status: 'ok',
    };
  } else if (matches.length > 1) {
    result.empresa = {
      value: null,
      display: 'CONFLITO ENCONTRADO',
      confidence: 'low',
      status: 'conflict',
      message: 'Mais de uma empresa cadastrada corresponde ao nome informado.',
      candidates: matches.map((company) => {
        const name = String(company.name || company.nome || company.razaoSocial || company.razao_social || '').trim();
        return { value: { id: company.id, name }, display: name.toLocaleUpperCase('pt-BR') };
      }),
    };
  }
  return result;
};

const isKnownEntityPhrase = (value: string, options: SmartInterpreterOptions) => {
  const normalized = normalizeSmartText(value);
  const companies = (options.companies || []).map((company) => normalizeSmartText(company.name || company.nome || company.razaoSocial || company.razao_social || '')).filter(Boolean);
  const roles = (options.roles || []).map(normalizeSmartText).filter(Boolean);
  return [...companies, ...roles].some((entity) => entity === normalized || entity.includes(normalized) || normalized.includes(entity));
};

const resolveName = (rawText: string, result: SmartAdmissionResult, options: SmartInterpreterOptions) => {
  if (result.nome.value && result.nome.status !== 'conflict') return result;

  const capitalized = [...rawText.matchAll(/\b([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][a-záàâãéèêíïóôõöúçñ'’-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][a-záàâãéèêíïóôõöúçñ'’-]+){1,5})\b/gu)]
    .map((match) => match[1].trim())
    .filter((value) => !isKnownEntityPhrase(value, options));
  const uniqueCapitalized = [...new Map(capitalized.map((value) => [normalizeSmartText(value), value])).values()];

  if (uniqueCapitalized.length === 1) {
    result.nome = {
      value: uniqueCapitalized[0],
      display: uniqueCapitalized[0],
      confidence: 'high',
      status: 'ok',
    };
    return result;
  }

  let semantic = normalizeSmartText(rawText);
  semantic = semantic.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, ' ');
  semantic = semantic.replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, ' ');
  semantic = semantic.replace(/\b\d{7,}\b/g, ' ');

  for (const company of options.companies || []) {
    const name = normalizeSmartText(company.name || company.nome || company.razaoSocial || company.razao_social || '');
    if (name) semantic = semantic.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g'), ' ');
  }
  semantic = semantic.replace(/\btopac\s+(?:sao paulo\s+)?matriz\b/g, ' ')
    .replace(/\btopac\s+(?:filial\s+)?praia(?:\s+grande)?\b/g, ' ')
    .replace(/\btopac\s+(?:filial\s+)?goiania\b/g, ' ');

  for (const role of options.roles || []) {
    const normalizedRole = normalizeSmartText(role);
    if (normalizedRole) semantic = semantic.replace(new RegExp(`\\b${escapeRegExp(normalizedRole)}\\b`, 'g'), ' ');
  }

  semantic = semantic
    .replace(/\b(?:cpf|rg|salario|sal|inicial|admissao|admitir|entrada|entra|inicio|nascimento|nasceu|cel|celular|telefone|whatsapp|email|e-mail|empresa|contratante|funcao|cargo|setor|ghe|obra|local|vr|vt|vale|refeicao|transporte|alimentacao|insalubridade|sim|nao|sem|valor|dia|reais?|recebe|receber|ainda|sei|definido|depois|por|o|a|do|da)\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
    .replace(/[^a-záàâãéèêíïóôõöúçñ'’\s-]/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = semantic.split(/\s+/).filter((word) => word.length >= 2);
  if (words.length >= 2 && words.length <= 6) {
    const value = titleCase(words.join(' '));
    if (!isKnownEntityPhrase(value, options)) {
      result.nome = {
        value,
        display: value,
        confidence: 'medium',
        status: 'review',
        message: 'Nome identificado pelo conteúdo remanescente do texto. Recomenda-se conferência.',
      };
    }
  }
  return result;
};

const preserveBenefitSemantics = (result: SmartAdmissionResult) => {
  if (result.vr.value?.enabled === true && result.vr.value.dailyValue === null) {
    result.vr.display = 'VR: SIM — valor ainda não informado';
  }
  if (result.vt.value?.enabled === true && result.vt.value.dailyValue === null) {
    result.vt.display = 'VT: SIM — valor ainda não informado';
  }
  return result;
};

const ensureNoInventedText = (result: SmartAdmissionResult) => {
  const textFields: Array<keyof Pick<SmartAdmissionResult, 'nome' | 'rg' | 'funcao' | 'setorGhe' | 'obraLocal' | 'email' | 'celular'>> = [
    'nome', 'rg', 'funcao', 'setorGhe', 'obraLocal', 'email', 'celular',
  ];
  textFields.forEach((key) => {
    const field = result[key] as SmartField<string>;
    if (field.status === 'missing') field.value = null;
  });
  return result;
};

export const interpretarEValidarPreCadastroLivre = (rawText: string, options: SmartInterpreterOptions = {}): SmartAdmissionResult => {
  const normalizedInput = normalizeStructuredInput(rawText);
  const result = interpretarPreCadastroLivre(normalizedInput, options);
  resolveDocumentVsPhone(normalizedInput, result);
  resolveCompanyAlias(normalizedInput, result, options);
  resolveName(normalizedInput, result, options);
  applyStructuredRows(rawText, result, options);
  preserveBenefitSemantics(result);
  ensureNoInventedText(result);
  return result;
};
