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

/**
 * Compatibilidade para os consumidores antigos deste módulo.
 *
 * Comprovantes bancários da TOPAC/ALQUI podem ser PDFs escaneados e o valor
 * transferido pode variar alguns centavos em relação ao líquido do recibo.
 * A identificação primária é o recebedor (CPF exato ou nome único), com o valor
 * usado apenas como conferência auxiliar. Por isso o V2 é executado sem bloquear
 * o candidato por diferença de centavos e, quando nome + valor ficam dentro de
 * uma tolerância bancária pequena, o resultado é promovido para NOME_VALOR.
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

  // Para comprovantes, o nome do recebedor é a chave principal.
  // O V2 já usa OCR quando o PDF não possui texto nativo.
  const parsed = await parsePayrollPdfV2({
    file,
    employees,
    kind,
    netAmountByEmployee: undefined,
  });

  return parsed.map(item => {
    if (item.matchMethod !== 'NOME_UNICO' || !item.employeeId) return item;

    const expected = netAmountByEmployee?.get(item.employeeId);
    const paid = item.amountDetected;
    if (expected == null || paid == null) return item;

    // Tolerância auxiliar: até R$ 1,00 ou 0,1% do líquido, o que for maior.
    // O nome continua sendo a identificação principal; o valor apenas confirma.
    const tolerance = Math.max(1, Math.abs(Number(expected)) * 0.001);
    if (Math.abs(Number(expected) - Number(paid)) > tolerance) return item;

    return {
      ...item,
      matchMethod: 'NOME_VALOR' as const,
      confidence: Math.max(92, Number(item.confidence || 0)),
    };
  });
};
