import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import {
  extractPayrollDocumentMetadata as extractPayrollDocumentMetadataLegacy,
  mergePdfUrls as mergePdfUrlsLegacy,
  parsePayrollPdf as parsePayrollPdfLegacy,
  readBlobBytes,
  type ParsedPayrollPdf,
  type PayrollEmployeeMatch,
  type PayrollDocumentMetadata,
} from './payrollDocumentsV2Legacy';
import { extractSalaryAdvancePayableAmount } from './payrollIdentityEngine';
import { recoverUnmatchedReceipts } from './receiptOcrRecovery';

export {
  extractCpf,
  extractLikelyAmount,
  extractPdfFilesFromZip,
  extractPdfPages,
  extractReceiptMetadata,
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

/**
 * Para ADTO, o valor efetivamente transferido pelo banco é o lançamento
 * "Adiantamento Crédito". O "Total Líquido" pode sofrer arredondamento e não
 * deve ser usado para formar o par RECIBO -> COMPROVANTE.
 */
export const extractPayrollDocumentMetadata = (text: string, lines?: string[]): PayrollDocumentMetadata => {
  const metadata = extractPayrollDocumentMetadataLegacy(text, lines);
  if (metadata.documentType !== 'SALARY_ADVANCE') return metadata;
  const payable = extractSalaryAdvancePayableAmount(text);
  return {
    ...metadata,
    netAmountDetected: payable ?? metadata.netAmountDetected,
  };
};

const MIN_SPLIT_PDF_BYTES = 1024;

export async function copyPdfPagesToBytes(
  sourcePdfBytes: Uint8Array,
  pageNumbers: number[],
): Promise<Uint8Array> {
  if (!pageNumbers.length) throw new Error('Falha no fatiamento do comprovante: nenhuma página selecionada.');

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
  const splitPdfBytes = new Uint8Array(await outputPdf.save({ addDefaultPage: false, useObjectStreams: false }));

  console.info('[payroll][receipt-pdf-split]', { pages: pageNumbers, pageCount: copiedPages.length, bytes: splitPdfBytes.byteLength });
  if (splitPdfBytes.byteLength < MIN_SPLIT_PDF_BYTES) {
    throw new Error(`Falha no fatiamento do comprovante: PDF gerado possui apenas ${splitPdfBytes.byteLength} bytes.`);
  }
  return splitPdfBytes;
}

export async function uploadReceiptPdf(bucket: string, storagePath: string, splitPageBytes: Uint8Array) {
  console.info('[payroll][receipt-pdf-upload]', { bucket, storagePath, bytes: splitPageBytes.byteLength });
  if (splitPageBytes.byteLength < MIN_SPLIT_PDF_BYTES) {
    throw new Error(`Upload cancelado: comprovante fatiado possui apenas ${splitPageBytes.byteLength} bytes.`);
  }
  const pdfBlob = new Blob([splitPageBytes as any], { type: 'application/pdf' });
  const { data, error } = await supabase.storage.from(bucket).upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Falha ao salvar comprovante PDF no Supabase: ${error.message}`);
  return data;
}

const pendingReceiptFilename = (file: File, item: ParsedPayrollPdf) => {
  if (item.employeeId) return item.filename;
  const page = item.pageNumbers[0] || 1;
  return `${file.name.replace(/\.pdf$/i, '')}_P${String(page).padStart(2, '0')}_PENDENTE.pdf`;
};

/**
 * Fluxo legado de comprovante isolado mantido apenas para compatibilidade técnica.
 * O Fechamento principal não usa mais esse caminho: ele recebe pares sequenciais.
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
  const parsed = await parsePayrollPdfLegacy({
    file,
    employees,
    kind,
    netAmountByEmployee: kind === 'COMPROVANTE' ? undefined : netAmountByEmployee,
  });
  if (kind !== 'COMPROVANTE' || !parsed.length) return parsed;

  const sourcePdfBytes = await readBlobBytes(file);
  const preserved = await Promise.all(parsed.map(async (item) => ({
    ...item,
    filename: pendingReceiptFilename(file, item),
    bytes: await copyPdfPagesToBytes(sourcePdfBytes, item.pageNumbers),
  })));

  return recoverUnmatchedReceipts(preserved, employees);
};

const PAYROLL_BUCKET = 'payroll-private';

const storagePathFromSignedUrl = (url: string) => {
  try {
    const parsed = new URL(url, window.location.origin);
    const marker = `/storage/v1/object/sign/${PAYROLL_BUCKET}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
};

const receiptUrlForHoleriteUrl = async (holeriteUrl: string) => {
  const storagePath = storagePathFromSignedUrl(holeriteUrl);
  if (!storagePath) return null;

  const { data: document, error: documentError } = await (supabase as any)
    .from('payroll_documents')
    .select('id,extracted_data')
    .eq('storage_path', storagePath)
    .maybeSingle();
  if (documentError || !document?.id) return null;

  // O novo documento já contém [RECIBO][COMPROVANTE]. Não anexar o comprovante outra vez.
  if (document?.extracted_data?.includes_bank_proof === true) return null;

  const { data: receipt, error: receiptError } = await (supabase as any)
    .from('payroll_payment_receipts')
    .select('storage_path')
    .eq('document_id', document.id)
    .eq('confirmed', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (receiptError || !receipt?.storage_path) return null;

  const { data: signed, error: signedError } = await supabase.storage
    .from(PAYROLL_BUCKET)
    .createSignedUrl(receipt.storage_path, 300);
  if (signedError || !signed?.signedUrl) return null;
  return signed.signedUrl;
};

/**
 * Consolidado administrativo:
 * - documentos novos já chegam como [RECIBO][COMPROVANTE] e entram uma única vez;
 * - documentos antigos ainda podem receber o comprovante vinculado como segunda página.
 */
export const mergePdfUrls = async (sources: Array<{ url: string; label?: string }>, filename: string) => {
  if (!/^HOLERITES_/i.test(filename) && !/^PAGAMENTOS_CONSOLIDADOS_/i.test(filename)) {
    return mergePdfUrlsLegacy(sources, filename);
  }

  const pairedSources: Array<{ url: string; label?: string }> = [];
  for (const source of sources) {
    pairedSources.push({ ...source, label: source.label ? `${source.label} · DOCUMENTO` : 'DOCUMENTO' });
    const receiptUrl = await receiptUrlForHoleriteUrl(source.url);
    if (receiptUrl) {
      pairedSources.push({
        url: receiptUrl,
        label: source.label ? `${source.label} · COMPROVANTE DO BANCO` : 'COMPROVANTE DO BANCO',
      });
    }
  }

  console.info('[payroll-consolidated-pair]', {
    documentos: sources.length,
    totalArquivos: pairedSources.length,
    regra: 'SEM_DUPLICAR_COMPROVANTE_EM_DOCUMENTO_SEQUENCIAL',
  });
  return mergePdfUrlsLegacy(pairedSources, filename);
};
