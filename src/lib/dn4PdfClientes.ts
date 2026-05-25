import { extractPdfLines, renderPdfPagesToDataUrls } from "@/lib/pdf";

export type Dn4PdfSource = "pdf_texto" | "ocr_pdf" | "vazio";

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
  "\\d{2}[.\\s]?\\d{3}[.\\s]?\\d{3}[\\/\\s]?\\d{4}-?\\d{2}|\\d{3}[.\\s]?\\d{3}[.\\s]?\\d{3}-?\\d{2}|\\d{11,14}";
const DOC_REGEX = new RegExp(DOC_PATTERN_SOURCE, "g");
const DOC_TEST_REGEX = new RegExp(DOC_PATTERN_SOURCE);

const STREET_HINTS = [
  "RUA",
  "R.",
  "AV",
  "AV.",
  "AVENIDA",
  "ALAMEDA",
  "TRAVESSA",
  "TRAV",
  "ROD",
  "RODOVIA",
  "ESTRADA",
  "EST",
  "PRACA",
  "PCA",
  "BAIRRO",
  "CENTRO",
  "KM",
  "FAZENDA",
  "SITIO",
  "CHACARA",
];

const cleanLine = (value: string) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const normalize = (value: string) =>
  cleanLine(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const onlyDigits = (value: string) => String(value || "").replace(/\D/g, "");
const hasLetters = (value: string) => /[A-Z]/i.test(value || "");
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const maybeCodePrefix = (line: string) => {
  const match = cleanLine(line).match(/^(\d{1,8})\s+/);
  return match?.[1] || "";
};

const isHeaderOrFooter = (line: string) => {
  const t = normalize(line);
  const hasDocument = DOC_TEST_REGEX.test(line);
  return (
    !t ||
    t.length < 3 ||
    t.startsWith("PAGINA ") ||
    t.startsWith("PAG. ") ||
    t.startsWith("EMISSAO") ||
    t.startsWith("DATA ") ||
    t.startsWith("HORA ") ||
    (!hasDocument && t.includes("RELATORIO")) ||
    t.includes("SISTEMA ANTERIOR") ||
    t.includes("TOPAC") ||
    t.includes("IMPLANTARH") ||
    t.includes("TOTAL GERAL") ||
    t.includes("USUARIO:") ||
    t.includes("FILTRO:") ||
    t.includes("CLIENTES E CREDORES") ||
    t.includes("CODIGO") ||
    t.includes("CPF/CNPJ")
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

  const matches = [...compact.matchAll(DOC_REGEX)];
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

const stitchWrappedLines = (lines: string[]) => {
  const merged: string[] = [];
  let buffer = "";

  const flush = () => {
    const row = cleanLine(buffer);
    if (row) merged.push(row);
    buffer = "";
  };

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;

    const hasDoc = DOC_TEST_REGEX.test(line);
    const startsLikeRecord = /^\d{1,8}\s+/.test(line);

    if (!buffer) {
      buffer = line;
      if (hasDoc && startsLikeRecord) flush();
      continue;
    }

    const combined = cleanLine(`${buffer} ${line}`);
    const bufferHasDoc = DOC_TEST_REGEX.test(buffer);

    if (!bufferHasDoc && hasDoc) {
      buffer = combined;
      flush();
      continue;
    }

    if (startsLikeRecord && bufferHasDoc) {
      flush();
      buffer = line;
      if (hasDoc) flush();
      continue;
    }

    buffer = combined;
    const hasCodeAndLongText = /^\d{1,8}\s+/.test(buffer) && buffer.length > 42;
    if ((DOC_TEST_REGEX.test(buffer) && buffer.length > 34) || hasCodeAndLongText) {
      flush();
    }
  }

  flush();
  return merged;
};

const splitByMultipleDocuments = (line: string) => {
  const matches = [...line.matchAll(DOC_REGEX)];
  if (matches.length <= 1) return [line];

  const pieces: string[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = i === 0 ? 0 : (matches[i - 1].index ?? 0);
    const end = i === matches.length - 1 ? line.length : (matches[i + 1].index ?? line.length);
    const piece = cleanLine(line.slice(start, end));
    if (piece) pieces.push(piece);
  }

  return pieces.length ? pieces : [line];
};

const splitByRecordStart = (line: string) => {
  const normalized = cleanLine(line);
  if (!normalized) return [];

  const matches = [...normalized.matchAll(/\b\d{1,8}\s+(?=[A-Za-zÀ-ÿ])/g)];
  if (matches.length <= 1) return [normalized];

  const points = matches
    .map((m) => m.index ?? -1)
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b);

  if (points.length <= 1) return [normalized];

  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const start = points[i]!;
    const end = i === points.length - 1 ? normalized.length : points[i + 1]!;
    const piece = cleanLine(normalized.slice(start, end));
    if (piece) parts.push(piece);
  }

  return parts.length ? parts : [normalized];
};

