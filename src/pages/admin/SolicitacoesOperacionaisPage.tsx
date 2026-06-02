import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { printDocumentInPage } from "@/lib/printInPage";
import {
  COMBUSTIVEL_LABEL,
  STATUS_SOLICITACAO,
  buildSolicitacaoPdfHtml,
  brDate,
  brDateTime,
  statusClass,
  type SolicitacaoOperacional,
} from "@/lib/operacionalSolicitacoes";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Droplet,
  Loader2,
  Paperclip,
  Printer,
  RefreshCw,
  Send,
  Wrench,
  XCircle,
} from "lucide-react";

type ManutencaoHistorico = {
  id: string;
  solicitacao_id?: string | null;
  ativo_id: string | null;
  placa: string | null;
  data: string;
  km: number | null;
  descricao: string;
  fornecedor: string | null;
  valor: number | null;
  status?: string | null;
};

type EditState = {
  observacao_admin: string;
  data_agendada: string;
  hora_agendada: string;
  oficina: string;
  diretor_status: string;
  tipo_revisao: string;
  concessionaria: string;
  contato_whatsapp: string;
  preferencia_data: string;
  agendamento_status: string;
  mensagem_recebida: string;
};

const initialEdit = (s?: SolicitacaoOperacional): EditState => ({
  observacao_admin: s?.observacao_admin || "",
  data_agendada: s?.data_agendada || "",
  hora_agendada: s?.hora_agendada || "",
  oficina: s?.oficina || "",
  diretor_status: s?.diretor_status || "",
  tipo_revisao: "",
  concessionaria: "",
  contato_whatsapp: "",
  preferencia_data: "",
  agendamento_status: "solicitado",
  mensagem_recebida: "",
});

