import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { ArrowUpCircle, Plus, X, Search, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { registrarAcao, obterAtorAtual } from '@/lib/acoesLog';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_COLORS: Record<string, string> = {
  aberto: 'bg-primary/20 text-primary',
  parcial: 'bg-warning/20 text-warning',
  vencido: 'bg-destructive/20 text-destructive',
  pago: 'bg-success/20 text-success',
  cancelado: 'bg-muted text-muted-foreground',
};

const ContasPagarPage: React.FC = () => {
  const [titulos, setTitulos] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [centros, setCentros] = useState<any[]>([]);
  const [contas, setContas] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showBaixa, setShowBaixa] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [valorMinimo, setValorMinimo] = useState(5000);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    fornecedor_id: '', empresa_id: '', categoria_id: '', centro_custo_id: '',
    descricao: '', competencia: new Date().toISOString().slice(0, 7),
    data_vencimento: '', valor_previsto: 0, observacoes: '',
  });

  const [baixa, setBaixa] = useState({ valor: 0, data: new Date().toISOString().slice(0, 10), forma: 'pix', conta_bancaria_id: '', observacoes: '' });

  const carregar = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    await supabase.from('titulos_pagar').update({ status: 'vencido' }).in('status', ['aberto', 'parcial']).lt('data_vencimento', hoje);

    const [t, f, e, c, cc, cb, cfg] = await Promise.all([
      supabase.from('titulos_pagar').select('*, fornecedores(razao_social), empresas(nome), categorias_financeiras(nome), centros_custo(nome)').order('data_vencimento'),
      supabase.from('fornecedores').select('id, razao_social').eq('status', 'ativo'),
      supabase.from('empresas').select('id, nome'),
      supabase.from('categorias_financeiras').select('id, nome').eq('tipo', 'despesa'),
      supabase.from('centros_custo').select('id, nome, codigo').eq('status', 'ativo'),
      supabase.from('contas_bancarias').select('id, nome, banco').eq('status', 'ativa'),
      supabase.from('config_financeiro').select('valor').eq('chave', 'valor_minimo_aprovacao').single(),
    ]);
    setTitulos(t.data || []);
    setFornecedores(f.data || []);
    setEmpresas(e.data || []);
    setCategorias(c.data || []);
    setCentros(cc.data || []);
    setContas(cb.data || []);
    if (cfg.data?.valor) setValorMinimo(Number(cfg.data.valor));
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const handleCreate = async () => {
    if (!form.fornecedor_id || !form.empresa_id || !form.descricao || !form.data_vencimento || !form.valor_previsto) {
      return toast.error('Preencha fornecedor, empresa, descrição, vencimento e valor');
    }
    const requer = Number(form.valor_previsto) >= valorMinimo;
    const fornec = fornecedores.find(f => f.id === form.fornecedor_id);
    const { error } = await supabase.from('titulos_pagar').insert({
      fornecedor_id: form.fornecedor_id,
      fornecedor_nome: fornec?.razao_social || '',
      empresa_id: form.empresa_id,
      categoria_id: form.categoria_id || null,
      centro_custo_id: form.centro_custo_id || null,
      descricao: form.descricao,
      competencia: form.competencia,
      data_vencimento: form.data_vencimento,
      valor_previsto: form.valor_previsto,
      saldo: form.valor_previsto,
      observacoes: form.observacoes,
      requer_aprovacao: requer,
      status: 'aberto',
    });
    if (error) return toast.error(error.message);
    toast.success(`Título criado${requer ? ' — exige aprovação para pagamento' : ''}`);
    setShowForm(false);
    setForm({ fornecedor_id: '', empresa_id: '', categoria_id: '', centro_custo_id: '', descricao: '', competencia: new Date().toISOString().slice(0, 7), data_vencimento: '', valor_previsto: 0, observacoes: '' });
    carregar();
  };

  const aprovar = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('titulos_pagar').update({ aprovado_por: user?.id, aprovado_em: new Date().toISOString() }).eq('id', id);
    toast.success('Pagamento aprovado');
    carregar();
  };

  const abrirBaixa = (t: any) => {
    if (t.requer_aprovacao && !t.aprovado_por) return toast.error('Este título exige aprovação antes do pagamento');
    setShowBaixa(t);
    setBaixa({ valor: Number(t.saldo), data: new Date().toISOString().slice(0, 10), forma: 'pix', conta_bancaria_id: contas[0]?.id || '', observacoes: '' });
  };

  const confirmarBaixa = async () => {
    if (!showBaixa) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('nome_completo').eq('user_id', user?.id || '').single();

    const ator = await obterAtorAtual();
    const nomeAtor = ator.funcionarioNome || prof?.nome_completo || user?.email || '';
    const { data: pag, error } = await supabase.from('pagamentos').insert({
      titulo_id: showBaixa.id, data: baixa.data, valor: Number(baixa.valor),
      forma_pagamento: baixa.forma, conta_bancaria_id: baixa.conta_bancaria_id || null,
      observacoes: baixa.observacoes, user_id: user?.id, usuario_nome: nomeAtor,
    } as any).select().single();
    if (error) return toast.error(error.message);
    await registrarAcao({
      modulo: 'financeiro',
      entidade: 'titulo_pagar',
      entidadeId: showBaixa.id,
      acao: 'baixou',
      depois: { pagamento_id: (pag as any)?.id, valor: Number(baixa.valor), forma: baixa.forma },
      observacao: `Pagamento de ${showBaixa.numero || ''}`,
    }, ator);
    toast.success('Pagamento registrado');
    setShowBaixa(null);
    carregar();
  };

  const filtered = titulos.filter(t =>
    !search || `${t.descricao} ${t.fornecedores?.razao_social}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><ArrowUpCircle className="w-6 h-6 text-warning" /> Contas a Pagar</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} título(s) · aprovação obrigatória acima de {fmtBRL(valorMinimo)}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Novo Título</button>
      </div>

      <div className="card-premium p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por descrição ou fornecedor..."
          className="bg-transparent flex-1 outline-none text-sm" />
      </div>

      {loading ? <p className="text-center text-muted-foreground p-8">Carregando...</p> : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Descrição</th>
                <th className="text-left p-3">Fornecedor</th>
                <th className="text-left p-3">Empresa</th>
                <th className="text-left p-3">Vencimento</th>
                <th className="text-right p-3">Valor</th>
                <th className="text-right p-3">Saldo</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-t border-border hover:bg-sidebar-accent/10">
                  <td className="p-3">
                    {t.descricao}
                    {t.requer_aprovacao && !t.aprovado_por && <Lock className="w-3 h-3 inline ml-1 text-warning" />}
                  </td>
                  <td className="p-3 text-xs">{t.fornecedores?.razao_social}</td>
                  <td className="p-3 text-xs">{t.empresas?.nome}</td>
                  <td className="p-3">{t.data_vencimento}</td>
                  <td className="p-3 text-right">{fmtBRL(t.valor_previsto)}</td>
                  <td className="p-3 text-right font-semibold">{fmtBRL(t.saldo)}</td>
                  <td className="p-3 text-center">
                    <span className={`text-[10px] px-2 py-1 rounded-full ${STATUS_COLORS[t.status]}`}>{t.status.toUpperCase()}</span>
                  </td>
                  <td className="p-3 text-center space-x-1">
                    {t.requer_aprovacao && !t.aprovado_por && (
                      <button onClick={() => aprovar(t.id)} className="btn-secondary text-xs px-2 py-1">Aprovar</button>
                    )}
                    {t.status !== 'pago' && t.status !== 'cancelado' && (
                      <button onClick={() => abrirBaixa(t)} className="btn-primary text-xs px-2 py-1">Pagar</button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum título.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold font-display">Novo Título a Pagar</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Fornecedor *</label>
                  <select value={form.fornecedor_id} onChange={e => setForm({ ...form, fornecedor_id: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="">Selecione...</option>
                    {fornecedores.map(f => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Empresa *</label>
                  <select value={form.empresa_id} onChange={e => setForm({ ...form, empresa_id: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="">Selecione...</option>
                    {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Descrição *</label>
                <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Categoria</label>
                  <select value={form.categoria_id} onChange={e => setForm({ ...form, categoria_id: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="">—</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Centro de Custo</label>
                  <select value={form.centro_custo_id} onChange={e => setForm({ ...form, centro_custo_id: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="">—</option>
                    {centros.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Competência</label>
                  <input type="month" value={form.competencia} onChange={e => setForm({ ...form, competencia: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Vencimento *</label>
                  <input type="date" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Valor *</label>
                  <input type="number" step="0.01" value={form.valor_previsto} onChange={e => setForm({ ...form, valor_previsto: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
              </div>
              {Number(form.valor_previsto) >= valorMinimo && (
                <div className="bg-warning/10 border border-warning/30 rounded-md p-3 text-xs text-warning flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Acima de {fmtBRL(valorMinimo)} — exigirá aprovação antes do pagamento.
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={handleCreate} className="btn-primary">Criar</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showBaixa && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold font-display">Pagar Título</h2>
              <button onClick={() => setShowBaixa(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-muted/30 p-3 rounded-md text-sm">
                <p><strong>{showBaixa.descricao}</strong></p>
                <p className="text-xs text-muted-foreground">{showBaixa.fornecedores?.razao_social} · saldo {fmtBRL(showBaixa.saldo)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="0.01" value={baixa.valor} onChange={e => setBaixa({ ...baixa, valor: Number(e.target.value) })}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="Valor" />
                <input type="date" value={baixa.data} onChange={e => setBaixa({ ...baixa, data: e.target.value })}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm" />
              </div>
              <select value={baixa.forma} onChange={e => setBaixa({ ...baixa, forma: e.target.value })}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                <option value="pix">PIX</option><option value="boleto">Boleto</option><option value="ted">TED</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
              <select value={baixa.conta_bancaria_id} onChange={e => setBaixa({ ...baixa, conta_bancaria_id: e.target.value })}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                <option value="">— sem conta —</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <textarea value={baixa.observacoes} onChange={e => setBaixa({ ...baixa, observacoes: e.target.value })} rows={2}
                placeholder="Observações" className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowBaixa(null)} className="btn-secondary">Cancelar</button>
                <button onClick={confirmarBaixa} className="btn-primary">Confirmar Pagamento</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ContasPagarPage;
