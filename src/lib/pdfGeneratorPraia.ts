import { jsPDF } from 'jspdf';
import { cleanText } from './textClean';
import { ponteAereaLogoDataUrl } from '@/assets/ponteAereaLogoData';
import {
  gerarAutorizacaoExameAdmissionalPdf as gerarGuiaPadrao,
  type FichaASOData,
} from './pdfGenerator';

export type { FichaASOData, AvisoFeriasData } from './pdfGenerator';
export {
  makeDocumentFileName,
  gerarFichaASOPdf,
  gerarAvisoFeriasPdf,
  downloadPdf,
} from './pdfGenerator';

const normalizar = (value?: string) => cleanText(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();

const isPraiaGrande = (d: FichaASOData) => {
  const origem = normalizar(`${d.empresa || ''} ${d.obraLocal || ''} ${d.clinica || ''}`);
  return origem.includes('PRAIA GRANDE') || origem.includes('TOPAC FILIAL PRAIA') || origem.includes('RUA LONDRINA');
};

const formatarData = (value?: string) => {
  if (!value) return '-';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const nomeArquivo = (value?: string) => normalizar(value || 'FUNCIONARIO')
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();

const gerarGuiaPraiaGrande = (d: FichaASOData): { blob: Blob; fileName: string } => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const x = 18;
  const width = 174;
  let y = 8;

  const texto = (
    value: string,
    tx: number,
    ty: number,
    options: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; maxWidth?: number } = {},
  ) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.size || 9);
    doc.setTextColor(0, 0, 0);
    const limpo = cleanText(value);
    const linhas = options.maxWidth ? doc.splitTextToSize(limpo, options.maxWidth) : limpo;
    doc.text(linhas, tx, ty, { align: options.align || 'left' });
  };

  const caixa = (height: number, fill?: [number, number, number]) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    if (fill) {
      doc.setFillColor(...fill);
      doc.rect(x, y, width, height, 'FD');
    } else {
      doc.rect(x, y, width, height);
    }
  };

  caixa(22);
  try {
    doc.addImage(ponteAereaLogoDataUrl, 'PNG', x + 4, y + 2, 47, 17);
  } catch {
    texto('PONTE AEREA', x + 27, y + 12, { size: 10, bold: true, align: 'center' });
  }
  texto('AUTORIZACAO DE EXAMES', x + 112, y + 13, { size: 15, bold: true, align: 'center' });
  y += 22;

  caixa(52);
  const center = x + width / 2;
  texto('LOCAL DE ATENDIMENTO:', center, y + 8, { size: 13, bold: true, align: 'center' });
  texto('RUA LONDRINA, 483.', center, y + 16, { size: 11, bold: true, align: 'center' });
  texto('CENTRO, PRAIA GRANDE/SP.', center, y + 22, { size: 11, bold: true, align: 'center' });
  texto('HORARIO DE ATENDIMENTO:', center, y + 32, { size: 12, bold: true, align: 'center' });
  texto('DE SEGUNDA A SEXTA DAS 08h00 AS 11h00.', center, y + 40, { size: 10.5, bold: true, align: 'center' });
  texto('(HORARIO AGENDADO)', center, y + 47, { size: 10, bold: true, align: 'center' });
  y += 52;

  const campos: Array<[string, string]> = [
    ['NOME DA EMPRESA', d.empresa || '-'],
    ['CNPJ', d.cnpj || '-'],
    ['DATA DO EXAME', formatarData(d.dataExame)],
    ['OBRA / LOCAL', d.obraLocal || '-'],
    ['FUNCIONARIO', d.nome || '-'],
    ['SETOR / GHE', d.setorGhe || '-'],
    ['FUNCAO', d.funcao || '-'],
    ['DATA DE NASCIMENTO', formatarData(d.dataNascimento)],
    ['RG', d.rg || '-'],
    ['CPF', d.cpf || '-'],
    ['DATA DE ADMISSAO', formatarData(d.dataAdmissao)],
  ];

  campos.forEach(([label, value]) => {
    caixa(9);
    texto(`${label}:`, x + 3, y + 6, { size: 9, bold: true });
    texto(value, x + 52, y + 6, { size: 9, maxWidth: 116 });
    y += 9;
  });

  caixa(16, [225, 225, 225]);
  texto('TIPO DE EXAME', center, y + 6, { size: 10, bold: true, align: 'center' });
  texto(`EXAME ${normalizar(d.tipoExame || 'ADMISSIONAL')}`, center, y + 12, { size: 11, bold: true, align: 'center' });
  y += 16;

  const check = (value?: boolean) => value ? '( X ) SIM   (   ) NAO' : '(   ) SIM   ( X ) NAO';
  [
    `TRABALHO EM ALTURA - NR35: ${check(d.trabalhoAltura)}`,
    `ESPACO CONFINADO - NR33: ${check(d.espacoConfinado)}`,
    `EXAME TOXICOLOGICO: ${check(d.toxicologico)}`,
  ].forEach((line) => {
    caixa(11);
    texto(line, x + 3, y + 7, { size: 9.5, bold: true });
    y += 11;
  });

  caixa(30);
  texto('ATENDIMENTO SOMENTE COM HORARIO AGENDADO.', center, y + 9, { size: 10, bold: true, align: 'center' });
  texto('O FUNCIONARIO DEVE COMPARECER COM DOCUMENTO DE IDENTIDADE E CPF.', center, y + 17, { size: 9, bold: true, align: 'center', maxWidth: 160 });
  texto(`RESPONSAVEL / CONTATO: ${d.responsavelContato || '-'}`, center, y + 25, { size: 9, bold: true, align: 'center', maxWidth: 160 });

  const dataArquivo = d.dataExame || new Date().toISOString().slice(0, 10);
  return {
    blob: doc.output('blob'),
    fileName: `GUIA ASO PRAIA GRANDE - ${nomeArquivo(d.nome)} - ${dataArquivo}.pdf`,
  };
};

export const gerarAutorizacaoExameAdmissionalPdf = (d: FichaASOData): { blob: Blob; fileName: string } =>
  isPraiaGrande(d) ? gerarGuiaPraiaGrande(d) : gerarGuiaPadrao(d);
