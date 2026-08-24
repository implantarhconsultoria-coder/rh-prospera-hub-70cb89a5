import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { ParsedPayrollPdf, PayrollEmployeeMatch } from './payrollDocumentsV2';
import {
  extractReceiptNameCandidates,
  matchEmployeeName,
  normalizePersonName,
} from './payrollIdentityEngine';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const money = (raw: string) => {
  const value = Number(String(raw || '')
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
};

const extractAmount = (text: string) => {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const patterns = [
    /\bVALOR\s+TOTAL\D{0,30}(?:R\$\s*)?([\d.]+,\d{2})/i,
    /\bVALOR\D{0,30}(?:R\$\s*)?([\d.]+,\d{2})/i,
    /\bR\$\s*([\d.]+,\d{2})/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const value = match?.[1] ? money(match[1]) : null;
    if (value != null && value > 0) return value;
  }
  return null;
};

const extractMaskedCpf = (text: string) => String(text || '').match(/(?:CPF\s*\/\s*CNPJ|CPF|CNPJ)[^\n\r]{0,30}?([*\d.\/-]{8,24})/i)?.[1] || null;

const findEmployeeInSource = (text: string, employees: PayrollEmployeeMatch[]) => {
  const candidates = extractReceiptNameCandidates(text);
  const attempts = candidates.map(candidate => ({ candidate, result: matchEmployeeName(candidate, employees) }));
  const automatic = attempts.find(attempt => attempt.result.decision === 'AUTO_MATCH' && attempt.result.employee);
  if (automatic) return automatic;

  // Fallback contextual: nome completo cadastrado aparece literalmente no texto geral.
  const normalizedText = ` ${normalizePersonName(text)} `;
  const exactEmployees = employees.filter(employee => {
    const name = normalizePersonName(employee.name);
    return name.length >= 5 && normalizedText.includes(` ${name} `);
  });
  if (exactEmployees.length === 1) {
    const result = matchEmployeeName(exactEmployees[0].name, employees);
    return { candidate: exactEmployees[0].name, result };
  }

  const ambiguous = attempts.find(attempt => attempt.result.decision === 'AMBIGUOUS_EMPLOYEE_MATCH');
  return ambiguous || attempts[0] || { candidate: null, result: matchEmployeeName(null, employees) };
};

const extractNativePdfText = async (bytes: Uint8Array) => {
  const loading = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loading.promise;
  const parts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = (content.items || []).map((item: any) => String(item?.str || '').trim()).filter(Boolean).join(' ');
      if (text) parts.push(text);
    }
  } finally {
    try { await pdf.destroy(); } catch { /* noop */ }
    try { await loading.destroy?.(); } catch { /* noop */ }
  }
  return parts.join('\n');
};

let workerPromise: Promise<any> | null = null;
const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(async mod => {
      const worker = await mod.createWorker('por');
      try {
        await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' } as any);
      } catch { /* melhoria opcional */ }
      return worker;
    }).catch(error => { workerPromise = null; throw error; });
  }
  return workerPromise;
};

const preprocess = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    const contrasted = gray < 185 ? Math.max(0, gray - 35) : Math.min(255, gray + 30);
    data[i] = contrasted;
    data[i + 1] = contrasted;
    data[i + 2] = contrasted;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
};

const ocrPdfBytes = async (bytes: Uint8Array) => {
  const loading = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loading.promise;
  const parts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2.7 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      preprocess(canvas);
      const worker = await getWorker();
      const result = await worker.recognize(canvas);
      const text = String(result?.data?.text || '').trim();
      if (text) parts.push(text);
    }
  } finally {
    try { await pdf.destroy(); } catch { /* noop */ }
    try { await loading.destroy?.(); } catch { /* noop */ }
  }
  return parts.join('\n');
};

