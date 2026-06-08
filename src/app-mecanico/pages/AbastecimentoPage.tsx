import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Fuel, Loader2, QrCode, Share2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import QrScanner from "qr-scanner";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getBrowserLocation } from "@/lib/browserGeo";
import CameraCapture from "../components/CameraCapture";
import { useMecanicoApp } from "../MecanicoAppContext";
import { uploadFoto } from "../lib/upload";

type Step = "scan" | "form" | "ok";

interface Posto {
  id: string;
  codigo: string;
  nome: string;
  unidade?: string | null;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  tipo_qr?: string | null;
}

interface VeiculoInfo {
  ativo_id?: string | null;
  placa: string;
  descricao?: string | null;
  renavam?: string | null;
  chassi?: string | null;
  ano_fabricacao?: string | null;
  ano_modelo?: string | null;
  documento_url?: string | null;
}

interface MecInfo {
  nome: string;
  empresa: string;
  filial: string;
  placa?: string | null;
  carros?: string[];
  veiculos?: VeiculoInfo[];
  exige_selecao_carro?: boolean;
  ultimo_km?: number | null;
  registro_teste?: boolean;
  veiculo_teste?: string;
}

interface ReceiptInfo {
  id: string;
  codigo: string;
  postoNome: string;
  postoCnpj: string;
  postoEndereco: string;
  postoTelefone: string;
  mecanicoNome: string;
  empresa: string;
  empresaCnpj: string;
  filial: string;
  placa: string;
  combustivel: string;
  valor: string;
  litros: string;
  precoLitro: string;
  km: string;
  kmRodado: number | null;
  observacao: string;
  fotoQrUrl: string;
  fotoBombaUrl: string;
  fotoPainelUrl: string;
  createdAt: Date;
  registroTeste?: boolean;
}

type OcrResult = {
  ok?: boolean;
  valor?: string | number;
  litros?: string | number;
  valor_por_litro?: string | number;
  combustivel?: string;
  km?: string | number;
  km_atual?: string | number;
  confianca?: number;
  motivo?: string;
  error?: string;
  origem?: string;
  ocr_texto_bruto?: string;
};

