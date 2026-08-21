import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export type PayrollEmployeeMatch = {
  id: string;
  name: string;
  cpf?: string;
  cargo?: string;
  companyId?: string;
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
};

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

export const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

export const sha256Browser = async (input: Blob | ArrayBuffer | Uint8Array) => {
  const bytes = input instanceof Blob ? new Uint8Array(await input.arrayBuffer())
    : input instanceof Uint8Array ? input
    : new Uint8Array(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const moneyNumber = (raw: string) => {
  const cleaned = raw.replace(/R\$/gi, '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
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
  const normalized = text.replace(/\u00a0/g, ' ');
  const patterns = [
    /(?:L[IÍ]QUIDO(?:\s+A\s+RECEBER)?|VALOR\s+L[IÍ]QUIDO|L[IÍ]QUIDO\s+DO\s+HOLERITE)\D{0,40}(R\$\s*)?([\d.]+,\d{2})/gi,
    /(?:VALOR\s+(?:PAGO|DA\s+TRANSA[CÇ][AÃ]O|TRANSFERIDO|DO\s+PAGAMENTO)|PAGAMENTO)\D{0,50}(R\$\s*)?([\d.]+,\d{2})/gi,
    /R\$\s*([\d.]+,\d{2})/g,
  ];
  for (const pattern of patterns) {
    const values: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalized))) {
      const raw = match[2] || match[1];
      const value = moneyNumber(raw);
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
  return { amount: extractLikelyAmount(clean), paidAt, transactionId: transaction, bankName: bankLine, bankAuthentication: auth, payerName: payer };
};

const textForPage = async (page: any) => {
  const content = await page.getTextContent();
  return (content.items || []).map((item: any) => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
};

export const extractPdfPages = async (bytes: Uint8Array) => {
  const loading = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loading.promise;
  const pages: Array<{ page: number; text: string }> = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    pages.push({ page: pageNumber, text: await textForPage(page) });
  }
  await loading.destroy();
  return pages;
};

const findEmployee = (text: string, employees: PayrollEmployeeMatch[], amount?: number | null, netAmountByEmployee?: Map<string, number>) => {
  const compact = normalize(text);
  const cpf = extractCpf(text);
  if (cpf) {
    const cpfMatches = employees.filter(emp => onlyDigits(emp.cpf) === cpf);
    if (cpfMatches.length === 1) return { employee: cpfMatches[0], method: 'CPF' as const, confidence: 100, cpf };
  }

  const nameMatches = employees.filter(emp => {
    const n = normalize(emp.name);
    return n.length >= 7 && compact.includes(n);
  });
  if (nameMatches.length === 1) {
    if (amount != null && netAmountByEmployee?.has(nameMatches[0].id)) {
      const expected = Number(netAmountByEmployee.get(nameMatches[0].id) || 0);
      if (Math.abs(expected - amount) <= 0.02) return { employee: nameMatches[0], method: 'NOME_VALOR' as const, confidence: 92, cpf: null };
      return { employee: null, method: 'NAO_IDENTIFICADO' as const, confidence: 0, cpf: null };
    }
    return { employee: nameMatches[0], method: 'NOME_UNICO' as const, confidence: 75, cpf: null };
  }
  return { employee: null, method: 'NAO_IDENTIFICADO' as const, confidence: 0, cpf };
};

const canvasForPage = async (page: any) => {
  const viewport = page.getViewport({ scale: 1.65 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canvas_unavailable');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { canvas, viewport };
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

export const parsePayrollPdf = async ({ file, employees, kind, netAmountByEmployee }: {
  file: File;
  employees: PayrollEmployeeMatch[];
  kind: 'HOLERITE' | 'COMPROVANTE';
  netAmountByEmployee?: Map<string, number>;
}): Promise<ParsedPayrollPdf[]> => {
  // PDF.js transfere o ArrayBuffer para o Worker. O buffer enviado pode ficar "detached".
  // Por isso cada etapa que entrega bytes ao Worker recebe uma cópia nova do arquivo.
  const scanBytes = new Uint8Array(await file.arrayBuffer());
  const pages = await extractPdfPages(scanBytes);
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const wholeText = pages.map(p => p.text).join(' ');
  const wholeAmount = extractLikelyAmount(wholeText);
  const wholeMatch = findEmployee(wholeText, employees, kind === 'COMPROVANTE' ? wholeAmount : null, netAmountByEmployee);

  if (pages.length === 1 || wholeMatch.employee) {
    return [{
      bytes: originalBytes,
      filename: file.name,
      text: wholeText,
      employeeId: wholeMatch.employee?.id || null,
      employeeName: wholeMatch.employee?.name || null,
      matchMethod: wholeMatch.method,
      confidence: wholeMatch.confidence,
      cpfDetected: wholeMatch.cpf,
      amountDetected: wholeAmount,
      pageNumbers: pages.map(p => p.page),
    }];
  }

  const pageMatches = pages.map(page => {
    const amount = extractLikelyAmount(page.text);
    const match = findEmployee(page.text, employees, kind === 'COMPROVANTE' ? amount : null, netAmountByEmployee);
    return { page, amount, match };
  });
  const groups = new Map<string, { employeeId: string | null; employeeName: string | null; method: ParsedPayrollPdf['matchMethod']; confidence: number; cpf: string | null; pages: number[]; texts: string[]; amount: number | null }>();
  pageMatches.forEach(({ page, amount, match }) => {
    const key = match.employee?.id || `unmatched-${page.page}`;
    const existing = groups.get(key);
    if (existing && match.employee) {
      existing.pages.push(page.page);
      existing.texts.push(page.text);
      if (amount != null) existing.amount = amount;
      existing.confidence = Math.max(existing.confidence, match.confidence);
    } else {
      groups.set(key, {
        employeeId: match.employee?.id || null,
        employeeName: match.employee?.name || null,
        method: match.method,
        confidence: match.confidence,
        cpf: match.cpf,
        pages: [page.page],
        texts: [page.text],
        amount,
      });
    }
  });

  const output: ParsedPayrollPdf[] = [];
  for (const group of groups.values()) {
    const splitSource = new Uint8Array(await file.arrayBuffer());
    const split = await pagesToPdfBytes(splitSource, group.pages);
    const suffix = group.employeeName ? normalize(group.employeeName).replace(/\s+/g, '_') : `NAO_IDENTIFICADO_P${group.pages[0]}`;
    output.push({
      bytes: split,
      filename: `${file.name.replace(/\.pdf$/i, '')}_${suffix}.pdf`,
      text: group.texts.join(' '),
      employeeId: group.employeeId,
      employeeName: group.employeeName,
      matchMethod: group.method,
      confidence: group.confidence,
      cpfDetected: group.cpf,
      amountDetected: group.amount,
      pageNumbers: group.pages,
    });
  }
  return output;
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
