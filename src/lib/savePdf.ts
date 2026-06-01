import { jsPDF } from 'jspdf';

export const sanitizePdfFileName = (value: string) =>
  (value || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'documento';

export const pdfNamePart = (value?: string | number | null) =>
  sanitizePdfFileName(String(value ?? ''))
    .replace(/\.pdf$/i, '')
    .slice(0, 80);

export const competenciaPdfPart = (competencia?: string | null) => {
  const value = String(competencia || '').trim();
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  return pdfNamePart(value);
};

export const buildPdfFileName = (...parts: Array<string | number | null | undefined | false>) => {
  const base = parts
    .filter((part) => part !== false && part !== null && part !== undefined && String(part).trim() !== '')
    .map((part) => pdfNamePart(part as string | number))
    .filter(Boolean)
    .join('_');
  return `${base || 'documento'}.pdf`;
};

export const downloadPdfBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = sanitizePdfFileName(fileName);
  link.download = safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const saveElementAsPdf = async ({
  element,
  fileName,
  orientation = 'portrait',
  margin = 8,
  windowWidth,
}: {
  element: HTMLElement | null;
  fileName: string;
  orientation?: 'portrait' | 'landscape';
  margin?: number;
  windowWidth?: number;
}) => {
  if (!element) throw new Error('Conteudo do PDF nao encontrado.');

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
  const safeName = sanitizePdfFileName(fileName);
  const finalName = safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`;

  await new Promise<void>((resolve, reject) => {
    try {
      (pdf as any).html(element, {
        callback: (doc: jsPDF) => {
          doc.save(finalName);
          resolve();
        },
        margin,
        autoPaging: 'text',
        html2canvas: {
          backgroundColor: '#ffffff',
          scale: 0.72,
          useCORS: true,
          logging: false,
        },
        windowWidth: windowWidth || element.scrollWidth || element.clientWidth || 794,
      });
    } catch (error) {
      reject(error);
    }
  });
};
