import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useMecanicoApp } from "../MecanicoAppContext";
import {
  COMBUSTIVEL_LABEL,
  MANUTENCAO_OPCOES,
  STATUS_SOLICITACAO,
  VeiculoApp,
  brDateTime,
  statusClass,
  type SolicitacaoOperacional,
} from "@/lib/operacionalSolicitacoes";
import { Car, Droplet, Loader2, Paperclip, RefreshCw, Send, Wrench } from "lucide-react";
import { toast } from "sonner";

const uploadAnexos = async (acessoId: string, files: FileList | null, prefix: string) => {
  if (!files || files.length === 0) return [];
  const anexos: Array<{ nome: string; url: string; tipo: string }> = [];

  for (const file of Array.from(files)) {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${acessoId}/${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("operacional-anexos")
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("operacional-anexos").getPublicUrl(path);
    anexos.push({ nome: file.name, url: data.publicUrl, tipo: file.type || "arquivo" });
  }

  return anexos;
};

const formatVehicle = (v: VeiculoApp) =>
  [v.descricao, v.placa || v.patrimonio].filter(Boolean).join(" - ") || "Veiculo sem identificacao";

export default function VeiculoPage() {
  const { mecanico } = useMecanicoApp();
  const [tab, setTab] = useState<"manutencao" | "galao" | "historico">("manutencao");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [veiculos, setVeiculos] = useState<VeiculoApp[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoOperacional[]>([]);
  const [manutFiles, setManutFiles] = useState<FileList | null>(null);
  const [galaoFiles, setGalaoFiles] = useState<FileList | null>(null);

  const [manutForm, setManutForm] = useState({
    ativo_id: "",
    placa: "",
    km: "",
    tipo: "troca de oleo",
    descricao: "",
    urgencia: "normal",
  });

  const [galaoForm, setGalaoForm] = useState({
    combustivel: "diesel_s10",
    quantidade: "",
    finalidade: "",
  });

  const veiculoSelecionado = useMemo(
    () => veiculos.find((v) => v.id === manutForm.ativo_id) || null,
    [veiculos, manutForm.ativo_id],
  );

  const carregar = async () => {
    setLoading(true);
    const [veicRes, solRes] = await Promise.all([
      supabase.rpc("app_mecanico_listar_veiculos" as any, { p_acesso_id: mecanico.acesso_id }),
      supabase.rpc("app_mecanico_listar_solicitacoes" as any, { p_acesso_id: mecanico.acesso_id }),
    ]);

    if (veicRes.error || !(veicRes.data as any)?.ok) {
      toast.error((veicRes.data as any)?.error || veicRes.error?.message || "Nao foi possivel carregar veiculos.");
    } else {
      setVeiculos(((veicRes.data as any).veiculos || []) as VeiculoApp[]);
    }

    if (solRes.error || !(solRes.data as any)?.ok) {
      toast.error((solRes.data as any)?.error || solRes.error?.message || "Nao foi possivel carregar solicitacoes.");
    } else {
      setSolicitacoes(((solRes.data as any).solicitacoes || []) as SolicitacaoOperacional[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mecanico.acesso_id]);

  const solicitarManutencao = async () => {
    const tipo = manutForm.tipo;
    const descricao = manutForm.descricao.trim();
    if (!manutForm.ativo_id && !manutForm.placa.trim()) {
      toast.error("Selecione o veiculo ou informe a placa.");
      return;
    }
    if (!manutForm.km.trim()) {
      toast.error("Informe o KM atual.");
      return;
    }
    if (tipo === "outro" && !descricao) {
      toast.error("Quando escolher Outro, descreva a manutencao.");
      return;
    }

    setSalvando(true);
    try {
      const anexos = await uploadAnexos(mecanico.acesso_id, manutFiles, "manutencao");
      const placa = manutForm.placa.trim() || veiculoSelecionado?.placa || "";
      const { data, error } = await supabase.rpc("app_mecanico_criar_solicitacao_manutencao" as any, {
        p_acesso_id: mecanico.acesso_id,
        p_ativo_id: manutForm.ativo_id || null,
        p_placa: placa,
        p_km: Number(String(manutForm.km).replace(/\D/g, "")) || null,
        p_manutencao_tipo: tipo,
        p_descricao: descricao,
        p_urgencia: manutForm.urgencia,
        p_anexos: anexos,
      });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.error || error?.message || "Erro ao salvar");
      toast.success("Solicitacao de manutencao enviada para aprovacao.");
      setManutForm({ ativo_id: "", placa: "", km: "", tipo: "troca de oleo", descricao: "", urgencia: "normal" });
      setManutFiles(null);
      setTab("historico");
      await carregar();
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel enviar a solicitacao.");
    } finally {
      setSalvando(false);
    }
  };

  const solicitarGalao = async () => {
    const quantidade = Number(String(galaoForm.quantidade).replace(",", "."));
    if (!quantidade || quantidade <= 0) {
      toast.error("Informe a quantidade de litros.");
      return;
    }
    if (!galaoForm.finalidade.trim()) {
      toast.error("Informe a finalidade/observacao.");
      return;
    }

    setSalvando(true);
    try {
      const anexos = await uploadAnexos(mecanico.acesso_id, galaoFiles, "galao");
      const { data, error } = await supabase.rpc("app_mecanico_criar_solicitacao_galao" as any, {
        p_acesso_id: mecanico.acesso_id,
        p_combustivel_tipo: galaoForm.combustivel,
        p_quantidade: quantidade,
        p_finalidade: galaoForm.finalidade,
        p_anexos: anexos,
      });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.error || error?.message || "Erro ao salvar");
      toast.success("Solicitacao de galao enviada para aprovacao.");
      setGalaoForm({ combustivel: "diesel_s10", quantidade: "", finalidade: "" });
      setGalaoFiles(null);
      setTab("historico");
      await carregar();
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel enviar a solicitacao.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-1">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Car className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Solicitacoes operacionais</h1>
            <p className="text-xs text-muted-foreground">Manutencao, galao e retorno da aprovacao.</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        {[
          ["manutencao", "Manutencao"],
          ["galao", "Galao"],
          ["historico", "Historico"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value as any)}
            className={`rounded-xl border px-2 py-2 text-xs font-semibold ${tab === value ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="p-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin" />
        </Card>
      ) : null}

      {tab === "manutencao" && !loading ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <Wrench className="w-5 h-5 text-primary" /> Solicitar manutencao de veiculo
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Veiculo</label>
            <select
              value={manutForm.ativo_id}
              onChange={(e) => {
                const v = veiculos.find((item) => item.id === e.target.value);
                setManutForm((prev) => ({ ...prev, ativo_id: e.target.value, placa: v?.placa || prev.placa }));
              }}
              className="w-full h-11 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="">Selecionar veiculo</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>{formatVehicle(v)}</option>
              ))}
            </select>
          </div>
          {veiculoSelecionado?.arquivo_url ? (
            <a className="text-xs text-primary underline" href={veiculoSelecionado.arquivo_url} target="_blank" rel="noreferrer">
              Visualizar documento do veiculo
            </a>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Placa</label>
              <Input value={manutForm.placa} onChange={(e) => setManutForm((p) => ({ ...p, placa: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">KM atual</label>
              <Input inputMode="numeric" value={manutForm.km} onChange={(e) => setManutForm((p) => ({ ...p, km: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tipo de manutencao</label>
            <select
              value={manutForm.tipo}
              onChange={(e) => setManutForm((p) => ({ ...p, tipo: e.target.value }))}
              className="w-full h-11 rounded-lg border bg-background px-3 text-sm"
            >
              {MANUTENCAO_OPCOES.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Urgencia</label>
            <select
              value={manutForm.urgencia}
              onChange={(e) => setManutForm((p) => ({ ...p, urgencia: e.target.value }))}
              className="w-full h-11 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="critica">Critica</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Descricao</label>
            <textarea
              value={manutForm.descricao}
              onChange={(e) => setManutForm((p) => ({ ...p, descricao: e.target.value }))}
              className="w-full min-h-[90px] rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="Descreva o problema, barulho, vazamento ou detalhe da revisao."
            />
          </div>
          <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <Paperclip className="w-4 h-4" />
            <span className="flex-1 truncate">{manutFiles?.length ? `${manutFiles.length} anexo(s)` : "Fotos/PDF opcional"}</span>
            <input className="hidden" type="file" multiple accept="image/*,.pdf" onChange={(e) => setManutFiles(e.target.files)} />
          </label>
          <Button onClick={solicitarManutencao} disabled={salvando} className="w-full">
            {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar para aprovacao
          </Button>
        </Card>
      ) : null}

      {tab === "galao" && !loading ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <Droplet className="w-5 h-5 text-primary" /> Solicitar combustivel por galao
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tipo de combustivel</label>
            <select
              value={galaoForm.combustivel}
              onChange={(e) => setGalaoForm((p) => ({ ...p, combustivel: e.target.value }))}
              className="w-full h-11 rounded-lg border bg-background px-3 text-sm"
            >
              {Object.entries(COMBUSTIVEL_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Quantidade em litros</label>
            <Input inputMode="decimal" value={galaoForm.quantidade} onChange={(e) => setGalaoForm((p) => ({ ...p, quantidade: e.target.value }))} placeholder="Ex.: 20" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Finalidade / observacao</label>
            <textarea
              value={galaoForm.finalidade}
              onChange={(e) => setGalaoForm((p) => ({ ...p, finalidade: e.target.value }))}
              className="w-full min-h-[90px] rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="Informe onde sera usado e qualquer detalhe necessario."
            />
          </div>
          <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <Paperclip className="w-4 h-4" />
            <span className="flex-1 truncate">{galaoFiles?.length ? `${galaoFiles.length} anexo(s)` : "Foto/PDF opcional"}</span>
            <input className="hidden" type="file" multiple accept="image/*,.pdf" onChange={(e) => setGalaoFiles(e.target.files)} />
          </label>
          <Button onClick={solicitarGalao} disabled={salvando} className="w-full">
            {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar para aprovacao
          </Button>
        </Card>
      ) : null}

      {tab === "historico" && !loading ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Minhas solicitacoes</div>
            <Button size="sm" variant="outline" onClick={carregar}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          {solicitacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma solicitacao enviada.</p>
          ) : (
            <div className="space-y-2">
              {solicitacoes.map((s) => (
                <div key={s.id} className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm">{s.tipo === "galao" ? "Galao de combustivel" : "Manutencao de veiculo"}</div>
                      <div className="text-[11px] text-muted-foreground">{brDateTime(s.created_at)}</div>
                    </div>
                    <Badge variant="outline" className={statusClass(s.status)}>{STATUS_SOLICITACAO[s.status] || s.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.tipo === "galao"
                      ? `${COMBUSTIVEL_LABEL[s.combustivel_tipo || ""] || s.combustivel_tipo || "-"} - ${Number(s.quantidade || 0).toLocaleString("pt-BR")} L`
                      : `${s.placa || "-"} - ${s.manutencao_tipo || "-"} - KM ${s.km || "-"}`}
                  </div>
                  {s.status === "agendado" || s.status === "autorizado" ? (
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-xs">
                      {s.data_agendada ? <div>Agendado: {s.data_agendada} {s.hora_agendada || ""}</div> : null}
                      {s.oficina ? <div>Local: {s.oficina}</div> : null}
                      {s.observacao_admin ? <div>Obs.: {s.observacao_admin}</div> : null}
                    </div>
                  ) : null}
                  {s.anexos?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {s.anexos.map((a, idx) => (
                        <a key={`${s.id}-${idx}`} href={a.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                          {a.nome || "Anexo"}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
