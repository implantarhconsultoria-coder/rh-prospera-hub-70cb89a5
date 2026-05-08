import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { uploadFoto } from "../lib/upload";
import { getBrowserLocation } from "@/lib/browserGeo";
import CameraCapture from "../components/CameraCapture";
import { toast } from "sonner";
import { Loader2, QrCode, Camera, Fuel, Gauge, Check, RotateCcw } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

type Step = "scan" | "vale" | "bomba" | "painel" | "form" | "ok";

interface Posto {
  id: string; codigo: string; nome: string;
  cnpj: string | null; endereco: string | null; telefone: string | null;
}
interface MecInfo { nome: string; empresa: string; filial: string; }

export default function AbastecimentoPage() {
  const { mecanico } = useMecanicoApp();
  const [step, setStep] = useState<Step>("scan");
  const [posto, setPostoData] = useState<Posto | null>(null);
  const [mecInfo, setMecInfo] = useState<MecInfo | null>(null);
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);

  const [camBomba, setCamBomba] = useState(false);
  const [camPainel, setCamPainel] = useState(false);
  const [fotoBombaUrl, setFotoBombaUrl] = useState<string | null>(null);
  const [fotoPainelUrl, setFotoPainelUrl] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);

  const [valor, setValor] = useState("");
  const [litros, setLitros] = useState("");
  const [combustivel, setCombustivel] = useState("Diesel S10");
  const [postoNome, setPostoNome] = useState("");
  const [placa, setPlaca] = useState("");
  const [km, setKm] = useState("");
  const [obs, setObs] = useState("");

  // ----- QR Scanner -----
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (step !== "scan") return;
    let mounted = true;
    (async () => {
      try {
        const id = "qr-reader-box";
        const el = document.getElementById(id);
        if (!el) return;
        const inst = new Html5Qrcode(id);
        scannerRef.current = inst;
        setScanning(true);
        await inst.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (!mounted) return;
            setCodigo(decoded);
            inst.stop().then(() => inst.clear()).catch(() => {});
            scannerRef.current = null;
            validarQr(decoded);
          },
          () => {},
        );
      } catch (e: any) {
        toast.error("Permita acesso à câmera para ler o QR Code.");
        setScanning(false);
      }
    })();
    return () => {
      mounted = false;
      const s = scannerRef.current;
      if (s) { s.stop().then(() => s.clear()).catch(() => {}); scannerRef.current = null; }
    };
  }, [step]);

  const validarQr = async (cod: string) => {
    if (!cod) { toast.error("Informe o código do QR"); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("app_mecanico_validar_qr_posto" as any, {
      p_acesso_id: mecanico.acesso_id, p_codigo: cod,
    });
    setLoading(false);
    const r = data as any;
    if (error || !r?.ok) {
      const err = r?.error || error?.message || "qr_invalido";
      const map: Record<string, string> = {
        qr_nao_encontrado: "QR Code não encontrado.",
        qr_bloqueado: "QR Code bloqueado pelo administrador.",
        acesso_nao_autorizado: "Acesso não autorizado.",
      };
      toast.error(map[err] || "Erro ao validar QR Code.");
      setStep("scan");
      return;
    }
    setPostoData(r.posto);
    setMecInfo(r.mecanico);
    setPostoNome(r.posto?.nome || "");
    setStep("vale");
  };

  const onCaptureBomba = async (blob: Blob) => {
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "bomba", blob);
      setFotoBombaUrl(url);
      setAnalisando(true);
      try {
        const dataUrl = await blobToDataUrl(blob);
        const { data } = await supabase.functions.invoke("ocr-bomba-combustivel", { body: { dataUrl } });
        const r: any = data;
        if (r?.ok) {
          if (r.valor) setValor(String(r.valor));
          if (r.litros) setLitros(String(r.litros));
          if (r.combustivel) setCombustivel(r.combustivel);
        }
      } catch { /* ok, manual */ }
      setAnalisando(false);
      setStep("painel");
      toast.success("Foto da bomba salva. Agora a foto do painel/KM.");
    } catch (e: any) {
      toast.error(e.message || "Erro no upload");
    } finally { setLoading(false); }
  };

  const onCapturePainel = async (blob: Blob) => {
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "painel", blob);
      setFotoPainelUrl(url);
      setStep("form");
    } catch (e: any) {
      toast.error(e.message || "Erro no upload");
    } finally { setLoading(false); }
  };

  const finalizar = async () => {
    if (!posto) return;
    if (!fotoBombaUrl || !fotoPainelUrl) { toast.error("Fotos obrigatórias"); return; }
    if (!valor || !litros) { toast.error("Informe valor e litros"); return; }
    setLoading(true);
    const { latitude, longitude } = await getBrowserLocation();
    const { data, error } = await supabase.rpc("app_mecanico_registrar_abastecimento_posto" as any, {
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
      p_latitude: latitude, p_longitude: longitude, p_endereco: null,
    });
    setLoading(false);
    const r = data as any;
    if (error || !r?.ok) {
      toast.error(r?.error || error?.message || "Erro ao salvar");
      return;
    }
    toast.success("Abastecimento registrado!");
    setStep("ok");
  };

  const reset = () => {
    setPostoData(null); setMecInfo(null); setCodigo(""); setFotoBombaUrl(null); setFotoPainelUrl(null);
    setValor(""); setLitros(""); setKm(""); setObs(""); setStep("scan");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
            <Fuel className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold">Abastecimento</h1>
            <p className="text-xs text-muted-foreground">QR Code + foto da bomba + foto do painel</p>
          </div>
        </div>
      </Card>

      {step === "scan" && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><QrCode className="w-4 h-4" /> Leia o QR Code</div>
          <div id="qr-reader-box" className="w-full rounded-xl overflow-hidden bg-black aspect-square" />
          <div className="text-[11px] text-muted-foreground text-center">Aproxime o QR Code da câmera</div>
          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs">Ou digite o código manualmente</Label>
            <div className="flex gap-2">
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="COMB-XXXXXXX" />
              <Button onClick={() => validarQr(codigo)} disabled={loading || !codigo}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === "vale" && posto && (
        <Card className="p-4 space-y-3">
          <div className="text-xs uppercase text-muted-foreground font-semibold">QR validado</div>
          <div className="space-y-1 text-sm">
            <div><b>Mecânico:</b> {mecInfo?.nome}</div>
            <div><b>Empresa:</b> {mecInfo?.empresa || "—"} {mecInfo?.filial ? `· ${mecInfo.filial}` : ""}</div>
            <div><b>Posto:</b> {posto.nome}</div>
            {posto.cnpj && <div className="text-xs text-muted-foreground">CNPJ: {posto.cnpj}</div>}
            {posto.endereco && <div className="text-xs text-muted-foreground">{posto.endereco}</div>}
            <div className="text-xs text-muted-foreground">Código: {posto.codigo}</div>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleString("pt-BR")}</div>
          </div>
          <Button className="w-full" onClick={() => setCamBomba(true)}>
            <Camera className="w-4 h-4 mr-2" /> Tirar foto da bomba
          </Button>
          <Button className="w-full" variant="outline" onClick={reset}>
            <RotateCcw className="w-4 h-4 mr-2" /> Cancelar
          </Button>
        </Card>
      )}

      {step === "painel" && (
        <Card className="p-4 space-y-3">
          {analisando && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Analisando foto da bomba...
            </div>
          )}
          {fotoBombaUrl && <img src={fotoBombaUrl} className="w-full rounded-lg" alt="Bomba" />}
          <Button className="w-full" onClick={() => setCamPainel(true)}>
            <Gauge className="w-4 h-4 mr-2" /> Tirar foto do painel/KM
          </Button>
          <Button className="w-full" variant="outline" onClick={() => setCamBomba(true)}>
            <RotateCcw className="w-4 h-4 mr-2" /> Refazer foto da bomba
          </Button>
        </Card>
      )}

      {step === "form" && (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold">Confirme os dados</div>
          {fotoBombaUrl && fotoPainelUrl && (
            <div className="grid grid-cols-2 gap-2">
              <img src={fotoBombaUrl} className="w-full rounded-lg" alt="Bomba" />
              <img src={fotoPainelUrl} className="w-full rounded-lg" alt="Painel" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" inputMode="decimal" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Litros</Label>
              <Input type="number" inputMode="decimal" step="0.001" value={litros} onChange={(e) => setLitros(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Combustível</Label>
              <select className="w-full border rounded-md h-10 px-2 text-sm bg-background"
                value={combustivel} onChange={(e) => setCombustivel(e.target.value)}>
                <option>Diesel S10</option><option>Diesel</option><option>Gasolina</option>
                <option>Etanol</option><option>GNV</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">KM</Label>
              <Input type="number" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Placa</Label>
              <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Posto</Label>
              <Input value={postoNome} onChange={(e) => setPostoNome(e.target.value)} disabled />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Observação</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>
          <Button className="w-full" onClick={finalizar} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Finalizar abastecimento
          </Button>
        </Card>
      )}

      {step === "ok" && (
        <Card className="p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 mx-auto flex items-center justify-center">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <div className="text-lg font-bold">Abastecimento registrado</div>
          <p className="text-sm text-muted-foreground">As fotos e dados foram salvos.</p>
          <Button onClick={reset} className="w-full">Novo abastecimento</Button>
        </Card>
      )}

      <CameraCapture
        open={camBomba}
        onClose={() => setCamBomba(false)}
        onCapture={onCaptureBomba}
        facing="environment"
        title="Foto da bomba"
        hint="Mostre o visor com valor, litros e tipo"
      />
      <CameraCapture
        open={camPainel}
        onClose={() => setCamPainel(false)}
        onCapture={onCapturePainel}
        facing="environment"
        title="Foto do painel/KM"
        hint="Mostre o hodômetro/KM atual"
      />
    </div>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
