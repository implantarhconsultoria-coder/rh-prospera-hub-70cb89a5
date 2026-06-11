import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export type AbastecimentoReceiptData = {
  id?: string;
  codigo?: string;
  postoNome: string;
  postoCnpj?: string;
  mecanicoNome: string;
  empresa: string;
  filial?: string;
  placa: string;
  veiculo?: string;
  combustivel: string;
  valor: string;
  litros: string;
  precoLitro: string;
  km: string;
  observacao?: string;
  fotoBombaUrl: string;
  fotoPainelUrl: string;
  createdAt: Date;
};

const parseDecimal = (value: string) => {
  const raw = String(value || '').trim().replace(/[^\d,.-]/g, '');
  return Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
};
const money = (value: string) => Number.isFinite(parseDecimal(value))
  ? parseDecimal(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : value;
const number = (value: string, digits: number) => Number.isFinite(parseDecimal(value))
  ? parseDecimal(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : value;

const imageData = async (source: string): Promise<string | null> => {
  if (!source) return null;
  if (source.startsWith('data:image/')) return source;
  try {
    const response = await fetch(source);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export async function gerarCupomAbastecimentoPdf(data: AbastecimentoReceiptData) {
  const [bomba, painel, qr] = await Promise.all([
    imageData(data.fotoBombaUrl),
    imageData(data.fotoPainelUrl),
    data.codigo ? QRCode.toDataURL(data.codigo, { margin: 0, width: 180 }) : Promise.resolve(null),
  ]);
  const height = 285;
  const pdf = new jsPDF({ unit: 'mm', format: [80, height], orientation: 'portrait' });
  const center = 40;
  let y = 8;
  const line = () => { pdf.setDrawColor(130); pdf.setLineDashPattern([1, 1], 0); pdf.line(5, y, 75, y); y += 4; };
  const centered = (text: string, size = 9, bold = false) => {
    pdf.setFont('courier', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.text(text, center, y, { align: 'center' }); y += size * 0.42 + 1.5;
  };
  const row = (label: string, value: string) => {
    pdf.setFont('courier', 'bold'); pdf.setFontSize(7.5); pdf.text(`${label}:`, 6, y);
    pdf.setFont('courier', 'normal');
    const lines = pdf.splitTextToSize(value || '-', 43);
    pdf.text(lines, 31, y); y += Math.max(4, lines.length * 3.2);
  };

  centered('TOPAC RH PRO', 12, true);
  centered('RECIBO DE ABASTECIMENTO', 9, true);
  centered(data.createdAt.toLocaleString('pt-BR'), 7);
  line();
  row('POSTO', data.postoNome);
  if (data.postoCnpj) row('CNPJ', data.postoCnpj);
  row('FUNCIONARIO', data.mecanicoNome);
  row('EMPRESA/FILIAL', [data.empresa, data.filial].filter(Boolean).join(' - '));
  row('VEICULO/PLACA', [data.veiculo, data.placa].filter(Boolean).join(' / '));
  row('COMBUSTIVEL', data.combustivel);
  line();
  centered(`TOTAL     ${money(data.valor)}`, 10, true);
  centered(`LITROS    ${number(data.litros, 3)} L`, 9, true);
  centered(`PRECO/L   ${money(data.precoLitro)}`, 9, true);
  centered(`KM        ${data.km || '-'}`, 9, true);
  line();
  if (data.observacao) row('OBSERVACAO', data.observacao);
  row('REGISTRO', data.id || 'SALVO');
  row('IDENTIFICACAO', data.mecanicoNome);

  const addPhoto = (title: string, source: string | null) => {
    centered(title, 7, true);
    if (source) {
      pdf.addImage(source, source.includes('png') ? 'PNG' : 'JPEG', 8, y, 64, 42, undefined, 'FAST');
      y += 46;
    } else {
      centered('Foto indisponivel no momento da emissao', 6);
    }
  };
  addPhoto('FOTO DA BOMBA', bomba);
  addPhoto('FOTO DO PAINEL / KM', painel);
  if (qr) {
    pdf.addImage(qr, 'PNG', 29, y, 22, 22); y += 24;
    centered('QR / CHAVE DO POSTO', 6, true);
    centered(data.codigo || '', 6);
  }
  line();
  centered('CONFIRMO OS DADOS ACIMA', 7, true);
  centered('Assinatura/identificacao digital do usuario', 5.5);
  centered(data.mecanicoNome, 7);

  const safe = (data.placa || data.mecanicoNome || 'abastecimento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return { blob: pdf.output('blob'), fileName: `RECIBO-ABASTECIMENTO-${safe}.pdf` };
}
