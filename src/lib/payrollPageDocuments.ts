import { PDFDocument } from 'pdf-lib';
import {
  extractCpf,
  extractPayrollDocumentMetadata,
  extractPdfPages,
  onlyDigits,
  readBlobBytes,
  sha256Browser,
  type PayrollDocumentType,
  type PayrollEmployeeMatch,
} from './payrollDocumentsV2';

/**
 * Regra absoluta deste leitor:
 *   1 página física = 1 funcionário = 1 documento.
 * Um recibo com duas vias idênticas na MESMA página continua sendo UM documento,
 * e a página é preservada inteira (as duas vias) via cópia de página com pdf-lib.
 */

export type PayrollPageStatus = 'IDENTIFICADO' | 'PENDENTE' | 'ERRO';

export type PayrollPageDocument = {
  key: string;
  pageNumber: number;
  filename: string;
  bytes: Uint8Array;
  sha256: string;
  text: string;
  status: PayrollPageStatus;
  message: string | null;
  employeeId: string | null;
  employeeName: string | null;
  employeeNameDetected: string | null;
  employeeCodeDetected: string | null;
  jobTitleDetected: string | null;
  cboDetected: string | null;
  matchMethod: 'CPF' | 'CPF_NOME' | 'NOME_UNICO' | 'CODIGO_NOME' | 'NAO_IDENTIFICADO';
  confidence: number;
  cpfDetected: string | null;
  amountDetected: number | null;
  documentType: PayrollDocumentType;
  documentSubtype: string | null;
  competenciaDetected: string | null;
  competenciaLabelDetected: string | null;
  companyNameDetected: string | null;
  cnpjDetected: string | null;
  duplicateCopiesDetected: number;
  usedOcr: boolean;
};

export type PayrollFileAnalysis = {
  filename: string;
  fileSize: number;
  sourceSha256: string;
  totalPages: number;
  documents: PayrollPageDocument[];
  fatalError: string | null;
};

export type PayrollAnalysisLogEntry = {
  step: string;
  page: number | null;
  file: string;
  error: string;
  stack: string | null;
  at: string;
};

const stripAccents = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const normalize = (value: unknown) => stripAccents(value)
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const safeFileName = (value: string) => stripAccents(value)
  .replace(/[^A-Za-z0-9._-]+/g, '_')
  .slice(0, 100);

/**
 * Safari/iOS antigo (e qualquer contexto não seguro) não expõe `crypto.randomUUID`.
 * Nunca chamar randomUUID diretamente no fluxo de upload.
 */
export const safeUuid = (): string => {
  const cryptoRef: any = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') cryptoRef.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const employeesOnPage = (text: string, employees: PayrollEmployeeMatch[]) => {
  const compact = normalize(text);
  const found = new Map<string, PayrollEmployeeMatch>();
  for (const employee of employees) {
    const name = normalize(employee.name);
    if (name.length >= 7 && compact.includes(name)) found.set(employee.id, employee);
  }
  return Array.from(found.values());
};

export type PageMatchResult = {
  employee: PayrollEmployeeMatch | null;
  method: PayrollPageDocument['matchMethod'];
  confidence: number;
  cpf: string | null;
  status: PayrollPageStatus;
  message: string | null;
};

/**
 * Vinculação isolada por empresa (a lista `employees` já vem filtrada pela empresa selecionada).
 * Qualquer dúvida vira PENDENTE DE VINCULAÇÃO — nunca há chute automático.
 */
