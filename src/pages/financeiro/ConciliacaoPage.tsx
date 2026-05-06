import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckSquare, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ConciliacaoPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const [contas, setContas] = useState<any[]>([]);
  const [contaSel, setContaSel] = useState<string>('');
  const [movs, setMovs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ext.loading) return;
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const q = safeIds
      ? supabase.from('contas_bancarias').select('id, nome, banco, empresa_id').eq('status', 'ativa').in('empresa_id', safeIds)
      : supabase.from('contas_bancarias').select('id, nome, banco').eq('status', 'ativa');
    q.then(({ data }) => {
      setContas(data || []);
      if (data?.[0]) setContaSel(data[0].id);
    });
  }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);


  useEffect(() => {
    if (!contaSel) return;
    setLoading(true);
    supabase.from('movimentacoes_bancarias').select('*').eq('conta_bancaria_id', contaSel).order('data', { ascending: false }).limit(200).then(({ data }) => {
      setMovs(data || []);
      setLoading(false);
    });
  }, [contaSel]);

  const toggleConciliacao = async (mov: any) => {
    const novo = !mov.conciliado;
    await supabase.from('movimentacoes_bancarias').update({
      conciliado: novo,
      data_conciliacao: novo ? new Date().toISOString() : null,
    }).eq('id', mov.id);
    setMovs(movs.map(m => m.id === mov.id ? { ...m, conciliado: novo } : m));
  };

  const totaisInternos = movs.filter(m => m.conciliado).reduce((s, m) => s + (m.tipo === 'entrada' ? Number(m.valor) : -Number(m.valor)), 0);
  const totalGeral = movs.reduce((s, m) => s + (m.tipo === 'entrada' ? Number(m.valor) : -Number(m.valor)), 0);
  const pendentes = movs.filter(m => !m.conciliado).length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><CheckSquare className="w-6 h-6 text-primary" /> Conciliação Bancária</h1>
          <p className="text-sm text-muted-foreground">Marque as movimentações que conferem com o extrato do banco</p>
        </div>
        <select value={contaSel} onChange={e => setContaSel(e.target.value)} className="bg-card border border-border rounded-md px-3 py-2 text-sm">
          {contas.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.banco})</option>)}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Conciliado</p><p className="text-lg font-bold text-success">{fmtBRL(totaisInternos)}</p></div>
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Total no período</p><p className="text-lg font-bold">{fmtBRL(totalGeral)}</p></div>
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Pendentes</p><p className="text-lg font-bold text-warning">{pendentes}</p></div>
      </div>

      {loading ? <p className="p-8 text-center text-muted-foreground">Carregando...</p> : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Data</th>
                <th className="text-left p-3">Descrição</th>
                <th className="text-left p-3">Tipo</th>
                <th className="text-right p-3">Valor</th>
                <th className="text-center p-3">Conciliado</th>
              </tr>
            </thead>
            <tbody>
              {movs.map(m => (
                <tr key={m.id} className={`border-t border-border ${m.conciliado ? 'bg-success/5' : ''}`}>
                  <td className="p-3 text-xs font-mono">{m.data}</td>
                  <td className="p-3 text-xs">{m.descricao}</td>
                  <td className="p-3 text-xs">{m.tipo}</td>
                  <td className={`p-3 text-right font-semibold ${m.tipo === 'entrada' ? 'text-success' : 'text-destructive'}`}>{m.tipo === 'entrada' ? '+' : '-'}{fmtBRL(m.valor)}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => toggleConciliacao(m)} className={`p-1.5 rounded ${m.conciliado ? 'bg-success/20 text-success' : 'bg-muted hover:bg-success/20'}`}>
                      {m.conciliado ? <Check className="w-4 h-4" /> : <span className="w-4 h-4 inline-block" />}
                    </button>
                  </td>
                </tr>
              ))}
              {movs.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Sem movimentações.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ConciliacaoPage;
