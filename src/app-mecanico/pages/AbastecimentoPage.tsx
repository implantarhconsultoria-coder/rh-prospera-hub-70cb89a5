import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Eye, FileDown, Fuel, Gauge, Loader2, QrCode, RotateCcw, Share2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import QrScanner from "qr-scanner";
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
import { gerarCupomAbastecimentoPdf } from "../lib/abastecimentoPdf";

type Step = "scan" | "painel" | "bomba" | "form" | "ok";

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
  filial: string;
  placa: string;
  combustivel: string;
  valor: string;
  litros: string;
  precoLitro: string;
  km: string;
  kmRodado: number | null;
  observacao: string;
  fotoBombaUrl: string;
  fotoPainelUrl: string;
  createdAt: Date;
  registroTeste?: boolean;
  reciboPdfUrl?: string;
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
  const [camBomba, setCamBomba] = useState(false);
  const [camPainel, setCamPainel] = useState(false);
  const [fotoBombaUrl, setFotoBombaUrl] = useState("");
  const [fotoPainelUrl, setFotoPainelUrl] = useState("");
  const [valor, setValor] = useState("");
  const [litros, setLitros] = useState("");
  const [precoLitro, setPrecoLitro] = useState("");
  const [combustivel, setCombustivel] = useState("Diesel S10");
  const [placa, setPlaca] = useState("");
  const [carros, setCarros] = useState<string[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoInfo[]>([]);
  const [km, setKm] = useState("");
  const [obs, setObs] = useState("");
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [capturedLocation, setCapturedLocation] = useState<{ latitude: number | null; longitude: number | null }>({ latitude: null, longitude: null });
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const painelTestInputRef = useRef<HTMLInputElement>(null);
  const bombaTestInputRef = useRef<HTMLInputElement>(null);
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
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true });
      const decoded = typeof result === "string" ? result : result.data;
      const normalized = extractQrCode(decoded);
      setCodigo(normalized);
      validarQr(normalized);
    } catch {
      setScanError("Nao foi possivel ler o QR da imagem. Tente outra foto ou digite o codigo.");
    }
  };

  const validarQr = async (cod: string) => {
    const normalized = extractQrCode(cod);
    if (!normalized.trim()) return toast.error("Informe o codigo do QR");
    setLoading(true);
    const { data, error } = await supabaseRpc.rpc("app_mecanico_validar_qr_posto", {
      p_acesso_id: mecanico.acesso_id,
      p_codigo: normalized,
    });
    const r = (data ?? null) as { ok?: boolean; error?: string; posto?: Posto; postos?: Posto[]; mecanico?: MecInfo } | null;
    if (error || !r?.ok || !r.posto) {
      const msg = r?.error === "qr_nao_encontrado" ? "QR Code do posto nao encontrado." : "Erro ao validar QR Code.";
      setScanError(msg);
      return toast.error(msg);
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
    setStep("painel");
    void getBrowserLocation().then(setCapturedLocation);
  };

  const onCaptureBomba = async (blob: Blob) => {
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "bomba", blob);
      setFotoBombaUrl(url);
      setStep("form");
      toast.success("Foto da bomba salva. Digite os dados exibidos nela.");
    } catch (e) {
      toast.error(getErrorMessage(e) || "Erro no upload da bomba");
    } finally {
      setLoading(false);
    }
  };

  const processarImagemTeste = async (file: File | undefined, tipo: "painel" | "bomba") => {
    if (!file) return;
    if (!mecInfo?.registro_teste) {
      toast.error("Seleção pela galeria disponível somente no modo de teste interno.");
      return;
    }
    if (tipo === "painel") await onCapturePainel(file);
    else await onCaptureBomba(file);
  };

  const onCapturePainel = async (blob: Blob) => {
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "painel", blob);
      setFotoPainelUrl(url);
      setKm("");
      setStep("bomba");
      toast.success("Foto do painel salva. O KM deverá ser digitado manualmente.");
    } catch (e) {
      toast.error(getErrorMessage(e) || "Erro no upload do KM");
    } finally {
      setLoading(false);
    }
  };

  const vincularReciboPdf = async (info: ReceiptInfo, pdf: { blob: Blob; fileName: string }) => {
    if (info.reciboPdfUrl) return info.reciboPdfUrl;
    const reciboPdfUrl = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, `recibo-${info.id}`, pdf.blob);
    const linked = await supabaseRpc.rpc("app_mecanico_vincular_recibo_pdf", {
      p_acesso_id: mecanico.acesso_id,
      p_abastecimento_id: info.id,
      p_recibo_pdf_url: reciboPdfUrl,
    });
    const linkedResult = linked.data as { ok?: boolean; error?: string } | null;
    if (linked.error || !linkedResult?.ok) throw new Error(linkedResult?.error || linked.error?.message || "Erro ao vincular recibo PDF");
    info.reciboPdfUrl = reciboPdfUrl;
    setReceipt({ ...info });
    return reciboPdfUrl;
  };

  const finalizar = async () => {
    if (!posto) return;
    if (postosOpcao.length > 1 && posto.tipo_qr === "unidade") return toast.error("Selecione o posto de Goiania");
    if (!fotoBombaUrl || !fotoPainelUrl) return toast.error("Fotos obrigatorias");
    if (!valor || !litros || !precoLitro || !km) return toast.error("Preencha valor, litros, preço por litro e KM.");
    if (mecInfo?.exige_selecao_carro && !placa) return toast.error("Selecione o carro");
    setLoading(true);
    const location = capturedLocation.latitude !== null || capturedLocation.longitude !== null
      ? capturedLocation
      : await getBrowserLocation();
    const { latitude, longitude } = location;
    const { data, error } = await supabaseRpc.rpc("app_mecanico_registrar_abastecimento_posto", {
      p_acesso_id: mecanico.acesso_id,
      p_posto_codigo: posto.codigo,
      p_valor: parseDecimal(valor),
      p_litros: parseDecimal(litros),
      p_combustivel: combustivel,
      p_km: km ? parseDecimal(km) : null,
      p_placa: placa || null,
      p_observacao: obs || null,
      p_foto_bomba_url: fotoBombaUrl,
      p_foto_painel_url: fotoPainelUrl,
      p_latitude: latitude,
      p_longitude: longitude,
      p_endereco: null,
    });
    const r = (data ?? null) as { ok?: boolean; error?: string; id?: string; preco_litro?: string | number; valor_por_litro?: string | number; km_rodado?: number | null; registro_teste?: boolean } | null;
    if (error || !r?.ok) {
      setLoading(false);
      return toast.error(r?.error || error?.message || "Erro ao salvar");
    }
    const receiptInfo: ReceiptInfo = {
      id: r.id || "",
      codigo: posto.codigo,
      postoNome: posto.nome,
      postoCnpj: posto.cnpj || "",
      postoEndereco: posto.endereco || "",
      postoTelefone: posto.telefone || "",
      mecanicoNome: mecInfo?.nome || mecanico.nome || "",
      empresa: mecInfo?.empresa || mecanico.empresa || "",
      filial: mecInfo?.filial || mecanico.filial || "",
      placa,
      combustivel,
      valor,
      litros,
      precoLitro: String(r.preco_litro ?? r.valor_por_litro ?? precoLitro),
      km,
      kmRodado: r.km_rodado ?? kmRodado,
      observacao: obs,
      fotoBombaUrl,
      fotoPainelUrl,
      createdAt: new Date(),
      registroTeste: Boolean(r.registro_teste || mecInfo?.registro_teste || mecanico.registro_teste),
    };
    toast.success("Abastecimento salvo. Gerando e vinculando o recibo PDF...");
    try {
      const pdf = await gerarCupomAbastecimentoPdf(buildPdfData(receiptInfo));
      await vincularReciboPdf(receiptInfo, pdf);
      setReceipt(receiptInfo);
      setStep("ok");
      downloadPdfBlob(pdf);
      toast.success("Abastecimento e recibo PDF salvos com sucesso.");
    } catch (error) {
      setReceipt(receiptInfo);
      setStep("ok");
      toast.error(`Abastecimento salvo, mas o recibo PDF não foi vinculado: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const buildPdfData = (info: ReceiptInfo) => ({
    id: info.id,
    codigo: info.codigo,
    postoNome: info.postoNome,
    postoCnpj: info.postoCnpj,
    mecanicoNome: info.mecanicoNome,
    empresa: info.empresa,
    filial: info.filial,
    placa: info.placa,
    veiculo: veiculoSelecionado?.descricao || "",
    combustivel: info.combustivel,
    valor: info.valor,
    litros: info.litros,
    precoLitro: info.precoLitro,
    km: info.km,
    observacao: info.observacao,
    fotoBombaUrl: info.fotoBombaUrl,
    fotoPainelUrl: info.fotoPainelUrl,
    createdAt: info.createdAt,
  });

  const createReceiptPdf = async (info: ReceiptInfo) => {
    setGeneratingPdf(true);
    try {
      const pdf = await gerarCupomAbastecimentoPdf(buildPdfData(info));
      if (info.id && !info.reciboPdfUrl) await vincularReciboPdf(info, pdf);
      return pdf;
    } finally {
      setGeneratingPdf(false);
    }
  };

  const downloadPdfBlob = (pdf: { blob: Blob; fileName: string }) => {
    const url = URL.createObjectURL(pdf.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = pdf.fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadReceiptPdf = async (info = receipt) => {
    if (!info) return;
    downloadPdfBlob(await createReceiptPdf(info));
  };

  const viewReceiptPdf = async () => {
    if (!receipt) return;
    const pdf = await createReceiptPdf(receipt);
    const url = URL.createObjectURL(pdf.blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  };

  const shareReceiptPdf = async () => {
    if (!receipt) return;
    const pdf = await createReceiptPdf(receipt);
    const file = new File([pdf.blob], pdf.fileName, { type: "application/pdf" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: "Recibo de abastecimento TOPAC", files: [file] });
      return;
    }
    await downloadReceiptPdf(receipt);
    toast.info("O compartilhamento de arquivos não está disponível; o PDF foi baixado.");
  };


  const downloadPdf = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    stopScanner();
    setPosto(null);
    setPostosOpcao([]);
    setMecInfo(null);
    setCodigo("");
    setFotoBombaUrl("");
    setFotoPainelUrl("");
    setValor("");
    setLitros("");
    setPrecoLitro("");
    setPlaca("");
    setCarros([]);
    setVeiculos([]);
    setKm("");
    setObs("");
    setReceipt(null);
    setScanError("");
    setCapturedLocation({ latitude: null, longitude: null });
    setStep("scan");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600"><Fuel className="h-5 w-5" /></div>
          <div><h1 className="text-base font-bold">Abastecimento</h1><p className="text-xs text-muted-foreground">QR Code + foto da bomba + foto do painel</p></div>
        </div>
      </Card>

      {step === "scan" && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><QrCode className="h-4 w-4" /> Ler QR Code do posto</div>
          <div className={`overflow-hidden rounded-xl border bg-muted ${scanning ? "block aspect-square" : "hidden"}`}><video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay /></div>
          <Button className="w-full" onClick={scanning ? stopScanner : iniciarScanner} disabled={loading}>
            <Camera className="mr-2 h-4 w-4" /> {scanning ? "Parar camera" : "Abrir camera para ler QR"}
          </Button>
          {scanError && <AlertBox text={scanError} />}
          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs">Enviar foto do QR (galeria)</Label>
            <input ref={fileInputRef} data-testid="qr-galeria-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivoQr(f); e.target.value = ""; }} />
            <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()}>Enviar imagem do QR</Button>
          </div>
          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs">Ou digite o codigo manualmente</Label>
            <div className="flex gap-2"><Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="COMB-SP-001" /><Button onClick={() => validarQr(codigo)} disabled={loading || !codigo}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}</Button></div>
          </div>
        </Card>
      )}

      {step === "painel" && posto && (
        <Card className="space-y-3 p-4">
          <div className="text-xs font-semibold uppercase text-muted-foreground">QR validado</div>
          <div className="space-y-1 text-sm">
            <div><b>Mecanico:</b> {mecInfo?.nome}</div>
            <div><b>Empresa:</b> {mecInfo?.empresa || "-"} {mecInfo?.filial ? `- ${mecInfo.filial}` : ""}</div>
            {mecInfo?.registro_teste && <AlertBox text={`Modo teste ativo${mecInfo.veiculo_teste ? ` - ${mecInfo.veiculo_teste}` : ""}. Este abastecimento nao entra em custo oficial.`} />}
            {postosOpcao.length > 1 ? (
              <div className="space-y-1">
                <Label className="text-xs">Posto de Goiania</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={posto.tipo_qr === "unidade" ? "" : posto.codigo}
                  onChange={(e) => {
                    const selected = postosOpcao.find((p) => p.codigo === e.target.value);
                    if (selected) setPosto(selected);
                  }}
                >
                  <option value="">Selecionar posto</option>
                  {postosOpcao.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}
                </select>
              </div>
            ) : <div><b>Posto:</b> {posto.nome}</div>}
            {posto.unidade && <div className="text-xs text-muted-foreground">Unidade: {posto.unidade}</div>}
            {posto.cnpj && <div className="text-xs text-muted-foreground">CNPJ: {posto.cnpj}</div>}
            {posto.endereco && <div className="text-xs text-muted-foreground">{posto.endereco}</div>}
            {posto.telefone && <div className="text-xs text-muted-foreground">Telefone/WhatsApp: {posto.telefone}</div>}
            {mecInfo?.placa && <div className="text-xs text-muted-foreground">Carro vinculado: {mecInfo.placa}</div>}
            {veiculos.length > 0 && <div className="text-xs text-muted-foreground">Documento da frota vinculado para {veiculos.length} veiculo(s).</div>}
            {mecInfo?.exige_selecao_carro && <AlertBox text="Selecione o carro usado antes de finalizar o abastecimento." />}
            {typeof mecInfo?.ultimo_km === "number" && <div className="text-xs text-muted-foreground">Ultimo KM salvo: {mecInfo.ultimo_km.toLocaleString("pt-BR")}</div>}
          </div>
          <AlertBox text="A foto do painel é obrigatória. O KM não será lido automaticamente: digite-o depois da foto da bomba." />
          <Button className="w-full" onClick={() => setCamPainel(true)}><Gauge className="mr-2 h-4 w-4" /> Tirar foto do painel/KM</Button>
          {mecInfo?.registro_teste && (
            <>
              <input ref={painelTestInputRef} data-testid="painel-teste-input" type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; void processarImagemTeste(file, "painel"); event.target.value = ""; }} />
              <Button type="button" className="w-full" variant="secondary" onClick={() => painelTestInputRef.current?.click()}>Selecionar foto do painel (teste)</Button>
            </>
          )}
          <Button className="w-full" variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" /> Cancelar</Button>
        </Card>
      )}

      {step === "bomba" && (
        <Card className="space-y-3 p-4">
          {fotoPainelUrl && <img src={fotoPainelUrl} className="w-full rounded-lg" alt="Painel" />}
          <AlertBox text="Foto do painel salva. Agora fotografe a bomba; os números serão digitados manualmente." />
          <Button className="w-full" onClick={() => setCamBomba(true)}><Camera className="mr-2 h-4 w-4" /> Tirar foto da bomba</Button>
          {mecInfo?.registro_teste && (
            <>
              <input ref={bombaTestInputRef} data-testid="bomba-teste-input" type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; void processarImagemTeste(file, "bomba"); event.target.value = ""; }} />
              <Button type="button" className="w-full" variant="secondary" onClick={() => bombaTestInputRef.current?.click()}>Selecionar foto da bomba (teste)</Button>
            </>
          )}
        </Card>
      )}

      {step === "form" && (
        <Card className="space-y-4 p-4">
          <div>
            <div className="text-sm font-semibold">Digite os dados do abastecimento</div>
            <p className="text-xs text-muted-foreground">OCR desligado. Informe exatamente os números mostrados nas fotos.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {fotoBombaUrl && <img src={fotoBombaUrl} className="h-32 w-full rounded-lg object-cover" alt="Bomba" />}
            {fotoPainelUrl && <img src={fotoPainelUrl} className="h-32 w-full rounded-lg object-cover" alt="Painel" />}
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
              <Field label="Valor (R$)" value={valor} setValue={updateValor} type="number" />
              <Field label="Litros" value={litros} setValue={updateLitros} type="number" />
              <Field label="Preço/L" value={precoLitro} setValue={updatePrecoLitro} type="number" />
              <div><Field label="KM manual" value={km} setValue={(value) => setKm(value.replace(/\D/g, ""))} type="number" />{kmRodado !== null && <div className="mt-1 text-[11px] text-muted-foreground">Rodou {fmtNumber(String(kmRodado), 0)} km.</div>}</div>
            </div>
            <div><Label className="text-xs">Combustível</Label><select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={combustivel} onChange={(e) => setCombustivel(e.target.value)}><option>Diesel S10</option><option>Diesel</option><option>Gasolina</option><option>Etanol</option><option>GNV</option></select></div>
            <div>
              <Label className="text-xs">{mecInfo?.exige_selecao_carro ? "Carro" : "Placa"}</Label>
              {mecInfo?.exige_selecao_carro && carros.length > 0 ? (
                <select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())}>
                  <option value="">Selecionar carro</option>{carros.map((item) => {
                    const veiculo = veiculos.find((v) => normalizePlate(v.placa) === normalizePlate(item));
                    return <option key={item} value={item}>{veiculo?.descricao ? `${item} - ${veiculo.descricao}` : item}</option>;
                  })}
                </select>
              ) : <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} disabled={Boolean(placa && !mecInfo?.exige_selecao_carro)} />}
            </div>
            {veiculoSelecionado && <div className="rounded-lg border bg-muted/30 p-3 text-xs font-medium">{veiculoSelecionado.descricao || veiculoSelecionado.placa} — {veiculoSelecionado.placa}</div>}
            <div><Label className="text-xs">Observação</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => { setFotoBombaUrl(""); setValor(""); setLitros(""); setPrecoLitro(""); setStep("bomba"); setCamBomba(true); }}><Camera className="mr-2 h-4 w-4" /> Refazer bomba</Button>
            <Button type="button" variant="outline" onClick={() => { setFotoPainelUrl(""); setKm(""); setStep("painel"); setCamPainel(true); }}><Gauge className="mr-2 h-4 w-4" /> Refazer painel</Button>
          </div>
          <Button className="w-full" onClick={finalizar} disabled={loading || !valor || !litros || !precoLitro || !km}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Confirmar e gerar recibo
          </Button>
        </Card>
      )}

      {step === "ok" && receipt && (
        <Card className="space-y-4 p-4">
          <div className="text-center"><div className="text-lg font-bold">Abastecimento registrado</div><p className="text-sm text-muted-foreground">Recibo vertical em PDF gerado com as fotos.</p></div>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="font-bold">{receipt.postoNome}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <Info k="Funcionário" v={receipt.mecanicoNome} wide /><Info k="Veículo" v={receipt.placa || "-"} /><Info k="KM" v={receipt.km || "-"} />
              <Info k="Litros" v={`${fmtNumber(receipt.litros)} L`} /><Info k="Preço/L" v={fmtMoney(receipt.precoLitro)} /><Info k="Valor" v={fmtMoney(receipt.valor)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2"><img src={receipt.fotoBombaUrl} className="h-28 w-full rounded-lg object-cover" alt="Bomba" /><img src={receipt.fotoPainelUrl} className="h-28 w-full rounded-lg object-cover" alt="Painel" /></div>
          </div>
          {!receipt.reciboPdfUrl && <AlertBox text="O abastecimento foi salvo. Ao visualizar, compartilhar ou baixar, o sistema tentará vincular o PDF novamente." />}
          <Button onClick={shareReceiptPdf} disabled={generatingPdf} className="w-full"><Share2 className="mr-2 h-4 w-4" /> Compartilhar PDF</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={viewReceiptPdf} disabled={generatingPdf} variant="outline"><Eye className="mr-2 h-4 w-4" /> Visualizar PDF</Button>
            <Button onClick={() => downloadReceiptPdf()} disabled={generatingPdf} variant="outline"><FileDown className="mr-2 h-4 w-4" /> Baixar PDF</Button>
          </div>
          <Button onClick={reset} variant="ghost" className="w-full">Novo abastecimento</Button>
        </Card>
      )}

      <CameraCapture open={camBomba} onClose={() => setCamBomba(false)} onCapture={onCaptureBomba} facing="environment" title="Foto da bomba" hint="Enquadre TOTAL R$, LITROS/VOLUME, PRECO/LITRO e combustivel" />
      <CameraCapture open={camPainel} onClose={() => setCamPainel(false)} onCapture={onCapturePainel} facing="environment" title="Foto do painel/KM" hint="Enquadre o ODO/KM total do painel" />
    </div>
  );
}

function ReadingCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-emerald-500/5 p-3"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-1 text-sm font-bold text-foreground">{value}</div></div>;
}

function Field({ label, value, setValue, type = "text" }: { label: string; value: string; setValue: (v: string) => void; type?: string }) {
  return <div><Label className="text-xs">{label}</Label><Input aria-label={label} type={type === "number" ? "text" : type} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={(e) => setValue(e.target.value)} /></div>;
}

function Info({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return <div className={wide ? "col-span-2" : ""}><span className="text-muted-foreground">{k}</span><br />{v}</div>;
}

function AlertBox({ text }: { text: string }) {
  return <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" />{text}</div>;
}

function fmtMoney(value: string) {
  const n = parseDecimal(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : value || "R$ 0,00";
}

function fmtNumber(value: string, digits = 3) {
  const n = parseDecimal(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: digits }) : value || "0";
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

function isReliablePumpResult(result: OcrResult | null) {
  const reading = normalizePumpOcrResult(result);
  return reading.complete && Number(result?.confianca ?? 0) >= 0.7;
}

function isReliableKmResult(result: OcrResult | null) {
  return Boolean(normalizeOdometerOcrResult(result)) && Number(result?.confianca ?? 0) >= 0.7;
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

async function analisarFotoLocal(dataUrl: string, tipo: "bomba" | "painel_km"): Promise<OcrResult | null> {
  try {
    const text = await readImageText(dataUrl);
    if (!text.trim()) return null;
    const parsed = tipo === "painel_km" ? parsePainelText(text) : parseBombaText(text);
    return { ...parsed, origem: "ocr-local", ocr_texto_bruto: text };
  } catch (error) {
    console.error("Erro OCR local abastecimento:", error);
    return null;
  }
}

async function readImageText(dataUrl: string): Promise<string> {
  const mod = await import("tesseract.js");
  if (!mod.createWorker) throw new Error("OCR indisponivel");
  let worker: Awaited<ReturnType<typeof mod.createWorker>>;
  try {
    worker = await mod.createWorker("por+eng");
  } catch {
    worker = await mod.createWorker();
    if (typeof worker.loadLanguage === "function") await worker.loadLanguage("por+eng");
    if (typeof worker.initialize === "function") await worker.initialize("por+eng");
  }
  try {
    if (typeof worker.setParameters === "function") {
      await worker.setParameters({ preserve_interword_spaces: "1" });
    }
    const result = await worker.recognize(dataUrl);
    return String(result?.data?.text || "");
  } finally {
    await worker.terminate?.();
  }
}

function parseBombaText(text: string): OcrResult {
  const reading = parsePumpOcrText(text);
  return {
    ok: reading.complete,
    valor: reading.valor || undefined,
    litros: reading.litros || undefined,
    valor_por_litro: reading.precoLitro || undefined,
    combustivel: normalizeCombustivel(text),
    confianca: reading.complete ? 0.8 : 0,
    motivo: reading.complete ? undefined : "Não foi possível identificar TOTAL, LITROS e PREÇO/L.",
  };
}

function parsePainelText(text: string): OcrResult {
  const km = parseOdometerOcrText(text);
  return {
    ok: Boolean(km),
    km: km || undefined,
    confianca: km ? 0.8 : 0,
    motivo: km ? undefined : "Não foi possível identificar o odômetro.",
  };
}


function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function blobToOptimizedDataUrl(blob: Blob): Promise<string> {
  const original = await blobToDataUrl(blob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 2200;
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(original);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => resolve(original);
    img.src = original;
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}
