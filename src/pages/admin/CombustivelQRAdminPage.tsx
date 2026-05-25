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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Fuel, QrCode, Lock, Unlock, Plus, Printer, FileSpreadsheet, Pencil, Download, Loader2, Building2, BarChart3, Settings, Filter } from "lucide-react";
import QRCode from "qrcode";

interface Posto {
  id: string;
  codigo: string;
  nome: string;
  unidade?: string | null;
  tipo_qr?: string | null;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  observacao: string | null;
  status: string;
}

interface Abast {
  id: string;
  data: string;
  hora: string;
  empresa: string | null;
  filial: string | null;
  mecanico_nome: string;
  placa: string | null;
  posto_nome: string | null;
  posto_id: string | null;
  combustivel: string | null;
  valor: number;
  litros: number;
  valor_por_litro: number | null;
  km_atual: number | null;
  foto_bomba_url: string | null;
  foto_painel_url: string | null;
  status: string;
  observacao: string | null;
  qr_codigo: string | null;
}

const EMPRESAS_PADRAO = ["TOPAC MATRIZ", "TOPAC FILIAL PRAIA GRANDE", "TOPAC FILIAL GOIÂNIA", "LMT", "ALQUI OBRAS"];
const empty = { id: "", nome: "", cnpj: "", endereco: "", telefone: "", observacao: "" };

