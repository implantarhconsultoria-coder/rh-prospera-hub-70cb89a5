import { jsPDF } from 'jspdf';
import type { BenefitReportRow } from '@/lib/benefitReports';
import { formatCurrency } from '@/lib/calculations';

export type VTPackageBlock = {
  company: { id: string; name: string; cnpj?: string | null };
  rows: BenefitReportRow[];
};

type PackageOptions = {
  competencia: string;
  diasPagos: number;
  dataPagamento?: string;
};

const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const competenciaLabel = (competencia: string) => {
  const [ano, mes] = String(competencia || '').split('-');
  return `${meses[Number(mes) - 1] || mes} / ${ano}`;
};
const dataBr = (value?: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (value || '—');
};
const safe = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

const addReportHeader = (doc: jsPDF, block: VTPackageBlock, options: PackageOptions) => {
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(safe(block.company.name).toUpperCase(), 12, 15);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`CNPJ: ${safe(block.company.cnpj) || '—'}`, 12, 21);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE VALE-TRANSPORTE', 285, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Competência: ${competenciaLabel(options.competencia)}`, 285, 21, { align: 'right' });
  doc.text(`Dias pagos: ${options.diasPagos}`, 285, 27, { align: 'right' });
  if (options.dataPagamento) doc.text(`Pagamento: ${dataBr(options.dataPagamento)}`, 285, 33, { align: 'right' });
  doc.line(12, 37, 285, 37);
};

