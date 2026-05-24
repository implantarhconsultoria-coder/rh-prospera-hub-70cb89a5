import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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

export const extractPdfText = async (source: Uint8Array | string): Promise<string> => {
  const bytes = typeof source === 'string' ? await fetchPdfBytes(source) : source;
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
  const bytes = typeof source === 'string' ? await fetchPdfBytes(source) : source;
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

export const renderPdfPagesToDataUrls = async (
  source: Uint8Array | string,
  scale = 1.35,
  maxPages = Number.POSITIVE_INFINITY,
): Promise<{ bytes: Uint8Array; pageCount: number; pageUrls: string[] }> => {
  const bytes = typeof source === 'string' ? await fetchPdfBytes(source) : source;
  const pdf = await getDocument({ data: bytes }).promise;
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
