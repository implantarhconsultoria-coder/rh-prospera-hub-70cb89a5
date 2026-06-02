import type { Company, Employee } from '@/types/database';

export type TipoPagamento = 'adiantamento' | 'salario' | 'outros';

export type StatusComprovante =
  | 'reconhecido_seguro'
  | 'possivel_correspondencia'
  | 'nao_identificado'
  | 'duplicado'
  | 'erro_leitura'
  | 'arquivado'
  | 'ignorado';

export interface ComprovanteCandidate {
  employeeId: string;
  employeeName: string;
  companyId: string;
  companyName: string;
  cpf: string;
  score: number;
  motivos: string[];
}

export interface ComprovanteAnalysis {
  status: StatusComprovante;
  confidence: number;
  employeeId?: string;
  employeeName?: string;
  companyId?: string;
  companyName?: string;
  type: TipoPagamento;
  competencia: string;
  valor: number;
  dataPagamento?: string;
  cpfDetectado: string;
  cnpjDetectado: string;
  identificador: string;
  bancoOrigem: string;
  motivo: string;
  candidatos: ComprovanteCandidate[];
}

const MESES: Record<string, string> = {
  janeiro: '01',
  fevereiro: '02',
  marco: '03',
  marco_: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
};

const MES_LABEL: Record<string, string> = {
  '01': 'JANEIRO',
  '02': 'FEVEREIRO',
  '03': 'MARCO',
  '04': 'ABRIL',
  '05': 'MAIO',
  '06': 'JUNHO',
  '07': 'JULHO',
  '08': 'AGOSTO',
  '09': 'SETEMBRO',
  '10': 'OUTUBRO',
  '11': 'NOVEMBRO',
  '12': 'DEZEMBRO',
};

export const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