const CANONICAL_BASE_URL = "https://topacrh.pro";
const UNKNOWN = "Nao identificado";
const supabaseRpc = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export default function AbastecimentoPage() {
  const { mecanico } = useMecanicoApp();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>("scan");
  const [posto, setPosto] = useState<Posto | null>(null);
  const [postosOpcao, setPostosOpcao] = useState<Posto[]>([]);
  const [mecInfo, setMecInfo] = useState<MecInfo | null>(null);
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [camQr, setCamQr] = useState(false);
  const [camBomba, setCamBomba] = useState(false);
  const [camPainel, setCamPainel] = useState(false);
  const [fotoQrUrl, setFotoQrUrl] = useState("");
  const [fotoBombaUrl, setFotoBombaUrl] = useState("");
  const [fotoPainelUrl, setFotoPainelUrl] = useState("");
  const [valor, setValor] = useState("");
  const [litros, setLitros] = useState("");
  const [precoLitro, setPrecoLitro] = useState("");
  const [combustivel, setCombustivel] = useState("");
  const [placa, setPlaca] = useState("");
  const [carros, setCarros] = useState<string[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoInfo[]>([]);
  const [km, setKm] = useState("");
  const [obs, setObs] = useState("");
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [receiptPdf, setReceiptPdf] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [dataHoraAtual, setDataHoraAtual] = useState(() => new Date());
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoQrRef = useRef("");

  const isSecure = typeof window !== "undefined" && (window.isSecureContext || window.location.hostname === "localhost");
  const isCanonicalHost = typeof window !== "undefined" && window.location.origin === CANONICAL_BASE_URL;
  const canonicalUrl = useMemo(() => {
    if (typeof window === "undefined") return CANONICAL_BASE_URL;
    return `${CANONICAL_BASE_URL}${window.location.pathname}${window.location.search}${window.location.hash}`;
  }, []);
  const kmRodado = useMemo(() => {
    const atual = parseDecimal(km);
    const anterior = mecInfo?.ultimo_km;
    if (!Number.isFinite(atual) || typeof anterior !== "number") return null;
    const diff = atual - anterior;
    return diff >= 0 ? diff : null;
  }, [km, mecInfo?.ultimo_km]);
  const veiculoSelecionado = useMemo(() => {
    const atual = normalizePlate(placa);
    if (!atual) return null;
    return veiculos.find((v) => normalizePlate(v.placa) === atual) || null;
  }, [placa, veiculos]);
  const empresaCnpj = (mecInfo as { cnpj?: string } | null)?.cnpj || (mecanico as unknown as { cnpj?: string }).cnpj || "";

  useEffect(() => {
    const id = window.setInterval(() => setDataHoraAtual(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const updateValor = (value: string) => {
    setValor(value);
    const nValor = parseDecimal(value);
    const nLitros = parseDecimal(litros);
    if (Number.isFinite(nValor) && Number.isFinite(nLitros) && nLitros > 0) {
      setPrecoLitro(formatDecimal(nValor / nLitros, 3));
    }
  };

  const updateLitros = (value: string) => {
    setLitros(value);
    const nLitros = parseDecimal(value);
    const nPreco = parseDecimal(precoLitro);
    const nValor = parseDecimal(valor);
    if (Number.isFinite(nLitros) && nLitros > 0 && Number.isFinite(nPreco) && nPreco > 0) {
      setValor(formatDecimal(nLitros * nPreco, 2));
    } else if (Number.isFinite(nLitros) && nLitros > 0 && Number.isFinite(nValor) && nValor > 0) {
      setPrecoLitro(formatDecimal(nValor / nLitros, 3));
    }
  };

  const updatePrecoLitro = (value: string) => {
    setPrecoLitro(value);
    const nLitros = parseDecimal(litros);
    const nPreco = parseDecimal(value);
    if (Number.isFinite(nLitros) && nLitros > 0 && Number.isFinite(nPreco) && nPreco > 0) {
      setValor(formatDecimal(nLitros * nPreco, 2));
    }
  };

  useEffect(() => {
    const qr = searchParams.get("qr") || searchParams.get("codigo") || "";
    const normalized = extractQrCode(qr);
    if (normalized && autoQrRef.current !== normalized) {
      autoQrRef.current = normalized;
      setCodigo(normalized);
      validarQr(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, mecanico.acesso_id]);

  const stopScanner = () => {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setScanning(false);
  };

  const abrirFluxoComDadosDisponiveis = (cod?: string) => {
    const normalized = extractQrCode(cod || codigo) || "QR-NAO-LIDO";
    setCodigo(normalized);
    setScanError("");
    setPostosOpcao([]);
    setPosto({
      id: "posto-nao-identificado",
      codigo: normalized,
      nome: UNKNOWN,
      unidade: mecanico.filial || mecanico.empresa || "",
      cnpj: null,
      endereco: null,
      telefone: null,
      tipo_qr: "posto",
    });
    setMecInfo(null);
    setCarros([]);
    setVeiculos([]);
    setPlaca("");
    setStep("form");
  };

  const iniciarScanner = async () => {
    setScanError("");
    if (typeof window !== "undefined" && window.location.hostname !== "localhost" && !isCanonicalHost) {
      window.location.assign(canonicalUrl);
      return;
    }
    if (!isSecure || !navigator.mediaDevices?.getUserMedia) {
      setScanError(`Abra pelo endereco seguro ${CANONICAL_BASE_URL} ou digite o codigo manualmente.`);
      return;
    }
    try {
      stopScanner();
      const scanner = new QrScanner(
        videoRef.current!,
        (result) => {
          const decoded = typeof result === "string" ? result : result.data;
          stopScanner();
          const normalized = extractQrCode(decoded);
          setCodigo(normalized);
          validarQr(normalized);
        },
        { preferredCamera: "environment", returnDetailedScanResult: true, maxScansPerSecond: 8 },
      );
      scannerRef.current = scanner;
      await scanner.start();
      setScanning(true);
    } catch {
      setScanError("Nao foi possivel abrir a camera. Use a galeria ou digite o codigo manualmente.");
    }
  };

  const lerArquivoQr = async (file: File) => {
    try {
      const uploadBlob = await optimizeImageBlob(file, 1400, 0.78);
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "qr", uploadBlob);
      setFotoQrUrl(url);
      try {
        const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true });
        const decoded = typeof result === "string" ? result : result.data;
        const normalized = extractQrCode(decoded);
        setCodigo(normalized);
        const ok = await validarQr(normalized);
        if (!ok) abrirFluxoComDadosDisponiveis(normalized);
      } catch {
        abrirFluxoComDadosDisponiveis("QR-NAO-LIDO");
        toast.warning("Foto do QR Code salva. O recibo sera gerado com os dados disponiveis.");
      }
    } catch {
      setScanError("Nao foi possivel ler o QR da imagem. Tente outra foto ou digite o codigo.");
    }
  };

  const onCaptureQr = async (blob: Blob) => {
    setLoading(true);
    try {
      const uploadBlob = await optimizeImageBlob(blob, 1400, 0.78);
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "qr", uploadBlob);
      setFotoQrUrl(url);
      try {
        const qrFile = new File([blob], "qr-code.jpg", { type: blob.type || "image/jpeg" });
        const result = await QrScanner.scanImage(qrFile, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true });
        const decoded = typeof result === "string" ? result : result.data;
        const normalized = extractQrCode(decoded);
        setCodigo(normalized);
        const ok = await validarQr(normalized);
        if (ok) toast.success("QR Code lido e foto anexada.");
        else abrirFluxoComDadosDisponiveis(normalized);
      } catch {
        abrirFluxoComDadosDisponiveis("QR-NAO-LIDO");
        toast.warning("Foto do QR Code salva. O recibo sera gerado com os dados disponiveis.");
      }
    } catch (e) {
      toast.error(getErrorMessage(e) || "Erro no upload da foto do QR Code");
    } finally {
      setLoading(false);
    }
  };

  const validarQr = async (cod: string) => {
    const normalized = extractQrCode(cod);
    if (!normalized.trim()) {
      toast.error("Informe o codigo do QR");
      return false;
    }
    setLoading(true);
    const { data, error } = await supabaseRpc.rpc("app_mecanico_validar_qr_posto", {
      p_acesso_id: mecanico.acesso_id,
      p_codigo: normalized,
    });
    setLoading(false);
    const r = (data ?? null) as { ok?: boolean; error?: string; posto?: Posto; postos?: Posto[]; mecanico?: MecInfo } | null;
    if (error || !r?.ok || !r.posto) {
      const msg = r?.error === "qr_nao_encontrado" ? "QR Code do posto nao encontrado." : "Erro ao validar QR Code.";
      setScanError(msg);
      toast.error(msg);
      return false;
    }
    const veiculosInfo = (r.mecanico?.veiculos || [])
      .map((item) => ({ ...item, placa: normalizePlate(item.placa) }))
      .filter((item) => Boolean(item.placa));
    const placas = (veiculosInfo.length ? veiculosInfo.map((item) => item.placa) : (r.mecanico?.carros || []))
      .map((item) => normalizePlate(item))
      .filter(Boolean);
    const placaInicial = r.mecanico?.placa || (!r.mecanico?.exige_selecao_carro && placas.length === 1 ? placas[0] : "");
    const options = (r.postos || []).filter(Boolean);
    setPostosOpcao(options);
    setPosto(options.length === 1 ? options[0] : r.posto);
    setMecInfo(r.mecanico || null);
    setCarros(placas);
    setVeiculos(veiculosInfo);
    setPlaca((placaInicial || "").toUpperCase());
    setStep("form");
    return true;
  };

  const analisarFoto = async (blob: Blob, tipo: "bomba" | "painel_km" = "bomba") => {
    const dataUrls = tipo === "painel_km" ? await buildPanelOcrDataUrls(blob) : [await blobToOptimizedDataUrl(blob)];
    const dataUrl = dataUrls[0];
    let remoto: OcrResult | null = null;
    try {
      const { data, error } = await supabase.functions.invoke("ocr-bomba-combustivel", { body: { dataUrl, tipo } });
      remoto = error ? ({ ok: false, error: error.message, origem: "supabase" } as OcrResult) : ((data as OcrResult | null) || null);
    } catch (e) {
      console.error("Erro OCR abastecimento:", e);
    }

    if (tipo === "painel_km" && isReliableKmResult(remoto)) return remoto;
    if (tipo === "bomba" && isReliablePumpResult(remoto)) return remoto;

    const local = await analisarFotoLocal(dataUrls, tipo);
    const merged = mergeOcrResult(remoto, local, tipo);
    if (tipo === "painel_km") return isReliableKmResult(merged) ? merged : { ...(merged || {}), ok: false, motivo: "Leitura do KM sem confianca suficiente." };
    return isReliablePumpResult(merged) ? merged : { ...(merged || {}), ok: false, motivo: "Leitura da bomba sem confianca suficiente." };
  };

  const aplicarLeituraBomba = (r: OcrResult | null) => {
    if (!isReliablePumpResult(r)) return false;
    const nValor = parseDecimal(r.valor);
    const nLitros = parseDecimal(r.litros);
    const nPreco = parseDecimal(r.valor_por_litro);
    let valorFinal = Number.isFinite(nValor) && nValor > 0 ? nValor : NaN;
    let litrosFinal = Number.isFinite(nLitros) && nLitros > 0 ? nLitros : NaN;
    let precoFinal = Number.isFinite(nPreco) && nPreco > 0 ? nPreco : NaN;

    if (!Number.isFinite(precoFinal) && Number.isFinite(valorFinal) && Number.isFinite(litrosFinal) && litrosFinal > 0) {
      precoFinal = valorFinal / litrosFinal;
    }
    if (!Number.isFinite(valorFinal) && Number.isFinite(litrosFinal) && Number.isFinite(precoFinal)) {
      valorFinal = litrosFinal * precoFinal;
    }
    if (!Number.isFinite(litrosFinal) && Number.isFinite(valorFinal) && Number.isFinite(precoFinal) && precoFinal > 0) {
      litrosFinal = valorFinal / precoFinal;
    }

    let preenchidos = 0;
    if (Number.isFinite(valorFinal) && valorFinal > 0) { setValor(formatDecimal(valorFinal, 2)); preenchidos++; }
    if (Number.isFinite(litrosFinal) && litrosFinal > 0) { setLitros(formatDecimal(litrosFinal, 3)); preenchidos++; }
    if (Number.isFinite(precoFinal) && precoFinal > 0) { setPrecoLitro(formatDecimal(precoFinal, 3)); preenchidos++; }
    const combustivelLido = normalizeCombustivel(r.combustivel);
    if (combustivelLido) { setCombustivel(combustivelLido); preenchidos++; }
    return preenchidos >= 2;
  };

  const onCaptureBomba = async (blob: Blob) => {
    setLoading(true);
    try {
      const uploadBlob = await optimizeImageBlob(blob, 1600, 0.8);
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "bomba", uploadBlob);
      setFotoBombaUrl(url);
      const r = await analisarFoto(uploadBlob);
      const leituraAplicada = aplicarLeituraBomba(r);
      if (leituraAplicada) {
        toast.success("Bomba lida com seguranca: valor, litros e preco preenchidos.");
      } else {
        toast.warning(r?.motivo || "Foto da bomba salva. O recibo sera gerado com os dados disponiveis.");
      }
    } catch (e) {
      toast.error(getErrorMessage(e) || "Erro no upload da bomba");
    } finally {
      setLoading(false);
    }
  };

  const onCapturePainel = async (blob: Blob) => {
    setLoading(true);
    try {
      const uploadBlob = await optimizeImageBlob(blob, 1600, 0.82);
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "painel", uploadBlob);
      setFotoPainelUrl(url);
      const r = await analisarFoto(uploadBlob, "painel_km");
      const detectedKm = r?.km ?? r?.km_atual;
      const kmLido = parseDecimal(detectedKm);
      if (isReliableKmResult(r) && Number.isFinite(kmLido) && kmLido > 0) {
        setKm(String(Math.round(kmLido)));
        toast.success("KM do painel lido com seguranca e preenchido automaticamente.");
      } else {
        toast.warning(r?.motivo || "Foto do painel salva. O recibo sera gerado com os dados disponiveis.");
      }
    } catch (e) {
      toast.error(getErrorMessage(e) || "Erro no upload do KM");
    } finally {
      setLoading(false);
    }
  };

  const finalizar = async () => {
    if (!fotoQrUrl) return toast.error("Foto do QR Code obrigatoria.");
    if (!fotoBombaUrl || !fotoPainelUrl) return toast.error("Fotos obrigatorias: bomba e KM/painel.");
    setLoading(true);
    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const loc = await getBrowserLocation();
      latitude = loc.latitude;
      longitude = loc.longitude;
    } catch {
      latitude = null;
      longitude = null;
    }

    const postoFinal = posto || {
      id: "posto-nao-identificado",
      codigo: codigo || "QR-NAO-LIDO",
      nome: UNKNOWN,
      cnpj: null,
      endereco: null,
      telefone: null,
      tipo_qr: "posto",
    };
    const valorNumero = parseDecimal(valor);
    const litrosNumero = parseDecimal(litros);
    const kmNumero = parseDecimal(km);
    const observacaoFinal = [
      !Number.isFinite(valorNumero) || valorNumero <= 0 ? "Valor nao identificado automaticamente." : "",
      !Number.isFinite(litrosNumero) || litrosNumero <= 0 ? "Litros nao identificados automaticamente." : "",
      !Number.isFinite(kmNumero) || kmNumero <= 0 ? "KM nao identificado automaticamente." : "",
      obs,
    ].filter(Boolean).join("\n");

    let saveResult: { ok?: boolean; error?: string; id?: string; preco_litro?: string | number; valor_por_litro?: string | number; km_rodado?: number | null; registro_teste?: boolean } | null = null;
    const podePersistir =
      postoFinal.nome !== UNKNOWN &&
      postoFinal.tipo_qr !== "unidade" &&
      Number.isFinite(valorNumero) && valorNumero > 0 &&
      Number.isFinite(litrosNumero) && litrosNumero > 0 &&
      Number.isFinite(kmNumero) && kmNumero > 0 &&
      (!mecInfo?.exige_selecao_carro || Boolean(placa));

    if (podePersistir) {
      const { data, error } = await supabaseRpc.rpc("app_mecanico_registrar_abastecimento_posto", {
        p_acesso_id: mecanico.acesso_id,
        p_posto_codigo: postoFinal.codigo,
        p_valor: valorNumero,
        p_litros: litrosNumero,
        p_combustivel: combustivel || UNKNOWN,
        p_km: kmNumero,
        p_placa: placa || null,
        p_observacao: observacaoFinal || null,
        p_foto_bomba_url: fotoBombaUrl,
        p_foto_painel_url: fotoPainelUrl,
        p_foto_placa_url: fotoQrUrl,
        p_latitude: latitude,
        p_longitude: longitude,
        p_endereco: null,
      });
      const r = (data ?? null) as typeof saveResult;
      if (!error && r?.ok) {
        saveResult = r;
      } else {
        console.warn("Recibo gerado sem persistencia oficial do abastecimento:", r?.error || error?.message);
      }
    }
    setLoading(false);

    const nextReceipt: ReceiptInfo = {
      id: saveResult?.id || `RECIBO-${Date.now()}`,
      codigo: postoFinal.codigo || codigo || UNKNOWN,
      postoNome: postoFinal.nome || UNKNOWN,
      postoCnpj: postoFinal.cnpj || "",
      postoEndereco: postoFinal.endereco || "",
      postoTelefone: postoFinal.telefone || "",
      mecanicoNome: mecInfo?.nome || mecanico.nome || UNKNOWN,
      empresa: mecInfo?.empresa || mecanico.empresa || UNKNOWN,
      empresaCnpj,
      filial: mecInfo?.filial || mecanico.filial || "",
      placa: placa || UNKNOWN,
      combustivel: combustivel || UNKNOWN,
      valor: Number.isFinite(valorNumero) && valorNumero > 0 ? valor : UNKNOWN,
      litros: Number.isFinite(litrosNumero) && litrosNumero > 0 ? litros : UNKNOWN,
      precoLitro: String(saveResult?.preco_litro ?? saveResult?.valor_por_litro ?? (precoLitro || UNKNOWN)),
      km: Number.isFinite(kmNumero) && kmNumero > 0 ? km : UNKNOWN,
      kmRodado: saveResult?.km_rodado ?? kmRodado,
      observacao: observacaoFinal,
      fotoQrUrl,
      fotoBombaUrl,
      fotoPainelUrl,
      createdAt: new Date(),
      registroTeste: Boolean(saveResult?.registro_teste || mecInfo?.registro_teste || mecanico.registro_teste),
    };
    setReceipt(nextReceipt);
    try {
      setReceiptPdf(await buildReceiptPdf(nextReceipt));
    } catch (e) {
      console.error("Erro ao gerar PDF do recibo de abastecimento:", e);
      toast.warning("Abastecimento salvo, mas o PDF sera gerado ao compartilhar ou baixar.");
    }
    setStep("ok");
    toast.success("Recibo de abastecimento gerado!");
  };

  const getReceiptPdf = async () => {
    if (!receipt) return null;
    if (receiptPdf) return receiptPdf;
    const pdf = await buildReceiptPdf(receipt);
    setReceiptPdf(pdf);
    return pdf;
  };

  const shareReceipt = async () => {
    if (!receipt) return;
    try {
      const pdf = await getReceiptPdf();
      if (pdf) {
        const file = new File([pdf.blob], pdf.fileName, { type: "application/pdf" });
        if (navigator.share && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: "Recibo de Abastecimento TOPAC", files: [file] });
          return;
        }
        downloadBlob(pdf.blob, pdf.fileName);
        toast.info("PDF baixado. Compartilhe o arquivo pelo aplicativo do celular.");
        return;
      }
      toast.error("Nao foi possivel gerar o PDF do recibo.");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      toast.error(getErrorMessage(e) || "Nao foi possivel compartilhar o recibo.");
    }
  };

  const printReceipt = () => {
    if (!receipt) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildReceiptHtml(receipt));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const downloadReceipt = async () => {
    if (!receipt) return;
    try {
      const pdf = await getReceiptPdf();
      if (pdf) downloadBlob(pdf.blob, pdf.fileName);
    } catch (e) {
      toast.error(getErrorMessage(e) || "Nao foi possivel baixar o PDF.");
    }
  };

  const reset = () => {
    stopScanner();
    setPosto(null);
    setPostosOpcao([]);
    setMecInfo(null);
    setCodigo("");
    setFotoQrUrl("");
    setFotoBombaUrl("");
    setFotoPainelUrl("");
    setValor("");
    setLitros("");
    setPrecoLitro("");
    setCombustivel("");
    setPlaca("");
    setCarros([]);
    setVeiculos([]);
    setKm("");
    setObs("");
    setReceipt(null);
    setReceiptPdf(null);
    setScanError("");
    setStep("scan");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600"><Fuel className="h-5 w-5" /></div>
          <div><h1 className="text-base font-bold">Abastecimento</h1><p className="text-xs text-muted-foreground">Checklist rapido: QR Code + bomba + KM</p></div>
        </div>
      </Card>

      {step === "scan" && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><QrCode className="h-4 w-4" /> Ler QR Code do posto</div>
          <AlertBox text="Fluxo simples: anexe QR Code, bomba e KM/painel. O recibo sai direto; dados nao lidos ficam como Nao identificado." />
          <div className={`overflow-hidden rounded-xl border bg-muted ${scanning ? "block aspect-square" : "hidden"}`}><video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay /></div>
          <Button className="w-full" onClick={scanning ? stopScanner : iniciarScanner} disabled={loading}>
            <Camera className="mr-2 h-4 w-4" /> {scanning ? "Parar camera" : "Abrir camera para ler QR"}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setCamQr(true)} disabled={loading}>
            <Camera className="mr-2 h-4 w-4" /> Tirar foto obrigatoria do QR Code
          </Button>
          {fotoQrUrl && <img src={fotoQrUrl} className="max-h-44 w-full rounded-lg object-cover" alt="Foto do QR Code" />}
          {scanError && <AlertBox text={scanError} />}
          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs">Enviar foto do QR Code pela galeria</Label>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivoQr(f); e.target.value = ""; }} />
            <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()}>Enviar imagem do QR</Button>
          </div>
        </Card>
      )}

      {step === "form" && (
        <Card className="space-y-3 p-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Checklist do abastecimento</div>
            <p className="text-xs text-muted-foreground">Anexe as 3 fotos e gere o recibo direto. O que nao for reconhecido sai como Nao identificado.</p>
          </div>

          <div className="rounded-xl border bg-muted/30 p-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <Info k="Funcionario" v={mecInfo?.nome || mecanico.nome || "-"} wide />
              <Info k="Empresa" v={mecInfo?.empresa || mecanico.empresa || "-"} />
              <Info k="CNPJ" v={empresaCnpj || "Nao informado"} />
              <Info k="Filial" v={mecInfo?.filial || mecanico.filial || "-"} />
              <Info k="Posto" v={posto?.nome || UNKNOWN} />
              <Info k="Veiculo" v={placa || UNKNOWN} />
              <Info k="Data/Hora" v={dataHoraAtual.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} />
            </div>
          </div>

          {mecInfo?.registro_teste && <AlertBox text={`Modo teste ativo${mecInfo.veiculo_teste ? ` - ${mecInfo.veiculo_teste}` : ""}. Este abastecimento nao entra em custo oficial.`} />}

          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <div className="text-sm font-semibold">Fotos obrigatorias</div>
            <PhotoChecklist
              label="Foto do QR Code"
              url={fotoQrUrl}
              onClick={() => setCamQr(true)}
              loading={loading}
            />
            <PhotoChecklist
              label="Foto da bomba"
              url={fotoBombaUrl}
              onClick={() => setCamBomba(true)}
              loading={loading}
            />
            <PhotoChecklist
              label="Foto do KM/painel"
              url={fotoPainelUrl}
              onClick={() => setCamPainel(true)}
              loading={loading}
            />
          </div>

          <Button className="w-full h-12 text-base font-bold" onClick={finalizar} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} GERAR RECIBO
          </Button>
        </Card>
      )}

      {step === "ok" && receipt && (
        <Card className="space-y-4 p-4">
          <div className="text-center"><div className="text-lg font-bold">Recibo gerado</div><p className="text-sm text-muted-foreground">Compartilhe somente o PDF pelo aplicativo do celular.</p></div>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="font-bold">{receipt.postoNome}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <Info k="Mecanico" v={receipt.mecanicoNome} wide /><Info k="Carro" v={receipt.placa || "-"} /><Info k="KM" v={receipt.km || "-"} />
              <Info k="Litros" v={fmtLitros(receipt.litros)} /><Info k="Preco/L" v={fmtMoney(receipt.precoLitro)} /><Info k="Valor" v={fmtMoney(receipt.valor)} />
              {receipt.kmRodado !== null && <Info k="KM rodado" v={`${fmtNumber(String(receipt.kmRodado), 0)} km`} />}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2"><img src={receipt.fotoQrUrl} className="h-28 w-full rounded-lg object-cover" alt="QR Code" /><img src={receipt.fotoBombaUrl} className="h-28 w-full rounded-lg object-cover" alt="Bomba" /><img src={receipt.fotoPainelUrl} className="h-28 w-full rounded-lg object-cover" alt="Painel" /></div>
          </div>
          <Button onClick={shareReceipt} className="w-full h-12 text-base font-bold"><Share2 className="mr-2 h-4 w-4" /> COMPARTILHAR RECIBO</Button>
        </Card>
      )}

      <CameraCapture open={camQr} onClose={() => setCamQr(false)} onCapture={onCaptureQr} facing="environment" title="Foto do QR Code" hint="Foto obrigatoria: QR Code do abastecimento." />
      <CameraCapture open={camBomba} onClose={() => setCamBomba(false)} onCapture={onCaptureBomba} facing="environment" title="Foto da bomba" hint="Enquadre TOTAL R$, LITROS/VOLUME, PRECO/LITRO e combustivel" />
      <CameraCapture open={camPainel} onClose={() => setCamPainel(false)} onCapture={onCapturePainel} facing="environment" title="Foto do painel/KM" hint="Enquadre o ODO/KM total do painel" />
    </div>
  );
}

