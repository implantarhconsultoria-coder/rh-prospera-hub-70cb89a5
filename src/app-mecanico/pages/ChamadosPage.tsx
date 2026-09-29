import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle, BellRing, Building2, CheckCircle2, Clock3, Loader2, MapPin, Package,
  Plus, RotateCcw, Trash2, Truck, UserRound, Wrench,
} from "lucide-react";
import { toast } from "sonner";

interface RpcResult<T> { ok?: boolean; error?: string; chamados?: T[]; id?: string; status?: string; mecanico?: string; }
const chamadosRpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

interface Chamado {
  id: string;
  numero?: number | null;
  cliente: string;
  local_servico: string;
  tipo_servico: string;
  itens_previstos?: string | null;
  status: string;
  observacoes?: string | null;
  solicitante_nome?: string | null;
  solicitante_contato?: string | null;
  operador_abertura_nome?: string | null;
  descricao_conclusao?: string | null;
  placa_snapshot?: string | null;
  patrimonio_snapshot?: string | null;
  notificacao_pendente?: boolean;
  created_at: string;
}

type MaterialDraft = { descricao: string; quantidade: string; unidade: string };

const SERVICOS_PADRAO_COMPRESSOR = [
  "Troca de óleo da unidade",
  "Troca de óleo do motor",
  "Filtro de ar — limpar",
  "Filtro de ar — trocar",
  "Filtro separador — trocar",
  "Filtro de óleo / lubrificante",
  "Correia do alternador",
  "Bateria",
  "Relé / fusível / solenoide",
  "Sensor / cebolinha de óleo",
  "Mangueira / abraçadeira",
  "Água / reservatório / radiador",
  "Bomba injetora",
  "Motor de partida / alternador",
  "Acoplamento",
  "Revisão preventiva",
  "Outro",
];

const STATUS_LABELS: Record<string, string> = {
  pendente: "Nova ocorrência",
  aceito: "Aceito",
  em_deslocamento: "A caminho",
  no_local: "No cliente",
  em_execucao: "Em atendimento",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const dt = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const normalizarChamados = (items: unknown): Chamado[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => item as Partial<Chamado>)
    .filter((item) => Boolean(item.id))
    .map((item) => ({
      id: String(item.id),
      numero: item.numero == null ? null : Number(item.numero),
      cliente: String(item.cliente || "Sem cliente"),
      local_servico: String(item.local_servico || ""),
      tipo_servico: String(item.tipo_servico || "Ocorrência"),
      itens_previstos: item.itens_previstos || null,
      status: String(item.status || "pendente"),
      observacoes: item.observacoes || null,
      solicitante_nome: item.solicitante_nome || null,
      solicitante_contato: item.solicitante_contato || null,
      operador_abertura_nome: item.operador_abertura_nome || null,
      descricao_conclusao: item.descricao_conclusao || null,
      placa_snapshot: item.placa_snapshot || null,
      patrimonio_snapshot: item.patrimonio_snapshot || null,
      notificacao_pendente: Boolean(item.notificacao_pendente),
      created_at: String(item.created_at || ""),
    }));
};