export const matchEmployeeForPage = (
  text: string,
  lines: string[],
  employees: PayrollEmployeeMatch[],
): PageMatchResult => {
  const cpf = extractCpf(text);
  const namesFound = employeesOnPage(text, employees);
  const cpfMatches = cpf ? employees.filter(employee => onlyDigits(employee.cpf) === cpf) : [];

  if (cpfMatches.length === 1) {
    const byCpf = cpfMatches[0];
    const nameConfirms = namesFound.some(employee => employee.id === byCpf.id);
    if (namesFound.length > 1 && !nameConfirms) {
      return { employee: null, method: 'NAO_IDENTIFICADO', confidence: 0, cpf, status: 'PENDENTE', message: 'CPF e nomes divergentes na mesma página.' };
    }
    return {
      employee: byCpf,
      method: nameConfirms ? 'CPF_NOME' : 'CPF',
      confidence: nameConfirms ? 100 : 96,
      cpf,
      status: 'IDENTIFICADO',
      message: null,
    };
  }

  if (cpf && cpfMatches.length > 1) {
    return { employee: null, method: 'NAO_IDENTIFICADO', confidence: 0, cpf, status: 'PENDENTE', message: 'CPF cadastrado em mais de um funcionário da empresa.' };
  }

  if (namesFound.length === 1) {
    const employee = namesFound[0];
    const metadata = extractPayrollDocumentMetadata(text, lines);
    const codeConfirms = Boolean(metadata.employeeCodeDetected);
    return {
      employee,
      method: codeConfirms ? 'CODIGO_NOME' : 'NOME_UNICO',
      confidence: codeConfirms ? 90 : 85,
      cpf,
      status: 'IDENTIFICADO',
      message: null,
    };
  }

  if (namesFound.length > 1) {
    return {
      employee: null,
      method: 'NAO_IDENTIFICADO',
      confidence: 0,
      cpf,
      status: 'PENDENTE',
      message: `Página com ${namesFound.length} funcionários diferentes: vinculação manual necessária.`,
    };
  }

  return {
    employee: null,
    method: 'NAO_IDENTIFICADO',
    confidence: 0,
    cpf,
    status: 'PENDENTE',
    message: 'Nenhum funcionário ativo da empresa foi reconhecido nesta página.',
  };
};

/**
 * Extrai a PÁGINA FÍSICA INTEIRA (com as duas vias) preservando o conteúdo vetorial original.
 */
const extractPhysicalPage = async (sourceDoc: PDFDocument, pageIndex: number) => {
  const out = await PDFDocument.create();
  const [copied] = await out.copyPages(sourceDoc, [pageIndex]);
  out.addPage(copied);
  return out.save({ useObjectStreams: false });
};

