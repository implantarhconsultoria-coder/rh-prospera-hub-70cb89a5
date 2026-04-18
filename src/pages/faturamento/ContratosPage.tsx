import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, FileText, Eye, Edit } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBR = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const REGRAS = [
  { v: 'mensal_fixo', l: 'Mensal fixo' }, { v: 'quinzenal', l: 'Quinzenal' }, { v: 'semanal', l: 'Semanal' },
  { v: 'diario', l: 'Diário' }, { v: 'periodo_locacao', l: 'Por período de locação' },
  { v: 'medicao', l: 'Por medição' }, { v: 'evento_os', l: 'Por evento/OS' },
  { v: 'equipamento', l: 'Por equipamento' }, { v: 'consumo', l: 'Por consumo/uso' },
];

const ContratosPage: React.FC = () => {
  const navigate = useNavigate();
  const [contratos, setContratos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ status: 'ativo', regra_faturamento: 'mensal_fixo', periodicidade: 'mensal', dia_vencimento: 10, valor_mensal: 0 });
  const [editId, setEditId] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const [ct, cl, em] = await Promise.all([
      supabase.from('contratos').select('*, clientes_fat(razao_social), empresas(nome)').order('created_at', { ascending: false }),
      supabase.from('clientes_fat').select('id, razao_social').eq('status', 'ativo').order('razao_social'),
      supabase.from('empresas').select('id, nome').eq('status', 'ativa').order('nome'),
    ]);
    setContratos(ct.data || []);
    setClientes(cl.data || []);
    setEmpresas(em.data || []);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, []);

  const filtrados = contratos.filter(c =>
    c.numero?.toLowerCase().includes(busca.toLowerCase()) ||
    c.clientes_fat?.razao_social?.toLowerCase().includes(busca.toLowerCase())
  );

  const abrirNovo = () => {
    setForm({ status: 'ativo', regra_faturamento: 'mensal_fixo', periodicidade: 'mensal', dia_vencimento: 10, valor_mensal: 0, data_inicio: new Date().toISOString().slice(0, 10) });
    setEditId(null); setOpen(true);
  };
  const abrirEdicao = (c: any) => { setForm(c); setEditId(c.id); setOpen(true); };

  const salvar = async () => {
    if (!form.numero || !form.cliente_id || !form.empresa_id || !form.data_inicio) {
      toast.error('Preencha número, cliente, empresa e data de início'); return;
    }
    const payload = {
      numero: form.numero, cliente_id: form.cliente_id, empresa_id: form.empresa_id,
      tipo: form.tipo || 'locacao', data_inicio: form.data_inicio, data_fim: form.data_fim || null,
      regra_faturamento: form.regra_faturamento, periodicidade: form.periodicidade,
      dia_vencimento: Number(form.dia_vencimento) || 10, indice_reajuste: form.indice_reajuste || 'IPCA',
      percentual_reajuste: Number(form.percentual_reajuste) || 0,
      data_base_reajuste: form.data_base_reajuste || null, proximo_reajuste: form.proximo_reajuste || null,
      valor_mensal: Number(form.valor_mensal) || 0, observacoes: form.observacoes || '', status: form.status,
    };
    if (editId) {
      const { error } = await supabase.from('contratos').update(payload).eq('id', editId);
      if (error) return toast.error(error.message);
      toast.success('Contrato atualizado');
    } else {
      const { error } = await supabase.from('contratos').insert(payload);
      if (error) return toast.error(error.message);
      toast.success('Contrato criado');
    }
    setOpen(false); carregar();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><FileText className="w-6 h-6 text-primary" /> Contratos</h1>
          <p className="text-sm text-muted-foreground">{contratos.length} contratos</p>
        </div>
        <button onClick={abrirNovo} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Novo Contrato</button>
      </div>

      <div className="card-premium p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número ou cliente..." className="bg-transparent outline-none flex-1 text-sm" />
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Nº</th>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">Empresa</th>
              <th className="text-left p-3">Início → Fim</th>
              <th className="text-left p-3">Regra</th>
              <th className="text-right p-3">Valor</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Carregando...</td></tr> :
              filtrados.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhum contrato.</td></tr> :
              filtrados.map(c => (
                <tr key={c.id} className="border-t border-border hover:bg-sidebar-accent/10">
                  <td className="p-3 font-medium">{c.numero}</td>
                  <td className="p-3">{c.clientes_fat?.razao_social || '—'}</td>
                  <td className="p-3 text-muted-foreground">{c.empresas?.nome || '—'}</td>
                  <td className="p-3 text-muted-foreground">{fmtBR(c.data_inicio)} → {fmtBR(c.data_fim)}</td>
                  <td className="p-3">{REGRAS.find(r => r.v === c.regra_faturamento)?.l || c.regra_faturamento}</td>
                  <td className="p-3 text-right">{fmtBRL(c.valor_mensal)}</td>
                  <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded-full ${c.status === 'ativo' ? 'bg-success/20 text-success' : 'bg-muted'}`}>{c.status}</span></td>
                  <td className="p-3 text-right">
                    <button onClick={() => navigate(`/admin/faturamento/contratos/${c.id}`)} className="p-1.5 hover:bg-sidebar-accent rounded mr-1"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => abrirEdicao(c)} className="p-1.5 hover:bg-sidebar-accent rounded"><Edit className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div><Label>Número *</Label><Input value={form.numero || ''} onChange={e => setForm({ ...form, numero: e.target.value })} /></div>
            <div><Label>Tipo</Label>
              <select value={form.tipo || 'locacao'} onChange={e => setForm({ ...form, tipo: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="locacao">Locação</option><option value="prestacao">Prestação de serviço</option><option value="comodato">Comodato</option><option value="venda">Venda</option>
              </select>
            </div>
            <div><Label>Cliente *</Label>
              <select value={form.cliente_id || ''} onChange={e => setForm({ ...form, cliente_id: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="">Selecione</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
              </select>
            </div>
            <div><Label>Empresa Pagadora *</Label>
              <select value={form.empresa_id || ''} onChange={e => setForm({ ...form, empresa_id: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="">Selecione</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div><Label>Data Início *</Label><Input type="date" value={form.data_inicio || ''} onChange={e => setForm({ ...form, data_inicio: e.target.value })} /></div>
            <div><Label>Data Fim</Label><Input type="date" value={form.data_fim || ''} onChange={e => setForm({ ...form, data_fim: e.target.value })} /></div>
            <div><Label>Regra de Faturamento</Label>
              <select value={form.regra_faturamento} onChange={e => setForm({ ...form, regra_faturamento: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                {REGRAS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
            </div>
            <div><Label>Periodicidade</Label>
              <select value={form.periodicidade} onChange={e => setForm({ ...form, periodicidade: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option><option value="diaria">Diária</option><option value="anual">Anual</option><option value="unica">Única</option>
              </select>
            </div>
            <div><Label>Dia de Vencimento</Label><Input type="number" min={1} max={31} value={form.dia_vencimento || 10} onChange={e => setForm({ ...form, dia_vencimento: e.target.value })} /></div>
            <div><Label>Valor Mensal (R$)</Label><Input type="number" step="0.01" value={form.valor_mensal || 0} onChange={e => setForm({ ...form, valor_mensal: e.target.value })} /></div>
            <div><Label>Índice de Reajuste</Label>
              <select value={form.indice_reajuste || 'IPCA'} onChange={e => setForm({ ...form, indice_reajuste: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="IPCA">IPCA</option><option value="IGP-M">IGP-M</option><option value="INPC">INPC</option><option value="manual">Manual</option><option value="sem_reajuste">Sem reajuste</option>
              </select>
            </div>
            <div><Label>Percentual Reajuste (%)</Label><Input type="number" step="0.01" value={form.percentual_reajuste || 0} onChange={e => setForm({ ...form, percentual_reajuste: e.target.value })} /></div>
            <div><Label>Data Base Reajuste</Label><Input type="date" value={form.data_base_reajuste || ''} onChange={e => setForm({ ...form, data_base_reajuste: e.target.value })} /></div>
            <div><Label>Próximo Reajuste</Label><Input type="date" value={form.proximo_reajuste || ''} onChange={e => setForm({ ...form, proximo_reajuste: e.target.value })} /></div>
            <div><Label>Status</Label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="ativo">Ativo</option><option value="suspenso">Suspenso</option><option value="encerrado">Encerrado</option><option value="vencido">Vencido</option>
              </select>
            </div>
            <div className="col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.observacoes || ''} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button onClick={salvar} className="btn-primary">Salvar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContratosPage;
