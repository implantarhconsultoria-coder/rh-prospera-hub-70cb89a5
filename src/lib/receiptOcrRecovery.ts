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

const exactEmployeeMention = (text: string, employees: PayrollEmployeeMatch[]) => {
  const haystack = ` ${normalize(text)} `;
  if (!haystack.trim()) return null;
  const exact = employees.filter(employee => {
    const target = normalize(employee.name);
    return target.length >= 5 && haystack.includes(` ${target} `);
  });
  return exact.length === 1 ? { employee: exact[0], score: 1 } : null;
};

const employeeScore = (text: string, employeeName: string) => {
  const haystack = normalize(text);
  const target = normalize(employeeName);
  if (!haystack || !target) return 0;
  if (` ${haystack} `.includes(` ${target} `)) return 1;

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

const rankEmployees = (text: string, employees: PayrollEmployeeMatch[], minScore = 0.86, minGap = 0.08) => {
  const exact = exactEmployeeMention(text, employees);
  if (exact) return exact;
  const ranked = employees
    .map(employee => ({ employee, score: employeeScore(text, employee.name) }))
    .filter(item => item.score >= minScore)
    .sort((a, b) => b.score - a.score);
  if (!ranked[0]) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < minGap) return null;
  return ranked[0];
};

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
    const line = lines[i];
    const patterns = [
      /NOME\s+DO\s+RECEBEDOR\.?\s*[:\-]?\s*(.*)$/i,
      /FAVORECIDO\.?\s*[:\-]?\s*(.*)$/i,
      /PAGO\s+PARA\.?\s*[:\-]?\s*(.*)$/i,
      /TRANSFERIDO\s+PARA\.?\s*[:\-]?\s*(?:CLIENTE\s*[:\-]?\s*)?(.*)$/i,
    ];
    for (const pattern of patterns) {
      const match = line.match(pattern);
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

  return Array.from(new Map(candidates.map(candidate => [normalize(candidate), candidate])).values());
};

const findUniqueEmployee = (text: string, employees: PayrollEmployeeMatch[]) => {
  const exact = exactEmployeeMention(text, employees);
  if (exact) return exact;
  for (const candidate of receiverCandidates(text)) {
    const directExact = exactEmployeeMention(candidate, employees);
    if (directExact) return directExact;
    const direct = rankEmployees(candidate, employees, 0.72, 0.05);
    if (direct) return direct;
  }
  return rankEmployees(text, employees, 0.86, 0.08);
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
      const text = (content.items || [])
        .map((item: any) => String(item?.str || '').trim())
        .filter(Boolean)
        .join(' ');
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
 * Recuperação exclusivamente para comprovantes ainda sem vínculo.
 * A lista recebida já é da empresa selecionada no Fechamento.
 * Ordem: texto já extraído -> camada nativa do PDF -> OCR.
 * Nome completo exato dentro da empresa é chave definitiva; CPF e valor não bloqueiam.
 */
export const recoverUnmatchedReceipt = async (
  item: ParsedPayrollPdf,
  employees: PayrollEmployeeMatch[],
): Promise<ParsedPayrollPdf> => {
  if (item.employeeId || !item.bytes?.byteLength) return item;
  try {
    const existingText = String(item.text || '').trim();
    let ranked = existingText ? findUniqueEmployee(existingText, employees) : null;
    if (ranked) {
      return {
        ...item,
        employeeId: ranked.employee.id,
        employeeName: ranked.employee.name,
        matchMethod: 'NOME_UNICO',
        confidence: 100,
      };
    }

    const nativeText = await extractNativePdfText(item.bytes);
    ranked = nativeText ? findUniqueEmployee(nativeText, employees) : null;
    if (ranked) {
      return {
        ...item,
        text: nativeText,
        employeeId: ranked.employee.id,
        employeeName: ranked.employee.name,
        matchMethod: 'NOME_UNICO',
        confidence: 100,
        amountDetected: extractAmount(nativeText) ?? item.amountDetected,
      };
    }

    const ocrText = await ocrPdfBytes(item.bytes);
    if (!normalize(ocrText)) return nativeText ? { ...item, text: nativeText } : item;
    ranked = findUniqueEmployee(ocrText, employees);
    if (!ranked) return { ...item, text: ocrText, usedOcr: true };
    return {
      ...item,
      text: ocrText,
      employeeId: ranked.employee.id,
      employeeName: ranked.employee.name,
      matchMethod: 'NOME_UNICO',
      confidence: ranked.score === 1 ? 100 : Math.max(94, Math.round(ranked.score * 100)),
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
