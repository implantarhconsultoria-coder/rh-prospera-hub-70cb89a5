import { extractPdfLines, renderPdfPagesToDataUrls } from '@/lib/pdf';

export type Dn4PdfSource = 'pdf_texto' | 'ocr_pdf' | 'vazio';

export type Dn4PdfClienteRow = {
  codigo_dn4: string;
  razao_social: string;
  cnpj: string;
  cpf: string;
  inscricao_estadual: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
  linha_original: string;
  origem: Dn4PdfSource;
};

export type Dn4PdfClienteParseResult = {
  source: Dn4PdfSource;
  usedOcr: boolean;
  rows: Dn4PdfClienteRow[];
  nativeTextLength: number;
  ocrTextLength: number;
  message: string;
};

const DOC_PATTERN_SOURCE =
  '\\d{2}[.\\s]?\\d{3}[.\\s]?\\d{3}[\\/\\s]?\\d{4}-?\\d{2}|\\d{3}[.\\s]?\\d{3}[.\\s]?\\d{3}-?\\d{2}';
const createDocRegex = () => new RegExp(DOC_PATTERN_SOURCE, 'g');

const cleanLine = (value: string) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const normalize = (value: string) =>
  cleanLine(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const onlyDigits = (value: string) => String(value || '').replace(/\D/g, '');

const isHeaderOrFooter = (line: string) => {
  const t = normalize(line);
  const hasDocument = new RegExp(DOC_PATTERN_SOURCE).test(line);
  return (
    !t ||
    t.length < 3 ||
    t.startsWith('PAGINA ') ||
    t.startsWith('PAG. ') ||
    t.startsWith('EMISSAO') ||
    t.startsWith('DATA ') ||
    t.startsWith('HORA ') ||
    (!hasDocument && t.includes('RELATORIO')) ||
    t.includes('SISTEMA ANTERIOR') ||
    t.includes('TOPAC') ||
    t.includes('IMPLANTARH') ||
    t.includes('TOTAL GERAL') ||
    t.includes('USUARIO:') ||
    t.includes('FILTRO:')
  );
};

const splitCandidates = (text: string) => {
  const rawLines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  if (rawLines.length >= 6) return rawLines;

  const compact = cleanLine(text);
  if (!compact) return [];

  const matches = [...compact.matchAll(createDocRegex())];
  if (matches.length <= 1) return rawLines.length ? rawLines : [compact];

  const candidates: string[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = i === 0 ? 0 : (matches[i - 1].index ?? 0);
    const end = i === matches.length - 1 ? compact.length : (matches[i + 1].index ?? compact.length);
    const piece = cleanLine(compact.slice(start, end));
    if (piece) candidates.push(piece);
  }

  return candidates.length ? candidates : rawLines;
};

const extractFromLine = (line: string, source: Dn4PdfSource): Dn4PdfClienteRow | null => {
  if (!line || isHeaderOrFooter(line)) return null;

  const docMatch = line.match(createDocRegex());
  if (!docMatch?.[0]) return null;

  const documentoOriginal = docMatch[0];
  const documento = onlyDigits(documentoOriginal);
  if (documento.length !== 11 && documento.length !== 14) return null;

  const docStart = line.indexOf(documentoOriginal);
  const beforeDoc = cleanLine(line.slice(0, docStart));
  const afterDoc = cleanLine(line.slice(docStart + documentoOriginal.length));

  const codigoMatch = beforeDoc.match(/^(\d{1,8})\s+/);
  const codigo = codigoMatch?.[1] || '';

  const razaoSocial = cleanLine(beforeDoc.replace(/^(\d{1,8})\s+/, ''));
  if (!razaoSocial) return null;

  const ieMatch = afterDoc.match(/(?:IE|INSC(?:RICAO)?\s+ESTADUAL)\s*[:\-]?\s*([0-9A-Z.\/-]+)/i);
  const cepMatch = afterDoc.match(/\d{5}-?\d{3}/);
  const cidadeUfCepMatch = afterDoc.match(/([A-Za-zÀ-ÿ'´`\-\s]+?)\s+([A-Z]{2})(?:\s+(\d{5}-?\d{3}))?$/);

  const cidade = cidadeUfCepMatch?.[1] ? cleanLine(cidadeUfCepMatch[1]) : '';
  const uf = cidadeUfCepMatch?.[2] ? cleanLine(cidadeUfCepMatch[2]).toUpperCase().slice(0, 2) : '';
  const cep = onlyDigits(cidadeUfCepMatch?.[3] || cepMatch?.[0] || '');

  let endereco = afterDoc;
  if (cidadeUfCepMatch?.[0]) endereco = endereco.replace(cidadeUfCepMatch[0], ' ');
  if (ieMatch?.[0]) endereco = endereco.replace(ieMatch[0], ' ');
  if (cepMatch?.[0]) endereco = endereco.replace(cepMatch[0], ' ');
  endereco = cleanLine(endereco);

  return {
    codigo_dn4: codigo,
    razao_social: razaoSocial,
    cnpj: documento.length === 14 ? documento : '',
    cpf: documento.length === 11 ? documento : '',
    inscricao_estadual: cleanLine(ieMatch?.[1] || ''),
    endereco,
    cidade,
    uf,
    cep,
    linha_original: line,
    origem: source,
  };
};

const parseRowsFromText = (text: string, source: Dn4PdfSource) => {
  const lines = splitCandidates(text);
  return parseRowsFromLines(lines, source);
};

const parseRowsFromLines = (lines: string[], source: Dn4PdfSource) => {
  const rows = lines
    .map((line) => extractFromLine(line, source))
    .filter((row): row is Dn4PdfClienteRow => Boolean(row));

  // Deduplicacao local por documento (ou codigo+razao social quando nao houver documento)
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key =
      row.cnpj ||
      row.cpf ||
      `${normalize(row.codigo_dn4)}:${normalize(row.razao_social)}:${normalize(row.cidade)}:${normalize(row.uf)}`;
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const createOcrWorker = async (
  logger?: (message: string, progress?: number) => void,
) => {
  const mod: any = await import('tesseract.js');
  if (!mod?.createWorker) throw new Error('OCR indisponivel: createWorker nao encontrado');

  const mapLogger = (entry: any) => {
    const status = String(entry?.status || '').trim();
    const progress = typeof entry?.progress === 'number' ? entry.progress : undefined;
    if (status) logger?.(status, progress);
  };

  try {
    return await mod.createWorker('por+eng', 1, { logger: mapLogger });
  } catch (_legacyError) {
    const worker = await mod.createWorker({ logger: mapLogger });
    if (typeof worker.loadLanguage === 'function') await worker.loadLanguage('por+eng');
    if (typeof worker.initialize === 'function') await worker.initialize('por+eng');
    return worker;
  }
};

const runOcrForPdf = async (
  bytes: Uint8Array,
  onProgress?: (message: string) => void,
) => {
  const { pageUrls } = await renderPdfPagesToDataUrls(bytes, 1.85, 8);
  if (!pageUrls.length) return '';

  const worker = await createOcrWorker((status, progress) => {
    if (!status) return;
    const pct = typeof progress === 'number' ? ` ${(progress * 100).toFixed(0)}%` : '';
    onProgress?.(`OCR ${status}${pct}`);
  });

  try {
    const texts: string[] = [];
    for (let index = 0; index < pageUrls.length; index += 1) {
      onProgress?.(`OCR pagina ${index + 1}/${pageUrls.length}`);
      const result = await worker.recognize(pageUrls[index]);
      const pageText = cleanLine(result?.data?.text || '');
      if (pageText) texts.push(pageText);
    }
    return texts.join('\n');
  } finally {
    if (typeof worker.terminate === 'function') {
      await worker.terminate();
    }
  }
};

export const parseDn4ClientesPdf = async (
  file: File,
  onProgress?: (message: string) => void,
): Promise<Dn4PdfClienteParseResult> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const nativeLines = await extractPdfLines(bytes).catch(() => []);
  const nativeText = nativeLines.join('\n');
  const nativeRowsByLine = parseRowsFromLines(nativeLines, 'pdf_texto');
  const nativeRows =
    nativeRowsByLine.length > 0 ? nativeRowsByLine : parseRowsFromText(nativeText, 'pdf_texto');

  if (nativeRows.length > 0) {
    return {
      source: 'pdf_texto',
      usedOcr: false,
      rows: nativeRows,
      nativeTextLength: nativeText.length,
      ocrTextLength: 0,
      message: `PDF lido com texto nativo (${nativeRows.length} cliente(s)).`,
    };
  }

  onProgress?.('PDF sem texto estruturado. Iniciando OCR...');
  const ocrText = await runOcrForPdf(bytes, onProgress).catch(() => '');
  const ocrRows = parseRowsFromText(ocrText, 'ocr_pdf');

  if (ocrRows.length > 0) {
    return {
      source: 'ocr_pdf',
      usedOcr: true,
      rows: ocrRows,
      nativeTextLength: nativeText.length,
      ocrTextLength: ocrText.length,
      message: `PDF processado com OCR (${ocrRows.length} cliente(s)).`,
    };
  }

  return {
    source: 'vazio',
    usedOcr: nativeText.length === 0,
    rows: [],
    nativeTextLength: nativeText.length,
    ocrTextLength: ocrText.length,
    message: 'Nao foi possivel extrair clientes do PDF com texto nativo nem OCR.',
  };
};
