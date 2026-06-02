import { jsPDF } from 'jspdf';

const MONTHS_PT = [
  'JANEIRO',
  'FEVEREIRO',
  'MARCO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

export const sanitizePdfFileName = (value: string) =>
  (value || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim() || 'documento';

export const pdfNamePart = (value?: string | number | null) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return sanitizePdfFileName(raw)
    .replace(/\.pdf$/i, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 100);
};

export const competenciaPdfPart = (competencia?: string | null) => {
  const value = String(competencia || '').trim();
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (match) {
    const month = MONTHS_PT[Number(match[2]) - 1] || match[2];
    return `REF. ${month} DE ${match[1]}`;
  }
  return pdfNamePart(value);
};

export const buildPdfFileName = (...parts: Array<string | number | null | undefined | false>) => {
  const base = parts
    .filter((part) => part !== false && part !== null && part !== undefined && String(part).trim() !== '')
    .map((part) => pdfNamePart(part as string | number))
    .filter(Boolean)
    .join(' - ');
  return `${base || 'DOCUMENTO'}.pdf`;
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
