import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Copy, Fuel, Gauge, Loader2, MessageCircle, QrCode, RotateCcw, Share2 } from "lucide-react";
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
}

interface MecInfo {
  nome: string;
  empresa: string;
  filial: string;
  placa?: string | null;
  carros?: string[];
  exige_selecao_carro?: boolean;
  ultimo_km?: number | null;
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
}

const CANONICAL_BASE_URL = "https://implantarhprpro.com";
const supabaseRpc = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export default function AbastecimentoPage() {
  const { mecanico } = useMecanicoApp();
  const [step, setStep] = useState<Step>("scan");
  const [posto, setPosto] = useState<Posto | null>(null);
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
  const [km, setKm] = useState("");
  const [obs, setObs] = useState("");
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSecure = typeof window !== "undefined" && (window.isSecureContext || window.location.hostname === "localhost");
  const isCanonicalHost = typeof window !== "undefined" && window.location.origin === CANONICAL_BASE_URL;
  const canonicalUrl = useMemo(() => {
    if (typeof window === "undefined") return CANONICAL_BASE_URL;
    return `${CANONICAL_BASE_URL}${window.location.pathname}${window.location.search}${window.location.hash}`;
  }, []);
  const kmRodado = useMemo(() => {
    const atual = Number(km);
    const anterior = mecInfo?.ultimo_km;
    if (!Number.isFinite(atual) || typeof anterior !== "number") return null;
    const diff = atual - anterior;
    return diff >= 0 ? diff : null;
  }, [km, mecInfo?.ultimo_km]);

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
          setCodigo(decoded);
          validarQr(decoded);
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
      setCodigo(decoded);
      validarQr(decoded);
    } catch {
      setScanError("Nao foi possivel ler o QR da imagem. Tente outra foto ou digite o codigo.");
    }
  };

  const validarQr = async (cod: string) => {
    if (!cod.trim()) return toast.error("Informe o codigo do QR");
    setLoading(true);
    const { data, error } = await supabaseRpc.rpc("app_mecanico_validar_qr_posto", {
      p_acesso_id: mecanico.acesso_id,
      p_codigo: cod.trim(),
    });
    setLoading(false);
    const r = (data ?? null) as { ok?: boolean; error?: string; posto?: Posto; mecanico?: MecInfo } | null;
    if (error || !r?.ok || !r.posto) {
      const msg = r?.error === "qr_nao_encontrado" ? "QR Code do posto nao encontrado." : "Erro ao validar QR Code.";
      setScanError(msg);
      return toast.error(msg);
    }
    const placas = (r.mecanico?.carros || []).map((item) => String(item).trim().toUpperCase()).filter(Boolean);
    const placaInicial = r.mecanico?.placa || (!r.mecanico?.exige_selecao_carro && placas.length === 1 ? placas[0] : "");
    setPosto(r.posto);
    setMecInfo(r.mecanico || null);
    setCarros(placas);
    setPlaca((placaInicial || "").toUpperCase());
    setStep("vale");
  };

  const analisarFoto = async (blob: Blob, tipo?: "painel_km") => {
    try {
      const dataUrl = await blobToDataUrl(blob);
      const { data } = await supabase.functions.invoke("ocr-bomba-combustivel", { body: { dataUrl, tipo } });
      return data as { ok?: boolean; valor?: string | number; litros?: string | number; valor_por_litro?: string | number; combustivel?: string; km?: string | number; km_atual?: string | number } | null;
    } catch {
      return null;
    }
  };

  const onCaptureBomba = async (blob: Blob) => {
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "bomba", blob);
      setFotoBombaUrl(url);
      const r = await analisarFoto(blob);
      if (r?.ok) {
        if (r.valor) setValor(String(r.valor));
        if (r.litros) setLitros(String(r.litros));
        if (r.valor_por_litro) setPrecoLitro(String(r.valor_por_litro));
        if (r.combustivel) setCombustivel(r.combustivel);
      }
      setStep("painel");
      toast.success("Foto da bomba salva. Agora tire a foto do KM.");
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
      if (r?.ok && detectedKm) setKm(String(detectedKm));
      setStep("form");
    } catch (e) {
      toast.error(getErrorMessage(e) || "Erro no upload do KM");
    } finally {
      setLoading(false);
    }
  };

  const finalizar = async () => {
    if (!posto) return;
    if (!fotoBombaUrl || !fotoPainelUrl) return toast.error("Fotos obrigatorias");
    if (!valor || !litros) return toast.error("Informe valor e litros");
    if (mecInfo?.exige_selecao_carro && !placa) return toast.error("Selecione o carro");
    setLoading(true);
    const { latitude, longitude } = await getBrowserLocation();
    const { data, error } = await supabaseRpc.rpc("app_mecanico_registrar_abastecimento_posto", {
      p_acesso_id: mecanico.acesso_id,
      p_posto_codigo: posto.codigo,
      p_valor: Number(valor),
      p_litros: Number(litros),
      p_combustivel: combustivel,
      p_km: km ? Number(km) : null,
      p_placa: placa || null,
      p_observacao: obs || null,
      p_foto_bomba_url: fotoBombaUrl,
      p_foto_painel_url: fotoPainelUrl,
      p_latitude: latitude,
      p_longitude: longitude,
      p_endereco: null,
    });
    setLoading(false);
    const r = (data ?? null) as { ok?: boolean; error?: string; id?: string; preco_litro?: string | number; valor_por_litro?: string | number; km_rodado?: number | null } | null;
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
    });
    setStep("ok");
    toast.success("Abastecimento registrado!");
  };

  const buildReceiptText = (info: ReceiptInfo) =>
    [
      "*TOPAC RH PRO - Abastecimento*",
      `Registro: ${info.id || "salvo"}`,
      `Data/Hora: ${info.createdAt.toLocaleString("pt-BR")}`,
      "",
      `Mecanico: ${info.mecanicoNome}`,
      `Empresa: ${info.empresa}${info.filial ? ` - ${info.filial}` : ""}`,
      `Carro/placa: ${info.placa || "nao informado"}`,
      "",
      `Posto: ${info.postoNome}`,
      info.postoCnpj ? `CNPJ: ${info.postoCnpj}` : "",
      info.postoEndereco ? `Endereco: ${info.postoEndereco}` : "",
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

  const openWhatsapp = (phone?: string) => {
    if (!receipt) return;
    const clean = (phone || "").replace(/\D/g, "");
    const target = clean ? `55${clean.replace(/^55/, "")}` : "";
    window.open(`${target ? `https://wa.me/${target}` : "https://wa.me/"}?text=${encodeURIComponent(buildReceiptText(receipt))}`, "_blank", "noopener,noreferrer");
  };

  const reset = () => {
    stopScanner();
    setPosto(null);
    setMecInfo(null);
    setCodigo("");
    setFotoBombaUrl("");
    setFotoPainelUrl("");
    setValor("");
    setLitros("");
    setPrecoLitro("");
    setPlaca("");
    setCarros([]);
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
            <div><b>Posto:</b> {posto.nome}</div>
            {posto.unidade && <div className="text-xs text-muted-foreground">Unidade: {posto.unidade}</div>}
            {posto.cnpj && <div className="text-xs text-muted-foreground">CNPJ: {posto.cnpj}</div>}
            {posto.endereco && <div className="text-xs text-muted-foreground">{posto.endereco}</div>}
            {posto.telefone && <div className="text-xs text-muted-foreground">Telefone/WhatsApp: {posto.telefone}</div>}
            {mecInfo?.placa && <div className="text-xs text-muted-foreground">Carro vinculado: {mecInfo.placa}</div>}
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
            <Field label="Valor (R$)" value={valor} setValue={setValor} type="number" />
            <Field label="Litros" value={litros} setValue={setLitros} type="number" />
            <Field label="Preco/L" value={precoLitro} setValue={setPrecoLitro} type="number" />
            <div><Label className="text-xs">Combustivel</Label><select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={combustivel} onChange={(e) => setCombustivel(e.target.value)}><option>Diesel S10</option><option>Diesel</option><option>Gasolina</option><option>Etanol</option><option>GNV</option></select></div>
            <div><Field label="KM" value={km} setValue={setKm} type="number" />{kmRodado !== null && <div className="mt-1 text-[11px] text-muted-foreground">Rodou {fmtNumber(String(kmRodado), 0)} km desde o ultimo registro.</div>}</div>
            <div className="col-span-2">
              <Label className="text-xs">{mecInfo?.exige_selecao_carro ? "Carro" : "Placa"}</Label>
              {mecInfo?.exige_selecao_carro && carros.length > 0 ? (
                <select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())}>
                  <option value="">Selecionar carro</option>{carros.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              ) : <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} disabled={Boolean(placa && !mecInfo?.exige_selecao_carro)} />}
            </div>
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
          <Button onClick={() => openWhatsapp()} variant="secondary" className="w-full"><MessageCircle className="mr-2 h-4 w-4" /> Enviar no WhatsApp</Button>
          {receipt.postoTelefone && <Button onClick={() => openWhatsapp(receipt.postoTelefone)} variant="outline" className="w-full"><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp do posto</Button>}
          <Button onClick={() => navigator.clipboard.writeText(buildReceiptText(receipt)).then(() => toast.success("Notinha copiada"))} variant="outline" className="w-full"><Copy className="mr-2 h-4 w-4" /> Copiar texto</Button>
          <Button onClick={reset} variant="ghost" className="w-full">Novo abastecimento</Button>
        </Card>
      )}

      <CameraCapture open={camBomba} onClose={() => setCamBomba(false)} onCapture={onCaptureBomba} facing="environment" title="Foto da bomba" hint="Mostre valor, litros e preco por litro" />
      <CameraCapture open={camPainel} onClose={() => setCamPainel(false)} onCapture={onCapturePainel} facing="environment" title="Foto do painel/KM" hint="Mostre o hodometro/KM atual" />
    </div>
  );
}

function Field({ label, value, setValue, type = "text" }: { label: string; value: string; setValue: (v: string) => void; type?: string }) {
  return <div><Label className="text-xs">{label}</Label><Input type={type} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={(e) => setValue(e.target.value)} /></div>;
}

function Info({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return <div className={wide ? "col-span-2" : ""}><span className="text-muted-foreground">{k}</span><br />{v}</div>;
}

function AlertBox({ text }: { text: string }) {
  return <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" />{text}</div>;
}

function fmtMoney(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : value || "R$ 0,00";
}

function fmtNumber(value: string, digits = 3) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: digits }) : value || "0";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}
