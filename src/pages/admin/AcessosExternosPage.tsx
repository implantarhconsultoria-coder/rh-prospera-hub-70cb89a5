import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Copy, Lock, Unlock, ExternalLink, Trash2, Search, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Funcionario = {
  id: string;
  nome: string;
  cpf: string;
  cargo: string;
  empresa_nome: string;
};

type Acesso = {
  id: string;
  nome: string;
  cpf: string;
  pin: string;
  empresa: string | null;
  filial: string | null;
  funcao: string | null;
  perfil_acesso: string;
  modulo: string;
  status: string;
  acesso_liberado: boolean;
  ultimo_acesso_em: string | null;
};

const PERFIS = [
  { v: "filial", l: "Filial (inclui RH)", modulo: "filial" },
  { v: "financeiro", l: "Financeiro", modulo: "financeiro" },
  { v: "faturamento", l: "Faturamento", modulo: "faturamento" },
  { v: "almoxarifado", l: "Almoxarifado", modulo: "almoxarifado" },
  { v: "operacional", l: "Operacional", modulo: "operacional" },
  { v: "tecnico_campo", l: "Técnico de Campo", modulo: "campo" },
  { v: "mecanico_externo", l: "Mecânico Externo", modulo: "mecanico" },
];

export default function AcessosExternosPage() {
  const [lista, setLista] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [funcOpen, setFuncOpen] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "", cpf: "", empresa: "", filial: "", funcao: "",
    perfis_acesso: ["mecanico_externo"] as string[],
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
      .select("id, nome, cpf, cargo, empresas(nome)")
      .eq("status", "ativo")
      .order("nome");
    const lista: Funcionario[] = (data || []).map((f: any) => ({
      id: f.id,
      nome: f.nome,
      cpf: f.cpf || "",
      cargo: f.cargo || "",
      empresa_nome: f.empresas?.nome || "",
    }));
    setFuncionarios(lista);
  };

  useEffect(() => { carregar(); carregarFuncionarios(); }, []);

  const selecionarFuncionario = (f: Funcionario) => {
    setFuncionarioId(f.id);
    setForm((prev) => ({
      ...prev,
      nome: f.nome,
      cpf: f.cpf || prev.cpf,
      empresa: f.empresa_nome || prev.empresa,
      funcao: f.cargo || prev.funcao,
    }));
    setFuncOpen(false);
  };

  const resetForm = () => {
    setForm({ nome: "", cpf: "", empresa: "", filial: "", funcao: "", perfis_acesso: ["mecanico_externo"] });
    setFuncionarioId(null);
  };

  const togglePerfil = (v: string) => {
    setForm((prev) => {
      const has = prev.perfis_acesso.includes(v);
      return { ...prev, perfis_acesso: has ? prev.perfis_acesso.filter((x) => x !== v) : [...prev.perfis_acesso, v] };
    });
  };

  const criar = async () => {
    if (!form.nome || !form.cpf) { toast.error("Nome e CPF obrigatórios"); return; }
    const cpfClean = form.cpf.replace(/\D/g, "");
    if (cpfClean.length < 4) { toast.error("CPF inválido"); return; }
    if (form.perfis_acesso.length === 0) { toast.error("Selecione ao menos um perfil"); return; }

    const linhas = form.perfis_acesso.map((pv) => {
      const perfil = PERFIS.find((p) => p.v === pv)!;
      return {
        nome: form.nome,
        cpf: form.cpf,
        cpf_clean: cpfClean,
        pin: cpfClean.slice(-4),
        empresa: form.empresa || null,
        filial: form.filial || null,
        funcao: form.funcao || null,
        perfil_acesso: perfil.v,
        modulo: perfil.modulo,
        status: "ativo",
        acesso_liberado: true,
      };
    });

    const { error } = await supabase.from("acessos_externos" as any).insert(linhas);
    if (error) { toast.error(error.message); return; }
    toast.success(`${linhas.length} acesso(s) criado(s)`);
    setOpen(false);
    resetForm();
    carregar();
  };

  const toggleStatus = async (a: Acesso) => {
    const novo = a.status === "ativo" ? "bloqueado" : "ativo";
    const { error } = await supabase.from("acessos_externos" as any)
      .update({ status: novo }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success(novo === "ativo" ? "Liberado" : "Bloqueado");
    carregar();
  };

  const toggleLiberado = async (a: Acesso) => {
    const { error } = await supabase.from("acessos_externos" as any)
      .update({ acesso_liberado: !a.acesso_liberado }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    carregar();
  };

  const excluir = async (a: Acesso) => {
    if (!confirm(`Excluir acesso de ${a.nome}?`)) return;
    const { error } = await supabase.from("acessos_externos" as any).delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído"); carregar();
  };

  const copiarLink = (a: Acesso) => {
    const url = `${window.location.origin}/acesso-${a.modulo}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado: " + url);
  };

  const testar = async (a: Acesso) => {
    // Para mecânico, busca o link único e abre /m/:token
    if (a.modulo === 'mecanico') {
      window.open(`/acesso-mecanico`, '_blank');
      return;
    }
    // Demais módulos: grava sessão deste acesso específico e abre o portal direto
    const sess = {
      id: a.id, nome: a.nome,
      empresa: a.empresa || '', filial: a.filial || '', funcao: a.funcao || '',
      perfil_acesso: a.perfil_acesso, modulo: a.modulo, ts: Date.now(),
    };
    // Abre rota com query para o ExternoLayout aceitar a sessão (validação no banco continua)
    const url = `/${a.modulo}-ext/${a.id}`;
    // Salva no localStorage da janela atual também não impacta — abrimos nova aba que validará no banco
    localStorage.setItem('acesso_externo', JSON.stringify(sess));
    window.open(url, '_blank');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Acessos Externos</h1>
          <p className="text-muted-foreground text-sm">Gerencie usuários que acessam módulos via PIN.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Novo Acesso</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Acesso Externo</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div>
                <Label>Buscar funcionário cadastrado</Label>
                <Popover open={funcOpen} onOpenChange={setFuncOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                        {funcionarioId ? (
                          <span className="truncate">{form.nome}</span>
                        ) : (
                          <span className="text-muted-foreground">Digite o nome para buscar...</span>
                        )}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command
                      filter={(value, search) => {
                        if (!search) return 1;
                        return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Nome, CPF ou cargo..." />
                      <CommandList>
                        <CommandEmpty>Nenhum funcionário encontrado.</CommandEmpty>
                        <CommandGroup>
                          {funcionarios.map((f) => {
                            const haystack = [f.nome, f.cpf, f.cargo, f.empresa_nome].filter(Boolean).join(" | ");
                            return (
                              <CommandItem key={f.id} value={haystack} onSelect={() => selecionarFuncionario(f)}>
                                <Check className={cn("mr-2 h-4 w-4", funcionarioId === f.id ? "opacity-100" : "opacity-0")} />
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">{f.nome}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {[f.cpf, f.cargo, f.empresa_nome].filter(Boolean).join(" · ")}
                                  </span>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground mt-1">
                  Selecione para preencher automaticamente, ou digite manualmente abaixo.
                </p>
              </div>
              <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => { setForm({ ...form, nome: e.target.value }); setFuncionarioId(null); }} /></div>
              <div>
                <Label>CPF * <span className="text-xs text-muted-foreground">(PIN = 4 últimos)</span></Label>
                <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
                {form.cpf.replace(/\D/g, "").length >= 4 && (
                  <p className="text-xs text-primary mt-1">PIN: {form.cpf.replace(/\D/g, "").slice(-4)}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Empresa</Label><Input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></div>
                <div><Label>Filial</Label><Input value={form.filial} onChange={(e) => setForm({ ...form, filial: e.target.value })} /></div>
              </div>
              <div><Label>Função</Label><Input value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value })} /></div>
              <div>
                <Label>Perfis de Acesso * <span className="text-xs text-muted-foreground">(marque um ou vários)</span></Label>
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
                {form.perfis_acesso.length > 0 && (
                  <p className="text-xs text-primary mt-1">
                    Será criado 1 acesso por perfil ({form.perfis_acesso.length} no total) — todos com o mesmo PIN.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={criar}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Usuários Externos ({lista.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum acesso cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>PIN</TableHead>
                    <TableHead>Empresa/Filial</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.nome}</TableCell>
                      <TableCell><code className="bg-muted px-2 py-0.5 rounded text-sm">{a.pin}</code></TableCell>
                      <TableCell className="text-sm">{[a.empresa, a.filial].filter(Boolean).join(" / ") || "-"}</TableCell>
                      <TableCell className="text-sm">{a.funcao || "-"}</TableCell>
                      <TableCell><Badge variant="outline">{a.modulo}</Badge></TableCell>
                      <TableCell>
                        {a.status === "ativo" && a.acesso_liberado ? (
                          <Badge className="bg-green-500/10 text-green-700 border-green-500/20">Ativo</Badge>
                        ) : (
                          <Badge variant="destructive">Bloqueado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => copiarLink(a)} title="Copiar link"><Copy className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => testar(a)} title="Testar"><ExternalLink className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleStatus(a)} title={a.status === "ativo" ? "Bloquear" : "Liberar"}>
                          {a.status === "ativo" ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => excluir(a)} title="Excluir"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
