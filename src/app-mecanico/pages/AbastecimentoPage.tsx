import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, CheckCircle2, Eye, FileDown, Fuel, Gauge, Loader2, MapPin, QrCode, RotateCcw, Share2 } from "lucide-react";
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
import { normalizeKmOcrField, normalizePumpOcrFields } from "../lib/abastecimentoOcr";
import { uploadFoto } from "../lib/upload";
import { gerarCupomAbastecimentoPdf } from "../lib/abastecimentoPdf";

type Step = "scan" | "painel" | "bomba" | "revisao" | "ok";

type Posto = {
  id: string;
  codigo: string;
  nome: string;
  unidade?: string | null;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  tipo_qr?: string | null;
};

type VeiculoInfo = {
  placa: string;
  descricao?: string | null;
};

type MecInfo = {
  nome: string;
  empresa: string;
  filial: string;
  placa?: string | null;
  carros?: string[];
  veiculos?: VeiculoInfo[];
  exige_selecao_carro?: boolean;
  permite_placa_manual?: boolean;
  ultimo_km?: number | null;
};

type ReceiptInfo = {
  id: string;
  codigo: string;
  postoNome: string;
  postoCnpj: string;
  mecanicoNome: string;
  empresa: string;
  filial: string;
  placa: string;
  veiculo: string;
  combustivel: string;
  valor: number;
  litros: number;
  valorPorLitro: number | null;
  kmAtual: number | null;
  fotoBombaUrl: string;
  fotoPainelUrl: string;
  createdAt: Date;
  reciboPdfUrl?: string;
};

type PumpOcrResult = {
  ok?: boolean;
  valor?: string | number;
  litros?: string | number;
  valor_por_litro?: string | number;
  combustivel?: string;
  confianca?: number;
  motivo?: string;
};

type PanelOcrResult = {
  ok?: boolean;
  km?: string | number;
  km_atual?: string | number;
  confianca?: number;
  motivo?: string;
};

