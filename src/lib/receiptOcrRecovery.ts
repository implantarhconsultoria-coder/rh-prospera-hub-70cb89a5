import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { ParsedPayrollPdf, PayrollEmployeeMatch } from './payrollDocumentsV2';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const STOP_WORDS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);

const nameTokens = (value: string) => normalize(value)
  .split(' ')
  .filter(token => token && !STOP_WORDS.has(token));

const tokenCompatible = (a: string, b: string) => {
  if (a === b) return true;
  if (a.length === 1) return b.startsWith(a);
  if (b.length === 1) return a.startsWith(b);
  if (Math.min(a.length, b.length) >= 4) return a.startsWith(b) || b.startsWith(a);
  return false;
};

const employeeScore = (text: string, employeeName: string) => {
  const haystack = normalize(text);
  const target = normalize(employeeName);
  if (!haystack || !target) return 0;
  if (haystack.includes(target)) return 1;

  const tokens = nameTokens(employeeName);
  if (tokens.length < 2) return 0;
  const words = haystack.split(' ').filter(Boolean);
  const matched = tokens.filter(token => words.some(word => tokenCompatible(token, word))).length;
  const coverage = matched / tokens.length;
  const first = words.some(word => tokenCompatible(tokens[0], word));
  const last = words.some(word => tokenCompatible(tokens[tokens.length - 1], word));
  if (first && last && coverage >= 0.66) return 0.90 + Math.min(0.09, coverage * 0.09);
  if (first && coverage >= 0.80) return 0.86 + Math.min(0.08, coverage * 0.08);
  return 0;
};

const findUniqueEmployee = (text: string, employees: PayrollEmployeeMatch[]) => {
  const ranked = employees
    .map(employee => ({ employee, score: employeeScore(text, employee.name) }))
    .filter(item => item.score >= 0.86)
    .sort((a, b) => b.score - a.score);
  if (!ranked[0]) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < 0.08) return null;
  return ranked[0];
};

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
  const prioritized = [
    /\bVALOR\s+TOTAL\D{0,20}(?:R\$\s*)?([\d.]+,\d{2})/i,
    /\bVALOR\D{0,20}(?:R\$\s*)?([\d.]+,\d{2})/i,
    /\bR\$\s*([\d.]+,\d{2})/i,
  ];
  for (const pattern of prioritized) {
    const match = source.match(pattern);
    const value = match?.[1] ? money(match[1]) : null;
    if (value != null && value > 0) return value;
  }
  return null;
};

let workerPromise: Promise<any> | null = null;

const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(async mod => {
      const worker = await mod.createWorker('eng');
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: '11',
          preserve_interword_spaces: '1',
        } as any);
      } catch {
        // parâmetros são melhoria, não requisito para leitura.
      }
      return worker;
    }).catch(error => {
      workerPromise = null;
      throw error;
    });
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
      const viewport = page.getViewport({ scale: 2.55 });
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

/**
 * Segunda leitura exclusivamente para comprovantes que o parser normal não conseguiu vincular.
 * Usa OCR em alta resolução e compara o texto contra TODOS os nomes da empresa selecionada.
 * Valor é evidência adicional e nunca bloqueia um nome completo/inequívoco.
 */
export const recoverUnmatchedReceipt = async (
  item: ParsedPayrollPdf,
  employees: PayrollEmployeeMatch[],
): Promise<ParsedPayrollPdf> => {
  if (item.employeeId || !item.bytes?.byteLength) return item;
  try {
    const ocrText = await ocrPdfBytes(item.bytes);
    if (!normalize(ocrText)) return item;
    const ranked = findUniqueEmployee(ocrText, employees);
    if (!ranked) return { ...item, text: ocrText, usedOcr: true };
    return {
      ...item,
      text: ocrText,
      employeeId: ranked.employee.id,
      employeeName: ranked.employee.name,
      matchMethod: 'NOME_UNICO',
      confidence: Math.max(94, Math.round(ranked.score * 100)),
      amountDetected: extractAmount(ocrText) ?? item.amountDetected,
      usedOcr: true,
    };
  } catch (error) {
    console.error('[receipt-ocr-recovery]', error);
    return item;
  }
};

export const recoverUnmatchedReceipts = async (
  items: ParsedPayrollPdf[],
  employees: PayrollEmployeeMatch[],
) => {
  const output: ParsedPayrollPdf[] = [];
  for (const item of items) output.push(await recoverUnmatchedReceipt(item, employees));
  return output;
};
