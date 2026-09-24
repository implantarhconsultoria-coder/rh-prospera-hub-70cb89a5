import { jsPDF } from 'jspdf';
import { formatCurrency } from '@/lib/calculations';

/**
 * Via de PROGRAMAÇÃO financeira no mesmo padrão tabular dos recibos de VR
 * da plataforma. Não se apresenta como quitação ou comprovante de pagamento.
 */
export type AdmissionFinanceReceipt = {
  company: { name: string; cnpj?: string };
  person: { name: string; cpf: string; role?: string };
  plannedAdmission: string;
  plannedPaymentDate?: string | null;
  competencia: string;
  businessDays: number | null;
  banking: {
    banco: string; agencia: string; conta: string; digito?: string;
    titular: string; cpfTitular: string; chavePix: string;
  };
  vr: { enabled: boolean; daily: number; total: number | null };
  vt: { enabled: boolean; daily: number; total: number | null };
  admitted: boolean;
};

const safe = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim() || '—';
const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const competenciaBr = (value: string) => {
  const [year, month] = String(value || '').split('-');
  return months[Number(month) - 1] && year ? months[Number(month) - 1] + ' / ' + year : safe(value);
};
const dateBr = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? match[3] + '/' + match[2] + '/' + match[1] : safe(value);
};

export const buildAdmissionFinanceReceiptPdfBlob = (data: AdmissionFinanceReceipt): Blob => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const left = 18;
  const right = 192;
  const width = right - left;

  const labelRow = (label: string, value: string, top: number, bold = false) => {
    doc.rect(left, top, width, 8);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.text(label, left + 3, top + 5.3);
    const valueLines = doc.splitTextToSize(value, 92);
    doc.text(valueLines[0] || '—', right - 3, top + 5.3, { align: 'right' });
  };
  const section = (heading: string, y: number) => {
    doc.setFillColor(229, 231, 235);
    doc.rect(left, y, width, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(heading, left + 2, y + 5.4);
    return y + 8;
  };

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(safe(data.company.name).toUpperCase().slice(0, 44), left, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('CNPJ: ' + safe(data.company.cnpj), left, 26);
  doc.setFont('helvetica', 'bold');
  doc.text('PROGRAMAÇÃO DE BENEFÍCIOS ADMISSIONAIS', right, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text('Competência: ' + competenciaBr(data.competencia), right, 26, { align: 'right' });
  doc.line(left, 32, right, 32);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('DOCUMENTO INTERNO PARA O FINANCEIRO — NÃO É RECIBO DE QUITAÇÃO', left, 39);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(data.admitted
    ? 'Funcionário com admissão aprovada; confirmar pagamento antes de emitir recibo de recebimento.'
    : 'Candidato em pré-admissão: programação antecipada, sujeita à confirmação do contrato e da admissão.',
    left, 45, { maxWidth: width });

  doc.roundedRect(left, 53, width, 40, 1, 1);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Nome:', 22, 61);
  doc.text('CPF:', 22, 70);
  doc.text('Função:', 112, 61);
  doc.text(data.admitted ? 'Admissão:' : 'Admissão prevista:', 112, 70);
  doc.text('Dias úteis elegíveis:', 22, 79);
  doc.setFont('helvetica', 'normal');
  doc.text(safe(data.person.name).slice(0, 49), 34, 61);
  doc.text(safe(data.person.cpf), 31, 70);
  doc.text(safe(data.person.role).slice(0, 35), 130, 61);
  doc.text(dateBr(data.plannedAdmission), 151, 70);
  doc.text(data.businessDays == null ? 'Pendente' : String(data.businessDays), 53, 79);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Data prevista para pagamento:', 22, 87);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(data.plannedPaymentDate ? dateBr(data.plannedPaymentDate) + ' (confirmar com RH)' : 'PENDENTE - AGUARDAR A CONFIRMACAO DO RH', 76, 87);

  let y = section('DADOS BANCÁRIOS — CONFERIR ANTES DO PAGAMENTO', 100);
  const account = safe(data.banking.conta) +
    (data.banking.digito ? '-' + data.banking.digito : '');
  const bankRows: Array<[string, string]> = [
    ['Banco', safe(data.banking.banco)],
    ['Agência', safe(data.banking.agencia)],
    ['Conta / dígito', account],
    ['Titular', safe(data.banking.titular)],
    ['CPF do titular', safe(data.banking.cpfTitular)],
    ['Chave PIX', safe(data.banking.chavePix)],
  ];
  bankRows.forEach(([label, value]) => { labelRow(label, value, y); y += 8; });

  const benefit = (name: string, item: AdmissionFinanceReceipt['vr']) => {
    y += 4;
    y = section(name, y);
    labelRow('Valor diário', item.enabled ? formatCurrency(item.daily) : 'Não aplicado', y); y += 8;
    labelRow('Dias úteis considerados', item.enabled ? (data.businessDays == null ? 'Pendente - confirmar com RH' : String(data.businessDays)) : '—', y); y += 8;
    labelRow('VALOR PARA PROGRAMAÇÃO', item.enabled ? (item.total == null ? 'PENDENTE - AGUARDAR A CONFIRMACAO DO RH' : formatCurrency(item.total)) : 'Não aplicado', y, true); y += 8;
  };
  benefit('VR — VALE-REFEIÇÃO', data.vr);
  benefit('VT — VALE-TRANSPORTE', data.vt);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('OBSERVAÇÃO PARA PROGRAMAÇÃO', left, y + 12);
  doc.setFont('helvetica', 'normal');
  const warning = 'VR e VT são demonstrados separadamente. Este documento apenas solicita programação financeira; ' +
    'não comprova depósito, entrega, quitação, assinatura ou autorização de admissão. ' +
    'A data prevista para pagamento acompanha a data de início informada; sem data, permanece pendente de confirmação do RH. ' +
    'Conferir os valores, a data de início e os dados bancários antes de executar o pagamento.';
  doc.text(doc.splitTextToSize(warning, width), left, y + 19);

  return doc.output('blob');
};
