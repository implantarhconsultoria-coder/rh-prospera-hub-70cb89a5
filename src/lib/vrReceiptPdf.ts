import { jsPDF } from 'jspdf';
import type { BenefitReportRow } from '@/lib/benefitReports';
import { formatCurrency } from '@/lib/calculations';

type Company = { id: string; name: string; cnpj?: string | null };
type Options = { competencia: string; diasPagos: number; dataPagamento?: string };

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

export const buildVRReceiptPdfBlob = (company: Company, row: BenefitReportRow, options: Options) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const left = 18;
  const right = 192;
  const width = right - left;

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(safe(company.name).toUpperCase(), left, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`CNPJ: ${safe(company.cnpj) || '—'}`, left, 28);
  doc.setFont('helvetica', 'bold');
  doc.text('RECIBO INDIVIDUAL DE VALE-REFEIÇÃO', right, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Competência: ${competenciaLabel(options.competencia)}`, right, 28, { align: 'right' });
  const receiptPaymentDate = (row as any).dataPagamentoCorrecao || options.dataPagamento;
  doc.text(`Pagamento: ${receiptPaymentDate ? dataBr(receiptPaymentDate) : '—'}`, right, 34, { align: 'right' });
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
  doc.text('VALE-REFEIÇÃO', 20, y + 5);
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

  return doc.output('blob');
};
