import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadPdfDocumentForRender } from '@/lib/pdfRenderConfig';

if (typeof window !== 'undefined' && GlobalWorkerOptions.workerSrc !== pdfWorkerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
}

export const fetchPdfBytes = async (sourceUrl: string): Promise<Uint8Array> => {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error('Não foi possível carregar o PDF');
  }

  return new Uint8Array(await response.arrayBuffer());
};

const clonePdfBytes = (source: Uint8Array) => new Uint8Array(source);

const getPdfBytes = async (source: Uint8Array | string): Promise<Uint8Array> =>
  typeof source === 'string' ? fetchPdfBytes(source) : clonePdfBytes(source);

export const extractPdfText = async (source: Uint8Array | string): Promise<string> => {
  const bytes = await getPdfBytes(source);
  const pdf = await getDocument({ data: bytes }).promise;
  const parts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
      .trim();

    if (pageText) {
      parts.push(pageText);
    }
  }

  return parts.join('\n\n').trim();
};

const buildTextLinesFromItems = (items: any[]) => {
  const buckets = new Map<string, Array<{ x: number; text: string }>>();

  for (const item of items || []) {
    const text = ('str' in item ? String(item.str || '') : '').trim();
    if (!text) continue;
    const x = Number(item.transform?.[4] ?? 0);
    const y = Number(item.transform?.[5] ?? 0);
    const bucket = (Math.round(y * 2) / 2).toFixed(1);
    const current = buckets.get(bucket) || [];
    current.push({ x, text });
    buckets.set(bucket, current);
  }

  return [...buckets.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([, grouped]) =>
      grouped
        .sort((a, b) => a.x - b.x)
        .map((entry) => entry.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
};

export const extractPdfLines = async (source: Uint8Array | string): Promise<string[]> => {
  const bytes = await getPdfBytes(source);
  const pdf = await getDocument({ data: bytes }).promise;
  const lines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageLines = buildTextLinesFromItems(textContent.items as any[]);
    if (pageLines.length) {
      lines.push(...pageLines);
    } else {
      const fallback = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (fallback) lines.push(fallback);
    }
  }

  return lines;
};

export const extractPdfTextByLines = async (source: Uint8Array | string): Promise<string> =>
  (await extractPdfLines(source)).join('\n').trim();

export type EmployeeRowCrop = { pageNumber: number; order: number; dataUrl: string };

/**
 * Rasteriza cada linha de funcionário do relatório "Funcionários Gerais" em alta
 * resolução. A camada de texto é usada apenas para localizar a linha; os valores
 * visuais de CPF e nascimento são capturados da imagem renderizada do PDF.
 * O recorte inclui nome + nascimento + CPF para manter a associação correta.
 */
export const renderPdfEmployeeRowCrops = async (
  source: Uint8Array | string,
  scale = 4.5,
  maxPages = 12,
): Promise<EmployeeRowCrop[]> => {
  const bytes = await getPdfBytes(source);
  const pdf = await loadPdfDocumentForRender(clonePdfBytes(bytes));
  const crops: EmployeeRowCrop[] = [];
  const pagesToRender = Math.min(pdf.numPages, maxPages);
  let order = 0;

  for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = (textContent.items as any[]) || [];

    const buckets = new Map<string, Array<{ x: number; y: number; text: string; height: number }>>();
    for (const item of items) {
      const text = ('str' in item ? String(item.str || '') : '').trim();
      if (!text) continue;
      const x = Number(item.transform?.[4] ?? 0);
      const y = Number(item.transform?.[5] ?? 0);
      const height = Math.abs(Number(item.transform?.[3] ?? 10)) || 10;
      const key = (Math.round(y * 2) / 2).toFixed(1);
      const list = buckets.get(key) || [];
      list.push({ x, y, text, height });
      buckets.set(key, list);
    }

    const lines = [...buckets.entries()]
      .map(([key, grouped]) => {
        const sorted = grouped.slice().sort((a, b) => a.x - b.x);
        return {
          y: Number(key),
          height: Math.max(...sorted.map((entry) => entry.height), 8),
          text: sorted.map((entry) => entry.text).join(' ').replace(/\s+/g, ' ').trim(),
          items: sorted,
        };
      })
      .filter((line) => /Nome\s*:/i.test(line.text) && /Data\s+de\s+Nascimento\s*:/i.test(line.text))
      .sort((a, b) => b.y - a.y);

    if (!lines.length) continue;

    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível renderizar o PDF');

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport, canvas } as any).promise;

    for (const line of lines) {
      const firstX = Math.min(...line.items.map((entry) => entry.x));
      const [cropLeft, cropCenterY] = viewport.convertToViewportPoint
        ? viewport.convertToViewportPoint(firstX, line.y)
        : [firstX * scale, viewport.height - line.y * scale];

      const bandHeight = Math.max(line.height * scale * 2.8, 86);
      const top = Math.max(0, Math.round(cropCenterY - bandHeight * 0.72));
      const height = Math.min(canvas.height - top, Math.round(bandHeight));
      const left = Math.max(0, Math.round(cropLeft - 10 * scale));
      const width = Math.max(1, canvas.width - left);
      if (height <= 2 || width <= 2) continue;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = width;
      cropCanvas.height = height;
      const cropContext = cropCanvas.getContext('2d');
      if (!cropContext) continue;

      cropContext.fillStyle = '#ffffff';
      cropContext.fillRect(0, 0, width, height);
      cropContext.drawImage(canvas, left, top, width, height, 0, 0, width, height);

      order += 1;
      crops.push({ pageNumber, order, dataUrl: cropCanvas.toDataURL('image/png') });
    }
  }

  return crops;
};

export const renderPdfPagesToDataUrls = async (
  source: Uint8Array | string,
  scale = 1.35,
  maxPages = Number.POSITIVE_INFINITY,
): Promise<{ bytes: Uint8Array; pageCount: number; pageUrls: string[] }> => {
  const bytes = await getPdfBytes(source);
  const pdfBytes = clonePdfBytes(bytes);
  const pdf = await loadPdfDocumentForRender(pdfBytes);

  // Para o relatório de funcionários, OCR da página inteira perde justamente os
  // números pequenos. Quando as linhas forem detectadas, entregamos ao OCR uma
  // imagem de alta resolução por funcionário. O importador existente continua
  // fazendo a associação em ordem e só preenche campos que estiverem vazios.
  try {
    const employeeRows = await renderPdfEmployeeRowCrops(
      bytes,
      Math.max(4.5, scale),
      Math.min(Number.isFinite(maxPages) ? maxPages : pdf.numPages, 12),
    );
    if (employeeRows.length > 0) {
      return {
        bytes,
        pageCount: pdf.numPages,
        pageUrls: employeeRows.map((row) => row.dataUrl),
      };
    }
  } catch {
    // Se o documento não for deste modelo, preserva o comportamento genérico.
  }

  const pageUrls: string[] = [];
  const pagesToRender = Math.min(pdf.numPages, maxPages);

  for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Não foi possível renderizar o PDF');
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvasContext: context, viewport, canvas } as any).promise;
    pageUrls.push(canvas.toDataURL('image/jpeg', 0.94));
  }

  return {
    bytes,
    pageCount: pdf.numPages,
    pageUrls,
  };
};
