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

/**
 * Lê explicitamente o campo bancário "nome do recebedor".
 * OCR pode cortar o último sobrenome; o match abaixo aceita prefixo inequívoco,
 * mas nunca escolhe automaticamente entre dois candidatos próximos.
 */
const receiverNameFromReceipt = (text: string) => {
  const lines = String(text || '').split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/NOME\s+DO\s+RECEBEDOR\s*[:\-]?\s*(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }

  const flat = String(text || '').replace(/\s+/g, ' ');
  const match = flat.match(/NOME\s+DO\s+RECEBEDOR\s*[:\-]?\s*(.+?)(?=\s+(?:CPF\s*\/\s*CNPJ|CPF|CNPJ|CHAVE|INSTITUI[CÇ][AÃ]O|AG[ÊE]NCIA|CONTA|TIPO\s+DE\s+CONTA|DADOS\s+DA\s+TRANSA[CÇ][AÃ]O|VALOR)\b|$)/i);
  return match?.[1]?.trim() || null;
};

const employeeByReceiverName = (receiverName: string | null, employees: PayrollEmployeeMatch[]) => {
  if (!receiverName) return null;
  const ranked = employees
    .map(employee => ({ employee, score: similarity(receiverName, employee.name) }))
    .filter(item => item.score >= 0.78)
    .sort((a, b) => b.score - a.score);

  if (!ranked[0]) return null;
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.12) return null;
  return ranked[0];
};

const amountConfirms = (employeeId: string, paid: number | null | undefined, netAmountByEmployee?: Map<string, number>) => {
  if (paid == null || !netAmountByEmployee?.has(employeeId)) return true;
  const expected = Number(netAmountByEmployee.get(employeeId) || 0);
  const tolerance = Math.max(1, Math.abs(expected) * 0.001);
  return Math.abs(expected - Number(paid)) <= tolerance;
};

/**
 * Compatibilidade para os consumidores antigos deste módulo.
 *
 * Comprovantes bancários podem ser PDFs escaneados. Para COMPROVANTE, o V2
 * executa OCR quando não há texto nativo e a vinculação principal passa a ser
 * o campo "nome do recebedor". Valor é validação secundária, com tolerância
 * bancária pequena para diferenças de centavos.
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

  // Não deixar a diferença de centavos eliminar um nome válido no parser-base.
  const parsed = await parsePayrollPdfV2({
    file,
    employees,
    kind,
    netAmountByEmployee: undefined,
  });

  return parsed.map(item => {
    let employee = item.employeeId ? employees.find(emp => emp.id === item.employeeId) || null : null;
    let confidence = Number(item.confidence || 0);

    // PDFs bancários escaneados/truncados: procurar explicitamente o recebedor.
    if (!employee) {
      const ranked = employeeByReceiverName(receiverNameFromReceipt(item.text), employees);
      employee = ranked?.employee || null;
      confidence = ranked ? Math.max(88, Math.round(ranked.score * 100)) : 0;
    }

    if (!employee) return item;
    if (!amountConfirms(employee.id, item.amountDetected, netAmountByEmployee)) return item;

    return {
      ...item,
      employeeId: employee.id,
      employeeName: employee.name,
      // O componente administrativo já considera NOME_VALOR elegível para
      // vinculação automática; aqui significa nome inequívoco + valor compatível.
      matchMethod: 'NOME_VALOR' as const,
      confidence: Math.max(92, confidence),
    };
  });
};
