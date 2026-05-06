import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QrCode, Camera, CheckCircle2, Loader2, ArrowRight, Fuel, Gauge } from "lucide-react";
import { toast } from "sonner";
import QRScanner from "../components/QRScanner";
import CameraCapture from "../components/CameraCapture";
import { uploadFoto } from "../lib/upload";
import { useGeolocation } from "@/hooks/useGeolocation";

type Etapa = "qr" | "dados_qr" | "foto_bomba" | "foto_painel" | "form" | "concluido";

interface ValeData {
  id: string; codigo: string; valor_limite?: number; litros_limite?: number;
  status: string; veiculo?: { placa?: string; modelo?: string } | null;
  posto?: { nome?: string } | null;
}

export default function AbastecimentoPage() {
  const { mecanico } = useMecanicoApp();
  const navigate = useNavigate();
  const { getLocation } = useGeolocation();
  const [etapa, setEtapa] = useState<Etapa>("qr");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [vale, setVale] = useState<ValeData | null>(null);
  const [fotoBomba, setFotoBomba] = useState<string | null>(null);
  const [fotoPainel, setFotoPainel] = useState<string | null>(null);
  const [valor, setValor] = useState(""); const [litros, setLitros] = useState("");
  const [posto, setPosto] = useState(""); const [combustivel, setCombustivel] = useState("Diesel S10");
  const [km, setKm] = useState(""); const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);

  const validarQR = async (codigo: string) => {
    setScannerOpen(false);
    const { data } = await supabase.rpc("qr_abastecimento_dados" as any, { p_codigo: codigo });
    const r = data as any;
    if (!r?.ok) {
      toast.error(r?.error === "qr_bloqueado" ? "QR Code bloqueado." : "QR Code não encontrado ou bloqueado.");
      return;
    }
    setVale({ ...r.vale, veiculo: r.veiculo, posto: r.posto });
    setPosto(r.posto?.nome || "");
    setEtapa("dados_qr");
  };

  const onFotoBomba = async (blob: Blob) => {
    const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "bomba", blob);
    setFotoBomba(url);
    setCamOpen(false);
    setEtapa("foto_painel");
    toast.success("Foto da bomba salva");
  };
  const onFotoPainel = async (blob: Blob) => {
    const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, "painel", blob);
    setFotoPainel(url);
    setCamOpen(false);
    setEtapa("form");
    toast.success("Foto do painel salva");
  };

  const enviar = async () => {
    if (!vale || !fotoBomba || !fotoPainel) return;
    if (!valor || !litros || !km) { toast.error("Preencha valor, litros e KM"); return; }
    setEnviando(true);
    const loc = await getLocation();
    const { data, error } = await supabase.rpc("app_mecanico_registrar_abastecimento" as any, {
      p_acesso_id: mecanico.acesso_id,
      p_qr_codigo: vale.codigo,
      p_valor: parseFloat(valor.replace(",", ".")),
      p_litros: parseFloat(litros.replace(",", ".")),
      p_combustivel: combustivel,
      p_km: parseFloat(km.replace(",", ".")),
      p_placa: vale.veiculo?.placa || null,
      p_posto_nome: posto || null,
      p_observacao: obs || null,
      p_foto_bomba_url: fotoBomba,
      p_foto_painel_url: fotoPainel,
      p_latitude: loc.latitude,
      p_longitude: loc.longitude,
      p_endereco: null,
    });
    setEnviando(false);
    if (error || !(data as any)?.ok) {
      toast.error("Erro ao enviar abastecimento");
      return;
    }
    setEtapa("concluido");
    toast.success("Abastecimento enviado!");
    setTimeout(() => navigate(`/app-mecanico/${mecanico.acesso_id}`), 1800);
  };

  // ====== Render por etapa ======
  if (etapa === "qr") {
    return (
      <Card className="p-6 space-y-4 text-center">
        <Fuel className="w-12 h-12 text-blue-600 mx-auto" />
        <h1 className="text-xl font-semibold">Abastecimento</h1>
        <p className="text-sm text-muted-foreground">Leia o QR Code do vale para iniciar</p>
        <Button className="w-full h-12" onClick={() => setScannerOpen(true)}>
          <QrCode className="w-5 h-5 mr-2" /> Ler QR Code
        </Button>
        {scannerOpen && <QRScanner onResult={validarQR} onCancel={() => setScannerOpen(false)} />}
      </Card>
    );
  }

  if (etapa === "dados_qr" && vale) {
    return (
      <Card className="p-6 space-y-4">
        <h1 className="text-lg font-semibold">Dados do Abastecimento</h1>
        <div className="text-sm space-y-1 bg-muted/50 p-3 rounded">
          <p><span className="text-muted-foreground">Código:</span> <strong>{vale.codigo}</strong></p>
          <p><span className="text-muted-foreground">Mecânico:</span> {mecanico.nome}</p>
          {mecanico.empresa && <p><span className="text-muted-foreground">Empresa:</span> {mecanico.empresa}</p>}
          {vale.veiculo?.placa && <p><span className="text-muted-foreground">Veículo:</span> {vale.veiculo.placa} {vale.veiculo.modelo}</p>}
          {vale.posto?.nome && <p><span className="text-muted-foreground">Posto:</span> {vale.posto.nome}</p>}
          {vale.valor_limite ? <p><span className="text-muted-foreground">Valor autorizado:</span> R$ {vale.valor_limite}</p> : null}
          <p><span className="text-muted-foreground">Status:</span> <span className="text-emerald-600">{vale.status}</span></p>
        </div>
        <Button className="w-full h-12" onClick={() => { setEtapa("foto_bomba"); setCamOpen(true); }}>
          <Camera className="w-4 h-4 mr-2" /> Tirar foto da bomba <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </Card>
    );
  }

  if (etapa === "foto_bomba") {
    return (
      <>
        <Card className="p-6 space-y-3 text-center">
          <Fuel className="w-10 h-10 text-blue-600 mx-auto" />
          <h1 className="text-lg font-semibold">Foto da bomba/posto</h1>
          <Button className="w-full" onClick={() => setCamOpen(true)}><Camera className="w-4 h-4 mr-2" /> Abrir câmera</Button>
        </Card>
        <CameraCapture open={camOpen} onClose={() => setCamOpen(false)} onCapture={onFotoBomba} facing="environment" title="Foto da bomba" hint="Aponte para a bomba do posto" />
      </>
    );
  }

  if (etapa === "foto_painel") {
    return (
      <>
        <Card className="p-6 space-y-3 text-center">
          <Gauge className="w-10 h-10 text-amber-600 mx-auto" />
          <h1 className="text-lg font-semibold">Foto do KM (painel)</h1>
          <Button className="w-full" onClick={() => setCamOpen(true)}><Camera className="w-4 h-4 mr-2" /> Abrir câmera</Button>
        </Card>
        <CameraCapture open={camOpen} onClose={() => setCamOpen(false)} onCapture={onFotoPainel} facing="environment" title="Foto do painel/KM" hint="Aponte para o painel mostrando o KM" />
      </>
    );
  }

  if (etapa === "form") {
    return (
      <Card className="p-6 space-y-3">
        <h1 className="text-lg font-semibold">Dados finais</h1>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          <div><Label>Litros</Label><Input inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} /></div>
          <div className="col-span-2"><Label>Posto</Label><Input value={posto} onChange={(e) => setPosto(e.target.value)} /></div>
          <div><Label>Combustível</Label><Input value={combustivel} onChange={(e) => setCombustivel(e.target.value)} /></div>
          <div><Label>KM atual</Label><Input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} /></div>
          <div className="col-span-2"><Label>Observação</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <Button onClick={enviar} disabled={enviando} className="w-full h-12">
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar dados"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-8 text-center space-y-3">
      <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto" />
      <h2 className="font-semibold">Abastecimento enviado!</h2>
      <p className="text-sm text-muted-foreground">Voltando para o início...</p>
    </Card>
  );
}
