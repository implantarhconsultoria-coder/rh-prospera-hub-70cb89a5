import React, { useEffect, useMemo, useState } from 'react';
import { Fuel, Plus, QrCode, CheckCircle2, AlertTriangle, Filter as FilterIcon, Printer, Trash2, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import QRCode from 'qrcode';

interface Vale {
  id: string; codigo: string; tipo?: string;
  posto_nome?: string; posto_cnpj?: string; posto_endereco?: string; posto_id?: string;
  valor_limite: number; litros_limite: number;
  status: string; validade: string | null; veiculo_id: string | null;
  created_at: string;
}
interface Abast {
  id: string; mecanico_nome: string; placa: string; valor: number; litros: number;
  status: string; foto_bomba_url: string; data: string; hora: string; competencia: string;
  vale_codigo: string; observacao_conferencia: string; posto_nome?: string;
}
interface Posto { id: string; nome: string; cnpj: string; endereco: string; cidade: string; uf: string; ativo: boolean; }

const CombustivelAdminPage: React.FC = () => {
  const { userRole } = useApp();
  const isAdmin = userRole === 'admin';
  const [vales, setVales] = useState<Vale[]>([]);
  const [abast, setAbast] = useState<Abast[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [openVale, setOpenVale] = useState(false);
  const [openConf, setOpenConf] = useState<Abast | null>(null);
  const [openPosto, setOpenPosto] = useState(false);
  const [filterStatus, setFilterStatus] = useState('todos');
  const [obs, setObs] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const [novoVale, setNovoVale] = useState({
    posto_id: '',
    sequencial: '',
    valor_limite: '0',
    litros_limite: '0',
    validade: '',
    quantidade: '5',
  });

  const [novoPosto, setNovoPosto] = useState({ nome: '', cnpj: '', endereco: '', cidade: '', uf: '' });

  const reload = async () => {
    const [v, a, p] = await Promise.all([
      supabase.from('vales_combustivel').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(200),
      supabase.from('abastecimentos').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('postos').select('*').eq('ativo', true).order('nome'),
    ]);
    setVales((v.data as any) || []);
    setAbast((a.data as any) || []);
    setPostos((p.data as any) || []);
  };
  useEffect(() => { reload(); }, []);

  const proximoTopac = async () => {
    const { data } = await supabase.from('vales_combustivel').select('codigo').like('codigo', 'TOPAC-ABAST-%').order('codigo', { ascending: false }).limit(1);
    const last = (data as any)?.[0]?.codigo as string | undefined;
    const lastNum = last ? parseInt(last.replace('TOPAC-ABAST-', ''), 10) : 0;
    return (Number.isFinite(lastNum) ? lastNum : 0) + 1;
  };

  const criarVale = async () => {
    if (!novoVale.posto_id) { toast.error('Selecione um posto cadastrado'); return; }
    const posto = postos.find(p => p.id === novoVale.posto_id);
    if (!posto) { toast.error('Posto inválido'); return; }
    const qtd = Math.max(1, Math.min(100, Number(novoVale.quantidade) || 1));
    const inicio = novoVale.sequencial ? Math.max(1, parseInt(novoVale.sequencial, 10)) : await proximoTopac();
    const rows = Array.from({ length: qtd }, (_, i) => {
      const num = String(inicio + i).padStart(3, '0');
      return {
        codigo: `TOPAC-ABAST-${num}`,
        tipo: 'autorizacao_abastecimento',
        posto_id: posto.id,
        posto_nome: posto.nome,
        posto_cnpj: posto.cnpj,
        posto_endereco: [posto.endereco, posto.cidade, posto.uf].filter(Boolean).join(' · '),
        valor_limite: Number(novoVale.valor_limite) || 0,
        litros_limite: Number(novoVale.litros_limite) || 0,
        validade: novoVale.validade || null,
      };
    });
    const { error } = await supabase.from('vales_combustivel').insert(rows as any);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} QR Code(s) gerado(s)`);
    setOpenVale(false);
    setNovoVale({ ...novoVale, sequencial: '' });
    reload();
  };

  const conferir = async (status: 'conferido' | 'divergente') => {
    if (!openConf) return;
    const { error } = await supabase.from('abastecimentos').update({
      status, observacao_conferencia: obs, conferido_em: new Date().toISOString(),
    } as any).eq('id', openConf.id);
    if (error) return toast.error(error.message);
    toast.success(status === 'conferido' ? 'Conferido' : 'Marcado como divergente');
    setOpenConf(null); setObs(''); reload();
  };

  const criarPosto = async () => {
    if (!novoPosto.nome) return toast.error('Nome obrigatório');
    const { error } = await supabase.from('postos').insert(novoPosto as any);
    if (error) return toast.error(error.message);
    toast.success('Posto cadastrado');
    setOpenPosto(false);
    setNovoPosto({ nome: '', cnpj: '', endereco: '', cidade: '', uf: '' });
    reload();
  };

  const excluirVales = async (ids: string[]) => {
    if (!isAdmin) return toast.error('Somente Admin pode excluir');
    if (!confirm(`Excluir ${ids.length} autorização(ões)?`)) return;
    const { error } = await supabase.from('vales_combustivel')
      .update({ deleted_at: new Date().toISOString() } as any).in('id', ids);
    if (error) return toast.error(error.message);
    toast.success('Excluído');
    setSelecionados(new Set());
    reload();
  };

  const excluirAbast = async (id: string) => {
    if (!isAdmin) return toast.error('Somente Admin pode excluir');
    if (!confirm('Excluir este abastecimento? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('abastecimentos').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Abastecimento excluído');
    reload();
  };

  const toggleSel = (id: string) => {
    const s = new Set(selecionados);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelecionados(s);
  };

  const imprimirQRs = async (lista: Vale[]) => {
    if (!lista.length) return toast.info('Nenhum QR para imprimir');
    const baseUrl = window.location.origin;
    // Gera QR dataURL para cada
    const cards = await Promise.all(lista.map(async (v) => {
      const url = `${baseUrl}/abastecer/${encodeURIComponent(v.codigo)}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 280, margin: 1, errorCorrectionLevel: 'M' });
      return { v, dataUrl, url };
    }));
    const html = `<!DOCTYPE html><html><head><title>QR Codes Abastecimento</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; color: #111; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
      .card { border: 2px solid #000; border-radius: 8px; padding: 6mm; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; text-align: center; }
      .brand { font-weight: 900; font-size: 18px; letter-spacing: 1px; }
      .title { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #444; margin: 2mm 0 3mm; }
      .posto { font-size: 12px; font-weight: bold; margin: 1mm 0; word-break: break-word; }
      .info { font-size: 10px; color: #444; margin: 0.5mm 0; word-break: break-word; }
      .qr { margin: 3mm 0; }
      .qr img { width: 55mm; height: 55mm; }
      .codigo { font-family: 'Courier New', monospace; font-weight: bold; font-size: 13px; margin-top: 2mm; padding: 2mm 4mm; border: 1.5px solid #000; border-radius: 4px; }
      .footer { font-size: 9px; color: #555; margin-top: 3mm; line-height: 1.3; }
    </style></head><body>
    <div class="grid">
    ${cards.map(({ v, dataUrl }) => `
      <div class="card">
        <div class="brand">TOPAC</div>
        <div class="title">Autorização de Abastecimento</div>
        <div class="posto">${v.posto_nome || '—'}</div>
        <div class="info">CNPJ: ${v.posto_cnpj || '—'}</div>
        <div class="info">${v.posto_endereco || ''}</div>
        <div class="qr"><img src="${dataUrl}" /></div>
        <div class="codigo">${v.codigo}</div>
        <div class="footer">Escaneie o QR Code,<br/>informe os dados e tire foto<br/>da bomba e do painel.</div>
      </div>`).join('')}
    </div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast.error('Permita pop-ups para imprimir');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  };

  const filtered = abast.filter(a => filterStatus === 'todos' || a.status === filterStatus);
  const totalValor = filtered.reduce((s, a) => s + Number(a.valor), 0);
  const totalLitros = filtered.reduce((s, a) => s + Number(a.litros), 0);
  const valesAtivos = useMemo(() => vales.filter(v => v.status === 'ativo'), [vales]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Fuel className="w-6 h-6 text-primary" /> Combustível</h1>
          <p className="text-sm text-muted-foreground">QR Codes TOPAC-ABAST · postos cadastrados · conferência</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setOpenPosto(true)}><Building2 className="w-4 h-4 mr-2" /> Novo posto</Button>
          <Button onClick={() => setOpenVale(true)}><Plus className="w-4 h-4 mr-2" /> Gerar QR Code</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">QR Codes</p><p className="text-2xl font-bold">{vales.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Ativos</p><p className="text-2xl font-bold">{valesAtivos.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Postos</p><p className="text-2xl font-bold">{postos.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total R$ ({filterStatus})</p><p className="text-2xl font-bold">R$ {totalValor.toFixed(2)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total litros</p><p className="text-2xl font-bold">{totalLitros.toFixed(2)} L</p></Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-bold flex items-center gap-2"><QrCode className="w-4 h-4" /> Autorizações / QR Codes</h2>
          <div className="flex gap-2">
            {selecionados.size > 0 && (
              <>
                <Button size="sm" variant="outline" onClick={() => imprimirQRs(vales.filter(v => selecionados.has(v.id)))}>
                  <Printer className="w-4 h-4 mr-2" /> Imprimir {selecionados.size}
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="destructive" onClick={() => excluirVales(Array.from(selecionados))}>
                    <Trash2 className="w-4 h-4 mr-2" /> Excluir {selecionados.size}
                  </Button>
                )}
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => imprimirQRs(valesAtivos)}>
              <Printer className="w-4 h-4 mr-2" /> Imprimir ativos
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b">
              <th className="py-2 w-8"><Checkbox checked={selecionados.size === vales.length && vales.length > 0}
                onCheckedChange={(c) => setSelecionados(c ? new Set(vales.map(v => v.id)) : new Set())} /></th>
              <th>Código</th><th>Posto</th><th>Limite R$</th><th>Litros</th><th>Validade</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {vales.map(v => (
                <tr key={v.id} className="border-b last:border-0">
                  <td><Checkbox checked={selecionados.has(v.id)} onCheckedChange={() => toggleSel(v.id)} /></td>
                  <td className="py-2 font-mono text-xs">{v.codigo}</td>
                  <td>{v.posto_nome || '—'}</td>
                  <td>{Number(v.valor_limite) > 0 ? `R$ ${Number(v.valor_limite).toFixed(2)}` : 'Sem limite'}</td>
                  <td>{Number(v.litros_limite) > 0 ? `${v.litros_limite} L` : '—'}</td>
                  <td>{v.validade || '—'}</td>
                  <td><span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${v.status === 'ativo' ? 'bg-emerald-500/15 text-emerald-700' : v.status === 'utilizado' ? 'bg-blue-500/15 text-blue-700' : 'bg-muted text-muted-foreground'}`}>{v.status}</span></td>
                  <td className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => imprimirQRs([v])} title="Imprimir"><Printer className="w-4 h-4" /></Button>
                    {isAdmin && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => excluirVales([v.id])} title="Excluir"><Trash2 className="w-4 h-4" /></Button>}
                  </td>
                </tr>
              ))}
              {vales.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Nenhuma autorização. Cadastre um posto e gere QR Codes.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="font-bold">Abastecimentos</h2>
          <div className="flex items-center gap-2">
            <FilterIcon className="w-4 h-4 text-muted-foreground" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="conferido">Conferido</SelectItem>
                <SelectItem value="divergente">Divergente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2">Data</th><th>Funcionário</th><th>Placa</th><th>Posto</th><th>Autorização</th><th>R$</th><th>Litros</th><th>Foto</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2">{a.data} {a.hora?.slice(0, 5)}</td>
                  <td>{a.mecanico_nome}</td>
                  <td>{a.placa}</td>
                  <td>{a.posto_nome || '—'}</td>
                  <td className="font-mono text-xs">{a.vale_codigo}</td>
                  <td>R$ {Number(a.valor).toFixed(2)}</td>
                  <td>{Number(a.litros).toFixed(2)}</td>
                  <td>{a.foto_bomba_url && <a href={a.foto_bomba_url} target="_blank" rel="noreferrer"><img src={a.foto_bomba_url} className="w-10 h-10 object-cover rounded" alt="bomba" /></a>}</td>
                  <td><span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${a.status === 'conferido' ? 'bg-emerald-500/15 text-emerald-700' : a.status === 'divergente' ? 'bg-rose-500/15 text-rose-700' : 'bg-amber-500/15 text-amber-700'}`}>{a.status}</span></td>
                  <td className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setOpenConf(a); setObs(a.observacao_conferencia || ''); }}>Conferir</Button>
                    {isAdmin && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => excluirAbast(a.id)} title="Excluir"><Trash2 className="w-4 h-4" /></Button>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">Nenhum abastecimento</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dialog Gerar QR */}
      <Dialog open={openVale} onOpenChange={setOpenVale}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Gerar QR Codes de abastecimento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Posto cadastrado *</Label>
              <Select value={novoVale.posto_id} onValueChange={(v) => setNovoVale({ ...novoVale, posto_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione um posto..." /></SelectTrigger>
                <SelectContent>
                  {postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} {p.cidade ? `· ${p.cidade}` : ''}</SelectItem>)}
                  {postos.length === 0 && <SelectItem disabled value="none">Nenhum posto cadastrado</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Iniciar em (opcional)</Label><Input placeholder="auto" value={novoVale.sequencial} onChange={e => setNovoVale({ ...novoVale, sequencial: e.target.value })} /></div>
              <div><Label>Quantidade</Label><Input type="number" min={1} max={100} value={novoVale.quantidade} onChange={e => setNovoVale({ ...novoVale, quantidade: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Limite R$ (0 = sem limite)</Label><Input value={novoVale.valor_limite} onChange={e => setNovoVale({ ...novoVale, valor_limite: e.target.value })} /></div>
              <div><Label>Limite litros (0 = sem limite)</Label><Input value={novoVale.litros_limite} onChange={e => setNovoVale({ ...novoVale, litros_limite: e.target.value })} /></div>
            </div>
            <div><Label>Validade (opcional)</Label><Input type="date" value={novoVale.validade} onChange={e => setNovoVale({ ...novoVale, validade: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={criarVale}>Gerar QR Codes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Posto */}
      <Dialog open={openPosto} onOpenChange={setOpenPosto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cadastrar posto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={novoPosto.nome} onChange={e => setNovoPosto({ ...novoPosto, nome: e.target.value })} /></div>
            <div><Label>CNPJ</Label><Input value={novoPosto.cnpj} onChange={e => setNovoPosto({ ...novoPosto, cnpj: e.target.value })} /></div>
            <div><Label>Endereço</Label><Input value={novoPosto.endereco} onChange={e => setNovoPosto({ ...novoPosto, endereco: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cidade</Label><Input value={novoPosto.cidade} onChange={e => setNovoPosto({ ...novoPosto, cidade: e.target.value })} /></div>
              <div><Label>UF</Label><Input maxLength={2} value={novoPosto.uf} onChange={e => setNovoPosto({ ...novoPosto, uf: e.target.value.toUpperCase() })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={criarPosto}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Conferir */}
      <Dialog open={!!openConf} onOpenChange={(o) => !o && setOpenConf(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conferir abastecimento</DialogTitle></DialogHeader>
          {openConf && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Funcionário:</span> {openConf.mecanico_nome}</div>
                <div><span className="text-muted-foreground">Placa:</span> {openConf.placa}</div>
                <div><span className="text-muted-foreground">Posto:</span> {openConf.posto_nome || '—'}</div>
                <div><span className="text-muted-foreground">Autorização:</span> <span className="font-mono">{openConf.vale_codigo}</span></div>
                <div><span className="text-muted-foreground">Valor:</span> R$ {Number(openConf.valor).toFixed(2)}</div>
                <div><span className="text-muted-foreground">Litros:</span> {Number(openConf.litros).toFixed(2)}</div>
              </div>
              {openConf.foto_bomba_url && <img src={openConf.foto_bomba_url} className="w-full max-h-64 object-cover rounded border" alt="bomba" />}
              <Textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação da conferência" />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => conferir('divergente')}><AlertTriangle className="w-4 h-4 mr-2" /> Divergente</Button>
            <Button onClick={() => conferir('conferido')}><CheckCircle2 className="w-4 h-4 mr-2" /> Conferido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CombustivelAdminPage;