function Field({ label, value, setValue, type = "text" }: { label: string; value: string; setValue: (v: string) => void; type?: string }) {
  return <div><Label className="text-xs">{label}</Label><Input type={type === "number" ? "text" : type} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={(e) => setValue(e.target.value)} /></div>;
}

function Info({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return <div className={wide ? "col-span-2" : ""}><span className="text-muted-foreground">{k}</span><br />{v}</div>;
}

function PhotoChecklist({ label, url, onClick, loading }: { label: string; url: string; onClick: () => void; loading?: boolean }) {
  return (
    <div className="rounded-lg border bg-background/70 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold">{label}</div>
          <div className={`text-[11px] ${url ? "text-emerald-600" : "text-amber-600"}`}>{url ? "Anexada" : "Obrigatoria"}</div>
        </div>
        <Button type="button" size="sm" variant={url ? "outline" : "secondary"} onClick={onClick} disabled={loading}>
          <Camera className="mr-2 h-4 w-4" /> {url ? "Refazer" : "Tirar foto"}
        </Button>
      </div>
      {url && <img src={url} className="mt-2 max-h-36 w-full rounded-md object-cover" alt={label} />}
    </div>
  );
}

function AlertBox({ text }: { text: string }) {
  return <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" />{text}</div>;
}

function fmtMoney(value: string) {
  const n = parseDecimal(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : value || UNKNOWN;
}

function fmtNumber(value: string, digits = 3) {
  const n = parseDecimal(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: digits }) : value || UNKNOWN;
}

function fmtLitros(value: string) {
  const n = parseDecimal(value);
  return Number.isFinite(n) ? `${n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} L` : value || UNKNOWN;
}

function parseDecimal(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  const raw = String(value ?? "")
    .trim()
    .replace(/[^\d,.-]/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function formatDecimal(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits).replace(".", ",") : "";
}

function extractQrCode(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return (url.searchParams.get("qr") || url.searchParams.get("codigo") || url.pathname.split("/").filter(Boolean).pop() || raw).trim().toUpperCase();
  } catch {
    const match = raw.match(/(?:qr|codigo)=([^&]+)/i);
    return decodeURIComponent(match?.[1] || raw).trim().toUpperCase();
  }
}

function sanitizeFile(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function normalizePlate(value: string | null | undefined) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function normalizeCombustivel(value: string | null | undefined) {
  const raw = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!raw) return "";
  if (raw.includes("s10")) return "Diesel S10";
  if (raw.includes("diesel")) return "Diesel";
  if (raw.includes("gasolina") || raw.includes("gas")) return "Gasolina";
  if (raw.includes("etanol") || raw.includes("alcool") || raw.includes("alcohol")) return "Etanol";
  if (raw.includes("gnv")) return "GNV";
  return "";
}

function fuelSaveErrorMessage(error?: string) {
  const key = String(error || "");
  const messages: Record<string, string> = {
    foto_placa_obrigatoria: "Foto do QR Code obrigatoria.",
    foto_bomba_obrigatoria: "Foto da bomba obrigatoria.",
    foto_painel_obrigatoria: "Foto do KM/painel obrigatoria.",
    km_obrigatorio: "Informe o KM atual.",
    placa_obrigatoria: "Selecione o veiculo.",
    veiculo_fora_goiania: "Veiculo nao liberado para TOPAC Goiania.",
    km_menor_que_anterior: "KM menor que o ultimo registro desse veiculo. Confira antes de salvar.",
    preco_litro_fora_padrao: "Valor por litro fora do padrao. Confira valor e litros.",
    acesso_nao_autorizado: "Acesso nao autorizado.",
    qr_invalido: "QR Code do posto invalido.",
  };
  return messages[key] || key || "Erro ao salvar abastecimento.";
}

function hasPumpData(result: OcrResult | null) {
  if (!result?.ok) return false;
  const fields = [result.valor, result.litros, result.valor_por_litro]
    .map((value) => parseDecimal(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  return fields.length >= 2;
}

function hasKmData(result: OcrResult | null) {
  if (!result?.ok) return false;
  const kmValue = parseDecimal(result.km ?? result.km_atual);
  return Number.isFinite(kmValue) && kmValue > 0;
}

function isReliablePumpResult(result: OcrResult | null) {
  if (!hasPumpData(result)) return false;
  const valor = parseDecimal(result?.valor);
  const litros = parseDecimal(result?.litros);
  const preco = parseDecimal(result?.valor_por_litro);
  const confidence = Number(result?.confianca ?? 0);
  if (!isPlausibleNumber(valor, "valor") || !isPlausibleNumber(litros, "litros")) return false;

  const calculatedPrice = valor / litros;
  const finalPrice = isPlausibleNumber(preco, "preco") ? preco : calculatedPrice;
  if (!isPlausibleNumber(finalPrice, "preco")) return false;

  const calculatedValue = roundValue(litros * finalPrice, 2);
  const valueDiff = Math.abs(calculatedValue - valor);
  const consistent = valueDiff <= Math.max(0.25, valor * 0.025);
  const hasSafeConfidence = confidence >= 0.72;
  return consistent && hasSafeConfidence;
}

function isReliableKmResult(result: OcrResult | null) {
  if (!hasKmData(result)) return false;
  const kmValue = parseDecimal(result?.km ?? result?.km_atual);
  const confidence = Number(result?.confianca ?? 0);
  return isPlausibleNumber(kmValue, "km") && confidence >= 0.72;
}

function firstPositiveValue(primary: string | number | undefined, fallback: string | number | undefined) {
  const primaryNumber = parseDecimal(primary);
  if (Number.isFinite(primaryNumber) && primaryNumber > 0) return primary;
  const fallbackNumber = parseDecimal(fallback);
  return Number.isFinite(fallbackNumber) && fallbackNumber > 0 ? fallback : primary;
}

function mergeOcrResult(primary: OcrResult | null, fallback: OcrResult | null, tipo: "bomba" | "painel_km"): OcrResult | null {
  if (!fallback?.ok) return primary;
  if (!primary?.ok) return fallback;
  if (tipo === "painel_km") {
    const merged = {
      ...primary,
      km: firstPositiveValue(primary.km ?? primary.km_atual, fallback.km ?? fallback.km_atual),
      origem: `${primary.origem || "supabase"}+${fallback.origem || "ocr-local"}`,
      ocr_texto_bruto: fallback.ocr_texto_bruto || primary.ocr_texto_bruto,
    };
    return isReliableKmResult(merged) ? merged : fallback;
  }
  const merged = {
    ...primary,
    valor: firstPositiveValue(primary.valor, fallback.valor),
    litros: firstPositiveValue(primary.litros, fallback.litros),
    valor_por_litro: firstPositiveValue(primary.valor_por_litro, fallback.valor_por_litro),
    combustivel: normalizeCombustivel(primary.combustivel) || normalizeCombustivel(fallback.combustivel),
    origem: `${primary.origem || "supabase"}+${fallback.origem || "ocr-local"}`,
    ocr_texto_bruto: fallback.ocr_texto_bruto || primary.ocr_texto_bruto,
  };
  return isReliablePumpResult(merged) ? merged : fallback;
}

async function analisarFotoLocal(dataUrls: string | string[], tipo: "bomba" | "painel_km"): Promise<OcrResult | null> {
  const sources = Array.isArray(dataUrls) ? dataUrls : [dataUrls];
  let best: OcrResult | null = null;
  for (const dataUrl of sources) {
    try {
      const text = await readImageText(dataUrl, tipo === "painel_km");
      if (!text.trim()) continue;
      const parsed = tipo === "painel_km" ? parsePainelText(text) : parseBombaText(text);
      const current = { ...parsed, origem: "ocr-local", ocr_texto_bruto: text };
      if (tipo === "painel_km" && isReliableKmResult(current)) return current;
      if (tipo === "bomba" && isReliablePumpResult(current)) return current;
      if (!best || Number(current.confianca ?? 0) > Number(best.confianca ?? 0)) best = current;
    } catch (error) {
      console.error("Erro OCR local abastecimento:", error);
    }
  }
  return best;
}

async function readImageText(dataUrl: string, numericOnly = false): Promise<string> {
  const mod: any = await import("tesseract.js");
  if (!mod?.createWorker) throw new Error("OCR indisponivel");
  let worker: any;
  try {
    worker = await mod.createWorker("por+eng");
  } catch {
    worker = await mod.createWorker();
    if (typeof worker.loadLanguage === "function") await worker.loadLanguage("por+eng");
    if (typeof worker.initialize === "function") await worker.initialize("por+eng");
  }
  try {
    if (typeof worker.setParameters === "function") {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        ...(numericOnly ? { tessedit_char_whitelist: "0123456789., " } : {}),
      });
    }
    const result = await worker.recognize(dataUrl);
    return String(result?.data?.text || "");
  } finally {
    await worker.terminate?.();
  }
}

function parseBombaText(text: string): OcrResult {
  const lines = getOcrLines(text);
  let valor = pickNumberNearLabel(lines, /(TOTAL\s*(A\s*)?PAGAR|VALOR\s*(TOTAL)?|A\s*PAGAR)/i, "valor");
  let litros = pickNumberNearLabel(lines, /(LITROS?|VOLUME|VOL\.?|QUANTIDADE|QTD)/i, "litros");
  let preco = pickNumberNearLabel(lines, /(PRECO|PREÇO|POR\s*LITRO|R\s*\/\s*L|P\.?\s*UNIT|UNITARIO)/i, "preco");

  const inferred = inferPumpValues(collectFuelNumbers(lines), { valor, litros, preco });
  valor = inferred.valor;
  litros = inferred.litros;
  preco = inferred.preco;
  const reconciled = reconcilePumpValues({ valor, litros, preco });
  const labeledCount = [valor, litros, preco].filter((value) => Number.isFinite(value) && value > 0).length;
  const consistent = reconciled.valor > 0 && reconciled.litros > 0 && reconciled.preco > 0
    ? Math.abs(roundValue(reconciled.litros * reconciled.preco, 2) - reconciled.valor) <= Math.max(0.25, reconciled.valor * 0.025)
    : false;
  const result = {
    ok: [reconciled.valor, reconciled.litros, reconciled.preco].filter((value) => Number.isFinite(value) && value > 0).length >= 2,
    valor: reconciled.valor || undefined,
    litros: reconciled.litros || undefined,
    valor_por_litro: reconciled.preco || undefined,
    combustivel: normalizeCombustivel(text),
    confianca: consistent && labeledCount >= 2 ? 0.78 : 0.55,
    motivo: consistent ? undefined : "Numeros da bomba nao fecharam com seguranca.",
  };
  return result;
}

function parsePainelText(text: string): OcrResult {
  const lines = getOcrLines(text);
  const labeled = pickNumberNearLabel(lines, /(ODO|ODOMETRO|HODOMETRO|HODOMETRO|QUILOMETR|KM\b)/i, "km");
  const candidates = collectKmNumbers(text);
  const hasLabeledKm = labeled && isPlausibleNumber(labeled, "km");
  const km = hasLabeledKm ? labeled : candidates[0] || 0;
  return {
    ok: km > 0,
    km,
    confianca: hasLabeledKm ? 0.9 : km > 0 ? 0.82 : 0,
    motivo: km > 0 ? undefined : "KM nao identificado no recorte central do painel.",
  };
}

function getOcrLines(text: string) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function pickNumberNearLabel(lines: string[], label: RegExp, kind: "valor" | "litros" | "preco" | "km") {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!label.test(line)) continue;
    const nearby = [line.replace(label, " "), lines[index + 1] || "", lines[index + 2] || "", lines[index + 3] || ""];
    for (const piece of nearby) {
      const number = extractFuelNumbers(piece, kind).find((value) => isPlausibleNumber(value, kind));
      if (number) return number;
    }
  }
  return 0;
}

