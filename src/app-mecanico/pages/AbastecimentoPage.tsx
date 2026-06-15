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

type Step = "scan" | "painel" | "bomba" | "ok";

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
  fotoBombaUrl: string;
  fotoPainelUrl: string;
  createdAt: Date;
  reciboPdfUrl?: string;
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
  const [fotoPainelUrl, setFotoPainelUrl] = useState("");
  const [placa, setPlaca] = useState("");
  const [carros, setCarros] = useState<string[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoInfo[]>([]);
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
      setScanError("Nao foi possivel abrir a camera. Use a galeria ou digite o codigo.");
    }
  };

  const lerArquivoQr = async (file: File) => {
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true });
      const normalized = extractQrCode(typeof result === "string" ? result : result.data);
      setCodigo(normalized);
      await validarQr(normalized);
    } catch {
      setScanError("Nao foi possivel ler o QR da imagem. Tente outra foto ou digite o codigo.");
    }
  };

  const validarQr = async (cod: string) => {
    const normalized = extractQrCode(cod);
    if (!normalized) return toast.error("Informe o codigo do QR");
    setLoading(true);
    setScanError("");
    try {
      const { data, error } = await supabaseRpc.rpc("app_mecanico_validar_qr_posto", {
        p_acesso_id: mecanico.acesso_id,
        p_codigo: normalized,
      });
      const result = data as { ok?: boolean; error?: string; posto?: Posto; postos?: Posto[]; mecanico?: MecInfo } | null;
      if (error || !result?.ok || !result.posto) {
        const message = result?.error === "qr_nao_encontrado" ? "QR Code do posto nao encontrado." : "Erro ao validar QR Code.";
        setScanError(message);
        toast.error(message);
        return;
      }
      const veiculosInfo = (result.mecanico?.veiculos || [])
        .map((item) => ({ ...item, placa: normalizePlate(item.placa) }))
        .filter((item) => Boolean(item.placa));
      const placas = (veiculosInfo.length ? veiculosInfo.map((item) => item.placa) : result.mecanico?.carros || [])
        .map(normalizePlate)
        .filter(Boolean);
      const initialPlate = result.mecanico?.placa || (!result.mecanico?.exige_selecao_carro && placas.length === 1 ? placas[0] : "");
      const options = (result.postos || []).filter(Boolean);
      setPostosOpcao(options);
      setPosto(options.length === 1 ? options[0] : result.posto);
      setMecInfo(result.mecanico || null);
      setCarros(placas);
      setVeiculos(veiculosInfo);
      setPlaca(normalizePlate(initialPlate));
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
      setStep("bomba");
      toast.success("Foto do painel salva. Agora tire a foto da bomba.");
    } finally {
      setLoading(false);
    }
  };

  const onCaptureBomba = async (blob: Blob) => {
    if (!posto || !fotoPainelUrl) throw new Error("Foto do painel ou posto nao encontrado.");
    if (postosOpcao.length > 1 && posto.tipo_qr === "unidade") throw new Error("Selecione o posto antes das fotos.");
    if (mecInfo?.exige_selecao_carro && !placa) throw new Error("Selecione o veiculo antes das fotos.");

    const previewWindow = window.open("", "_blank");
    setLoading(true);
    try {
      const fotoBombaUrl = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "bomba", blob);
      const location = await getBrowserLocation();
      const { data, error } = await supabaseRpc.rpc("app_mecanico_registrar_abastecimento_posto", {
        p_acesso_id: mecanico.acesso_id,
        p_posto_codigo: posto.codigo,
        p_valor: null,
        p_litros: null,
        p_combustivel: null,
        p_km: null,
        p_placa: placa || null,
        p_observacao: "Dados do abastecimento registrados exclusivamente nas fotos da bomba e do painel.",
        p_foto_bomba_url: fotoBombaUrl,
        p_foto_painel_url: fotoPainelUrl,
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_endereco: null,
      });
      const result = data as { ok?: boolean; error?: string; id?: string } | null;
      if (error || !result?.ok || !result.id) throw new Error(result?.error || error?.message || "Erro ao salvar abastecimento");

      const info: ReceiptInfo = {
        id: result.id,
        codigo: posto.codigo,
        postoNome: posto.nome,
        postoCnpj: posto.cnpj || "",
        mecanicoNome: mecInfo?.nome || mecanico.nome,
        empresa: mecInfo?.empresa || mecanico.empresa,
        filial: mecInfo?.filial || mecanico.filial,
        placa,
        veiculo: veiculoSelecionado?.descricao || "",
        fotoBombaUrl,
        fotoPainelUrl,
        createdAt: new Date(),
      };
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
      setReceipt(info);
      setPdfCache(pdf);
      setStep("ok");
      const previewUrl = URL.createObjectURL(pdf.blob);
      if (previewWindow) previewWindow.location.href = previewUrl;
      else window.open(previewUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 120000);
      toast.success("PDF pronto para compartilhar.");
    } catch (error) {
      previewWindow?.close();
      throw error;
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
    setPlaca("");
    setCarros([]);
    setVeiculos([]);
    setReceipt(null);
    setPdfCache(null);
    setScanError("");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600"><Fuel className="h-5 w-5" /></div>
          <div><h1 className="text-base font-bold">Abastecimento</h1><p className="text-xs text-muted-foreground">QR Code + foto do painel + foto da bomba</p></div>
        </div>
      </Card>

      {step === "scan" && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><QrCode className="h-4 w-4" /> Ler QR Code do posto</div>
          <div className={`overflow-hidden rounded-lg border bg-muted ${scanning ? "block aspect-square" : "hidden"}`}><video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay /></div>
          <Button className="w-full" onClick={scanning ? stopScanner : iniciarScanner} disabled={loading}><Camera className="mr-2 h-4 w-4" />{scanning ? "Parar camera" : "Abrir camera para ler QR"}</Button>
          {scanError && <AlertBox text={scanError} />}
          <div className="border-t pt-3 space-y-2">
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void lerArquivoQr(file); event.target.value = ""; }} />
            <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()}>Enviar imagem do QR</Button>
          </div>
          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs">Ou digite o codigo</Label>
            <div className="flex gap-2"><Input value={codigo} onChange={(event) => setCodigo(event.target.value)} placeholder="COMB-SP-001" /><Button onClick={() => void validarQr(codigo)} disabled={loading || !codigo}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}</Button></div>
          </div>
        </Card>
      )}

      {step === "painel" && posto && (
        <Card className="space-y-4 p-4">
          <div className="space-y-1 text-sm">
            <div><b>Mecanico:</b> {mecInfo?.nome}</div>
            <div><b>Posto:</b> {posto.nome}</div>
          </div>
          {postosOpcao.length > 1 && (
            <div><Label className="text-xs">Posto</Label><select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={posto.tipo_qr === "unidade" ? "" : posto.codigo} onChange={(event) => { const selected = postosOpcao.find((item) => item.codigo === event.target.value); if (selected) setPosto(selected); }}><option value="">Selecionar posto</option>{postosOpcao.map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}</select></div>
          )}
          {mecInfo?.exige_selecao_carro && carros.length > 0 && (
            <div><Label className="text-xs">Veiculo</Label><select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={placa} onChange={(event) => setPlaca(event.target.value)}><option value="">Selecionar veiculo</option>{carros.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
          )}
          <AlertBox text="Nao precisa digitar valor, litros ou KM. Esses dados ficarao registrados nas fotos." />
          <Button className="w-full" onClick={() => setCamPainel(true)} disabled={(postosOpcao.length > 1 && posto.tipo_qr === "unidade") || Boolean(mecInfo?.exige_selecao_carro && !placa)}><Gauge className="mr-2 h-4 w-4" /> Tirar foto do painel/KM</Button>
          <Button className="w-full" variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" /> Cancelar</Button>
        </Card>
      )}

      {step === "bomba" && (
        <Card className="space-y-4 p-4">
          <img src={fotoPainelUrl} className="w-full rounded-lg" alt="Painel" />
          <AlertBox text="Agora tire a foto da bomba. Depois dela, o PDF sera aberto automaticamente." />
          <Button className="w-full" onClick={() => setCamBomba(true)} disabled={loading}><Camera className="mr-2 h-4 w-4" /> Tirar foto da bomba</Button>
          <Button className="w-full" variant="outline" onClick={() => { setFotoPainelUrl(""); setStep("painel"); }}><Gauge className="mr-2 h-4 w-4" /> Refazer painel</Button>
        </Card>
      )}

      {step === "ok" && receipt && (
        <Card className="space-y-4 p-4">
          <div className="text-center"><Check className="mx-auto h-10 w-10 text-emerald-500" /><div className="mt-2 text-lg font-bold">PDF pronto</div><p className="text-sm text-muted-foreground">As fotos da bomba e do painel estao no comprovante.</p></div>
          <div className="grid grid-cols-2 gap-2"><img src={receipt.fotoBombaUrl} className="h-32 w-full rounded-lg object-cover" alt="Bomba" /><img src={receipt.fotoPainelUrl} className="h-32 w-full rounded-lg object-cover" alt="Painel" /></div>
          <Button onClick={() => void sharePdf()} className="w-full"><Share2 className="mr-2 h-4 w-4" /> Compartilhar PDF</Button>
          <div className="grid grid-cols-2 gap-2"><Button onClick={viewPdf} variant="outline"><Eye className="mr-2 h-4 w-4" /> Abrir PDF</Button><Button onClick={downloadPdf} variant="outline"><FileDown className="mr-2 h-4 w-4" /> Baixar</Button></div>
          <Button onClick={reset} variant="ghost" className="w-full">Novo abastecimento</Button>
        </Card>
      )}

      {loading && step !== "scan" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"><div className="rounded-lg bg-background p-5 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p className="mt-2 text-sm">Gerando o PDF...</p></div></div>}
      <CameraCapture open={camPainel} onClose={() => setCamPainel(false)} onCapture={onCapturePainel} facing="environment" title="Foto do painel/KM" hint="Enquadre o ODO/KM total do painel" />
      <CameraCapture open={camBomba} onClose={() => setCamBomba(false)} onCapture={onCaptureBomba} facing="environment" title="Foto da bomba" hint="Enquadre valor, litros e preco por litro" />
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
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
