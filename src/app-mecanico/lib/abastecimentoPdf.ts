import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export type AbastecimentoReceiptData = {
  id?: string;
  codigo?: string;
  postoNome: string;
  postoCnpj?: string;
  postoEndereco?: string;
  mecanicoNome: string;
  empresa: string;
  filial?: string;
  placa: string;
  veiculo?: string;
  combustivel?: string;
  valor?: number;
  litros?: number;
  valorPorLitro?: number | null;
  kmAtual?: number | null;
  fotoBombaUrl: string;
  fotoPainelUrl: string;
  fotoReciboUrl?: string;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: Date;
};

const imageData = async (source?: string): Promise<string | null> => {
  if (!source) return null;
  if (source.startsWith("data:image/")) return source;
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

const photoFormat = (source: string) => source.toLowerCase().includes("png") ? "PNG" : "JPEG";

export async function gerarCupomAbastecimentoPdf(data: AbastecimentoReceiptData) {
  const [bomba, painel, reciboPosto, qr] = await Promise.all([
    imageData(data.fotoBombaUrl),
    imageData(data.fotoPainelUrl),
    imageData(data.fotoReciboUrl),
    data.codigo ? QRCode.toDataURL(data.codigo, { margin: 0, width: 220 }) : Promise.resolve(null),
  ]);

  const pageW = 148;
  const pageH = 285;
  const pdf = new jsPDF({ unit: "mm", format: [pageW, pageH], orientation: "portrait" });
  const margin = 10;
  const contentW = pageW - margin * 2;
  const viagem = /VIAGEM|POSTO EXTERNO/i.test(data.postoNome || "");
  let y = 11;

  const rule = (atY = y, light = false) => {
    pdf.setDrawColor(light ? 210 : 95);
    pdf.setLineWidth(light ? 0.2 : 0.35);
    pdf.line(margin, atY, pageW - margin, atY);
  };

  const labelValue = (label: string, value: string, x: number, width: number) => {
    pdf.setTextColor(90);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.6);
    pdf.text(label.toUpperCase(), x, y);
    pdf.setTextColor(20);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.2);
    const lines = pdf.splitTextToSize(value || "-", width);
    pdf.text(lines, x, y + 4.2);
    return Math.max(8, lines.length * 3.7 + 4.5);
  };

  const addPhotoBox = (
    title: string,
    subtitle: string,
    source: string | null,
    x: number,
    boxW: number,
    boxH: number,
  ) => {
    pdf.setTextColor(20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.2);
    pdf.text(title, x + boxW / 2, y, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(95);
    pdf.setFontSize(6.2);
    pdf.text(subtitle, x + boxW / 2, y + 3.4, { align: "center" });

    const top = y + 6;
    pdf.setDrawColor(180);
    pdf.setFillColor(246, 246, 246);
    pdf.roundedRect(x, top, boxW, boxH, 1.8, 1.8, "FD");

    if (!source) {
      pdf.setTextColor(120);
      pdf.setFontSize(7);
      pdf.text("Foto indisponível", x + boxW / 2, top + boxH / 2, { align: "center" });
      return;
    }

    try {
      const props = pdf.getImageProperties(source);
      const innerW = boxW - 2.4;
      const innerH = boxH - 2.4;
      const ratio = Math.min(innerW / props.width, innerH / props.height);
      const drawW = props.width * ratio;
      const drawH = props.height * ratio;
      const drawX = x + (boxW - drawW) / 2;
      const drawY = top + (boxH - drawH) / 2;
      pdf.addImage(source, photoFormat(source), drawX, drawY, drawW, drawH, undefined, "FAST");
    } catch {
      pdf.setTextColor(120);
      pdf.setFontSize(7);
      pdf.text("Foto indisponível", x + boxW / 2, top + boxH / 2, { align: "center" });
    }
  };

  pdf.setTextColor(5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("COMPROVANTE DE ABASTECIMENTO", pageW / 2, y, { align: "center" });
  y += 7;
  rule();
  y += 5;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text("TOPAC RH PRO", margin, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(75);
  const dateText = data.createdAt.toLocaleDateString("pt-BR");
  const timeText = data.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  pdf.text(`Data: ${dateText}`, pageW - margin, y - 0.4, { align: "right" });
  pdf.text(`Hora: ${timeText}`, pageW - margin, y + 4.2, { align: "right" });
  y += 7;

  if (viagem) {
    pdf.setDrawColor(35);
    pdf.setFillColor(252, 252, 252);
    pdf.roundedRect(margin, y, contentW, 16, 1.8, 1.8, "FD");
    pdf.setTextColor(10);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.2);
    pdf.text("ABASTECIMENTO EM VIAGEM", pageW / 2, y + 5.2, { align: "center" });
    pdf.setFontSize(8.2);
    pdf.text("APRESENTAR RECIBO DO POSTO PARA REEMBOLSO", pageW / 2, y + 11.1, { align: "center" });
    y += 21;
  } else {
    pdf.setTextColor(25);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text(data.postoNome || "POSTO", margin, y + 4);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(80);
    pdf.setFontSize(7.1);
    let postoY = y + 8.2;
    if (data.postoCnpj) {
      pdf.text(`CNPJ: ${data.postoCnpj}`, margin, postoY);
      postoY += 3.6;
    }
    if (data.postoEndereco) {
      const addressLines = pdf.splitTextToSize(data.postoEndereco, 105);
      pdf.text(addressLines, margin, postoY);
      postoY += addressLines.length * 3.2;
    }
    y = Math.max(y + 13, postoY + 1.5);
  }

  rule(y, true);
  y += 5;

  const colGap = 5;
  const colW = (contentW - colGap) / 2;
  const h1 = labelValue("Funcionário", data.mecanicoNome, margin, colW);
  const savedY = y;
  const h2 = labelValue("Empresa / Filial", [data.empresa, data.filial].filter(Boolean).join(" - "), margin + colW + colGap, colW);
  y = savedY + Math.max(h1, h2) + 1.5;

  const yRow2 = y;
  const h3 = labelValue("Veículo / Placa", [data.veiculo, data.placa].filter(Boolean).join(" / "), margin, colW);
  y = yRow2;
  const h4 = labelValue("Combustível", data.combustivel || "-", margin + colW + colGap, colW);
  y = yRow2 + Math.max(h3, h4) + 3;

  if (data.latitude != null && data.longitude != null) {
    pdf.setTextColor(80);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.6);
    pdf.text(`GPS: ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`, margin, y);
    y += 5;
  }

  pdf.setDrawColor(190);
  pdf.setFillColor(249, 249, 249);
  pdf.roundedRect(margin, y, contentW, 13, 1.8, 1.8, "FD");
  pdf.setTextColor(20);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text("REGISTRO POR 3 FOTOS", pageW / 2, y + 5, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(80);
  pdf.setFontSize(6.8);
  pdf.text("Bomba + painel/KM + recibo original do posto.", pageW / 2, y + 9.5, { align: "center" });
  y += 19;

  const photoGap = 5;
  const photoW = (contentW - photoGap) / 2;
  const photoH = 44;
  addPhotoBox("FOTO DA BOMBA", "Valor • Litros • Preço/L", bomba, margin, photoW, photoH);
  addPhotoBox("FOTO DO PAINEL", "KM / Hodômetro", painel, margin + photoW + photoGap, photoW, photoH);
  y += photoH + 13;

  addPhotoBox("RECIBO ORIGINAL DO POSTO", "Documento principal do abastecimento", reciboPosto, margin, contentW, 78);
  y += 91;

  rule(y, true);
  y += 4;
  pdf.setTextColor(65);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.8);
  if (data.codigo) pdf.text(`Protocolo: ${data.codigo}`, margin, y + 3.5);
  pdf.text(`Registro: ${data.id || "SALVO"}`, margin, y + 7.2);
  if (qr) pdf.addImage(qr, "PNG", pageW - margin - 17, y - 1, 17, 17);

  pdf.setTextColor(viagem ? 10 : 95);
  pdf.setFont("helvetica", viagem ? "bold" : "normal");
  pdf.setFontSize(viagem ? 7.1 : 6.2);
  pdf.text(
    viagem ? "APRESENTAR RECIBO DO POSTO PARA REEMBOLSO" : "Comprovante fotográfico gerado pelo TOPAC RH PRO",
    pageW / 2,
    pageH - 6,
    { align: "center" },
  );

  const safe = (data.placa || data.mecanicoNome || "abastecimento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");

  return { blob: pdf.output("blob"), fileName: `COMPROVANTE-ABASTECIMENTO-${safe}.pdf` };
}