function collectFuelNumbers(lines: string[]) {
  const values = lines.flatMap((line) => extractFuelNumbers(line)).filter((value) => value > 0 && value < 10000);
  return Array.from(new Set(values.map((value) => roundValue(value, 3))));
}

function extractFuelNumbers(text: string, kind?: "valor" | "litros" | "preco" | "km") {
  const matches = String(text || "").match(/(?:R\$?\s*)?-?\d{1,6}(?:[.,]\d{1,3})?|\b\d{2,7}\b/g) || [];
  return matches
    .map((token) => parseOcrNumberToken(token, kind))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function parseOcrNumberToken(token: string, kind?: "valor" | "litros" | "preco" | "km") {
  const clean = String(token || "").replace(/[^\d,.-]/g, "");
  if (!clean) return NaN;
  const hasSeparator = /[.,]/.test(clean);
  if (hasSeparator) return parseDecimal(clean);
  const digits = clean.replace(/\D/g, "");
  const n = Number(digits);
  if (!Number.isFinite(n)) return NaN;
  if (kind === "km") return n;
  if (kind === "preco" && digits.length >= 3) return n / 100;
  if (kind === "litros" && digits.length >= 3) return n / 100;
  if (kind === "valor") {
    if (digits.length === 3) return n / 10;
    if (digits.length >= 4) return n / 100;
  }
  return n;
}

function isPlausibleNumber(value: number, kind: "valor" | "litros" | "preco" | "km") {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (kind === "valor") return value >= 5 && value <= 10000;
  if (kind === "litros") return value >= 1 && value <= 500;
  if (kind === "preco") return value >= 1.5 && value <= 30;
  return value >= 1000 && value <= 9999999;
}

function inferPumpValues(
  candidates: number[],
  current: { valor: number; litros: number; preco: number },
) {
  let { valor, litros, preco } = current;
  if (!preco && valor > 0 && litros > 0) preco = valor / litros;
  if (!valor && litros > 0 && preco > 0) valor = litros * preco;
  if (!litros && valor > 0 && preco > 0) litros = valor / preco;

  if (hasTwoPumpNumbers({ valor, litros, preco })) return { valor, litros, preco };

  let best: { valor: number; litros: number; preco: number; score: number } | null = null;
  const values = candidates.filter((value) => value >= 5);
  const liters = candidates.filter((value) => value >= 1 && value <= 500);
  const prices = candidates.filter((value) => value >= 1.5 && value <= 30);

  for (const v of values) {
    for (const l of liters) {
      if (Math.abs(v - l) < 0.001) continue;
      const p = v / l;
      if (p < 1.5 || p > 30) continue;
      const score = Math.abs(p - 5);
      if (!best || score < best.score) best = { valor: v, litros: l, preco: p, score };
    }
  }

  if (!best) {
    for (const l of liters) {
      for (const p of prices) {
        if (Math.abs(l - p) < 0.001) continue;
        const v = l * p;
        if (v < 5 || v > 10000) continue;
        const score = Math.abs(p - 5);
        if (!best || score < best.score) best = { valor: v, litros: l, preco: p, score };
      }
    }
  }

  if (best) {
    valor = valor || best.valor;
    litros = litros || best.litros;
    preco = preco || best.preco;
  }

  return { valor, litros, preco };
}

function hasTwoPumpNumbers(values: { valor: number; litros: number; preco: number }) {
  return [values.valor, values.litros, values.preco].filter((value) => Number.isFinite(value) && value > 0).length >= 2;
}

function reconcilePumpValues(values: { valor: number; litros: number; preco: number }) {
  let { valor, litros, preco } = values;
  if (valor > 0 && litros > 0 && (!preco || preco < 1.5 || preco > 30)) preco = valor / litros;
  if (litros > 0 && preco > 0 && !valor) valor = litros * preco;
  if (valor > 0 && preco > 0 && !litros) litros = valor / preco;
  if (valor > 0 && litros > 0 && preco > 0) {
    const calculated = litros * preco;
    if (Math.abs(calculated - valor) > Math.max(2, valor * 0.1)) {
      const recalculatedPrice = valor / litros;
      if (recalculatedPrice >= 1.5 && recalculatedPrice <= 30) preco = recalculatedPrice;
    }
  }
  return {
    valor: isPlausibleNumber(valor, "valor") ? roundValue(valor, 2) : 0,
    litros: isPlausibleNumber(litros, "litros") ? roundValue(litros, 3) : 0,
    preco: isPlausibleNumber(preco, "preco") ? roundValue(preco, 3) : 0,
  };
}

function collectKmNumbers(text: string) {
  const grouped = Array.from(String(text || "").matchAll(/\b\d{1,3}(?:[.,]\d{3}){1,2}\b/g))
    .map((match) => Number(match[0].replace(/\D/g, "")));
  const plain = Array.from(String(text || "").matchAll(/\b\d{4,7}\b/g))
    .map((match) => Number(match[0]));
  return Array.from(new Set([...grouped, ...plain]))
    .filter((value) => value >= 1000 && value <= 9999999 && (value < 1900 || value > 2099))
    .sort((a, b) => b - a);
}

function roundValue(value: number, digits: number) {
  const factor = 10 ** digits;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}

async function buildReceiptPdf(info: ReceiptInfo): Promise<{ blob: Blob; fileName: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const margin = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("TOPAC RH PRO", margin, y);
  doc.setFontSize(12);
  doc.text("RECIBO DE ABASTECIMENTO", pageWidth - margin, y, { align: "right" });
  y += 8;
  doc.setDrawColor(20, 20, 20);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFontSize(9);
  const rows: [string, string][] = [
    ["Numero", info.id || "salvo"],
    ["Data/Hora", info.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })],
    ["Funcionario", info.mecanicoNome],
    ["Empresa", `${info.empresa}${info.empresaCnpj ? ` - ${info.empresaCnpj}` : ""}`],
    ["Veiculo", info.placa || "nao identificado"],
    ["KM", info.km || "nao identificado"],
    ["Posto", info.postoNome || "-"],
    ["Combustivel", info.combustivel || "nao identificado"],
    ["Litros", fmtLitros(info.litros)],
    ["Valor total", fmtMoney(info.valor)],
  ];

  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(value || "-"), margin + 42, y, { maxWidth: usableWidth - 42 });
    y += 6;
  }

  y += 3;
  doc.setFont("helvetica", "bold");
  doc.text("Fotos de comprovacao", margin, y);
  y += 5;

  const photoWidth = (usableWidth - 6) / 2;
  const photoHeight = 82;
  await addReceiptImage(doc, info.fotoBombaUrl, "Foto da bomba", margin, y, photoWidth, photoHeight);
  await addReceiptImage(doc, info.fotoPainelUrl, "Foto do painel", margin + photoWidth + 6, y, photoWidth, photoHeight);
  y += photoHeight + 15;

  if (y > pageHeight - 35) {
    doc.addPage();
    y = margin;
  }
  doc.setDrawColor(80, 80, 80);
  doc.line(margin + 30, y, pageWidth - margin - 30, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Assinatura / identificacao do usuario logado", pageWidth / 2, y, { align: "center" });
  doc.text(info.mecanicoNome, pageWidth / 2, y + 5, { align: "center" });

  return { blob: doc.output("blob"), fileName: getReceiptPdfFileName(info) };
}

