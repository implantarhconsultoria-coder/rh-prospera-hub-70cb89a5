import { PDFDocument } from 'pdf-lib';
import { assertCompanyEnabled, readBody, requireAdmin, sendJson } from '../src/server/payrollServer.js';

const MAX_FILE_BYTES = 3 * 1024 * 1024;

const joinLine = (items: Array<{ str?: string; transform?: number[] }>) => items
  .filter(item => String(item.str || '').trim())
  .sort((a, b) => Number(a.transform?.[4] || 0) - Number(b.transform?.[4] || 0))
  .map(item => String(item.str || '').trim())
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim();

const structuredLines = (items: Array<{ str?: string; transform?: number[] }>) => {
  const raw = items
    .filter(item => String(item.str || '').trim())
    .map(item => ({ item, y: Number(item.transform?.[5] || 0) }));
  const groups: Array<{ y: number; items: Array<{ str?: string; transform?: number[] }> }> = [];
  for (const entry of raw) {
    const found = groups.find(group => Math.abs(group.y - entry.y) <= 2.2);
    if (found) found.items.push(entry.item);
    else groups.push({ y: entry.y, items: [entry.item] });
  }
  return groups
    .sort((a, b) => b.y - a.y)
    .map(group => joinLine(group.items))
    .filter(Boolean);
};

const pagePdfBase64 = async (source: PDFDocument, pageIndex: number) => {
  const out = await PDFDocument.create();
  const [copied] = await out.copyPages(source, [pageIndex]);
  out.addPage(copied);
  const bytes = await out.save({ useObjectStreams: false });
  return Buffer.from(bytes).toString('base64');
};

export default async function handler(req: any, res?: any) {
  if ((req?.method || 'GET') !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);

  try {
    const { service } = await requireAdmin(req);
    const body = readBody(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return sendJson(res, { ok: false, error: 'company_id_required' }, 400);
    await assertCompanyEnabled(service, companyId);

    const encoded = String(body.data_base64 || '').replace(/^data:application\/pdf;base64,/i, '');
    if (!encoded) return sendJson(res, { ok: false, error: 'pdf_required' }, 400);

    const raw = Buffer.from(encoded, 'base64');
    if (!raw.length) return sendJson(res, { ok: false, error: 'pdf_empty' }, 400);
    if (raw.length > MAX_FILE_BYTES) return sendJson(res, { ok: false, error: 'pdf_too_large_for_server_fallback', max_bytes: MAX_FILE_BYTES }, 413);

    const bytes = new Uint8Array(raw);
    const sourceDoc = await PDFDocument.load(new Uint8Array(bytes), { ignoreEncryption: true });
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: true,
    });
    const pdf = await loading.promise;

    if (pdf.numPages !== sourceDoc.getPageCount()) {
      throw new Error(`Contagem divergente: PDF.js=${pdf.numPages}, pdf-lib=${sourceDoc.getPageCount()}`);
    }

    const pages: Array<{ page: number; text: string; lines: string[]; pdf_base64: string }> = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false });
      const lines = structuredLines((content.items || []) as any[]);
      const text = lines.join('\n').trim();
      pages.push({
        page: pageNumber,
        text,
        lines,
        pdf_base64: await pagePdfBase64(sourceDoc, pageNumber - 1),
      });
      try { page.cleanup?.(); } catch { /* noop */ }
    }

    try { await loading.destroy?.(); } catch { /* noop */ }
    try { await pdf.destroy?.(); } catch { /* noop */ }

    return sendJson(res, {
      ok: true,
      filename: String(body.filename || 'arquivo.pdf'),
      total_pages: pages.length,
      pages,
      engine: 'server-pdfjs-pdflib',
    });
  } catch (error: any) {
    console.error('[payroll-pdf-analyze]', { message: String(error?.message || error), stack: error?.stack || null });
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