const logDecision = ({ item, text, usedOcr, candidate, result }: any) => {
  console.info('[payroll-matching]', {
    empresaSelecionada: item?.companyId || null,
    companyId: result?.employee?.companyId || null,
    paginas: item?.pageNumbers || [],
    textoExtraido: String(text || '').slice(0, 3000),
    ocrExecutado: Boolean(usedOcr),
    nomeDetectado: candidate || null,
    valorDetectado: extractAmount(text),
    funcionariosCandidatos: result?.candidates || [],
    melhorCandidato: result?.employee?.name || null,
    scoreNome: result?.nameScore ?? 0,
    scoreValor: null,
    cpfEncontrado: extractMaskedCpf(text),
    decisao: result?.decision || 'NAME_NOT_FOUND',
    motivoDaDecisao: result?.reason || 'Sem decisão',
  });
};

/**
 * OCR e matching são etapas separadas.
 * A lista de employees já chega filtrada pela empresa selecionada no Fechamento.
 * CPF nunca bloqueia. O nome contextual é a chave de identificação; valor é
 * extraído para o reconciliador confirmar RECIBO -> COMPROVANTE.
 */
export const recoverUnmatchedReceipt = async (
  item: ParsedPayrollPdf,
  employees: PayrollEmployeeMatch[],
): Promise<ParsedPayrollPdf> => {
  if (!item.bytes?.byteLength) return item;

  try {
    const sources: Array<{ text: string; usedOcr: boolean }> = [];
    const existingText = String(item.text || '').trim();
    if (existingText) sources.push({ text: existingText, usedOcr: Boolean(item.usedOcr) });

    const nativeText = await extractNativePdfText(item.bytes);
    if (normalizePersonName(nativeText) && normalizePersonName(nativeText) !== normalizePersonName(existingText)) {
      sources.push({ text: nativeText, usedOcr: false });
    }

    for (const source of sources) {
      const attempt = findEmployeeInSource(source.text, employees);
      logDecision({ item, text: source.text, usedOcr: source.usedOcr, candidate: attempt.candidate, result: attempt.result });
      if (attempt.result.decision === 'AUTO_MATCH' && attempt.result.employee) {
        return {
          ...item,
          text: source.text,
          employeeId: attempt.result.employee.id,
          employeeName: attempt.result.employee.name,
          matchMethod: 'NOME_UNICO',
          confidence: 100,
          amountDetected: extractAmount(source.text) ?? item.amountDetected,
          usedOcr: source.usedOcr,
        };
      }
    }

    const ocrText = await ocrPdfBytes(item.bytes);
    if (!normalizePersonName(ocrText)) {
      console.error('[payroll-matching]', { paginas: item.pageNumbers, decisao: 'OCR_FAILED', motivoDaDecisao: 'OCR não retornou texto utilizável.' });
      return { ...item, text: nativeText || existingText, employeeId: null, employeeName: null, matchMethod: 'NAO_IDENTIFICADO', confidence: 0 };
    }

    const attempt = findEmployeeInSource(ocrText, employees);
    logDecision({ item, text: ocrText, usedOcr: true, candidate: attempt.candidate, result: attempt.result });
    if (attempt.result.decision !== 'AUTO_MATCH' || !attempt.result.employee) {
      return {
        ...item,
        text: ocrText,
        employeeId: null,
        employeeName: attempt.candidate || null,
        matchMethod: 'NAO_IDENTIFICADO',
        confidence: 0,
        amountDetected: extractAmount(ocrText) ?? item.amountDetected,
        usedOcr: true,
      };
    }

    return {
      ...item,
      text: ocrText,
      employeeId: attempt.result.employee.id,
      employeeName: attempt.result.employee.name,
      matchMethod: 'NOME_UNICO',
      confidence: 100,
      amountDetected: extractAmount(ocrText) ?? item.amountDetected,
      usedOcr: true,
    };
  } catch (error: any) {
    console.error('[receipt-ocr-recovery]', { paginas: item.pageNumbers, error: error?.message || String(error), stack: error?.stack || null });
    return { ...item, employeeId: null, employeeName: null, matchMethod: 'NAO_IDENTIFICADO', confidence: 0 };
  }
};

export const recoverUnmatchedReceipts = async (items: ParsedPayrollPdf[], employees: PayrollEmployeeMatch[]) => {
  const output: ParsedPayrollPdf[] = [];
  for (const item of items) output.push(await recoverUnmatchedReceipt(item, employees));
  return output;
};
