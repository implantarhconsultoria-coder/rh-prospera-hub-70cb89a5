import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Receipt, Plus, X, Search, FileText, Send, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-';

const STATUS_COLORS: Record<string, string> = {
  prevista: 'bg-muted text-muted-foreground',
  em_aberto: 'bg-warning/20 text-warning',
  enviada: 'bg-primary/20 text-primary',
  vencida: 'bg-destructive/20 text-destructive',
  paga: 'bg-success/20 text-success',
  parcial: 'bg-warning/30 text-warning-foreground',
  cancelada: 'bg-muted/50 text-muted-foreground line-through',
};

const STATUS_LABELS: Record<string, string> = {
  prevista: 'Prevista', em_aberto: 'Em aberto', enviada: 'Enviada',
  vencida: 'Vencida', paga: 'Paga', parcial: 'Parcial', cancelada: 'Cancelada',
};

const FaturasPage: React.FC = () => {
  const navigate = useNavigate();
  const ext = useAcessoExternoFiltro();
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';

  const [faturas, setFaturas] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    contrato_id: '', competencia: new Date().toISOString().slice(0, 7),
    data_vencimento: '', subtotal: 0, descontos: 0, acrescimos: 0,
    servico_produto: '', cnpj_emissor: '', cnpj_cliente: '',
    nota_numero: '', nota_data_emissao: '', nota_valor: 0,
    nota_pdf_url: '', nota_xml_url: '', integracao_nf_observacao: '',
    observacoes: '',
  });

  const carregar = async () => {
    setLoading(true);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const applyEmp = (q: any) => safeIds ? q.in('empresa_id', safeIds) : q;
    const [f, c, ct, e] = await Promise.all([
      applyEmp(supabase.from('faturas').select('*, clientes_fat(razao_social), contratos(numero), empresas(nome)').order('data_vencimento', { ascending: false })),
      supabase.from('clientes_fat').select('id, razao_social').eq('status', 'ativo'),
      applyEmp(supabase.from('contratos').select('id, numero, cliente_id, empresa_id, valor_mensal').eq('status', 'ativo')),
      safeIds ? supabase.from('empresas').select('id, nome').in('id', safeIds) : supabase.from('empresas').select('id, nome'),
    ]);
    setFaturas(f.data || []);
    setClientes(c.data || []);
    setContratos(ct.data || []);
    setEmpresas(e.data || []);
    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const proximoNumero = () => {
    const ano = new Date().getFullYear();
    const seq = (faturas.filter(f => f.numero?.startsWith(`FAT-${ano}`)).length + 1).toString().padStart(4, '0');
    return `FAT-${ano}-${seq}`;
  };

  const handleCreate = async () => {
    const contrato = contratos.find(c => c.id === form.contrato_id);
    if (!contrato) return toast.error('Selecione um contrato');
    if (!form.data_vencimento) return toast.error('Informe o vencimento');

    const subtotal = Number(form.subtotal) || Number(contrato.valor_mensal) || 0;
    const total = subtotal + Number(form.acrescimos) - Number(form.descontos);
    const cliente = clientes.find(c => c.id === contrato.cliente_id);

    const { data, error } = await supabase.from('faturas').insert({
      numero: proximoNumero(),
      cliente_id: contrato.cliente_id,
      contrato_id: contrato.id,
      empresa_id: contrato.empresa_id,
      competencia: form.competencia,
      data_vencimento: form.data_vencimento,
      subtotal, descontos: form.descontos, acrescimos: form.acrescimos, total,
      servico_produto: form.servico_produto,
      cnpj_emissor: form.cnpj_emissor,
      cnpj_cliente: form.cnpj_cliente,
      nota_numero: form.nota_numero,
      nota_data_emissao: form.nota_data_emissao || null,
      nota_valor: form.nota_valor || total,
      nota_pdf_url: form.nota_pdf_url,
      nota_xml_url: form.nota_xml_url,
      integracao_nf_status: form.nota_numero ? 'registrada' : 'manual',
      integracao_nf_observacao: form.integracao_nf_observacao,
      observacoes: form.observacoes,
      status: 'em_aberto',
    } as any).select().single();

    if (error) return toast.error(error.message);

    // Cria título a receber automático
    await supabase.from('titulos_receber').insert({
      cliente_id: contrato.cliente_id,
      contrato_id: contrato.id,
      fatura_id: data.id,
      empresa_id: contrato.empresa_id,
      numero: data.numero,
      competencia: form.competencia,
      data_vencimento: form.data_vencimento,
      valor_original: total,
      saldo: total,
      forma_recebimento_prevista: 'boleto',
      observacoes: cliente?.razao_social ? `Fatura ${data.numero} - ${cliente.razao_social}` : `Fatura ${data.numero}`,
      status: 'aberto',
    } as any);

    toast.success('Fatura gerada e título a receber criado');
    setShowForm(false);
    setForm({
      contrato_id: '', competencia: new Date().toISOString().slice(0, 7),
      data_vencimento: '', subtotal: 0, descontos: 0, acrescimos: 0,
      servico_produto: '', cnpj_emissor: '', cnpj_cliente: '',
      nota_numero: '', nota_data_emissao: '', nota_valor: 0,
      nota_pdf_url: '', nota_xml_url: '', integracao_nf_observacao: '',
      observacoes: '',
    });
    carregar();
  };

  const gerarPdfFatura = (f: any) => {
    const empresa = f.empresas?.nome || 'Empresa';
    const cliente = f.clientes_fat?.razao_social || 'Cliente';
    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <title>${f.numero} - ${cliente}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Arial, sans-serif; color: #111; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .muted { color: #555; font-size: 12px; }
        .box { border: 1px solid #111; padding: 10px; margin-top: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
        td, th { border: 1px solid #999; padding: 7px; text-align: left; }
        th { background: #eee; }
        .total { font-weight: 700; font-size: 16px; text-align: right; }
      </style></head><body>
      <h1>FATURA / COBRANÇA - ${f.numero}</h1>
      <div class="muted">${empresa} | Competência ${f.competencia || '-'}</div>
      <div class="box">
        <p><strong>Cliente:</strong> ${cliente}</p>
        <p><strong>Contrato:</strong> ${f.contratos?.numero || '-'}</p>
        <p><strong>Vencimento:</strong> ${fmtDate(f.data_vencimento)}</p>
        <p><strong>Status:</strong> ${STATUS_LABELS[f.status] || f.status}</p>
      </div>
      <table><thead><tr><th>Serviço / Produto</th><th>Observação</th><th>Total</th></tr></thead>
      <tbody><tr><td>${f.servico_produto || 'Serviços conforme contrato'}</td><td>${f.observacoes || '-'}</td><td>${fmtBRL(f.total)}</td></tr></tbody></table>
      <p class="total">Total: ${fmtBRL(f.total)}</p>
      <div class="box muted">
        <strong>Nota fiscal:</strong> ${f.nota_numero || 'pendente/manual'}<br/>
        <strong>Integração futura:</strong> prefeitura/API emissora será conectada neste fluxo quando liberada.
      </div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast.error('Permita pop-ups para gerar o PDF');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const marcarPaga = async (id: string) => {
    await supabase.from('faturas').update({ status: 'paga', data_pagamento: new Date().toISOString().slice(0, 10) }).eq('id', id);
    toast.success('Fatura marcada como paga');
    carregar();
  };

  const cancelar = async (id: string) => {
    if (!confirm('Cancelar esta fatura?')) return;
    await supabase.from('faturas').update({ status: 'cancelada' }).eq('id', id);
    toast.success('Fatura cancelada');
    carregar();
  };

  const filtered = faturas.filter(f => {
    if (statusFilter && f.status !== statusFilter) return false;
    if (search && !`${f.numero} ${f.clientes_fat?.razao_social} ${f.contratos?.numero}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Receipt className="w-6 h-6 text-primary" /> Faturas / Cobranças</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} fatura(s) {statusFilter && `· filtro: ${STATUS_LABELS[statusFilter]}`}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nova Fatura</button>
      </div>

      <div className="card-premium p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por número, cliente ou contrato..."
          className="bg-transparent flex-1 outline-none text-sm" />
      </div>

      {loading ? <p className="text-center text-muted-foreground p-8">Carregando...</p> : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left p-3">Número</th>
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Contrato</th>
                <th className="text-left p-3">Competência</th>
                <th className="text-left p-3">Vencimento</th>
                <th className="text-right p-3">Total</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id} className="border-t border-border hover:bg-sidebar-accent/10">
                  <td className="p-3 font-mono text-xs">{f.numero}</td>
                  <td className="p-3">{f.clientes_fat?.razao_social}</td>
                  <td className="p-3 text-xs text-muted-foreground">{f.contratos?.numero}</td>
                  <td className="p-3">{f.competencia}</td>
                  <td className="p-3">{fmtDate(f.data_vencimento)}</td>
                  <td className="p-3 text-right font-semibold">{fmtBRL(f.total)}</td>
                  <td className="p-3 text-center">
                    <span className={`text-[10px] px-2 py-1 rounded-full ${STATUS_COLORS[f.status]}`}>{STATUS_LABELS[f.status]}</span>
                  </td>
                  <td className="p-3 text-center space-x-1">
                    <button onClick={() => gerarPdfFatura(f)} title="Gerar PDF" className="p-1 hover:bg-primary/20 rounded text-primary"><FileText className="w-4 h-4" /></button>
                    {f.status !== 'paga' && f.status !== 'cancelada' && (
                      <button onClick={() => marcarPaga(f.id)} title="Marcar como paga" className="p-1 hover:bg-success/20 rounded text-success"><CheckCircle2 className="w-4 h-4" /></button>
                    )}
                    {f.status !== 'cancelada' && (
                      <button onClick={() => cancelar(f.id)} title="Cancelar" className="p-1 hover:bg-destructive/20 rounded text-destructive"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhuma fatura encontrada.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold font-display">Nova Fatura</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Contrato *</label>
                <select value={form.contrato_id} onChange={e => {
                  const c = contratos.find(ct => ct.id === e.target.value);
                  setForm({ ...form, contrato_id: e.target.value, subtotal: c?.valor_mensal || 0 });
                }} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">Selecione...</option>
                  {contratos.map(c => {
                    const cli = clientes.find(cl => cl.id === c.cliente_id);
                    return <option key={c.id} value={c.id}>{c.numero} — {cli?.razao_social || ''}</option>;
                  })}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Competência (AAAA-MM)</label>
                  <input type="month" value={form.competencia} onChange={e => setForm({ ...form, competencia: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Vencimento *</label>
                  <input type="date" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Subtotal</label>
                  <input type="number" step="0.01" value={form.subtotal} onChange={e => setForm({ ...form, subtotal: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Descontos</label>
                  <input type="number" step="0.01" value={form.descontos} onChange={e => setForm({ ...form, descontos: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Acréscimos</label>
                  <input type="number" step="0.01" value={form.acrescimos} onChange={e => setForm({ ...form, acrescimos: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Serviço / produto</label>
                <input value={form.servico_produto} onChange={e => setForm({ ...form, servico_produto: e.target.value })}
                  placeholder="Descrição do serviço, locação ou produto faturado"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="border border-border rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Nota fiscal manual / futura integração</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">CNPJ emissor</label>
                    <input value={form.cnpj_emissor} onChange={e => setForm({ ...form, cnpj_emissor: e.target.value })}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">CNPJ/CPF cliente</label>
                    <input value={form.cnpj_cliente} onChange={e => setForm({ ...form, cnpj_cliente: e.target.value })}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Número da nota</label>
                    <input value={form.nota_numero} onChange={e => setForm({ ...form, nota_numero: e.target.value })}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Data de emissão</label>
                    <input type="date" value={form.nota_data_emissao} onChange={e => setForm({ ...form, nota_data_emissao: e.target.value })}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Valor da nota</label>
                    <input type="number" step="0.01" value={form.nota_valor} onChange={e => setForm({ ...form, nota_valor: Number(e.target.value) })}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.nota_pdf_url} onChange={e => setForm({ ...form, nota_pdf_url: e.target.value })} placeholder="URL do PDF da nota"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                  <input value={form.nota_xml_url} onChange={e => setForm({ ...form, nota_xml_url: e.target.value })} placeholder="URL do XML da nota"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                </div>
                <textarea value={form.integracao_nf_observacao} onChange={e => setForm({ ...form, integracao_nf_observacao: e.target.value })} rows={2}
                  placeholder="Observação para futura integração com prefeitura/API emissora"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="bg-muted/30 p-3 rounded-md text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold text-primary font-display">{fmtBRL(Number(form.subtotal) + Number(form.acrescimos) - Number(form.descontos))}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Observações</label>
                <textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={handleCreate} className="btn-primary">Gerar Fatura</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default FaturasPage;