export const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const safeFileName = (value: string) =>
  (value || 'comprovante.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

export const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

export const parseMoneyBR = (value: unknown): number => {
  const raw = String(value || '').replace(/[^\d,.-]/g, '').trim();
  if (!raw) return 0;
  if (raw.includes(',')) {
    return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(raw) || 0;
};

export const formatCompetenciaFolder = (competencia: string) => {
  const [year, month] = String(competencia || '').split('-');
  const label = MES_LABEL[month] || month || '';
  return `PAGAMENTOS MES DE ${label}/${year || ''}`.trim();
};

export const formatCompetenciaRef = (competencia: string) => {
  const [year, month] = String(competencia || '').split('-');
  const label = MES_LABEL[month] || month || '';
  return `${label} DE ${year || ''}`.trim();
};

export const tipoPagamentoLabel = (tipo: TipoPagamento | string) => {
  if (tipo === 'adiantamento') return 'ADIANTAMENTO';
  if (tipo === 'salario') return 'SALARIO';
  return 'OUTROS';
};

export const normalizeTipoPagamento = (value: unknown): TipoPagamento => {
  const text = normalizeText(value);
  if (text.includes('ADIANT')) return 'adiantamento';
  if (text.includes('SALARIO') || text.includes('FOLHA') || text.includes('PAGAMENTO MENSAL')) return 'salario';
  return 'outros';
};

export const buildPaymentDocumentName = (
  empresaNome: string,
  funcionarioNome: string,
  tipo: TipoPagamento | string,
  competencia: string,
) => safeFileName(`${empresaNome} - COMPROVANTE ${tipoPagamentoLabel(tipo)} - ${funcionarioNome} - REF. ${formatCompetenciaRef(competencia)}.pdf`);

const isValidCpf = (cpf: string) => {
  const clean = onlyDigits(cpf);
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
  const calc = (base: string, factor: number) => {
    let total = 0;
    for (let index = 0; index < base.length; index += 1) total += Number(base[index]) * (factor - index);
    const digit = 11 - (total % 11);
    return digit > 9 ? 0 : digit;
  };
  return calc(clean.slice(0, 9), 10) === Number(clean[9]) && calc(clean.slice(0, 10), 11) === Number(clean[10]);
};

const extractCpf = (text: string) => {
  const matches = text.match(/(?:CPF\s*[:.-]?\s*)?(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/gi) || [];
  const cpfs = matches.map(onlyDigits).filter(isValidCpf);
  return cpfs[0] || '';
};

const extractCnpj = (text: string) => {
  const match = text.match(/(?:CNPJ\s*[:.-]?\s*)?(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i);
  return match ? onlyDigits(match[1]) : '';
};

const extractDate = (text: string) => {
  const preferred = text.match(/(?:DATA|PAGO EM|PAGAMENTO|LIQUIDADO EM|EFETIVADO EM)[^\d]{0,20}(\d{2}\/\d{2}\/\d{4})/i);
  const fallback = text.match(/(\d{2}\/\d{2}\/\d{4})/);
  const raw = preferred?.[1] || fallback?.[1] || '';
  if (!raw) return '';
  const [day, month, year] = raw.split('/');
  return `${year}-${month}-${day}`;
};

const extractCompetencia = (text: string, dataPagamento?: string) => {
  const normalized = normalizeText(text);
  const numeric = normalized.match(/(?:COMPETENCIA|REFERENCIA|REF)\s*(\d{1,2})\s*[/.-]\s*(20\d{2})/);
  if (numeric) return `${numeric[2]}-${numeric[1].padStart(2, '0')}`;

  const monthName = normalized.match(/(?:COMPETENCIA|REFERENCIA|REF|MES)\s+([A-Z]+)\s+(?:DE\s+)?(20\d{2})/);
  if (monthName) {
    const key = monthName[1].toLowerCase();
    const month = MESES[key] || MESES[key.replace('ç', 'c')] || '';
    if (month) return `${monthName[2]}-${month}`;
  }

  if (dataPagamento) return dataPagamento.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
};

const extractValue = (text: string) => {
  const labelled = [
    /(?:VALOR\s+(?:DO\s+)?(?:PAGAMENTO|PAGO|TRANSFERENCIA|CREDITO|TOTAL)|TOTAL\s+PAGO|VALOR)\s*[:=-]?\s*R?\$?\s*([\d.]+,\d{2}|\d+\.\d{2})/gi,
    /R\$\s*([\d.]+,\d{2})/gi,
  ];
  const values: number[] = [];
  labelled.forEach((regex) => {
    let match = regex.exec(text);
    while (match) {
      const value = parseMoneyBR(match[1]);
      if (value > 0) values.push(value);
      match = regex.exec(text);
    }
  });
  return values.length ? Math.max(...values) : 0;
};

const extractIdentifier = (text: string) => {
  const normalized = text.replace(/\s+/g, ' ');
  const patterns = [
    /(?:COMPROVANTE|PROTOCOLO|AUTENTICACAO|AUTENTICAÇÃO|IDENTIFICADOR|ID|NSU|DOCUMENTO)\s*[:#-]?\s*([A-Z0-9.-]{5,})/i,
    /(?:CODIGO|CÓDIGO)\s*[:#-]?\s*([A-Z0-9.-]{5,})/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].replace(/[^\w.-]/g, '');
  }
  return '';
};

const extractBank = (text: string) => {
  const normalized = normalizeText(text);
  const banks = ['ITAU', 'BRADESCO', 'SANTANDER', 'BANCO DO BRASIL', 'CAIXA', 'SICOOB', 'SICREDI', 'NUBANK', 'INTER'];
  return banks.find((bank) => normalized.includes(normalizeText(bank))) || '';
};

const matchEmployees = (
  text: string,
  employees: Employee[],
  companies: Company[],
  cpfDetectado: string,
  cnpjDetectado: string,
) => {
  const normalized = normalizeText(text);
  const companyById = new Map(companies.map((company) => [company.id, company]));

  return employees.map((employee) => {
    const company = companyById.get(employee.companyId);
    const motivos: string[] = [];
    let score = 0;

    if (cpfDetectado && onlyDigits(employee.cpf) === cpfDetectado) {
      score += 70;
      motivos.push('CPF exato');
    }

    const employeeName = normalizeText(employee.name);
    if (employeeName && normalized.includes(employeeName)) {
      score += 45;
      motivos.push('Nome exato');
    } else {
      const tokens = employeeName.split(' ').filter((token) => token.length > 2);
      const hits = tokens.filter((token) => normalized.includes(token)).length;
      if (tokens.length && hits) {
        const partial = Math.round((hits / tokens.length) * 32);
        score += partial;
        motivos.push(`Nome aproximado ${hits}/${tokens.length}`);
      }
    }

    if (company) {
      if (cnpjDetectado && onlyDigits(company.cnpj) === cnpjDetectado) {
        score += 20;
        motivos.push('CNPJ da empresa');
      }
      if (normalizeText(company.name) && normalized.includes(normalizeText(company.name))) {
        score += 12;
        motivos.push('Empresa no texto');
      }
    }

    if (employee.status === 'ativo') score += 2;

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      companyId: employee.companyId,
      companyName: company?.name || '',
      cpf: employee.cpf,
      score: Math.min(100, score),
      motivos,
    };
  })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
};

export const analyzePaymentProof = (
  text: string,
  employees: Employee[],
  companies: Company[],
): ComprovanteAnalysis => {
  const cleanedText = String(text || '').trim();
  if (!cleanedText || cleanedText.length < 20) {
    return {
      status: 'erro_leitura',
      confidence: 0,
      type: 'outros',
      competencia: new Date().toISOString().slice(0, 7),
      valor: 0,
      cpfDetectado: '',
      cnpjDetectado: '',
      identificador: '',
      bancoOrigem: '',
      motivo: 'Texto insuficiente no PDF. Conferencia manual obrigatoria.',
      candidatos: [],
    };
  }

  const cpfDetectado = extractCpf(cleanedText);
  const cnpjDetectado = extractCnpj(cleanedText);
  const dataPagamento = extractDate(cleanedText);
  const competencia = extractCompetencia(cleanedText, dataPagamento);
  const type = normalizeTipoPagamento(cleanedText);
  const valor = extractValue(cleanedText);
  const identificador = extractIdentifier(cleanedText);
  const bancoOrigem = extractBank(cleanedText);
  const candidatos = matchEmployees(cleanedText, employees, companies, cpfDetectado, cnpjDetectado);
  const top = candidatos[0];
  const second = candidatos[1];
  const gap = top && second ? top.score - second.score : top?.score || 0;
  const dataScore = (valor > 0 ? 8 : 0) + (dataPagamento ? 8 : 0) + (competencia ? 4 : 0) + (identificador ? 3 : 0);
  const confidence = Math.min(100, Math.round((top?.score || 0) + dataScore));

  let status: StatusComprovante = 'nao_identificado';
  let motivo = 'Funcionario nao identificado com seguranca.';
  if (top && confidence >= 78 && gap >= 12) {
    status = 'reconhecido_seguro';
    motivo = `Reconhecido por ${top.motivos.join(', ')}.`;
  } else if (top && confidence >= 45) {
    status = 'possivel_correspondencia';
    motivo = `Possivel correspondencia: ${top.employeeName}. Conferir antes de arquivar.`;
  }

  return {
    status,
    confidence,
    employeeId: top?.employeeId,
    employeeName: top?.employeeName,
    companyId: top?.companyId,
    companyName: top?.companyName,
    type,
    competencia,
    valor,
    dataPagamento: dataPagamento || undefined,
    cpfDetectado,
    cnpjDetectado,
    identificador,
    bancoOrigem,
    motivo,
    candidatos,
  };
};

export const isDuplicatePaymentDocument = (documents: any[], data: {
  tipoPagamento: string;
  competencia: string;
  valor: number;
  dataPagamento?: string | null;
  identificador?: string | null;
}) => {
  const id = String(data.identificador || '').trim();
  const dataPag = String(data.dataPagamento || '').slice(0, 10);
  return documents.some((doc) => {
    const category = normalizeText(`${doc.categoria || ''} ${doc.tipo_documento || ''}`);
    if (!category.includes('COMPROVANTE') && !category.includes('PAGAMENTO')) return false;

    const docId = String(doc.identificador_documento || doc.metadata?.identificador || '').trim();
    if (id && docId && id === docId) return true;

    const sameType = String(doc.tipo_pagamento || doc.subcategoria || '').toLowerCase().includes(String(data.tipoPagamento || '').toLowerCase());
    const sameCompetencia = String(doc.competencia || '') === data.competencia;
    const sameValue = Math.abs((Number(doc.valor_documento) || 0) - (Number(data.valor) || 0)) < 0.01;
    const sameDate = dataPag && String(doc.data_pagamento || doc.metadata?.data_pagamento || '').slice(0, 10) === dataPag;
    return sameType && sameCompetencia && sameValue && sameDate;
  });
};
