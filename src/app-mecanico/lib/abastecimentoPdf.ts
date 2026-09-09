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
  createdAt: Date;
};

const imageData = async (source: string): Promise<string | null> => {
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

const formatMoney = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "-";

const formatNumber = (value?: number | null, digits = 2) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "-";

const photoFormat = (source: string) => source.toLowerCase().includes("png") ? "PNG" : "JPEG";

export async function gerarCupomAbastecimentoPdf(data: AbastecimentoReceiptData) {
  const [bomba, painel, qr] = await Promise.all([
    imageData(data.fotoBombaUrl),
    imageData(data.fotoPainelUrl),
    data.codigo ? QRCode.toDataURL(data.codigo, { margin: 0, width: 220 }) : Promise.resolve(null),
  ]);

  // Modelo visual aprovado: recibo vertical, limpo, com dados grandes e as duas fotos lado a lado.
  const pdf = new jsPDF({ unit: "mm", format: [148, 210], orientation: "portrait" });
  const pageW = 148;
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

  const metric = (label: string, value: string) => {
    const h = 14.5;
    pdf.setDrawColor(215);
    pdf.setFillColor(249, 249, 249);
    pdf.roundedRect(margin, y, contentW, h, 1.8, 1.8, "FD");

    pdf.setTextColor(55);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text(label, margin + 7, y + 9.1);

    pdf.setTextColor(5);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text(value, pageW - margin - 7, y + 10.3, { align: "right" });
    y += h + 2.2;
  };

  const addPhotoBox = (title: string, source: string | null, x: number, boxW: number, boxH: number) => {
    pdf.setTextColor(30);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(title, x + boxW / 2, y, { align: "center" });

    const top = y + 3.3;
    pdf.setDrawColor(180);
    pdf.setFillColor(246, 246, 246);
    pdf.roundedRect(x, top, boxW, boxH, 1.8, 1.8, "FD");

    if (!source) {
      pdf.setTextColor(120);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.text("Foto indisponível", x + boxW / 2, top + boxH / 2, { align: "center" });
      return;
    }

    try {
      const props = pdf.getImageProperties(source);
      const innerW = boxW - 2.2;
      const innerH = boxH - 2.2;
      const ratio = Math.min(innerW / props.width, innerH / props.height);
      const drawW = props.width * ratio;
      const drawH = props.height * ratio;
      const drawX = x + (boxW - drawW) / 2;
      const drawY = top + (boxH - drawH) / 2;
      pdf.addImage(source, photoFormat(source), drawX, drawY, drawW, drawH, undefined, "FAST");
    } catch {
      pdf.setTextColor(120);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.text("Foto indisponível", x + boxW / 2, top + boxH / 2, { align: "center" });
    }
  };

  // Cabeçalho
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
  y += 5;

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
      const addressLines = pdf.splitTextToSize(data.postoEndereco, 82);
      pdf.text(addressLines, margin, postoY);
      postoY += addressLines.length * 3.2;
    }
    y = Math.max(y + 13, postoY + 1.5);
  }

  rule(y, true);
  y += 5;

  // Dados do funcionário e veículo
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

  // Números principais — exatamente como na foto/modelo aprovado.
  metric("Total a pagar", formatMoney(data.valor));
  metric("Litros", `${formatNumber(data.litros, 3)} L`);
  metric("Preço por litro", formatMoney(data.valorPorLitro));
  metric("KM", data.kmAtual != null ? `${formatNumber(data.kmAtual, 0)} km` : "-");

  // Provas fotográficas lado a lado.
  const photoGap = 5;
  const photoW = (contentW - photoGap) / 2;
  const photoH = 43;
  addPhotoBox("Foto da bomba", bomba, margin, photoW, photoH);
  addPhotoBox("Foto do painel / KM", painel, margin + photoW + photoGap, photoW, photoH);
  y += photoH + 9;

  rule(y, true);
  y += 4;

  // Rodapé / protocolo
  pdf.setTextColor(65);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.8);
  if (data.codigo) pdf.text(`Protocolo: ${data.codigo}`, margin, y + 3.5);
  pdf.text(`Registro: ${data.id || "SALVO"}`, margin, y + 7.2);

  if (qr) {
    pdf.addImage(qr, "PNG", pageW - margin - 17, y - 1, 17, 17);
  }

  if (viagem) {
    pdf.setTextColor(10);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.1);
    pdf.text("APRESENTAR RECIBO DO POSTO PARA REEMBOLSO", pageW / 2, 204, { align: "center" });
  } else {
    pdf.setTextColor(95);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.2);
    pdf.text("Comprovante gerado automaticamente pelo TOPAC RH PRO", pageW / 2, 204, { align: "center" });
  }

  const safe = (data.placa || data.mecanicoNome || "abastecimento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");

  return {
    blob: pdf.output("blob"),
    fileName: `COMPROVANTE-ABASTECIMENTO-${safe}.pdf`,
  };
}
