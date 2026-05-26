import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Check,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  Lock,
  Plus,
  Search,
  Trash2,
  Unlock,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createExternalSession, saveExternalSession } from "@/lib/acessoExternoAuth";
import { useApp } from "@/hooks/useApp";
import { onlyDigits, upsertFuncionarioBase } from "@/lib/funcionariosBase";

type Funcionario = {
  id: string;
  nome: string;
  cpf: string;
  cargo: string;
  email: string;
  telefone: string;
  celular: string;
  company_id: string | null;
  empresa_nome: string;
  filial: string;
};

type Acesso = {
  id: string;
  nome: string;
  cpf: string;
  cpf_clean: string;
  pin: string;
  email: string | null;
  observacoes: string | null;
  empresa: string | null;
  filial: string | null;
  funcao: string | null;
  perfil_acesso: string;
  modulo: string;
  status: string;
  acesso_liberado: boolean;
  ultimo_acesso_em: string | null;
  updated_at?: string | null;
};

type GrupoUsuario = {
  cpf_clean: string;
  pin: string;
  nome: string;
  email_corporativo: string;
  telefone: string;
  ultima_validacao_email_em: string | null;
  empresa: string;
  filial: string;
  funcao: string;
  acessos: Acesso[];
  modulosAdmin: Acesso[];
  modulosMecanico: Acesso[];
};

const PERFIS = [
  { v: "filial", l: "Filial (inclui RH)", modulo: "filial" },
  { v: "financeiro", l: "Financeiro", modulo: "financeiro" },
  { v: "faturamento", l: "Faturamento", modulo: "faturamento" },
  { v: "almoxarifado", l: "Almoxarifado", modulo: "almoxarifado" },
  { v: "operacional", l: "Operacional", modulo: "operacional" },
  { v: "tecnico_campo", l: "Tecnico de Campo", modulo: "campo" },
  { v: "mecanico_externo", l: "Mecanico (App proprio)", modulo: "mecanico" },
];

const MODULO_COLOR: Record<string, string> = {
  filial: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  financeiro: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30",
  faturamento: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
  almoxarifado: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  operacional: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  campo: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  mecanico: "bg-red-500/10 text-red-700 border-red-500/30",
};

const parseObservacoes = (raw: unknown) => {
  const base = { telefone: "", ultima_validacao_email_em: null as string | null };
  if (!raw) return base;
  if (typeof raw === "object") {
    const value = raw as Record<string, unknown>;
    return {
      telefone: String(value.telefone || "").trim(),
      ultima_validacao_email_em:
        typeof value.ultima_validacao_email_em === "string" ? value.ultima_validacao_email_em : null,
    };
  }
  const text = String(raw).trim();
  if (!text) return base;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      telefone: String(parsed.telefone || "").trim(),
      ultima_validacao_email_em:
        typeof parsed.ultima_validacao_email_em === "string" ? parsed.ultima_validacao_email_em : null,
    };
  } catch {
    return base;
  }
};