export const analyzePayrollFile = async ({
  file,
  employees,
  onLog,
}: {
  file: File;
  employees: PayrollEmployeeMatch[];
  onLog?: (entry: PayrollAnalysisLogEntry) => void;
}): Promise<PayrollFileAnalysis> => {
  const log = (step: string, page: number | null, error: unknown) => {
    const entry: PayrollAnalysisLogEntry = {
      step,
      page,
      file: file.name,
      error: String((error as any)?.message || error),
      stack: (error as any)?.stack ? String((error as any).stack) : null,
      at: new Date().toISOString(),
    };
    console.error('[payroll-upload]', entry);
    onLog?.(entry);
    return entry;
  };

  const analysis: PayrollFileAnalysis = {
    filename: file.name,
    fileSize: file.size,
    sourceSha256: '',
    totalPages: 0,
    documents: [],
    fatalError: null,
  };

  let sourceBytes: Uint8Array;
  try {
    sourceBytes = await readBlobBytes(file);
  } catch (error) {
    const entry = log('ler-bytes-arquivo', null, error);
    analysis.fatalError = `LEITURA DO ARQUIVO: ${entry.error}`;
    return analysis;
  }

  let pages: Awaited<ReturnType<typeof extractPdfPages>>;
  try {
    // PDF.js pode transferir/destacar o buffer: recebe sempre uma cópia independente.
    pages = await extractPdfPages(new Uint8Array(sourceBytes));
    analysis.totalPages = pages.length;
  } catch (error) {
    const entry = log('abrir-pdf-e-extrair-texto', null, error);
    analysis.fatalError = `ABERTURA/LEITURA DO PDF: ${entry.error}`;
    return analysis;
  }

  if (!pages.length) {
    analysis.fatalError = 'ABERTURA/LEITURA DO PDF: o leitor retornou zero páginas.';
    return analysis;
  }

  try {
    analysis.sourceSha256 = await sha256Browser(sourceBytes);
  } catch (error) {
    const entry = log('sha256-arquivo', null, error);
    analysis.fatalError = `SHA-256 DO ARQUIVO: ${entry.error}`;
    return analysis;
  }

  let sourceDoc: PDFDocument;
  try {
    sourceDoc = await PDFDocument.load(new Uint8Array(sourceBytes), { ignoreEncryption: true });
    if (sourceDoc.getPageCount() !== pages.length) {
      throw new Error(`Contagem divergente: PDF.js=${pages.length}, pdf-lib=${sourceDoc.getPageCount()}`);
    }
  } catch (error) {
    const entry = log('preparar-separacao-paginas', null, error);
    analysis.fatalError = `PREPARAÇÃO DAS PÁGINAS: ${entry.error}`;
    return analysis;
  }

  for (const page of pages) {
    const baseName = file.name.replace(/\.pdf$/i, '');
    try {
      const metadata = extractPayrollDocumentMetadata(page.text, page.lines);
      const match = matchEmployeeForPage(page.text, page.lines, employees);
      const bytes = await extractPhysicalPage(sourceDoc, page.page - 1);
      const suffix = match.employee
        ? normalize(match.employee.name).replace(/\s+/g, '_')
        : `PENDENTE_P${page.page}`;
      const filename = safeFileName(`${baseName}_P${String(page.page).padStart(2, '0')}_${suffix}.pdf`);
      analysis.documents.push({
        key: `${analysis.sourceSha256}:${page.page}`,
        pageNumber: page.page,
        filename,
        bytes,
        sha256: await sha256Browser(bytes),
        text: page.text,
        status: match.status,
        message: match.message,
        employeeId: match.employee?.id || null,
        employeeName: match.employee?.name || null,
        employeeNameDetected: metadata.employeeNameDetected,
        employeeCodeDetected: metadata.employeeCodeDetected,
        jobTitleDetected: metadata.jobTitleDetected || match.employee?.cargo || null,
        cboDetected: metadata.cboDetected,
        matchMethod: match.method,
        confidence: match.confidence,
        cpfDetected: match.cpf,
        amountDetected: metadata.netAmountDetected,
        documentType: metadata.documentType,
        documentSubtype: metadata.documentSubtype,
        competenciaDetected: metadata.competenciaDetected,
        competenciaLabelDetected: metadata.competenciaLabelDetected,
        companyNameDetected: metadata.companyNameDetected,
        cnpjDetected: metadata.cnpjDetected,
        duplicateCopiesDetected: metadata.duplicateCopiesDetected,
        usedOcr: page.usedOcr,
      });
    } catch (error) {
      // Uma página com problema NÃO invalida as demais.
      const entry = log('extrair-pagina', page.page, error);
      analysis.documents.push({
        key: `${analysis.sourceSha256}:${page.page}`,
        pageNumber: page.page,
        filename: safeFileName(`${file.name.replace(/\.pdf$/i, '')}_P${page.page}_ERRO.pdf`),
        bytes: new Uint8Array(0),
        sha256: '',
        text: page.text || '',
        status: 'ERRO',
        message: `Falha ao preparar a página ${page.page}: ${entry.error}`,
        employeeId: null,
        employeeName: null,
        employeeNameDetected: null,
        employeeCodeDetected: null,
        jobTitleDetected: null,
        cboDetected: null,
        matchMethod: 'NAO_IDENTIFICADO',
        confidence: 0,
        cpfDetected: null,
        amountDetected: null,
        documentType: 'UNKNOWN',
        documentSubtype: null,
        competenciaDetected: null,
        competenciaLabelDetected: null,
        companyNameDetected: null,
        cnpjDetected: null,
        duplicateCopiesDetected: 1,
        usedOcr: page.usedOcr,
      });
    }
  }

  return analysis;
};

export const analyzePayrollFiles = async ({
  files,
  employees,
  onLog,
}: {
  files: File[];
  employees: PayrollEmployeeMatch[];
  onLog?: (entry: PayrollAnalysisLogEntry) => void;
}) => {
  const analyses: PayrollFileAnalysis[] = [];
  for (const file of files) {
    if (!/\.pdf$/i.test(file.name)) continue;
    analyses.push(await analyzePayrollFile({ file, employees, onLog }));
  }
  return analyses;
};

export const summarizeAnalyses = (analyses: PayrollFileAnalysis[]) => {
  const documents = analyses.flatMap(analysis => analysis.documents);
  return {
    files: analyses.length,
    pages: analyses.reduce((total, analysis) => total + analysis.totalPages, 0),
    documents: documents.length,
    identified: documents.filter(doc => doc.status === 'IDENTIFICADO').length,
    pending: documents.filter(doc => doc.status === 'PENDENTE').length,
    errors: documents.filter(doc => doc.status === 'ERRO').length + analyses.filter(a => a.fatalError).length,
  };
};