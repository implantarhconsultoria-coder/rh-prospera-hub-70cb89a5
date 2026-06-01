import { jsPDF } from 'jspdf';
import { cleanText } from './textClean';

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

  const field = (label: string, value?: string) => `${label}: ${cleanText(value) || '---'}`;
  const check = (checked: boolean) => checked ? '( X ) SIM   (   ) NAO' : '(   ) SIM   ( X ) NAO';
  const today = new Date().toISOString().slice(0, 10);
  const dataExame = d.dataExame || today;
  const tipoExame = cleanText(d.tipoExame || 'Admissional').toUpperCase();
  const responsavel = cleanText(d.responsavelContato || 'ROBSON CHAFI SERVILIO - CEL 11 94292-0385');

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('AUTORIZACAO DE EXAMES', 105, 13, { align: 'center' });

  doc.setFontSize(9);
  doc.rect(12, 18, 186, 43);
  doc.text('LOCAL DE ATENDIMENTO:', 15, 24);
  doc.setFont('helvetica', 'normal');
  doc.text('AVENIDA SAO JOAO, 313, 1o ANDAR', 15, 30);
  doc.text('OBS: PROXIMO AO LARGO PAISSANDU E METRO SAO BENTO', 15, 36);
  doc.text('CENTRO - SAO PAULO.', 15, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('HORARIO DE ATENDIMENTO:', 15, 49);
  doc.setFont('helvetica', 'normal');
  doc.text('DE SEGUNDA A SEXTA DAS 07h30 AS 15:00. PARA RAIO-X ATE AS 12:00. POR ORDEM DE CHEGADA.', 15, 55);

  let y = 69;
  doc.setFontSize(10);
  const drawLine = (text: string) => {
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(text, 180), 15, y);
    y += 8;
  };

  drawLine(field('NOME DA EMPRESA', d.empresa));
  drawLine(field('CNPJ', d.cnpj || ''));
  drawLine(field('DATA DO EXAME', fmtBR(dataExame)));
  drawLine(field('OBRA / LOCAL', d.obraLocal || ''));
  drawLine(field('FUNCIONARIO', d.nome));
  drawLine(field('SETOR / GHE', d.setorGhe || ''));
  drawLine(field('FUNCAO', d.funcao));
  drawLine(field('DATA DE NASCIMENTO', fmtBR(d.dataNascimento)));
  drawLine(field('CPF', d.cpf));
  drawLine(field('DATA DE ADMISSAO', fmtBR(d.dataAdmissao)));

  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.text('DESCREVER ABAIXO O TIPO DE EXAME', 15, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text('(ADMISSIONAL / PERIODICO / DEMISSIONAL / MUDANCA DE FUNCAO / RETORNO AO TRABALHO / AVALIACAO MEDICA / OUTROS)', 15, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(`EXAME ${tipoExame}`, 15, y);

  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.text('ASSINALAR "SIM" CASO SE APLIQUE AOS ITENS ABAIXO:', 15, y);
  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.text(`REALIZARA EXAMES P/ TRABALHO EM ALTURA - NR35   ${check(Boolean(d.trabalhoAltura))}`, 15, y);
  y += 8;
  doc.text(`REALIZARA EXAMES P/ TRABALHO EM ESPACO CONFINADO - NR33   ${check(Boolean(d.espacoConfinado))}`, 15, y);
  y += 8;
  doc.text(`REALIZARA EXAME TOXICOLOGICO   ${check(Boolean(d.toxicologico))}`, 15, y);

  y += 13;
  doc.setFont('helvetica', 'bold');
  doc.text('CENTRAL DE AGENDAMENTO:', 15, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.text('E-mail: agendamento@ponteaereaseguranca.com.br', 15, y);
  y += 6;
  doc.text('(11) 95301-3663 (Duvidas e informacoes) / (11) 3333-1717', 15, y);
  y += 10;
  doc.text('Mediante agendamento previo no telefone e/ou e-mail acima indicado.', 15, y);
  y += 6;
  doc.text('E obrigatorio que o funcionario compareca munido de documento de identidade e CPF.', 15, y);
  y += 11;
  doc.setFont('helvetica', 'bold');
  doc.text(`Nome do Responsavel / Contato (OBRIGATORIO): ${responsavel}`, 15, y);

  drawSignatures(doc, 282);
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
