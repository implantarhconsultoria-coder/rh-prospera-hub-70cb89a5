import {
  parsePayrollPdf as parsePayrollPdfV2,
  type ParsedPayrollPdf,
  type PayrollEmployeeMatch,
} from './payrollDocumentsV2';

export {
  extractCpf,
  extractLikelyAmount,
  extractPayrollDocumentMetadata,
  extractPdfFilesFromZip,
  extractPdfPages,
  extractReceiptMetadata,
  mergePdfUrls,
  onlyDigits,
  readBlobBytes,
  sha256Browser,
} from './payrollDocumentsV2';

export type {
  ParsedPayrollPdf,
  PayrollDocumentMetadata,
  PayrollDocumentType,
  PayrollEmployeeMatch,
} from './payrollDocumentsV2';

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const similarity = (a: string, b: string) => {
  const aa = normalize(a);
  const bb = normalize(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length);
  const aTokens = new Set(aa.split(' ').filter(token => token.length > 1));
  const bTokens = new Set(bb.split(' ').filter(token => token.length > 1));
  const union = new Set([...aTokens, ...bTokens]);
  const intersection = [...aTokens].filter(token => bTokens.has(token));
  return union.size ? intersection.length / union.size : 0;
};

const tokenMatches = (candidate: string, employee: string) => {
  if (candidate === employee) return true;
  if (candidate.length === 1) return employee.startsWith(candidate);
  if (employee.length === 1) return candidate.startsWith(employee);
  if (candidate.length >= 4 && employee.length >= 4) return candidate.startsWith(employee) || employee.startsWith(candidate);
  return false;
};

const nameCompatibility = (candidate: string, employeeName: string) => {
  const a = normalize(candidate);
  const b = normalize(employeeName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);

  const ignore = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
  const candidateTokens = a.split(' ').filter(Boolean).filter(token => !ignore.has(token));
  const employeeTokens = b.split(' ').filter(Boolean).filter(token => !ignore.has(token));
  if (!candidateTokens.length || !employeeTokens.length) return similarity(a, b);

  let matched = 0;
  for (const token of candidateTokens) {
    if (employeeTokens.some(employeeToken => tokenMatches(token, employeeToken))) matched += 1;
  }
  const coverage = matched / candidateTokens.length;
  const firstMatches = tokenMatches(candidateTokens[0], employeeTokens[0]);
  const lastMatches = tokenMatches(candidateTokens[candidateTokens.length - 1], employeeTokens[employeeTokens.length - 1]);

  if (firstMatches && lastMatches && coverage >= 0.66) return Math.max(0.92, coverage);
  if (firstMatches && coverage >= 0.8) return Math.max(0.88, coverage * 0.96);
  return Math.max(similarity(a, b), coverage * 0.82);
};

const receiverNameCandidatesFromReceipt = (text: string) => {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const lines = source.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const candidates: string[] = [];
  const push = (value?: string | null) => {
    const clean = String(value || '').replace(/\s+/g, ' ').trim().replace(/[|;]+$/g, '').trim();
    if (clean && normalize(clean).length >= 5) candidates.push(clean);
  };

  for (const line of lines) {
    push(line.match(/NOME\s+DO\s+RECEBEDOR\s*[:\-]?\s*(.+)$/i)?.[1]);
    push(line.match(/FAVORECIDO\s*[:\-]?\s*(.+)$/i)?.[1]);
    push(line.match(/PAGO\s+PARA\s*[:\-]?\s*(.+)$/i)?.[1]);
  }

  const flat = source.replace(/\s+/g, ' ');
  const stop = '(?=\\s+(?:CPF\\s*\\/\\s*CNPJ|CPF|CNPJ|CHAVE|INSTITUI[CÇ][AÃ]O|AG[ÊE]NCIA|CONTA|NR\\.?\\s*DOCUMENTO|VALOR|DEBITO|D[ÉE]BITO|DATA|DOCUMENTO|AUTENTICA[CÇ][AÃ]O|$))';
  const patterns = [
    new RegExp(`NOME\\s+DO\\s+RECEBEDOR\\s*[:\\-]?\\s*(.+?)${stop}`, 'i'),
    new RegExp(`FAVORECIDO\\s*[:\\-]?\\s*(.+?)${stop}`, 'i'),
    new RegExp(`PAGO\\s+PARA\\s*[:\\-]?\\s*(.+?)${stop}`, 'i'),
    new RegExp(`TRANSFERIDO\\s+PARA\\s*:?\\s*(?:CLIENTE\\s*[:\\-]?\\s*)?(.+?)${stop}`, 'i'),
  ];
  for (const pattern of patterns) push(flat.match(pattern)?.[1]);

  return Array.from(new Map(candidates.map(candidate => [normalize(candidate), candidate])).values());
};

