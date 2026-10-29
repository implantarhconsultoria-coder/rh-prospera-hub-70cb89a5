import { jsPDF } from 'jspdf';

export interface GarageReceiptData {
  employeeId: string;
  employeeName: string;
  cpf: string;
  cargo: string;
  registro: string;
  companyId: string;
  companyName: string;
  cnpj: string;
  veiculo: string;
  placa: string;
  competencia: string;
  dataPagamento: string;
  valor: number;
}

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBR = (value: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? [m[3], m[2], m[1]].join('/') : value;
};
const monthBR = (competencia: string) => {
  const [year, month] = competencia.split('-').map(Number);
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return months[month - 1] && Number.isFinite(year) ? months[month - 1] + ' / ' + year : competencia;
};
export const garageReceiptFilename = (r: GarageReceiptData) =>
  'RECIBO_GARAGEM_' + r.employeeName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_') + '_' + r.competencia + '.pdf';

const buildHeader = (pdf: jsPDF, title: string, subtitle: string) => {
  pdf.setFont('helvetica','bold'); pdf.setFontSize(16); pdf.text('TOPAC RH PRO', 15, 21);
  pdf.setFontSize(13); pdf.text(title, 15, 32);
  pdf.setDrawColor(65, 65, 75); pdf.line(15, 36, 195, 36);
  pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.text(subtitle, 15, 44);
};
const line = (pdf: jsPDF, label: string, value: string, y: number) => {
  pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.text(label, 16, y);
  pdf.setFont('helvetica','normal'); pdf.text(value || 'Não informado', 75, y);
};

export const buildGarageIndividualPdf = (r: GarageReceiptData): Blob => {
  const pdf = new jsPDF({ unit:'mm', format:'a4' });
  buildHeader(pdf, 'RECIBO INDIVIDUAL DE GARAGEM', 'Competência: ' + monthBR(r.competencia) + '  |  Emissão: ' + dateBR(r.dataPagamento));
  line(pdf,'Empresa',r.companyName,58);
  line(pdf,'CNPJ',r.cnpj,67);
  line(pdf,'Funcionário',r.employeeName,82);
  line(pdf,'CPF',r.cpf,91);
  line(pdf,'Cargo',r.cargo,100);
  line(pdf,'Registro',r.registro,109);
  line(pdf,'Veículo',r.veiculo,124);
  line(pdf,'Placa',r.placa,133);
  line(pdf,'Valor mensal',brl(r.valor),148);
  line(pdf,'Referência',monthBR(r.competencia),157);
  pdf.setFontSize(10); pdf.setFont('helvetica','normal');
  const obs = 'Valor destinado ao custeio de garagem para guarda do veículo da empresa acima identificado, utilizado pelo colaborador. Este recibo é emitido para formalização e ciência.';
  pdf.text(pdf.splitTextToSize(obs,177),16,172);
  pdf.setDrawColor(110); pdf.line(31,228,179,228);
  pdf.setFont('helvetica','bold'); pdf.text(r.employeeName,105,235,{align:'center'});
  pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.text('Assinatura do colaborador',105,242,{align:'center'});
  pdf.setTextColor(105); pdf.setFontSize(8);
  pdf.text('Documento para assinatura; a geração não confirma pagamento bancário.',15,274);
  pdf.text('TOPAC RH PRO - Controle interno',15,281);
  return pdf.output('blob');
};

export const buildGarageConsolidatedPdf = (rows: GarageReceiptData[]): Blob => {
  const pdf = new jsPDF({ unit:'mm', format:'a4' });
  const competencia = rows[0]?.competencia || '';
  const total = rows.reduce((sum, row) => sum + row.valor, 0);
  const header = () => {
    buildHeader(pdf, 'CONSOLIDADO DE GARAGEM', 'Competência: ' + monthBR(competencia));
    pdf.setFont('helvetica','bold'); pdf.setFontSize(11);
    pdf.text('Colaboradores: ' + rows.length + '   |   Total: ' + brl(total),15,56);
    pdf.setFontSize(9); pdf.text('EMPRESA',15,68); pdf.text('COLABORADOR',62,68); pdf.text('PLACA',149,68); pdf.text('VALOR',171,68);
    pdf.line(15,72,195,72);
  };
  header(); let y = 80;
  rows.forEach((row) => {
    if (y > 268) { pdf.addPage(); header(); y = 80; }
    pdf.setFont('helvetica','normal'); pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(row.companyName,43).slice(0,2),15,y);
    pdf.text(pdf.splitTextToSize(row.employeeName,82).slice(0,2),62,y);
    pdf.text(row.placa || '—',149,y);
    pdf.text(brl(row.valor),171,y);
    pdf.setDrawColor(225); pdf.line(15,y+7,195,y+7); y += 17;
  });
  pdf.setFontSize(8); pdf.setTextColor(105);
  pdf.text('Consolidado interno; não substitui comprovante de pagamento.',15,284);
  return pdf.output('blob');
};
