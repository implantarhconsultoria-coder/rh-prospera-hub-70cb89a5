import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, ExternalLink, Lock, Unlock, Wrench } from "lucide-react";
import { toast } from "sonner";

interface Acesso {
  id: string; nome: string; pin: string;
  empresa: string | null; funcao: string | null;
  status: string; acesso_liberado: boolean; ultimo_acesso_em: string | null;
}

export default function AppMecanicoAdminPage() {
  const [lista, setLista] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("acessos_externos" as any)
      .select("id,nome,pin,empresa,funcao,status,acesso_liberado,ultimo_acesso_em")
      .eq("modulo", "mecanico")
      .eq("perfil_acesso", "mecanico_externo")
      .order("nome");
    setLista((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, []);

  const linkPin = `${window.location.origin}/acesso-mecanico`;
  const copiarPin = () => { navigator.clipboard.writeText(linkPin); toast.success("Link copiado: " + linkPin); };

  const visualizar = (a: Acesso) => window.open(`/app-mecanico/${a.id}`, "_blank");

  const toggle = async (a: Acesso) => {
    const novo = a.status === "ativo" ? "bloqueado" : "ativo";
    const { error } = await supabase.from("acessos_externos" as any)
      .update({ status: novo, acesso_liberado: novo === "ativo" }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success(novo === "ativo" ? "Liberado" : "Bloqueado");
    carregar();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Wrench className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">App Mecânico</h1>
            <p className="text-sm text-muted-foreground">
              Lista de mecânicos com acesso ao app via link + PIN.
            </p>
          </div>
        </div>
        <Button onClick={copiarPin} variant="outline">
          <Copy className="w-4 h-4 mr-2" /> Copiar link de acesso
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Mecânicos cadastrados ({lista.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum mecânico. Cadastre um acesso externo com perfil "Mecânico Externo" / módulo "mecanico".
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>PIN</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.nome}</TableCell>
                      <TableCell><code className="bg-muted px-2 py-0.5 rounded text-sm">{a.pin}</code></TableCell>
                      <TableCell className="text-sm">{a.empresa || "-"}</TableCell>
                      <TableCell className="text-sm">{a.funcao || "-"}</TableCell>
                      <TableCell>
                        {a.status === "ativo" && a.acesso_liberado
                          ? <Badge className="bg-green-500/10 text-green-700 border-green-500/20">Ativo</Badge>
                          : <Badge variant="destructive">Bloqueado</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.ultimo_acesso_em ? new Date(a.ultimo_acesso_em).toLocaleString("pt-BR") : "-"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => visualizar(a)} title="Visualizar App">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle(a)}
                          title={a.status === "ativo" ? "Bloquear" : "Liberar"}>
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
    </div>
  );
}
