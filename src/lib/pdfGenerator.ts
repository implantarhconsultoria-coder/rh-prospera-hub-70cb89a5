import { jsPDF } from 'jspdf';
import { cleanText } from './textClean';
import { ponteAereaLogoDataUrl } from '@/assets/ponteAereaLogoData';

export interface FichaASOData {
  empresa: string;
  cnpj?: string;
  nome: string;
  cpf: string;
  rg?: string;
  funcao: string;
  dataAdmissao?: string;
  dataNascimento?: string;
  setorGhe?: string;
  dataExame?: string;
  tipoExame: string;
  obraLocal?: string;
  trabalhoAltura: boolean;
  espacoConfinado: boolean;
  toxicologico?: boolean;
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

const fmtBR = (iso?: string) => {
  if (!iso) return '-';
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return new Date(iso).toLocaleDateString('pt-BR');
};

const cleanFilePart = (value?: string) => cleanText(value || 'SEM_INFORMACAO')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toUpperCase() || 'SEM_INFORMACAO';

export const makeDocumentFileName = (
  tipo: string,
  empresa?: string,
  funcionario?: string,
  data?: string,
) => `${cleanFilePart(tipo)}_${cleanFilePart(empresa)}_${cleanFilePart(funcionario)}_${data || new Date().toISOString().slice(0, 10)}.pdf`;

const getExamHighlightColor = (tipoExame: string): [number, number, number] => {
  const normalized = cleanText(tipoExame || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (normalized.includes('DEMISSIONAL')) return [255, 0, 0];
  if (normalized.includes('ADMISSIONAL')) return [0, 255, 0];
  return [255, 255, 0];
};

const drawHeader = (doc: jsPDF, empresa: string, cnpj: string, titulo: string) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const empresaLines = doc.splitTextToSize(cleanText(empresa) || '---', 112).slice(0, 2);
  doc.text(empresaLines, 15, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CNPJ: ${cleanText(cnpj) || '---'}`, 15, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const tituloLines = doc.splitTextToSize(cleanText(titulo), 72).slice(0, 2);
  doc.text(tituloLines, 195, 17, { align: 'right' });
  doc.setLineWidth(0.5);
  doc.line(15, 31, 195, 31);
};

const drawBlock = (doc: jsPDF, y: number, titulo: string, linhas: [string, string][]) => {
  const lineHeight = 4.8;
  const colWidth = 80;
  const rows: Array<[[string, string] | undefined, [string, string] | undefined]> = [];
  for (let i = 0; i < linhas.length; i += 2) rows.push([linhas[i], linhas[i + 1]]);

  doc.setFontSize(10);
  const rowHeights = rows.map((row) => Math.max(...row.map((field) => {
    if (!field || !field[0]) return 7;
    const [label, value] = field;
    const labelWidth = doc.getTextWidth(`${label}: `);
    const valueWidth = Math.max(22, colWidth - labelWidth);
    const wrapped = doc.splitTextToSize(cleanText(value) || '---', valueWidth);
    return Math.max(7, wrapped.length * lineHeight);
  })));
  const altura = 13 + rowHeights.reduce((sum, height) => sum + height, 0);

  doc.setDrawColor(180);
  doc.roundedRect(15, y, 180, altura, 1.5, 1.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(85);
  doc.text(titulo.toUpperCase(), 18, y + 6);
  doc.setTextColor(0);
  doc.setFontSize(10);
  let curY = y + 13;
  rows.forEach((row, rowIndex) => {
    row.forEach((field, col) => {
      if (!field || !field[0]) return;
      const [label, value] = field;
      const x = col === 0 ? 18 : 105;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(110);
      doc.text(`${label}:`, x, curY);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      const labelWidth = doc.getTextWidth(`${label}: `);
      const valueX = x + labelWidth;
      const wrapped = doc.splitTextToSize(cleanText(value) || '---', Math.max(22, colWidth - labelWidth));
      doc.text(wrapped, valueX, curY);
    });
    curY += rowHeights[rowIndex];
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
  doc.text('Assinatura do Responsavel', 152, y + 5, { align: 'center' });
};

export const gerarFichaASOPdf = (d: FichaASOData): { blob: Blob; fileName: string } => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawHeader(doc, d.empresa, d.cnpj || '', 'FICHA DE AGENDAMENTO ASO');
  let y = 35;
  y = drawBlock(doc, y, 'Dados do Colaborador', [
    ['Nome', d.nome], ['Funcao', d.funcao],
    ['CPF', d.cpf], ['RG', d.rg || '-'],
    ['Admissao', fmtBR(d.dataAdmissao)], ['Empresa', d.empresa],
    ['Nascimento', fmtBR(d.dataNascimento)], ['Setor/GHE', d.setorGhe || '---'],
  ]);
  y = drawBlock(doc, y, 'Dados do Exame', [
    ['Data do Exame', fmtBR(d.dataExame)], ['Tipo', d.tipoExame],
    ['Obra/Local', d.obraLocal || '-'], ['Responsavel', d.responsavelContato || '-'],
    ['NR35', d.trabalhoAltura ? 'Sim' : 'Nao'],
    ['NR33', d.espacoConfinado ? 'Sim' : 'Nao'],
    ['Toxicologico', d.toxicologico ? 'Sim' : 'Nao'],
  ]);
  if (d.clinica) {
    doc.setDrawColor(180);
    doc.roundedRect(15, y, 180, 22, 1.5, 1.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(85);
    doc.text('CLINICA', 18, y + 6);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(d.clinica, 174);
    doc.text(wrapped, 18, y + 13);
    y += 27;
  }
  drawSignatures(doc, y + 35);
  const fileName = makeDocumentFileName('ASO', d.empresa, d.nome, d.dataExame || new Date().toISOString().slice(0, 10));
  return { blob: doc.output('blob'), fileName };
};

export const gerarAutorizacaoExameAdmissionalPdf = (d: FichaASOData): { blob: Blob; fileName: string } => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const today = new Date().toISOString().slice(0, 10);
  const dataExame = d.dataExame || today;
  const tipoExame = cleanText(d.tipoExame || 'Admissional').toUpperCase();
  const responsavel = cleanText(d.responsavelContato || 'ROBSON CHAFI SERVILIO - CEL 11 94292-0385');
  const x = 18;
  const w = 174;
  let y = 5;

  const write = (
    text: string,
    tx: number,
    ty: number,
    options: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; maxWidth?: number; color?: [number, number, number] } = {},
  ) => {
    doc.setFont('times', options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.size || 9);
    doc.setTextColor(...(options.color || [0, 0, 0]));
    const value = cleanText(text);
    const lines = options.maxWidth ? doc.splitTextToSize(value, options.maxWidth) : value;
    doc.text(lines, tx, ty, { align: options.align || 'left' });
  };
  const rect = (height: number, fill?: [number, number, number]) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    if (fill) {
      doc.setFillColor(...fill);
      doc.rect(x, y, w, height, 'FD');
    } else {
      doc.rect(x, y, w, height);
    }
  };
  const next = (height: number) => { y += height; };
  const checkbox = (checked?: boolean) => checked ? '(  X  ) SIM    (     ) NÃO' : '(     ) SIM    (     ) NÃO';

  const headerH = 23;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(x, y, 65, headerH);
  doc.rect(x + 65, y, w - 65, headerH);
  try {
    doc.addImage(ponteAereaLogoDataUrl, 'PNG', x + 4, y + 2.5, 47, 18);
  } catch {
    // A identificação textual permanece disponível caso o logo não possa ser renderizado.
  }
  write('AUTORIZAÇÃO DE EXAMES', x + 65 + (w - 65) / 2, y + 14, { size: 14, align: 'center' });
  next(headerH);

  const atendimentoH = 52;
  rect(atendimentoH);
  const centerX = x + w / 2;
  const localAtendimento = cleanText(d.clinica || 'Avenida São João, 313, 1º andar, Centro, São Paulo/SP');
  const localLines = doc.splitTextToSize(localAtendimento.toUpperCase(), 160).slice(0, 2);
  write('LOCAL DE ATENDIMENTO:', centerX, y + 7, { size: 13, bold: true, align: 'center' });
  localLines.forEach((line: string, index: number) => {
    write(line, centerX, y + 14 + index * 6, { size: 11.5, align: 'center' });
  });
  write('HORÁRIO DE ATENDIMENTO:', centerX, y + 30, { size: 12.5, bold: true, align: 'center' });
  write('DE SEGUNDA A SEXTA DAS 07h30 ÀS 15h00.', centerX, y + 36, { size: 11, align: 'center' });
  write('PARA RAIO-X: ATENDIMENTO ATÉ AS 12h00', centerX, y + 42, { size: 10.5, bold: true, align: 'center' });
  write('(atendimento por ordem de chegada)', centerX, y + 48, { size: 10, align: 'center' });
  next(atendimentoH);

  const empresaH = 21;
  doc.rect(x, y, 90, empresaH);
  doc.rect(x + 90, y, w - 90, empresaH);
  write(`NOME DA EMPRESA: ${d.empresa || ''}`, x + 3, y + 8, { size: 9.5, bold: true, maxWidth: 84 });
  write(`CNPJ:${d.cnpj || ''}`, x + 3, y + 15, { size: 9.5, bold: true });
  write(`DATA DO EXAME: ${fmtBR(dataExame)}`, x + 93, y + 12, { size: 9.5, bold: true });
  next(empresaH);

  const funcionarioH = 44;
  rect(funcionarioH);
  write(`OBRA / LOCAL: ${d.obraLocal || ''}`, x + 3, y + 6, { size: 9.5, bold: true });
  write(`FUNCIONÁRIO: ${d.nome || ''}`, x + 3, y + 12.5, { size: 9.5, bold: true });
  write(`SETOR/ GHE: ${d.setorGhe || ''}`, x + 3, y + 19, { size: 9.5, bold: true });
  write(`FUNÇÃO:  ${d.funcao || ''}`, x + 3, y + 25.5, { size: 9.5, bold: true });
  write(`DATA DE NASCIMENTO: ${fmtBR(d.dataNascimento)}`, x + 3, y + 32, { size: 9.5, bold: true });
  write(`CPF: ${d.cpf || ''}`, x + 3, y + 38.5, { size: 9.5, bold: true });
  write(`DATA DE ADMISSÃO: ${fmtBR(d.dataAdmissao)}`, x + 78, y + 38.5, { size: 9.5, bold: true });
  next(funcionarioH);

  const descH = 17;
  rect(descH, [219, 219, 219]);
  write('DESCREVER ABAIXO O TIPO DE EXAME (ADMISSIONAL/ PERIÓDICO / DEMISSIONAL / MUDANÇA DE FUNÇÃO / RETORNO AO TRABALHO / AVALIAÇÃO MÉDICA /', centerX, y + 6, { size: 8.6, bold: true, align: 'center', maxWidth: 166 });
  write('OUTROS QUAL (DESCREVER)', centerX, y + 13, { size: 8.8, bold: true, align: 'center' });
  next(descH);

  const examH = 18;
  rect(examH);
  const examText = `EXAME ${tipoExame}`;
  const examTextWidth = doc.getTextWidth(examText) + 4;
  doc.setFillColor(...getExamHighlightColor(tipoExame));
  doc.rect(centerX - examTextWidth / 2, y + 7, examTextWidth, 6, 'F');
  write(examText, centerX, y + 12, { size: 10.5, bold: true, align: 'center' });
  next(examH);

  const assH = 14;
  rect(assH, [219, 219, 219]);
  doc.setFillColor(251, 228, 213);
  doc.rect(x + 3, y + 4, w - 6, 6, 'F');
  write('ASSINALAR “SIM” CASO SE APLIQUE AOS ITENS ABAIXO:', centerX, y + 8.5, { size: 9, bold: true, align: 'center' });
  next(assH);

  const nrH = 12;
  rect(nrH);
  write(`REALIZARÁ EXAMES P/ TRABALHO EM ALTURA – NR35   ${checkbox(d.trabalhoAltura)}`, x + 3, y + 8, { size: 9.5, bold: true });
  next(nrH);
  rect(nrH);
  write(`REALIZARÁ EXAMES P/ TRABALHO EM ESPAÇO CONFINADO – NR33   ${checkbox(d.espacoConfinado)}`, x + 3, y + 8, { size: 9.5, bold: true });
  next(nrH);
  rect(nrH);
  write(`REALIZARÁ EXAME TOXICOLÓGICO   ${checkbox(d.toxicologico)}`, x + 3, y + 8, { size: 9.5, bold: true });
  next(nrH);

  const centralH = 40;
  rect(centralH);
  write('CENTRAL DE AGENDAMENTO:', centerX, y + 8, { size: 10, bold: true, align: 'center' });
  write('E-mail: agendamento@ponteaereaseguranca.com.br', centerX, y + 15, { size: 9.5, bold: true, align: 'center' });
  write('(11) 95301-3663 (Dúvidas e informações)', centerX, y + 21.5, { size: 9.5, bold: true, align: 'center' });
  write('(11) 3333-1717', centerX, y + 28, { size: 9.5, bold: true, align: 'center' });
  write('Mediante agendamento prévio no telefone e (ou) e-mail acima indicado;', centerX, y + 34, { size: 8.7, bold: true, align: 'center' });
  write('É obrigatório que o funcionário compareça munido de documento de identidade e CPF.', centerX, y + 38, { size: 8.5, bold: true, align: 'center' });
  next(centralH);

  rect(5);
  next(5);
  rect(16);
  write('Nome do Responsável / Contato (OBRIGATÓRIO):', x + 3, y + 9, { size: 9.5, bold: true });
  write(responsavel, x + 83, y + 9, { size: 9.5, bold: true, maxWidth: 86 });

  const fileName = `GUIA ASO AUDIOLIFE - ${cleanFilePart(d.nome).replace(/_/g, ' ')} - ${dataExame}.pdf`;
  return { blob: doc.output('blob'), fileName };
};

export const gerarAvisoFeriasPdf = (d: AvisoFeriasData): { blob: Blob; fileName: string } => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawHeader(doc, d.empresa, d.cnpj || '', 'AVISO DE FERIAS');
  let y = 35;
  y = drawBlock(doc, y, 'Dados do Colaborador', [
    ['Nome', d.nome], ['Funcao', d.funcao],
    ['CPF', d.cpf], ['RG', d.rg || '-'],
    ['Matricula', d.matricula || '-'], ['Empresa', d.empresa],
    ['Admissao', fmtBR(d.dataAdmissao)], ['', ''],
  ]);
  doc.setDrawColor(180);
  doc.roundedRect(15, y, 180, 50, 1.5, 1.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('COMUNICACAO DE FERIAS', 18, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const texto = `Comunicamos que o(a) colaborador(a) acima identificado(a) gozara ferias de ${d.diasFerias} dias, com inicio em ${fmtBR(d.inicioFerias)} e retorno em ${fmtBR(d.retornoFerias)}.\n\nData de emissao: ${new Date().toLocaleDateString('pt-BR')}`;
  const wrapped = doc.splitTextToSize(texto, 174);
  doc.text(wrapped, 18, y + 15);
  y += 55;
  drawSignatures(doc, y + 35);
  const fileName = makeDocumentFileName('FERIAS', d.empresa, d.nome, d.inicioFerias || new Date().toISOString().slice(0, 10));
  return { blob: doc.output('blob'), fileName };
};

/** Faz download local do PDF e retorna o blob para upload */
export const downloadPdf = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = cleanFilePart(fileName.replace(/\.pdf$/i, ''));
  a.href = url;
  a.download = `${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
