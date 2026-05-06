import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Plus, X, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ReajustesPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const [reajustes, setReajustes] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    contrato_id: '', indice: 'IPCA', percentual: 0, observacao: '',
  });

  const carregar = async () => {
    setLoading(true);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const rQ = safeIds
      ? supabase.from('reajustes').select('*, contratos!inner(numero, valor_mensal, empresa_id, cliente_id, clientes_fat(razao_social))').in('contratos.empresa_id', safeIds).order('created_at', { ascending: false })
      : supabase.from('reajustes').select('*, contratos(numero, valor_mensal, cliente_id, clientes_fat(razao_social))').order('created_at', { ascending: false });
    const cQ = safeIds
      ? supabase.from('contratos').select('id, numero, valor_mensal, indice_reajuste, proximo_reajuste, cliente_id, empresa_id, clientes_fat(razao_social)').eq('status', 'ativo').in('empresa_id', safeIds)
      : supabase.from('contratos').select('id, numero, valor_mensal, indice_reajuste, proximo_reajuste, cliente_id, clientes_fat(razao_social)').eq('status', 'ativo');
    const [r, c] = await Promise.all([rQ, cQ]);
    setReajustes(r.data || []);
    setContratos(c.data || []);
    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const valorSimulado = () => {
    const c = contratos.find(ct => ct.id === form.contrato_id);
    if (!c) return 0;
    return Number(c.valor_mensal) * (1 + Number(form.percentual) / 100);
  };

  const aplicar = async () => {
    const c = contratos.find(ct => ct.id === form.contrato_id);
    if (!c) return toast.error('Selecione um contrato');
    if (!form.percentual) return toast.error('Informe o percentual');

    const valor_anterior = Number(c.valor_mensal);
    const valor_novo = valor_anterior * (1 + Number(form.percentual) / 100);
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('reajustes').insert({
      contrato_id: c.id, indice: form.indice, percentual: form.percentual,
      valor_anterior, valor_novo, observacao: form.observacao,
      status: 'aplicado', aplicado_por: user?.id,
    });

    // Atualiza o contrato
    const proximo = new Date(); proximo.setFullYear(proximo.getFullYear() + 1);
    await supabase.from('contratos').update({
      valor_mensal: valor_novo,
      data_base_reajuste: new Date().toISOString().slice(0, 10),
      proximo_reajuste: proximo.toISOString().slice(0, 10),
    }).eq('id', c.id);

    toast.success(`Reajuste de ${form.percentual}% aplicado`);
    setShowForm(false);
    setForm({ contrato_id: '', indice: 'IPCA', percentual: 0, observacao: '' });
    carregar();
  };

  // Próximos reajustes (30 dias)
  const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const proximos = contratos.filter(c => c.proximo_reajuste && c.proximo_reajuste <= em30);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><RefreshCw className="w-6 h-6 text-primary" /> Reajustes Contratuais</h1>
          <p className="text-sm text-muted-foreground">Histórico e aplicação de reajustes</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Aplicar Reajuste</button>
      </div>

      {proximos.length > 0 && (
        <div className="card-premium p-4 border-l-4 border-warning">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-warning" /> Reajustes próximos (30 dias)</h2>
          <ul className="text-sm space-y-1">
            {proximos.map(c => (
              <li key={c.id} className="flex justify-between">
                <span>{c.numero} — {c.clientes_fat?.razao_social}</span>
                <span className="text-warning font-semibold">{c.proximo_reajuste}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? <p className="text-center text-muted-foreground p-8">Carregando...</p> : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Data</th>
                <th className="text-left p-3">Contrato</th>
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Índice</th>
                <th className="text-right p-3">%</th>
                <th className="text-right p-3">Valor anterior</th>
                <th className="text-right p-3">Valor novo</th>
              </tr>
            </thead>
            <tbody>
              {reajustes.map(r => (
                <tr key={r.id} className="border-t border-border hover:bg-sidebar-accent/10">
                  <td className="p-3 text-xs">{r.data_aplicacao}</td>
                  <td className="p-3 font-mono text-xs">{r.contratos?.numero}</td>
                  <td className="p-3">{r.contratos?.clientes_fat?.razao_social}</td>
                  <td className="p-3"><span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">{r.indice}</span></td>
                  <td className="p-3 text-right font-semibold text-primary">{Number(r.percentual).toFixed(2)}%</td>
                  <td className="p-3 text-right text-muted-foreground">{fmtBRL(r.valor_anterior)}</td>
                  <td className="p-3 text-right font-bold">{fmtBRL(r.valor_novo)}</td>
                </tr>
              ))}
              {reajustes.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum reajuste aplicado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold font-display">Aplicar Reajuste</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Contrato *</label>
                <select value={form.contrato_id} onChange={e => setForm({ ...form, contrato_id: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">Selecione...</option>
                  {contratos.map(c => <option key={c.id} value={c.id}>{c.numero} — {c.clientes_fat?.razao_social} ({fmtBRL(c.valor_mensal)})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Índice</label>
                  <select value={form.indice} onChange={e => setForm({ ...form, indice: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option>IPCA</option><option>IGP-M</option><option>INPC</option><option>Manual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Percentual (%) *</label>
                  <input type="number" step="0.01" value={form.percentual} onChange={e => setForm({ ...form, percentual: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
              </div>
              {form.contrato_id && (
                <div className="bg-muted/30 p-3 rounded-md">
                  <p className="text-xs text-muted-foreground">Simulação</p>
                  <p className="text-sm">De <span className="line-through">{fmtBRL(contratos.find(c => c.id === form.contrato_id)?.valor_mensal || 0)}</span> para <span className="font-bold text-primary text-lg">{fmtBRL(valorSimulado())}</span></p>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">Observação</label>
                <textarea value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} rows={2}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={aplicar} className="btn-primary">Aplicar Reajuste</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ReajustesPage;
