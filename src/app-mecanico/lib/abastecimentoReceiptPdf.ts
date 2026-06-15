import { jsPDF } from 'jspdf';

export type AbastecimentoReceiptData = {
  id: string;
  postoNome: string;
  postoCnpj: string;
  postoEndereco: string;
  mecanicoNome: string;
  empresa: string;
  filial: string;
  placa: string;
  combustivel: string;
  valor: string;
  litros: string;
  precoLitro: string;
  km: string;
  observacao: string;
  fotoBombaUrl: string;
  fotoPainelUrl: string;
  createdAt: Date;
  registroTeste?: boolean;
};

const cleanFilePart = (value: string) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toUpperCase() || 'SEM_INFORMACAO';

const parseNumber = (value: string) => {
  const raw = String(value || '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
};

const money = (value: string) => parseNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = (value: string, digits = 3) => parseNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const imageToDataUrl = async (url: string) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar uma das fotos do abastecimento.');
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const addPhoto = (doc: jsPDF, dataUrl: string, label: string, x: number, y: number, width: number, height: number) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(label, x, y);
  doc.setDrawColor(185);
  doc.rect(x, y + 3, width, height);
  if (!dataUrl) return;
  const format = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
  doc.addImage(dataUrl, format, x + 1, y + 4, width - 2, height - 2, undefined, 'FAST');
};

export const gerarReciboAbastecimentoPdf = async (data: AbastecimentoReceiptData) => {
  const [fotoBomba, fotoPainel] = await Promise.all([
    imageToDataUrl(data.fotoBombaUrl),
    imageToDataUrl(data.fotoPainelUrl),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  const pageWidth = 210;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  doc.setFillColor(14, 76, 117);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('TOPAC RH PRO', margin, 12);
  doc.setFontSize(12);
  doc.text('RECIBO DE ABASTECIMENTO', margin, 21);
  doc.setFontSize(8);
  doc.text(`Registro: ${data.id || 'salvo'}`, pageWidth - margin, 12, { align: 'right' });
  doc.text(data.createdAt.toLocaleString('pt-BR'), pageWidth - margin, 19, { align: 'right' });
  y = 35;
  doc.setTextColor(0);

  if (data.registroTeste) {
    doc.setFillColor(255, 243, 205);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('REGISTRO DE TESTE — não impacta relatórios oficiais', margin + 3, y + 5.5);
    y += 12;
  }

  const rows: Array<[string, string, string, string]> = [
    ['Funcionário', data.mecanicoNome, 'Empresa/filial', [data.empresa, data.filial].filter(Boolean).join(' — ')],
    ['Veículo/placa', data.placa || '-', 'Posto', data.postoNome || '-'],
    ['CNPJ do posto', data.postoCnpj || '-', 'Combustível', data.combustivel || '-'],
    ['Valor', money(data.valor), 'Litros', `${decimal(data.litros)} L`],
    ['Preço por litro', money(data.precoLitro), 'KM/odômetro', data.km || '-'],
    ['Endereço do posto', data.postoEndereco || '-', 'Observação', data.observacao || '-'],
  ];

  const colWidth = contentWidth / 2;
  rows.forEach(([labelA, valueA, labelB, valueB]) => {
    doc.setDrawColor(205);
    doc.rect(margin, y, colWidth, 15);
    doc.rect(margin + colWidth, y, colWidth, 15);
    [[labelA, valueA, margin], [labelB, valueB, margin + colWidth]].forEach(([label, value, x]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(90);
      doc.text(String(label), Number(x) + 3, y + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0);
      const lines = doc.splitTextToSize(String(value), colWidth - 6).slice(0, 2);
      doc.text(lines, Number(x) + 3, y + 10);
    });
    y += 15;
  });

  y += 8;
  const photoGap = 6;
  const photoWidth = (contentWidth - photoGap) / 2;
  addPhoto(doc, fotoBomba, 'Foto da bomba', margin, y, photoWidth, 82);
  addPhoto(doc, fotoPainel, 'Foto do painel / KM', margin + photoWidth + photoGap, y, photoWidth, 82);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100);
  doc.text('Comprovante interno gerado pelo app mecânico TOPAC RH PRO.', margin, 290);

  const fileName = `ABASTECIMENTO_${cleanFilePart(data.empresa)}_${cleanFilePart(data.placa || data.mecanicoNome)}_${data.createdAt.toISOString().slice(0, 10)}.pdf`;
  return { blob: doc.output('blob'), fileName };
};
