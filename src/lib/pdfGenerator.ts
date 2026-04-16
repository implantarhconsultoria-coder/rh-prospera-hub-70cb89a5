import { jsPDF } from 'jspdf';

export interface FichaASOData {
  empresa: string;
  cnpj?: string;
  nome: string;
  cpf: string;
  rg?: string;
  funcao: string;
  dataAdmissao?: string;
  dataExame?: string;
  tipoExame: string;
  obraLocal?: string;
  trabalhoAltura: boolean;
  espacoConfinado: boolean;
  responsavelContato?: string;
  clinica?: string;
}

export interface AvisoFeriasData {
  empresa: string;
  cnpj?: string;
  nome: string;
  cpf: string;
  rg?: string;
  matricula?: string;
  funcao: string;
  dataAdmissao?: string;
  inicioFerias: string;
  retornoFerias: string;
  diasFerias: number;
}

const fmtBR = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const drawHeader = (doc: jsPDF, empresa: string, cnpj: string, titulo: string) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(empresa, 15, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CNPJ: ${cnpj || '—'}`, 15, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(titulo, 195, 22, { align: 'right' });
  doc.setLineWidth(0.5);
  doc.line(15, 28, 195, 28);
};

const drawBlock = (doc: jsPDF, y: number, titulo: string, linhas: [string, string][]) => {
  doc.setDrawColor(180);
  const altura = 12 + Math.ceil(linhas.length / 2) * 7;
  doc.roundedRect(15, y, 180, altura, 1.5, 1.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(85);
  doc.text(titulo.toUpperCase(), 18, y + 6);
  doc.setTextColor(0);
  doc.setFontSize(10);
  let curY = y + 13;
  linhas.forEach(([label, value], idx) => {
    const col = idx % 2;
    const x = col === 0 ? 18 : 105;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(110);
    doc.text(`${label}:`, x, curY);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.text(String(value || '—'), x + labelWidth, curY);
    if (col === 1) curY += 7;
  });
  return y + altura + 5;
};

const drawSignatures = (doc: jsPDF, y: number) => {
  doc.setLineWidth(0.3);
  doc.line(25, y, 90, y);
  doc.line(120, y, 185, y);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Assinatura do Colaborador', 57, y + 5, { align: 'center' });
  doc.text('Assinatura do Responsável', 152, y + 5, { align: 'center' });
};

export const gerarFichaASOPdf = (d: FichaASOData): { blob: Blob; fileName: string } => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawHeader(doc, d.empresa, d.cnpj || '', 'FICHA DE AGENDAMENTO ASO');
  let y = 35;
  y = drawBlock(doc, y, 'Dados do Colaborador', [
    ['Nome', d.nome], ['Função', d.funcao],
    ['CPF', d.cpf], ['RG', d.rg || '—'],
    ['Admissão', fmtBR(d.dataAdmissao)], ['Empresa', d.empresa],
  ]);
  y = drawBlock(doc, y, 'Dados do Exame', [
    ['Data do Exame', fmtBR(d.dataExame)], ['Tipo', d.tipoExame],
    ['Obra/Local', d.obraLocal || '—'], ['Responsável', d.responsavelContato || '—'],
    ['Trabalho em Altura', d.trabalhoAltura ? 'Sim' : 'Não'],
    ['Espaço Confinado', d.espacoConfinado ? 'Sim' : 'Não'],
  ]);
  if (d.clinica) {
    doc.setDrawColor(180);
    doc.roundedRect(15, y, 180, 22, 1.5, 1.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(85);
    doc.text('CLÍNICA', 18, y + 6);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(d.clinica, 174);
    doc.text(wrapped, 18, y + 13);
    y += 27;
  }
  drawSignatures(doc, y + 35);
  const fileName = `Ficha_ASO_${d.nome.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
  return { blob: doc.output('blob'), fileName };
};

export const gerarAvisoFeriasPdf = (d: AvisoFeriasData): { blob: Blob; fileName: string } => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawHeader(doc, d.empresa, d.cnpj || '', 'AVISO DE FÉRIAS');
  let y = 35;
  y = drawBlock(doc, y, 'Dados do Colaborador', [
    ['Nome', d.nome], ['Função', d.funcao],
    ['CPF', d.cpf], ['RG', d.rg || '—'],
    ['Matrícula', d.matricula || '—'], ['Empresa', d.empresa],
    ['Admissão', fmtBR(d.dataAdmissao)], ['', ''],
  ]);
  doc.setDrawColor(180);
  doc.roundedRect(15, y, 180, 50, 1.5, 1.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('COMUNICAÇÃO DE FÉRIAS', 18, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const texto = `Comunicamos que o(a) colaborador(a) acima identificado(a) gozará férias de ${d.diasFerias} dias, com início em ${fmtBR(d.inicioFerias)} e retorno em ${fmtBR(d.retornoFerias)}.\n\nData de emissão: ${new Date().toLocaleDateString('pt-BR')}`;
  const wrapped = doc.splitTextToSize(texto, 174);
  doc.text(wrapped, 18, y + 15);
  y += 55;
  drawSignatures(doc, y + 35);
  const fileName = `Aviso_Ferias_${d.nome.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
  return { blob: doc.output('blob'), fileName };
};

/** Faz download local do PDF e retorna o blob para upload */
export const downloadPdf = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
