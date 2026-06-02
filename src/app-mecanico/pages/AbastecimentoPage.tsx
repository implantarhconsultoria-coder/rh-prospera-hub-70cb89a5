import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Copy, Download, Fuel, Gauge, Loader2, MessageCircle, Printer, QrCode, RotateCcw, Share2 } from "lucide-react";
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

type Step = "scan" | "vale" | "painel" | "form" | "ok";

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
  error?: string;
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
    setLoading(false);
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
    setStep("vale");
  };

  const analisarFoto = async (blob: Blob, tipo?: "painel_km") => {
    try {
      const dataUrl = await blobToOptimizedDataUrl(blob);
      const { data, error } = await supabase.functions.invoke("ocr-bomba-combustivel", { body: { dataUrl, tipo: tipo || "bomba" } });
      if (error) return { ok: false, error: error.message } as OcrResult;
      return data as OcrResult | null;
    } catch (e) {
      console.error("Erro OCR abastecimento:", e);
      return null;
    }
  };

  const aplicarLeituraBomba = (r: OcrResult | null) => {
    if (!r?.ok) return false;
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
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "bomba", blob);
      setFotoBombaUrl(url);
      const r = await analisarFoto(blob);
      const leituraAplicada = aplicarLeituraBomba(r);
      setStep("painel");
      if (leituraAplicada) {
        toast.success("Bomba lida: valor, litros e preco foram preenchidos. Confira e tire a foto do KM.");
      } else {
        toast.warning("Foto da bomba salva, mas a leitura automatica precisa de conferencia manual.");
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
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "painel", blob);
      setFotoPainelUrl(url);
      const r = await analisarFoto(blob, "painel_km");
      const detectedKm = r?.km ?? r?.km_atual;
      const kmLido = parseDecimal(detectedKm);
      if (r?.ok && Number.isFinite(kmLido) && kmLido > 0) {
        setKm(String(Math.round(kmLido)));
        toast.success("KM do painel preenchido automaticamente.");
      } else {
        toast.warning("Foto do painel salva, mas o KM precisa ser conferido manualmente.");
      }
      setStep("form");
    } catch (e) {
      toast.error(getErrorMessage(e) || "Erro no upload do KM");
    } finally {
      setLoading(false);
    }
  };

  const finalizar = async () => {
    if (!posto) return;
    if (postosOpcao.length > 1 && posto.tipo_qr === "unidade") return toast.error("Selecione o posto de Goiania");
    if (!fotoBombaUrl || !fotoPainelUrl) return toast.error("Fotos obrigatorias");
    if (!valor || !litros) return toast.error("Informe valor e litros");
    if (mecInfo?.exige_selecao_carro && !placa) return toast.error("Selecione o carro");
    setLoading(true);
    const { latitude, longitude } = await getBrowserLocation();
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
    setLoading(false);
    const r = (data ?? null) as { ok?: boolean; error?: string; id?: string; preco_litro?: string | number; valor_por_litro?: string | number; km_rodado?: number | null; registro_teste?: boolean } | null;
    if (error || !r?.ok) return toast.error(r?.error || error?.message || "Erro ao salvar");
    setReceipt({
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
    });
    setStep("ok");
    toast.success("Abastecimento registrado!");
  };

  const buildReceiptText = (info: ReceiptInfo) =>
    [
      "*TOPAC RH PRO - Abastecimento*",
      info.registroTeste ? "*REGISTRO DE TESTE - nao entra em relatorios oficiais*" : "",
      `Registro: ${info.id || "salvo"}`,
      `Data/Hora: ${info.createdAt.toLocaleString("pt-BR")}`,
      "",
      `Mecanico: ${info.mecanicoNome}`,
      `Empresa: ${info.empresa}${info.filial ? ` - ${info.filial}` : ""}`,
      `Carro/placa: ${info.placa || "nao informado"}`,
      `Validado por: ${info.mecanicoNome}`,
      "",
      `Posto: ${info.postoNome}`,
      info.postoCnpj ? `CNPJ: ${info.postoCnpj}` : "",
      info.postoEndereco ? `Endereco: ${info.postoEndereco}` : "",
      info.postoTelefone ? `Telefone: ${info.postoTelefone}` : "",
      `QR: ${info.codigo}`,
      "",
      `Combustivel: ${info.combustivel}`,
      `Litros: ${fmtNumber(info.litros)} L`,
      `Preco/L: ${fmtMoney(info.precoLitro)}`,
      `Valor: ${fmtMoney(info.valor)}`,
      `KM: ${info.km || "nao informado"}`,
      info.kmRodado !== null ? `KM rodado desde o ultimo registro: ${fmtNumber(String(info.kmRodado), 0)} km` : "",
      info.observacao ? `Obs.: ${info.observacao}` : "",
      "",
      `Foto da bomba: ${info.fotoBombaUrl}`,
      `Foto do KM/painel: ${info.fotoPainelUrl}`,
    ].filter(Boolean).join("\n");

  const shareReceipt = async () => {
    if (!receipt) return;
    const text = buildReceiptText(receipt);
    if (navigator.share) {
      await navigator.share({ title: "Abastecimento TOPAC", text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast.success("Notinha copiada");
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

  const downloadReceipt = () => {
    if (!receipt) return;
    const blob = new Blob([buildReceiptText(receipt)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ABASTECIMENTO_${sanitizeFile(receipt.empresa)}_${sanitizeFile(receipt.mecanicoNome)}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openWhatsapp = (phone?: string) => {
    if (!receipt) return;
    const clean = (phone || "").replace(/\D/g, "");
    const target = clean ? `55${clean.replace(/^55/, "")}` : "";
    window.open(`${target ? `https://wa.me/${target}` : "https://wa.me/"}?text=${encodeURIComponent(buildReceiptText(receipt))}`, "_blank", "noopener,noreferrer");
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
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivoQr(f); e.target.value = ""; }} />
            <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()}>Enviar imagem do QR</Button>
          </div>
          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs">Ou digite o codigo manualmente</Label>
            <div className="flex gap-2"><Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="COMB-SP-001" /><Button onClick={() => validarQr(codigo)} disabled={loading || !codigo}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}</Button></div>
          </div>
        </Card>
      )}

      {step === "vale" && posto && (
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
          <Button className="w-full" onClick={() => setCamBomba(true)}><Camera className="mr-2 h-4 w-4" /> Tirar foto da bomba</Button>
          <Button className="w-full" variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" /> Cancelar</Button>
        </Card>
      )}

      {step === "painel" && (
        <Card className="space-y-3 p-4">
          {fotoBombaUrl && <img src={fotoBombaUrl} className="w-full rounded-lg" alt="Bomba" />}
          <Button className="w-full" onClick={() => setCamPainel(true)}><Gauge className="mr-2 h-4 w-4" /> Tirar foto do painel/KM</Button>
        </Card>
      )}

      {step === "form" && (
        <Card className="space-y-3 p-4">
          <div className="text-sm font-semibold">Confirme os dados</div>
          <div className="grid grid-cols-2 gap-2">{fotoBombaUrl && <img src={fotoBombaUrl} className="w-full rounded-lg" alt="Bomba" />}{fotoPainelUrl && <img src={fotoPainelUrl} className="w-full rounded-lg" alt="Painel" />}</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)" value={valor} setValue={updateValor} type="number" />
            <Field label="Litros" value={litros} setValue={updateLitros} type="number" />
            <Field label="Preco/L" value={precoLitro} setValue={updatePrecoLitro} type="number" />
            <div><Label className="text-xs">Combustivel</Label><select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={combustivel} onChange={(e) => setCombustivel(e.target.value)}><option>Diesel S10</option><option>Diesel</option><option>Gasolina</option><option>Etanol</option><option>GNV</option></select></div>
            <div><Field label="KM" value={km} setValue={setKm} type="number" />{kmRodado !== null && <div className="mt-1 text-[11px] text-muted-foreground">Rodou {fmtNumber(String(kmRodado), 0)} km desde o ultimo registro.</div>}</div>
            <div className="col-span-2">
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
            {veiculoSelecionado && (
              <div className="col-span-2 rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                <div className="font-semibold">{veiculoSelecionado.descricao || veiculoSelecionado.placa}</div>
                <div className="grid grid-cols-2 gap-1">
                  <Info k="Placa" v={veiculoSelecionado.placa || "-"} />
                  <Info k="Renavam" v={veiculoSelecionado.renavam || "-"} />
                  <Info k="Chassi" v={veiculoSelecionado.chassi || "-"} />
                  <Info k="Ano" v={veiculoSelecionado.ano_fabricacao || veiculoSelecionado.ano_modelo || "-"} />
                </div>
                {veiculoSelecionado.documento_url && (
                  <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={() => window.open(veiculoSelecionado.documento_url || "", "_blank", "noopener,noreferrer")}>
                    Visualizar PDF do documento
                  </Button>
                )}
              </div>
            )}
            <div className="col-span-2"><Label className="text-xs">Posto</Label><Input value={posto?.nome || ""} disabled /></div>
            <div className="col-span-2"><Label className="text-xs">Observacao</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} /></div>
          </div>
          <Button className="w-full" onClick={finalizar} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Finalizar abastecimento</Button>
        </Card>
      )}

      {step === "ok" && receipt && (
        <Card className="space-y-4 p-4">
          <div className="text-center"><div className="text-lg font-bold">Abastecimento registrado</div><p className="text-sm text-muted-foreground">Compartilhe a notinha no grupo e no WhatsApp do posto.</p></div>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="font-bold">{receipt.postoNome}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <Info k="Mecanico" v={receipt.mecanicoNome} wide /><Info k="Carro" v={receipt.placa || "-"} /><Info k="KM" v={receipt.km || "-"} />
              <Info k="Litros" v={`${fmtNumber(receipt.litros)} L`} /><Info k="Preco/L" v={fmtMoney(receipt.precoLitro)} /><Info k="Valor" v={fmtMoney(receipt.valor)} />
              {receipt.kmRodado !== null && <Info k="KM rodado" v={`${fmtNumber(String(receipt.kmRodado), 0)} km`} />}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2"><img src={receipt.fotoBombaUrl} className="h-28 w-full rounded-lg object-cover" alt="Bomba" /><img src={receipt.fotoPainelUrl} className="h-28 w-full rounded-lg object-cover" alt="Painel" /></div>
          </div>
          <Button onClick={shareReceipt} className="w-full"><Share2 className="mr-2 h-4 w-4" /> Compartilhar notinha</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={printReceipt} variant="outline" className="w-full"><Printer className="mr-2 h-4 w-4" /> Imprimir</Button>
            <Button onClick={downloadReceipt} variant="outline" className="w-full"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
          </div>
          <Button onClick={() => openWhatsapp()} variant="secondary" className="w-full"><MessageCircle className="mr-2 h-4 w-4" /> Enviar no WhatsApp</Button>
          {receipt.postoTelefone && <Button onClick={() => openWhatsapp(receipt.postoTelefone)} variant="outline" className="w-full"><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp do posto</Button>}
          <Button onClick={() => navigator.clipboard.writeText(buildReceiptText(receipt)).then(() => toast.success("Notinha copiada"))} variant="outline" className="w-full"><Copy className="mr-2 h-4 w-4" /> Copiar texto</Button>
          <Button onClick={reset} variant="ghost" className="w-full">Novo abastecimento</Button>
        </Card>
      )}

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

function buildReceiptHtml(info: ReceiptInfo) {
  const text = [
    ["Registro", info.id || "salvo"],
    ["Data/Hora", info.createdAt.toLocaleString("pt-BR")],
    ["Funcionario", info.mecanicoNome],
    ["Unidade", `${info.empresa}${info.filial ? ` - ${info.filial}` : ""}`],
    ["Veiculo", info.placa || "-"],
    ["Posto", info.postoNome],
    ["CNPJ", info.postoCnpj || "-"],
    ["Endereco", info.postoEndereco || "-"],
    ["Telefone", info.postoTelefone || "-"],
    ["Combustivel", info.combustivel],
    ["Litros", `${fmtNumber(info.litros)} L`],
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
    .photos{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
    img{width:100%;max-height:300px;object-fit:contain;border:1px solid #ddd}
  </style></head><body>
    <h1>TOPAC RH PRO - Recibo de Abastecimento</h1>
    ${info.registroTeste ? '<div class="muted"><strong>REGISTRO DE TESTE</strong> - nao impacta relatorios oficiais.</div>' : ''}
    <div class="muted">Comprovante interno gerado pelo app do mecanico.</div>
    <table>${text.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join("")}</table>
    <div class="photos">
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

async function blobToOptimizedDataUrl(blob: Blob): Promise<string> {
  const original = await blobToDataUrl(blob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 1600;
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(original);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(original);
    img.src = original;
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}
