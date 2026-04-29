import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { ArrowDownCircle, Plus, X, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { registrarAcao, obterAtorAtual } from '@/lib/acoesLog';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_COLORS: Record<string, string> = {
  aberto: 'bg-primary/20 text-primary',
  parcial: 'bg-warning/20 text-warning',
  vencido: 'bg-destructive/20 text-destructive',
  pago: 'bg-success/20 text-success',
  cancelado: 'bg-muted text-muted-foreground',
  renegociado: 'bg-accent/30 text-accent-foreground',
};

const ContasReceberPage: React.FC = () => {
  const [titulos, setTitulos] = useState<any[]>([]);
  const [contas, setContas] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showBaixa, setShowBaixa] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const [baixa, setBaixa] = useState({ valor: 0, data: new Date().toISOString().slice(0, 10), forma: 'pix', conta_bancaria_id: '', observacoes: '' });

  const carregar = async () => {
    setLoading(true);
    // Atualiza status dos vencidos
    const hoje = new Date().toISOString().slice(0, 10);
    await supabase.from('titulos_receber').update({ status: 'vencido' }).in('status', ['aberto', 'parcial']).lt('data_vencimento', hoje);

    const [t, cb] = await Promise.all([
      supabase.from('titulos_receber').select('*, clientes_fat(razao_social), contratos(numero), empresas(nome)').order('data_vencimento'),
      supabase.from('contas_bancarias').select('id, nome, banco').eq('status', 'ativa'),
    ]);
    setTitulos(t.data || []);
    setContas(cb.data || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const abrirBaixa = (t: any) => {
    setShowBaixa(t);
    setBaixa({ valor: Number(t.saldo), data: new Date().toISOString().slice(0, 10), forma: 'pix', conta_bancaria_id: contas[0]?.id || '', observacoes: '' });
  };

  const confirmarBaixa = async () => {
    if (!showBaixa) return;
    if (Number(baixa.valor) <= 0) return toast.error('Valor inválido');
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('nome_completo').eq('user_id', user?.id || '').single();

    const ator = await obterAtorAtual();
    const nomeAtor = ator.funcionarioNome || prof?.nome_completo || user?.email || '';
    const { data: rec, error } = await supabase.from('recebimentos').insert({
      titulo_id: showBaixa.id,
      data: baixa.data,
      valor: Number(baixa.valor),
      forma_pagamento: baixa.forma,
      conta_bancaria_id: baixa.conta_bancaria_id || null,
      observacoes: baixa.observacoes,
      user_id: user?.id,
      usuario_nome: nomeAtor,
    } as any).select().single();
    if (error) return toast.error(error.message);
    await registrarAcao({
      modulo: 'financeiro',
      entidade: 'titulo_receber',
      entidadeId: showBaixa.id,
      acao: 'baixou',
      depois: { recebimento_id: (rec as any)?.id, valor: Number(baixa.valor), forma: baixa.forma },
      observacao: `Baixa de ${showBaixa.numero}`,
    }, ator);
    toast.success('Baixa registrada');
    setShowBaixa(null);
    carregar();
  };

  const filtered = titulos.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (search && !`${t.numero} ${t.clientes_fat?.razao_social}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalAberto = filtered.reduce((s, t) => s + Number(t.saldo || 0), 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><ArrowDownCircle className="w-6 h-6 text-success" /> Contas a Receber</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} título(s) · saldo aberto: <span className="font-semibold text-success">{fmtBRL(totalAberto)}</span></p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="card-premium p-3 flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por número ou cliente..."
            className="bg-transparent flex-1 outline-none text-sm" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-card border border-border rounded-md px-3 text-sm">
          <option value="">Todos os status</option>
          <option value="aberto">Aberto</option><option value="vencido">Vencido</option>
          <option value="parcial">Parcial</option><option value="pago">Pago</option>
        </select>
      </div>

      {loading ? <p className="text-center text-muted-foreground p-8">Carregando...</p> : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Número</th>
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Vencimento</th>
                <th className="text-right p-3">Original</th>
                <th className="text-right p-3">Pago</th>
                <th className="text-right p-3">Saldo</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-t border-border hover:bg-sidebar-accent/10">
                  <td className="p-3 font-mono text-xs">{t.numero}</td>
                  <td className="p-3">{t.clientes_fat?.razao_social}</td>
                  <td className="p-3">{t.data_vencimento}</td>
                  <td className="p-3 text-right">{fmtBRL(t.valor_original)}</td>
                  <td className="p-3 text-right text-success">{fmtBRL(t.valor_pago)}</td>
                  <td className="p-3 text-right font-semibold">{fmtBRL(t.saldo)}</td>
                  <td className="p-3 text-center">
                    <span className={`text-[10px] px-2 py-1 rounded-full ${STATUS_COLORS[t.status]}`}>{t.status.toUpperCase()}</span>
                  </td>
                  <td className="p-3 text-center">
                    {t.status !== 'pago' && t.status !== 'cancelado' && (
                      <button onClick={() => abrirBaixa(t)} className="btn-primary text-xs px-2 py-1">Baixar</button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum título encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showBaixa && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold font-display">Baixar Título</h2>
              <button onClick={() => setShowBaixa(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-muted/30 p-3 rounded-md text-sm">
                <p><strong>{showBaixa.numero}</strong> · {showBaixa.clientes_fat?.razao_social}</p>
                <p className="text-xs text-muted-foreground">Saldo: {fmtBRL(showBaixa.saldo)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Valor *</label>
                  <input type="number" step="0.01" value={baixa.valor} onChange={e => setBaixa({ ...baixa, valor: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Data</label>
                  <input type="date" value={baixa.data} onChange={e => setBaixa({ ...baixa, data: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Forma de pagamento</label>
                <select value={baixa.forma} onChange={e => setBaixa({ ...baixa, forma: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="pix">PIX</option><option value="boleto">Boleto</option><option value="ted">TED</option>
                  <option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Conta bancária</label>
                <select value={baixa.conta_bancaria_id} onChange={e => setBaixa({ ...baixa, conta_bancaria_id: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">— sem vincular —</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.banco})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Observações</label>
                <textarea value={baixa.observacoes} onChange={e => setBaixa({ ...baixa, observacoes: e.target.value })} rows={2}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowBaixa(null)} className="btn-secondary">Cancelar</button>
                <button onClick={confirmarBaixa} className="btn-primary">Confirmar Baixa</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ContasReceberPage;
