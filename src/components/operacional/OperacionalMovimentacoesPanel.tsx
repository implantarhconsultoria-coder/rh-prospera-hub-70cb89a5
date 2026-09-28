import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, History, Loader2, Package, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import OperadorCodeDialog from '@/components/OperadorCodeDialog';
import { toast } from 'sonner';

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};

type Props = {
  equipamentos: any[];
  clientes: any[];
};

const TIPOS = [
  ['saida_locacao', 'Saída para nova locação'],
  ['transferencia', 'Transferência de cliente/canteiro'],
  ['retirada', 'Retirada do cliente'],
  ['retorno_oficina', 'Retorno para oficina'],
  ['outro', 'Outra movimentação'],
];

const OperacionalMovimentacoesPanel: React.FC<Props> = ({ equipamentos, clientes }) => {
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [codigoOpen, setCodigoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    equipamento_id: '',
    tipo: 'saida_locacao',
    cliente_destino_id: '',
    local_destino_nome: '',
    observacao: '',
  });

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('operacional_movimentacoes' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(120);
    setLoading(false);
    if (error) {
      console.warn('[operacional] movimentos:', error.message);
      setLista([]);
      return;
    }
    setLista((data as any[]) || []);
  };

  useEffect(() => { void carregar(); }, []);

  const equipamentoSelecionado = useMemo(
    () => equipamentos.find((e) => e.id === form.equipamento_id),
    [equipamentos, form.equipamento_id],
  );

  const confirmar = async (codigo: string) => {
    if (!form.equipamento_id) return toast.error('Selecione o equipamento.');
    setSaving(true);
    const { data, error } = await rpc.rpc('operacional_registrar_movimentacao', {
      p_codigo_operador: codigo,
      p_equipamento_id: form.equipamento_id,
      p_tipo: form.tipo,
      p_cliente_destino_id: form.cliente_destino_id || null,
      p_local_destino_id: null,
      p_local_destino_nome: form.local_destino_nome || null,
      p_observacao: form.observacao || null,
    });
    setSaving(false);
    if (error || !data?.ok) return toast.error(data?.error || error?.message || 'Código inválido ou movimentação não autorizada.');
    toast.success(`Movimentação registrada por ${data.operador}.`);
    setCodigoOpen(false);
    setForm({ equipamento_id: '', tipo: 'saida_locacao', cliente_destino_id: '', local_destino_nome: '', observacao: '' });
    await carregar();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-5">
        <div className="mb-4 flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /><h2 className="font-bold">Registrar movimentação</h2></div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Select value={form.equipamento_id} onValueChange={(value) => setForm((f) => ({ ...f, equipamento_id: value }))}>
            <SelectTrigger><SelectValue placeholder="Equipamento / patrimônio" /></SelectTrigger>
            <SelectContent>{equipamentos.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.ativos?.descricao || e.descricao_livre || e.patrimonio || e.placa || 'Equipamento'}
                {(e.patrimonio || e.ativos?.patrimonio) ? ` • ${e.patrimonio || e.ativos?.patrimonio}` : ''}
              </SelectItem>
            ))}</SelectContent>
          </Select>

          <Select value={form.tipo} onValueChange={(value) => setForm((f) => ({ ...f, tipo: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>

          <Select value={form.cliente_destino_id} onValueChange={(value) => setForm((f) => ({ ...f, cliente_destino_id: value }))}>
            <SelectTrigger><SelectValue placeholder="Cliente de destino (quando houver)" /></SelectTrigger>
            <SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}</SelectContent>
          </Select>

          <Input
            placeholder="Canteiro / local de destino"
            value={form.local_destino_nome}
            onChange={(event) => setForm((f) => ({ ...f, local_destino_nome: event.target.value }))}
          />

          <Textarea
            className="lg:col-span-2"
            placeholder="Observação da movimentação"
            value={form.observacao}
            onChange={(event) => setForm((f) => ({ ...f, observacao: event.target.value }))}
          />
        </div>
        {equipamentoSelecionado && (
          <p className="mt-3 text-xs text-muted-foreground">
            Selecionado: {[equipamentoSelecionado.ativos?.descricao || equipamentoSelecionado.descricao_livre, equipamentoSelecionado.patrimonio || equipamentoSelecionado.ativos?.patrimonio, equipamentoSelecionado.placa || equipamentoSelecionado.ativos?.placa].filter(Boolean).join(' • ')}
          </p>
        )}
        <Button className="mt-4" disabled={!form.equipamento_id} onClick={() => setCodigoOpen(true)}>
          <ArrowRightLeft className="mr-2 h-4 w-4" /> Confirmar movimentação
        </Button>
      </div>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 font-bold"><History className="h-5 w-5 text-primary" /> Histórico operacional</h2>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : lista.length === 0 ? (
          <div className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada neste novo histórico ainda.</div>
        ) : lista.map((m) => (
          <div key={m.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Package className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{TIPOS.find(([v]) => v === m.tipo)?.[1] || m.tipo}</p>
                <p className="text-xs text-muted-foreground">{[m.patrimonio, m.placa].filter(Boolean).join(' • ') || 'Equipamento'}</p>
                <p className="mt-1 text-sm">{[m.cliente_destino_nome, m.local_destino_nome].filter(Boolean).join(' • ') || 'Sem destino informado'}</p>
                {m.observacao && <p className="mt-1 text-xs text-muted-foreground">{m.observacao}</p>}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">{m.operador_nome}</div>
                <div>{new Date(m.created_at).toLocaleString('pt-BR')}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <OperadorCodeDialog
        open={codigoOpen}
        onOpenChange={setCodigoOpen}
        loading={saving}
        title="Confirmar movimentação"
        description="Informe seu código individual para registrar a saída, transferência ou retirada."
        onConfirm={confirmar}
      />
    </div>
  );
};

export default OperacionalMovimentacoesPanel;
