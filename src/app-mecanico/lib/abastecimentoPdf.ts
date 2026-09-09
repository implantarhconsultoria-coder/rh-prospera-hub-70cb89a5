import { jsPDF } from "jspdf";
import QRCode from "qrcode";

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

export async function gerarCupomAbastecimentoPdf(data: AbastecimentoReceiptData) {
  const [bomba, painel, qr] = await Promise.all([
    imageData(data.fotoBombaUrl),
    imageData(data.fotoPainelUrl),
    data.codigo ? QRCode.toDataURL(data.codigo, { margin: 0, width: 180 }) : Promise.resolve(null),
  ]);

  const pdf = new jsPDF({ unit: "mm", format: [80, 260], orientation: "portrait" });
  const center = 40;
  let y = 8;
  const viagem = /VIAGEM|POSTO EXTERNO/i.test(data.postoNome || "");

  const line = () => {
    pdf.setDrawColor(130);
    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(5, y, 75, y);
    y += 4;
  };

  const centered = (text: string, size = 9, bold = false) => {
    pdf.setFont("courier", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.text(text, center, y, { align: "center" });
    y += size * 0.42 + 1.5;
  };

  const row = (label: string, value: string) => {
    pdf.setFont("courier", "bold");
    pdf.setFontSize(7.5);
    pdf.text(`${label}:`, 6, y);
    pdf.setFont("courier", "normal");
    const lines = pdf.splitTextToSize(value || "-", 43);
    pdf.text(lines, 31, y);
    y += Math.max(4, lines.length * 3.2);
  };

  const addPhoto = (title: string, source: string | null) => {
    centered(title, 8, true);
    if (source) {
      pdf.addImage(source, source.includes("png") ? "PNG" : "JPEG", 6, y, 68, 52, undefined, "FAST");
      y += 56;
    } else {
      centered("Foto indisponivel", 7);
    }
  };

  const travelNotice = () => {
    pdf.setDrawColor(0);
    pdf.setLineDashPattern([], 0);
    pdf.rect(6, y, 68, 16);
    y += 5;
    centered("ABASTECIMENTO EM VIAGEM", 8, true);
    centered("APRESENTAR RECIBO DO POSTO", 7.5, true);
    centered("PARA REEMBOLSO", 7.5, true);
    y += 3;
  };

  centered("TOPAC RH PRO", 12, true);
  centered("COMPROVANTE DE ABASTECIMENTO", 8.5, true);
  centered(data.createdAt.toLocaleString("pt-BR"), 7);
  line();

  if (viagem) {
    row("MODALIDADE", "VIAGEM / POSTO EXTERNO");
    travelNotice();
  } else {
    row("POSTO", data.postoNome);
    if (data.postoCnpj) row("CNPJ", data.postoCnpj);
  }

  row("FUNCIONARIO", data.mecanicoNome);
  row("EMPRESA/FILIAL", [data.empresa, data.filial].filter(Boolean).join(" - "));
  row("VEICULO/PLACA", [data.veiculo, data.placa].filter(Boolean).join(" / "));
  line();
  row("COMBUSTIVEL", data.combustivel || "-");
  row("LITROS", `${formatNumber(data.litros, 3)} L`);
  row("VALOR", formatMoney(data.valor));
  row("PRECO/L", formatMoney(data.valorPorLitro));
  row("KM", data.kmAtual != null ? formatNumber(data.kmAtual, 0) : "-");
  line();
  addPhoto("FOTO DA BOMBA", bomba);
  addPhoto("FOTO DO PAINEL / KM", painel);

  if (qr) {
    pdf.addImage(qr, "PNG", 31, y, 18, 18);
    y += 20;
    centered(data.codigo || "", 6);
  }

  line();
  row("REGISTRO", data.id || "SALVO");
  if (viagem) centered("APRESENTAR RECIBO DO POSTO PARA REEMBOLSO", 6.5, true);
  centered("Comprovante gerado automaticamente", 6);

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
