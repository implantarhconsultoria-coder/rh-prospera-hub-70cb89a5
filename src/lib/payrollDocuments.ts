import { PDFDocument } from 'pdf-lib';
import {
  extractReceiptMetadata as extractReceiptMetadataV2,
  mergePdfUrls as mergePdfUrlsV2,
  parsePayrollPdf as parsePayrollPdfV2,
  type ParsedPayrollPdf,
  type PayrollEmployeeMatch,
} from './payrollDocumentsV2';
import { recoverUnmatchedReceipts } from './receiptOcrRecovery';

export {
  extractCpf,
  extractLikelyAmount,
  extractPayrollDocumentMetadata,
  extractPdfFilesFromZip,
  extractPdfPages,
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

const moneyNumber = (raw: string) => {
  const value = Number(String(raw || '')
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
};

const extractBankTransferAmount = (text: string) => {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const patterns = [
    /\bVALOR\s+TOTAL\s*[:=]?\s*(?:R\$\s*)?([\d.]+,\d{2})/i,
    /\bVALOR\s*(?:R\$)?\s*[:=]?\s*(?:R\$\s*)?([\d.]+,\d{2})/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;
    const value = moneyNumber(match[1]);
    if (value != null && value > 0) return value;
  }
  return null;
};

export const extractReceiptMetadata = (text: string) => {
  const base = extractReceiptMetadataV2(text);
  return { ...base, amount: extractBankTransferAmount(text) ?? base.amount };
};

/**
 * Dossiê individual:
 * usa pdf-lib para copiar as páginas originais diretamente, sem rasterizar via PDF.js/jsPDF.
 * Isso evita travamentos silenciosos do navegador ao consolidar documento + certificado.
 * Os demais consolidados continuam usando a rotina existente, que preserva as regras de
 * comprovantes antigos e documentos sequenciais.
 */
export const mergePdfUrls = async (sources: Array<{ url: string; label?: string }>, filename: string) => {
  if (!/^DOSSIE_/i.test(filename)) {
    return mergePdfUrlsV2(sources, filename);
  }

  const output = await PDFDocument.create();
  for (const source of sources) {
    const response = await fetch(source.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Falha ao carregar ${source.label || 'PDF'}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = await output.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }

  if (!output.getPageCount()) throw new Error('Nenhum PDF para consolidar.');
  const bytes = await output.save({ addDefaultPage: false, useObjectStreams: false });
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
};

/**
 * Fluxo novo de comprovantes:
 * - o parser legado é usado apenas para fatiar páginas e extrair texto/valor;
 * - ele NÃO recebe funcionários e portanto não decide vínculo;
 * - todo vínculo é refeito por nome determinístico exclusivamente contra a lista
 *   já filtrada pela empresa selecionada no Fechamento;
 * - CPF e confidence não participam da decisão.
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

  const base = await parsePayrollPdfV2({
    file,
    employees: [],
    kind,
    netAmountByEmployee: undefined,
  });

  const cleanBase = base.map(item => ({
    ...item,
    employeeId: null,
    employeeName: null,
    matchMethod: 'NAO_IDENTIFICADO' as const,
    confidence: 0,
  }));

  return recoverUnmatchedReceipts(cleanBase, employees);
};