export default function CombustivelQRAdminPage() {
  const [postos, setPostos] = useState<Posto[]>([]);
  const [abastecimentos, setAbastecimentos] = useState<Abast[]>([]);
  const [loading, setLoading] = useState(true);
  const [editAberto, setEditAberto] = useState(false);
  const [edit, setEdit] = useState<typeof empty>(empty);
  const [qrAberto, setQrAberto] = useState<Posto | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [editAbast, setEditAbast] = useState<Abast | null>(null);
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7));
  const [fEmp, setFEmp] = useState("todas");
  const [fPosto, setFPosto] = useState("todos");
  const [fStatus, setFStatus] = useState("todos");
  const [fBusca, setFBusca] = useState("");

  const carregar = async () => {
    setLoading(true);
    const [pRes, aRes] = await Promise.all([
      supabase.from("postos_combustivel" as any).select("*").is("deleted_at", null).order("unidade").order("codigo"),
      supabase.from("abastecimentos" as any).select("*").order("data", { ascending: false }).order("hora", { ascending: false }).limit(2000),
    ]);
    setPostos(((pRes.data as any) || []) as Posto[]);
    setAbastecimentos(((aRes.data as any) || []) as Abast[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const qrTarget = (p: Posto) => `${window.location.origin}/acesso-mecanico?qr=${encodeURIComponent(p.codigo)}`;

  const novo = () => { setEdit(empty); setEditAberto(true); };
  const editar = (p: Posto) => {
    setEdit({ id: p.id, nome: p.nome, cnpj: p.cnpj || "", endereco: p.endereco || "", telefone: p.telefone || "", observacao: p.observacao || "" });
    setEditAberto(true);
  };

  const salvar = async () => {
    if (!edit.nome.trim()) { toast.error("Informe o nome do posto"); return; }
    const { data, error } = await supabase.rpc("admin_posto_combustivel_upsert" as any, {
      p_id: edit.id || null,
      p_nome: edit.nome,
      p_cnpj: edit.cnpj,
      p_endereco: edit.endereco,
      p_telefone: edit.telefone,
    });
    const r = data as any;
    if (error || !r?.ok) { toast.error(r?.error || error?.message || "Erro"); return; }
    if (edit.id) await supabase.from("postos_combustivel" as any).update({ observacao: edit.observacao }).eq("id", edit.id);
    toast.success(edit.id ? "Posto atualizado" : "Posto criado com QR unico");
    setEditAberto(false);
    carregar();
  };

  const toggle = async (p: Posto) => {
    const bloquear = p.status === "ativo";
    const { data, error } = await supabase.rpc("admin_posto_combustivel_toggle" as any, { p_id: p.id, p_bloquear: bloquear });
    const r = data as any;
    if (error || !r?.ok) { toast.error("Erro"); return; }
    toast.success(bloquear ? "QR bloqueado" : "QR liberado");
    carregar();
  };

  const verQr = async (p: Posto) => {
    setQrAberto(p);
    setQrUrl(await QRCode.toDataURL(qrTarget(p), { width: 480, margin: 2 }));
  };

  const baixarQr = () => {
    if (!qrUrl || !qrAberto) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `qr-${qrAberto.codigo}.png`;
    a.click();
  };

  const imprimirQr = () => {
    if (!qrAberto || !qrUrl) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(qrPrintHtml([{ p: qrAberto, url: qrUrl }], false));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const imprimirFolhaQrs = async () => {
    const ativos = postos.filter((p) => p.status === "ativo");
    if (!ativos.length) return;
    const itens = await Promise.all(ativos.map(async (p) => ({ p, url: await QRCode.toDataURL(qrTarget(p), { width: 360, margin: 1 }) })));
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(qrPrintHtml(itens, true));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const empresasUsadas = useMemo(() => {
    const s = new Set<string>(EMPRESAS_PADRAO);
    abastecimentos.forEach((a) => a.empresa && s.add(a.empresa));
    return Array.from(s).sort();
  }, [abastecimentos]);

  const filtrados = useMemo(() => abastecimentos.filter((a) => {
    if (comp && !(a.data || "").startsWith(comp)) return false;
    if (fEmp !== "todas" && (a.empresa || "") !== fEmp) return false;
    if (fPosto !== "todos" && a.posto_id !== fPosto) return false;
    if (fStatus !== "todos" && a.status !== fStatus) return false;
    if (fBusca) {
      const q = fBusca.toLowerCase();
      const hay = `${a.mecanico_nome} ${a.placa || ""} ${a.posto_nome || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [abastecimentos, comp, fEmp, fPosto, fStatus, fBusca]);

  const totais = useMemo(() => {
    const litros = filtrados.reduce((s, a) => s + Number(a.litros || 0), 0);
    const valor = filtrados.reduce((s, a) => s + Number(a.valor || 0), 0);
    return { qtd: filtrados.length, litros, valor, media: litros > 0 ? valor / litros : 0 };
  }, [filtrados]);

  const porEmpresa = useMemo(() => {
    const map = new Map<string, { qtd: number; litros: number; valor: number; mecanicos: Set<string>; veiculos: Set<string> }>();
    filtrados.forEach((a) => {
      const k = a.empresa || "(sem empresa)";
      if (!map.has(k)) map.set(k, { qtd: 0, litros: 0, valor: 0, mecanicos: new Set(), veiculos: new Set() });
      const o = map.get(k)!;
      o.qtd++;
      o.litros += Number(a.litros || 0);
      o.valor += Number(a.valor || 0);
      if (a.mecanico_nome) o.mecanicos.add(a.mecanico_nome);
      if (a.placa) o.veiculos.add(a.placa);
    });
    return Array.from(map.entries()).map(([empresa, v]) => ({ empresa, qtd: v.qtd, litros: v.litros, valor: v.valor, mecanicos: v.mecanicos.size, veiculos: v.veiculos.size })).sort((a, b) => b.valor - a.valor);
  }, [filtrados]);

  const relatorio = useMemo(() => {
    const map = new Map<string, any>();
    filtrados.forEach((a) => {
      const k = `${a.empresa || ""}|${a.mecanico_nome}|${a.placa || ""}`;
      if (!map.has(k)) map.set(k, { empresa: a.empresa || "-", mecanico: a.mecanico_nome, placa: a.placa || "-", qtd: 0, litros: 0, valor: 0, km_min: Infinity, km_max: -Infinity, postos: new Set<string>() });
      const o = map.get(k)!;
      o.qtd++;
      o.litros += Number(a.litros || 0);
      o.valor += Number(a.valor || 0);
      if (a.km_atual != null) { o.km_min = Math.min(o.km_min, Number(a.km_atual)); o.km_max = Math.max(o.km_max, Number(a.km_atual)); }
      if (a.posto_nome) o.postos.add(a.posto_nome);
    });
    return Array.from(map.values()).map((o) => {
      const km_rodado = (o.km_max > -Infinity && o.km_min < Infinity) ? Math.max(0, o.km_max - o.km_min) : 0;
      return { ...o, km_inicial: o.km_min === Infinity ? null : o.km_min, km_final: o.km_max === -Infinity ? null : o.km_max, km_rodado, media_litro: o.litros > 0 ? o.valor / o.litros : 0, custo_km: km_rodado > 0 ? o.valor / km_rodado : 0, postos: Array.from(o.postos).join(", ") };
    }).sort((a, b) => b.valor - a.valor);
  }, [filtrados]);

  const exportarCsv = () => {
    if (!relatorio.length) return;
    const head = ["Empresa", "Mecanico", "Placa", "Qtd", "Litros", "Valor", "R$/L", "KM Inicial", "KM Final", "KM Rodado", "Custo/KM", "Postos"];
    const rows = relatorio.map((l) => [l.empresa, l.mecanico, l.placa, l.qtd, l.litros.toFixed(2), l.valor.toFixed(2), l.media_litro.toFixed(3), l.km_inicial ?? "", l.km_final ?? "", l.km_rodado, l.custo_km.toFixed(3), l.postos]);
    const csv = [head, ...rows].map((r) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `combustivel-${comp}.csv`;
    a.click();
  };

  const salvarAbast = async () => {
    if (!editAbast) return;
    const { error } = await supabase.from("abastecimentos" as any).update({
      valor: editAbast.valor,
      litros: editAbast.litros,
      km_atual: editAbast.km_atual,
      combustivel: editAbast.combustivel,
      placa: editAbast.placa,
      observacao: editAbast.observacao,
      status: editAbast.status,
    }).eq("id", editAbast.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Abastecimento atualizado");
    setEditAbast(null);
    carregar();
  };

  const cancelarAbast = async () => {
    if (!editAbast) return;
    const motivo = window.prompt("Motivo do cancelamento:");
    if (!motivo) return;
    const { error } = await supabase.from("abastecimentos" as any).update({ status: "cancelado", observacao: `[CANCELADO] ${motivo} | ${editAbast.observacao || ""}` }).eq("id", editAbast.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Abastecimento cancelado");
    setEditAbast(null);
    carregar();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Fuel className="w-7 h-7 text-amber-600" />
          <div>
            <h1 className="text-2xl font-bold">Abastecimento QRCode</h1>
            <p className="text-sm text-muted-foreground">QR Codes de postos, abastecimentos da frota e custo por empresa.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={imprimirFolhaQrs} disabled={!postos.length}><Printer className="w-4 h-4 mr-1" /> Imprimir A4</Button>
          <Button onClick={novo}><Plus className="w-4 h-4 mr-1" /> Novo posto</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div><Label className="text-xs flex items-center gap-1"><Filter className="w-3 h-3" /> Mes</Label><Input type="month" value={comp} onChange={(e) => setComp(e.target.value)} /></div>
            <div><Label className="text-xs">Empresa</Label><Select value={fEmp} onValueChange={setFEmp}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas</SelectItem>{empresasUsadas.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Posto</Label><Select value={fPosto} onValueChange={setFPosto}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{postos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Status</Label><Select value={fStatus} onValueChange={setFStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="concluido">Concluido</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem></SelectContent></Select></div>
            <div className="md:col-span-2"><Label className="text-xs">Buscar</Label><Input value={fBusca} onChange={(e) => setFBusca(e.target.value)} placeholder="Mecanico, placa, posto..." /></div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="qrcodes">
        <TabsList className="grid grid-cols-5 w-full md:w-auto">
          <TabsTrigger value="qrcodes"><QrCode className="w-4 h-4 mr-1" /> QR Codes</TabsTrigger>
          <TabsTrigger value="abast"><Fuel className="w-4 h-4 mr-1" /> Abastecimentos</TabsTrigger>
          <TabsTrigger value="empresas"><Building2 className="w-4 h-4 mr-1" /> Empresas</TabsTrigger>
          <TabsTrigger value="rel"><BarChart3 className="w-4 h-4 mr-1" /> Relatorio</TabsTrigger>
          <TabsTrigger value="cfg"><Settings className="w-4 h-4 mr-1" /> Config</TabsTrigger>
        </TabsList>

        <TabsContent value="qrcodes"><Card><CardHeader><CardTitle>Postos cadastrados ({postos.length})</CardTitle></CardHeader><CardContent>{loading ? "Carregando..." : postos.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Nenhum posto cadastrado.</p> : <Table><TableHeader><TableRow><TableHead>Posto</TableHead><TableHead>CNPJ</TableHead><TableHead>Endereco</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Acoes</TableHead></TableRow></TableHeader><TableBody>{postos.map((p) => <TableRow key={p.id}><TableCell><div className="font-medium">{p.nome}</div><code className="text-xs text-muted-foreground">{p.codigo}</code>{p.unidade && <div className="text-xs text-muted-foreground">{p.unidade}</div>}{p.tipo_qr === "unidade" && <Badge variant="secondary" className="mt-1">Seleciona posto no app</Badge>}</TableCell><TableCell className="text-sm">{p.cnpj || "-"}</TableCell><TableCell className="text-xs text-muted-foreground max-w-[260px]">{p.endereco || "-"}</TableCell><TableCell>{p.status === "ativo" ? <Badge className="bg-green-500/10 text-green-700 border-green-500/20">Ativo</Badge> : <Badge variant="destructive">Bloqueado</Badge>}</TableCell><TableCell className="text-right space-x-1"><Button size="sm" variant="ghost" onClick={() => verQr(p)} title="Ver / imprimir QR"><QrCode className="w-4 h-4" /></Button><Button size="sm" variant="ghost" onClick={() => editar(p)} title="Editar"><Pencil className="w-4 h-4" /></Button><Button size="sm" variant="ghost" onClick={() => toggle(p)} title={p.status === "ativo" ? "Bloquear" : "Liberar"}>{p.status === "ativo" ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}</Button></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></TabsContent>

        <TabsContent value="abast"><Card><CardHeader><CardTitle className="flex items-center justify-between"><span>Abastecimentos ({filtrados.length})</span><span className="text-sm font-normal text-muted-foreground">{totais.litros.toFixed(2)} L - R$ {totais.valor.toFixed(2)}</span></CardTitle></CardHeader><CardContent>{loading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div> : filtrados.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Nenhum abastecimento no filtro.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Empresa</TableHead><TableHead>Mecanico</TableHead><TableHead>Placa</TableHead><TableHead>Posto</TableHead><TableHead>Comb.</TableHead><TableHead className="text-right">Litros</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">KM</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{filtrados.map((a) => <TableRow key={a.id}><TableCell className="text-xs whitespace-nowrap">{a.data} {String(a.hora).slice(0, 5)}</TableCell><TableCell className="text-xs">{a.empresa || "-"}</TableCell><TableCell className="text-sm">{a.mecanico_nome}</TableCell><TableCell className="text-xs">{a.placa || "-"}</TableCell><TableCell className="text-xs">{a.posto_nome || "-"}</TableCell><TableCell className="text-xs">{a.combustivel || "-"}</TableCell><TableCell className="text-right text-xs">{Number(a.litros).toFixed(2)}</TableCell><TableCell className="text-right text-xs">R$ {Number(a.valor).toFixed(2)}</TableCell><TableCell className="text-right text-xs">{a.km_atual ?? "-"}</TableCell><TableCell>{a.status === "concluido" && <Badge className="bg-green-500/10 text-green-700 border-green-500/20">OK</Badge>}{a.status === "pendente" && <Badge variant="secondary">Pendente</Badge>}{a.status === "cancelado" && <Badge variant="destructive">Cancelado</Badge>}</TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditAbast({ ...a })}><Pencil className="w-4 h-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card></TabsContent>

        <TabsContent value="empresas"><Card><CardHeader><CardTitle>Custo por Empresa - {comp}</CardTitle></CardHeader><CardContent>{porEmpresa.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no periodo.</p> : <Table><TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead className="text-right">Mecanicos</TableHead><TableHead className="text-right">Veiculos</TableHead><TableHead className="text-right">Abast.</TableHead><TableHead className="text-right">Litros</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader><TableBody>{porEmpresa.map((e) => <TableRow key={e.empresa}><TableCell className="font-medium">{e.empresa}</TableCell><TableCell className="text-right">{e.mecanicos}</TableCell><TableCell className="text-right">{e.veiculos}</TableCell><TableCell className="text-right">{e.qtd}</TableCell><TableCell className="text-right">{e.litros.toFixed(2)}</TableCell><TableCell className="text-right font-semibold">R$ {e.valor.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></TabsContent>

        <TabsContent value="rel"><Card><CardHeader><CardTitle className="flex items-center justify-between flex-wrap gap-2"><span>Relatorio Mensal - {comp}</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={exportarCsv} disabled={!relatorio.length}><FileSpreadsheet className="w-4 h-4 mr-1" /> CSV</Button><Button variant="outline" size="sm" onClick={() => window.print()} disabled={!relatorio.length}><Printer className="w-4 h-4 mr-1" /> Imprimir</Button></div></CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"><Card className="p-3"><div className="text-xs text-muted-foreground">Abastecimentos</div><div className="text-xl font-bold">{totais.qtd}</div></Card><Card className="p-3"><div className="text-xs text-muted-foreground">Litros totais</div><div className="text-xl font-bold">{totais.litros.toFixed(2)}</div></Card><Card className="p-3"><div className="text-xs text-muted-foreground">Valor total</div><div className="text-xl font-bold">R$ {totais.valor.toFixed(2)}</div></Card><Card className="p-3"><div className="text-xs text-muted-foreground">Media R$/L</div><div className="text-xl font-bold">{totais.media.toFixed(3)}</div></Card></div>{relatorio.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no periodo.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Mecanico</TableHead><TableHead>Placa</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Litros</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">R$/L</TableHead><TableHead className="text-right">KM ini</TableHead><TableHead className="text-right">KM fim</TableHead><TableHead className="text-right">Rodado</TableHead><TableHead className="text-right">R$/KM</TableHead><TableHead>Postos</TableHead></TableRow></TableHeader><TableBody>{relatorio.map((l, i) => <TableRow key={i}><TableCell className="text-xs">{l.empresa}</TableCell><TableCell className="text-sm">{l.mecanico}</TableCell><TableCell className="text-xs">{l.placa}</TableCell><TableCell className="text-right text-xs">{l.qtd}</TableCell><TableCell className="text-right text-xs">{l.litros.toFixed(2)}</TableCell><TableCell className="text-right text-xs font-semibold">R$ {l.valor.toFixed(2)}</TableCell><TableCell className="text-right text-xs">{l.media_litro.toFixed(3)}</TableCell><TableCell className="text-right text-xs">{l.km_inicial ?? "-"}</TableCell><TableCell className="text-right text-xs">{l.km_final ?? "-"}</TableCell><TableCell className="text-right text-xs">{l.km_rodado || "-"}</TableCell><TableCell className="text-right text-xs">{l.custo_km > 0 ? l.custo_km.toFixed(3) : "-"}</TableCell><TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{l.postos}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card></TabsContent>

        <TabsContent value="cfg"><Card><CardHeader><CardTitle>Configuracoes</CardTitle></CardHeader><CardContent className="space-y-4 text-sm text-muted-foreground"><div><strong className="text-foreground">QR Code</strong>: cada QR abre o login do App Mecanico e preserva o posto/unidade lido. Matriz e Praia usam posto fixo; Goiania abre a selecao dos dois postos.</div><div><strong className="text-foreground">Empresas reconhecidas</strong>:<ul className="list-disc pl-6 mt-1">{EMPRESAS_PADRAO.map((e) => <li key={e}>{e}</li>)}</ul></div><div><strong className="text-foreground">Recibo</strong>: o app salva fotos, KM, litros, valor, posto, CNPJ, endereco e telefone para compartilhamento.</div></CardContent></Card></TabsContent>
      </Tabs>

      <Dialog open={editAberto} onOpenChange={setEditAberto}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{edit.id ? "Editar posto" : "Novo posto"}</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Nome</Label><Input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></div><div><Label>CNPJ</Label><Input value={edit.cnpj} onChange={(e) => setEdit({ ...edit, cnpj: e.target.value })} /></div><div><Label>Endereco</Label><Input value={edit.endereco} onChange={(e) => setEdit({ ...edit, endereco: e.target.value })} /></div><div><Label>Telefone</Label><Input value={edit.telefone} onChange={(e) => setEdit({ ...edit, telefone: e.target.value })} /></div><div><Label>Observacao</Label><Input value={edit.observacao} onChange={(e) => setEdit({ ...edit, observacao: e.target.value })} /></div><Button onClick={salvar} className="w-full">Salvar</Button></div></DialogContent></Dialog>

      <Dialog open={!!qrAberto} onOpenChange={(o) => !o && setQrAberto(null)}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{qrAberto?.nome}</DialogTitle></DialogHeader>{qrUrl && <img src={qrUrl} alt="QR" className="w-full" />}<div className="text-center text-xs font-mono text-muted-foreground">{qrAberto?.codigo}</div><div className="text-center text-xs text-muted-foreground">Abre o login e leva direto ao abastecimento.</div><div className="grid grid-cols-2 gap-2"><Button onClick={imprimirQr}><Printer className="w-4 h-4 mr-2" /> Imprimir</Button><Button variant="outline" onClick={baixarQr}><Download className="w-4 h-4 mr-2" /> Baixar</Button></div></DialogContent></Dialog>

      <Dialog open={!!editAbast} onOpenChange={(o) => !o && setEditAbast(null)}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Abastecimento</DialogTitle></DialogHeader>{editAbast && <div className="space-y-3"><div className="text-xs text-muted-foreground">{editAbast.mecanico_nome} - {editAbast.empresa || "-"} - {editAbast.data} {String(editAbast.hora).slice(0, 5)}</div><div className="grid grid-cols-2 gap-3"><div><Label>Placa</Label><Input value={editAbast.placa || ""} onChange={(e) => setEditAbast({ ...editAbast, placa: e.target.value })} /></div><div><Label>Combustivel</Label><Input value={editAbast.combustivel || ""} onChange={(e) => setEditAbast({ ...editAbast, combustivel: e.target.value })} /></div><div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={editAbast.valor} onChange={(e) => setEditAbast({ ...editAbast, valor: Number(e.target.value) })} /></div><div><Label>Litros</Label><Input type="number" step="0.001" value={editAbast.litros} onChange={(e) => setEditAbast({ ...editAbast, litros: Number(e.target.value) })} /></div><div><Label>KM</Label><Input type="number" value={editAbast.km_atual ?? ""} onChange={(e) => setEditAbast({ ...editAbast, km_atual: e.target.value ? Number(e.target.value) : null })} /></div><div><Label>Status</Label><Select value={editAbast.status} onValueChange={(v) => setEditAbast({ ...editAbast, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="concluido">Concluido</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem></SelectContent></Select></div></div><div><Label>Observacao</Label><Input value={editAbast.observacao || ""} onChange={(e) => setEditAbast({ ...editAbast, observacao: e.target.value })} /></div><div className="flex gap-2 pt-2">{editAbast.foto_bomba_url && <a href={editAbast.foto_bomba_url} target="_blank" rel="noreferrer"><img src={editAbast.foto_bomba_url} className="w-16 h-16 object-cover rounded" /></a>}{editAbast.foto_painel_url && <a href={editAbast.foto_painel_url} target="_blank" rel="noreferrer"><img src={editAbast.foto_painel_url} className="w-16 h-16 object-cover rounded" /></a>}</div><div className="flex gap-2"><Button onClick={salvarAbast} className="flex-1">Salvar</Button>{editAbast.status !== "cancelado" && <Button variant="destructive" onClick={cancelarAbast}>Cancelar abast.</Button>}</div></div>}</DialogContent></Dialog>
    </div>
  );
}

function qrPrintHtml(itens: { p: Posto; url: string }[], folha: boolean) {
  return `<html><head><title>QR Codes Abastecimento</title><style>body{font-family:Arial,sans-serif;margin:18px;color:#111}h1{font-size:18px;margin:0 0 14px}.grid{display:grid;grid-template-columns:${folha ? "repeat(2,1fr)" : "1fr"};gap:12px}.card{border:1px solid #222;padding:10px;min-height:${folha ? "285px" : "auto"};break-inside:avoid;text-align:center}.single{max-width:420px;margin:auto}img{width:${folha ? "155px" : "340px"};height:${folha ? "155px" : "340px"}}.name{font-weight:bold;font-size:13px;margin-bottom:3px}.meta{font-size:10px;color:#333;line-height:1.3}.code{font-family:monospace;font-size:11px;margin-top:5px}@media print{.card{break-inside:avoid}}</style></head><body><h1>TOPAC RH PRO - QR Codes de Abastecimento</h1><div class="grid">${itens.map(({ p, url }) => `<div class="card ${folha ? "" : "single"}"><div class="name">${escapeHtml(p.nome)}</div><div class="meta">${escapeHtml(p.unidade || "")}</div>${p.cnpj ? `<div class="meta">CNPJ: ${escapeHtml(p.cnpj)}</div>` : ""}${p.endereco ? `<div class="meta">${escapeHtml(p.endereco)}</div>` : ""}${p.telefone ? `<div class="meta">Tel: ${escapeHtml(p.telefone)}</div>` : ""}<img src="${url}" /><div class="code">${escapeHtml(p.codigo)}</div><div class="meta">QR unico. Abre login do App Mecanico e registra o abastecimento.</div></div>`).join("")}</div></body></html>`;
}

function escapeHtml(value: string) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
