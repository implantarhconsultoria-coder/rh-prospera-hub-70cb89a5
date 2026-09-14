import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
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

const PAYROLL_BUCKET = 'payroll-private';

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

const createStorageSignedUrl = async (storagePath: string) => {
  const { data, error } = await supabase.storage.from(PAYROLL_BUCKET).createSignedUrl(storagePath, 900);
  if (error || !data?.signedUrl) throw new Error(`Não foi possível abrir o arquivo ${storagePath.split('/').pop() || ''}.`);
  return data.signedUrl;
};

const mergeOriginalPdfUrls = async (sources: Array<{ url: string; label?: string }>, filename: string) => {
  const output = await PDFDocument.create();
  let added = 0;

  for (const source of sources) {
    const response = await fetch(source.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Falha ao carregar ${source.label || 'PDF'}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = await output.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((page) => output.addPage(page));
    added += pages.length;
  }

  if (!added) throw new Error('Nenhum PDF foi encontrado para o dossiê.');
  const bytes = await output.save({ addDefaultPage: false, useObjectStreams: false });
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
};

/**
 * Dossiê individual COMPLETO:
 * - não depende do mês selecionado na tela;
 * - usa o primeiro documento clicado apenas para descobrir funcionário + empresa;
 * - busca TODO documento efetivamente assinado daquele funcionário, em TODAS as competências;
 * - inclui documento, comprovante bancário quando separado e certificado de cada assinatura;
 * - faz merge com pdf-lib, sem PDF.js/jsPDF e sem chamar destroy().
 */
export const mergePdfUrls = async (sources: Array<{ url: string; label?: string }>, filename: string) => {
  if (!/^DOSSIE_/i.test(filename)) {
    return mergePdfUrlsV2(sources, filename);
  }

  const firstUrl = sources.find((source) => Boolean(source.url))?.url;
  if (!firstUrl) throw new Error('Documento-base do dossiê não foi encontrado.');
  const firstStoragePath = storagePathFromSignedUrl(firstUrl);
  if (!firstStoragePath) throw new Error('Não foi possível identificar o documento-base do dossiê.');

  const { data: sourceDoc, error: sourceDocError } = await (supabase as any)
    .from('payroll_documents')
    .select('id,employee_id,company_id,storage_path')
    .eq('storage_path', firstStoragePath)
    .maybeSingle();
  if (sourceDocError) throw sourceDocError;
  if (!sourceDoc?.employee_id || !sourceDoc?.company_id) throw new Error('Funcionário do dossiê não foi identificado.');

  const { data: documents, error: documentsError } = await (supabase as any)
    .from('payroll_documents')
    .select('id,document_type,competencia,storage_path,extracted_data,created_at,original_filename')
    .eq('company_id', sourceDoc.company_id)
    .eq('employee_id', sourceDoc.employee_id)
    .not('storage_path', 'is', null)
    .order('competencia', { ascending: true })
    .order('created_at', { ascending: true });
  if (documentsError) throw documentsError;

  const documentIds = (documents || []).map((doc: any) => doc.id).filter(Boolean);
  if (!documentIds.length) throw new Error('Nenhum documento foi encontrado para este funcionário.');

  const [{ data: signatures, error: signaturesError }, { data: receipts, error: receiptsError }] = await Promise.all([
    (supabase as any)
      .from('payroll_signatures')
      .select('id,document_id,certificate_path,signed_at')
      .in('document_id', documentIds)
      .order('signed_at', { ascending: true }),
    (supabase as any)
      .from('payroll_payment_receipts')
      .select('id,document_id,storage_path,status,confirmed,created_at')
      .in('document_id', documentIds)
      .eq('status', 'PAGAMENTO_CONFIRMADO')
      .order('created_at', { ascending: true }),
  ]);
  if (signaturesError) throw signaturesError;
  if (receiptsError) throw receiptsError;

  const latestSignatureByDoc = new Map<string, any>();
  for (const signature of signatures || []) {
    if (!signature?.document_id) continue;
    const current = latestSignatureByDoc.get(signature.document_id);
    if (!current || new Date(signature.signed_at || 0).getTime() >= new Date(current.signed_at || 0).getTime()) {
      latestSignatureByDoc.set(signature.document_id, signature);
    }
  }

  const latestReceiptByDoc = new Map<string, any>();
  for (const receipt of receipts || []) {
    if (!receipt?.document_id || !receipt?.storage_path) continue;
    latestReceiptByDoc.set(receipt.document_id, receipt);
  }

  const signedDocuments = (documents || []).filter((doc: any) => latestSignatureByDoc.has(doc.id));
  if (!signedDocuments.length) throw new Error('Nenhum documento assinado foi encontrado para este funcionário.');

  const dossierSources: Array<{ url: string; label?: string }> = [];
  for (const doc of signedDocuments) {
    const signature = latestSignatureByDoc.get(doc.id);
    if (doc.storage_path) {
      dossierSources.push({
        url: await createStorageSignedUrl(doc.storage_path),
        label: `${doc.document_type || 'Documento'} ${doc.competencia || ''}`.trim(),
      });
    }

    const includesBankProof = doc?.extracted_data?.includes_bank_proof === true;
    const receipt = latestReceiptByDoc.get(doc.id);
    if (!includesBankProof && receipt?.storage_path) {
      dossierSources.push({
        url: await createStorageSignedUrl(receipt.storage_path),
        label: `Comprovante ${doc.competencia || ''}`.trim(),
      });
    }

    if (signature?.certificate_path) {
      dossierSources.push({
        url: await createStorageSignedUrl(signature.certificate_path),
        label: `Certificado ${doc.document_type || 'Documento'} ${doc.competencia || ''}`.trim(),
      });
    }
  }

  if (!dossierSources.length) throw new Error('Dossiê vazio: arquivos assinados indisponíveis.');
  const completeFilename = filename
    .replace(/DOSSIE_PAGAMENTO_/i, 'DOSSIE_COMPLETO_')
    .replace(/DOSSIE_ASSINATURAS_/i, 'DOSSIE_COMPLETO_')
    .replace(/_\d{4}-\d{2}(?=\.pdf$)/i, '')
    .replace(/\.pdf$/i, '_TODOS_OS_DOCUMENTOS.pdf');

  return mergeOriginalPdfUrls(dossierSources, completeFilename);
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
