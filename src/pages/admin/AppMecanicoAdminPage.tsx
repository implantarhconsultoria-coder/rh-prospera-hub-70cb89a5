import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, ExternalLink, Lock, Unlock, Wrench, History, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Acesso {
  id: string; nome: string; pin: string;
  empresa: string | null; funcao: string | null;
  status: string; acesso_liberado: boolean; ultimo_acesso_em: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada", saida: "Saída",
  almoco_inicio: "Início Almoço", almoco_fim: "Retorno Almoço",
};

export default function AppMecanicoAdminPage() {
  const [lista, setLista] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [histAberto, setHistAberto] = useState<Acesso | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [hist, setHist] = useState<{ pontos: any[] }>({ pontos: [] });

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

  const abrirHistorico = async (a: Acesso) => {
    setHistAberto(a);
    setHistLoading(true);
    setHist({ pontos: [] });
    const { data } = await supabase.rpc("admin_app_mecanico_historico" as any, { p_acesso_id: a.id });
    const r = data as any;
    if (r?.ok) setHist({ pontos: r.pontos || [] });
    setHistLoading(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Wrench className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">App Mecânico</h1>
            <p className="text-sm text-muted-foreground">Lista de mecânicos com acesso ao app via link + PIN.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => window.location.href = '/admin/combustivel-qr'} variant="outline">
            <Wrench className="w-4 h-4 mr-2" /> Combustível QR
          </Button>
          <Button onClick={copiarPin} variant="outline">
            <Copy className="w-4 h-4 mr-2" /> Copiar link de acesso
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Mecânicos cadastrados ({lista.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum mecânico cadastrado.</p>
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
                        <Button size="sm" variant="ghost" onClick={() => abrirHistorico(a)} title="Ver histórico">
                          <History className="w-4 h-4" />
                        </Button>
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

      <Dialog open={!!histAberto} onOpenChange={(o) => !o && setHistAberto(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico — {histAberto?.nome}</DialogTitle></DialogHeader>
          {histLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <Tabs defaultValue="pontos">
              <TabsList>
                <TabsTrigger value="pontos">Pontos ({hist.pontos.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="pontos">
                {hist.pontos.length === 0 ? <p className="text-sm text-muted-foreground py-4">Sem registros.</p> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Data/Hora</TableHead><TableHead>Tipo</TableHead>
                      <TableHead>GPS</TableHead><TableHead>Selfie</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {hist.pontos.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{p.data} {p.hora?.slice(0,5)}</TableCell>
                          <TableCell><Badge variant="outline">{TIPO_LABEL[p.tipo] || p.tipo}</Badge></TableCell>
                          <TableCell className="text-xs">
                            {p.latitude ? (
                              <a className="text-primary inline-flex items-center gap-1" target="_blank" rel="noreferrer"
                                 href={`https://maps.google.com/?q=${p.latitude},${p.longitude}`}>
                                <MapPin className="w-3 h-3" /> {p.latitude.toFixed(4)}, {p.longitude?.toFixed(4)}
                              </a>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            {p.selfie_url ? <a href={p.selfie_url} target="_blank" rel="noreferrer"><img src={p.selfie_url} alt="selfie" className="w-12 h-12 object-cover rounded" /></a> : "-"}
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
