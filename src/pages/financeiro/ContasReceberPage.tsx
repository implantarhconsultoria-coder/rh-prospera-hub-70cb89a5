import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { ArrowDownCircle, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const STATUS_COLORS: Record<string, string> = { aberto: 'bg-primary/20 text-primary', parcial: 'bg-warning/20 text-warning', vencido: 'bg-destructive/20 text-destructive', pago: 'bg-success/20 text-success', cancelado: 'bg-muted text-muted-foreground', renegociado: 'bg-accent/30 text-accent-foreground' };

const ContasReceberPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const [titulos, setTitulos] = useState<any[]>([]);
  const [contas, setContas] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showBaixa, setShowBaixa] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [baixa, setBaixa] = useState({ valor: 0, data: new Date().toISOString().slice(0, 10), forma: 'pix', conta_bancaria_id: '', observacoes: '' });

  const carregar = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const applyEmp = (q: any) => empIds !== null ? q.in('empresa_id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : q;
    await supabase.from('titulos_receber').update({ status: 'vencido' }).in('status', ['aberto', 'parcial']).lt('data_vencimento', hoje);
    const [t, cb] = await Promise.all([
      applyEmp(supabase.from('titulos_receber').select('*, clientes_fat(razao_social), contratos(numero), empresas(nome)').order('data_vencimento')),
      applyEmp(supabase.from('contas_bancarias').select('id, nome, banco, empresa_id').eq('status', 'ativa')),
    ]);
    if (t.error || cb.error) toast.error('Não foi possível carregar todos os dados financeiros.');
    setTitulos(t.data || []); setContas(cb.data || []); setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const contasDoTitulo = showBaixa ? contas.filter(c => c.empresa_id === showBaixa.empresa_id) : contas;
  const abrirBaixa = (t: any) => {
    const conta = contas.find(c => c.empresa_id === t.empresa_id);
    setShowBaixa(t);
    setBaixa({ valor: Number(t.saldo), data: new Date().toISOString().slice(0, 10), forma: 'pix', conta_bancaria_id: conta?.id || '', observacoes: '' });
  };

  const confirmarBaixa = async () => {
    if (!showBaixa || salvando) return;
    const valor = Number(baixa.valor);
    const saldo = Number(showBaixa.saldo);
    if (!Number.isFinite(valor) || valor <= 0) return toast.error('Informe um valor válido.');
    if (valor > saldo + 0.009) return toast.error(`O valor não pode ultrapassar o saldo de ${fmtBRL(saldo)}.`);
    if (!baixa.data) return toast.error('Informe a data do recebimento.');
    if (!baixa.conta_bancaria_id) return toast.error('Selecione a conta bancária que recebeu o valor.');
    const conta = contas.find(c => c.id === baixa.conta_bancaria_id);
    if (!conta || conta.empresa_id !== showBaixa.empresa_id) return toast.error('A conta bancária deve pertencer à mesma empresa do título.');

    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSalvando(false); return toast.error('Sua sessão expirou. Entre novamente.'); }
    const { data: prof } = await supabase.from('profiles').select('nome_completo').eq('user_id', user.id).maybeSingle();
    const { error } = await supabase.from('recebimentos').insert({ titulo_id: showBaixa.id, data: baixa.data, valor, forma_pagamento: baixa.forma, conta_bancaria_id: baixa.conta_bancaria_id, observacoes: baixa.observacoes.trim() || null, user_id: user.id, usuario_nome: prof?.nome_completo || user.email || 'Usuário' });
    setSalvando(false);
    if (error) return toast.error(`Baixa não registrada: ${error.message}`);
    toast.success(valor < saldo ? 'Recebimento parcial registrado.' : 'Título recebido integralmente.');
    setShowBaixa(null); carregar();
  };

  const filtered = titulos.filter(t => (!statusFilter || t.status === statusFilter) && (!search || `${t.numero} ${t.clientes_fat?.razao_social}`.toLowerCase().includes(search.toLowerCase())));
  const totalAberto = filtered.reduce((s, t) => s + Number(t.saldo || 0), 0);

  return <div className="space-y-4 animate-fade-in">
    <div><h1 className="text-2xl font-bold font-display flex items-center gap-2"><ArrowDownCircle className="w-6 h-6 text-success" /> Contas a Receber</h1><p className="text-sm text-muted-foreground">{filtered.length} título(s) · saldo aberto: <span className="font-semibold text-success">{fmtBRL(totalAberto)}</span></p></div>
    <div className="flex gap-2"><div className="card-premium p-3 flex items-center gap-2 flex-1"><Search className="w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por número ou cliente..." className="bg-transparent flex-1 outline-none text-sm" /></div><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-card border border-border rounded-md px-3 text-sm"><option value="">Todos os status</option><option value="aberto">Aberto</option><option value="vencido">Vencido</option><option value="parcial">Parcial</option><option value="pago">Pago</option></select></div>
    {loading ? <p className="text-center text-muted-foreground p-8">Carregando...</p> : <div className="card-premium overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Número</th><th className="text-left p-3">Cliente</th><th className="text-left p-3">Vencimento</th><th className="text-right p-3">Original</th><th className="text-right p-3">Pago</th><th className="text-right p-3">Saldo</th><th className="text-center p-3">Status</th><th className="text-center p-3">Ações</th></tr></thead><tbody>{filtered.map(t => <tr key={t.id} className="border-t border-border hover:bg-sidebar-accent/10"><td className="p-3 font-mono text-xs">{t.numero}</td><td className="p-3">{t.clientes_fat?.razao_social}</td><td className="p-3">{t.data_vencimento}</td><td className="p-3 text-right">{fmtBRL(t.valor_original)}</td><td className="p-3 text-right text-success">{fmtBRL(t.valor_pago)}</td><td className="p-3 text-right font-semibold">{fmtBRL(t.saldo)}</td><td className="p-3 text-center"><span className={`text-[10px] px-2 py-1 rounded-full ${STATUS_COLORS[t.status] || 'bg-muted'}`}>{t.status.toUpperCase()}</span></td><td className="p-3 text-center">{!['pago', 'cancelado'].includes(t.status) && Number(t.saldo) > 0 && <button onClick={() => abrirBaixa(t)} className="btn-primary text-xs px-2 py-1">Baixar</button>}</td></tr>)}{filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum título encontrado.</td></tr>}</tbody></table></div>}
    {showBaixa && <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><motion.div initial={{ scale: .95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-md"><div className="flex items-center justify-between p-5 border-b border-border"><h2 className="text-lg font-bold font-display">Registrar Recebimento</h2><button onClick={() => setShowBaixa(null)}><X className="w-5 h-5" /></button></div><div className="p-5 space-y-3"><div className="bg-muted/30 p-3 rounded-md text-sm"><p><strong>{showBaixa.numero}</strong> · {showBaixa.clientes_fat?.razao_social}</p><p className="text-xs text-muted-foreground">Saldo disponível: {fmtBRL(showBaixa.saldo)}</p></div><div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-muted-foreground">Valor *</label><input type="number" min="0.01" max={showBaixa.saldo} step="0.01" value={baixa.valor} onChange={e => setBaixa({ ...baixa, valor: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" /></div><div><label className="text-xs text-muted-foreground">Data *</label><input type="date" value={baixa.data} onChange={e => setBaixa({ ...baixa, data: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" /></div></div><div><label className="text-xs text-muted-foreground">Forma</label><select value={baixa.forma} onChange={e => setBaixa({ ...baixa, forma: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"><option value="pix">PIX</option><option value="boleto">Boleto</option><option value="ted">TED</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option></select></div><div><label className="text-xs text-muted-foreground">Conta bancária *</label><select value={baixa.conta_bancaria_id} onChange={e => setBaixa({ ...baixa, conta_bancaria_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"><option value="">Selecione...</option>{contasDoTitulo.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.banco})</option>)}</select></div><textarea value={baixa.observacoes} onChange={e => setBaixa({ ...baixa, observacoes: e.target.value })} rows={2} placeholder="Observações" className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" /><div className="flex justify-end gap-2 pt-2"><button onClick={() => setShowBaixa(null)} className="btn-secondary">Cancelar</button><button disabled={salvando} onClick={confirmarBaixa} className="btn-primary disabled:opacity-50">{salvando ? 'Registrando...' : 'Confirmar Baixa'}</button></div></div></motion.div></div>}
  </div>;
};

export default ContasReceberPage;
