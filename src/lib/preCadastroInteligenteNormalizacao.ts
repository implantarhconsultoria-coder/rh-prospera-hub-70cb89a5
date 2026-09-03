import {
  formatSmartCpf,
  formatSmartPhone,
  interpretarPreCadastroLivre,
  isValidSmartCpf,
  normalizeSmartText,
  type SmartAdmissionResult,
  type SmartCandidate,
  type SmartCompanyValue,
  type SmartField,
  type SmartInterpreterOptions,
} from '@/lib/preCadastroInteligente';

const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const isLikelyBrazilianMobile = (digits: string) => /^[1-9][1-9]9\d{8}$/.test(digits);

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
  const result = interpretarPreCadastroLivre(rawText, options);
  resolveDocumentVsPhone(rawText, result);
  resolveCompanyAlias(rawText, result, options);
  preserveBenefitSemantics(result);
  ensureNoInventedText(result);
  return result;
};
