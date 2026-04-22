import React, { useEffect, useState } from 'react';
import { Package, Plus, Minus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTecnicoApp } from '@/context/TecnicoAppContext';
import { toast } from 'sonner';

interface ItemEstoque { id: string; nome_item: string; quantidade: number; unidade: string; }

const MecanicoEstoquePage: React.FC = () => {
  const { tecnico, call } = useTecnicoApp();
  const v = tecnico.veiculos;
  const [itens, setItens] = useState<ItemEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoItem, setNovoItem] = useState('');
  const [novaQtd, setNovaQtd] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchItens = async () => {
    try { const r: any = await call('listar_estoque'); setItens(r.itens || []); }
    catch { /* noop */ }
    setLoading(false);
  };

  useEffect(() => { fetchItens(); /* eslint-disable-next-line */ }, []);

  if (!tecnico.veiculo_id || !v) {
    return (
      <div className="text-center py-12 text-white/70">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Nenhum veículo vinculado</p>
      </div>
    );
  }

  const addItem = async () => {
    if (!novoItem.trim()) return;
    setAdding(true);
    try {
      await call('estoque_add', { nome_item: novoItem.trim(), quantidade: Number(novaQtd) || 0 });
      setNovoItem(''); setNovaQtd(''); fetchItens(); toast.success('Item adicionado');
    } catch (e: any) { toast.error(e.message); }
    finally { setAdding(false); }
  };

  const updateQtd = async (id: string, delta: number) => {
    try { await call('estoque_qtd', { item_id: id, delta }); fetchItens(); }
    catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold font-display text-white">Estoque do Carro</h2>
        <p className="text-xs text-white/60">{v.modelo} — {v.placa}</p>
      </div>

      <div className="flex gap-2">
        <Input placeholder="Nome do item" value={novoItem} onChange={(e) => setNovoItem(e.target.value)} className="flex-1 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40" />
        <Input placeholder="Qtd" type="number" value={novaQtd} onChange={(e) => setNovaQtd(e.target.value)} className="w-16 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40" />
        <Button size="icon" onClick={addItem} disabled={adding}><Plus className="w-4 h-4" /></Button>
      </div>

      <div className="space-y-2">
        {itens.length === 0 ? (
          <p className="text-center text-sm text-white/60 py-8">Nenhum item cadastrado</p>
        ) : itens.map((item) => (
          <div key={item.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{item.nome_item}</p>
              <p className="text-xs text-white/50">{item.unidade}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-8 w-8 bg-white/5 border-white/10 hover:bg-white/10" onClick={() => updateQtd(item.id, -1)}>
                <Minus className="w-3 h-3" />
              </Button>
              <span className="text-sm font-bold w-8 text-center text-white">{item.quantidade}</span>
              <Button size="icon" variant="outline" className="h-8 w-8 bg-white/5 border-white/10 hover:bg-white/10" onClick={() => updateQtd(item.id, 1)}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MecanicoEstoquePage;
