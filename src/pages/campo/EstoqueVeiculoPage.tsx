import React, { useEffect, useState } from 'react';
import { Package, Plus, Minus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useVeiculoColaborador } from '@/hooks/useVeiculoColaborador';
import { toast } from 'sonner';

interface ItemEstoque {
  id: string;
  nome_item: string;
  quantidade: number;
  unidade: string;
}

const EstoqueVeiculoPage: React.FC = () => {
  const veiculo = useVeiculoColaborador();
  const [itens, setItens] = useState<ItemEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoItem, setNovoItem] = useState('');
  const [novaQtd, setNovaQtd] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchItens = async () => {
    if (!veiculo.veiculo_id) return;
    const { data } = await supabase
      .from('estoque_veiculo')
      .select('*')
      .eq('veiculo_id', veiculo.veiculo_id)
      .order('nome_item');
    setItens((data as ItemEstoque[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!veiculo.loading) fetchItens();
  }, [veiculo.loading, veiculo.veiculo_id]);

  const addItem = async () => {
    if (!novoItem.trim() || !veiculo.veiculo_id) return;
    setAdding(true);
    const { error } = await supabase.from('estoque_veiculo').insert({
      veiculo_id: veiculo.veiculo_id,
      nome_item: novoItem.trim(),
      quantidade: Number(novaQtd) || 0,
    });
    if (error) toast.error(error.message);
    else { setNovoItem(''); setNovaQtd(''); fetchItens(); toast.success('Item adicionado'); }
    setAdding(false);
  };

  const updateQtd = async (id: string, delta: number) => {
    const item = itens.find(i => i.id === id);
    if (!item) return;
    const newQtd = Math.max(0, item.quantidade + delta);
    await supabase.from('estoque_veiculo').update({ quantidade: newQtd }).eq('id', id);
    fetchItens();
  };

  if (veiculo.loading || loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  if (!veiculo.veiculo_id) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Nenhum veículo vinculado ao seu perfil</p>
        <p className="text-xs mt-1">Solicite ao operacional a vinculação do seu veículo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold font-display text-foreground">Estoque do Carro</h2>
        <p className="text-xs text-muted-foreground">{veiculo.modelo} — {veiculo.placa}</p>
      </div>

      {/* Add item */}
      <div className="flex gap-2">
        <Input placeholder="Nome do item" value={novoItem} onChange={e => setNovoItem(e.target.value)} className="flex-1 text-sm" />
        <Input placeholder="Qtd" type="number" value={novaQtd} onChange={e => setNovaQtd(e.target.value)} className="w-16 text-sm" />
        <Button size="icon" onClick={addItem} disabled={adding}><Plus className="w-4 h-4" /></Button>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {itens.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum item cadastrado</p>
        ) : (
          itens.map(item => (
            <div key={item.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{item.nome_item}</p>
                <p className="text-xs text-muted-foreground">{item.unidade}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQtd(item.id, -1)}>
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="text-sm font-bold w-8 text-center text-foreground">{item.quantidade}</span>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQtd(item.id, 1)}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EstoqueVeiculoPage;