const addReportTableHeader = (doc: jsPDF, y: number) => {
  const cols = [
    { x: 12, w: 61, label: 'Funcionário' },
    { x: 73, w: 48, label: 'Função' },
    { x: 121, w: 25, label: 'VT/dia' },
    { x: 146, w: 21, label: 'Prev.' },
    { x: 167, w: 21, label: 'Desc.' },
    { x: 188, w: 21, label: 'Finais' },
    { x: 209, w: 31, label: 'Total' },
    { x: 240, w: 45, label: 'Motivo/Ajuste' },
  ];
  doc.setFillColor(235, 235, 235);
  doc.rect(12, y, 273, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  cols.forEach(col => {
    doc.rect(col.x, y, col.w, 7);
    doc.text(col.label, col.x + 1.5, y + 4.5);
  });
  return y + 7;
};

const addReport = (doc: jsPDF, block: VTPackageBlock, options: PackageOptions, firstPage: boolean) => {
  if (!firstPage) doc.addPage('a4', 'landscape');
  addReportHeader(doc, block, options);
  let y = addReportTableHeader(doc, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.7);

  const drawRow = (row: BenefitReportRow) => {
    if (y > 190) {
      doc.addPage('a4', 'landscape');
      addReportHeader(doc, block, options);
      y = addReportTableHeader(doc, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.7);
    }
    const values = [
      safe(row.emp.name).slice(0, 38),
      safe(row.emp.cargo).slice(0, 28),
      formatCurrency(row.valorDiario),
      String(row.diasPrevistos),
      row.diasDescontados ? String(row.diasDescontados) : '—',
      String(row.diasFinais),
      formatCurrency(row.valorTotal),
      safe(row.correcaoMotivo || row.motivo || row.correcaoObservacao || '—').slice(0, 31),
    ];
    const specs = [
      [12,61],[73,48],[121,25],[146,21],[167,21],[188,21],[209,31],[240,45],
    ] as const;
    specs.forEach(([x,w], index) => {
      doc.rect(x, y, w, 6);
      doc.text(values[index], index >= 2 && index <= 6 ? x + w - 1.5 : x + 1.5, y + 4, index >= 2 && index <= 6 ? { align: 'right' } : undefined);
    });
    y += 6;
  };
  block.rows.forEach(drawRow);
  const total = block.rows.reduce((sum, row) => sum + Number(row.valorTotal || 0), 0);
  if (y > 190) {
    doc.addPage('a4', 'landscape');
    addReportHeader(doc, block, options);
    y = addReportTableHeader(doc, 42);
  }
  doc.setFont('helvetica', 'bold');
  doc.rect(12, y, 197, 7);
  doc.rect(209, y, 31, 7);
  doc.rect(240, y, 45, 7);
  doc.text('TOTAL', 13.5, y + 4.5);
  doc.text(formatCurrency(total), 238.5, y + 4.5, { align: 'right' });
};

const addReceipt = (doc: jsPDF, block: VTPackageBlock, row: BenefitReportRow, options: PackageOptions, newPage = true) => {
  if (newPage) doc.addPage('a4', 'portrait');
  const left = 18;
  const right = 192;
  const width = right - left;
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(safe(block.company.name).toUpperCase(), left, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`CNPJ: ${safe(block.company.cnpj) || '—'}`, left, 28);
  doc.setFont('helvetica', 'bold');
  doc.text('RECIBO INDIVIDUAL DE VALE-TRANSPORTE', right, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Competência: ${competenciaLabel(options.competencia)}`, right, 28, { align: 'right' });
  doc.text(`Pagamento: ${options.dataPagamento ? dataBr(options.dataPagamento) : '—'}`, right, 34, { align: 'right' });
  doc.line(left, 40, right, 40);

  doc.roundedRect(left, 48, width, 24, 1, 1);
  doc.setFont('helvetica', 'bold');
  doc.text('Nome:', 22, 55);
  doc.text('Cargo:', 112, 55);
  doc.text('CPF:', 22, 62);
  doc.text('Registro:', 112, 62);
  doc.text('Dias pagos:', 22, 69);
  doc.setFont('helvetica', 'normal');
  doc.text(safe(row.emp.name).slice(0, 47), 34, 55);
  doc.text(safe(row.emp.cargo).slice(0, 35), 124, 55);
  doc.text(safe(row.emp.cpf) || '—', 31, 62);
  doc.text(safe((row.emp as any).registro) || '—', 127, 62);
  doc.text(String(options.diasPagos), 39, 69);

  const y = 82;
  doc.setFillColor(229, 231, 235);
  doc.rect(left, y, width, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('VALE-TRANSPORTE', 20, y + 5);
  const lines = [
    ['Valor diário', formatCurrency(row.valorDiario)],
    ['Dias previstos', String(row.diasPrevistos)],
    ['Dias descontados', String(row.diasDescontados || 0)],
    ['Dias finais', String(row.diasFinais)],
    ['Motivo / ajuste', safe(row.correcaoMotivo || row.motivo || '—')],
    ['Observação', safe(row.correcaoObservacao || '—')],
    ['VALOR TOTAL', formatCurrency(row.valorTotal)],
  ];
  lines.forEach(([label, value], index) => {
    const top = y + 7 + index * 7;
    doc.rect(left, top, width, 7);
    doc.setFont('helvetica', index === lines.length - 1 ? 'bold' : 'normal');
    doc.text(label, 20, top + 4.7);
    doc.text(String(value).slice(0, 78), 189, top + 4.7, { align: 'right' });
  });

  const assinaturaY = 190;
  doc.line(52, assinaturaY, 158, assinaturaY);
  doc.setFont('helvetica', 'normal');
  doc.text('Assinatura do colaborador', 105, assinaturaY + 6, { align: 'center' });
  doc.text(`Nome: ${safe(row.emp.name)}`, 105, assinaturaY + 12, { align: 'center' });
  doc.text('Data: ____/____/________', 105, assinaturaY + 18, { align: 'center' });
};

export const buildVTReceiptPdfBlob = (block: VTPackageBlock, row: BenefitReportRow, options: PackageOptions) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  addReceipt(doc, block, row, options, false);
  return doc.output('blob');
};

export const buildVTPackagePdfBlob = (blocks: VTPackageBlock[], options: PackageOptions) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  blocks.forEach((block, index) => addReport(doc, block, options, index === 0));
  blocks.forEach(block => block.rows.forEach(row => addReceipt(doc, block, row, options, true)));
  return doc.output('blob');
};
