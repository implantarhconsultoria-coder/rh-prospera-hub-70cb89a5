import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Fuel, QrCode, Lock, Unlock, Plus, Printer, FileSpreadsheet, Pencil, Download, History, Loader2 } from "lucide-react";
import QRCode from "qrcode";

interface Posto {
  id: string; codigo: string; nome: string;
  cnpj: string | null; endereco: string | null; telefone: string | null;
  status: string;
}

const empty = { id: "", nome: "", cnpj: "", endereco: "", telefone: "" };

export default function CombustivelQRAdminPage() {
  const [postos, setPostos] = useState<Posto[]>([]);
  const [loading, setLoading] = useState(true);

  const [editAberto, setEditAberto] = useState(false);
  const [edit, setEdit] = useState<typeof empty>(empty);

  const [qrAberto, setQrAberto] = useState<Posto | null>(null);
  const [qrUrl, setQrUrl] = useState("");

  const [histAberto, setHistAberto] = useState<Posto | null>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // relatório
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7));
  const [empresaF, setEmpresaF] = useState("");
  const [relat, setRelat] = useState<any>(null);
  const [carRel, setCarRel] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from("postos_combustivel" as any)
      .select("id,codigo,nome,cnpj,endereco,telefone,status")
      .is("deleted_at", null).order("nome");
    setPostos((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, []);

  const novo = () => { setEdit(empty); setEditAberto(true); };
  const editar = (p: Posto) => {
    setEdit({ id: p.id, nome: p.nome, cnpj: p.cnpj || "", endereco: p.endereco || "", telefone: p.telefone || "" });
    setEditAberto(true);
  };
  const salvar = async () => {
    if (!edit.nome.trim()) { toast.error("Informe o nome do posto"); return; }
    const { data, error } = await supabase.rpc("admin_posto_combustivel_upsert" as any, {
      p_id: edit.id || null, p_nome: edit.nome,
      p_cnpj: edit.cnpj, p_endereco: edit.endereco, p_telefone: edit.telefone,
    });
    const r = data as any;
    if (error || !r?.ok) { toast.error(r?.error || error?.message || "Erro"); return; }
    toast.success(edit.id ? "Posto atualizado" : "Posto criado com QR Code único");
    setEditAberto(false); carregar();
  };

  const toggle = async (p: Posto) => {
    const bloquear = p.status === "ativo";
    const { data, error } = await supabase.rpc("admin_posto_combustivel_toggle" as any, {
      p_id: p.id, p_bloquear: bloquear,
    });
    const r = data as any;
    if (error || !r?.ok) { toast.error("Erro"); return; }
    toast.success(bloquear ? "QR bloqueado" : "QR liberado");
    carregar();
  };

  const verQr = async (p: Posto) => {
    setQrAberto(p);
    const url = await QRCode.toDataURL(p.codigo, { width: 480, margin: 2 });
    setQrUrl(url);
  };

  const baixarQr = () => {
    if (!qrUrl || !qrAberto) return;
    const a = document.createElement("a");
    a.href = qrUrl; a.download = `qr-${qrAberto.codigo}.png`; a.click();
  };

  const imprimirQr = () => {
    if (!qrAberto || !qrUrl) return;
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>QR ${qrAberto.codigo}</title></head>
      <body style="font-family:Arial;text-align:center;padding:32px">
        <h2 style="margin:0 0 4px">${qrAberto.nome}</h2>
        ${qrAberto.cnpj ? `<div style="font-size:12px;color:#444">CNPJ: ${qrAberto.cnpj}</div>` : ''}
        ${qrAberto.endereco ? `<div style="font-size:12px;color:#444">${qrAberto.endereco}</div>` : ''}
        ${qrAberto.telefone ? `<div style="font-size:12px;color:#444">Tel: ${qrAberto.telefone}</div>` : ''}
        <img src="${qrUrl}" style="margin:20px 0;width:340px;height:340px" />
        <div style="font-family:monospace">${qrAberto.codigo}</div>
        <div style="font-size:11px;color:#666;margin-top:8px">QR Code único e vitalício de abastecimento</div>
      </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  const verHistorico = async (p: Posto) => {
    setHistAberto(p); setHistLoading(true); setHist([]);
    const { data } = await supabase.rpc("admin_posto_combustivel_historico" as any, { p_posto_id: p.id });
    const r = data as any;
    if (r?.ok) setHist(r.abastecimentos || []);
    setHistLoading(false);
  };

  const gerarRelatorio = async () => {
    setCarRel(true);
    const { data, error } = await supabase.rpc("admin_combustivel_relatorio_mensal" as any, {
      p_competencia: comp, p_empresa: empresaF || null,
      p_filial: null, p_acesso_id: null, p_placa: null,
    });
    setCarRel(false);
    const r = data as any;
    if (error || !r?.ok) { toast.error("Erro ao gerar"); return; }
    setRelat(r);
  };

  const exportarCsv = () => {
    if (!relat?.linhas?.length) return;
    const head = ["Mecânico", "Empresa", "Filial", "Placa", "Qtd", "Litros", "Valor", "R$/L"];
    const rows = relat.linhas.map((l: any) => [
      l.mecanico_nome, l.empresa || "", l.filial || "", l.placa || "",
      l.qtd_abastecimentos, l.total_litros, l.total_valor, l.media_valor_litro,
    ]);
    const csv = [head, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `combustivel-${comp}.csv`; a.click();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Fuel className="w-7 h-7 text-amber-600" />
          <div>
            <h1 className="text-2xl font-bold">Combustível / QR Code do Posto</h1>
            <p className="text-sm text-muted-foreground">QR único e vitalício por posto. Qualquer mecânico logado pode usar.</p>
          </div>
        </div>
        <Button onClick={novo}><Plus className="w-4 h-4 mr-1" /> Novo posto</Button>
      </div>

      <Tabs defaultValue="postos">
        <TabsList>
          <TabsTrigger value="postos">Postos / QR</TabsTrigger>
          <TabsTrigger value="rel">Relatório Mensal</TabsTrigger>
        </TabsList>

        <TabsContent value="postos">
          <Card>
            <CardHeader><CardTitle>Postos cadastrados ({postos.length})</CardTitle></CardHeader>
            <CardContent>
              {loading ? "Carregando..." : postos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum posto cadastrado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posto</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {postos.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{p.nome}</div>
                          <code className="text-xs text-muted-foreground">{p.codigo}</code>
                        </TableCell>
                        <TableCell className="text-sm">{p.cnpj || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[260px]">{p.endereco || '-'}</TableCell>
                        <TableCell>
                          {p.status === 'ativo'
                            ? <Badge className="bg-green-500/10 text-green-700 border-green-500/20">Ativo</Badge>
                            : <Badge variant="destructive">Bloqueado</Badge>}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="ghost" onClick={() => verQr(p)} title="Ver / imprimir QR"><QrCode className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => verHistorico(p)} title="Histórico"><History className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => editar(p)} title="Editar"><Pencil className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => toggle(p)} title={p.status === 'ativo' ? 'Bloquear' : 'Liberar'}>
                            {p.status === 'ativo' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rel">
          <Card>
            <CardHeader><CardTitle>Relatório Mensal de Combustível</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Competência</Label>
                  <Input type="month" value={comp} onChange={e => setComp(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Empresa (opcional)</Label>
                  <Input value={empresaF} onChange={e => setEmpresaF(e.target.value)} placeholder="ex: TOPAC MATRIZ" />
                </div>
                <div className="flex items-end gap-2 md:col-span-2">
                  <Button onClick={gerarRelatorio} disabled={carRel}>{carRel && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Gerar</Button>
                  <Button variant="outline" onClick={exportarCsv} disabled={!relat?.linhas?.length}><FileSpreadsheet className="w-4 h-4 mr-1" /> CSV</Button>
                  <Button variant="outline" onClick={() => window.print()} disabled={!relat?.linhas?.length}><Printer className="w-4 h-4 mr-1" /> Imprimir</Button>
                </div>
              </div>

              {relat && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <Card className="p-3"><div className="text-xs text-muted-foreground">Abastecimentos</div><div className="text-xl font-bold">{relat.totais?.qtd || 0}</div></Card>
                    <Card className="p-3"><div className="text-xs text-muted-foreground">Litros</div><div className="text-xl font-bold">{Number(relat.totais?.litros || 0).toFixed(2)}</div></Card>
                    <Card className="p-3"><div className="text-xs text-muted-foreground">Valor</div><div className="text-xl font-bold">R$ {Number(relat.totais?.valor || 0).toFixed(2)}</div></Card>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mecânico</TableHead><TableHead>Empresa</TableHead><TableHead>Placa</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Litros</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">R$/L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relat.linhas.map((l: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell>{l.mecanico_nome}</TableCell>
                          <TableCell>{l.empresa || '-'}</TableCell>
                          <TableCell>{l.placa || '-'}</TableCell>
                          <TableCell className="text-right">{l.qtd_abastecimentos}</TableCell>
                          <TableCell className="text-right">{Number(l.total_litros).toFixed(2)}</TableCell>
                          <TableCell className="text-right">R$ {Number(l.total_valor).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{Number(l.media_valor_litro).toFixed(3)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Editor de posto */}
      <Dialog open={editAberto} onOpenChange={setEditAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{edit.id ? "Editar posto" : "Novo posto"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} /></div>
            <div><Label>CNPJ</Label><Input value={edit.cnpj} onChange={e => setEdit({ ...edit, cnpj: e.target.value })} /></div>
            <div><Label>Endereço</Label><Input value={edit.endereco} onChange={e => setEdit({ ...edit, endereco: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={edit.telefone} onChange={e => setEdit({ ...edit, telefone: e.target.value })} /></div>
            <Button onClick={salvar} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR */}
      <Dialog open={!!qrAberto} onOpenChange={o => !o && setQrAberto(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{qrAberto?.nome}</DialogTitle></DialogHeader>
          {qrUrl && <img src={qrUrl} alt="QR" className="w-full" />}
          <div className="text-center text-xs font-mono text-muted-foreground">{qrAberto?.codigo}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={imprimirQr}><Printer className="w-4 h-4 mr-2" /> Imprimir</Button>
            <Button variant="outline" onClick={baixarQr}><Download className="w-4 h-4 mr-2" /> Baixar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={!!histAberto} onOpenChange={o => !o && setHistAberto(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico — {histAberto?.nome}</DialogTitle></DialogHeader>
          {histLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
            : hist.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Nenhum abastecimento.</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Mecânico</TableHead><TableHead>Empresa</TableHead>
                  <TableHead>Placa</TableHead><TableHead>Litros</TableHead><TableHead>Valor</TableHead><TableHead>Fotos</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {hist.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">{h.data} {String(h.hora).slice(0, 5)}</TableCell>
                      <TableCell className="text-sm">{h.mecanico_nome}</TableCell>
                      <TableCell className="text-xs">{h.empresa || '-'}</TableCell>
                      <TableCell className="text-xs">{h.placa || '-'}</TableCell>
                      <TableCell className="text-xs">{Number(h.litros).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">R$ {Number(h.valor).toFixed(2)}</TableCell>
                      <TableCell className="space-x-1">
                        {h.foto_bomba_url && <a href={h.foto_bomba_url} target="_blank" rel="noreferrer"><img src={h.foto_bomba_url} className="inline-block w-10 h-10 object-cover rounded" /></a>}
                        {h.foto_painel_url && <a href={h.foto_painel_url} target="_blank" rel="noreferrer"><img src={h.foto_painel_url} className="inline-block w-10 h-10 object-cover rounded" /></a>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