const CANONICAL_BASE_URL = "https://topacrh.pro";
const FUEL_OPTIONS = ["Gasolina", "Etanol", "Diesel", "Diesel S10", "GNV"];
const supabaseRpc = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const fuelErrorMessage = (code?: string, payload?: Record<string, unknown>) => {
  if (code === "gps_obrigatorio") return "Ative a localização do aparelho. O abastecimento não é salvo sem GPS.";
  if (code === "km_obrigatorio") return "Informe o KM atual do veículo.";
  if (code === "km_menor_ultimo") return `O KM informado é menor que o último KM registrado (${payload?.ultimo_km ?? "-"}). Confira o painel.`;
  if (code === "placa_obrigatoria") return "Selecione ou informe a placa do veículo.";
  if (code === "veiculo_nao_autorizado") return "A placa informada não foi encontrada como veículo ativo da frota.";
  if (code === "posto_invalido") return "Selecione um posto válido antes de continuar.";
  if (code === "dados_combustivel_invalidos") return "Confira litros e valor total do abastecimento.";
  if (code === "combustivel_invalido") return "Selecione o combustível correto.";
  if (code === "foto_bomba_obrigatoria" || code === "foto_painel_obrigatoria") return "As fotos ao vivo do painel e da bomba são obrigatórias.";
  if (code === "acesso_nao_autorizado") return "Seu acesso não está liberado. Entre novamente pelo PIN.";
  return code || "Erro ao salvar abastecimento.";
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
  const [ocrLoading, setOcrLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [camBomba, setCamBomba] = useState(false);
  const [camPainel, setCamPainel] = useState(false);
  const [fotoPainelUrl, setFotoPainelUrl] = useState("");
  const [fotoBombaUrl, setFotoBombaUrl] = useState("");
  const [placa, setPlaca] = useState("");
  const [carros, setCarros] = useState<string[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoInfo[]>([]);
  const [combustivel, setCombustivel] = useState("Diesel S10");
  const [litros, setLitros] = useState("");
  const [valor, setValor] = useState("");
  const [kmAtual, setKmAtual] = useState("");
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [pdfCache, setPdfCache] = useState<{ blob: Blob; fileName: string } | null>(null);
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
  const veiculoSelecionado = useMemo(() => {
    const atual = normalizePlate(placa);
    return veiculos.find((item) => normalizePlate(item.placa) === atual) || null;
  }, [placa, veiculos]);
  const litrosNumero = useMemo(() => parseBrNumber(litros), [litros]);
  const valorNumero = useMemo(() => parseBrNumber(valor), [valor]);
  const kmNumero = useMemo(() => (kmAtual.trim() ? parseBrNumber(kmAtual) : null), [kmAtual]);
  const valorPorLitro = useMemo(() => {
    if (!litrosNumero || !valorNumero) return null;
    return valorNumero / litrosNumero;
  }, [litrosNumero, valorNumero]);
  const dadosAbastecimentoValidos = Boolean(
    combustivel &&
    litrosNumero && litrosNumero > 0 &&
    valorNumero && valorNumero > 0 &&
    kmNumero && kmNumero > 0 &&
    normalizePlate(placa),
  );

  useEffect(() => {
    const qr = searchParams.get("qr") || searchParams.get("codigo") || "";
    const normalized = extractQrCode(qr);
    if (normalized && autoQrRef.current !== normalized) {
      autoQrRef.current = normalized;
      setCodigo(normalized);
      void validarQr(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, mecanico.acesso_id]);

  useEffect(() => () => {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
  }, []);

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
      setScanError(`Abra pelo endereço seguro ${CANONICAL_BASE_URL} ou digite o código manualmente.`);
      return;
    }
    try {
      stopScanner();
      const scanner = new QrScanner(
        videoRef.current!,
        (result) => {
          const normalized = extractQrCode(typeof result === "string" ? result : result.data);
          stopScanner();
          setCodigo(normalized);
          void validarQr(normalized);
        },
        { preferredCamera: "environment", returnDetailedScanResult: true, maxScansPerSecond: 8 },
      );
      scannerRef.current = scanner;
      await scanner.start();
      setScanning(true);
    } catch {
      setScanError("Não foi possível abrir a câmera. Use a imagem do QR ou digite o código.");
    }
  };

  const lerArquivoQr = async (file: File) => {
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true });
      const normalized = extractQrCode(typeof result === "string" ? result : result.data);
      setCodigo(normalized);
      await validarQr(normalized);
    } catch {
      setScanError("Não foi possível ler o QR da imagem. Tente outra foto ou digite o código.");
    }
  };

  const validarQr = async (cod: string) => {
    const normalized = extractQrCode(cod);
    if (!normalized) return toast.error("Informe o código do QR");
    setLoading(true);
    setScanError("");
    try {
      const { data, error } = await supabaseRpc.rpc("app_mecanico_validar_qr_posto", {
        p_acesso_id: mecanico.acesso_id,
        p_codigo: normalized,
      });
      const result = data as { ok?: boolean; error?: string; posto?: Posto; postos?: Posto[]; mecanico?: MecInfo } | null;
      if (error || !result?.ok || !result.posto) {
        const message = result?.error === "qr_nao_encontrado" ? "QR Code do posto não encontrado." : fuelErrorMessage(result?.error || error?.message);
        setScanError(message);
        toast.error(message);
        return;
      }
      const veiculosInfo = (result.mecanico?.veiculos || [])
        .map((item) => ({ ...item, placa: normalizePlate(item.placa) }))
        .filter((item) => Boolean(item.placa));
      const placas = [...new Set((veiculosInfo.length ? veiculosInfo.map((item) => item.placa) : result.mecanico?.carros || [])
        .map(normalizePlate)
        .filter(Boolean))];
      const initialPlate = normalizePlate(result.mecanico?.placa || (!result.mecanico?.exige_selecao_carro && placas.length === 1 ? placas[0] : ""));
      const options = (result.postos || []).filter(Boolean);
      setPostosOpcao(options);
      setPosto(options.length === 1 ? options[0] : result.posto);
      setMecInfo(result.mecanico || null);
      setCarros(placas);
      setVeiculos(veiculosInfo);
      setPlaca(initialPlate);
      setKmAtual(result.mecanico?.ultimo_km ? String(Math.round(Number(result.mecanico.ultimo_km))) : "");
      setStep("painel");
    } finally {
      setLoading(false);
    }
  };

  const onCapturePainel = async (blob: Blob) => {
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "painel", blob);
      setFotoPainelUrl(url);
      setOcrLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ocr-bomba-combustivel", {
          body: { fileUrl: url, tipo: "painel_km" },
        });
        const ocr = data as PanelOcrResult | null;
        const kmLido = !error && ocr?.ok ? normalizeKmOcrField(ocr) : null;
        if (kmLido) {
          setKmAtual(String(kmLido));
          toast.success("KM lido automaticamente. Confira antes de salvar.");
        } else {
          toast.info("Foto do painel salva. Confira o KM manualmente.");
        }
      } catch (error) {
        console.warn("OCR do painel indisponível:", error);
        toast.info("Foto do painel salva. Confira o KM manualmente.");
      } finally {
        setOcrLoading(false);
      }
      setStep("bomba");
    } finally {
      setLoading(false);
    }
  };

  const onCaptureBomba = async (blob: Blob) => {
    if (!posto || !fotoPainelUrl) throw new Error("Foto do painel ou posto não encontrado.");
    if (postosOpcao.length > 1 && posto.tipo_qr === "unidade") throw new Error("Selecione o posto antes das fotos.");
    if (!normalizePlate(placa)) throw new Error("Selecione ou informe a placa antes da foto da bomba.");

    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "bomba", blob);
      setFotoBombaUrl(url);
      setOcrLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ocr-bomba-combustivel", {
          body: { fileUrl: url, tipo: "bomba" },
        });
        const ocr = data as PumpOcrResult | null;
        if (!error && ocr?.ok) {
          const fields = normalizePumpOcrFields(ocr);
          if (fields.valor) setValor(formatNumberInput(fields.valor, 2));
          if (fields.litros) setLitros(formatNumberInput(fields.litros, 3));
          if (ocr.combustivel && FUEL_OPTIONS.includes(ocr.combustivel)) setCombustivel(ocr.combustivel);
          if (fields.valor && fields.litros) toast.success("Bomba lida automaticamente. Confira os dados antes de salvar.");
          else toast.info("Foto da bomba salva. Complete os dados que não foram lidos.");
        } else {
          toast.info("Foto da bomba salva. Confira valor, litros e combustível manualmente.");
        }
      } catch (error) {
        console.warn("OCR da bomba indisponível:", error);
        toast.info("Foto da bomba salva. Confira os dados manualmente.");
      } finally {
        setOcrLoading(false);
      }
      setStep("revisao");
    } finally {
      setLoading(false);
    }
  };

  const confirmarAbastecimento = async () => {
    if (!posto || !fotoPainelUrl || !fotoBombaUrl) return toast.error("As duas fotos são obrigatórias.");
    if (postosOpcao.length > 1 && posto.tipo_qr === "unidade") return toast.error("Selecione o posto.");
    if (!dadosAbastecimentoValidos) return toast.error("Confira placa, combustível, litros, valor e KM.");

    setLoading(true);
    try {
      const location = await getBrowserLocation();
      if (location.latitude == null || location.longitude == null) {
        toast.error("Ative a localização do aparelho. O abastecimento não é salvo sem GPS.");
        return;
      }

      const { data, error } = await supabaseRpc.rpc("app_mecanico_registrar_abastecimento_posto", {
        p_acesso_id: mecanico.acesso_id,
        p_posto_codigo: posto.codigo,
        p_valor: valorNumero,
        p_litros: litrosNumero,
        p_combustivel: combustivel,
        p_km: kmNumero,
        p_placa: normalizePlate(placa),
        p_observacao: `Abastecimento registrado pelo app. Preço/L: ${valorPorLitro ? valorPorLitro.toFixed(3) : "-"}`,
        p_foto_bomba_url: fotoBombaUrl,
        p_foto_painel_url: fotoPainelUrl,
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_endereco: null,
      });
      const result = data as { ok?: boolean; error?: string; id?: string; duplicado?: boolean; ultimo_km?: number } | null;
      if (error || !result?.ok || !result.id) {
        toast.error(fuelErrorMessage(result?.error || error?.message, result as Record<string, unknown> | undefined));
        return;
      }

      const info: ReceiptInfo = {
        id: result.id,
        codigo: posto.codigo,
        postoNome: posto.nome,
        postoCnpj: posto.cnpj || "",
        mecanicoNome: mecInfo?.nome || mecanico.nome,
        empresa: mecInfo?.empresa || mecanico.empresa,
        filial: mecInfo?.filial || mecanico.filial,
        placa: normalizePlate(placa),
        veiculo: veiculoSelecionado?.descricao || "",
        combustivel,
        valor: valorNumero || 0,
        litros: litrosNumero || 0,
        valorPorLitro,
        kmAtual: kmNumero,
        fotoBombaUrl,
        fotoPainelUrl,
        createdAt: new Date(),
      };

      setReceipt(info);
      setStep("ok");

      try {
        const pdf = await gerarCupomAbastecimentoPdf(info);
        const reciboPdfUrl = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, `recibo-${info.id}`, pdf.blob);
        const linked = await supabaseRpc.rpc("app_mecanico_vincular_recibo_pdf", {
          p_acesso_id: mecanico.acesso_id,
          p_abastecimento_id: info.id,
          p_recibo_pdf_url: reciboPdfUrl,
        });
        const linkedResult = linked.data as { ok?: boolean; error?: string } | null;
        if (linked.error || !linkedResult?.ok) throw new Error(linkedResult?.error || linked.error?.message || "Erro ao vincular PDF");
        info.reciboPdfUrl = reciboPdfUrl;
        setReceipt({ ...info });
        setPdfCache(pdf);
        toast.success(result.duplicado ? "Abastecimento já estava registrado. Registro preservado." : "Abastecimento registrado com sucesso.");
      } catch (pdfError) {
        console.warn("Abastecimento salvo; falha apenas no comprovante PDF:", pdfError);
        toast.success("Abastecimento registrado. O comprovante não foi gerado neste momento, mas o registro e as fotos estão salvos.");
      }
    } finally {
      setLoading(false);
    }
  };

  const sharePdf = async () => {
    if (!pdfCache) return;
    const file = new File([pdfCache.blob], pdfCache.fileName, { type: "application/pdf" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: "Comprovante de abastecimento TOPAC", files: [file] });
      return;
    }
    downloadPdf();
  };

  const viewPdf = () => {
    if (!pdfCache) return;
    const url = URL.createObjectURL(pdfCache.blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  };

  const downloadPdf = () => {
    if (!pdfCache) return;
    const url = URL.createObjectURL(pdfCache.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = pdfCache.fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const reset = () => {
    stopScanner();
    setStep("scan");
    setPosto(null);
    setPostosOpcao([]);
    setMecInfo(null);
    setCodigo("");
    setFotoPainelUrl("");
    setFotoBombaUrl("");
    setPlaca("");
    setCarros([]);
    setVeiculos([]);
    setCombustivel("Diesel S10");
    setLitros("");
    setValor("");
    setKmAtual("");
    setReceipt(null);
    setPdfCache(null);
    setScanError("");
  };

  const postoPrecisaSelecao = Boolean(postosOpcao.length > 1 && posto?.tipo_qr === "unidade");

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600"><Fuel className="h-5 w-5" /></div>
          <div><h1 className="text-base font-bold">Abastecimento</h1><p className="text-xs text-muted-foreground">QR + fotos ao vivo + OCR + GPS</p></div>
        </div>
      </Card>

      {step === "scan" && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><QrCode className="h-4 w-4" /> Ler QR Code do posto</div>
          <div className={`overflow-hidden rounded-lg border bg-muted ${scanning ? "block aspect-square" : "hidden"}`}><video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay /></div>
          <Button className="w-full" onClick={scanning ? stopScanner : iniciarScanner} disabled={loading}><Camera className="mr-2 h-4 w-4" />{scanning ? "Parar câmera" : "Abrir câmera para ler QR"}</Button>
          {scanError && <AlertBox text={scanError} />}
          <div className="space-y-2 border-t pt-3">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void lerArquivoQr(file); event.target.value = ""; }} />
            <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()}>Ler QR de uma imagem</Button>
          </div>
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs">Ou digite o código</Label>
            <div className="flex gap-2"><Input value={codigo} onChange={(event) => setCodigo(event.target.value)} placeholder="COMB-SP-001" /><Button onClick={() => void validarQr(codigo)} disabled={loading || !codigo}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}</Button></div>
          </div>
        </Card>
      )}

      {step === "painel" && posto && (
        <Card className="space-y-4 p-4">
          <div className="space-y-1 text-sm">
            <div><b>Mecânico:</b> {mecInfo?.nome}</div>
            <div><b>Unidade/Posto:</b> {posto.nome}</div>
          </div>

          {postosOpcao.length > 1 && (
            <div><Label className="text-xs">Posto</Label><select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={posto.tipo_qr === "unidade" ? "" : posto.codigo} onChange={(event) => { const selected = postosOpcao.find((item) => item.codigo === event.target.value); if (selected) setPosto(selected); }}><option value="">Selecionar posto</option>{postosOpcao.map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}</select></div>
          )}

          {mecInfo?.exige_selecao_carro && carros.length > 0 && (
            <div><Label className="text-xs">Veículo conhecido</Label><select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={carros.includes(normalizePlate(placa)) ? normalizePlate(placa) : ""} onChange={(event) => setPlaca(normalizePlate(event.target.value))}><option value="">Selecionar veículo</option>{carros.map((item) => <option key={item} value={item}>{veiculos.find((v) => normalizePlate(v.placa) === item)?.descricao || item} · {item}</option>)}</select></div>
          )}

          {mecInfo?.permite_placa_manual && (
            <div className="space-y-1.5 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-3">
              <Label className="text-xs">Placa do veículo da frota</Label>
              <Input value={placa} onChange={(event) => setPlaca(normalizePlate(event.target.value))} placeholder="ABC1D23" maxLength={7} autoCapitalize="characters" className="h-11 font-semibold uppercase" />
              <p className="text-[11px] text-muted-foreground">Se o carro compartilhado não aparecer na lista, informe a placa. O sistema só aceita veículo ativo existente na frota central.</p>
            </div>
          )}

          {!mecInfo?.exige_selecao_carro && normalizePlate(placa) && <div className="rounded-lg bg-muted p-3 text-sm"><span className="text-muted-foreground">Veículo</span><strong className="ml-2">{veiculoSelecionado?.descricao || normalizePlate(placa)} · {normalizePlate(placa)}</strong></div>}

          <AlertBox text="Primeiro tire a foto ao vivo do painel. O sistema tentará ler o hodômetro automaticamente." />
          <Button className="w-full" onClick={() => setCamPainel(true)} disabled={postoPrecisaSelecao || !normalizePlate(placa) || loading}><Gauge className="mr-2 h-4 w-4" /> Tirar foto do painel/KM</Button>
          <Button className="w-full" variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" /> Cancelar</Button>
        </Card>
      )}

      {step === "bomba" && (
        <Card className="space-y-4 p-4">
          <img src={fotoPainelUrl} className="w-full rounded-lg" alt="Painel" />
          <div className="space-y-2">
            <Label className="text-xs">KM atual — confira o OCR</Label>
            <Input inputMode="numeric" value={kmAtual} onChange={(event) => setKmAtual(event.target.value.replace(/\D/g, ""))} placeholder="Ex.: 55128" className="h-12 text-lg font-semibold" />
            {mecInfo?.ultimo_km ? <p className="text-[11px] text-muted-foreground">Último KM conhecido no início do fluxo: {Number(mecInfo.ultimo_km).toLocaleString("pt-BR")} km.</p> : null}
          </div>
          <AlertBox text="Agora tire a foto ao vivo da bomba mostrando TOTAL, LITROS e PREÇO/L. O sistema fará a leitura e abrirá a conferência antes de salvar." />
          <Button className="w-full" onClick={() => setCamBomba(true)} disabled={loading || ocrLoading || !kmNumero}><Camera className="mr-2 h-4 w-4" /> Tirar foto da bomba</Button>
          <Button className="w-full" variant="outline" onClick={() => { setFotoPainelUrl(""); setKmAtual(""); setStep("painel"); }}><Gauge className="mr-2 h-4 w-4" /> Refazer painel</Button>
        </Card>
      )}

      {step === "revisao" && (
        <Card className="space-y-4 p-4">
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-amber-500" /> Confira antes de salvar</div>
          <div className="grid grid-cols-2 gap-2"><img src={fotoBombaUrl} className="h-32 w-full rounded-lg object-cover" alt="Bomba" /><img src={fotoPainelUrl} className="h-32 w-full rounded-lg object-cover" alt="Painel" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Combustível</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={combustivel} onChange={(event) => setCombustivel(event.target.value)}>{FUEL_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            </div>
            <div><Label className="text-xs">Litros</Label><Input inputMode="decimal" value={litros} onChange={(event) => setLitros(event.target.value)} placeholder="42,500" /></div>
            <div><Label className="text-xs">Valor total (R$)</Label><Input inputMode="decimal" value={valor} onChange={(event) => setValor(event.target.value)} placeholder="268,75" /></div>
            <div><Label className="text-xs">KM atual</Label><Input inputMode="numeric" value={kmAtual} onChange={(event) => setKmAtual(event.target.value.replace(/\D/g, ""))} placeholder="55128" /></div>
          </div>
          <div className="rounded-lg bg-muted p-3 text-xs"><b>Veículo:</b> {normalizePlate(placa)}<br /><b>Posto:</b> {posto?.nome || "-"}</div>
          {valorPorLitro && <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">Preço calculado: R$ {valorPorLitro.toFixed(3).replace(".", ",")} por litro</div>}
          <div className="flex items-start gap-2 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> O GPS será capturado na confirmação. Sem localização nada é gravado.</div>
          <Button className="h-12 w-full" onClick={() => void confirmarAbastecimento()} disabled={loading || ocrLoading || !dadosAbastecimentoValidos}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-2 h-4 w-4" /> Confirmar e salvar abastecimento</>}</Button>
          <Button className="w-full" variant="outline" onClick={() => { setFotoBombaUrl(""); setStep("bomba"); }}><RotateCcw className="mr-2 h-4 w-4" /> Refazer foto da bomba</Button>
        </Card>
      )}

      {step === "ok" && receipt && (
        <Card className="space-y-4 p-4">
          <div className="text-center"><Check className="mx-auto h-10 w-10 text-emerald-500" /><div className="mt-2 text-lg font-bold">Abastecimento registrado</div><p className="text-sm text-muted-foreground">Dados e fotos estão salvos no sistema.</p></div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-xs">
            <div><b>Combustível</b><br />{receipt.combustivel}</div>
            <div><b>Litros</b><br />{receipt.litros.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L</div>
            <div><b>Valor</b><br />R$ {receipt.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div><b>KM</b><br />{receipt.kmAtual != null ? receipt.kmAtual.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "-"}</div>
          </div>
          <div className="grid grid-cols-2 gap-2"><img src={receipt.fotoBombaUrl} className="h-32 w-full rounded-lg object-cover" alt="Bomba" /><img src={receipt.fotoPainelUrl} className="h-32 w-full rounded-lg object-cover" alt="Painel" /></div>
          {pdfCache ? (
            <>
              <Button onClick={() => void sharePdf()} className="w-full"><Share2 className="mr-2 h-4 w-4" /> Compartilhar PDF</Button>
              <div className="grid grid-cols-2 gap-2"><Button onClick={viewPdf} variant="outline"><Eye className="mr-2 h-4 w-4" /> Abrir PDF</Button><Button onClick={downloadPdf} variant="outline"><FileDown className="mr-2 h-4 w-4" /> Baixar</Button></div>
            </>
          ) : <AlertBox text="O abastecimento foi salvo normalmente. Apenas o PDF não ficou disponível neste momento." />}
          <Button onClick={reset} variant="ghost" className="w-full">Novo abastecimento</Button>
        </Card>
      )}

      {(loading || ocrLoading) && step !== "scan" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"><div className="rounded-lg bg-background p-5 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p className="mt-2 text-sm">{ocrLoading ? "Lendo a foto..." : "Processando..."}</p></div></div>}
      <CameraCapture open={camPainel} onClose={() => setCamPainel(false)} onCapture={onCapturePainel} facing="environment" allowGallery={false} title="Foto do painel/KM" hint="Enquadre o ODO/KM total do painel. A foto deve ser tirada agora." />
      <CameraCapture open={camBomba} onClose={() => setCamBomba(false)} onCapture={onCaptureBomba} facing="environment" allowGallery={false} title="Foto da bomba" hint="Enquadre TOTAL, LITROS e PREÇO/L. A foto deve ser tirada agora." />
    </div>
  );
}

function AlertBox({ text }: { text: string }) {
  return <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0" />{text}</div>;
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
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 7);
}

function parseBrNumber(value: string) {
  const raw = String(value || "").trim().replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumberInput(value: number, digits: number) {
  return Number(value).toFixed(digits).replace(".", ",");
}