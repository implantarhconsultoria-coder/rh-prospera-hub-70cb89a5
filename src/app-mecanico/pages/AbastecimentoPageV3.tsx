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
import { uploadFoto } from "../lib/upload";
import { gerarCupomAbastecimentoPdf } from "../lib/abastecimentoPdf";

type Step = "solicitar" | "aguardando" | "liberado" | "bomba" | "painel" | "revisao" | "negado" | "ok";
type Posto = { codigo: string; nome: string; cnpj?: string | null; telefone?: string | null; endereco?: string | null };
type VeiculoInfo = { placa: string; descricao?: string | null };
type MecInfo = { nome: string; empresa: string; filial: string; funcao?: string | null };
type Authorization = {
  id: string; app_request_id: string; funcionario_nome?: string | null; empresa_nome?: string | null;
  filial?: string | null; placa: string; combustivel: string; posto_nome: string; posto_codigo?: string | null;
  solicitado_em?: string | null; status: string; autorizado_em?: string | null; autorizado_por_nome?: string | null;
};
type ContextResult = {
  ok?: boolean; error?: string; mecanico?: MecInfo; veiculos?: VeiculoInfo[]; veiculo_fixo?: string | null;
  exige_selecao_veiculo?: boolean; postos?: Posto[]; solicitacao_ativa?: Authorization | null;
};
type StatusResult = { ok?: boolean; error?: string; authorization?: Authorization | null; posto?: Posto | null };
type ReceiptInfo = {
  id: string; codigo: string; postoNome: string; postoCnpj: string; mecanicoNome: string; empresa: string; filial: string;
  placa: string; veiculo: string; combustivel: string; fotoBombaUrl: string; fotoPainelUrl: string; createdAt: Date;
};

const FUEL_OPTIONS = ["Gasolina", "Etanol", "Diesel", "Diesel S10", "GNV"];
const WHATSAPP_RECIPIENTS = [
  { label: "Administrativo", phone: "5511971535944" },
  { label: "Robson", phone: "5511942920385" },
] as const;

const supabaseRpc = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
const normalizePlate = (value: string | null | undefined) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
const stepFromStatus = (status?: string): Step => status === "autorizado" ? "liberado" : status === "negado" ? "negado" : "aguardando";

const fuelErrorMessage = (code?: string) => {
  if (code === "gps_obrigatorio") return "Ative a localização do aparelho. O abastecimento não é salvo sem GPS.";
  if (code === "abastecimento_nao_autorizado") return "A solicitação ainda não foi autorizada pela administração.";
  if (code === "foto_bomba_obrigatoria") return "A foto da bomba é obrigatória.";
  if (code === "foto_painel_obrigatoria") return "A foto do painel é obrigatória.";
  if (code === "posto_invalido") return "O posto da unidade não está configurado.";
  if (code === "placa_obrigatoria") return "Selecione o veículo liberado.";
  return code || "Não foi possível concluir o abastecimento.";
};