async function addReceiptImage(doc: jsPDF, url: string, label: string, x: number, y: number, width: number, height: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(label, x, y);
  doc.setDrawColor(180, 180, 180);
  doc.rect(x, y + 2, width, height);
  if (!url) {
    doc.setFont("helvetica", "normal");
    doc.text("Foto nao anexada", x + 3, y + 12);
    return;
  }
  try {
    const dataUrl = await imageUrlToDataUrl(url);
    const props = doc.getImageProperties(dataUrl);
    const ratio = Math.min((width - 4) / props.width, (height - 4) / props.height);
    const imgWidth = props.width * ratio;
    const imgHeight = props.height * ratio;
    const imgX = x + (width - imgWidth) / 2;
    const imgY = y + 2 + (height - imgHeight) / 2;
    doc.addImage(dataUrl, getImageFormat(dataUrl), imgX, imgY, imgWidth, imgHeight);
  } catch {
    doc.setFont("helvetica", "normal");
    doc.text("Foto registrada, mas nao carregou no PDF.", x + 3, y + 12, { maxWidth: width - 6 });
  }
}

async function imageUrlToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Nao foi possivel carregar a foto do recibo.");
  return blobToDataUrl(await response.blob());
}

function getImageFormat(dataUrl: string): "PNG" | "JPEG" {
  return dataUrl.toLowerCase().startsWith("data:image/png") ? "PNG" : "JPEG";
}