export default function AcessosExternosPage() {
  const { employees, companies, refreshData } = useApp();
  const [lista, setLista] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [funcOpen, setFuncOpen] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    email_corporativo: "",
    telefone: "",
    empresa: "",
    filial: "",
    funcao: "",
    perfis_acesso: ["filial"] as string[],
  });

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("acessos_externos" as any)
      .select("*")
      .order("nome");
    if (error) toast.error("Erro ao carregar acessos");
    setLista((data as any) || []);
    setLoading(false);
  };

  const carregarFuncionarios = async () => {
    const { data } = await supabase
      .from("funcionarios")
      .select("id, nome, cpf, cargo, email, telefone, celular, company_id, empresas(nome,cidade)")
      .eq("status", "ativo")
      .order("nome");

    const base: Funcionario[] = (data || []).map((f: any) => ({
      id: f.id,
      nome: f.nome,
      cpf: f.cpf || "",
      cargo: f.cargo || "",
      email: f.email || "",
      telefone: f.telefone || "",
      celular: f.celular || "",
      company_id: f.company_id || null,
      empresa_nome: f.empresas?.nome || "",
      filial: f.empresas?.cidade || "",
    }));
    setFuncionarios(base);
  };

  useEffect(() => {
    carregar();
    carregarFuncionarios();
  }, []);

  const grupos: GrupoUsuario[] = useMemo(() => {
    const map = new Map<string, GrupoUsuario>();

    for (const a of lista) {
      const key = a.cpf_clean || `${a.pin}::${a.nome}`;
      if (!map.has(key)) {
        const obs = parseObservacoes(a.observacoes);
        map.set(key, {
          cpf_clean: a.cpf_clean || "",
          pin: a.pin,
          nome: a.nome || "",
          email_corporativo: String(a.email || "").trim().toLowerCase(),
          telefone: obs.telefone || "",
          ultima_validacao_email_em: obs.ultima_validacao_email_em || null,
          empresa: a.empresa || "",
          filial: a.filial || "",
          funcao: a.funcao || "",
          acessos: [],
          modulosAdmin: [],
          modulosMecanico: [],
        });
      }

      const g = map.get(key)!;
      g.acessos.push(a);
      if (a.modulo === "mecanico") g.modulosMecanico.push(a);
      else g.modulosAdmin.push(a);
    }

    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [lista]);

  const selecionarFuncionario = (f: Funcionario) => {
    setFuncionarioId(f.id);
    setForm((prev) => ({
      ...prev,
      nome: f.nome || prev.nome,
      cpf: f.cpf || prev.cpf,
      email_corporativo: f.email || prev.email_corporativo,
      telefone: f.telefone || f.celular || prev.telefone,
      empresa: f.empresa_nome || prev.empresa,
      filial: f.filial || prev.filial,
      funcao: f.cargo || prev.funcao,
    }));
    setFuncOpen(false);
  };

  const resetForm = () => {
    setForm({
      nome: "",
      cpf: "",
      email_corporativo: "",
      telefone: "",
      empresa: "",
      filial: "",
      funcao: "",
      perfis_acesso: ["filial"],
    });
    setFuncionarioId(null);
  };

  const togglePerfil = (v: string) => {
    setForm((prev) => {
      const has = prev.perfis_acesso.includes(v);
      return {
        ...prev,
        perfis_acesso: has
          ? prev.perfis_acesso.filter((x) => x !== v)
          : [...prev.perfis_acesso, v],
      };
    });
  };

  const criar = async () => {
    if (!form.nome || !form.cpf || !form.email_corporativo || !form.telefone) {
      toast.error("Nome, CPF, e-mail corporativo e telefone sao obrigatorios");
      return;
    }

    const cpfClean = onlyDigits(form.cpf);
    if (cpfClean.length !== 11) {
      toast.error("CPF invalido");
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email_corporativo.trim().toLowerCase())) {
      toast.error("E-mail corporativo invalido");
      return;
    }

    if (onlyDigits(form.telefone).length < 10) {
      toast.error("Telefone invalido");
      return;
    }

    if (form.perfis_acesso.length === 0) {
      toast.error("Selecione ao menos um perfil");
      return;
    }

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
      email: form.email_corporativo,
      telefone: form.telefone,
      setor: "operacional",
    });

    if (!funcionarioBase.ok) {
      toast.error(funcionarioBase.error);
      return;
    }

    const payload = form.perfis_acesso.map((pv) => {
      const perfil = PERFIS.find((p) => p.v === pv)!;
      const observacoes = JSON.stringify({
        telefone: form.telefone.trim(),
        ultima_validacao_email_em: null,
        atualizado_em: new Date().toISOString(),
      });
      return {
        nome: form.nome.trim(),
        cpf: form.cpf.trim(),
        cpf_clean: cpfClean,
        pin: cpfClean.slice(-4),
        email: form.email_corporativo.trim().toLowerCase(),
        observacoes,
        empresa: form.empresa.trim() || null,
        filial: form.filial.trim() || null,
        funcao: form.funcao.trim() || null,
        funcionario_id: funcionarioBase.employeeId,
        perfil_acesso: perfil.v,
        modulo: perfil.modulo,
        status: "ativo",
        acesso_liberado: true,
      };
    });

    const { error } = await supabase
      .from("acessos_externos" as any)
      .upsert(payload, { onConflict: "cpf_clean,modulo", ignoreDuplicates: false });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`${payload.length} acesso(s) configurado(s)`);
    setOpen(false);
    resetForm();
    await refreshData();
    await carregarFuncionarios();
    carregar();
  };

  const toggleStatusGrupo = async (g: GrupoUsuario) => {
    const algumAtivo = g.acessos.some((a) => a.status === "ativo");
    const novo = algumAtivo ? "bloqueado" : "ativo";
    const ids = g.acessos.map((a) => a.id);

    const { error } = await supabase
      .from("acessos_externos" as any)
      .update({ status: novo })
      .in("id", ids);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(novo === "ativo" ? "Liberado" : "Bloqueado");
    carregar();
  };

  const excluirGrupo = async (g: GrupoUsuario) => {
    if (!confirm(`Excluir TODOS os acessos de ${g.nome}?`)) return;
    const ids = g.acessos.map((a) => a.id);
    const { error } = await supabase.from("acessos_externos" as any).delete().in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Excluido");
    carregar();
  };

  const removerModulo = async (a: Acesso) => {
    if (!confirm(`Remover acesso ao modulo "${a.modulo}"?`)) return;
    const { error } = await supabase.from("acessos_externos" as any).delete().eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Modulo removido");
    carregar();
  };

  const copiarLinkModulos = () => {
    const url = `${window.location.origin}/modulos`;
    navigator.clipboard.writeText(url);
    toast.success(`Link copiado: ${url}`);
  };

  const testarPortal = (g: GrupoUsuario) => {
    if (g.modulosAdmin.length === 0) return;
    const portais = g.modulosAdmin.map((a) => ({
      acesso_id: a.id,
      modulo: a.modulo,
      perfil_acesso: a.perfil_acesso,
      empresa: a.empresa || "",
      filial: a.filial || "",
      funcao: a.funcao || "",
    }));

    saveExternalSession(
      createExternalSession({
        cpf_clean: g.cpf_clean,
        nome: g.nome,
        portais,
      }),
    );

    if (portais.length === 1) {
      const a = g.modulosAdmin[0];
      window.open(`/${a.modulo}-ext/${a.id}`, "_blank");
      return;
    }

    window.open("/portais", "_blank");
  };

  const testarMecanico = (g: GrupoUsuario) => {
    const m = g.modulosMecanico[0];
    if (!m) return;
    window.open(`/app-mecanico/${m.id}`, "_blank");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Acessos Externos</h1>
          <p className="text-muted-foreground text-sm">
            Cadastro completo por CPF com acesso unico em /modulos.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copiarLinkModulos}>
            <Copy className="w-4 h-4 mr-2" />
            Link Modulos
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo Acesso
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Acesso Externo</DialogTitle>
              </DialogHeader>

              <div className="grid gap-3 py-2">
                <div>
                  <Label>Buscar funcionario cadastrado</Label>
                  <Popover open={funcOpen} onOpenChange={setFuncOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                        <span className="flex items-center gap-2 truncate">
                          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                          {funcionarioId ? <span className="truncate">{form.nome}</span> : <span className="text-muted-foreground">Digite para buscar...</span>}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Nome, CPF, cargo ou empresa/filial..." />
                        <CommandList>
                          <CommandEmpty>Nenhum funcionario encontrado.</CommandEmpty>
                          <CommandGroup>
                            {funcionarios.map((f) => {
                              const haystack = [f.nome, f.cpf, f.cargo, f.empresa_nome, f.filial, f.email, f.telefone, f.celular].filter(Boolean).join(" | ");
                              return (
                                <CommandItem key={f.id} value={haystack} onSelect={() => selecionarFuncionario(f)}>
                                  <Check className={cn("mr-2 h-4 w-4", funcionarioId === f.id ? "opacity-100" : "opacity-0")} />
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">{f.nome}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {[f.cpf, f.cargo, f.empresa_nome].filter(Boolean).join(" · ")}
                                    </span>
                                    {f.filial ? (
                                      <span className="text-xs text-muted-foreground">{f.filial}</span>
                                    ) : null}
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>Nome completo *</Label>
                  <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>

                <div>
                  <Label>CPF * (PIN = 4 ultimos)</Label>
                  <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>E-mail corporativo *</Label>
                    <Input type="email" value={form.email_corporativo} onChange={(e) => setForm({ ...form, email_corporativo: e.target.value })} placeholder="nome@empresa.com.br" />
                  </div>
                  <div>
                    <Label>Telefone *</Label>
                    <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(11) 99999-9999" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Empresa</Label>
                    <Input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} />
                  </div>
                  <div>
                    <Label>Filial</Label>
                    <Input value={form.filial} onChange={(e) => setForm({ ...form, filial: e.target.value })} />
                  </div>
                </div>

                <div>
                  <Label>Funcao</Label>
                  <Input value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value })} />
                </div>

                <div>
                  <Label>Modulos liberados *</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 p-3 border rounded-md max-h-48 overflow-y-auto">
                    {PERFIS.map((p) => {
                      const checked = form.perfis_acesso.includes(p.v);
                      return (
                        <label key={p.v} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-2 py-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePerfil(p.v)}
                            className="h-4 w-4 rounded border-input"
                          />
                          <span>{p.l}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={criar}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios Externos ({grupos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : grupos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum acesso cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>PIN</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Empresa/Filial</TableHead>
                    <TableHead>Funcao</TableHead>
                    <TableHead>Modulos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grupos.map((g) => {
                    const algumAtivo = g.acessos.some((a) => a.status === "ativo" && a.acesso_liberado);
                    const temAdmin = g.modulosAdmin.length > 0;
                    const temMecanico = g.modulosMecanico.length > 0;
                    return (
                      <TableRow key={g.cpf_clean || g.nome}>
                        <TableCell className="font-medium">{g.nome}</TableCell>
                        <TableCell>
                          <code className="bg-muted px-2 py-0.5 rounded text-sm">{g.pin}</code>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{g.email_corporativo || "-"}</div>
                          <div className="text-muted-foreground">{g.telefone || "-"}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {[g.empresa, g.filial].filter(Boolean).join(" / ") || "-"}
                        </TableCell>
                        <TableCell className="text-sm">{g.funcao || "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {g.acessos.map((a) => (
                              <Badge
                                key={a.id}
                                variant="outline"
                                className={cn("text-xs cursor-pointer", MODULO_COLOR[a.modulo] || "")}
                                onClick={() => removerModulo(a)}
                                title="Clique para remover este modulo"
                              >
                                {a.modulo}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {algumAtivo ? (
                            <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="destructive">Bloqueado</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            <Button size="sm" variant="ghost" onClick={copiarLinkModulos} title="Copiar link">
                              <Copy className="w-4 h-4" />
                            </Button>
                            {temAdmin && (
                              <Button size="sm" variant="ghost" onClick={() => testarPortal(g)} title="Visualizar portal">
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            )}
                            {temMecanico && (
                              <Button size="sm" variant="ghost" onClick={() => testarMecanico(g)} title="Visualizar mecanico">
                                <Wrench className="w-4 h-4 text-red-600" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleStatusGrupo(g)}
                              title={algumAtivo ? "Bloquear" : "Liberar"}
                            >
                              {algumAtivo ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => excluirGrupo(g)} title="Excluir">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