const extractNameFromAfterDoc = (afterDoc: string) => {
  const tokens = cleanLine(afterDoc).split(" ").filter(Boolean);
  if (!tokens.length) return "";

  const chosen: string[] = [];
  for (const token of tokens) {
    const norm = normalize(token);
    if (!norm) continue;

    if (DOC_TEST_REGEX.test(token)) break;
    if (STREET_HINTS.some((hint) => norm === hint || norm.startsWith(`${hint}.`))) break;
    if (/^\d{5}-?\d{3}$/.test(token)) break;
    if (/^[A-Z]{2}$/.test(norm) && chosen.length > 1) break;
    if (/^\d+$/.test(token) && chosen.length >= 2) break;

    chosen.push(token);
    if (chosen.length >= 8) break;
  }

  return cleanLine(chosen.join(" "));
};

const extractNameWithoutDocument = (lineWithoutCode: string) => {
  const text = cleanLine(lineWithoutCode);
  if (!text) return "";
  const tokens = text.split(" ").filter(Boolean);
  if (!tokens.length) return "";

  const chosen: string[] = [];
  for (const token of tokens) {
    const norm = normalize(token);
    if (!norm) continue;

    if (STREET_HINTS.some((hint) => norm === hint || norm.startsWith(`${hint}.`))) break;
    if (/^\d{5}-?\d{3}$/.test(token)) break;
    if (/^[A-Z]{2}$/.test(norm) && chosen.length > 1) break;
    if (/^\d+$/.test(token) && chosen.length >= 2) break;
    if (/^(CPF|CNPJ|DOC|DOCUMENTO|INSCRICAO)$/i.test(norm) && chosen.length > 0) break;

    chosen.push(token);
    if (chosen.length >= 10) break;
  }

  return cleanLine(chosen.join(" "));
};