const bestEmployeeByCandidate = (candidate: string, employees: PayrollEmployeeMatch[]) => {
  const ranked = employees
    .map(employee => ({ employee, score: nameCompatibility(candidate, employee.name) }))
    .filter(item => item.score >= 0.78)
    .sort((a, b) => b.score - a.score);

  if (!ranked[0]) return null;
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.12) return null;
  return ranked[0];
};

const employeeMentionedInReceiptText = (text: string, employees: PayrollEmployeeMatch[]) => {
  const compact = normalize(text);
  const ranked = employees
    .map(employee => {
      const employeeName = normalize(employee.name);
      if (employeeName.length >= 7 && compact.includes(employeeName)) return { employee, score: 1 };
      const tokens = employeeName.split(' ').filter(token => token.length > 2 && !['DOS', 'DAS'].includes(token));
      if (tokens.length < 2) return { employee, score: 0 };
      const matched = tokens.filter(token => compact.includes(token)).length;
      const coverage = matched / tokens.length;
      const firstPresent = compact.includes(tokens[0]);
      const lastPresent = compact.includes(tokens[tokens.length - 1]);
      const score = firstPresent && lastPresent && coverage >= 0.66 ? 0.86 + coverage * 0.12 : 0;
      return { employee, score };
    })
    .filter(item => item.score >= 0.86)
    .sort((a, b) => b.score - a.score);

  if (!ranked[0]) return null;
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.1) return null;
  return ranked[0];
};

const employeeByReceiptText = (text: string, employees: PayrollEmployeeMatch[]) => {
  const candidates = receiverNameCandidatesFromReceipt(text);
  const ranked = candidates
    .map(candidate => ({ candidate, match: bestEmployeeByCandidate(candidate, employees) }))
    .filter(item => item.match)
    .sort((a, b) => Number(b.match?.score || 0) - Number(a.match?.score || 0));
  if (ranked[0]?.match) return ranked[0].match;
  return employeeMentionedInReceiptText(text, employees);
};

/**
 * Comprovantes bancários podem vir como PDF escaneado. O fluxo usa OCR e
 * reconhece automaticamente, por nome inequívoco dentro da empresa selecionada,
 * os formatos já usados pela TOPAC/LMT:
 * - Itaú/Sispag: "nome do recebedor";
 * - Banco do Brasil TED: "FAVORECIDO" ou "TRANSFERIDO PARA / CLIENTE";
 * - Banco do Brasil PIX: "PAGO PARA".
 * O valor continua sendo extraído e gravado, mas não impede o vínculo quando o
 * nome do recebedor bate de forma única com o cadastro do funcionário.
 */
export const parsePayrollPdf = async ({
  file,
  employees,
  kind,
  netAmountByEmployee,
}: {
  file: File;
  employees: PayrollEmployeeMatch[];
  kind: 'HOLERITE' | 'COMPROVANTE';
  netAmountByEmployee?: Map<string, number>;
}): Promise<ParsedPayrollPdf[]> => {
  if (kind !== 'COMPROVANTE') {
    return parsePayrollPdfV2({ file, employees, kind, netAmountByEmployee });
  }

  const parsed = await parsePayrollPdfV2({
    file,
    employees,
    kind,
    netAmountByEmployee: undefined,
  });

  return parsed.map(item => {
    let employee = item.employeeId ? employees.find(emp => emp.id === item.employeeId) || null : null;
    let confidence = Number(item.confidence || 0);

    if (!employee) {
      const ranked = employeeByReceiptText(item.text, employees);
      employee = ranked?.employee || null;
      confidence = ranked ? Math.max(92, Math.round(ranked.score * 100)) : 0;
    }

    if (!employee) return item;

    return {
      ...item,
      employeeId: employee.id,
      employeeName: employee.name,
      matchMethod: item.matchMethod === 'CPF' ? 'CPF' as const : 'NOME_UNICO' as const,
      confidence: Math.max(92, confidence),
    };
  });
};
