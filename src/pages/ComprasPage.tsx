import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, ShoppingCart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/calculations';

type Status = 'solicitado' | 'em_cotacao' | 'aprovado' | 'comprado' | 'entregue' | 'cancelado';

const STATUS_OPTS: { v: Status; label: string; color: string }[] = [
  { v: 'solicitado', label: 'Solicitado', color: 'bg-muted text-foreground' },
  { v: 'em_cotacao', label: 'Em cotação', color: 'bg-warning/20 text-warning-foreground' },
  { v: 'aprovado', label: 'Aprovado', color: 'bg-info/20 text-info-foreground' },
  { v: 'comprado', label: 'Comprado', color: 'bg-primary/20 text-primary' },
  { v: 'entregue', label: 'Entregue', color: 'bg-success/20 text-success' },
  { v: 'cancelado', label: 'Cancelado', color: 'bg-destructive/20 text-destructive' },
];

const ComprasPage: React.FC = () => {
  const { session, companies } = useApp();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('todos');

  const [empresaId, setEmpresaId] = useState('');
  const [centroCusto, setCentroCusto] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [item, setItem] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [unidade, setUnidade] = useState('un');
  const [valorEstimado, setValorEstimado] = useState(0);
  const [observacao, setObservacao] = useState('');

  const fetchList = async () => {
    setLoading(true);
    const { data } = await supabase.from('compras').select('*').order('created_at', { ascending: false });
    setList(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchList(); }, []);

  const handleSalvar = async () => {
    if (!session) return;
    if (!empresaId || !item) { toast.error('Empresa e item são obrigatórios'); return; }
    setSaving(true);
    try {
      const empresa = companies.find(c => c.id === empresaId);
      const numero = `SC-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from('compras').insert({
        numero_solicitacao: numero,
        company_id: empresaId,
        empresa_nome: empresa?.name || '',
        solicitante_user_id: session.user.id,
        solicitante_nome: session.user.email || '',
        centro_custo: centroCusto,
        fornecedor, item, quantidade, unidade,
        valor_estimado: valorEstimado,
        observacao,
        status: 'solicitado',
      });
      if (error) throw error;
      toast.success('Solicitação registrada');
      setOpen(false);
      setItem(''); setFornecedor(''); setObservacao(''); setQuantidade(1); setValorEstimado(0); setCentroCusto('');
      await fetchList();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const mudarStatus = async (compra: any, novo: Status) => {
    if (!session) return;
    const { error } = await supabase.from('compras').update({ status: novo }).eq('id', compra.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    await supabase.from('compras_historico').insert({
      compra_id: compra.id,
      status_anterior: compra.status,
      status_novo: novo,
      user_id: session.user.id,
      usuario_nome: session.user.email || '',
    });
    toast.success('Status atualizado');
    await fetchList();
  };

  const filtered = filterStatus === 'todos' ? list : list.filter(c => c.status === filterStatus);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><ShoppingCart className="w-6 h-6" /> Compras</h1>
          <p className="text-sm text-muted-foreground">Solicitações de compra, cotação, aprovação e entrega.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nova Solicitação</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Solicitação de Compra</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Empresa</Label>
                <Select value={empresaId} onValueChange={setEmpresaId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Centro de custo</Label>
                <Input value={centroCusto} onChange={e => setCentroCusto(e.target.value)} />
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Input value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
              </div>
              <div>
                <Label>Item</Label>
                <Input value={item} onChange={e => setItem(e.target.value)} />
              </div>
              <div>
                <Label>Quantidade</Label>
                <Input type="number" value={quantidade} onChange={e => setQuantidade(Number(e.target.value))} />
              </div>
              <div>
                <Label>Unidade</Label>
                <Input value={unidade} onChange={e => setUnidade(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Valor estimado (R$)</Label>
                <Input type="number" step="0.01" value={valorEstimado} onChange={e => setValorEstimado(Number(e.target.value))} />
              </div>
              <div className="md:col-span-2">
                <Label>Observação</Label>
                <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-3">
          <Label className="text-xs">Filtrar por status:</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {STATUS_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-left">SC</th>
                <th className="p-2 text-left">Data</th>
                <th className="p-2 text-left">Empresa</th>
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-left">Fornecedor</th>
                <th className="p-2 text-right">Qtd</th>
                <th className="p-2 text-right">Valor est.</th>
                <th className="p-2 text-left">Solicitante</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-center">Mudar status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const st = STATUS_OPTS.find(s => s.v === c.status);
                return (
                  <tr key={c.id} className="border-t hover:bg-muted/40">
                    <td className="p-2 font-mono text-xs">{c.numero_solicitacao}</td>
                    <td className="p-2">{c.data_solicitacao}</td>
                    <td className="p-2">{c.empresa_nome}</td>
                    <td className="p-2">{c.item}<div className="text-[10px] text-muted-foreground">{c.observacao}</div></td>
                    <td className="p-2">{c.fornecedor}</td>
                    <td className="p-2 text-right">{Number(c.quantidade)} {c.unidade}</td>
                    <td className="p-2 text-right">{formatCurrency(Number(c.valor_estimado))}</td>
                    <td className="p-2 text-xs">{c.solicitante_nome}</td>
                    <td className="p-2 text-center"><Badge className={st?.color}>{st?.label || c.status}</Badge></td>
                    <td className="p-2 text-center">
                      <Select value={c.status} onValueChange={v => mudarStatus(c, v as Status)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Nenhuma solicitação registrada.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default ComprasPage;
