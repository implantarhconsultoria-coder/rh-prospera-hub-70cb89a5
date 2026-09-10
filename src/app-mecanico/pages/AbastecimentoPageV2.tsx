import { useCallback, useEffect, useState } from "react";
import {
  Camera, CheckCircle2, Clock3, Eye, FileDown, Fuel, Gauge, Loader2,
  MessageCircle, RefreshCw, Share2, ShieldCheck, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

type VeiculoInfo = { placa: string; descricao?: string | null };
type MecInfo = { nome: string; empresa: string; filial: string; funcao?: string | null };

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

type StatusResult = { ok?: boolean; error?: string; authorization?: Authorization | null; posto?: Posto | null };

type VisionResult = {
  ok?: boolean;
  error?: string;
  detail?: string;
  valor?: string | number;
  litros?: string | number;
  valor_por_litro?: string | number;
  km?: string | number;
  km_atual?: string | number;
  motivo?: string;
  provider?: string;
  model?: string;
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

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const fuelErrorMessage = (code?: string, payload?: Record<string, unknown>) => {
  if (code === "gps_obrigatorio") return "Ative a localização do aparelho. O abastecimento não é salvo sem GPS.";
  if (code === "km_obrigatorio") return "Não foi possível confirmar o KM da foto do painel.";
  if (code === "km_menor_ultimo") return `O KM lido na foto é menor que o último KM registrado (${payload?.ultimo_km ?? "-"}). Confira a foto do painel.`;
  if (code === "placa_obrigatoria") return "Selecione o veículo liberado para Goiânia.";
  if (code === "veiculo_fixo_nao_configurado") return "Seu veículo fixo ainda não foi configurado. Fale com a administração.";
  if (code === "veiculo_nao_autorizado") return "Esse veículo não está liberado para seu acesso.";
  if (code === "posto_invalido") return "O posto da unidade não está configurado.";
  if (code === "combustivel_invalido") return "Selecione o combustível correto.";
  if (code === "dados_combustivel_invalidos") return "Os dados do abastecimento não puderam ser confirmados.";
  if (code === "abastecimento_nao_autorizado") return "A solicitação ainda não foi autorizada pela administração.";
  if (code === "foto_bomba_obrigatoria") return "Envie a foto da bomba do posto.";
  if (code === "foto_painel_obrigatoria") return "Envie a foto do painel do carro com o KM.";
  if (code === "acesso_nao_autorizado") return "Seu acesso não está liberado. Entre novamente pelo PIN.";
  return code || "Não foi possível concluir o abastecimento.";
};

const stepFromStatus = (status?: string): Step => {
  if (status === "autorizado") return "liberado";
  if (status === "negado") return "negado";
  return "aguardando";
};

export default function AbastecimentoPageV2() {
  const { mecanico } = useMecanicoApp();
  const [step, setStep] = useState<Step>("solicitar");
  const [loading, setLoading] = useState(true);
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
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [pdfCache, setPdfCache] = useState<{ blob: Blob; fileName: string } | null>(null);

  const publicStorageUrl = (path?: string | null) => {
    if (!path) return "";
    return supabase.storage.from("abastecimento-fotos").getPublicUrl(path).data.publicUrl || "";
  };

  const restaurarFotos = useCallback(async (authorizationId: string) => {
    const { data, error } = await supabaseRpc.rpc("app_mecanico_abastecimento_fotos_salvas", {
      p_acesso_id: mecanico.acesso_id,
      p_autorizacao_id: authorizationId,
    });
    const result = data as { ok?: boolean; bomba_path?: string | null; painel_path?: string | null } | null;
    if (error || !result?.ok) return { bomba: "", painel: "" };
    const bomba = publicStorageUrl(result.bomba_path);
    const painel = publicStorageUrl(result.painel_path);
    if (bomba) setFotoBombaUrl(bomba);
    if (painel) setFotoPainelUrl(painel);
    return { bomba, painel };
  }, [mecanico.acesso_id]);

  const carregarContexto = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseRpc.rpc("app_mecanico_abastecimento_contexto", {
        p_acesso_id: mecanico.acesso_id,
      });
      const result = data as ContextResult | null;
      if (error || !result?.ok) throw new Error(result?.error || error?.message || "Falha ao carregar abastecimento.");

      const vehicleList = (result.veiculos || [])
        .map((item) => ({ ...item, placa: normalizePlate(item.placa) }))
        .filter((item) => item.placa);
      const stationList = result.postos || [];
      const mustSelectVehicle = Boolean(result.exige_selecao_veiculo);
      const fixedPlate = normalizePlate(result.veiculo_fixo);

      setMecInfo(result.mecanico || null);
      setVeiculos(vehicleList);
      setPostos(stationList);
      setExigeSelecaoVeiculo(mustSelectVehicle);
      if (!mustSelectVehicle) setPlaca(fixedPlate || vehicleList[0]?.placa || "");
      else if (vehicleList.length === 1) setPlaca(vehicleList[0].placa);
      if (stationList.length === 1) setPostoCodigo(stationList[0].codigo);

      const active = result.solicitacao_ativa;
      if (!active?.id) {
        setAutorizacao(null);
        setFotoBombaUrl("");
        setFotoPainelUrl("");
        setStep("solicitar");
        return;
      }

      setAutorizacao(active);
      setPlaca(normalizePlate(active.placa));
      setCombustivel(active.combustivel || "");
      setPostoCodigo(active.posto_codigo || "");
      setPostoAtual(stationList.find((item) => item.codigo === active.posto_codigo) || null);

      const saved = await restaurarFotos(active.id);
      if (active.status === "pendente") setStep("aguardando");
      else if (active.status === "negado") setStep("negado");
      else if (active.status === "autorizado") {
        if (saved.bomba && saved.painel) setStep("revisao");
        else if (saved.bomba) setStep("painel");
        else setStep("liberado");
      } else setStep(stepFromStatus(active.status));
    } catch (error) {
      console.error("Erro ao carregar contexto de abastecimento:", error);
      toast.error(error instanceof Error ? error.message : "Falha ao carregar abastecimento.");
    } finally {
      setLoading(false);
    }
  }, [mecanico.acesso_id, restaurarFotos]);

  useEffect(() => { void carregarContexto(); }, [carregarContexto]);

  const atualizarStatus = useCallback(async (silent = false) => {
    if (!autorizacao?.id) return null;
    const { data, error } = await supabaseRpc.rpc("app_mecanico_status_abastecimento", {
      p_acesso_id: mecanico.acesso_id,
      p_autorizacao_id: autorizacao.id,
    });
    const result = data as StatusResult | null;
    if (error || !result?.ok || !result.authorization) {
      if (!silent) toast.error("Não foi possível verificar a autorização agora.");
      return null;
    }

    const current = result.authorization;
    setAutorizacao(current);
    if (result.posto) setPostoAtual(result.posto);

    if (current.status === "pendente") setStep("aguardando");
    else if (current.status === "negado") setStep("negado");
    else if (current.status === "autorizado") {
      if (fotoBombaUrl && fotoPainelUrl) setStep("revisao");
      else if (fotoBombaUrl) setStep("painel");
      else setStep("liberado");
    }
    return current;
  }, [autorizacao?.id, mecanico.acesso_id, fotoBombaUrl, fotoPainelUrl]);

  useEffect(() => {
    if (!autorizacao?.id || autorizacao.status !== "pendente") return;
    const timer = window.setInterval(() => void atualizarStatus(true), 4000);
    return () => window.clearInterval(timer);
  }, [autorizacao?.id, autorizacao?.status, atualizarStatus]);

  const buildWhatsAppText = (auth: Authorization, station?: Posto | null) => [
    "TOPAC – Solicitação de abastecimento", "",
    `Mecânico: ${auth.funcionario_nome || mecInfo?.nome || mecanico.nome}`,
    `Empresa/Filial: ${auth.empresa_nome || mecInfo?.empresa || mecanico.empresa}${auth.filial || mecInfo?.filial || mecanico.filial ? ` - ${auth.filial || mecInfo?.filial || mecanico.filial}` : ""}`,
    `Veículo: ${normalizePlate(auth.placa)}`,
    `Combustível: ${auth.combustivel}`,
    `Posto: ${station?.nome || auth.posto_nome}`,
    `Protocolo: ${auth.app_request_id}`, "",
    "Aguardando liberação no TOPAC RH PRO.",
  ].join("\n");

  const abrirWhatsApp = async (phone: string, auth = autorizacao, station = postoAtual) => {
    if (!auth) return;
    const href = `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppText(auth, station))}`;
    window.open(href, "_blank", "noopener,noreferrer");
    void supabaseRpc.rpc("app_mecanico_marcar_whatsapp_abastecimento", {
      p_acesso_id: mecanico.acesso_id,
      p_autorizacao_id: auth.id,
    });
  };

  const criarSolicitacao = async () => {
    const plate = normalizePlate(placa);
    const stationCode = postoCodigo || (postos.length === 1 ? postos[0].codigo : "");
    if (exigeSelecaoVeiculo && !plate) return toast.error("Selecione o veículo liberado.");
    if (!combustivel) return toast.error("Selecione o combustível.");
    if (!stationCode) return toast.error("O posto da unidade não está configurado.");

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
      if (error || !result?.ok || !result.authorization) return toast.error(fuelErrorMessage(result?.error || error?.message));

      const auth = result.authorization;
      setAutorizacao(auth);
      setPostoAtual(result.posto || postos.find((item) => item.codigo === auth.posto_codigo) || null);
      setStep(stepFromStatus(auth.status));
      toast.success(result.existing ? "Solicitação em andamento recuperada." : "Solicitação enviada. Aguarde a administração autorizar.");

      if (!result.existing) {
        void supabaseRpc.rpc("app_mecanico_marcar_whatsapp_abastecimento", {
          p_acesso_id: mecanico.acesso_id,
          p_autorizacao_id: auth.id,
        });
        WHATSAPP_RECIPIENTS.forEach((recipient) => {
          const href = `https://wa.me/${recipient.phone}?text=${encodeURIComponent(buildWhatsAppText(auth, result.posto || null))}`;
          window.open(href, "_blank", "noopener,noreferrer");
        });
      }
    } catch (error) {
      console.error("Erro ao criar solicitação:", error);
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
    setReceipt(null);
    setPdfCache(null);
    setStep("solicitar");
  };

  const onCaptureBomba = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de abastecer.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, `bomba-${autorizacao.id}`, blob);
      setFotoBombaUrl(url);
      toast.success("Foto da bomba salva.");
      setStep(fotoPainelUrl ? "revisao" : "painel");
    } finally { setLoading(false); }
  };

  const onCapturePainel = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de continuar.");
    if (!fotoBombaUrl) throw new Error("Envie primeiro a foto da bomba do posto.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, `painel-${autorizacao.id}`, blob);
      setFotoPainelUrl(url);
      toast.success("Foto do painel salva.");
      setStep("revisao");
    } finally { setLoading(false); }
  };

  const invokeVision = async (tipo: "bomba" | "painel_km", fileUrl: string) => {
    let last: VisionResult | null = null;
    let transportError = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      const call = await supabase.functions.invoke("ocr-bomba-combustivel", { body: { fileUrl, tipo } });
      if (call.error) transportError = call.error.message || "falha_transporte";
      else {
        last = call.data as VisionResult | null;
        if (last?.ok) return last;
        if (last?.error === "nao_foi_possivel_confirmar_imagem") {
          if (attempt < 3) await sleep(500 * attempt);
          continue;
        }
      }
      if (attempt < 3) await sleep(700 * attempt);
    }
    if (transportError) throw new Error(`LEITURA_TECNICA:${transportError}`);
    if (last?.error === "erro_leitura_visual" || last?.detail) throw new Error(`LEITURA_TECNICA:${last.detail || last.error}`);
    throw new Error(tipo === "bomba" ? "FOTO_BOMBA_NAO_CONFIRMADA" : "FOTO_PAINEL_NAO_CONFIRMADA");
  };

  const lerFotosParaRecibo = async () => {
    const [pump, panel] = await Promise.all([
      invokeVision("bomba", fotoBombaUrl),
      invokeVision("painel_km", fotoPainelUrl),
    ]);
    const pumpFields = normalizePumpOcrFields(pump);
    const km = normalizeKmOcrField(panel);
    if (!pumpFields.valor || !pumpFields.litros) throw new Error("FOTO_BOMBA_NAO_CONFIRMADA");
    if (!km) throw new Error("FOTO_PAINEL_NAO_CONFIRMADA");
    return {
      valor: pumpFields.valor,
      litros: pumpFields.litros,
      valorPorLitro: pumpFields.precoLitro || pumpFields.valor / pumpFields.litros,
      km,
    };
  };

  const finalizar = async () => {
    if (!autorizacao) return toast.error("Solicitação não encontrada.");
    if (!fotoBombaUrl || !fotoPainelUrl) return toast.error("As duas fotos são obrigatórias.");
    setLoading(true);
    try {
      const current = await atualizarStatus(true);
      if (!current || current.status !== "autorizado") {
        toast.error("A administração ainda não autorizou esta solicitação. Aguarde a liberação.");
        return;
      }

      const location = await getBrowserLocation();
      if (location.latitude == null || location.longitude == null) {
        toast.error("Ative a localização do aparelho. O abastecimento não é salvo sem GPS.");
        return;
      }

      toast.info("Lendo as duas fotos e gerando o recibo...");
      let lido: Awaited<ReturnType<typeof lerFotosParaRecibo>>;
      try {
        lido = await lerFotosParaRecibo();
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.startsWith("LEITURA_TECNICA:")) {
          throw new Error("A leitura visual está temporariamente indisponível. Suas fotos já estão salvas; não tire outras. Tente finalizar novamente em instantes.");
        }
        if (message === "FOTO_BOMBA_NAO_CONFIRMADA") {
          throw new Error("Após três leituras, não foi possível confirmar os números da bomba. Confira se TOTAL A PAGAR e LITROS aparecem completos na foto.");
        }
        if (message === "FOTO_PAINEL_NAO_CONFIRMADA") {
          throw new Error("Após três leituras, não foi possível confirmar o hodômetro total do painel. Confira se o ODO/KM aparece completo na foto.");
        }
        throw error;
      }

      const { data, error } = await supabaseRpc.rpc("app_mecanico_finalizar_abastecimento_autorizado", {
        p_acesso_id: mecanico.acesso_id,
        p_autorizacao_id: current.id,
        p_valor: lido.valor,
        p_litros: lido.litros,
        p_km: lido.km,
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

      const station = postoAtual || postos.find((item) => item.codigo === current.posto_codigo) || null;
      const vehicle = veiculos.find((item) => normalizePlate(item.placa) === normalizePlate(current.placa)) || null;
      const info: ReceiptInfo = {
        id: result.id,
        codigo: current.app_request_id,
        postoNome: station?.nome || current.posto_nome,
        postoCnpj: station?.cnpj || "",
        mecanicoNome: current.funcionario_nome || mecInfo?.nome || mecanico.nome,
        empresa: current.empresa_nome || mecInfo?.empresa || mecanico.empresa,
        filial: current.filial || mecInfo?.filial || mecanico.filial,
        placa: normalizePlate(current.placa),
        veiculo: vehicle?.descricao || "",
        combustivel: current.combustivel,
        valor: lido.valor,
        litros: lido.litros,
        valorPorLitro: lido.valorPorLitro,
        kmAtual: lido.km,
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
      if (linked.error || !linkedResult?.ok) throw new Error(linkedResult?.error || linked.error?.message || "Falha ao vincular comprovante.");

      info.reciboPdfUrl = reciboPdfUrl;
      setReceipt(info);
      setPdfCache(pdf);
      setStep("ok");
      toast.success(result.duplicado ? "Abastecimento já concluído. Registro preservado." : "Abastecimento concluído e recibo gerado.");
    } catch (error) {
      console.error("Erro ao finalizar abastecimento:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar o abastecimento.");
    } finally { setLoading(false); }
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
    } else downloadPdf();
  };

  if (loading && !mecInfo && !autorizacao) {
    return <Card className="flex min-h-[260px] items-center justify-center p-6"><Loader2 className="h-7 w-7 animate-spin" /></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500"><Fuel className="h-5 w-5" /></div>
          <div><h1 className="text-base font-bold">Solicitação de Abastecimento</h1><p className="text-xs text-muted-foreground">Solicite, aguarde a liberação e depois registre o abastecimento.</p></div>
        </div>
      </Card>

      {step === "solicitar" && (
        <Card className="space-y-4 p-4">
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-muted-foreground">Toda nova solicitação entra como <b>PENDENTE</b>. Somente a administração pode liberar.</div>
          {exigeSelecaoVeiculo && (
            <div className="space-y-1.5"><Label>Veículo liberado</Label>
              <select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={placa} onChange={(e) => setPlaca(normalizePlate(e.target.value))}>
                <option value="">Selecionar veículo</option>{veiculos.map((item) => <option key={item.placa} value={item.placa}>{item.descricao || item.placa} · {item.placa}</option>)}
              </select>
            </div>
          )}
          {!exigeSelecaoVeiculo && !placa && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">Seu veículo fixo ainda não foi configurado. Fale com a administração.</div>}
          <div className="space-y-1.5"><Label>Combustível</Label>
            <select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={combustivel} onChange={(e) => setCombustivel(e.target.value)}>
              <option value="">Selecionar combustível</option>{FUEL_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <Button className="h-12 w-full" onClick={() => void criarSolicitacao()} disabled={loading || (!exigeSelecaoVeiculo && !placa)}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />} Enviar solicitação
          </Button>
        </Card>
      )}

      {step === "aguardando" && autorizacao && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3 text-amber-500"><Clock3 className="h-7 w-7" /><div><h2 className="font-bold">Aguardando liberação</h2><p className="text-xs text-muted-foreground">A solicitação está pendente no painel da administração.</p></div></div>
          <RequestSummary auth={autorizacao} posto={postoAtual} />
          <div className="grid gap-2 sm:grid-cols-2">{WHATSAPP_RECIPIENTS.map((recipient) => <Button key={recipient.phone} onClick={() => void abrirWhatsApp(recipient.phone)}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp {recipient.label}</Button>)}</div>
          <Button variant="outline" className="w-full" onClick={() => void atualizarStatus(false)}><RefreshCw className="mr-2 h-4 w-4" />Verificar liberação</Button>
        </Card>
      )}

      {step === "liberado" && autorizacao && (
        <Card className="space-y-4 border-emerald-500/30 p-5">
          <div className="flex items-center gap-3 text-emerald-500"><ShieldCheck className="h-8 w-8" /><div><h2 className="text-lg font-bold">ABASTECIMENTO LIBERADO</h2><p className="text-xs text-muted-foreground">Liberação confirmada no servidor.</p></div></div>
          <RequestSummary auth={autorizacao} posto={postoAtual} />
          <div className="rounded-lg bg-muted p-3 text-sm"><b>Ordem:</b> 1. Foto da bomba → 2. Foto do painel/KM → 3. Conferir → 4. Finalizar e gerar recibo.</div>
          <Button className="h-12 w-full" onClick={() => setStep("bomba")}><Camera className="mr-2 h-4 w-4" />Iniciar abastecimento</Button>
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
          <div><p className="text-xs font-semibold text-amber-500">ETAPA 1 DE 2</p><h2 className="text-lg font-bold">Foto da bomba</h2><p className="text-sm text-muted-foreground">Mostre TOTAL A PAGAR, LITROS e PREÇO POR LITRO. A foto é salva antes da leitura.</p></div>
          {fotoBombaUrl && <img src={fotoBombaUrl} alt="Bomba" className="max-h-64 w-full rounded-lg object-contain" />}
          <Button className="h-12 w-full" onClick={() => setCamBomba(true)} disabled={loading}><Camera className="mr-2 h-4 w-4" />{fotoBombaUrl ? "Trocar foto da bomba" : "Tirar foto da bomba"}</Button>
        </Card>
      )}

      {step === "painel" && autorizacao && (
        <Card className="space-y-4 p-4">
          <div><p className="text-xs font-semibold text-amber-500">ETAPA 2 DE 2</p><h2 className="text-lg font-bold">Foto do painel / KM</h2><p className="text-sm text-muted-foreground">Mostre claramente o hodômetro total/ODO. A foto é salva antes da leitura.</p></div>
          {fotoBombaUrl && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-600">Foto da bomba salva.</div>}
          {fotoPainelUrl && <img src={fotoPainelUrl} alt="Painel" className="max-h-64 w-full rounded-lg object-contain" />}
          <Button className="h-12 w-full" onClick={() => setCamPainel(true)} disabled={loading || !fotoBombaUrl}><Gauge className="mr-2 h-4 w-4" />{fotoPainelUrl ? "Trocar foto do painel" : "Tirar foto do painel/KM"}</Button>
        </Card>
      )}

      {step === "revisao" && autorizacao && (
        <Card className="space-y-4 p-4">
          <div><p className="text-xs font-semibold text-emerald-500">CONFERÊNCIA FINAL</p><h2 className="text-lg font-bold">Confira as duas fotos</h2><p className="mt-1 text-sm text-muted-foreground">As fotos já estão salvas. Ao finalizar, o sistema confere a autorização no servidor, lê as imagens e gera o recibo.</p></div>
          <RequestSummary auth={autorizacao} posto={postoAtual} />
          <div className="grid grid-cols-2 gap-2">
            <div><p className="mb-1 text-[11px] text-muted-foreground">Bomba — valor e litros</p><img src={fotoBombaUrl} alt="Bomba" className="h-32 w-full rounded-lg object-cover" /></div>
            <div><p className="mb-1 text-[11px] text-muted-foreground">Painel — KM</p><img src={fotoPainelUrl} alt="Painel" className="h-32 w-full rounded-lg object-cover" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setCamBomba(true)} disabled={loading}><Camera className="mr-2 h-4 w-4" />Trocar bomba</Button><Button variant="outline" onClick={() => setCamPainel(true)} disabled={loading}><Gauge className="mr-2 h-4 w-4" />Trocar painel</Button></div>
          <Button className="h-12 w-full" onClick={() => void finalizar()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Finalizar e gerar recibo</Button>
          <p className="text-center text-[11px] text-muted-foreground">Fotos + GPS são obrigatórios. Falha técnica de leitura não apaga as fotos.</p>
        </Card>
      )}

      {step === "ok" && receipt && (
        <Card className="space-y-4 border-emerald-500/30 p-5">
          <div className="flex items-center gap-3 text-emerald-500"><CheckCircle2 className="h-9 w-9" /><div><h2 className="text-lg font-bold">Abastecimento concluído</h2><p className="text-xs text-muted-foreground">Registro, fotos e recibo salvos no TOPAC RH PRO.</p></div></div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted p-4 text-sm"><span>Veículo</span><b>{receipt.placa}</b><span>Combustível</span><b>{receipt.combustivel}</b><span>Valor</span><b>R$ {receipt.valor.toFixed(2).replace(".", ",")}</b><span>Litros</span><b>{receipt.litros.toFixed(3).replace(".", ",")}</b><span>KM</span><b>{receipt.kmAtual?.toLocaleString("pt-BR")}</b></div>
          {pdfCache && <div className="grid grid-cols-3 gap-2"><Button variant="outline" onClick={viewPdf}><Eye className="h-4 w-4" /></Button><Button variant="outline" onClick={downloadPdf}><FileDown className="h-4 w-4" /></Button><Button variant="outline" onClick={() => void sharePdf()}><Share2 className="h-4 w-4" /></Button></div>}
          <Button className="w-full" variant="outline" onClick={novaSolicitacao}>Voltar</Button>
        </Card>
      )}

      <CameraCapture open={camBomba} onClose={() => setCamBomba(false)} onCapture={onCaptureBomba} facing="environment" allowGallery title="Foto da Bomba" hint="Mostre claramente TOTAL A PAGAR, LITROS e PREÇO POR LITRO" />
      <CameraCapture open={camPainel} onClose={() => setCamPainel(false)} onCapture={onCapturePainel} facing="environment" allowGallery title="Painel do Carro / KM" hint="Mostre claramente o hodômetro total/ODO" />
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
