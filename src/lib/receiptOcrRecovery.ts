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

const receiverCandidates = (text: string) => {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const lines = source.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const candidates: string[] = [];
  const push = (value?: string | null) => {
    const clean = String(value || '')
      .replace(/^[:.\-\s]+/, '')
      .replace(/[|;]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalize(clean).length >= 5) candidates.push(clean);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const patterns = [
      /NOME\s+DO\s+RECEBEDOR\.?\s*[:\-]?\s*(.*)$/i,
      /FAVORECIDO\.?\s*[:\-]?\s*(.*)$/i,
      /PAGO\s+PARA\.?\s*[:\-]?\s*(.*)$/i,
      /TRANSFERIDO\s+PARA\.?\s*[:\-]?\s*(?:CLIENTE\s*[:\-]?\s*)?(.*)$/i,
    ];
    for (const pattern of patterns) {
      const match = lines[i].match(pattern);
      if (!match) continue;
      if (match[1]?.trim()) push(match[1]);
      else if (lines[i + 1]) push(lines[i + 1]);
    }
  }

  const flat = source.replace(/\s+/g, ' ');
  const stop = '(?=\\s+(?:CPF\\s*\\/\\s*CNPJ|CPF|CNPJ|CHAVE|INSTITUI[CÇ][AÃ]O|AG[ÊE]NCIA|CONTA|BANCO|NR\\.?\\s*DOCUMENTO|VALOR|DEBITO|D[ÉE]BITO|DATA|DOCUMENTO|AUTENTICA[CÇ][AÃ]O|FINALIDADE|TIPO\\s+DE\\s+CONTA|$))';
  const flatPatterns = [
    new RegExp(`NOME\\s+DO\\s+RECEBEDOR\\.?\\s*[:\\-]?\\s*(.+?)${stop}`, 'i'),
    new RegExp(`FAVORECIDO\\.?\\s*[:\\-]?\\s*(.+?)${stop}`, 'i'),
    new RegExp(`PAGO\\s+PARA\\.?\\s*[:\\-]?\\s*(.+?)${stop}`, 'i'),
    new RegExp(`TRANSFERIDO\\s+PARA\\.?\\s*[:\\-]?\\s*(?:CLIENTE\\s*[:\\-]?\\s*)?(.+?)${stop}`, 'i'),
  ];
  for (const pattern of flatPatterns) push(flat.match(pattern)?.[1]);

  return Array.from(new Set(candidates.map(normalize))).filter(Boolean);
};

const findEmployeeByName = (text: string, employees: PayrollEmployeeMatch[]) => {
  const normalizedText = ` ${normalize(text)} `;

  // Regra 1: nome completo do funcionário aparece no documento.
  const exactInText = employees.filter(employee => {
    const name = normalize(employee.name);
    return name.length >= 5 && normalizedText.includes(` ${name} `);
  });
  if (exactInText.length === 1) return exactInText[0];

  // Regra 2: campo explícito de recebedor/favorecido é igual ao nome cadastrado.
  const candidates = receiverCandidates(text);
  for (const candidate of candidates) {
    const exact = employees.filter(employee => normalize(employee.name) === candidate);
    if (exact.length === 1) return exact[0];
  }

  return null;
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
      const worker = await mod.createWorker('eng');
      try { await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' } as any); } catch { /* noop */ }
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
    data[i] = contrasted; data[i + 1] = contrasted; data[i + 2] = contrasted; data[i + 3] = 255;
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
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
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
 * Matching determinístico, sem score/confidence como regra.
 * A lista de employees já chega filtrada pela empresa selecionada.
 */
export const recoverUnmatchedReceipt = async (
  item: ParsedPayrollPdf,
  employees: PayrollEmployeeMatch[],
): Promise<ParsedPayrollPdf> => {
  if (!item.bytes?.byteLength) return item;
  try {
    const sources: Array<{ text: string; usedOcr: boolean }> = [];
    const existingText = String(item.text || '').trim();
    if (existingText) sources.push({ text: existingText, usedOcr: false });

    const nativeText = await extractNativePdfText(item.bytes);
    if (normalize(nativeText) && normalize(nativeText) !== normalize(existingText)) sources.push({ text: nativeText, usedOcr: false });

    for (const source of sources) {
      const employee = findEmployeeByName(source.text, employees);
      if (employee) return {
        ...item,
        text: source.text,
        employeeId: employee.id,
        employeeName: employee.name,
        matchMethod: 'NOME_UNICO',
        confidence: 100,
        amountDetected: extractAmount(source.text) ?? item.amountDetected,
        usedOcr: source.usedOcr,
      };
    }

    const ocrText = await ocrPdfBytes(item.bytes);
    if (!normalize(ocrText)) return nativeText ? { ...item, text: nativeText, confidence: 0 } : { ...item, confidence: 0 };
    const employee = findEmployeeByName(ocrText, employees);
    if (!employee) return { ...item, text: ocrText, employeeId: null, employeeName: null, matchMethod: 'NAO_IDENTIFICADO', confidence: 0, usedOcr: true };

    return {
      ...item,
      text: ocrText,
      employeeId: employee.id,
      employeeName: employee.name,
      matchMethod: 'NOME_UNICO',
      confidence: 100,
      amountDetected: extractAmount(ocrText) ?? item.amountDetected,
      usedOcr: true,
    };
  } catch (error) {
    console.error('[receipt-ocr-recovery]', error);
    return { ...item, employeeId: null, employeeName: null, matchMethod: 'NAO_IDENTIFICADO', confidence: 0 };
  }
};

export const recoverUnmatchedReceipts = async (items: ParsedPayrollPdf[], employees: PayrollEmployeeMatch[]) => {
  const output: ParsedPayrollPdf[] = [];
  for (const item of items) output.push(await recoverUnmatchedReceipt(item, employees));
  return output;
};
