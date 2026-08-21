import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

type StructuredPdfPage = {
  page: number;
  text: string;
  lines: string[];
  usedOcr: boolean;
};

export type PayrollEmployeeMatch = {
  id: string;
  name: string;
  cpf?: string;
  cargo?: string;
  companyId?: string;
};

export type PayrollDocumentType = 'PAYSLIP' | 'SALARY_ADVANCE' | 'PAYMENT_RECEIPT' | 'UNKNOWN';

export type PayrollDocumentMetadata = {
  documentType: PayrollDocumentType;
  documentSubtype: string | null;
  employeeCodeDetected: string | null;
  employeeNameDetected: string | null;
  jobTitleDetected: string | null;
  cboDetected: string | null;
  companyNameDetected: string | null;
  cnpjDetected: string | null;
  competenciaDetected: string | null;
  competenciaLabelDetected: string | null;
  netAmountDetected: number | null;
  duplicateCopiesDetected: number;
};

export type ParsedPayrollPdf = {
  bytes: Uint8Array;
  filename: string;
  text: string;
  employeeId: string | null;
  employeeName: string | null;
  matchMethod: 'CPF' | 'NOME_UNICO' | 'NOME_VALOR' | 'NAO_IDENTIFICADO';
  confidence: number;
  cpfDetected: string | null;
  amountDetected: number | null;
  pageNumbers: number[];
  documentType?: PayrollDocumentType;
  documentSubtype?: string | null;
  employeeCodeDetected?: string | null;
  jobTitleDetected?: string | null;
  cboDetected?: string | null;
  companyNameDetected?: string | null;
  cnpjDetected?: string | null;
  competenciaDetected?: string | null;
  competenciaLabelDetected?: string | null;
  duplicateCopiesDetected?: number;
  usedOcr?: boolean;
};

const stripAccents = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const normalize = (value: unknown) => stripAccents(value)
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeKeepPunctuation = (value: unknown) => stripAccents(value)
  .replace(/\u00a0/g, ' ')
  .replace(/[\t\f\v]+/g, ' ')
  .replace(/ +/g, ' ')
  .trim();

export const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

export const sha256Browser = async (input: Blob | ArrayBuffer | Uint8Array) => {
  const bytes = input instanceof Blob
    ? new Uint8Array(await input.arrayBuffer())
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const moneyNumber = (raw: string) => {
  const cleaned = raw
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
};

export const extractCpf = (text: string) => {
  const matches = text.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g) || [];
  for (const match of matches) {
    const cpf = onlyDigits(match);
    if (cpf.length === 11) return cpf;
  }
  return null;
};

export const extractLikelyAmount = (text: string) => {
  const clean = normalizeKeepPunctuation(text);

  // Folha/holerite: TOTAL LÍQUIDO tem prioridade absoluta.
  const netPatterns = [
    /TOTAL\s+L[IÍ]QUIDO\s*(?:--?>|[:=\-]*)\s*(?:R\$\s*)?([\d.]+,\d{2})/gi,
    /(?:VALOR\s+L[IÍ]QUIDO|L[IÍ]QUIDO\s+A\s+RECEBER|L[IÍ]QUIDO\s+DO\s+HOLERITE)\D{0,35}(?:R\$\s*)?([\d.]+,\d{2})/gi,
  ];
  for (const pattern of netPatterns) {
    const values: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(clean))) {
      const value = moneyNumber(match[1]);
      if (value != null && value >= 0) values.push(value);
    }
    if (values.length) return values[0];
  }

  // Comprovante bancário: usa valor efetivamente pago/transferido.
  const paymentPatterns = [
    /(?:VALOR\s+(?:PAGO|DA\s+TRANSA[CÇ][AÃ]O|TRANSFERIDO|DO\s+PAGAMENTO)|PAGAMENTO)\D{0,50}(?:R\$\s*)?([\d.]+,\d{2})/gi,
    /R\$\s*([\d.]+,\d{2})/g,
  ];
  for (const pattern of paymentPatterns) {
    const values: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(clean))) {
      const value = moneyNumber(match[1]);
      if (value != null && value > 0) values.push(value);
    }
    if (values.length) return values[values.length - 1];
  }
  return null;
};

