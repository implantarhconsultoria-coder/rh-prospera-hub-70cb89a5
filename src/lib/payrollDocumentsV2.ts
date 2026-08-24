import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import {
  parsePayrollPdf as parsePayrollPdfLegacy,
  readBlobBytes,
  type ParsedPayrollPdf,
  type PayrollEmployeeMatch,
} from './payrollDocumentsV2Legacy';

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
} from './payrollDocumentsV2Legacy';

export type {
  ParsedPayrollPdf,
  PayrollDocumentMetadata,
  PayrollDocumentType,
  PayrollEmployeeMatch,
} from './payrollDocumentsV2Legacy';

const MIN_SPLIT_PDF_BYTES = 1024;

export async function copyPdfPagesToBytes(
  sourcePdfBytes: Uint8Array,
  pageNumbers: number[],
): Promise<Uint8Array> {
  if (!pageNumbers.length) {
    throw new Error('Falha no fatiamento do comprovante: nenhuma página selecionada.');
  }

  const sourcePdf = await PDFDocument.load(sourcePdfBytes, {
    updateMetadata: false,
    ignoreEncryption: false,
  });

  const outputPdf = await PDFDocument.create();
  const pageIndexes = pageNumbers.map((pageNumber) => {
    const pageIndex = pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= sourcePdf.getPageCount()) {
      throw new Error(`Falha no fatiamento do comprovante: página ${pageNumber} inválida.`);
    }
    return pageIndex;
  });

  const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndexes);
  copiedPages.forEach((page) => outputPdf.addPage(page));

  const savedPdf = await outputPdf.save({
    addDefaultPage: false,
    useObjectStreams: false,
  });
  const splitPdfBytes = new Uint8Array(savedPdf);

  console.info('[payroll][receipt-pdf-split]', {
    pages: pageNumbers,
    pageCount: copiedPages.length,
    bytes: splitPdfBytes.byteLength,
  });

  if (splitPdfBytes.byteLength < MIN_SPLIT_PDF_BYTES) {
    throw new Error(
      `Falha no fatiamento do comprovante: PDF gerado possui apenas ${splitPdfBytes.byteLength} bytes.`,
    );
  }

  return splitPdfBytes;
}

export async function uploadReceiptPdf(
  bucket: string,
  storagePath: string,
  splitPageBytes: Uint8Array,
) {
  console.info('[payroll][receipt-pdf-upload]', {
    bucket,
    storagePath,
    bytes: splitPageBytes.byteLength,
  });

  if (splitPageBytes.byteLength < MIN_SPLIT_PDF_BYTES) {
    throw new Error(
      `Upload cancelado: comprovante fatiado possui apenas ${splitPageBytes.byteLength} bytes.`,
    );
  }

  const pdfBlob = new Blob([splitPageBytes as any], { type: 'application/pdf' });
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    throw new Error(`Falha ao salvar comprovante PDF no Supabase: ${error.message}`);
  }

  return data;
}

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
  const parsed = await parsePayrollPdfLegacy({
    file,
    employees,
    kind,
    netAmountByEmployee,
  });

  if (kind !== 'COMPROVANTE' || !parsed.length) return parsed;

  // Releitura independente: nunca reutilizar o buffer entregue ao PDF.js.
  // Cada comprovante recebe uma cópia vetorial da(s) página(s) original(is).
  const sourcePdfBytes = await readBlobBytes(file);

  return Promise.all(parsed.map(async (item) => ({
    ...item,
    bytes: await copyPdfPagesToBytes(sourcePdfBytes, item.pageNumbers),
  })));
};
