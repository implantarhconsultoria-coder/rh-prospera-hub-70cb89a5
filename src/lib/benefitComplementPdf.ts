import { jsPDF } from 'jspdf';
import { formatCurrency } from '@/lib/calculations';

export type BenefitComplementPdfInput = {
  benefitType: 'VR' | 'VT';
  company: { name: string; cnpj?: string | null };
  employee: { name: string; cpf?: string | null; cargo?: string | null; registro?: string | null };
  competencia: string;
  paymentDate?: string | null;
  dailyValue: number;
  daysConsidered: number;
  entitlementAmount: number;
  priorPaidAmount: number;
  complementAmount: number;
  reason: string;
};

const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const competenciaLabel = (competencia: string) => {
  const [ano, mes] = String(competencia || '').split('-');
  return `${meses[Number(mes) - 1] || mes} / ${ano}`;
};
const dataBr = (value?: string | null) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (value || '—');
};
const safe = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

export const buildBenefitComplementReceiptPdfBlob = (input: BenefitComplementPdfInput) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const left = 18;
  const right = 192;
  const width = right - left;
  const benefitName = input.benefitType === 'VT' ? 'VALE-TRANSPORTE' : 'VALE-REFEIÇÃO';

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(safe(input.company.name).toUpperCase(), left, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`CNPJ: ${safe(input.company.cnpj) || '—'}`, left, 28);

  doc.setFont('helvetica', 'bold');
  doc.text(`RECIBO DE ${benefitName}`, right, 22, { align: 'right' });
  doc.text('PAGAMENTO COMPLEMENTAR', right, 28, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Competência: ${competenciaLabel(input.competencia)}`, right, 34, { align: 'right' });
  doc.text(`Pagamento: ${dataBr(input.paymentDate)}`, right, 40, { align: 'right' });
  doc.line(left, 45, right, 45);

  doc.roundedRect(left, 52, width, 24, 1, 1);
  doc.setFont('helvetica', 'bold');
  doc.text('Nome:', 22, 59);
  doc.text('Cargo:', 112, 59);
  doc.text('CPF:', 22, 66);
  doc.text('Registro:', 112, 66);
  doc.setFont('helvetica', 'normal');
  doc.text(safe(input.employee.name).slice(0, 47), 34, 59);
  doc.text(safe(input.employee.cargo).slice(0, 35) || '—', 124, 59);
  doc.text(safe(input.employee.cpf) || '—', 31, 66);
  doc.text(safe(input.employee.registro) || '—', 127, 66);

  const y = 86;
  doc.setFillColor(229, 231, 235);
  doc.rect(left, y, width, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text(`${benefitName} — COMPLEMENTO`, 20, y + 5);

  const lines: Array<[string, string, boolean?]> = [
    ['Valor diário atualizado', formatCurrency(input.dailyValue)],
    ['Dias considerados', String(input.daysConsidered)],
    ['Novo total devido', formatCurrency(input.entitlementAmount)],
    ['Valor já pago anteriormente', formatCurrency(input.priorPaidAmount)],
    ['COMPLEMENTO DESTE PAGAMENTO', formatCurrency(input.complementAmount), true],
  ];
  lines.forEach(([label, value, bold], index) => {
    const top = y + 7 + index * 8;
    doc.rect(left, top, width, 8);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, 20, top + 5.3);
    doc.text(value, 189, top + 5.3, { align: 'right' });
  });

  const reasonTop = y + 7 + lines.length * 8 + 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Motivo do pagamento complementar:', left, reasonTop);
  doc.setFont('helvetica', 'normal');
  const reasonLines = doc.splitTextToSize(safe(input.reason), width - 4);
  doc.text(reasonLines.slice(0, 5), left + 2, reasonTop + 7);

  const declarationY = reasonTop + 32;
  doc.setFontSize(8);
  doc.text(
    `Declaro ter recebido o valor complementar de ${formatCurrency(input.complementAmount)} referente a ${benefitName.toLowerCase()} da competência ${competenciaLabel(input.competencia)}.`,
    left,
    declarationY,
    { maxWidth: width },
  );

  const assinaturaY = 205;
  doc.line(52, assinaturaY, 158, assinaturaY);
  doc.setFont('helvetica', 'normal');
  doc.text('Assinatura do colaborador', 105, assinaturaY + 6, { align: 'center' });
  doc.text(`Nome: ${safe(input.employee.name)}`, 105, assinaturaY + 12, { align: 'center' });
  doc.text('Data: ____/____/________', 105, assinaturaY + 18, { align: 'center' });

  return doc.output('blob');
};