export default function AbastecimentoPageV3() {
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

  const publicStorageUrl = (path?: string | null) => path ? supabase.storage.from("abastecimento-fotos").getPublicUrl(path).data.publicUrl || "" : "";

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
      const { data, error } = await supabaseRpc.rpc("app_mecanico_abastecimento_contexto", { p_acesso_id: mecanico.acesso_id });
      const result = data as ContextResult | null;
      if (error || !result?.ok) throw new Error(result?.error || error?.message || "Falha ao carregar abastecimento.");

      const vehicleList = (result.veiculos || []).map(v => ({ ...v, placa: normalizePlate(v.placa) })).filter(v => v.placa);
      const stationList = result.postos || [];
      const mustSelect = Boolean(result.exige_selecao_veiculo);
      const fixedPlate = normalizePlate(result.veiculo_fixo);
      setMecInfo(result.mecanico || null);
      setVeiculos(vehicleList);
      setPostos(stationList);
      setExigeSelecaoVeiculo(mustSelect);
      if (!mustSelect) setPlaca(fixedPlate || vehicleList[0]?.placa || "");
      else if (vehicleList.length === 1) setPlaca(vehicleList[0].placa);
      if (stationList.length === 1) setPostoCodigo(stationList[0].codigo);

      const active = result.solicitacao_ativa;
      if (!active?.id) {
        setAutorizacao(null); setFotoBombaUrl(""); setFotoPainelUrl(""); setStep("solicitar"); return;
      }
      setAutorizacao(active);
      setPlaca(normalizePlate(active.placa));
      setCombustivel(active.combustivel || "");
      setPostoCodigo(active.posto_codigo || "");
      setPostoAtual(stationList.find(s => s.codigo === active.posto_codigo) || null);
      const saved = await restaurarFotos(active.id);
      if (active.status === "pendente") setStep("aguardando");
      else if (active.status === "negado") setStep("negado");
      else if (active.status === "autorizado") {
        if (saved.bomba && saved.painel) setStep("revisao");
        else if (saved.bomba) setStep("painel");
        else setStep("liberado");
      } else setStep(stepFromStatus(active.status));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar abastecimento.");
    } finally { setLoading(false); }
  }, [mecanico.acesso_id, restaurarFotos]);

  useEffect(() => { void carregarContexto(); }, [carregarContexto]);

  const atualizarStatus = useCallback(async (silent = false) => {
    if (!autorizacao?.id) return null;
    const { data, error } = await supabaseRpc.rpc("app_mecanico_status_abastecimento", {
      p_acesso_id: mecanico.acesso_id, p_autorizacao_id: autorizacao.id,
    });
    const result = data as StatusResult | null;
    if (error || !result?.ok || !result.authorization) {
      if (!silent) toast.error("Não foi possível verificar a autorização.");
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
    `Veículo: ${normalizePlate(auth.placa)}`, `Combustível: ${auth.combustivel}`,
    `Posto: ${station?.nome || auth.posto_nome}`, `Protocolo: ${auth.app_request_id}`, "", "Aguardando liberação no TOPAC RH PRO.",
  ].join("\n");

  const abrirWhatsApp = (phone: string, auth = autorizacao, station = postoAtual) => {
    if (!auth) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppText(auth, station))}`, "_blank", "noopener,noreferrer");
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
        p_acesso_id: mecanico.acesso_id, p_placa: exigeSelecaoVeiculo ? plate : null,
        p_combustivel: combustivel, p_posto_codigo: stationCode, p_valor_estimado: null, p_observacao: null,
      });
      const result = data as { ok?: boolean; error?: string; existing?: boolean; authorization?: Authorization; posto?: Posto } | null;
      if (error || !result?.ok || !result.authorization) return toast.error(fuelErrorMessage(result?.error || error?.message));
      const auth = result.authorization;
      setAutorizacao(auth);
      setPostoAtual(result.posto || postos.find(p => p.codigo === auth.posto_codigo) || null);
      setStep(stepFromStatus(auth.status));
      toast.success(result.existing ? "Solicitação em andamento recuperada." : "Solicitação enviada. Aguarde a liberação.");
      if (!result.existing) WHATSAPP_RECIPIENTS.forEach(r => window.open(`https://wa.me/${r.phone}?text=${encodeURIComponent(buildWhatsAppText(auth, result.posto || null))}`, "_blank", "noopener,noreferrer"));
    } finally { setLoading(false); }
  };

  const novaSolicitacao = () => {
    setAutorizacao(null); setPostoAtual(null); setFotoBombaUrl(""); setFotoPainelUrl(""); setReceipt(null); setPdfCache(null); setStep("solicitar");
  };

  const onCaptureBomba = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de abastecer.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, `bomba-${autorizacao.id}`, blob);
      setFotoBombaUrl(url); toast.success("Foto da bomba salva."); setStep(fotoPainelUrl ? "revisao" : "painel");
    } finally { setLoading(false); }
  };

  const onCapturePainel = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de continuar.");
    if (!fotoBombaUrl) throw new Error("Envie primeiro a foto da bomba.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, `painel-${autorizacao.id}`, blob);
      setFotoPainelUrl(url); toast.success("Foto do painel salva."); setStep("revisao");
    } finally { setLoading(false); }
  };

  const finalizar = async () => {
    if (!autorizacao) return toast.error("Solicitação não encontrada.");
    if (!fotoBombaUrl || !fotoPainelUrl) return toast.error("As duas fotos são obrigatórias.");
    setLoading(true);
    try {
      const current = await atualizarStatus(true);
      if (!current || current.status !== "autorizado") return toast.error("A administração ainda não autorizou esta solicitação.");
      const location = await getBrowserLocation();
      if (location.latitude == null || location.longitude == null) return toast.error("Ative a localização do aparelho. O GPS é obrigatório.");

      const { data, error } = await supabaseRpc.rpc("app_mecanico_finalizar_abastecimento_autorizado", {
        p_acesso_id: mecanico.acesso_id, p_autorizacao_id: current.id,
        p_valor: 0, p_litros: 0, p_km: null,
        p_foto_bomba_url: fotoBombaUrl, p_foto_painel_url: fotoPainelUrl,
        p_latitude: location.latitude, p_longitude: location.longitude, p_endereco: null,
      });
      const result = data as { ok?: boolean; error?: string; id?: string; duplicado?: boolean } | null;
      if (error || !result?.ok || !result.id) return toast.error(fuelErrorMessage(result?.error || error?.message));

      const station = postoAtual || postos.find(p => p.codigo === current.posto_codigo) || null;
      const vehicle = veiculos.find(v => normalizePlate(v.placa) === normalizePlate(current.placa)) || null;
      const info: ReceiptInfo = {
        id: result.id, codigo: current.app_request_id, postoNome: station?.nome || current.posto_nome,
        postoCnpj: station?.cnpj || "", mecanicoNome: current.funcionario_nome || mecInfo?.nome || mecanico.nome,
        empresa: current.empresa_nome || mecInfo?.empresa || mecanico.empresa, filial: current.filial || mecInfo?.filial || mecanico.filial,
        placa: normalizePlate(current.placa), veiculo: vehicle?.descricao || "", combustivel: current.combustivel,
        fotoBombaUrl, fotoPainelUrl, createdAt: new Date(),
      };
      const pdf = await gerarCupomAbastecimentoPdf(info);
      const reciboPdfUrl = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, `recibo-${info.id}`, pdf.blob);
      await supabaseRpc.rpc("app_mecanico_vincular_recibo_pdf", { p_acesso_id: mecanico.acesso_id, p_abastecimento_id: info.id, p_recibo_pdf_url: reciboPdfUrl });
      setReceipt(info); setPdfCache(pdf); setStep("ok");
      toast.success("Abastecimento concluído. Fotos e recibo salvos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar o abastecimento.");
    } finally { setLoading(false); }
  };

  const downloadPdf = () => {
    if (!pdfCache) return; const url = URL.createObjectURL(pdfCache.blob); const a = document.createElement("a"); a.href = url; a.download = pdfCache.fileName; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const viewPdf = () => {
    if (!pdfCache) return; const url = URL.createObjectURL(pdfCache.blob); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  };
  const sharePdf = async () => {
    if (!pdfCache) return; const file = new File([pdfCache.blob], pdfCache.fileName, { type: "application/pdf" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) await navigator.share({ title: "Comprovante de abastecimento TOPAC", files: [file] }); else downloadPdf();
  };

  if (loading && !mecInfo && !autorizacao) return <Card className="flex min-h-[260px] items-center justify-center p-6"><Loader2 className="h-7 w-7 animate-spin" /></Card>;

  return <div className="space-y-4">
    <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500"><Fuel className="h-5 w-5" /></div><div><h1 className="text-base font-bold">Solicitação de Abastecimento</h1><p className="text-xs text-muted-foreground">Solicite, aguarde a liberação, tire as duas fotos e finalize.</p></div></div></Card>

    {step === "solicitar" && <Card className="space-y-4 p-4">
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-muted-foreground">Toda nova solicitação entra como <b>PENDENTE</b>. Somente a administração libera.</div>
      {exigeSelecaoVeiculo && <div className="space-y-1.5"><Label>Veículo liberado</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={placa} onChange={e => setPlaca(normalizePlate(e.target.value))}><option value="">Selecionar veículo</option>{veiculos.map(v => <option key={v.placa} value={v.placa}>{v.descricao || v.placa} · {v.placa}</option>)}</select></div>}
      {!exigeSelecaoVeiculo && !placa && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">Seu veículo fixo ainda não foi configurado.</div>}
      <div className="space-y-1.5"><Label>Combustível</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={combustivel} onChange={e => setCombustivel(e.target.value)}><option value="">Selecionar combustível</option>{FUEL_OPTIONS.map(f => <option key={f}>{f}</option>)}</select></div>
      <Button className="h-12 w-full" onClick={() => void criarSolicitacao()} disabled={loading || (!exigeSelecaoVeiculo && !placa)}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}Enviar solicitação</Button>
    </Card>}

    {step === "aguardando" && autorizacao && <Card className="space-y-4 p-5"><div className="flex items-center gap-3 text-amber-500"><Clock3 className="h-7 w-7" /><div><h2 className="font-bold">Aguardando liberação</h2><p className="text-xs text-muted-foreground">A solicitação está no painel da administração.</p></div></div><RequestSummary auth={autorizacao} posto={postoAtual} /><div className="grid gap-2 sm:grid-cols-2">{WHATSAPP_RECIPIENTS.map(r => <Button key={r.phone} onClick={() => abrirWhatsApp(r.phone)}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp {r.label}</Button>)}</div><Button variant="outline" className="w-full" onClick={() => void atualizarStatus(false)}><RefreshCw className="mr-2 h-4 w-4" />Verificar liberação</Button></Card>}

    {step === "liberado" && autorizacao && <Card className="space-y-4 border-emerald-500/30 p-5"><div className="flex items-center gap-3 text-emerald-500"><ShieldCheck className="h-8 w-8" /><div><h2 className="text-lg font-bold">ABASTECIMENTO LIBERADO</h2><p className="text-xs text-muted-foreground">Agora só tire as duas fotos.</p></div></div><RequestSummary auth={autorizacao} posto={postoAtual} /><div className="rounded-lg bg-muted p-3 text-sm"><b>Ordem:</b> foto da bomba → foto do painel → finalizar.</div><Button className="h-12 w-full" onClick={() => setStep("bomba")}><Camera className="mr-2 h-4 w-4" />Iniciar abastecimento</Button></Card>}

    {step === "negado" && autorizacao && <Card className="space-y-4 border-red-500/30 p-5"><div className="flex items-center gap-3 text-red-500"><XCircle className="h-8 w-8" /><div><h2 className="font-bold">Solicitação não autorizada</h2><p className="text-xs text-muted-foreground">Não realize o abastecimento com esta solicitação.</p></div></div><RequestSummary auth={autorizacao} posto={postoAtual} /><Button className="w-full" variant="outline" onClick={novaSolicitacao}>Nova solicitação</Button></Card>}

    {step === "bomba" && autorizacao && <Card className="space-y-4 p-4"><div><p className="text-xs font-semibold text-amber-500">ETAPA 1 DE 2</p><h2 className="text-lg font-bold">Foto da bomba</h2><p className="text-sm text-muted-foreground">Fotografe o visor completo. O sistema apenas salva a foto.</p></div>{fotoBombaUrl && <img src={fotoBombaUrl} alt="Bomba" className="max-h-64 w-full rounded-lg object-contain" />}<Button className="h-12 w-full" onClick={() => setCamBomba(true)} disabled={loading}><Camera className="mr-2 h-4 w-4" />{fotoBombaUrl ? "Trocar foto da bomba" : "Tirar foto da bomba"}</Button></Card>}

    {step === "painel" && autorizacao && <Card className="space-y-4 p-4"><div><p className="text-xs font-semibold text-amber-500">ETAPA 2 DE 2</p><h2 className="text-lg font-bold">Foto do painel / KM</h2><p className="text-sm text-muted-foreground">Fotografe o painel com o hodômetro visível. O sistema apenas salva a foto.</p></div>{fotoBombaUrl && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-600">Foto da bomba salva.</div>}{fotoPainelUrl && <img src={fotoPainelUrl} alt="Painel" className="max-h-64 w-full rounded-lg object-contain" />}<Button className="h-12 w-full" onClick={() => setCamPainel(true)} disabled={loading || !fotoBombaUrl}><Gauge className="mr-2 h-4 w-4" />{fotoPainelUrl ? "Trocar foto do painel" : "Tirar foto do painel/KM"}</Button></Card>}

    {step === "revisao" && autorizacao && <Card className="space-y-4 p-4"><div><p className="text-xs font-semibold text-emerald-500">CONFERÊNCIA FINAL</p><h2 className="text-lg font-bold">Fotos prontas</h2><p className="mt-1 text-sm text-muted-foreground">Sem reconhecimento e sem preenchimento. Ao finalizar, as fotos + GPS viram o comprovante.</p></div><RequestSummary auth={autorizacao} posto={postoAtual} /><div className="grid grid-cols-2 gap-2"><div><p className="mb-1 text-[11px] text-muted-foreground">Foto da bomba</p><img src={fotoBombaUrl} alt="Bomba" className="h-32 w-full rounded-lg object-cover" /></div><div><p className="mb-1 text-[11px] text-muted-foreground">Foto do painel / KM</p><img src={fotoPainelUrl} alt="Painel" className="h-32 w-full rounded-lg object-cover" /></div></div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setCamBomba(true)} disabled={loading}><Camera className="mr-2 h-4 w-4" />Trocar bomba</Button><Button variant="outline" onClick={() => setCamPainel(true)} disabled={loading}><Gauge className="mr-2 h-4 w-4" />Trocar painel</Button></div><Button className="h-12 w-full" onClick={() => void finalizar()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Finalizar e gerar recibo</Button><p className="text-center text-[11px] text-muted-foreground">Nenhum número precisa ser digitado. Fotos + GPS são o registro.</p></Card>}

    {step === "ok" && receipt && <Card className="space-y-4 border-emerald-500/30 p-5"><div className="flex items-center gap-3 text-emerald-500"><CheckCircle2 className="h-9 w-9" /><div><h2 className="text-lg font-bold">Abastecimento concluído</h2><p className="text-xs text-muted-foreground">Fotos, GPS e recibo salvos no TOPAC RH PRO.</p></div></div><div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted p-4 text-sm"><span>Veículo</span><b>{receipt.placa}</b><span>Combustível</span><b>{receipt.combustivel}</b><span>Dados</span><b>Conforme fotos</b></div>{pdfCache && <div className="grid grid-cols-3 gap-2"><Button variant="outline" onClick={viewPdf}><Eye className="h-4 w-4" /></Button><Button variant="outline" onClick={downloadPdf}><FileDown className="h-4 w-4" /></Button><Button variant="outline" onClick={() => void sharePdf()}><Share2 className="h-4 w-4" /></Button></div>}<Button className="w-full" variant="outline" onClick={novaSolicitacao}>Voltar</Button></Card>}

    <CameraCapture open={camBomba} onClose={() => setCamBomba(false)} onCapture={onCaptureBomba} facing="environment" allowGallery title="Foto da Bomba" hint="Fotografe o visor completo da bomba" />
    <CameraCapture open={camPainel} onClose={() => setCamPainel(false)} onCapture={onCapturePainel} facing="environment" allowGallery title="Painel do Carro / KM" hint="Fotografe o painel com o hodômetro visível" />
  </div>;
}

function RequestSummary({ auth, posto }: { auth: Authorization; posto?: Posto | null }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted p-4 text-sm"><span className="text-muted-foreground">Protocolo</span><b className="text-right">{auth.app_request_id}</b><span className="text-muted-foreground">Veículo</span><b className="text-right">{normalizePlate(auth.placa)}</b><span className="text-muted-foreground">Combustível</span><b className="text-right">{auth.combustivel}</b><span className="text-muted-foreground">Posto</span><b className="text-right">{posto?.nome || auth.posto_nome}</b></div>;
}
