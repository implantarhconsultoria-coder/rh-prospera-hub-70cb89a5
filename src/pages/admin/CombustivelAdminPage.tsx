import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Fuel, Plus, QrCode, CheckCircle2, AlertTriangle, Filter as FilterIcon, Download, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Vale {
  id: string;
  codigo: string;
  tipo?: string;
  posto_nome?: string;
  posto_cnpj?: string;
  valor_limite: number;
  litros_limite: number;
  status: string;
  validade: string | null;
  veiculo_id: string | null;
  created_at: string;
}
interface Abast {
  id: string; mecanico_nome: string; placa: string; valor: number; litros: number;
  status: string; foto_bomba_url: string; data: string; hora: string; competencia: string;
  vale_codigo: string; observacao_conferencia: string; posto_nome?: string;
}
interface Veic { id: string; placa: string; modelo: string; }

const genCodigoLivre = () => 'VL-' + Math.random().toString(36).slice(2, 8).toUpperCase() + '-' + Date.now().toString(36).slice(-4).toUpperCase();

const CombustivelAdminPage: React.FC = () => {
  const [vales, setVales] = useState<Vale[]>([]);
  const [abast, setAbast] = useState<Abast[]>([]);
  const [veiculos, setVeiculos] = useState<Veic[]>([]);
  const [openVale, setOpenVale] = useState(false);
  const [openConf, setOpenConf] = useState<Abast | null>(null);
  const [filterStatus, setFilterStatus] = useState('todos');
  const [obs, setObs] = useState('');
  const [novoVale, setNovoVale] = useState({
    tipo: 'autorizacao_abastecimento',
    serie: 'topac', // 'topac' | 'livre'
    sequencial: '',
    veiculo_id: '',
    posto_nome: '',
    posto_cnpj: '',
    posto_endereco: '',
    valor_limite: '0',
    litros_limite: '0',
    validade: '',
    quantidade: '1',
  });

  const reload = async () => {
    const [v, a, ve] = await Promise.all([
      supabase.from('vales_combustivel').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('abastecimentos').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('veiculos').select('id, placa, modelo').order('placa'),
    ]);
    setVales((v.data as any) || []);
    setAbast((a.data as any) || []);
    setVeiculos((ve.data as any) || []);
  };

  useEffect(() => { reload(); }, []);

  const proximoTopac = async () => {
    const { data } = await supabase
      .from('vales_combustivel')
      .select('codigo')
      .like('codigo', 'TOPAC-ABAST-%')
      .order('codigo', { ascending: false })
      .limit(1);
    const last = (data as any)?.[0]?.codigo as string | undefined;
    const lastNum = last ? parseInt(last.replace('TOPAC-ABAST-', ''), 10) : 0;
    return (Number.isFinite(lastNum) ? lastNum : 0) + 1;
  };

  const criarVale = async () => {
    const qtd = Math.max(1, Math.min(50, Number(novoVale.quantidade) || 1));
    const rows: any[] = [];

    if (novoVale.serie === 'topac') {
      const inicio = novoVale.sequencial
        ? Math.max(1, parseInt(novoVale.sequencial, 10))
        : await proximoTopac();
      for (let i = 0; i < qtd; i++) {
        const num = String(inicio + i).padStart(3, '0');
        rows.push({
          codigo: `TOPAC-ABAST-${num}`,
          tipo: 'autorizacao_abastecimento',
          veiculo_id: novoVale.veiculo_id || null,
          posto_nome: novoVale.posto_nome,
          posto_cnpj: novoVale.posto_cnpj,
          posto_endereco: novoVale.posto_endereco,
          valor_limite: Number(novoVale.valor_limite) || 0,
          litros_limite: Number(novoVale.litros_limite) || 0,
          validade: novoVale.validade || null,
        });
      }
    } else {
      for (let i = 0; i < qtd; i++) {
        rows.push({
          codigo: genCodigoLivre(),
          tipo: 'autorizacao_abastecimento',
          veiculo_id: novoVale.veiculo_id || null,
          posto_nome: novoVale.posto_nome,
          posto_cnpj: novoVale.posto_cnpj,
          posto_endereco: novoVale.posto_endereco,
          valor_limite: Number(novoVale.valor_limite) || 0,
          litros_limite: Number(novoVale.litros_limite) || 0,
          validade: novoVale.validade || null,
        });
      }
    }

    const { error } = await supabase.from('vales_combustivel').insert(rows as any);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} autorização(ões) gerada(s)`);
    setOpenVale(false);
    setNovoVale({ ...novoVale, sequencial: '', quantidade: '1' });
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

  const exportarQRsTopac = () => {
    const codigos = vales.filter(v => v.codigo.startsWith('TOPAC-ABAST') && v.status === 'ativo').map(v => v.codigo);
    if (!codigos.length) return toast.info('Nenhum vale TOPAC ativo');
    const content = codigos.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `topac-abast-codigos-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = abast.filter(a => filterStatus === 'todos' || a.status === filterStatus);
  const totalValor = filtered.reduce((s, a) => s + Number(a.valor), 0);
  const totalLitros = filtered.reduce((s, a) => s + Number(a.litros), 0);
  const totalTopac = vales.filter(v => v.codigo.startsWith('TOPAC-ABAST')).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Fuel className="w-6 h-6 text-primary" /> Combustível</h1>
          <p className="text-sm text-muted-foreground">Autorizações TOPAC-ABAST, abastecimentos e conferência</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/combustivel/imprimir">
            <Button variant="outline"><Printer className="w-4 h-4 mr-2" /> Imprimir QR Codes</Button>
          </Link>
          <Button variant="outline" onClick={exportarQRsTopac}><Download className="w-4 h-4 mr-2" /> Exportar códigos TOPAC</Button>
          <Button onClick={() => setOpenVale(true)}><Plus className="w-4 h-4 mr-2" /> Gerar autorização</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">TOPAC-ABAST</p><p className="text-2xl font-bold">{totalTopac}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Vales ativos</p><p className="text-2xl font-bold">{vales.filter(v => v.status === 'ativo').length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Abastecimentos ({filterStatus})</p><p className="text-2xl font-bold">{filtered.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total R$</p><p className="text-2xl font-bold">R$ {totalValor.toFixed(2)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total litros</p><p className="text-2xl font-bold">{totalLitros.toFixed(2)} L</p></Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold flex items-center gap-2"><QrCode className="w-4 h-4" /> Autorizações emitidas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2">Código</th><th>Posto</th><th>Veículo</th><th>Limite R$</th><th>Litros</th><th>Validade</th><th>Status</th></tr></thead>
            <tbody>
              {vales.map(v => {
                const ve = veiculos.find(x => x.id === v.veiculo_id);
                const isTopac = v.codigo.startsWith('TOPAC-ABAST');
                return (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">
                      {v.codigo}
                      {isTopac && <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700">TOPAC</span>}
                    </td>
                    <td>{v.posto_nome || '—'}</td>
                    <td>{ve ? `${ve.placa} - ${ve.modelo}` : 'Livre'}</td>
                    <td>{Number(v.valor_limite) > 0 ? `R$ ${Number(v.valor_limite).toFixed(2)}` : 'Sem limite'}</td>
                    <td>{Number(v.litros_limite) > 0 ? `${v.litros_limite} L` : '—'}</td>
                    <td>{v.validade || '—'}</td>
                    <td><span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${v.status === 'ativo' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{v.status}</span></td>
                  </tr>
                );
              })}
              {vales.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nenhuma autorização</td></tr>}
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
            <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2">Data</th><th>Mecânico</th><th>Placa</th><th>Posto</th><th>Autorização</th><th>R$</th><th>Litros</th><th>Foto</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2">{a.data} {a.hora?.slice(0, 5)}</td>
                  <td>{a.mecanico_nome}</td>
                  <td>{a.placa}</td>
                  <td>{a.posto_nome || '—'}</td>
                  <td className="font-mono text-xs">
                    {a.vale_codigo}
                    {a.vale_codigo?.startsWith('TOPAC-ABAST') && <span className="ml-1 text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-amber-500/15 text-amber-700">TOPAC</span>}
                  </td>
                  <td>R$ {Number(a.valor).toFixed(2)}</td>
                  <td>{Number(a.litros).toFixed(2)}</td>
                  <td>{a.foto_bomba_url && <a href={a.foto_bomba_url} target="_blank" rel="noreferrer"><img src={a.foto_bomba_url} className="w-10 h-10 object-cover rounded" alt="bomba" /></a>}</td>
                  <td><span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${a.status === 'conferido' ? 'bg-emerald-500/15 text-emerald-700' : a.status === 'divergente' ? 'bg-rose-500/15 text-rose-700' : 'bg-amber-500/15 text-amber-700'}`}>{a.status}</span></td>
                  <td><Button size="sm" variant="outline" onClick={() => { setOpenConf(a); setObs(a.observacao_conferencia || ''); }}>Conferir</Button></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">Nenhum abastecimento</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={openVale} onOpenChange={setOpenVale}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Gerar autorização de abastecimento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Série</Label>
              <Select value={novoVale.serie} onValueChange={(v) => setNovoVale({ ...novoVale, serie: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="topac">TOPAC-ABAST (impressa em série)</SelectItem>
                  <SelectItem value="livre">Código livre (gerado)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {novoVale.serie === 'topac' && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Iniciar em (opcional)</Label><Input placeholder="ex: 1" value={novoVale.sequencial} onChange={e => setNovoVale({ ...novoVale, sequencial: e.target.value })} /></div>
                <div><Label>Quantidade</Label><Input value={novoVale.quantidade} onChange={e => setNovoVale({ ...novoVale, quantidade: e.target.value })} /></div>
              </div>
            )}
            <div>
              <Label>Posto vinculado</Label>
              <Input placeholder="Nome do posto" value={novoVale.posto_nome} onChange={e => setNovoVale({ ...novoVale, posto_nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CNPJ posto</Label><Input value={novoVale.posto_cnpj} onChange={e => setNovoVale({ ...novoVale, posto_cnpj: e.target.value })} /></div>
              <div><Label>Endereço</Label><Input value={novoVale.posto_endereco} onChange={e => setNovoVale({ ...novoVale, posto_endereco: e.target.value })} /></div>
            </div>
            <div>
              <Label>Veículo (opcional — em branco = qualquer veículo)</Label>
              <Select value={novoVale.veiculo_id || 'any'} onValueChange={(v) => setNovoVale({ ...novoVale, veiculo_id: v === 'any' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer veículo</SelectItem>
                  {veiculos.map(v => <SelectItem key={v.id} value={v.id}>{v.placa} - {v.modelo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Limite R$ (0 = sem limite)</Label><Input value={novoVale.valor_limite} onChange={e => setNovoVale({ ...novoVale, valor_limite: e.target.value })} /></div>
              <div><Label>Limite litros (0 = sem limite)</Label><Input value={novoVale.litros_limite} onChange={e => setNovoVale({ ...novoVale, litros_limite: e.target.value })} /></div>
            </div>
            <div><Label>Validade (opcional)</Label><Input type="date" value={novoVale.validade} onChange={e => setNovoVale({ ...novoVale, validade: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={criarVale}>Gerar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!openConf} onOpenChange={(o) => !o && setOpenConf(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conferir abastecimento</DialogTitle></DialogHeader>
          {openConf && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Mecânico:</span> {openConf.mecanico_nome}</div>
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
