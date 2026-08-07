const MESES_PT_BR = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

export const sanitizePdfFileName = (value: string) =>
  (value || 'TOPAC_RH_Documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim() || 'TOPAC_RH_Documento';

export const pdfNamePart = (value?: string | number | null) =>
  sanitizePdfFileName(String(value ?? ''))
    .replace(/\.pdf$/i, '')
    .slice(0, 80);

const compactMetadataPart = (value?: string | number | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
    .slice(0, 90);

export const competenciaPdfPart = (competencia?: string | null) => {
  const value = String(competencia || '').trim();
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (match) {
    const month = Number(match[2]);
    const monthLabel = MESES_PT_BR[month - 1];
    if (monthLabel) return `${monthLabel}${match[1]}`;
  }
  return compactMetadataPart(value);
};

export const buildPdfFileName = (...parts: Array<string | number | null | undefined | false>) => {
  const normalized = parts
    .filter((part) => part !== false && part !== null && part !== undefined && String(part).trim() !== '')
    .map((part) => compactMetadataPart(part as string | number))
    .filter(Boolean);
  const body = normalized.join('_') || 'Documento';
  return `TOPAC_RH_${body}.pdf`;
};

export const buildTopacRhPdfFileName = ({
  tipo,
  nome,
  competencia,
}: {
  tipo: string;
  nome: string;
  competencia?: string | null;
}) => {
  const tipoPart = compactMetadataPart(tipo) || 'Documento';
  const nomePart = compactMetadataPart(nome) || 'Topac';
  const competenciaPart = competenciaPdfPart(competencia) || compactMetadataPart(new Date().toISOString().slice(0, 7));
  return `TOPAC_RH_${tipoPart}_${nomePart}_${competenciaPart}.pdf`;
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

/**
 * Unifica o caminho de "Imprimir" e "Salvar PDF".
 *
 * O navegador renderiza a mesma árvore HTML/CSS usada na impressão; não existe
 * uma segunda captura por canvas/jsPDF. O título temporário define o nome
 * sugerido quando Chrome/Edge usam "Salvar como PDF".
 */
export const printDocumentAsPdf = (fileName: string) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Impressao indisponivel fora do navegador.');
  }

  const safeName = sanitizePdfFileName(fileName);
  const finalName = safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`;
  const titleForPrint = finalName.replace(/\.pdf$/i, '');
  const previousTitle = document.title;
  let restored = false;

  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    document.title = previousTitle;
    window.removeEventListener('afterprint', restoreTitle);
  };

  document.title = titleForPrint;
  window.addEventListener('afterprint', restoreTitle, { once: true });

  // requestAnimationFrame garante que o novo title e o CSS @media print
  // estejam aplicados antes de abrir a caixa nativa de impressão/PDF.
  window.requestAnimationFrame(() => {
    window.print();
    window.setTimeout(restoreTitle, 1500);
  });

  return finalName;
};

export const saveElementAsPdf = async ({
  element,
  fileName,
}: {
  element: HTMLElement | null;
  fileName: string;
  orientation?: 'portrait' | 'landscape';
  margin?: number;
  windowWidth?: number;
}) => {
  if (!element) throw new Error('Conteudo do PDF nao encontrado.');
  return printDocumentAsPdf(fileName);
};
