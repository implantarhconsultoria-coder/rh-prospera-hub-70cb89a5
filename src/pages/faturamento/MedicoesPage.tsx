import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { ClipboardCheck, Plus, X, CheckCircle2, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', em_revisao: 'Em revisão', aprovada: 'Aprovada', faturada: 'Faturada', cancelada: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-warning/20 text-warning',
  em_revisao: 'bg-primary/20 text-primary',
  aprovada: 'bg-success/20 text-success',
  faturada: 'bg-muted text-muted-foreground',
  cancelada: 'bg-destructive/20 text-destructive',
};

const MedicoesPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const [medicoes, setMedicoes] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    contrato_id: '', competencia: new Date().toISOString().slice(0, 7),
    data_inicio: '', data_fim: '', observacoes: '',
  });

  const carregar = async () => {
    setLoading(true);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const cQ = safeIds
      ? supabase.from('contratos').select('id, numero, valor_mensal, cliente_id, empresa_id, clientes_fat(razao_social)').eq('status', 'ativo').in('empresa_id', safeIds)
      : supabase.from('contratos').select('id, numero, valor_mensal, cliente_id, empresa_id, clientes_fat(razao_social)').eq('status', 'ativo');
    const mQ = safeIds
      ? supabase.from('medicoes').select('*, contratos!inner(numero, cliente_id, empresa_id, clientes_fat(razao_social))').in('contratos.empresa_id', safeIds).order('created_at', { ascending: false })
      : supabase.from('medicoes').select('*, contratos(numero, cliente_id, clientes_fat(razao_social))').order('created_at', { ascending: false });
    const [m, c] = await Promise.all([mQ, cQ]);
    setMedicoes(m.data || []);
    setContratos(c.data || []);
    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const abrirEdicao = async (med: any) => {
    setEditingId(med.id);
    const { data } = await supabase.from('medicao_itens').select('*').eq('medicao_id', med.id);
    setItens(data || []);
  };

  const adicionarItem = () => setItens([...itens, { descricao: '', quantidade: 1, valor_unitario: 0, ajuste: 0, total: 0, _new: true }]);

  const atualizarItem = (idx: number, campo: string, valor: any) => {
    const novos = [...itens];
    novos[idx] = { ...novos[idx], [campo]: valor };
    novos[idx].total = (Number(novos[idx].quantidade) * Number(novos[idx].valor_unitario)) + Number(novos[idx].ajuste || 0);
    setItens(novos);
  };

  const removerItem = (idx: number) => setItens(itens.filter((_, i) => i !== idx));

  const salvarItens = async () => {
    if (!editingId) return;
    // Apaga existentes e reinsere
    await supabase.from('medicao_itens').delete().eq('medicao_id', editingId);
    if (itens.length > 0) {
      await supabase.from('medicao_itens').insert(itens.map(it => ({
        medicao_id: editingId,
        descricao: it.descricao,
        quantidade: Number(it.quantidade),
        valor_unitario: Number(it.valor_unitario),
        ajuste: Number(it.ajuste || 0),
        total: Number(it.total),
        observacao: it.observacao || '',
      })));
    }
    const total = itens.reduce((s, it) => s + Number(it.total || 0), 0);
    await supabase.from('medicoes').update({ total }).eq('id', editingId);
    toast.success('Medição salva');
    setEditingId(null);
    carregar();
  };

  const aprovar = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('medicoes').update({ status: 'aprovada', aprovada_em: new Date().toISOString(), aprovada_por: user?.id }).eq('id', id);
    toast.success('Medição aprovada — pronta para virar fatura');
    carregar();
  };

  const gerarFatura = async (med: any) => {
    const contrato = contratos.find(c => c.id === med.contrato_id);
    if (!contrato) return toast.error('Contrato não encontrado');
    const ano = new Date().getFullYear();
    const { data: existing } = await supabase.from('faturas').select('id').like('numero', `FAT-${ano}-%`);
    const numero = `FAT-${ano}-${((existing?.length || 0) + 1).toString().padStart(4, '0')}`;
    const venc = new Date(); venc.setDate(venc.getDate() + 15);

    const { data: fat, error } = await supabase.from('faturas').insert({
      numero, cliente_id: contrato.cliente_id, contrato_id: contrato.id, empresa_id: contrato.empresa_id,
      competencia: med.competencia, data_vencimento: venc.toISOString().slice(0, 10),
      subtotal: med.total, total: med.total, medicao_id: med.id, status: 'em_aberto',
    }).select().single();
    if (error) return toast.error(error.message);

    await supabase.from('titulos_receber').insert({
      cliente_id: contrato.cliente_id, contrato_id: contrato.id, fatura_id: fat.id, empresa_id: contrato.empresa_id,
      numero, competencia: med.competencia, data_vencimento: venc.toISOString().slice(0, 10),
      valor_original: med.total, saldo: med.total, status: 'aberto',
    });

    await supabase.from('medicoes').update({ status: 'faturada', fatura_id: fat.id }).eq('id', med.id);
    toast.success(`Fatura ${numero} gerada`);
    carregar();
  };

  const handleCreate = async () => {
    if (!form.contrato_id || !form.data_inicio || !form.data_fim) return toast.error('Preencha contrato e período');
    const { error } = await supabase.from('medicoes').insert({
      contrato_id: form.contrato_id, competencia: form.competencia,
      data_inicio: form.data_inicio, data_fim: form.data_fim, observacoes: form.observacoes,
    });
    if (error) return toast.error(error.message);
    toast.success('Medição criada — agora adicione os itens');
    setShowForm(false);
    setForm({ contrato_id: '', competencia: new Date().toISOString().slice(0, 7), data_inicio: '', data_fim: '', observacoes: '' });
    carregar();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><ClipboardCheck className="w-6 h-6 text-primary" /> Medições / Apurações</h1>
          <p className="text-sm text-muted-foreground">Conferência antes da emissão da fatura</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nova Medição</button>
      </div>

      {loading ? <p className="text-center text-muted-foreground p-8">Carregando...</p> : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Contrato</th>
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Competência</th>
                <th className="text-left p-3">Período</th>
                <th className="text-right p-3">Total</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {medicoes.map(m => (
                <tr key={m.id} className="border-t border-border hover:bg-sidebar-accent/10">
                  <td className="p-3 font-mono text-xs">{m.contratos?.numero}</td>
                  <td className="p-3">{m.contratos?.clientes_fat?.razao_social}</td>
                  <td className="p-3">{m.competencia}</td>
                  <td className="p-3 text-xs">{m.data_inicio} → {m.data_fim}</td>
                  <td className="p-3 text-right font-semibold">{fmtBRL(m.total)}</td>
                  <td className="p-3 text-center">
                    <span className={`text-[10px] px-2 py-1 rounded-full ${STATUS_COLORS[m.status]}`}>{STATUS_LABELS[m.status]}</span>
                  </td>
                  <td className="p-3 text-center space-x-1">
                    {m.status === 'pendente' && (
                      <>
                        <button onClick={() => abrirEdicao(m)} className="text-xs btn-secondary px-2 py-1">Editar itens</button>
                        <button onClick={() => aprovar(m.id)} title="Aprovar" className="p-1 hover:bg-success/20 rounded text-success"><CheckCircle2 className="w-4 h-4" /></button>
                      </>
                    )}
                    {m.status === 'aprovada' && (
                      <button onClick={() => gerarFatura(m)} className="text-xs btn-primary px-2 py-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Gerar Fatura</button>
                    )}
                  </td>
                </tr>
              ))}
              {medicoes.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhuma medição.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold font-display">Nova Medição</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Contrato *</label>
                <select value={form.contrato_id} onChange={e => setForm({ ...form, contrato_id: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">Selecione...</option>
                  {contratos.map(c => <option key={c.id} value={c.id}>{c.numero} — {c.clientes_fat?.razao_social}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Competência</label>
                <input type="month" value={form.competencia} onChange={e => setForm({ ...form, competencia: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Início *</label>
                  <input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Fim *</label>
                  <input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={handleCreate} className="btn-primary">Criar</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {editingId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold font-display">Itens da Medição</h2>
              <button onClick={() => setEditingId(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              {itens.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end border-b border-border pb-3">
                  <input className="col-span-4 bg-background border border-border rounded px-2 py-1 text-sm" placeholder="Descrição" value={it.descricao} onChange={e => atualizarItem(idx, 'descricao', e.target.value)} />
                  <input type="number" step="0.01" className="col-span-2 bg-background border border-border rounded px-2 py-1 text-sm" placeholder="Qtd" value={it.quantidade} onChange={e => atualizarItem(idx, 'quantidade', e.target.value)} />
                  <input type="number" step="0.01" className="col-span-2 bg-background border border-border rounded px-2 py-1 text-sm" placeholder="Vlr Unit." value={it.valor_unitario} onChange={e => atualizarItem(idx, 'valor_unitario', e.target.value)} />
                  <input type="number" step="0.01" className="col-span-2 bg-background border border-border rounded px-2 py-1 text-sm" placeholder="Ajuste" value={it.ajuste || 0} onChange={e => atualizarItem(idx, 'ajuste', e.target.value)} />
                  <span className="col-span-1 text-xs font-semibold text-right">{fmtBRL(it.total)}</span>
                  <button onClick={() => removerItem(idx)} className="col-span-1 text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={adicionarItem} className="btn-secondary text-sm flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar item</button>
              <div className="flex justify-between items-center pt-3 border-t border-border">
                <p className="text-sm text-muted-foreground">Total: <span className="font-bold text-primary">{fmtBRL(itens.reduce((s, it) => s + Number(it.total || 0), 0))}</span></p>
                <div className="space-x-2">
                  <button onClick={() => setEditingId(null)} className="btn-secondary">Fechar</button>
                  <button onClick={salvarItens} className="btn-primary">Salvar Itens</button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default MedicoesPage;