function getReceiptPdfFileName(info: ReceiptInfo) {
  const date = info.createdAt.toISOString().slice(0, 10);
  return `${sanitizeFile(info.empresa || "TOPAC")} - RECIBO ABASTECIMENTO - ${sanitizeFile(info.mecanicoNome || "FUNCIONARIO")} - ${date}.pdf`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function buildReceiptHtml(info: ReceiptInfo) {
  const text = [
    ["Registro", info.id || "salvo"],
    ["Data/Hora", info.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })],
    ["Funcionario", info.mecanicoNome],
    ["Unidade", `${info.empresa}${info.filial ? ` - ${info.filial}` : ""}`],
    ["CNPJ da empresa", info.empresaCnpj || "Nao informado"],
    ["Veiculo", info.placa || "-"],
    ["Posto", info.postoNome],
    ["CNPJ", info.postoCnpj || "-"],
    ["Endereco", info.postoEndereco || "-"],
    ["Telefone", info.postoTelefone || "-"],
    ["Combustivel", info.combustivel],
    ["Litros", fmtLitros(info.litros)],
    ["Preco/L", fmtMoney(info.precoLitro)],
    ["Valor total", fmtMoney(info.valor)],
    ["KM", info.km || "-"],
    ["KM rodado", info.kmRodado !== null ? `${fmtNumber(String(info.kmRodado), 0)} km` : "-"],
    ["Validado por", info.mecanicoNome],
  ];

  return `<html><head><title>Recibo abastecimento</title><style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111}
    h1{font-size:18px;margin:0 0 4px}
    .muted{color:#555;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    td{border:1px solid #ddd;padding:7px;vertical-align:top}
    td:first-child{font-weight:bold;width:160px;background:#f7f7f7}
    .photos{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px}
    img{width:100%;max-height:300px;object-fit:contain;border:1px solid #ddd}
  </style></head><body>
    <h1>TOPAC RH PRO - Recibo de Abastecimento</h1>
    ${info.registroTeste ? '<div class="muted"><strong>REGISTRO DE TESTE</strong> - nao impacta relatorios oficiais.</div>' : ''}
    <div class="muted">Comprovante interno gerado pelo app do mecanico.</div>
    <table>${text.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join("")}</table>
    <div class="photos">
      <div><strong>Foto do QR Code</strong><br><img src="${escapeHtml(info.fotoQrUrl)}"></div>
      <div><strong>Foto da bomba</strong><br><img src="${escapeHtml(info.fotoBombaUrl)}"></div>
      <div><strong>Foto do painel/KM</strong><br><img src="${escapeHtml(info.fotoPainelUrl)}"></div>
    </div>
  </body></html>`;
}

function escapeHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function optimizeImageBlob(blob: Blob, maxSide = 1600, quality = 0.8): Promise<Blob> {
  const dataUrl = await renderImageDataUrl(blob, { maxSide, quality });
  if (!dataUrl) return blob;
  return dataUrlToBlob(dataUrl);
}

async function blobToOptimizedDataUrl(blob: Blob): Promise<string> {
  return renderImageDataUrl(blob, { maxSide: 1800, quality: 0.86 });
}

async function buildPanelOcrDataUrls(blob: Blob): Promise<string[]> {
  const original = await blobToDataUrl(blob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const crop = {
        x: Math.round(img.width * 0.12),
        y: Math.round(img.height * 0.2),
        width: Math.round(img.width * 0.76),
        height: Math.round(img.height * 0.58),
      };
      const central = imageToDataUrl(img, { maxSide: 1700, quality: 0.92, crop, filter: "grayscale(1) contrast(1.45)" });
      const full = imageToDataUrl(img, { maxSide: 1500, quality: 0.82, filter: "grayscale(1) contrast(1.25)" });
      resolve([central || original, full || original]);
    };
    img.onerror = () => resolve([original]);
    img.src = original;
  });
}

async function renderImageDataUrl(blob: Blob, options: { maxSide: number; quality: number; filter?: string }): Promise<string> {
  const original = await blobToDataUrl(blob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(imageToDataUrl(img, options) || original);
    };
    img.onerror = () => resolve(original);
    img.src = original;
  });
}

function imageToDataUrl(
  img: HTMLImageElement,
  options: { maxSide: number; quality: number; crop?: { x: number; y: number; width: number; height: number }; filter?: string },
) {
  const source = options.crop || { x: 0, y: 0, width: img.width, height: img.height };
  const ratio = Math.min(1, options.maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * ratio));
  canvas.height = Math.max(1, Math.round(source.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (options.filter) ctx.filter = options.filter;
  ctx.drawImage(img, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", options.quality);
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}
