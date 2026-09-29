import { useCallback, useEffect, useMemo, useState } from "react";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, BellRing, CheckCircle2, Loader2, MapPin, Package,
  Plus, RotateCcw, Send, Trash2, Truck, Wrench,
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
  notificacao_pendente?: boolean;
  created_at: string;
}

type MaterialDraft = { descricao: string; quantidade: string; unidade: string };

const ITENS_PREDEFINIDOS = ["Freios", "Pneus", "Óleo / filtros", "Luzes / elétrica", "Suspensão", "Motor", "Arrefecimento", "Outros"];

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
      tipo_servico: String(item.tipo_servico || "Serviço"),
      itens_previstos: item.itens_previstos || null,
      status: String(item.status || "pendente"),
      observacoes: item.observacoes || null,
      solicitante_nome: item.solicitante_nome || null,
      solicitante_contato: item.solicitante_contato || null,
      operador_abertura_nome: item.operador_abertura_nome || null,
      descricao_conclusao: item.descricao_conclusao || null,
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
  const [acting, setActing] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [tipoServico, setTipoServico] = useState("");
  const [itens, setItens] = useState<string[]>([]);
  const [novaObs, setNovaObs] = useState("");

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
        const message = result?.error || error?.message || "Erro ao carregar chamados";
        console.error("Erro ao carregar chamados do app mecânico:", error || result);
        setErro(message);
        setLista([]);
      } else {
        setLista(normalizarChamados(result.chamados));
      }
    } catch (error) {
      console.error("Falha inesperada nos chamados do app mecânico:", error);
      setErro("Não foi possível carregar as ocorrências agora.");
      setLista([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [mecanico.acesso_id]);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(() => void carregar(true), 12000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const novos = useMemo(() => lista.filter((c) => c.status === "pendente" && c.notificacao_pendente), [lista]);

  const alternarItem = (item: string) => {
    setItens((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  };

  const criarChamado = async () => {
    if (acting) return;
    if (!tipoServico.trim() && itens.length === 0) {
      toast.error("Informe o problema ou selecione pelo menos um item.");
      return;
    }
    setActing(true);
    try {
      const { data, error } = await chamadosRpc.rpc("app_mecanico_criar_chamado", {
        p_acesso_id: mecanico.acesso_id,
        p_tipo_servico: tipoServico.trim() || "Solicitação de manutenção",
        p_itens_previstos: itens.join(", ") || null,
        p_observacoes: novaObs.trim() || null,
        p_local_servico: null,
      });
      const result = data as RpcResult<Chamado> | null;
      if (error || !result?.ok) {
        toast.error(result?.error || error?.message || "Erro ao abrir solicitação");
        return;
      }
      toast.success("Solicitação de manutenção aberta.");
      setNovoAberto(false);
      setTipoServico("");
      setItens([]);
      setNovaObs("");
      await carregar();
    } catch (error) {
      console.error("Falha ao criar chamado do app mecânico:", error);
      toast.error("Não foi possível abrir a solicitação agora.");
    } finally {
      setActing(false);
    }
  };

  const acao = async (chamado: Chamado, acaoAtual: "aceitar" | "deslocamento" | "chegada" | "iniciar" | "finalizar") => {
    if (acting) return;
    if (acaoAtual === "finalizar" && !conclusao.trim()) {
      toast.error("Descreva o que foi executado antes de finalizar.");
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
        p_descricao_conclusao: acaoAtual === "finalizar" ? conclusao.trim() : null,
      });
      const result = data as RpcResult<Chamado> | null;
      if (error || !result?.ok) {
        toast.error(result?.error === "sequencia_status_invalida"
          ? "A ocorrência mudou de etapa. Atualize e tente novamente."
          : result?.error || error?.message || "Erro ao atualizar chamado");
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
      setAberto(null);
      setObs("");
      setConclusao("");
      await carregar();
    } catch (error) {
      console.error("Falha ao atualizar chamado do app mecânico:", error);
      toast.error("Não foi possível atualizar o chamado agora.");
    } finally {
      setActing(false);
    }
  };

  const novaLinhaMaterial = () => setMateriais((current) => [...current, { descricao: "", quantidade: "1", unidade: "un" }]);
  const atualizarMaterial = (index: number, key: keyof MaterialDraft, value: string) => setMateriais((current) =>
    current.map((item, i) => i === index ? { ...item, [key]: value } : item)
  );
  const removerMaterial = (index: number) => setMateriais((current) => current.filter((_, i) => i !== index));

  const limparAdicional = () => {
    setAdicionalChamadoId(null);
    setAdicionalProblema("");
    setAdicionalExecutado("");
    setAdicionalObs("");
    setMateriais([]);
  };

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
      limparAdicional();
      await carregar(true);
    } catch (error) {
      console.error("Falha ao registrar adicional:", error);
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
      case "em_atendimento": return { label: "FINALIZAR SERVIÇO", acao: "finalizar" as const, icon: CheckCircle2 };
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
              <p className="font-black text-amber-100">Nova ocorrência recebido</p>
              <p className="mt-1 text-xs text-amber-200/80">Este aviso permanece até você aceitar a ocorrência.</p>
              <Button size="sm" className="mt-3 bg-amber-500 font-black text-black hover:bg-amber-400" onClick={() => setAberto(novos[0].id)}>
                Ver chamado
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="border-fuchsia-500/20 bg-[#07070d] p-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-fuchsia-500/10 text-fuchsia-400"><Wrench className="h-6 w-6" /></span>
            <div><h1 className="font-bold">Manutenção</h1><p className="text-xs text-zinc-400">Ocorrências, atendimento e serviços adicionais</p></div>
          </div>
          <Button size="sm" onClick={() => setNovoAberto((value) => !value)}><Plus className="mr-1 h-4 w-4" /> Nova</Button>
        </div>
      </Card>

      {novoAberto && (
        <Card className="space-y-4 p-5">
          <div>
            <p className="font-semibold">Nova solicitação própria</p>
            <p className="text-xs text-muted-foreground">Use quando você identificar uma necessidade de manutenção. Ocorrências enviadas pelo Operacional aparecem automaticamente abaixo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ITENS_PREDEFINIDOS.map((item) => (
              <button key={item} type="button" onClick={() => alternarItem(item)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${itens.includes(item) ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-700" : "border-border"}`}>{item}</button>
            ))}
          </div>
          <Input placeholder="Problema / serviço necessário" value={tipoServico} onChange={(event) => setTipoServico(event.target.value)} />
          <Textarea placeholder="Descrição livre, sintomas, ruídos, peças ou qualquer informação importante" value={novaObs} onChange={(event) => setNovaObs(event.target.value)} rows={4} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { setNovoAberto(false); setTipoServico(""); setItens([]); setNovaObs(""); }} disabled={acting}>Cancelar</Button>
            <Button onClick={() => void criarChamado()} disabled={acting}>{acting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Abrir ocorrência"}</Button>
          </div>
        </Card>
      )}

      {erro ? (
        <Card className="space-y-4 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <div><p className="font-medium">Manutenção indisponível no momento.</p><p className="mt-1 text-sm text-muted-foreground">{erro}</p></div>
          <Button variant="outline" onClick={() => void carregar()}><RotateCcw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
        </Card>
      ) : lista.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">Nenhuma ocorrência de manutenção.</Card>
      ) : (
        <div className="space-y-3">
          {lista.map((c) => {
            const action = proximaAcao(c.status);
            const ActionIcon = action?.icon || Wrench;
            const isOpen = aberto === c.id;
            const showAdicional = adicionalChamadoId === c.id;

            return (
              <Card key={c.id} className={`space-y-3 p-4 ${c.status === "pendente" && c.notificacao_pendente ? "border-amber-400/60 bg-amber-500/5" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.numero ? `#${c.numero} • ` : ""}{c.tipo_servico || "Serviço"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.cliente || "TOPAC"} • {c.local_servico || "Local não informado"}</p>
                  </div>
                  <Badge variant={c.status === "concluido" ? "secondary" : c.status === "em_execucao" ? "default" : "outline"}>{STATUS_LABELS[c.status] || c.status}</Badge>
                </div>

                {c.solicitante_nome && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                    <b>Solicitado por:</b> {c.solicitante_nome}{c.solicitante_contato ? ` • ${c.solicitante_contato}` : ""}
                  </div>
                )}

                {c.itens_previstos && <p className="text-xs"><span className="text-muted-foreground">Orientação:</span> {c.itens_previstos}</p>}
                {c.observacoes && <p className="text-sm text-muted-foreground">{c.observacoes}</p>}

                {isOpen && c.status !== "concluido" && c.status !== "cancelado" && (
                  <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                    {(c.status === "no_local" || c.status === "em_execucao" || c.status === "em_atendimento") && (
                      <Textarea placeholder="Observação do atendimento (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
                    )}

                    {(c.status === "em_execucao" || c.status === "em_atendimento") && (
                      <Textarea placeholder="O que foi executado neste serviço? *" value={conclusao} onChange={(e) => setConclusao(e.target.value)} rows={3} />
                    )}

                    {action && (
                      <Button className="h-12 w-full font-black" onClick={() => void acao(c, action.acao)} disabled={acting}>
                        {acting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ActionIcon className="mr-2 h-4 w-4" />}
                        {action.label}
                      </Button>
                    )}

                    {(c.status === "em_execucao" || c.status === "em_atendimento") && (
                      <Button variant="outline" className="w-full border-amber-400/40 text-amber-700" onClick={() => { setAdicionalChamadoId(showAdicional ? null : c.id); }}>
                        <Plus className="mr-2 h-4 w-4" /> Serviço adicional não previsto
                      </Button>
                    )}

                    <Button size="sm" variant="ghost" className="w-full" onClick={() => { setAberto(null); setObs(""); setConclusao(""); }}>Fechar detalhes</Button>
                  </div>
                )}

                {showAdicional && (
                  <div className="space-y-3 rounded-xl border border-amber-400/40 bg-amber-500/5 p-4">
                    <div>
                      <p className="font-black text-amber-700">Adicional encontrado no atendimento</p>
                      <p className="text-xs text-muted-foreground">Ao salvar, o Operacional recebe o alerta dentro desta mesma ocorrência.</p>
                    </div>
                    <Textarea placeholder="O que foi encontrado além do solicitado? *" value={adicionalProblema} onChange={(e) => setAdicionalProblema(e.target.value)} rows={2} />
                    <Textarea placeholder="O que você fez nesse serviço adicional? *" value={adicionalExecutado} onChange={(e) => setAdicionalExecutado(e.target.value)} rows={2} />
                    <Textarea placeholder="Observação adicional" value={adicionalObs} onChange={(e) => setAdicionalObs(e.target.value)} rows={2} />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-1 text-xs font-bold"><Package className="h-3.5 w-3.5" /> Materiais utilizados</p>
                        <Button size="sm" variant="outline" onClick={novaLinhaMaterial}><Plus className="mr-1 h-3.5 w-3.5" />Adicionar</Button>
                      </div>
                      {materiais.map((m, index) => (
                        <div key={index} className="grid grid-cols-[1fr_72px_64px_36px] gap-2">
                          <Input placeholder="Material / peça" value={m.descricao} onChange={(e) => atualizarMaterial(index, "descricao", e.target.value)} />
                          <Input inputMode="decimal" placeholder="Qtd." value={m.quantidade} onChange={(e) => atualizarMaterial(index, "quantidade", e.target.value)} />
                          <Input placeholder="un" value={m.unidade} onChange={(e) => atualizarMaterial(index, "unidade", e.target.value)} />
                          <Button size="icon" variant="ghost" onClick={() => removerMaterial(index)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                      {materiais.length === 0 && <p className="text-xs text-muted-foreground">Se não houve uso de peça/material, pode deixar vazio.</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={limparAdicional}>Cancelar</Button>
                      <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => void salvarAdicional(c)} disabled={acting}>
                        {acting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar adicional
                      </Button>
                    </div>
                  </div>
                )}

                {!isOpen && c.status !== "concluido" && c.status !== "cancelado" && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setAberto(c.id)}>
                    {c.status === "pendente" ? <BellRing className="mr-2 h-4 w-4" /> : <Wrench className="mr-2 h-4 w-4" />}
                    {c.status === "pendente" ? "Abrir ocorrência" : "Continuar atendimento"}
                  </Button>
                )}

                {c.status === "concluido" && c.descricao_conclusao && (
                  <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-3 text-sm">
                    <b>Serviço concluído:</b> {c.descricao_conclusao}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
