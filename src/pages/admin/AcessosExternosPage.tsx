import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Copy, Lock, Unlock, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
  { v: "mecanico_externo", l: "Mecânico Externo", modulo: "mecanico" },
  { v: "tecnico_campo", l: "Técnico de Campo", modulo: "campo" },
  { v: "operacional", l: "Operacional", modulo: "operacional" },
  { v: "financeiro", l: "Financeiro", modulo: "financeiro" },
  { v: "rh", l: "RH", modulo: "rh" },
  { v: "almoxarifado", l: "Almoxarifado", modulo: "almoxarifado" },
  { v: "filial", l: "Filial", modulo: "filial" },
];

export default function AcessosExternosPage() {
  const [lista, setLista] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: "", cpf: "", empresa: "", filial: "", funcao: "", perfil_acesso: "mecanico_externo",
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

  useEffect(() => { carregar(); }, []);

  const criar = async () => {
    if (!form.nome || !form.cpf) { toast.error("Nome e CPF obrigatórios"); return; }
    const cpfClean = form.cpf.replace(/\D/g, "");
    if (cpfClean.length < 4) { toast.error("CPF inválido"); return; }
    const perfil = PERFIS.find((p) => p.v === form.perfil_acesso)!;
    const { error } = await supabase.from("acessos_externos" as any).insert({
      nome: form.nome,
      cpf: form.cpf,
      cpf_clean: cpfClean,
      pin: cpfClean.slice(-4),
      empresa: form.empresa || null,
      filial: form.filial || null,
      funcao: form.funcao || null,
      perfil_acesso: form.perfil_acesso,
      modulo: perfil.modulo,
      status: "ativo",
      acesso_liberado: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Acesso criado");
    setOpen(false);
    setForm({ nome: "", cpf: "", empresa: "", filial: "", funcao: "", perfil_acesso: "mecanico_externo" });
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

  const testar = (a: Acesso) => {
    window.open(`/acesso-${a.modulo}`, "_blank");
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
              <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
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
                <Label>Perfil de Acesso *</Label>
                <Select value={form.perfil_acesso} onValueChange={(v) => setForm({ ...form, perfil_acesso: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERFIS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                  </SelectContent>
                </Select>
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
