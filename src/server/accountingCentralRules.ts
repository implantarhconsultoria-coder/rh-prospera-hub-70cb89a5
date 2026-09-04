export type AccountingDocumentType = 'HOLERITE' | 'CONTRATO_TRABALHO' | 'OUTRO' | 'DESCONHECIDO';

export type AccountingCompanyCandidate = {
  id: string;
  nome?: string | null;
  razao_social?: string | null;
  cnpj?: string | null;
};

export type AccountingPersonCandidate = {
  id: string;
  nome?: string | null;
  cpf?: string | null;
  empresa_id?: string | null;
  company_id?: string | null;
  data_admissao?: string | null;
};

export type SafeMatch<T> = {
  row: T | null;
  confidence: number;
  method: 'CPF' | 'NOME_EXATO_EMPRESA' | 'NOME_EXATO_EMPRESA_ADMISSAO' | 'CNPJ' | 'RAZAO_SOCIAL' | 'NOME_EMPRESA' | 'ASSUNTO_AUXILIAR' | 'NAO_IDENTIFICADO' | 'AMBIGUO';
  reason: string;
};

const MONTHS: Record<string, string> = {
  JANEIRO: '01', FEVEREIRO: '02', MARCO: '03', MARÇO: '03', ABRIL: '04', MAIO: '05', JUNHO: '06',
  JULHO: '07', AGOSTO: '08', SETEMBRO: '09', OUTUBRO: '10', NOVEMBRO: '11', DEZEMBRO: '12',
};

export const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

export const normalizeAccountingText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const normalizedExactName = (value: unknown) => normalizeAccountingText(value)
  .replace(/\b(DR|DRA|SR|SRA)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const hasAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

const HOLERITE_STRONG = [
  'RECIBO DE PAGAMENTO',
  'HOLERITE',
  'CONTRACHEQUE',
  'DEMONSTRATIVO DE PAGAMENTO',
  'RECIBO DE SALARIO',
  'RECIBO SALARIAL',
];

const CONTRATO_STRONG = [
  'CONTRATO DE TRABALHO',
  'CONTRATO INDIVIDUAL DE TRABALHO',
  'CONTRATO INDIVIDUAL PARA PRESTACAO DE TRABALHO',
  'CONTRATO DE EXPERIENCIA',
];

const IGNORE_STRONG = [
  'FOLHA ANALITICA',
  'RESUMO DA FOLHA',
  'RESUMO DE FOLHA',
  'MEMORIA DE CALCULO',
  'RELACAO BANCARIA',
  'RELACAO DE PAGAMENTO',
  'RELATORIO BANCARIO',
  'RELATORIO GERAL',
  'DEMONSTRATIVO GERAL',
  'GUIA DE RECOLHIMENTO',
  'GUIA FGTS',
  'GUIA DO FGTS',
  'DARF',
  'DCTFWEB',
  'GPS PREVIDENCIA',
  'GRRF',
  'ENCARGOS SOCIAIS',
  'RESUMO ENCARGOS',
  'RELATORIO DE ENCARGOS',
  'RELATORIO DE PROVISOES',
  'RELATORIO DE FERIAS',
  'RELATORIO DE RESCISOES',
];

export const classifyAccountingPage = (textValue: unknown, subjectValue: unknown = ''): { type: AccountingDocumentType; confidence: number; reason: string } => {
  const text = normalizeAccountingText(textValue);
  const subject = normalizeAccountingText(subjectValue);
  if (!text || text.length < 8) return { type: 'DESCONHECIDO', confidence: 0.1, reason: 'Página sem texto pesquisável suficiente.' };

  if (hasAny(text, CONTRATO_STRONG)) {
    return { type: 'CONTRATO_TRABALHO', confidence: 0.99, reason: 'Marcador forte de contrato de trabalho no conteúdo.' };
  }

  if (hasAny(text, HOLERITE_STRONG)) {
    const supporting = hasAny(text, ['TOTAL LIQUIDO', 'VENCIMENTOS', 'DESCONTOS', 'SALARIO BASE', 'PROVENTOS', 'DECLARO TER RECEBIDO']);
    return { type: 'HOLERITE', confidence: supporting ? 0.99 : 0.94, reason: 'Marcador forte de recibo/holerite no conteúdo.' };
  }

  if (hasAny(text, IGNORE_STRONG)) {
    return { type: 'OUTRO', confidence: 0.99, reason: 'Documento administrativo/relatório fora da regra de importação.' };
  }

  const payrollSupport = hasAny(text, ['TOTAL LIQUIDO', 'VENCIMENTOS', 'DESCONTOS']) && hasAny(text, ['CPF', 'SALARIO BASE', 'CBO', 'ADMISSAO']);
  if (payrollSupport) {
    return { type: 'HOLERITE', confidence: 0.88, reason: 'Estrutura típica de holerite identificada no conteúdo.' };
  }

  const contractSupport = hasAny(text, ['EMPREGADOR', 'EMPREGADO', 'ADMISSAO']) && hasAny(text, ['CLAUSULA', 'FUNCAO', 'SALARIO', 'JORNADA']);
  if (contractSupport) {
    return { type: 'CONTRATO_TRABALHO', confidence: 0.87, reason: 'Estrutura típica de contrato identificada no conteúdo.' };
  }

  // Assunto é apenas auxiliar: nunca transforma sozinho o documento em importável.
  if (hasAny(subject, ['HOLERITE', 'RECIBO DE PAGAMENTO', 'CONTRATO DE TRABALHO'])) {
    return { type: 'DESCONHECIDO', confidence: 0.35, reason: 'Assunto sugere documento permitido, mas o conteúdo não confirmou.' };
  }

  return { type: 'OUTRO', confidence: 0.8, reason: 'Conteúdo não corresponde a recibo/holerite nem contrato de trabalho.' };
};

export const needsAccountingOcr = (textValue: unknown) => normalizeAccountingText(textValue).replace(/\s/g, '').length < 24;

export const extractCpf = (textValue: unknown): string | null => {
  const text = String(textValue || '');
  const matches = text.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g) || [];
  for (const raw of matches) {
    const cpf = onlyDigits(raw);
    if (cpf.length === 11 && !/^(\d)\1{10}$/.test(cpf)) return cpf;
  }
  return null;
};