const currency = (value?: number | null) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function SolicitacoesOperacionaisPage() {
  const { session } = useApp();
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoOperacional[]>([]);
  const [manutencoes, setManutencoes] = useState<ManutencaoHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("pendente");
  const [busca, setBusca] = useState("");
  const [edits, setEdits] = useState<Record<string, EditState>>({});

  const carregar = async () => {
    setLoading(true);
    const [solRes, manutRes] = await Promise.all([
      supabase
        .from("operacional_solicitacoes" as any)
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("veiculo_manutencoes" as any)
        .select("id,solicitacao_id,ativo_id,placa,data,km,descricao,fornecedor,valor,status")
        .order("data", { ascending: false })
        .limit(500),
    ]);

    if (solRes.error) {
      toast.error(solRes.error.message || "Erro ao carregar solicitacoes.");
      setSolicitacoes([]);
    } else {
      const rows = ((solRes.data || []) as any[]) as SolicitacaoOperacional[];
      setSolicitacoes(rows);
      setEdits((prev) => {
        const next = { ...prev };
        rows.forEach((row) => {
          if (!next[row.id]) next[row.id] = initialEdit(row);
        });
        return next;
      });
    }

    if (!manutRes.error) setManutencoes(((manutRes.data || []) as any[]) as ManutencaoHistorico[]);
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const counts = useMemo(() => ({
    pendente: solicitacoes.filter((s) => s.status === "pendente").length,
    manutencao: solicitacoes.filter((s) => s.tipo === "manutencao_veiculo" && ["pendente", "aguardando_diretor"].includes(s.status)).length,
    galao: solicitacoes.filter((s) => s.tipo === "galao" && s.status === "pendente").length,
    diretor: solicitacoes.filter((s) => s.status === "aguardando_diretor").length,
    agendado: solicitacoes.filter((s) => s.status === "agendado").length,
  }), [solicitacoes]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return solicitacoes.filter((s) => {
      if (filtro !== "todos" && s.status !== filtro) return false;
      if (!q) return true;
      return `${s.solicitante_nome} ${s.empresa} ${s.filial || ""} ${s.placa || ""} ${s.veiculo_descricao || ""} ${s.manutencao_tipo || ""} ${s.combustivel_tipo || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [solicitacoes, filtro, busca]);

  const setEdit = (id: string, patch: Partial<EditState>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || initialEdit()), ...patch } }));
  };

  const adminName =
    session?.user?.user_metadata?.nome_completo ||
    session?.user?.user_metadata?.name ||
    session?.user?.email ||
    "Rodrigo/Admin";

  const updateSolicitacao = async (s: SolicitacaoOperacional, status: string, extra: Record<string, any> = {}) => {
    setSavingId(s.id);
    const edit = edits[s.id] || initialEdit(s);
    const payload = {
      status,
      observacao_admin: edit.observacao_admin || null,
      data_agendada: edit.data_agendada || null,
      hora_agendada: edit.hora_agendada || null,
      oficina: edit.oficina || null,
      diretor_status: edit.diretor_status || null,
      autorizado_por: session?.user?.id || null,
      autorizado_por_nome: adminName,
      autorizado_em: new Date().toISOString(),
      ...extra,
    };
    const { error } = await supabase
      .from("operacional_solicitacoes" as any)
      .update(payload)
      .eq("id", s.id);
    setSavingId(null);
    if (error) {
      toast.error(error.message || "Nao foi possivel atualizar.");
      return false;
    }
    toast.success("Solicitacao atualizada.");
    await carregar();
    return true;
  };

  const registrarGalao = async (s: SolicitacaoOperacional) => {
    const ok = await updateSolicitacao(s, "autorizado");
    if (!ok) return;

    const now = new Date();
    const { error } = await supabase.from("combustivel_galoes" as any).insert({
      solicitacao_id: s.id,
      motorista_nome: s.solicitante_nome,
      cargo: "",
      placa: s.placa || "",
      modelo: s.veiculo_descricao || "",
      tipo_combustivel: s.combustivel_tipo || "",
      quantidade_litros: Number(s.quantidade || 0),
      observacao: s.finalidade || "",
      data: now.toISOString().slice(0, 10),
      hora: now.toTimeString().slice(0, 8),
      competencia: now.toISOString().slice(0, 7),
      origem: "app",
      status: "autorizado",
      autorizado_por: session?.user?.id || null,
      autorizado_por_nome: adminName,
      autorizado_em: now.toISOString(),
    });
    if (error) toast.error(error.message || "Autorizado, mas falhou ao registrar no controle de galoes.");
    else toast.success("Galao autorizado e registrado no controle.");
  };

  const registrarManutencao = async (s: SolicitacaoOperacional, status = "autorizado") => {
    const ok = await updateSolicitacao(s, status);
    if (!ok) return;
    const edit = edits[s.id] || initialEdit(s);
    const existing = manutencoes.find((m) => (m as any).solicitacao_id === s.id);
    const payload = {
      solicitacao_id: s.id,
      ativo_id: s.ativo_id || null,
      veiculo_descricao: s.veiculo_descricao || "",
      placa: s.placa || "",
      data: edit.data_agendada || new Date().toISOString().slice(0, 10),
      km: s.km || null,
      descricao: [s.manutencao_tipo, s.descricao].filter(Boolean).join(" - "),
      fornecedor: edit.oficina || null,
      nota_numero: null,
      valor: 0,
      arquivo_url: s.anexos?.[0]?.url || null,
      arquivo_nome: s.anexos?.[0]?.nome || null,
      origem: "solicitacao_app",
      observacao: edit.observacao_admin || null,
      created_by: session?.user?.id || null,
      status,
      urgencia: s.urgencia || "",
      data_agendada: edit.data_agendada || null,
      oficina: edit.oficina || "",
      solicitante_nome: s.solicitante_nome || "",
      autorizado_por_nome: adminName,
    };
    const query = existing
      ? supabase.from("veiculo_manutencoes" as any).update(payload).eq("id", existing.id)
      : supabase.from("veiculo_manutencoes" as any).insert(payload);
    const { error } = await query;
    if (error) toast.error(error.message || "Atualizado, mas falhou ao registrar no historico do veiculo.");
    else toast.success("Manutencao registrada no historico do veiculo.");
  };

  const salvarAgendamento = async (s: SolicitacaoOperacional) => {
    const edit = edits[s.id] || initialEdit(s);
    if (!edit.concessionaria.trim()) {
      toast.error("Informe a concessionaria/oficina.");
      return;
    }
    setSavingId(s.id);
    const { error } = await supabase.from("veiculo_agendamentos_externos" as any).insert({
      solicitacao_id: s.id,
      ativo_id: s.ativo_id || null,
      veiculo_descricao: s.veiculo_descricao || "",
      placa: s.placa || "",
      empresa: s.empresa || "",
      km: s.km || null,
      tipo_revisao: edit.tipo_revisao || s.manutencao_tipo || "",
      concessionaria: edit.concessionaria,
      contato_whatsapp: edit.contato_whatsapp,
      preferencia_data: edit.preferencia_data,
      data_confirmada: edit.data_agendada || null,
      hora_confirmada: edit.hora_agendada || null,
      status: edit.agendamento_status,
      mensagem_recebida: edit.mensagem_recebida,
      anexos: s.anexos || [],
      responsavel_interno: adminName,
      solicitante_nome: s.solicitante_nome || "",
    });
    setSavingId(null);
    if (error) {
      toast.error(error.message || "Nao foi possivel salvar o agendamento.");
      return;
    }
    await updateSolicitacao(s, edit.data_agendada ? "agendado" : "aguardando_diretor", {
      diretor_status: edit.agendamento_status === "confirmado" ? "aprovado_diretor" : edit.diretor_status,
    });
    toast.success("Agendamento externo registrado no historico.");
  };

  const imprimir = (s: SolicitacaoOperacional) => {
    printDocumentInPage(buildSolicitacaoPdfHtml({ ...s, ...(edits[s.id] || {}) } as SolicitacaoOperacional));
  };

  const historicoVeiculo = (s: SolicitacaoOperacional) =>
    manutencoes
      .filter((m) => (s.ativo_id && m.ativo_id === s.ativo_id) || (s.placa && m.placa === s.placa))
      .slice(0, 5);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Solicitacoes Operacionais</h1>
            <p className="text-primary-foreground/70 text-sm">Galoes, manutencao de veiculos e agendamento externo.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Pendentes", counts.pendente],
          ["Galoes", counts.galao],
          ["Manutencoes", counts.manutencao],
          ["Aguardando diretor", counts.diretor],
          ["Agendadas", counts.agendado],
        ].map(([label, value]) => (
          <div key={String(label)} className="card-premium p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="card-premium p-4 flex flex-wrap items-center gap-3">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-10 rounded-lg border bg-background px-3 text-sm">
          <option value="pendente">Pendentes</option>
          <option value="autorizado">Autorizadas</option>
          <option value="agendado">Agendadas</option>
          <option value="aguardando_diretor">Aguardando diretor</option>
          <option value="recusado">Recusadas</option>
          <option value="cancelado">Canceladas</option>
          <option value="todos">Todas</option>
        </select>
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por solicitante, placa, empresa..." className="flex-1 min-w-[220px]" />
        <Button variant="outline" onClick={carregar}>
          <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="card-premium p-8 flex justify-center">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
      ) : null}

      {!loading && filtradas.length === 0 ? (
        <div className="card-premium p-8 text-center text-sm text-muted-foreground">Nenhuma solicitacao encontrada.</div>
      ) : null}

      <div className="space-y-4">
        {filtradas.map((s) => {
          const edit = edits[s.id] || initialEdit(s);
          const historico = historicoVeiculo(s);
          return (
            <div key={s.id} className="card-premium p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                    {s.tipo === "galao" ? <Droplet className="w-5 h-5 text-primary" /> : <Wrench className="w-5 h-5 text-primary" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold">
                        {s.tipo === "galao" ? "Combustivel por galao" : "Manutencao de veiculo"}
                      </h2>
                      <Badge variant="outline" className={statusClass(s.status)}>{STATUS_SOLICITACAO[s.status] || s.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.solicitante_nome} - {s.empresa} {s.filial ? `/ ${s.filial}` : ""} - {brDateTime(s.created_at)}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => imprimir(s)}>
                  <Printer className="w-4 h-4 mr-1" /> PDF
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-xs text-muted-foreground block">Solicitante</span><strong>{s.solicitante_nome}</strong></div>
                <div><span className="text-xs text-muted-foreground block">Empresa</span>{s.empresa || "-"}</div>
                <div><span className="text-xs text-muted-foreground block">Placa</span>{s.placa || "-"}</div>
                <div><span className="text-xs text-muted-foreground block">KM</span>{s.km ? Number(s.km).toLocaleString("pt-BR") : "-"}</div>
                {s.tipo === "galao" ? (
                  <>
                    <div><span className="text-xs text-muted-foreground block">Combustivel</span>{COMBUSTIVEL_LABEL[s.combustivel_tipo || ""] || s.combustivel_tipo || "-"}</div>
                    <div><span className="text-xs text-muted-foreground block">Quantidade</span>{Number(s.quantidade || 0).toLocaleString("pt-BR")} L</div>
                    <div className="md:col-span-2"><span className="text-xs text-muted-foreground block">Finalidade</span>{s.finalidade || "-"}</div>
                  </>
                ) : (
                  <>
                    <div><span className="text-xs text-muted-foreground block">Veiculo</span>{s.veiculo_descricao || "-"}</div>
                    <div><span className="text-xs text-muted-foreground block">Patrimonio</span>{s.patrimonio || "-"}</div>
                    <div><span className="text-xs text-muted-foreground block">Tipo</span>{s.manutencao_tipo || "-"}</div>
                    <div><span className="text-xs text-muted-foreground block">Urgencia</span>{s.urgencia || "-"}</div>
                    <div className="md:col-span-4"><span className="text-xs text-muted-foreground block">Descricao</span>{s.descricao || "-"}</div>
                  </>
                )}
              </div>

              {s.anexos?.length ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  {s.anexos.map((a, idx) => (
                    <a key={`${s.id}-${idx}`} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                      <Paperclip className="w-3 h-3" /> {a.nome || "Anexo"}
                    </a>
                  ))}
                </div>
              ) : null}

              {s.tipo === "manutencao_veiculo" && (
                <div className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CalendarClock className="w-4 h-4" /> Historico anterior e agendamento externo
                  </div>
                  {historico.length ? (
                    <div className="grid gap-1 text-xs">
                      {historico.map((m) => (
                        <div key={m.id} className="flex justify-between gap-2 border-b last:border-0 py-1">
                          <span>{brDate(m.data)} - {m.descricao}</span>
                          <span className="text-muted-foreground">{m.km || "-"} km - {currency(m.valor)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem historico anterior localizado para este veiculo.</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-2">
                    <Input placeholder="Tipo revisao: 40 mil, preventiva..." value={edit.tipo_revisao} onChange={(e) => setEdit(s.id, { tipo_revisao: e.target.value })} />
                    <Input placeholder="Fiat / oficina / concessionaria" value={edit.concessionaria} onChange={(e) => setEdit(s.id, { concessionaria: e.target.value })} />
                    <Input placeholder="WhatsApp / contato" value={edit.contato_whatsapp} onChange={(e) => setEdit(s.id, { contato_whatsapp: e.target.value })} />
                    <select value={edit.agendamento_status} onChange={(e) => setEdit(s.id, { agendamento_status: e.target.value })} className="h-10 rounded-lg border bg-background px-3 text-sm">
                      <option value="solicitado">Solicitado</option>
                      <option value="aguardando_retorno">Aguardando retorno</option>
                      <option value="confirmado">Confirmado</option>
                      <option value="boleto_recebido">Boleto recebido</option>
                      <option value="pago">Pago</option>
                      <option value="concluido">Concluido</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                    <Input placeholder="Preferencia de data" value={edit.preferencia_data} onChange={(e) => setEdit(s.id, { preferencia_data: e.target.value })} />
                    <Input type="date" value={edit.data_agendada} onChange={(e) => setEdit(s.id, { data_agendada: e.target.value })} />
                    <Input type="time" value={edit.hora_agendada} onChange={(e) => setEdit(s.id, { hora_agendada: e.target.value })} />
                    <Input placeholder="Mensagem recebida / boleto / retorno" value={edit.mensagem_recebida} onChange={(e) => setEdit(s.id, { mensagem_recebida: e.target.value })} />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => salvarAgendamento(s)} disabled={savingId === s.id}>
                    {savingId === s.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                    Registrar agendamento externo
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input placeholder="Observacao do admin" value={edit.observacao_admin} onChange={(e) => setEdit(s.id, { observacao_admin: e.target.value })} className="md:col-span-2" />
                <Input type="date" value={edit.data_agendada} onChange={(e) => setEdit(s.id, { data_agendada: e.target.value })} />
                <Input placeholder="Oficina/local" value={edit.oficina} onChange={(e) => setEdit(s.id, { oficina: e.target.value })} />
              </div>

              <div className="flex flex-wrap gap-2">
                {s.tipo === "galao" ? (
                  <Button size="sm" onClick={() => registrarGalao(s)} disabled={savingId === s.id}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Autorizar galao
                  </Button>
                ) : (
                  <>
                    <Button size="sm" onClick={() => registrarManutencao(s, "autorizado")} disabled={savingId === s.id}>
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Autorizar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => registrarManutencao(s, "agendado")} disabled={savingId === s.id}>
                      <CalendarClock className="w-4 h-4 mr-1" /> Autorizar/agendar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateSolicitacao(s, "aguardando_diretor", { diretor_status: "aguardando_diretor" })} disabled={savingId === s.id}>
                      Aguardar diretor
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateSolicitacao(s, "aprovado_diretor", { diretor_status: "aprovado_diretor" })} disabled={savingId === s.id}>
                      Aprovado diretor
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => updateSolicitacao(s, "solicitando_info")} disabled={savingId === s.id}>
                  Pedir informacao
                </Button>
                <Button size="sm" variant="destructive" onClick={() => updateSolicitacao(s, "recusado")} disabled={savingId === s.id}>
                  <XCircle className="w-4 h-4 mr-1" /> Recusar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => updateSolicitacao(s, "cancelado")} disabled={savingId === s.id}>
                  Cancelar
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