export default function ChamadosPage() {
  const { mecanico } = useMecanicoApp();
  const { getLocation } = useGeolocation();
  const [lista, setLista] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [obs, setObs] = useState("");
  const [conclusao, setConclusao] = useState("");
  const [servicosExecutados, setServicosExecutados] = useState<string[]>([]);
  const [acting, setActing] = useState(false);
  const [notificacaoAberta, setNotificacaoAberta] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  const [adicionalChamadoId, setAdicionalChamadoId] = useState<string | null>(null);
  const [adicionalProblema, setAdicionalProblema] = useState("");
  const [adicionalExecutado, setAdicionalExecutado] = useState("");
  const [adicionalObs, setAdicionalObs] = useState("");
  const [materiais, setMateriais] = useState<MaterialDraft[]>([]);

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErro(null);
    try {
      const { data, error } = await chamadosRpc.rpc("app_mecanico_listar_chamados", { p_acesso_id: mecanico.acesso_id });
      const result = data as RpcResult<Chamado> | null;
      if (error || !result?.ok) {
        const message = result?.error || error?.message || "Erro ao carregar ocorrências";
        setErro(message);
        setLista([]);
      } else {
        setLista(normalizarChamados(result.chamados));
      }
    } catch {
      setErro("Não foi possível carregar as ocorrências agora.");
      setLista([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [mecanico.acesso_id]);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(() => void carregar(true), 5000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const novos = useMemo(() => lista.filter((c) => c.status === "pendente" && c.notificacao_pendente), [lista]);
  const chamadoAberto = useMemo(() => lista.find((c) => c.id === aberto) || null, [lista, aberto]);
  const ocorrenciaNotificacao = novos[0] || null;

  const fecharNotificacaoSistema = useCallback(async (id: string) => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const notices = await registration.getNotifications({ tag: `topac-ocorrencia-${id}` });
      notices.forEach((notice) => notice.close());
    } catch {
      // Notificação de sistema é complementar; o fluxo do app continua.
    }
  }, []);

  const mostrarNotificacaoSistema = useCallback(async (c: Chamado) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const url = `${window.location.pathname}?ocorrencia=${encodeURIComponent(c.id)}`;
      const options = {
        body: `${c.cliente} • ${c.local_servico || "Local não informado"}\n${c.tipo_servico || "Nova ocorrência"}`,
        icon: "/icons/topac-rh-pro.svg?v=20260929-ocorrencias",
        badge: "/icons/topac-rh-pro.svg?v=20260929-ocorrencias",
        tag: `topac-ocorrencia-${c.id}`,
        renotify: true,
        requireInteraction: true,
        vibrate: [600, 250, 600],
        data: { url },
      } as NotificationOptions & { vibrate?: number[]; renotify?: boolean };
      await registration.showNotification(`TOPAC • Nova ocorrência #${c.numero || ""}`.trim(), options);
    } catch {
      // A janela interna continua sendo a garantia principal.
    }
  }, []);

  const ativarNotificacoes = async () => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      toast.error("Este aparelho/navegador não suporta notificação do sistema.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        toast.success("Alertas do celular ativados.");
        if (ocorrenciaNotificacao) await mostrarNotificacaoSistema(ocorrenciaNotificacao);
      } else {
        toast.warning("Notificação do sistema não foi autorizada. O alerta dentro do app continuará ativo.");
      }
    } catch {
      toast.error("Não foi possível solicitar a permissão de notificação.");
    }
  };

  useEffect(() => {
    if (!novos.length) {
      setNotificacaoAberta(false);
      if ("vibrate" in navigator) navigator.vibrate(0);
      return;
    }

    setNotificacaoAberta(true);

    const vibrar = () => {
      if (document.visibilityState !== "hidden" && "vibrate" in navigator) {
        navigator.vibrate([650, 250, 650]);
      }
    };

    vibrar();
    const timer = window.setInterval(vibrar, 5000);
    return () => {
      window.clearInterval(timer);
      if ("vibrate" in navigator) navigator.vibrate(0);
    };
  }, [novos.length]);

  useEffect(() => {
    for (const c of novos) {
      if (notifiedIdsRef.current.has(c.id)) continue;
      notifiedIdsRef.current.add(c.id);
      void mostrarNotificacaoSistema(c);
    }

    const activeIds = new Set(novos.map((c) => c.id));
    for (const id of Array.from(notifiedIdsRef.current)) {
      if (!activeIds.has(id)) {
        notifiedIdsRef.current.delete(id);
        void fecharNotificacaoSistema(id);
      }
    }
  }, [novos, mostrarNotificacaoSistema, fecharNotificacaoSistema]);

  useEffect(() => {
    const targetId = new URLSearchParams(window.location.search).get("ocorrencia");
    if (!targetId || !lista.some((c) => c.id === targetId)) return;
    setAberto(targetId);
    setNotificacaoAberta(true);
  }, [lista]);

  const fecharDetalhes = () => {
    if (acting) return;
    setAberto(null);
    setObs("");
    setConclusao("");
    setServicosExecutados([]);
    setAdicionalChamadoId(null);
    setAdicionalProblema("");
    setAdicionalExecutado("");
    setAdicionalObs("");
    setMateriais([]);
  };

  const alternarServico = (item: string) => {
    setServicosExecutados((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  };

  const acao = async (chamado: Chamado, acaoAtual: "aceitar" | "deslocamento" | "chegada" | "iniciar" | "finalizar") => {
    if (acting) return;

    const descricaoFinal = [
      servicosExecutados.length ? `Serviços realizados: ${servicosExecutados.join(", ")}.` : "",
      conclusao.trim() ? `Observação do mecânico: ${conclusao.trim()}` : "",
    ].filter(Boolean).join(" ");

    if (acaoAtual === "finalizar" && !descricaoFinal) {
      toast.error("Selecione o serviço realizado ou descreva o que foi executado.");
      return;
    }

    setActing(true);
    try {
      let latitude: number | null = null;
      let longitude: number | null = null;

      if (["chegada", "iniciar", "finalizar"].includes(acaoAtual)) {
        toast.info("Confirmando localização...");
        const geo = await getLocation();
        latitude = geo.latitude;
        longitude = geo.longitude;
        if (latitude == null || longitude == null) {
          toast.error("A localização é obrigatória nesta etapa. Ative o GPS e tente novamente.");
          return;
        }
      }

      const { data, error } = await chamadosRpc.rpc("app_mecanico_chamado_acao_v2", {
        p_acesso_id: mecanico.acesso_id,
        p_chamado_id: chamado.id,
        p_acao: acaoAtual,
        p_observacao: obs.trim() || null,
        p_latitude: latitude,
        p_longitude: longitude,
        p_descricao_conclusao: acaoAtual === "finalizar" ? descricaoFinal : null,
      });
      const result = data as RpcResult<Chamado> | null;
      if (error || !result?.ok) {
        toast.error(result?.error === "sequencia_status_invalida"
          ? "A ocorrência mudou de etapa. Atualize e tente novamente."
          : result?.error || error?.message || "Erro ao atualizar ocorrência");
        return;
      }

      const mensagem: Record<string, string> = {
        aceitar: "Ocorrência aceita. A Central Operacional já foi atualizada.",
        deslocamento: "Deslocamento iniciado.",
        chegada: "Chegada ao cliente registrada com localização.",
        iniciar: "Serviço iniciado com localização registrada.",
        finalizar: "Ocorrência finalizada. Serviço e localização registrados.",
      };

      if (acaoAtual === "finalizar") {
        try {
          const response = await fetch("/api/operacional-formalizacao", {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              type: "ocorrencia_concluida",
              id: chamado.id,
              mecanico_acesso_id: mecanico.acesso_id,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload?.ok === false) {
            toast.warning("Ocorrência concluída; o e-mail de formalização ficou pendente.");
          }
        } catch {
          toast.warning("Ocorrência concluída; o e-mail de formalização ficou pendente.");
        }
      }

      toast.success(mensagem[acaoAtual]);
      if (acaoAtual === "aceitar") {
        await fecharNotificacaoSistema(chamado.id);
      }
      setObs("");
      setConclusao("");
      setServicosExecutados([]);
      await carregar(true);
      if (acaoAtual === "finalizar") setAberto(null);
    } catch {
      toast.error("Não foi possível atualizar a ocorrência agora.");
    } finally {
      setActing(false);
    }
  };

  const novaLinhaMaterial = () => setMateriais((current) => [...current, { descricao: "", quantidade: "1", unidade: "un" }]);
  const atualizarMaterial = (index: number, key: keyof MaterialDraft, value: string) => setMateriais((current) =>
    current.map((item, i) => i === index ? { ...item, [key]: value } : item)
  );
  const removerMaterial = (index: number) => setMateriais((current) => current.filter((_, i) => i !== index));

  const salvarAdicional = async (chamado: Chamado) => {
    if (acting) return;
    if (!adicionalProblema.trim() || !adicionalExecutado.trim()) {
      toast.error("Informe o que foi encontrado e o que foi executado.");
      return;
    }

    setActing(true);
    try {
      const geo = await getLocation();
      const materiaisValidos = materiais
        .filter((m) => m.descricao.trim())
        .map((m) => ({
          descricao: m.descricao.trim(),
          quantidade: Number(String(m.quantidade || "1").replace(",", ".")) || 1,
          unidade: m.unidade.trim() || "un",
        }));

      const { data, error } = await chamadosRpc.rpc("app_mecanico_registrar_adicional", {
        p_acesso_id: mecanico.acesso_id,
        p_chamado_id: chamado.id,
        p_descricao_identificada: adicionalProblema.trim(),
        p_servico_executado: adicionalExecutado.trim(),
        p_observacao: adicionalObs.trim() || null,
        p_latitude: geo.latitude,
        p_longitude: geo.longitude,
        p_materiais: materiaisValidos,
      });
      const result = data as RpcResult<Chamado> | null;
      if (error || !result?.ok) {
        toast.error(result?.error || error?.message || "Não foi possível registrar o adicional.");
        return;
      }

      toast.success("Adicional registrado. A Central Operacional foi alertada.");
      setAdicionalChamadoId(null);
      setAdicionalProblema("");
      setAdicionalExecutado("");
      setAdicionalObs("");
      setMateriais([]);
      await carregar(true);
    } catch {
      toast.error("Não foi possível registrar o adicional.");
    } finally {
      setActing(false);
    }
  };

  const proximaAcao = (status: string) => {
    switch (status) {
      case "pendente": return { label: "ACEITAR OCORRÊNCIA", acao: "aceitar" as const, icon: CheckCircle2 };
      case "aceito": return { label: "ESTOU A CAMINHO", acao: "deslocamento" as const, icon: Truck };
      case "em_deslocamento": return { label: "CHEGUEI NO CLIENTE", acao: "chegada" as const, icon: MapPin };
      case "no_local": return { label: "INICIAR SERVIÇO", acao: "iniciar" as const, icon: Wrench };
      case "em_execucao":
      case "em_atendimento": return { label: "FINALIZAR OCORRÊNCIA", acao: "finalizar" as const, icon: CheckCircle2 };
      default: return null;
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pb-4">
      {novos.length > 0 && (
        <Card className="sticky top-2 z-20 border-amber-400/60 bg-amber-500/15 p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-500 text-black">
              <BellRing className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{novos.length}</span>
            </span>
            <div className="flex-1">
              <p className="font-black text-amber-100">Nova ocorrência recebida</p>
              <p className="mt-1 text-xs text-amber-200/80">Confira todos os detalhes antes de aceitar.</p>
              <Button size="sm" className="mt-3 bg-amber-500 font-black text-black hover:bg-amber-400" onClick={() => setAberto(novos[0].id)}>
                Ver detalhes da ocorrência
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="border-fuchsia-500/20 bg-[#07070d] p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-fuchsia-500/10 text-fuchsia-400"><Wrench className="h-6 w-6" /></span>
          <div>
            <h1 className="font-bold">Ocorrências</h1>
            <p className="text-xs text-zinc-400">Receba, confira e execute as ocorrências enviadas pelo Operacional.</p>
          </div>
        </div>
      </Card>

      {erro ? (
        <Card className="space-y-4 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <div><p className="font-medium">Ocorrências indisponíveis no momento.</p><p className="mt-1 text-sm text-muted-foreground">{erro}</p></div>
          <Button variant="outline" onClick={() => void carregar()}><RotateCcw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
        </Card>
      ) : lista.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">Nenhuma ocorrência recebida.</Card>
      ) : (
        <div className="space-y-3">
          {lista.map((c) => (
            <Card key={c.id} className={`space-y-3 p-4 ${c.status === "pendente" && c.notificacao_pendente ? "border-amber-400/60 bg-amber-500/5" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.numero ? `#${c.numero} • ` : ""}{c.tipo_servico || "Ocorrência"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.cliente || "TOPAC"} • {c.local_servico || "Local não informado"}</p>
                  {(c.patrimonio_snapshot || c.placa_snapshot) && (
                    <p className="mt-1 text-[11px] font-semibold text-fuchsia-500">
                      {[c.patrimonio_snapshot && `Pat. ${c.patrimonio_snapshot}`, c.placa_snapshot && `Placa ${c.placa_snapshot}`].filter(Boolean).join(" • ")}
                    </p>
                  )}
                </div>
                <Badge variant={c.status === "concluido" ? "secondary" : c.status === "em_execucao" ? "default" : "outline"}>{STATUS_LABELS[c.status] || c.status}</Badge>
              </div>

              <Button variant={c.status === "pendente" ? "default" : "outline"} className="w-full" onClick={() => setAberto(c.id)}>
                {c.status === "pendente" ? "VER DETALHES ANTES DE ACEITAR" : c.status === "concluido" ? "VER OCORRÊNCIA" : "CONTINUAR OCORRÊNCIA"}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={notificacaoAberta && !!ocorrenciaNotificacao && !chamadoAberto}
        onOpenChange={(open) => {
          if (!open && ocorrenciaNotificacao) {
            setNotificacaoAberta(true);
            return;
          }
          setNotificacaoAberta(open);
        }}
      >
        <DialogContent
          className="max-w-sm border-amber-400/50 bg-[#09090f] text-white"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          {ocorrenciaNotificacao && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-left text-amber-300">
                  <span className="relative grid h-10 w-10 place-items-center rounded-full bg-amber-500 text-black">
                    <BellRing className="h-5 w-5" />
                    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{novos.length}</span>
                  </span>
                  NOVA OCORRÊNCIA
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/5 p-4">
                  <p className="text-lg font-black">#{ocorrenciaNotificacao.numero || "—"} • {ocorrenciaNotificacao.cliente}</p>
                  <p className="mt-1 text-sm text-zinc-300">{ocorrenciaNotificacao.local_servico || "Local não informado"}</p>
                  <p className="mt-3 font-semibold text-white">{ocorrenciaNotificacao.tipo_servico || "Ocorrência recebida"}</p>
                  {(ocorrenciaNotificacao.patrimonio_snapshot || ocorrenciaNotificacao.placa_snapshot) && (
                    <p className="mt-2 text-xs text-fuchsia-300">
                      {[ocorrenciaNotificacao.patrimonio_snapshot && `Pat. ${ocorrenciaNotificacao.patrimonio_snapshot}`, ocorrenciaNotificacao.placa_snapshot && `Placa ${ocorrenciaNotificacao.placa_snapshot}`].filter(Boolean).join(" • ")}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200">
                  O alerta permanece ativo e o aparelho tenta vibrar a cada 5 segundos até a ocorrência ser aceita.
                </div>

                <Button
                  className="h-12 w-full bg-amber-500 font-black text-black hover:bg-amber-400"
                  onClick={() => {
                    setNotificacaoAberta(false);
                    setAberto(ocorrenciaNotificacao.id);
                  }}
                >
                  VER DETALHES DA OCORRÊNCIA
                </Button>

                {notificationPermission === "default" && (
                  <Button variant="outline" className="w-full border-fuchsia-500/30" onClick={() => void ativarNotificacoes()}>
                    Ativar notificação do celular
                  </Button>
                )}
                {notificationPermission === "denied" && (
                  <p className="text-center text-[10px] text-zinc-500">Notificações do sistema estão bloqueadas no aparelho. O alerta interno continua ativo.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!chamadoAberto} onOpenChange={(open) => { if (!open) fecharDetalhes(); }}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto bg-[#07070d] text-white">
          {chamadoAberto && (() => {
            const action = proximaAcao(chamadoAberto.status);
            const ActionIcon = action?.icon || Wrench;
            const emExecucao = ["em_execucao", "em_atendimento"].includes(chamadoAberto.status);
            const podeObservacao = ["no_local", "em_execucao", "em_atendimento"].includes(chamadoAberto.status);
            const showAdicional = adicionalChamadoId === chamadoAberto.id;

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-left">
                    Ocorrência {chamadoAberto.numero ? `#${chamadoAberto.numero}` : ""}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-400/25 bg-amber-500/5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase tracking-wide text-amber-400">Detalhes da ocorrência</span>
                      <Badge variant="outline">{STATUS_LABELS[chamadoAberto.status] || chamadoAberto.status}</Badge>
                    </div>
                    {chamadoAberto.status === "pendente" && (
                      <p className="mt-2 text-xs text-zinc-400">Confira as informações abaixo antes de aceitar a responsabilidade pelo atendimento.</p>
                    )}
                  </div>

                  <div className="grid gap-3">
                    <div className="rounded-xl border border-fuchsia-500/15 bg-[#05050a] p-3">
                      <span className="flex items-center gap-1 text-[10px] uppercase text-zinc-500"><Building2 className="h-3 w-3" /> Cliente / local</span>
                      <p className="mt-1 font-bold">{chamadoAberto.cliente}</p>
                      <p className="text-sm text-zinc-400">{chamadoAberto.local_servico || "Local não informado"}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-fuchsia-500/15 bg-[#05050a] p-3">
                        <span className="text-[10px] uppercase text-zinc-500">Patrimônio</span>
                        <p className="mt-1 font-bold">{chamadoAberto.patrimonio_snapshot || "—"}</p>
                      </div>
                      <div className="rounded-xl border border-fuchsia-500/15 bg-[#05050a] p-3">
                        <span className="text-[10px] uppercase text-zinc-500">Placa</span>
                        <p className="mt-1 font-bold">{chamadoAberto.placa_snapshot || "—"}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-fuchsia-500/15 bg-[#05050a] p-3">
                      <span className="flex items-center gap-1 text-[10px] uppercase text-zinc-500"><Wrench className="h-3 w-3" /> Problema informado</span>
                      <p className="mt-1 font-bold">{chamadoAberto.tipo_servico || "—"}</p>
                      {chamadoAberto.itens_previstos && <p className="mt-2 text-sm text-zinc-300"><b>Orientação:</b> {chamadoAberto.itens_previstos}</p>}
                      {chamadoAberto.observacoes && <p className="mt-2 text-sm text-zinc-400"><b>Observação:</b> {chamadoAberto.observacoes}</p>}
                    </div>

                    <div className="rounded-xl border border-fuchsia-500/15 bg-[#05050a] p-3">
                      <span className="flex items-center gap-1 text-[10px] uppercase text-zinc-500"><UserRound className="h-3 w-3" /> Solicitante</span>
                      <p className="mt-1 font-bold">{chamadoAberto.solicitante_nome || "Não informado"}</p>
                      <p className="text-sm text-zinc-400">{chamadoAberto.solicitante_contato || "Sem contato informado"}</p>
                    </div>

                    <div className="rounded-xl border border-fuchsia-500/15 bg-[#05050a] p-3 text-xs text-zinc-400">
                      <p><b className="text-zinc-200">Registrado por:</b> {chamadoAberto.operador_abertura_nome || "registro anterior"}</p>
                      <p className="mt-1 flex items-center gap-1"><Clock3 className="h-3 w-3" /> {dt(chamadoAberto.created_at)}</p>
                    </div>
                  </div>

                  {podeObservacao && (
                    <Textarea
                      placeholder="Observação do atendimento (opcional)"
                      value={obs}
                      onChange={(e) => setObs(e.target.value)}
                      rows={2}
                      className="bg-[#05050a]"
                    />
                  )}

                  {emExecucao && (
                    <div className="space-y-3 rounded-xl border border-fuchsia-500/20 bg-[#05050a] p-3">
                      <div>
                        <p className="text-sm font-bold">Serviços realizados</p>
                        <p className="text-[11px] text-zinc-500">Selecione o que foi feito no compressor. Pode marcar mais de um.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {SERVICOS_PADRAO_COMPRESSOR.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => alternarServico(item)}
                            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${servicosExecutados.includes(item) ? "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200" : "border-zinc-700 text-zinc-300"}`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                      <Textarea
                        placeholder="Complemento / o que foi executado (opcional se já selecionou acima)"
                        value={conclusao}
                        onChange={(e) => setConclusao(e.target.value)}
                        rows={3}
                        className="bg-[#07070d]"
                      />
                    </div>
                  )}

                  {chamadoAberto.descricao_conclusao && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                      <b>Serviço concluído:</b> {chamadoAberto.descricao_conclusao}
                    </div>
                  )}

                  {action && (
                    <Button className="h-12 w-full font-black" onClick={() => void acao(chamadoAberto, action.acao)} disabled={acting}>
                      {acting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ActionIcon className="mr-2 h-4 w-4" />}
                      {action.label}
                    </Button>
                  )}

                  {emExecucao && (
                    <Button
                      variant="outline"
                      className="w-full border-amber-400/40 text-amber-300"
                      onClick={() => setAdicionalChamadoId(showAdicional ? null : chamadoAberto.id)}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Serviço adicional não previsto
                    </Button>
                  )}

                  {showAdicional && (
                    <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
                      <div>
                        <p className="font-bold">Serviço adicional</p>
                        <p className="text-xs text-zinc-500">Use somente para algo encontrado durante o atendimento que não estava previsto na ocorrência.</p>
                      </div>
                      <Textarea placeholder="O que foi encontrado? *" value={adicionalProblema} onChange={(e) => setAdicionalProblema(e.target.value)} rows={2} className="bg-[#05050a]" />
                      <Textarea placeholder="O que foi executado? *" value={adicionalExecutado} onChange={(e) => setAdicionalExecutado(e.target.value)} rows={2} className="bg-[#05050a]" />
                      <Textarea placeholder="Observação adicional" value={adicionalObs} onChange={(e) => setAdicionalObs(e.target.value)} rows={2} className="bg-[#05050a]" />

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex items-center gap-1 text-xs font-bold"><Package className="h-3 w-3" /> Materiais utilizados</p>
                          <Button size="sm" variant="outline" onClick={novaLinhaMaterial}><Plus className="mr-1 h-3 w-3" /> Material</Button>
                        </div>
                        {materiais.map((m, index) => (
                          <div key={index} className="grid grid-cols-[1fr_72px_72px_36px] gap-2">
                            <Input placeholder="Material" value={m.descricao} onChange={(e) => atualizarMaterial(index, "descricao", e.target.value)} className="bg-[#05050a]" />
                            <Input placeholder="Qtd." value={m.quantidade} onChange={(e) => atualizarMaterial(index, "quantidade", e.target.value)} className="bg-[#05050a]" />
                            <Input placeholder="Un." value={m.unidade} onChange={(e) => atualizarMaterial(index, "unidade", e.target.value)} className="bg-[#05050a]" />
                            <Button size="icon" variant="ghost" onClick={() => removerMaterial(index)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
                          </div>
                        ))}
                      </div>

                      <Button className="w-full" onClick={() => void salvarAdicional(chamadoAberto)} disabled={acting}>
                        {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar adicional"}
                      </Button>
                    </div>
                  )}

                  <Button size="sm" variant="ghost" className="w-full" onClick={fecharDetalhes}>Fechar detalhes</Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