export const extractCnpj = (textValue: unknown): string | null => {
  const text = String(textValue || '');
  const matches = text.match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b/g) || [];
  for (const raw of matches) {
    const cnpj = onlyDigits(raw);
    if (cnpj.length === 14) return cnpj;
  }
  return null;
};

export const extractCompetence = (textValue: unknown): string | null => {
  const raw = String(textValue || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const preferred = raw.match(/(?:COMPETENCIA|REFERENCIA|REF\.?|PERIODO)\s*[:\-]?\s*(0?[1-9]|1[0-2])[\/\-.](20\d{2})/i);
  if (preferred) return `${preferred[2]}-${preferred[1].padStart(2, '0')}`;
  const monthName = raw.match(/(?:COMPETENCIA|REFERENCIA|REF\.?|PERIODO)?\s*[:\-]?\s*(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s*(?:DE|\/|-)?\s*(20\d{2})/i);
  if (monthName) return `${monthName[2]}-${MONTHS[monthName[1].toUpperCase()]}`;
  const any = raw.match(/\b(0?[1-9]|1[0-2])[\/\-.](20\d{2})\b/);
  return any ? `${any[2]}-${any[1].padStart(2, '0')}` : null;
};

const toIsoDate = (dd: string, mm: string, yyyy: string) => `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;

export const extractAdmissionDate = (textValue: unknown): string | null => {
  const text = String(textValue || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const match = text.match(/(?:ADMISSAO|DATA DE ADMISSAO|ADMITIDO EM|INICIO)\s*[:\-]?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})/i);
  return match ? toIsoDate(match[1], match[2], match[3]) : null;
};

const parseMoney = (raw: string): number | null => {
  const n = Number(String(raw || '').replace(/R\$/gi, '').replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

export const extractSalary = (textValue: unknown): number | null => {
  const text = String(textValue || '');
  const match = text.match(/(?:SALARIO(?:\s+BASE)?|REMUNERACAO)\s*[:\-]?\s*(?:R\$\s*)?([\d.]+,\d{2})/i);
  return match?.[1] ? parseMoney(match[1]) : null;
};

export const extractLikelyFullName = (textValue: unknown): string | null => {
  const source = String(textValue || '').replace(/\r/g, '\n');
  const patterns = [
    /(?:NOME(?:\s+DO\s+EMPREGADO|\s+DO\s+FUNCIONARIO)?|FUNCIONARIO|EMPREGADO|COLABORADOR)\s*[:\-]\s*([^\n]{5,100})/i,
    /(?:NOME COMPLETO)\s*[:\-]\s*([^\n]{5,100})/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;
    const clean = match[1].replace(/\b(CPF|RG|CBO|CTPS|PIS|ADMISSAO|FUNCAO|CARGO)\b.*$/i, '').replace(/\s+/g, ' ').trim();
    if (clean.split(' ').length >= 2 && /[A-Za-zÀ-ÿ]/.test(clean)) return clean;
  }
  return null;
};

export const extractRole = (textValue: unknown): string | null => {
  const source = String(textValue || '');
  const match = source.match(/(?:FUNCAO|CARGO)\s*[:\-]\s*([^\n]{2,100})/i);
  return match?.[1]?.replace(/\b(CBO|SALARIO|ADMISSAO)\b.*$/i, '').replace(/\s+/g, ' ').trim() || null;
};

export const matchCompanySafely = (
  textValue: unknown,
  subjectValue: unknown,
  companies: AccountingCompanyCandidate[],
): SafeMatch<AccountingCompanyCandidate> => {
  const text = normalizeAccountingText(textValue);
  const subject = normalizeAccountingText(subjectValue);
  const cnpj = extractCnpj(textValue);
  if (cnpj) {
    const matches = companies.filter((row) => onlyDigits(row.cnpj) === cnpj);
    if (matches.length === 1) return { row: matches[0], confidence: 1, method: 'CNPJ', reason: 'CNPJ do PDF corresponde exatamente à empresa.' };
    if (matches.length > 1) return { row: null, confidence: 0, method: 'AMBIGUO', reason: 'Mais de uma empresa cadastrada com o mesmo CNPJ.' };
  }

  const byContent = companies.filter((row) => {
    const names = [row.razao_social, row.nome].map(normalizeAccountingText).filter((name) => name.length >= 5);
    return names.some((name) => text.includes(name));
  });
  if (byContent.length === 1) {
    const exactReason = normalizeAccountingText(byContent[0].razao_social) && text.includes(normalizeAccountingText(byContent[0].razao_social)) ? 'RAZAO_SOCIAL' : 'NOME_EMPRESA';
    return { row: byContent[0], confidence: 0.96, method: exactReason as any, reason: 'Empresa identificada pelo nome/razão social no conteúdo.' };
  }
  if (byContent.length > 1) return { row: null, confidence: 0, method: 'AMBIGUO', reason: 'Conteúdo cita mais de uma empresa cadastrada.' };

  const bySubject = companies.filter((row) => [row.razao_social, row.nome].map(normalizeAccountingText).filter((name) => name.length >= 5).some((name) => subject.includes(name)));
  if (bySubject.length === 1) return { row: bySubject[0], confidence: 0.72, method: 'ASSUNTO_AUXILIAR', reason: 'Empresa sugerida pelo assunto; exige evidência adicional para vínculo automático.' };

  return { row: null, confidence: 0, method: bySubject.length > 1 ? 'AMBIGUO' : 'NAO_IDENTIFICADO', reason: 'Empresa não identificada de forma segura no PDF.' };
};

const candidateCompanyId = (row: AccountingPersonCandidate) => row.empresa_id || row.company_id || null;

export const matchPersonSafely = <T extends AccountingPersonCandidate>(
  textValue: unknown,
  companyId: string | null,
  candidates: T[],
): SafeMatch<T> => {
  const text = normalizeAccountingText(textValue);
  const cpf = extractCpf(textValue);
  const admission = extractAdmissionDate(textValue);
  const detectedName = extractLikelyFullName(textValue);
  const scoped = companyId ? candidates.filter((row) => candidateCompanyId(row) === companyId) : candidates;

  if (cpf) {
    const cpfMatches = scoped.filter((row) => onlyDigits(row.cpf) === cpf);
    if (cpfMatches.length === 1) return { row: cpfMatches[0], confidence: 1, method: 'CPF', reason: 'CPF do PDF corresponde exatamente ao cadastro dentro da empresa.' };
    if (cpfMatches.length > 1) return { row: null, confidence: 0, method: 'AMBIGUO', reason: 'CPF duplicado no escopo da empresa.' };
    return { row: null, confidence: 0, method: 'NAO_IDENTIFICADO', reason: 'CPF foi lido no PDF, mas não existe no cadastro da empresa identificada.' };
  }

  const explicitNormalized = detectedName ? normalizedExactName(detectedName) : '';
  const exactNameMatches = scoped.filter((row) => {
    const candidateName = normalizedExactName(row.nome);
    if (!candidateName || candidateName.split(' ').length < 2) return false;
    if (explicitNormalized) return candidateName === explicitNormalized;
    return text.includes(candidateName);
  });

  if (exactNameMatches.length === 1) {
    const row = exactNameMatches[0];
    if (admission && row.data_admissao && String(row.data_admissao).slice(0, 10) === admission) {
      return { row, confidence: 0.98, method: 'NOME_EXATO_EMPRESA_ADMISSAO', reason: 'Nome completo exato + empresa + data de admissão conferem.' };
    }
    return { row, confidence: companyId ? 0.93 : 0.78, method: 'NOME_EXATO_EMPRESA', reason: companyId ? 'Nome completo exato e empresa conferem.' : 'Nome completo exato encontrado, mas a empresa não foi confirmada.' };
  }

  if (exactNameMatches.length > 1) return { row: null, confidence: 0, method: 'AMBIGUO', reason: 'Mais de um cadastro possui o mesmo nome completo no escopo.' };
  return { row: null, confidence: 0, method: 'NAO_IDENTIFICADO', reason: 'Nenhuma correspondência exata e segura encontrada; nome parcial não é aceito.' };
};

export const relevantDocumentIdentity = (input: {
  type: AccountingDocumentType;
  cpf?: string | null;
  companyId?: string | null;
  competence?: string | null;
  text?: string | null;
}) => [
  input.type,
  onlyDigits(input.cpf),
  input.companyId || '',
  input.competence || '',
  normalizeAccountingText(input.text).slice(0, 4000),
].join('|');
