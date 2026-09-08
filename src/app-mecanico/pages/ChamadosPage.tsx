import { useCallback, useEffect, useState } from "react";
import { useMecanicoApp } from "../MecanicoAppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, Plus, RotateCcw, Wrench } from "lucide-react";
import { toast } from "sonner";

interface RpcResult<T> { ok?: boolean; error?: string; chamados?: T[]; id?: string; }
const chamadosRpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

interface Chamado {
  id: string;
  cliente: string;
  local_servico: string;
  tipo_servico: string;
  itens_previstos?: string | null;
  status: string;
  observacoes?: string | null;
  created_at: string;
}

const ITENS_PREDEFINIDOS = ["Freios", "Pneus", "Óleo / filtros", "Luzes / elétrica", "Suspensão", "Motor", "Arrefecimento", "Outros"];

const normalizarChamados = (items: unknown): Chamado[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => item as Partial<Chamado>)
    .filter((item) => Boolean(item.id))
    .map((item) => ({
      id: String(item.id),
      cliente: String(item.cliente || "Sem cliente"),
      local_servico: String(item.local_servico || ""),
      tipo_servico: String(item.tipo_servico || "Serviço"),
      itens_previstos: item.itens_previstos || null,
      status: String(item.status || "pendente"),
      observacoes: item.observacoes || null,
      created_at: String(item.created_at || ""),
    }));
};

export default function ChamadosPage() {
  const { mecanico } = useMecanicoApp();
  const [lista, setLista] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [obs, setObs] = useState("");
  const [acting, setActing] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [tipoServico, setTipoServico] = useState("");
  const [itens, setItens] = useState<string[]>([]);
  const [novaObs, setNovaObs] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
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
      setErro("Não foi possível carregar as manutenções agora.");
      setLista([]);
    } finally {
      setLoading(false);
    }
  }, [mecanico.acesso_id]);

  useEffect(() => { void carregar(); }, [carregar]);

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

  const acao = async (chamadoId: string, acaoAtual: "iniciar" | "finalizar") => {
    if (acting) return;
    setActing(true);
    try {
      const { data, error } = await chamadosRpc.rpc("app_mecanico_atualizar_chamado", {
        p_acesso_id: mecanico.acesso_id,
        p_chamado_id: chamadoId,
        p_acao: acaoAtual,
        p_observacao: obs || null,
      });
      const result = data as RpcResult<Chamado> | null;
      if (error || !result?.ok) {
        toast.error(result?.error || error?.message || "Erro ao atualizar chamado");
        return;
      }
      toast.success(acaoAtual === "iniciar" ? "Atendimento iniciado" : "Chamado finalizado");
      setAberto(null);
      setObs("");
      await carregar();
    } catch (error) {
      console.error("Falha ao atualizar chamado do app mecânico:", error);
      toast.error("Não foi possível atualizar o chamado agora.");
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <Card className="border-fuchsia-500/20 bg-[#07070d] p-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-fuchsia-500/10 text-fuchsia-400"><Wrench className="h-6 w-6" /></span>
            <div><h1 className="font-bold">Manutenção</h1><p className="text-xs text-zinc-400">Abra e acompanhe solicitações</p></div>
          </div>
          <Button size="sm" onClick={() => setNovoAberto((value) => !value)}><Plus className="mr-1 h-4 w-4" /> Nova</Button>
        </div>
      </Card>

      {novoAberto && (
        <Card className="space-y-4 p-5">
          <div>
            <p className="font-semibold">Nova solicitação</p>
            <p className="text-xs text-muted-foreground">Selecione os itens e descreva o problema. Você também pode escrever livremente.</p>
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
            <Button onClick={() => void criarChamado()} disabled={acting}>{acting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Abrir solicitação"}</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : erro ? (
        <Card className="space-y-4 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <div><p className="font-medium">Manutenção indisponível no momento.</p><p className="mt-1 text-sm text-muted-foreground">{erro}</p></div>
          <Button variant="outline" onClick={() => void carregar()}><RotateCcw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
        </Card>
      ) : lista.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">Nenhuma solicitação de manutenção. Use <strong>Nova</strong> para abrir uma.</Card>
      ) : (
        <div className="space-y-3">
          {lista.map((c) => (
            <Card key={c.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.tipo_servico || "Serviço"}</p>
                  <p className="text-xs text-muted-foreground">{c.local_servico || c.cliente || "TOPAC"}</p>
                </div>
                <Badge variant={c.status === "concluido" ? "secondary" : c.status === "em_atendimento" ? "default" : "outline"}>{c.status}</Badge>
              </div>
              {c.itens_previstos && <p className="text-xs"><span className="text-muted-foreground">Itens:</span> {c.itens_previstos}</p>}
              {c.observacoes && <p className="text-sm text-muted-foreground">{c.observacoes}</p>}
              {aberto === c.id ? (
                <div className="space-y-2 pt-2">
                  <Textarea placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
                  <div className="flex gap-2">
                    {c.status !== "em_atendimento" && c.status !== "concluido" && <Button size="sm" onClick={() => void acao(c.id, "iniciar")} disabled={acting} className="flex-1">Iniciar</Button>}
                    {c.status !== "concluido" && <Button size="sm" onClick={() => void acao(c.id, "finalizar")} disabled={acting} className="flex-1">Finalizar</Button>}
                    <Button size="sm" variant="ghost" onClick={() => { setAberto(null); setObs(""); }}>Cancelar</Button>
                  </div>
                </div>
              ) : c.status !== "concluido" ? (
                <Button size="sm" variant="outline" className="w-full" onClick={() => setAberto(c.id)}>Atender</Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
