import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, ExternalLink, Lock, Unlock, Wrench, History, MapPin, Loader2, Plus, Fuel, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatarDataHoraBrasil } from "@/lib/brTime";
import EmployeeCombobox from "@/components/EmployeeCombobox";
import { useApp } from "@/hooks/useApp";
import type { Employee } from "@/types/database";
import { getFuncionarioVeiculoInfo, onlyDigits, upsertFuncionarioBase } from "@/lib/funcionariosBase";

interface Acesso {
  id: string;
  nome: string;
  pin: string;
  empresa: string | null;
  filial?: string | null;
  funcao: string | null;
  perfil_acesso?: string | null;
  status: string;
  acesso_liberado: boolean;
  ultimo_acesso_em: string | null;
  funcionario_id?: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  almoco_inicio: "Início Almoço",
  almoco_fim: "Retorno Almoço",
  almoco_saida: "Início Almoço",
  almoco_volta: "Retorno Almoço",
};

export default function AppMecanicoAdminPage() {
  const { employees, companies, refreshData } = useApp();
  const [lista, setLista] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [histAberto, setHistAberto] = useState<Acesso | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histDeleting, setHistDeleting] = useState<string | null>(null);
  const [hist, setHist] = useState<{ pontos: any[]; abastecimentos: any[] }>({ pontos: [], abastecimentos: [] });

  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [cadastroLoading, setCadastroLoading] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [veiculoVinculado, setVeiculoVinculado] = useState("");
  const [veiculoPlaca, setVeiculoPlaca] = useState("");
  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    email_corporativo: "",
    telefone: "",
    empresa: "",
    filial: "",
    funcao: "Mecanico",
    observacoes: "",
  });

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("acessos_externos" as any)
      .select("id,nome,pin,empresa,filial,funcao,perfil_acesso,status,acesso_liberado,ultimo_acesso_em,funcionario_id")
      .eq("modulo", "mecanico")
      .eq("perfil_acesso", "mecanico_externo")
      .order("nome");

    if (error) {
      toast.error(error.message || "Erro ao carregar mecanicos.");
      setLista([]);
    } else {
      setLista((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const linkPin = `${window.location.origin}/acesso-mecanico`;
  const copiarPin = async () => {
    await navigator.clipboard.writeText(linkPin);
    toast.success(`Link copiado: ${linkPin}`);
  };

  const visualizar = (a: Acesso) => window.open(`/app-mecanico/${a.id}`, "_blank");

  const toggle = async (a: Acesso) => {
    const novo = a.status === "ativo" ? "bloqueado" : "ativo";
    const { error } = await supabase
      .from("acessos_externos" as any)
      .update({ status: novo, acesso_liberado: novo === "ativo" } as any)
      .eq("id", a.id);
    if (error) {
      toast.error(error.message || "Nao foi possivel atualizar status.");
      return;
    }
    toast.success(novo === "ativo" ? "Acesso liberado." : "Acesso bloqueado.");
    carregar();
  };

  const abrirHistorico = async (a: Acesso) => {
    setHistAberto(a);
    setHistLoading(true);
    setHist({ pontos: [], abastecimentos: [] });
    const { data, error } = await supabase.rpc("admin_app_mecanico_historico" as any, { p_acesso_id: a.id });
    if (error) {
      toast.error(error.message || "Nao foi possivel carregar historico.");
    } else {
      const r = data as any;
      if (r?.ok) {
        setHist({ pontos: r.pontos || [], abastecimentos: r.abastecimentos || [] });
      }
    }
    setHistLoading(false);
  };

  const excluirPontoHistorico = async (ponto: any) => {
    if (!histAberto) return;
    const horario = formatarDataHoraBrasil(ponto.data, ponto.hora);
    if (!window.confirm(`Excluir esta batida de ponto?\n\n${histAberto.nome}\n${horario} - ${TIPO_LABEL[ponto.tipo] || ponto.tipo}`)) return;

    setHistDeleting(ponto.id);
    const { data, error } = await supabase.rpc("admin_app_mecanico_excluir_ponto" as any, {
      p_acesso_id: histAberto.id,
      p_ponto_id: ponto.id,
    });
    setHistDeleting(null);

    if (error || !(data as any)?.ok) {
      toast.error((data as any)?.error || error?.message || "Nao foi possivel excluir o ponto.");
      return;
    }

    setHist((prev) => ({ ...prev, pontos: prev.pontos.filter((item) => item.id !== ponto.id) }));
    toast.success("Ponto excluido.");
  };

  const excluirAbastecimentoHistorico = async (abastecimento: any) => {
    if (!histAberto) return;
    const horario = formatarDataHoraBrasil(abastecimento.data, abastecimento.hora);
    if (!window.confirm(`Excluir este abastecimento?\n\n${histAberto.nome}\n${horario}\n${abastecimento.placa || "-"}`)) return;

    setHistDeleting(abastecimento.id);
    const { data, error } = await supabase.rpc("admin_app_mecanico_excluir_abastecimento" as any, {
      p_acesso_id: histAberto.id,
      p_abastecimento_id: abastecimento.id,
    });
    setHistDeleting(null);

    if (error || !(data as any)?.ok) {
      toast.error((data as any)?.error || error?.message || "Nao foi possivel excluir o abastecimento.");
      return;
    }

    setHist((prev) => ({ ...prev, abastecimentos: prev.abastecimentos.filter((item) => item.id !== abastecimento.id) }));
    toast.success("Abastecimento excluido.");
  };

  const resetForm = () => {
    setFuncionarioId(null);
    setVeiculoVinculado("");
    setVeiculoPlaca("");
    setForm({
      nome: "",
      cpf: "",
      email_corporativo: "",
      telefone: "",
      empresa: "",
      filial: "",
      funcao: "Mecanico",
      observacoes: "",
    });
  };

  const aplicarFuncionario = async (employee: Employee | null) => {
    if (!employee) {
      setFuncionarioId(null);
      setVeiculoVinculado("");
      setVeiculoPlaca("");
      return;
    }

    const company = companies.find((c) => c.id === employee.companyId);
    setFuncionarioId(employee.id);
    setForm((prev) => ({
      ...prev,
      nome: employee.name || prev.nome,
      cpf: employee.cpf || prev.cpf,
      email_corporativo: employee.email || prev.email_corporativo,
      telefone: employee.telefone || employee.celular || prev.telefone,
      empresa: company?.name || prev.empresa,
      filial: company?.city || prev.filial,
      funcao: employee.cargo || prev.funcao || "Mecanico",
    }));

    const veiculo = await getFuncionarioVeiculoInfo(employee.id);
    setVeiculoVinculado(veiculo?.descricao || "");
    setVeiculoPlaca(veiculo?.placa || "");
  };

  const cadastrarMecanico = async () => {
    if (!form.nome.trim() || !form.cpf.trim()) {
      toast.error("Nome e CPF sao obrigatorios.");
      return;
    }

    const cpfClean = onlyDigits(form.cpf);
    if (cpfClean.length !== 11) {
      toast.error("CPF invalido.");
      return;
    }

    const email = form.email_corporativo.trim().toLowerCase();
    setCadastroLoading(true);

    const funcionarioSelecionado = funcionarioId
      ? employees.find((employee) => employee.id === funcionarioId)
      : null;

    const funcionarioBase = await upsertFuncionarioBase({
      funcionarioId,
      employees,
      companies,
      companyId: funcionarioSelecionado?.companyId || null,
      empresaNome: form.empresa,
      nome: form.nome,
      cpf: form.cpf,
      cargo: form.funcao,
      email,
      telefone: form.telefone,
      setor: "operacional",
    });

    if (!funcionarioBase.ok) {
      setCadastroLoading(false);
      toast.error(funcionarioBase.error);
      return;
    }

    const notas = [
      form.observacoes.trim(),
      veiculoPlaca ? `Carro vinculado: ${veiculoPlaca}` : null,
    ].filter(Boolean).join(" | ");

    const observacoes = JSON.stringify({
      telefone: form.telefone.trim() || null,
      atualizado_em: new Date().toISOString(),
      notas: notas || null,
    });

    const payload = {
      nome: form.nome.trim(),
      cpf: form.cpf.trim(),
      cpf_clean: cpfClean,
      pin: cpfClean.slice(-4),
      email: email || null,
      email_corporativo: email || null,
      telefone: form.telefone.trim() || null,
      observacoes,
      empresa: form.empresa.trim() || null,
      filial: form.filial.trim() || null,
      funcao: form.funcao.trim() || "Mecanico",
      funcionario_id: funcionarioBase.employeeId,
      perfil_acesso: "mecanico_externo",
      modulo: "mecanico",
      status: "ativo",
      acesso_liberado: true,
    };

    const { error } = await supabase
      .from("acessos_externos" as any)
      .upsert([payload] as any, { onConflict: "cpf_clean,modulo", ignoreDuplicates: false });

    setCadastroLoading(false);
    if (error) {
      toast.error(error.message || "Nao foi possivel salvar mecanico.");
      return;
    }

    toast.success(`Mecanico cadastrado. PIN: ${payload.pin}`);
    setCadastroAberto(false);
    resetForm();
    await refreshData();
    carregar();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Wrench className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">App Mecanico</h1>
            <p className="text-sm text-muted-foreground">Cadastro real de mecanicos com acesso por link + PIN.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCadastroAberto(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Cadastrar mecanico
          </Button>
          <Button onClick={copiarPin} variant="outline">
            <Copy className="w-4 h-4 mr-2" />
            Copiar link de acesso
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mecanicos cadastrados ({lista.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum mecanico cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>PIN</TableHead>
                    <TableHead>Empresa/Filial</TableHead>
                    <TableHead>Funcao</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ultimo acesso</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.nome}</TableCell>
                      <TableCell>
                        <code className="bg-muted px-2 py-0.5 rounded text-sm">{a.pin}</code>
                      </TableCell>
                      <TableCell className="text-sm">
                        {[a.empresa, a.filial].filter(Boolean).join(" / ") || "-"}
                      </TableCell>
                      <TableCell className="text-sm">{a.funcao || "-"}</TableCell>
                      <TableCell>
                        {a.status === "ativo" && a.acesso_liberado ? (
                          <Badge className="bg-green-500/10 text-green-700 border-green-500/20">Ativo</Badge>
                        ) : (
                          <Badge variant="destructive">Bloqueado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.ultimo_acesso_em ? new Date(a.ultimo_acesso_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "-"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => abrirHistorico(a)} title="Ver historico">
                          <History className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => visualizar(a)} title="Visualizar app">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggle(a)}
                          title={a.status === "ativo" ? "Bloquear" : "Liberar"}
                        >
                          {a.status === "ativo" ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={cadastroAberto} onOpenChange={setCadastroAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo mecanico</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="space-y-1.5">
              <Label>Buscar funcionario cadastrado</Label>
              <EmployeeCombobox
                value={funcionarioId || undefined}
                onChange={aplicarFuncionario}
                placeholder="Buscar por nome, CPF, funcao, empresa/filial..."
              />
              {veiculoVinculado ? (
                <p className="text-xs text-muted-foreground">Veiculo vinculado: {veiculoVinculado}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>CPF *</Label>
                <Input value={form.cpf} onChange={(e) => setForm((prev) => ({ ...prev, cpf: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm((prev) => ({ ...prev, telefone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>E-mail corporativo</Label>
              <Input
                type="email"
                value={form.email_corporativo}
                onChange={(e) => setForm((prev) => ({ ...prev, email_corporativo: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Empresa</Label>
                <Input
                  value={form.empresa}
                  onChange={(e) => setForm((prev) => ({ ...prev, empresa: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Filial</Label>
                <Input value={form.filial} onChange={(e) => setForm((prev) => ({ ...prev, filial: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Funcao</Label>
                <Input value={form.funcao} onChange={(e) => setForm((prev) => ({ ...prev, funcao: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observacoes</Label>
              <Input
                value={form.observacoes}
                onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
              />
            </div>
            <div className="text-xs text-muted-foreground">PIN automatico: 4 ultimos digitos do CPF.</div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCadastroAberto(false)} disabled={cadastroLoading}>
                Cancelar
              </Button>
              <Button onClick={cadastrarMecanico} disabled={cadastroLoading}>
                {cadastroLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!histAberto} onOpenChange={(open) => !open && setHistAberto(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historico - {histAberto?.nome}</DialogTitle>
          </DialogHeader>
          {histLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <Tabs defaultValue="pontos">
              <TabsList>
                <TabsTrigger value="pontos">Pontos ({hist.pontos.length})</TabsTrigger>
                <TabsTrigger value="abastecimentos">Abastecimentos ({hist.abastecimentos.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="pontos">
                {hist.pontos.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Sem registros.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>GPS</TableHead>
                        <TableHead>Selfie</TableHead>
                        <TableHead className="text-right">Acoes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hist.pontos.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">
                            {formatarDataHoraBrasil(p.data, p.hora)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{TIPO_LABEL[p.tipo] || p.tipo}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {p.latitude ? (
                              <a
                                className="text-primary inline-flex items-center gap-1"
                                target="_blank"
                                rel="noreferrer"
                                href={`https://maps.google.com/?q=${p.latitude},${p.longitude}`}
                              >
                                <MapPin className="w-3 h-3" />
                                {Number(p.latitude).toFixed(4)}, {Number(p.longitude || 0).toFixed(4)}
                              </a>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {p.selfie_url ? (
                              <a href={p.selfie_url} target="_blank" rel="noreferrer">
                                <img src={p.selfie_url} alt="selfie" className="w-12 h-12 object-cover rounded" />
                              </a>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => excluirPontoHistorico(p)}
                              disabled={histDeleting === p.id}
                              title="Excluir ponto"
                            >
                              {histDeleting === p.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4 text-destructive" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
              <TabsContent value="abastecimentos">
                {hist.abastecimentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Sem abastecimentos.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Posto</TableHead>
                        <TableHead>Placa</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Fotos</TableHead>
                        <TableHead className="text-right">Acoes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hist.abastecimentos.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-sm">
                            {formatarDataHoraBrasil(a.data, a.hora)}
                          </TableCell>
                          <TableCell className="text-sm">{a.posto_nome || "-"}</TableCell>
                          <TableCell className="text-xs">{a.placa || "-"}</TableCell>
                          <TableCell className="text-xs">
                            R$ {Number(a.valor || 0).toFixed(2)}
                            <span className="text-muted-foreground"> / {Number(a.litros || 0).toFixed(2)} L</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {a.foto_placa_url ? (
                                <a href={a.foto_placa_url} target="_blank" rel="noreferrer" title="Foto da placa">
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              ) : null}
                              {a.foto_bomba_url ? (
                                <a href={a.foto_bomba_url} target="_blank" rel="noreferrer" title="Foto da bomba">
                                  <Fuel className="w-4 h-4" />
                                </a>
                              ) : (
                                "-"
                              )}
                              {a.foto_painel_url ? (
                                <a href={a.foto_painel_url} target="_blank" rel="noreferrer" title="Foto do KM">
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => excluirAbastecimentoHistorico(a)}
                              disabled={histDeleting === a.id}
                              title="Excluir abastecimento"
                            >
                              {histDeleting === a.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4 text-destructive" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
