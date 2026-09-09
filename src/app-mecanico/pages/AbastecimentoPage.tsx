import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Clock3, Eye, FileDown, Fuel, Gauge, Loader2, MessageCircle, RefreshCw, Share2, ShieldCheck, XCircle } from "lucide-react";
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

type Step = "solicitar" | "aguardando" | "liberado" | "bomba" | "painel" | "revisao" | "negado" | "ok";

type Posto = {
  codigo: string;
  nome: string;
  cnpj?: string | null;
  telefone?: string | null;
  endereco?: string | null;
};

type VeiculoInfo = {
  placa: string;
  descricao?: string | null;
};

type MecInfo = {
  nome: string;
  empresa: string;
  filial: string;
  funcao?: string | null;
};

type Authorization = {
  id: string;
  app_request_id: string;
  funcionario_nome?: string | null;
  empresa_nome?: string | null;
  filial?: string | null;
  placa: string;
  combustivel: string;
  posto_nome: string;
  posto_codigo?: string | null;
  solicitado_em?: string | null;
  status: "pendente" | "autorizado" | "negado" | "concluido" | string;
  autorizado_em?: string | null;
  autorizado_por_nome?: string | null;
  whatsapp_solicitacao_em?: string | null;
};

type ContextResult = {
  ok?: boolean;
  error?: string;
  mecanico?: MecInfo;
  veiculos?: VeiculoInfo[];
  veiculo_fixo?: string | null;
  exige_selecao_veiculo?: boolean;
  postos?: Posto[];
  solicitacao_ativa?: Authorization | null;
};

type StatusResult = {
  ok?: boolean;
  error?: string;
  authorization?: Authorization | null;
  posto?: Posto | null;
};

type PumpOcrResult = {
  ok?: boolean;
  valor?: string | number;
  litros?: string | number;
  valor_por_litro?: string | number;
  combustivel?: string;
};

type PanelOcrResult = {
  ok?: boolean;
  km?: string | number;
  km_atual?: string | number;
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

const FUEL_OPTIONS = ["Gasolina", "Etanol", "Diesel", "Diesel S10", "GNV"];
const WHATSAPP_RECIPIENTS = [
  { label: "Administrativo", phone: "5511971535944" },
  { label: "Robson", phone: "5511942920385" },
] as const;

const supabaseRpc = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const normalizePlate = (value: string | null | undefined) =>
  String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);