const extractFromLine = (line: string, source: Dn4PdfSource): Dn4PdfClienteRow | null => {
  if (!line || isHeaderOrFooter(line)) return null;

  const normalizedLine = cleanLine(line);
  const docMatch = normalizedLine.match(DOC_REGEX);
  const documentoOriginal = docMatch?.[0] || "";
  const documento = onlyDigits(documentoOriginal);
  const hasValidDoc = documento.length === 11 || documento.length === 14;

  const docStart = hasValidDoc ? normalizedLine.indexOf(documentoOriginal) : -1;
  const beforeDoc = hasValidDoc ? cleanLine(normalizedLine.slice(0, docStart)) : normalizedLine;
  const afterDocRaw = hasValidDoc ? cleanLine(normalizedLine.slice(docStart + documentoOriginal.length)) : "";

  const codigoBeforeMatch = beforeDoc.match(/^(\d{1,8})\s+/);
  const codigoAfterMatch = afterDocRaw.match(/^(\d{1,8})\s+/);
  const codigo = codigoBeforeMatch?.[1] || codigoAfterMatch?.[1] || maybeCodePrefix(normalizedLine);

  const nomeBefore = cleanLine(beforeDoc.replace(/^(\d{1,8})\s+/, ""));
  let afterDoc = afterDocRaw.replace(/^(\d{1,8})\s+/, "");
  const nomeAfter = hasValidDoc ? extractNameFromAfterDoc(afterDoc) : "";

  const razaoSocial =
    (hasLetters(nomeBefore) ? nomeBefore : "") ||
    (hasLetters(nomeAfter) ? nomeAfter : "") ||
    (hasValidDoc ? "" : extractNameWithoutDocument(nomeBefore || normalizedLine));
  if (!razaoSocial) return null;

  if (hasValidDoc && !hasLetters(nomeBefore) && nomeAfter) {
    const escaped = escapeRegex(nomeAfter);
    afterDoc = cleanLine(afterDoc.replace(new RegExp(`^${escaped}\\s*`, "i"), ""));
  }

  let addressSource = hasValidDoc ? afterDoc : cleanLine(normalizedLine.replace(/^(\d{1,8})\s+/, ""));
  if (!hasValidDoc && razaoSocial) {
    addressSource = cleanLine(
      addressSource.replace(new RegExp(`^${escapeRegex(razaoSocial)}\\s*`, "i"), ""),
    );
  }

  const ieMatch = addressSource.match(/(?:IE|INSC(?:RICAO)?\s+ESTADUAL)\s*[:\-]?\s*([0-9A-Z.\/-]+)/i);
  const cepMatch = addressSource.match(/\d{5}-?\d{3}/);
  const cidadeUfCepMatch = addressSource.match(
    /([A-Za-zÀ-ÿ'´`\-\s]+?)\s+([A-Z]{2})(?:\s+(\d{5}-?\d{3}))?$/,
  );

  const cidade = cidadeUfCepMatch?.[1] ? cleanLine(cidadeUfCepMatch[1]) : "";
  const uf = cidadeUfCepMatch?.[2] ? cleanLine(cidadeUfCepMatch[2]).toUpperCase().slice(0, 2) : "";
  const cep = onlyDigits(cidadeUfCepMatch?.[3] || cepMatch?.[0] || "");

  let endereco = addressSource;
  if (cidadeUfCepMatch?.[0]) endereco = endereco.replace(cidadeUfCepMatch[0], " ");
  if (ieMatch?.[0]) endereco = endereco.replace(ieMatch[0], " ");
  if (cepMatch?.[0]) endereco = endereco.replace(cepMatch[0], " ");
  endereco = cleanLine(endereco);

  const noDocLineLooksUsable =
    !hasValidDoc &&
    Boolean(codigo || razaoSocial) &&
    (Boolean(endereco) || Boolean(cidade) || Boolean(uf));
  if (!hasValidDoc && !noDocLineLooksUsable) return null;

  return {
    codigo_dn4: codigo,
    razao_social: razaoSocial,
    cnpj: documento.length === 14 ? documento : "",
    cpf: documento.length === 11 ? documento : "",
    inscricao_estadual: cleanLine(ieMatch?.[1] || ""),
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
  const stitched = stitchWrappedLines(lines);
  const exploded = stitched.flatMap((line) =>
    splitByRecordStart(line).flatMap((piece) => splitByMultipleDocuments(piece)),
  );

  const rows = exploded
    .map((line) => extractFromLine(line, source))
    .filter((row): row is Dn4PdfClienteRow => Boolean(row));

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

const createOcrWorker = async (logger?: (message: string, progress?: number) => void) => {
  const mod: any = await import("tesseract.js");
  if (!mod?.createWorker) throw new Error("OCR indisponivel: createWorker nao encontrado");

  const mapLogger = (entry: any) => {
    const status = String(entry?.status || "").trim();
    const progress = typeof entry?.progress === "number" ? entry.progress : undefined;
    if (status) logger?.(status, progress);
  };

  try {
    return await mod.createWorker("por+eng", 1, { logger: mapLogger });
  } catch {
    const worker = await mod.createWorker({ logger: mapLogger });
    if (typeof worker.loadLanguage === "function") await worker.loadLanguage("por+eng");
    if (typeof worker.initialize === "function") await worker.initialize("por+eng");
    return worker;
  }
};

const runOcrForPdf = async (bytes: Uint8Array, onProgress?: (message: string) => void) => {
  const { pageUrls, pageCount } = await renderPdfPagesToDataUrls(bytes, 1.85, 200);
  if (!pageUrls.length) return "";

  const worker = await createOcrWorker((status, progress) => {
    if (!status) return;
    const pct = typeof progress === "number" ? ` ${(progress * 100).toFixed(0)}%` : "";
    onProgress?.(`OCR ${status}${pct}`);
  });

  try {
    const texts: string[] = [];
    for (let index = 0; index < pageUrls.length; index += 1) {
      onProgress?.(`OCR pagina ${index + 1}/${pageUrls.length}`);
      const result = await worker.recognize(pageUrls[index]);
      const pageText = cleanLine(result?.data?.text || "");
      if (pageText) texts.push(pageText);
    }
    if (pageCount > pageUrls.length) {
      onProgress?.(`OCR limitado para ${pageUrls.length} de ${pageCount} paginas.`);
    }
    return texts.join("\n");
  } finally {
    if (typeof worker.terminate === "function") {
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
  const nativeText = nativeLines.join("\n");
  const nativeRowsByLine = parseRowsFromLines(nativeLines, "pdf_texto");
  const nativeRows =
    nativeRowsByLine.length > 0 ? nativeRowsByLine : parseRowsFromText(nativeText, "pdf_texto");

  if (nativeRows.length > 0) {
    return {
      source: "pdf_texto",
      usedOcr: false,
      rows: nativeRows,
      nativeTextLength: nativeText.length,
      ocrTextLength: 0,
      message: `PDF lido com texto nativo (${nativeRows.length} cliente(s)).`,
    };
  }

  onProgress?.("PDF sem texto estruturado. Iniciando OCR...");
  const ocrText = await runOcrForPdf(bytes, onProgress).catch(() => "");
  const ocrRows = parseRowsFromText(ocrText, "ocr_pdf");

  if (ocrRows.length > 0) {
    return {
      source: "ocr_pdf",
      usedOcr: true,
      rows: ocrRows,
      nativeTextLength: nativeText.length,
      ocrTextLength: ocrText.length,
      message: `PDF processado com OCR (${ocrRows.length} cliente(s)).`,
    };
  }

  return {
    source: "vazio",
    usedOcr: nativeText.length === 0,
    rows: [],
    nativeTextLength: nativeText.length,
    ocrTextLength: ocrText.length,
    message: "Nao foi possivel extrair clientes do PDF com texto nativo nem OCR.",
  };
};
