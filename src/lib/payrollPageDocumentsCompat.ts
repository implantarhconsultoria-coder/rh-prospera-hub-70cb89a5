import { supabase } from '@/integrations/supabase/client';
import {
  extractPayrollDocumentMetadata,
  readBlobBytes,
  sha256Browser,
  type PayrollEmployeeMatch,
} from './payrollDocumentsV2';
import * as base from './payrollPageDocuments';
import type {
  PayrollAnalysisLogEntry,
  PayrollFileAnalysis,
  PayrollPageDocument,
} from './payrollPageDocuments';

export type {
  PayrollPageStatus,
  PayrollPageDocument,
  PayrollFileAnalysis,
  PayrollAnalysisLogEntry,
  PageMatchResult,
} from './payrollPageDocuments';
export const safeUuid = base.safeUuid;
export const employeesOnPage = base.employeesOnPage;
export const matchEmployeeForPage = base.matchEmployeeForPage;
export const summarizeAnalyses = base.summarizeAnalyses;

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

const isIOSWebKit = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/i.test(ua)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const analyzeOnServer = async ({
  file,
  employees,
  onLog,
}: {
  file: File;
  employees: PayrollEmployeeMatch[];
  onLog?: (entry: PayrollAnalysisLogEntry) => void;
}): Promise<PayrollFileAnalysis> => {
  const analysis: PayrollFileAnalysis = {
    filename: file.name,
    fileSize: file.size,
    sourceSha256: '',
    totalPages: 0,
    documents: [],
    fatalError: null,
  };

  const log = (step: string, page: number | null, error: unknown) => {
    const entry: PayrollAnalysisLogEntry = {
      step,
      page,
      file: file.name,
      error: String((error as any)?.message || error),
      stack: (error as any)?.stack ? String((error as any).stack) : null,
      at: new Date().toISOString(),
    };
    console.error('[payroll-upload-server-fallback]', entry);
    onLog?.(entry);
    return entry;
  };

  try {
    const companyId = String(employees.find(employee => employee.companyId)?.companyId || '');
    if (!companyId) throw new Error('Empresa não identificada para processar o PDF no servidor.');

    const sourceBytes = await readBlobBytes(file);
    analysis.sourceSha256 = await sha256Browser(sourceBytes);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Sessão administrativa expirada. Entre novamente.');

    const response = await fetch('/api/payroll-pdf-analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        company_id: companyId,
        filename: file.name,
        data_base64: bytesToBase64(sourceBytes),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `Falha ${response.status} no leitor de PDF do servidor.`);

    const pages = Array.isArray(result.pages) ? result.pages : [];
    analysis.totalPages = Number(result.total_pages || pages.length || 0);
    if (!analysis.totalPages || !pages.length) throw new Error('O servidor abriu o PDF, mas não retornou páginas.');

    for (const page of pages) {
      try {
        const pageNumber = Number(page.page || 0);
        const text = String(page.text || '');
        const lines = Array.isArray(page.lines) ? page.lines.map((line: unknown) => String(line || '')) : [];
        const metadata = extractPayrollDocumentMetadata(text, lines);
        const match = base.matchEmployeeForPage(text, lines, employees);
        const bytes = base64ToBytes(String(page.pdf_base64 || ''));
        if (!pageNumber || !bytes.byteLength) throw new Error('Página retornada sem PDF válido.');

        const suffix = match.employee
          ? normalize(match.employee.name).replace(/\s+/g, '_')
          : `PENDENTE_P${pageNumber}`;
        const filename = safeFileName(`${file.name.replace(/\.pdf$/i, '')}_P${String(pageNumber).padStart(2, '0')}_${suffix}.pdf`);
        const document: PayrollPageDocument = {
          key: `${analysis.sourceSha256}:${pageNumber}`,
          pageNumber,
          filename,
          bytes,
          sha256: await sha256Browser(bytes),
          text,
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
          usedOcr: false,
        };
        analysis.documents.push(document);
      } catch (error) {
        const entry = log('montar-pagina-servidor', Number(page?.page || 0) || null, error);
        analysis.documents.push({
          key: `${analysis.sourceSha256}:${Number(page?.page || 0) || 'erro'}`,
          pageNumber: Number(page?.page || 0) || 0,
          filename: safeFileName(`${file.name.replace(/\.pdf$/i, '')}_ERRO.pdf`),
          bytes: new Uint8Array(0),
          sha256: '',
          text: String(page?.text || ''),
          status: 'ERRO',
          message: `Falha ao preparar a página no iPhone: ${entry.error}`,
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
          usedOcr: false,
        });
      }
    }

    return analysis;
  } catch (error) {
    const entry = log('fallback-servidor', null, error);
    analysis.fatalError = `LEITOR SERVIDOR/IPHONE: ${entry.error}`;
    return analysis;
  }
};

export const analyzePayrollFile = async (args: {
  file: File;
  employees: PayrollEmployeeMatch[];
  onLog?: (entry: PayrollAnalysisLogEntry) => void;
}): Promise<PayrollFileAnalysis> => {
  if (isIOSWebKit()) {
    const server = await analyzeOnServer(args);
    if (server.totalPages > 0) return server;

    const local = await base.analyzePayrollFile(args);
    if (local.totalPages > 0) return local;
    local.fatalError = `${server.fatalError || 'Leitor servidor falhou.'} | ${local.fatalError || 'Leitor local falhou.'}`;
    return local;
  }

  const local = await base.analyzePayrollFile(args);
  if (local.totalPages > 0) return local;

  const server = await analyzeOnServer(args);
  if (server.totalPages > 0) return server;
  server.fatalError = `${local.fatalError || 'Leitor local falhou.'} | ${server.fatalError || 'Leitor servidor falhou.'}`;
  return server;
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
