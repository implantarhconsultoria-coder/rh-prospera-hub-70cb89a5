import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Landmark, Plus, X, Eye, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const BancosPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const [contas, setContas] = useState<any[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [movs, setMovs] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [vendoConta, setVendoConta] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    empresa_id: '', nome: '', banco: '', agencia: '', conta: '',
    tipo: 'corrente', saldo_inicial: 0,
  });

  const carregar = async () => {
    setLoading(true);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const cQ = safeIds ? supabase.from('contas_bancarias').select('*, empresas(nome)').in('empresa_id', safeIds).order('nome') : supabase.from('contas_bancarias').select('*, empresas(nome)').order('nome');
    const eQ = safeIds ? supabase.from('empresas').select('id, nome').in('id', safeIds) : supabase.from('empresas').select('id, nome');
    const [c, e] = await Promise.all([cQ, eQ]);
    setContas(c.data || []);
    setEmpresas(e.data || []);
    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const verExtrato = async (conta: any) => {
    setVendoConta(conta);
    const { data } = await supabase.from('movimentacoes_bancarias').select('*').eq('conta_bancaria_id', conta.id).order('data', { ascending: false }).limit(100);
    setMovs(data || []);
  };

  const salvar = async () => {
    if (!form.nome || !form.empresa_id) return toast.error('Preencha nome e empresa');
    const { error } = await supabase.from('contas_bancarias').insert({
      ...form, saldo_atual: form.saldo_inicial,
    });
    if (error) return toast.error(error.message);
    toast.success('Conta criada');
    setShowForm(false);
    setForm({ empresa_id: '', nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldo_inicial: 0 });
    carregar();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Landmark className="w-6 h-6 text-primary" /> Caixa e Bancos</h1>
          <p className="text-sm text-muted-foreground">{contas.length} conta(s) bancária(s)</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nova Conta</button>
      </div>

      {loading ? <p className="p-8 text-center text-muted-foreground">Carregando...</p> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {contas.map(c => (
            <div key={c.id} className="card-premium p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">{c.empresas?.nome}</p>
                  <h3 className="font-bold font-display">{c.nome}</h3>
                  <p className="text-xs">{c.banco} · Ag {c.agencia} · CC {c.conta}</p>
                </div>
                <button onClick={() => verExtrato(c)} className="p-1.5 hover:bg-primary/20 rounded text-primary"><Eye className="w-4 h-4" /></button>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-[10px] uppercase text-muted-foreground">Saldo atual</p>
                <p className={`text-2xl font-bold ${Number(c.saldo_atual) >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtBRL(c.saldo_atual)}</p>
              </div>
            </div>
          ))}
          {contas.length === 0 && <p className="col-span-full text-center text-muted-foreground p-8">Nenhuma conta cadastrada.</p>}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold">Nova Conta Bancária</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <select value={form.empresa_id} onChange={e => setForm({ ...form, empresa_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                <option value="">Empresa *</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              <input placeholder="Nome da conta *" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="Banco" value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} className="bg-background border border-border rounded-md px-3 py-2 text-sm" />
                <input placeholder="Agência" value={form.agencia} onChange={e => setForm({ ...form, agencia: e.target.value })} className="bg-background border border-border rounded-md px-3 py-2 text-sm" />
                <input placeholder="Conta" value={form.conta} onChange={e => setForm({ ...form, conta: e.target.value })} className="bg-background border border-border rounded-md px-3 py-2 text-sm" />
              </div>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                <option value="corrente">Conta Corrente</option><option value="poupanca">Poupança</option><option value="caixa">Caixa</option>
              </select>
              <div>
                <label className="text-xs text-muted-foreground">Saldo inicial</label>
                <input type="number" step="0.01" value={form.saldo_inicial} onChange={e => setForm({ ...form, saldo_inicial: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={salvar} className="btn-primary">Criar</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {vendoConta && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="text-lg font-bold font-display">Extrato — {vendoConta.nome}</h2>
                <p className="text-sm text-muted-foreground">Saldo atual: <span className={`font-bold ${vendoConta.saldo_atual >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtBRL(vendoConta.saldo_atual)}</span></p>
              </div>
              <button onClick={() => setVendoConta(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Descrição</th>
                    <th className="text-center p-2">Tipo</th>
                    <th className="text-right p-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {movs.map(m => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="p-2 text-xs">{m.data}</td>
                      <td className="p-2 text-xs">{m.descricao}</td>
                      <td className="p-2 text-center">
                        {m.tipo === 'entrada' ? <ArrowDownCircle className="w-4 h-4 text-success inline" /> : <ArrowUpCircle className="w-4 h-4 text-destructive inline" />}
                      </td>
                      <td className={`p-2 text-right font-semibold ${m.tipo === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                        {m.tipo === 'entrada' ? '+' : '-'}{fmtBRL(m.valor)}
                      </td>
                    </tr>
                  ))}
                  {movs.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sem movimentações.</td></tr>}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default BancosPage;