const parseBrNumber = (value: string | number | null | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "").trim().replace(/\s/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumberInput = (value: number, digits: number) =>
  Number(value || 0).toFixed(digits).replace(".", ",");

const fuelErrorMessage = (code?: string, payload?: Record<string, unknown>) => {
  if (code === "gps_obrigatorio") return "Ative a localização do aparelho. O abastecimento não é salvo sem GPS.";
  if (code === "km_obrigatorio") return "Informe o KM atual do veículo.";
  if (code === "km_menor_ultimo") return `O KM informado é menor que o último KM registrado (${payload?.ultimo_km ?? "-"}). Confira o painel.`;
  if (code === "placa_obrigatoria") return "Selecione o veículo liberado para Goiânia.";
  if (code === "veiculo_fixo_nao_configurado") return "Seu veículo fixo ainda não foi configurado. Fale com a administração.";
  if (code === "veiculo_nao_autorizado") return "Esse veículo não está liberado para seu acesso.";
  if (code === "posto_invalido") return "Selecione um posto válido.";
  if (code === "combustivel_invalido") return "Selecione o combustível correto.";
  if (code === "dados_combustivel_invalidos") return "Confira litros e valor total do abastecimento.";
  if (code === "abastecimento_nao_autorizado") return "A solicitação ainda não foi liberada. Aguarde a autorização.";
  if (code === "foto_bomba_obrigatoria") return "Envie uma foto da bomba ou da nota/comprovante do posto.";
  if (code === "foto_painel_obrigatoria") return "Envie a foto do painel do carro com o KM.";
  if (code === "acesso_nao_autorizado") return "Seu acesso não está liberado. Entre novamente pelo PIN.";
  return code || "Não foi possível concluir o abastecimento.";
};

const stepFromStatus = (status?: string): Step => {
  if (status === "autorizado") return "liberado";
  if (status === "negado") return "negado";
  return "aguardando";
};

export default function AbastecimentoPage() {
  const { mecanico } = useMecanicoApp();
  const [step, setStep] = useState<Step>("solicitar");
  const [loading, setLoading] = useState(true);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [mecInfo, setMecInfo] = useState<MecInfo | null>(null);
  const [veiculos, setVeiculos] = useState<VeiculoInfo[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [exigeSelecaoVeiculo, setExigeSelecaoVeiculo] = useState(false);
  const [autorizacao, setAutorizacao] = useState<Authorization | null>(null);
  const [postoAtual, setPostoAtual] = useState<Posto | null>(null);

  const [placa, setPlaca] = useState("");
  const [combustivel, setCombustivel] = useState("");
  const [postoCodigo, setPostoCodigo] = useState("");

  const [camBomba, setCamBomba] = useState(false);
  const [camPainel, setCamPainel] = useState(false);
  const [fotoBombaUrl, setFotoBombaUrl] = useState("");
  const [fotoPainelUrl, setFotoPainelUrl] = useState("");
  const [valor, setValor] = useState("");
  const [litros, setLitros] = useState("");
  const [kmAtual, setKmAtual] = useState("");
  const [ocrCombustivel, setOcrCombustivel] = useState("");
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [pdfCache, setPdfCache] = useState<{ blob: Blob; fileName: string } | null>(null);

  const valorNumero = useMemo(() => parseBrNumber(valor), [valor]);
  const litrosNumero = useMemo(() => parseBrNumber(litros), [litros]);
  const kmNumero = useMemo(() => parseBrNumber(kmAtual), [kmAtual]);
  const valorPorLitro = useMemo(() => valorNumero > 0 && litrosNumero > 0 ? valorNumero / litrosNumero : null, [valorNumero, litrosNumero]);
  const veiculoSelecionado = useMemo(() => veiculos.find((item) => normalizePlate(item.placa) === normalizePlate(autorizacao?.placa || placa)) || null, [veiculos, autorizacao?.placa, placa]);

  const carregarContexto = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseRpc.rpc("app_mecanico_abastecimento_contexto", {
        p_acesso_id: mecanico.acesso_id,
      });
      const result = data as ContextResult | null;
      if (error || !result?.ok) throw new Error(result?.error || error?.message || "Falha ao carregar abastecimento.");

      const vehicleList = (result.veiculos || []).map((item) => ({ ...item, placa: normalizePlate(item.placa) })).filter((item) => item.placa);
      const stationList = result.postos || [];
      const mustSelectVehicle = Boolean(result.exige_selecao_veiculo);
      const fixedPlate = normalizePlate(result.veiculo_fixo);
      setMecInfo(result.mecanico || null);
      setVeiculos(vehicleList);
      setPostos(stationList);
      setExigeSelecaoVeiculo(mustSelectVehicle);

      if (!mustSelectVehicle) setPlaca(fixedPlate || vehicleList[0]?.placa || "");
      else if (!placa && vehicleList.length === 1) setPlaca(vehicleList[0].placa);
      if (!postoCodigo && stationList.length === 1) setPostoCodigo(stationList[0].codigo);

      if (result.solicitacao_ativa?.id) {
        const active = result.solicitacao_ativa;
        setAutorizacao(active);
        setPlaca(normalizePlate(active.placa));
        setCombustivel(active.combustivel || "");
        setPostoCodigo(active.posto_codigo || "");
        const station = stationList.find((item) => item.codigo === active.posto_codigo) || null;
        setPostoAtual(station);
        setStep(stepFromStatus(active.status));
      } else {
        setStep("solicitar");
      }
    } catch (error) {
      console.error("Erro ao carregar contexto de abastecimento:", error);
      toast.error(error instanceof Error ? error.message : "Falha ao carregar abastecimento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregarContexto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mecanico.acesso_id]);

  const atualizarStatus = async () => {
    if (!autorizacao?.id) return;
    const { data, error } = await supabaseRpc.rpc("app_mecanico_status_abastecimento", {
      p_acesso_id: mecanico.acesso_id,
      p_autorizacao_id: autorizacao.id,
    });
    const result = data as StatusResult | null;
    if (error || !result?.ok || !result.authorization) return;

    setAutorizacao(result.authorization);
    if (result.posto) setPostoAtual(result.posto);

    if (result.authorization.status === "autorizado" && step === "aguardando") {
      setStep("liberado");
      toast.success("Abastecimento liberado.");
    } else if (result.authorization.status === "negado") {
      setStep("negado");
    }
  };

  useEffect(() => {
    if (!autorizacao?.id || (step !== "aguardando" && step !== "liberado")) return;
    const timer = window.setInterval(() => void atualizarStatus(), 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autorizacao?.id, step]);

  const buildWhatsAppText = (auth: Authorization, station?: Posto | null) => {
    const lines = [
      "TOPAC – Solicitação de abastecimento",
      "",
      `Mecânico: ${auth.funcionario_nome || mecInfo?.nome || mecanico.nome}`,
      `Empresa/Filial: ${auth.empresa_nome || mecInfo?.empresa || mecanico.empresa}${auth.filial || mecInfo?.filial || mecanico.filial ? ` - ${auth.filial || mecInfo?.filial || mecanico.filial}` : ""}`,
      `Veículo: ${normalizePlate(auth.placa)}`,
      `Combustível: ${auth.combustivel}`,
      `Posto: ${station?.nome || auth.posto_nome}`,
      `Protocolo: ${auth.app_request_id}`,
      "",
      "Aguardando liberação no TOPAC RH PRO.",
    ];
    return lines.join("\n");
  };

  const whatsappHref = (phone: string, auth: Authorization, station?: Posto | null) =>
    `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppText(auth, station))}`;

  const abrirWhatsApp = async (phone: string, auth = autorizacao, station = postoAtual) => {
    if (!auth) return;
    const popup = window.open("about:blank", "_blank");
    try {
      await supabaseRpc.rpc("app_mecanico_marcar_whatsapp_abastecimento", {
        p_acesso_id: mecanico.acesso_id,
        p_autorizacao_id: auth.id,
      });
    } catch (error) {
      console.warn("Falha apenas ao marcar envio WhatsApp:", error);
    }
    const href = whatsappHref(phone, auth, station);
    if (popup) popup.location.href = href;
    else window.location.href = href;
  };

  const criarSolicitacao = async () => {
    const plate = normalizePlate(placa);
    const stationCode = postoCodigo || (!exigeSelecaoVeiculo && postos.length === 1 ? postos[0].codigo : "");
    if (exigeSelecaoVeiculo && !plate) return toast.error("Selecione o veículo liberado.");
    if (!combustivel) return toast.error("Selecione o combustível.");
    if (!stationCode) return toast.error("Selecione o posto.");

    const popups = WHATSAPP_RECIPIENTS.map(() => window.open("about:blank", "_blank"));
    setLoading(true);
    try {
      const { data, error } = await supabaseRpc.rpc("app_mecanico_criar_solicitacao_abastecimento", {
        p_acesso_id: mecanico.acesso_id,
        p_placa: exigeSelecaoVeiculo ? plate : null,
        p_combustivel: combustivel,
        p_posto_codigo: stationCode,
        p_valor_estimado: null,
        p_observacao: null,
      });
      const result = data as { ok?: boolean; error?: string; existing?: boolean; authorization?: Authorization; posto?: Posto } | null;
      if (error || !result?.ok || !result.authorization) {
        popups.forEach((popup) => popup?.close());
        toast.error(fuelErrorMessage(result?.error || error?.message));
        return;
      }

      const auth = result.authorization;
      const station = result.posto || postos.find((item) => item.codigo === auth.posto_codigo) || null;
      setAutorizacao(auth);
      setPostoAtual(station);
      setStep(stepFromStatus(auth.status));
      toast.success(result.existing ? "Já existe uma solicitação em andamento." : "Solicitação enviada para autorização.");

      try {
        await supabaseRpc.rpc("app_mecanico_marcar_whatsapp_abastecimento", {
          p_acesso_id: mecanico.acesso_id,
          p_autorizacao_id: auth.id,
        });
      } catch (markError) {
        console.warn("Falha apenas ao marcar envio WhatsApp:", markError);
      }

      WHATSAPP_RECIPIENTS.forEach((recipient, index) => {
        const href = whatsappHref(recipient.phone, auth, station);
        if (popups[index]) popups[index]!.location.href = href;
      });
      if (popups.some((popup) => !popup)) toast.info("O navegador bloqueou uma das janelas. Use os dois botões de WhatsApp abaixo para enviar aos dois contatos.");
    } catch (error) {
      popups.forEach((popup) => popup?.close());
      console.error("Erro ao criar solicitação de abastecimento:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a solicitação.");
    } finally {
      setLoading(false);
    }
  };

  const novaSolicitacao = () => {
    setAutorizacao(null);
    setPostoAtual(null);
    setFotoBombaUrl("");
    setFotoPainelUrl("");
    setValor("");
    setLitros("");
    setKmAtual("");
    setOcrCombustivel("");
    setReceipt(null);
    setPdfCache(null);
    setStep("solicitar");
  };

  const onCaptureBomba = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de abastecer.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, `comprovante-${autorizacao.id}`, blob);
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
          setOcrCombustivel(ocr.combustivel || "");
          if (ocr.combustivel && ocr.combustivel !== autorizacao.combustivel) {
            toast.warning(`A imagem parece indicar ${ocr.combustivel}, mas a autorização é para ${autorizacao.combustivel}. Confira antes de continuar.`);
          } else if (fields.valor && fields.litros) {
            toast.success("Comprovante lido automaticamente. Confira valor e litros.");
          } else {
            toast.info("Foto salva. Se for nota/comprovante, confira valor e litros manualmente.");
          }
        } else {
          toast.info("Foto salva. Confira valor e litros manualmente.");
        }
      } catch (error) {
        console.warn("OCR do comprovante indisponível:", error);
        toast.info("Foto salva. Confira valor e litros manualmente.");
      } finally {
        setOcrLoading(false);
      }
      setStep("painel");
    } finally {
      setLoading(false);
    }
  };

  const onCapturePainel = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de continuar.");
    if (!fotoBombaUrl) throw new Error("Envie primeiro a foto da bomba ou da nota do posto.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, `painel-${autorizacao.id}`, blob);
      setFotoPainelUrl(url);
      setOcrLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ocr-bomba-combustivel", {
          body: { fileUrl: url, tipo: "painel_km" },
        });
        const ocr = data as PanelOcrResult | null;
        const km = !error && ocr?.ok ? normalizeKmOcrField(ocr) : null;
        if (km) {
          setKmAtual(String(km));
          toast.success("KM lido automaticamente. Confira antes de finalizar.");
        } else {
          toast.info("Foto do painel salva. Informe o KM manualmente.");
        }
      } catch (error) {
        console.warn("OCR do painel indisponível:", error);
        toast.info("Foto do painel salva. Informe o KM manualmente.");
      } finally {
        setOcrLoading(false);
      }
      setStep("revisao");
    } finally {
      setLoading(false);
    }
  };

  const finalizar = async () => {
    if (!autorizacao || autorizacao.status !== "autorizado") return toast.error("A solicitação não está liberada.");
    if (!fotoBombaUrl) return toast.error("Envie a foto da bomba ou da nota/comprovante do posto.");
    if (!fotoPainelUrl) return toast.error("Envie a foto do painel do carro com o KM.");
    if (valorNumero <= 0 || litrosNumero <= 0) return toast.error("Confira valor e litros.");
    if (kmNumero <= 0) return toast.error("Confira o KM do painel.");

    setLoading(true);
    try {
      const location = await getBrowserLocation();
      if (location.latitude == null || location.longitude == null) {
        toast.error("Ative a localização do aparelho. O abastecimento não é salvo sem GPS.");
        return;
      }

      const { data, error } = await supabaseRpc.rpc("app_mecanico_finalizar_abastecimento_autorizado", {
        p_acesso_id: mecanico.acesso_id,
        p_autorizacao_id: autorizacao.id,
        p_valor: valorNumero,
        p_litros: litrosNumero,
        p_km: kmNumero,
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

      const station = postoAtual || postos.find((item) => item.codigo === autorizacao.posto_codigo) || null;
      const info: ReceiptInfo = {
        id: result.id,
        codigo: autorizacao.app_request_id,
        postoNome: station?.nome || autorizacao.posto_nome,
        postoCnpj: station?.cnpj || "",
        mecanicoNome: autorizacao.funcionario_nome || mecInfo?.nome || mecanico.nome,
        empresa: autorizacao.empresa_nome || mecInfo?.empresa || mecanico.empresa,
        filial: autorizacao.filial || mecInfo?.filial || mecanico.filial,
        placa: normalizePlate(autorizacao.placa),
        veiculo: veiculoSelecionado?.descricao || "",
        combustivel: autorizacao.combustivel,
        valor: valorNumero,
        litros: litrosNumero,
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
        if (linked.error || !linkedResult?.ok) throw new Error(linkedResult?.error || linked.error?.message || "Falha ao vincular comprovante.");
        info.reciboPdfUrl = reciboPdfUrl;
        setReceipt({ ...info });
        setPdfCache(pdf);
        toast.success(result.duplicado ? "Abastecimento já estava concluído. Registro preservado." : "Abastecimento concluído com sucesso.");
      } catch (pdfError) {
        console.warn("Abastecimento salvo; falha apenas no PDF:", pdfError);
        toast.success("Abastecimento concluído. Registro e fotos foram salvos; o PDF não foi gerado neste momento.");
      }
    } catch (error) {
      console.error("Erro ao finalizar abastecimento:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar o abastecimento.");
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = () => {
    if (!pdfCache) return;
    const url = URL.createObjectURL(pdfCache.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pdfCache.fileName;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const viewPdf = () => {
    if (!pdfCache) return;
    const url = URL.createObjectURL(pdfCache.blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  };

  const sharePdf = async () => {
    if (!pdfCache) return;
    const file = new File([pdfCache.blob], pdfCache.fileName, { type: "application/pdf" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: "Comprovante de abastecimento TOPAC", files: [file] });
    } else {
      downloadPdf();
    }
  };

  if (loading && !mecInfo && !autorizacao) {
    return <Card className="flex min-h-[260px] items-center justify-center p-6"><Loader2 className="h-7 w-7 animate-spin" /></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500"><Fuel className="h-5 w-5" /></div>
          <div>
            <h1 className="text-base font-bold">Solicitação de Abastecimento</h1>
            <p className="text-xs text-muted-foreground">Solicite, aguarde a liberação e depois registre o abastecimento.</p>
          </div>
        </div>
      </Card>

      {step === "solicitar" && (
        <Card className="space-y-4 p-4">
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            A solicitação chega ao painel da administração e também abre mensagem de WhatsApp para Administrativo e Robson.
          </div>

          {exigeSelecaoVeiculo && (
            <div className="space-y-1.5">
              <Label>Veículo liberado</Label>
              {veiculos.length > 0 ? (
                <select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={veiculos.some((v) => normalizePlate(v.placa) === normalizePlate(placa)) ? normalizePlate(placa) : ""} onChange={(e) => setPlaca(normalizePlate(e.target.value))}>
                  <option value="">Selecionar veículo</option>
                  {veiculos.map((item) => <option key={item.placa} value={item.placa}>{item.descricao || item.placa} · {item.placa}</option>)}
                </select>
              ) : (
                <p className="text-xs text-amber-600">Nenhum carro ou moto está liberado para esta unidade. Fale com a administração.</p>
              )}
            </div>
          )}

          {!exigeSelecaoVeiculo && !placa && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
              Seu veículo fixo ainda não foi configurado. Fale com a administração antes de solicitar.
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Combustível</Label>
            <select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={combustivel} onChange={(e) => setCombustivel(e.target.value)}>
              <option value="">Selecionar combustível</option>
              {FUEL_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          {exigeSelecaoVeiculo && (
            <div className="space-y-1.5">
              <Label>Posto</Label>
              <select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={postoCodigo} onChange={(e) => setPostoCodigo(e.target.value)}>
                <option value="">Selecionar posto</option>
                {postos.map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}
              </select>
            </div>
          )}

          <Button className="h-12 w-full" onClick={() => void criarSolicitacao()} disabled={loading || (!exigeSelecaoVeiculo && !placa)}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />} Enviar solicitação
          </Button>
        </Card>
      )}

      {step === "aguardando" && autorizacao && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3 text-amber-500"><Clock3 className="h-7 w-7" /><div><h2 className="font-bold">Aguardando liberação</h2><p className="text-xs text-muted-foreground">A solicitação já está no painel da administração.</p></div></div>
          <RequestSummary auth={autorizacao} posto={postoAtual} />
          <div className="grid gap-2 sm:grid-cols-2">
            {WHATSAPP_RECIPIENTS.map((recipient) => <Button key={recipient.phone} className="w-full" onClick={() => void abrirWhatsApp(recipient.phone)}><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp {recipient.label}</Button>)}
          </div>
          <Button variant="outline" className="w-full" onClick={() => void atualizarStatus()}><RefreshCw className="mr-2 h-4 w-4" /> Verificar liberação</Button>
        </Card>
      )}

      {step === "liberado" && autorizacao && (
        <Card className="space-y-4 border-emerald-500/30 p-5">
          <div className="flex items-center gap-3 text-emerald-500"><ShieldCheck className="h-8 w-8" /><div><h2 className="text-lg font-bold">ABASTECIMENTO LIBERADO</h2><p className="text-xs text-muted-foreground">Agora faça o abastecimento e registre as comprovações.</p></div></div>
          <RequestSummary auth={autorizacao} posto={postoAtual} />
          <div className="rounded-lg bg-muted p-3 text-sm"><b>Ordem:</b> 1. Foto da bomba ou nota do posto → 2. Foto do painel do carro/KM → 3. Conferir → 4. Finalizar.</div>
          <Button className="h-12 w-full" onClick={() => setStep("bomba")}><Camera className="mr-2 h-4 w-4" /> Iniciar abastecimento</Button>
        </Card>
      )}

      {step === "negado" && autorizacao && (
        <Card className="space-y-4 border-red-500/30 p-5">
          <div className="flex items-center gap-3 text-red-500"><XCircle className="h-8 w-8" /><div><h2 className="font-bold">Solicitação não autorizada</h2><p className="text-xs text-muted-foreground">Não realize o abastecimento com esta solicitação.</p></div></div>
          <RequestSummary auth={autorizacao} posto={postoAtual} />
          <Button className="w-full" variant="outline" onClick={novaSolicitacao}>Nova solicitação</Button>
        </Card>
      )}

      {step === "bomba" && autorizacao && (
        <Card className="space-y-4 p-4">
          <div><p className="text-xs font-semibold text-amber-500">ETAPA 1 DE 2</p><h2 className="text-lg font-bold">Bomba ou nota do posto</h2><p className="text-sm text-muted-foreground">Envie uma foto da bomba após o abastecimento ou da nota/comprovante do posto. Pode usar câmera ou galeria.</p></div>
          {fotoBombaUrl && <img src={fotoBombaUrl} alt="Comprovante do abastecimento" className="max-h-64 w-full rounded-lg object-contain" />}
          <Button className="h-12 w-full" onClick={() => setCamBomba(true)} disabled={loading}><Camera className="mr-2 h-4 w-4" /> {fotoBombaUrl ? "Trocar foto" : "Adicionar foto da bomba ou nota"}</Button>
          {ocrLoading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Validando comprovante...</p>}
        </Card>
      )}

      {step === "painel" && autorizacao && (
        <Card className="space-y-4 p-4">
          <div><p className="text-xs font-semibold text-amber-500">ETAPA 2 DE 2</p><h2 className="text-lg font-bold">Painel do carro / KM</h2><p className="text-sm text-muted-foreground">Envie a foto do painel do carro mostrando o hodômetro. Esta foto é obrigatória para finalizar.</p></div>
          {fotoBombaUrl && <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 text-sm"><span>Valor</span><b>R$ {valor || "-"}</b><span>Litros</span><b>{litros || "-"}</b></div>}
          {fotoPainelUrl && <img src={fotoPainelUrl} alt="Painel do carro" className="max-h-64 w-full rounded-lg object-contain" />}
          <Button className="h-12 w-full" onClick={() => setCamPainel(true)} disabled={loading || !fotoBombaUrl}><Gauge className="mr-2 h-4 w-4" /> {fotoPainelUrl ? "Trocar foto do painel" : "Adicionar foto do painel/KM"}</Button>
          {ocrLoading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo hodômetro...</p>}
        </Card>
      )}

      {step === "revisao" && autorizacao && (
        <Card className="space-y-4 p-4">
          <div><p className="text-xs font-semibold text-emerald-500">CONFERÊNCIA FINAL</p><h2 className="text-lg font-bold">Confira antes de salvar</h2></div>
          <RequestSummary auth={autorizacao} posto={postoAtual} />
          {ocrCombustivel && ocrCombustivel !== autorizacao.combustivel && <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> A imagem indicou {ocrCombustivel}, mas a autorização é para {autorizacao.combustivel}. Confira antes de finalizar.</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Valor total</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></div>
            <div className="space-y-1.5"><Label>Litros</Label><Input inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="0,000" /></div>
          </div>
          <div className="space-y-1.5"><Label>KM atual</Label><Input inputMode="numeric" value={kmAtual} onChange={(e) => setKmAtual(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 55128" className="h-12 text-lg font-semibold" /></div>
          {valorPorLitro && <div className="rounded-lg bg-muted p-3 text-sm">Preço calculado por litro: <b>R$ {valorPorLitro.toFixed(3).replace(".", ",")}</b></div>}
          <div className="grid grid-cols-2 gap-2"><div><p className="mb-1 text-[11px] text-muted-foreground">Bomba/nota</p><img src={fotoBombaUrl} alt="Bomba ou nota" className="h-28 w-full rounded-lg object-cover" /></div><div><p className="mb-1 text-[11px] text-muted-foreground">Painel/KM</p><img src={fotoPainelUrl} alt="Painel" className="h-28 w-full rounded-lg object-cover" /></div></div>
          <Button className="h-12 w-full" onClick={() => void finalizar()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Finalizar abastecimento</Button>
          <p className="text-center text-[11px] text-muted-foreground">Bomba/nota + painel/KM + GPS são obrigatórios para finalizar.</p>
        </Card>
      )}

      {step === "ok" && receipt && (
        <Card className="space-y-4 border-emerald-500/30 p-5">
          <div className="flex items-center gap-3 text-emerald-500"><CheckCircle2 className="h-9 w-9" /><div><h2 className="text-lg font-bold">Abastecimento concluído</h2><p className="text-xs text-muted-foreground">Registro e fotos salvos no TOPAC RH PRO.</p></div></div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted p-4 text-sm"><span>Veículo</span><b>{receipt.placa}</b><span>Combustível</span><b>{receipt.combustivel}</b><span>Valor</span><b>R$ {receipt.valor.toFixed(2).replace(".", ",")}</b><span>Litros</span><b>{receipt.litros.toFixed(3).replace(".", ",")}</b><span>KM</span><b>{receipt.kmAtual?.toLocaleString("pt-BR")}</b></div>
          {pdfCache && <div className="grid grid-cols-3 gap-2"><Button variant="outline" onClick={viewPdf}><Eye className="h-4 w-4" /></Button><Button variant="outline" onClick={downloadPdf}><FileDown className="h-4 w-4" /></Button><Button variant="outline" onClick={() => void sharePdf()}><Share2 className="h-4 w-4" /></Button></div>}
          <Button className="w-full" variant="outline" onClick={novaSolicitacao}>Voltar</Button>
        </Card>
      )}

      <CameraCapture open={camBomba} onClose={() => setCamBomba(false)} onCapture={onCaptureBomba} facing="environment" allowGallery title="Bomba ou Nota do Posto" hint="Fotografe a bomba após o abastecimento ou envie a nota/comprovante do posto" />
      <CameraCapture open={camPainel} onClose={() => setCamPainel(false)} onCapture={onCapturePainel} facing="environment" allowGallery title="Painel do Carro / KM" hint="Mostre o hodômetro com o KM legível" />
    </div>
  );
}

function RequestSummary({ auth, posto }: { auth: Authorization; posto?: Posto | null }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted p-4 text-sm">
      <span className="text-muted-foreground">Protocolo</span><b className="text-right">{auth.app_request_id}</b>
      <span className="text-muted-foreground">Veículo</span><b className="text-right">{normalizePlate(auth.placa)}</b>
      <span className="text-muted-foreground">Combustível</span><b className="text-right">{auth.combustivel}</b>
      <span className="text-muted-foreground">Posto</span><b className="text-right">{posto?.nome || auth.posto_nome}</b>
    </div>
  );
}