export const extractReceiptMetadata = (text: string) => {
  const clean = text.replace(/\u00a0/g, ' ');
  const transaction = clean.match(/(?:ID\s*(?:DA\s*)?TRANSA[CÇ][AÃ]O|ID\s*PIX|E2E|END\s*TO\s*END|AUTENTICA[CÇ][AÃ]O)\s*[:#-]?\s*([A-Z0-9._-]{6,80})/i)?.[1] || null;
  const dateMatch = clean.match(/\b(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  let paidAt: string | null = null;
  if (dateMatch) {
    const [, dd, mm, yyyy, hh = '12', mi = '00', ss = '00'] = dateMatch;
    paidAt = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
  }
  const bankLine = clean.match(/(?:BANCO|INSTITUI[CÇ][AÃ]O)\s*[:#-]?\s*([^\n\r]{3,60})/i)?.[1]?.trim() || null;
  const auth = clean.match(/AUTENTICA[CÇ][AÃ]O\s*(?:BANC[AÁ]RIA)?\s*[:#-]?\s*([A-Z0-9._-]{5,100})/i)?.[1] || null;
  const payer = clean.match(/(?:PAGADOR|ORIGEM|PAGO\s+POR)\s*[:#-]?\s*([^\n\r]{3,100})/i)?.[1]?.trim() || null;
  return {
    amount: extractLikelyAmount(clean),
    paidAt,
    transactionId: transaction,
    bankName: bankLine,
    bankAuthentication: auth,
    payerName: payer,
  };
};

const MONTHS: Record<string, string> = {
  JANEIRO: '01',
  FEVEREIRO: '02',
  MARCO: '03',
  ABRIL: '04',
  MAIO: '05',
  JUNHO: '06',
  JULHO: '07',
  AGOSTO: '08',
  SETEMBRO: '09',
  OUTUBRO: '10',
  NOVEMBRO: '11',
  DEZEMBRO: '12',
};

const extractCompetencia = (text: string) => {
  const plain = stripAccents(text).toUpperCase();
  const named = plain.match(/\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s*\/\s*(20\d{2})\b/);
  if (named) {
    return { normalized: `${named[2]}-${MONTHS[named[1]]}`, label: `${named[1][0]}${named[1].slice(1).toLowerCase()}/${named[2]}` };
  }
  const numeric = plain.match(/\b(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})\b/);
  if (numeric) {
    const month = numeric[1].padStart(2, '0');
    return { normalized: `${numeric[2]}-${month}`, label: `${month}/${numeric[2]}` };
  }
  return { normalized: null, label: null };
};

const findEmployeeCandidateLine = (lines: string[]) => {
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const match = line.match(/^\s*(\d{1,6})\s+([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'´`.-]*(?:\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'´`.-]*){1,8})\s+(\d{6})\b/i);
    if (!match) continue;
    const candidateName = match[2].trim();
    const normalizedName = normalize(candidateName);
    if (/^(CODIGO|NOME|EMPRESA|LOCAL|DEPTO|SETOR|SECAO|FOLHA)$/.test(normalizedName)) continue;
    return {
      code: match[1],
      name: candidateName,
      cbo: match[3],
      line,
    };
  }
  return null;
};

const isLikelyJobTitle = (line: string) => {
  const n = normalize(line);
  if (!n || n.length < 4 || /\d{3}/.test(n)) return false;
  if (/(RECIBO|PAGAMENTO|CODIGO|DESCRICAO|REFERENCIA|VENCIMENTOS|DESCONTOS|ASSINATURA|DATA|TOTAL|SALARIO|CALCULO|FGTS|IRRF|FAIXA|EMPRESA|LOCAL|DEPTO|SETOR|SECAO|FOLHA|ANIVERSARIO)/.test(n)) return false;
  return /^[A-Z0-9 ]+$/.test(n) && n.split(' ').filter(Boolean).length <= 8;
};

const extractJobTitle = (lines: string[], employeeLine: string | null, employeeName: string | null) => {
  if (!employeeName) return null;
  const nameNorm = normalize(employeeName);
  const start = Math.max(0, lines.findIndex(line => employeeLine ? line === employeeLine : normalize(line).includes(nameNorm)));
  for (let i = start + 1; i < Math.min(lines.length, start + 5); i += 1) {
    if (isLikelyJobTitle(lines[i])) return lines[i].replace(/\s+/g, ' ').trim();
  }
  return null;
};

const extractCompanyName = (lines: string[]) => {
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const n = normalize(line);
    if (!n) continue;
    if (/\b(LTDA|EIRELI|LIMITADA|S A|SA)\b/.test(n) && !/RECIBO|PAGAMENTO/.test(n)) return line;
  }
  return null;
};

const countOccurrences = (text: string, needle: string) => {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while (true) {
    const next = text.indexOf(needle, cursor);
    if (next < 0) break;
    count += 1;
    cursor = next + needle.length;
  }
  return count;
};

export const extractPayrollDocumentMetadata = (text: string, linesInput?: string[]): PayrollDocumentMetadata => {
  const lines = (linesInput?.length ? linesInput : text.split(/\r?\n/))
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const compact = normalize(text);
  const candidate = findEmployeeCandidateLine(lines);
  const competencia = extractCompetencia(text);
  const cnpj = text.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/)?.[0] || null;
  const receiptCopies = countOccurrences(compact, 'RECIBO DE PAGAMENTO');
  const employeeCopies = candidate?.name ? countOccurrences(compact, normalize(candidate.name)) : 0;
  const duplicateCopiesDetected = Math.max(1, receiptCopies >= 2 && employeeCopies >= 2 ? Math.min(receiptCopies, employeeCopies) : 1);
  const isAdvance = /\bADTO\b/.test(compact) || compact.includes('ADIANTAMENTO CREDITO');
  const isPayslip = compact.includes('RECIBO DE PAGAMENTO') || compact.includes('HOLERITE') || compact.includes('CONTRACHEQUE');
  const documentType: PayrollDocumentType = isAdvance ? 'SALARY_ADVANCE' : isPayslip ? 'PAYSLIP' : 'UNKNOWN';

  return {
    documentType,
    documentSubtype: isAdvance ? 'ADTO' : null,
    employeeCodeDetected: candidate?.code || null,
    employeeNameDetected: candidate?.name || null,
    jobTitleDetected: extractJobTitle(lines, candidate?.line || null, candidate?.name || null),
    cboDetected: candidate?.cbo || null,
    companyNameDetected: extractCompanyName(lines),
    cnpjDetected: cnpj,
    competenciaDetected: competencia.normalized,
    competenciaLabelDetected: competencia.label,
    netAmountDetected: extractLikelyAmount(text),
    duplicateCopiesDetected,
  };
};

const buildStructuredLines = (items: PdfTextItem[]) => {
  const positioned = items
    .map((item, index) => ({
      str: String(item.str || '').replace(/\s+/g, ' ').trim(),
      x: Number(item.transform?.[4] ?? index),
      y: Number(item.transform?.[5] ?? 0),
      index,
    }))
    .filter(item => item.str);

  if (!positioned.length) return [];
  if (!positioned.some(item => Number.isFinite(item.x) && Number.isFinite(item.y) && item.y !== 0)) {
    return [positioned.map(item => item.str).join(' ')];
  }

  positioned.sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 2.5) return yDiff;
    return a.x - b.x || a.index - b.index;
  });

  const rows: Array<{ y: number; parts: Array<{ x: number; str: string }> }> = [];
  for (const item of positioned) {
    const row = rows.find(existing => Math.abs(existing.y - item.y) <= 2.5);
    if (row) row.parts.push({ x: item.x, str: item.str });
    else rows.push({ y: item.y, parts: [{ x: item.x, str: item.str }] });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map(row => row.parts.sort((a, b) => a.x - b.x).map(part => part.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
};

const canvasForPage = async (page: any, scale = 1.65) => {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canvas_unavailable');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { canvas, viewport };
};

const ocrPage = async (page: any) => {
  try {
    const { canvas } = await canvasForPage(page, 1.8);
    const tesseract = await import('tesseract.js');
    const result = await tesseract.recognize(canvas, 'por');
    return String(result?.data?.text || '').trim();
  } catch (error) {
    console.warn('[payroll-pdf] OCR fallback indisponível:', error);
    return '';
  }
};

const textForPage = async (page: any): Promise<{ text: string; lines: string[]; usedOcr: boolean }> => {
  const content = await page.getTextContent();
  const lines = buildStructuredLines((content.items || []) as PdfTextItem[]);
  const nativeText = lines.join('\n').trim();
  const usableNativeText = normalize(nativeText).length >= 25;
  if (usableNativeText) return { text: nativeText, lines, usedOcr: false };

  const ocrText = await ocrPage(page);
  if (ocrText) {
    return {
      text: ocrText,
      lines: ocrText.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean),
      usedOcr: true,
    };
  }
  return { text: nativeText, lines, usedOcr: false };
};

export const extractPdfPages = async (bytes: Uint8Array): Promise<StructuredPdfPage[]> => {
  const loading = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loading.promise;
  const pages: StructuredPdfPage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const extracted = await textForPage(page);
    pages.push({ page: pageNumber, ...extracted });
  }
  await loading.destroy();
  return pages;
};

const similarity = (a: string, b: string) => {
  const aa = normalize(a);
  const bb = normalize(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length);
  const aTokens = new Set(aa.split(' ').filter(token => token.length > 1));
  const bTokens = new Set(bb.split(' ').filter(token => token.length > 1));
  const union = new Set([...aTokens, ...bTokens]);
  const intersection = [...aTokens].filter(token => bTokens.has(token));
  return union.size ? intersection.length / union.size : 0;
};

const findEmployee = (
  text: string,
  lines: string[],
  employees: PayrollEmployeeMatch[],
  amount?: number | null,
  netAmountByEmployee?: Map<string, number>,
) => {
  const compact = normalize(text);
  const cpf = extractCpf(text);
  if (cpf) {
    const cpfMatches = employees.filter(emp => onlyDigits(emp.cpf) === cpf);
    if (cpfMatches.length === 1) return { employee: cpfMatches[0], method: 'CPF' as const, confidence: 100, cpf };
  }

  const metadata = extractPayrollDocumentMetadata(text, lines);
  const detectedName = metadata.employeeNameDetected;
  const directMatches = employees
    .filter(emp => {
      const n = normalize(emp.name);
      return n.length >= 7 && compact.includes(n);
    })
    .sort((a, b) => normalize(b.name).length - normalize(a.name).length);

  let candidate: PayrollEmployeeMatch | null = directMatches.length === 1 ? directMatches[0] : null;
  let baseConfidence = candidate ? 88 : 0;

  if (!candidate && detectedName) {
    const ranked = employees
      .map(employee => ({ employee, score: similarity(detectedName, employee.name) }))
      .filter(item => item.score >= 0.82)
      .sort((a, b) => b.score - a.score);
    if (ranked.length === 1 || (ranked[0] && ranked[1] && ranked[0].score - ranked[1].score >= 0.12)) {
      candidate = ranked[0].employee;
      baseConfidence = Math.round(ranked[0].score * 90);
    }
  }

  if (candidate) {
    if (amount != null && netAmountByEmployee?.has(candidate.id)) {
      const expected = Number(netAmountByEmployee.get(candidate.id) || 0);
      if (Math.abs(expected - amount) <= 0.02) {
        return { employee: candidate, method: 'NOME_VALOR' as const, confidence: Math.max(92, baseConfidence), cpf: null };
      }
      return { employee: null, method: 'NAO_IDENTIFICADO' as const, confidence: 0, cpf: null };
    }
    return { employee: candidate, method: 'NOME_UNICO' as const, confidence: baseConfidence, cpf: null };
  }

  return { employee: null, method: 'NAO_IDENTIFICADO' as const, confidence: 0, cpf };
};

const pagesToPdfBytes = async (source: Uint8Array, pageNumbers: number[]) => {
  const pdf = await pdfjsLib.getDocument({ data: source }).promise;
  let out: jsPDF | null = null;
  for (const pageNumber of pageNumbers) {
    const page = await pdf.getPage(pageNumber);
    const { canvas, viewport } = await canvasForPage(page);
    const orientation = viewport.width > viewport.height ? 'landscape' : 'portrait';
    const widthMm = orientation === 'landscape' ? 297 : 210;
    const heightMm = orientation === 'landscape' ? 210 : 297;
    if (!out) out = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
    else out.addPage('a4', orientation);
    const image = canvas.toDataURL('image/jpeg', 0.95);
    const scale = Math.min(widthMm / viewport.width, heightMm / viewport.height);
    const drawW = viewport.width * scale;
    const drawH = viewport.height * scale;
    out.addImage(image, 'JPEG', (widthMm - drawW) / 2, (heightMm - drawH) / 2, drawW, drawH, undefined, 'FAST');
  }
  await pdf.destroy();
  if (!out) throw new Error('empty_pdf');
  return new Uint8Array(out.output('arraybuffer'));
};

const parsedResult = ({
  bytes,
  filename,
  text,
  lines,
  match,
  amount,
  pageNumbers,
  usedOcr,
}: {
  bytes: Uint8Array;
  filename: string;
  text: string;
  lines: string[];
  match: ReturnType<typeof findEmployee>;
  amount: number | null;
  pageNumbers: number[];
  usedOcr: boolean;
}): ParsedPayrollPdf => {
  const metadata = extractPayrollDocumentMetadata(text, lines);
  return {
    bytes,
    filename,
    text,
    employeeId: match.employee?.id || null,
    employeeName: match.employee?.name || metadata.employeeNameDetected || null,
    matchMethod: match.method,
    confidence: match.confidence,
    cpfDetected: match.cpf,
    amountDetected: metadata.netAmountDetected ?? amount,
    pageNumbers,
    documentType: metadata.documentType,
    documentSubtype: metadata.documentSubtype,
    employeeCodeDetected: metadata.employeeCodeDetected,
    jobTitleDetected: metadata.jobTitleDetected || match.employee?.cargo || null,
    cboDetected: metadata.cboDetected,
    companyNameDetected: metadata.companyNameDetected,
    cnpjDetected: metadata.cnpjDetected,
    competenciaDetected: metadata.competenciaDetected,
    competenciaLabelDetected: metadata.competenciaLabelDetected,
    duplicateCopiesDetected: metadata.duplicateCopiesDetected,
    usedOcr,
  };
};

export const parsePayrollPdf = async ({ file, employees, kind, netAmountByEmployee }: {
  file: File;
  employees: PayrollEmployeeMatch[];
  kind: 'HOLERITE' | 'COMPROVANTE';
  netAmountByEmployee?: Map<string, number>;
}): Promise<ParsedPayrollPdf[]> => {
  // PDF.js pode transferir/destacar buffers para o worker: sempre use cópias independentes.
  const scanBytes = new Uint8Array(await file.arrayBuffer());
  const pages = await extractPdfPages(scanBytes);
  if (!pages.length) return [];

  // PDF individual: mantém os bytes originais sem reconstrução.
  if (pages.length === 1) {
    const page = pages[0];
    const amount = extractLikelyAmount(page.text);
    const match = findEmployee(page.text, page.lines, employees, kind === 'COMPROVANTE' ? amount : null, netAmountByEmployee);
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    return [parsedResult({
      bytes: originalBytes,
      filename: file.name,
      text: page.text,
      lines: page.lines,
      match,
      amount,
      pageNumbers: [page.page],
      usedOcr: page.usedOcr,
    })];
  }

  // PDF consolidado: NUNCA assumir que o arquivo inteiro pertence a um único funcionário.
  // Cada página é lida individualmente antes de qualquer agrupamento.
  const analyzed = pages.map(page => {
    const amount = extractLikelyAmount(page.text);
    const match = findEmployee(page.text, page.lines, employees, kind === 'COMPROVANTE' ? amount : null, netAmountByEmployee);
    const metadata = extractPayrollDocumentMetadata(page.text, page.lines);
    const groupKey = match.employee
      ? [match.employee.id, metadata.documentType, metadata.competenciaDetected || '', metadata.netAmountDetected ?? amount ?? ''].join(':')
      : `unmatched-page-${page.page}`;
    return { page, amount, match, metadata, groupKey };
  });

  const groups = new Map<string, {
    employeeId: string | null;
    employeeName: string | null;
    method: ParsedPayrollPdf['matchMethod'];
    confidence: number;
    cpf: string | null;
    pages: number[];
    texts: string[];
    lines: string[];
    amount: number | null;
    usedOcr: boolean;
    match: ReturnType<typeof findEmployee>;
  }>();

  for (const item of analyzed) {
    const existing = groups.get(item.groupKey);
    if (existing && item.match.employee) {
      existing.pages.push(item.page.page);
      existing.texts.push(item.page.text);
      existing.lines.push(...item.page.lines);
      if (item.amount != null) existing.amount = item.amount;
      existing.confidence = Math.max(existing.confidence, item.match.confidence);
      existing.usedOcr = existing.usedOcr || item.page.usedOcr;
      continue;
    }
    groups.set(item.groupKey, {
      employeeId: item.match.employee?.id || null,
      employeeName: item.match.employee?.name || item.metadata.employeeNameDetected || null,
      method: item.match.method,
      confidence: item.match.confidence,
      cpf: item.match.cpf,
      pages: [item.page.page],
      texts: [item.page.text],
      lines: [...item.page.lines],
      amount: item.amount,
      usedOcr: item.page.usedOcr,
      match: item.match,
    });
  }

  const output: ParsedPayrollPdf[] = [];
  for (const group of groups.values()) {
    const splitSource = new Uint8Array(await file.arrayBuffer());
    const split = await pagesToPdfBytes(splitSource, group.pages);
    const suffix = group.employeeName
      ? normalize(group.employeeName).replace(/\s+/g, '_')
      : `NAO_IDENTIFICADO_P${group.pages[0]}`;
    const finalName = `${file.name.replace(/\.pdf$/i, '')}_${suffix}.pdf`;
    output.push(parsedResult({
      bytes: split,
      filename: finalName,
      text: group.texts.join('\n'),
      lines: group.lines,
      match: group.match,
      amount: group.amount,
      pageNumbers: group.pages,
      usedOcr: group.usedOcr,
    }));
  }
  return output.sort((a, b) => (a.pageNumbers[0] || 0) - (b.pageNumbers[0] || 0));
};

const inflateRaw = async (bytes: Uint8Array) => {
  if (typeof DecompressionStream === 'undefined') throw new Error('ZIP compactado não suportado neste navegador. Envie os PDFs individualmente.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readU16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const readU32 = (view: DataView, offset: number) => view.getUint32(offset, true);

export const extractPdfFilesFromZip = async (file: File): Promise<File[]> => {
  const source = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const decoder = new TextDecoder();
  const results: File[] = [];
  let pos = 0;
  while (pos + 46 <= source.length) {
    if (readU32(view, pos) !== 0x02014b50) { pos += 1; continue; }
    const method = readU16(view, pos + 10);
    const compressedSize = readU32(view, pos + 20);
    const uncompressedSize = readU32(view, pos + 24);
    const nameLen = readU16(view, pos + 28);
    const extraLen = readU16(view, pos + 30);
    const commentLen = readU16(view, pos + 32);
    const localOffset = readU32(view, pos + 42);
    const name = decoder.decode(source.subarray(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;
    if (!/\.pdf$/i.test(name) || name.endsWith('/')) continue;
    if (localOffset + 30 > source.length || readU32(view, localOffset) !== 0x04034b50) continue;
    const localNameLen = readU16(view, localOffset + 26);
    const localExtraLen = readU16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = source.subarray(dataStart, dataStart + compressedSize);
    let bytes: Uint8Array;
    if (method === 0) bytes = new Uint8Array(compressed);
    else if (method === 8) bytes = await inflateRaw(compressed);
    else continue;
    if (uncompressedSize && bytes.length !== uncompressedSize) throw new Error(`ZIP inválido em ${name}`);
    results.push(new File([bytes], name.split('/').pop() || 'comprovante.pdf', { type: 'application/pdf' }));
  }
  if (!results.length) throw new Error('Nenhum PDF foi encontrado dentro do ZIP.');
  return results;
};

export const mergePdfUrls = async (sources: Array<{ url: string; label?: string }>, filename: string) => {
  let out: jsPDF | null = null;
  for (const source of sources) {
    const response = await fetch(source.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Falha ao carregar ${source.label || 'PDF'}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    for (let p = 1; p <= pdf.numPages; p += 1) {
      const page = await pdf.getPage(p);
      const { canvas, viewport } = await canvasForPage(page);
      const orientation = viewport.width > viewport.height ? 'landscape' : 'portrait';
      const widthMm = orientation === 'landscape' ? 297 : 210;
      const heightMm = orientation === 'landscape' ? 210 : 297;
      if (!out) out = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
      else out.addPage('a4', orientation);
      const image = canvas.toDataURL('image/jpeg', 0.95);
      const scale = Math.min(widthMm / viewport.width, heightMm / viewport.height);
      const drawW = viewport.width * scale;
      const drawH = viewport.height * scale;
      out.addImage(image, 'JPEG', (widthMm - drawW) / 2, (heightMm - drawH) / 2, drawW, drawH, undefined, 'FAST');
    }
    await pdf.destroy();
  }
  if (!out) throw new Error('Nenhum PDF para consolidar.');
  out.save(filename);
};
