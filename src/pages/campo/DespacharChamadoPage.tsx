import React, { useEffect, useMemo, useState } from 'react';
import { Building2, ClipboardList, EyeOff, FileText, Loader2, Package, Search, Send, User, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

const statusLabel: Record<string, string> = {
  pendente: 'Pendente',
  aceito: 'Aceito',
  em_deslocamento: 'Em deslocamento',
  no_local: 'No local',
  em_execucao: 'Em execucao',
  concluido: 'Concluido',
};

const DespacharChamadoPage: React.FC = () => {
  const { session } = useApp();
  const [tab, setTab] = useState<'clientes' | 'novo' | 'lista'>('clientes');
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);
  const [equipamentos, setEquipamentos] = useState<any[]>([]);
  const [chamados, setChamados] = useState<any[]>([]);
  const [form, setForm] = useState({
    colaborador_id: '', cliente_id: '', contrato_id: '', equipamento_id: '', cliente: '',
    local_servico: '', tipo_servico: '', itens_previstos: '', observacoes: '',
  });

  const carregar = async () => {
    const [roles, cl, ct, eq, ch] = await Promise.all([
      supabase.from('user_roles').select('user_id').eq('role', 'tecnico_campo'),
      supabase.from('clientes_fat').select('id, razao_social, nome_fantasia, cnpj_cpf, telefone, email, cidade, uf, endereco, status').eq('status', 'ativo').order('razao_social'),
      supabase.from('contratos').select('id, numero, cliente_id, tipo, status, data_inicio, data_fim, observacoes, clientes_fat(razao_social)').eq('status', 'ativo').order('created_at', { ascending: false }),
      supabase.from('contrato_equipamentos').select('id, contrato_id, descricao_livre, patrimonio, placa, status, observacao, ativos(descricao, placa, patrimonio, tipo)').eq('status', 'ativo').order('created_at', { ascending: false }),
      supabase.from('chamados').select('*').order('created_at', { ascending: false }).limit(80),
    ]);
    if (roles.data?.length) {
      const ids = roles.data.map(r => r.user_id);
      const { data } = await supabase.from('profiles').select('user_id, nome_completo, email').in('user_id', ids);
      setTecnicos(data || []);
    }
    setClientes(cl.data || []);
    setContratos(ct.data || []);
    setEquipamentos(eq.data || []);
    setChamados(ch.data || []);
  };

  useEffect(() => { carregar(); }, []);

  const baseClientes = useMemo(() => {
    const q = busca.toLowerCase();
    return clientes.map(cliente => {
      const cts = contratos.filter(c => c.cliente_id === cliente.id);
      const eqs = equipamentos.filter(e => cts.some(c => c.id === e.contrato_id));
      return { cliente, contratos: cts, equipamentos: eqs };
    }).filter(r => !q || `${r.cliente.razao_social} ${r.cliente.nome_fantasia || ''} ${r.cliente.cnpj_cpf || ''}`.toLowerCase().includes(q));
  }, [clientes, contratos, equipamentos, busca]);

  const contratosCliente = contratos.filter(c => c.cliente_id === form.cliente_id);
  const equipamentosContrato = equipamentos.filter(e => e.contrato_id === form.contrato_id);

  const selecionarCliente = (clienteId: string) => {
    const c = clientes.find(x => x.id === clienteId);
    setForm(f => ({ ...f, cliente_id: clienteId, contrato_id: '', equipamento_id: '', cliente: c?.razao_social || '', local_servico: [c?.endereco, c?.cidade, c?.uf].filter(Boolean).join(' - ') }));
  };

  const abrirChamado = (clienteId: string) => { selecionarCliente(clienteId); setTab('novo'); };

  const enviar = async () => {
    if (!form.colaborador_id || !form.cliente) return toast.error('Preencha tecnico e cliente');
    setLoading(true);
    const contrato = contratos.find(c => c.id === form.contrato_id);
    const equipamento = equipamentos.find(e => e.id === form.equipamento_id);
    const info = [
      contrato ? `Contrato: ${contrato.numero}` : null,
      equipamento ? `Equipamento: ${equipamento.ativos?.descricao || equipamento.descricao_livre || equipamento.patrimonio || equipamento.placa}` : null,
    ].filter(Boolean).join('\n');
    const { error } = await supabase.from('chamados').insert({
      colaborador_id: form.colaborador_id,
      cliente: form.cliente,
      local_servico: form.local_servico,
      tipo_servico: form.tipo_servico,
      itens_previstos: form.itens_previstos,
      observacoes: form.observacoes,
      info_adicional: info,
      criado_por: session!.user.id,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success('Chamado operacional enviado');
    setForm({ colaborador_id: '', cliente_id: '', contrato_id: '', equipamento_id: '', cliente: '', local_servico: '', tipo_servico: '', itens_previstos: '', observacoes: '' });
    carregar(); setTab('lista');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" /> Operacional</h1>
          <p className="text-sm text-muted-foreground">Clientes, equipamentos e chamados. Valores de contrato nao aparecem neste modulo.</p>
        </div>
        <div className="inline-flex rounded-lg border border-border p-1 bg-card">
          <Button variant={tab === 'clientes' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('clientes')}>Clientes</Button>
          <Button variant={tab === 'novo' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('novo')}>Novo chamado</Button>
          <Button variant={tab === 'lista' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('lista')}>Lista</Button>
        </div>
      </div>

      {tab === 'clientes' && <div className="space-y-4">
        <div className="card-premium p-3 flex items-center gap-2"><Search className="w-4 h-4 text-muted-foreground" /><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente..." className="bg-transparent outline-none flex-1 text-sm" /></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {baseClientes.map(row => <div key={row.cliente.id} className="card-premium p-5 space-y-4">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-lg flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" />{row.cliente.razao_social}</h2><p className="text-xs text-muted-foreground">{row.cliente.cnpj_cpf || 'Sem CNPJ'} {row.cliente.cidade ? `- ${row.cliente.cidade}/${row.cliente.uf || ''}` : ''}</p></div><Button size="sm" onClick={() => abrirChamado(row.cliente.id)}>Abrir chamado</Button></div>
            <div className="grid grid-cols-3 gap-2"><div className="admin-metric-cell"><p>Contratos</p><strong>{row.contratos.length}</strong></div><div className="admin-metric-cell"><p>Equipamentos</p><strong>{row.equipamentos.length}</strong></div><div className="admin-metric-cell"><p>Valores</p><strong className="inline-flex items-center justify-center gap-1"><EyeOff className="w-3 h-3" />Oculto</strong></div></div>
            <div className="space-y-2">{row.equipamentos.slice(0, 4).map(eq => <div key={eq.id} className="rounded-lg border border-border bg-muted/20 p-3 text-sm"><div className="font-medium flex items-center gap-2"><Package className="w-4 h-4 text-primary" />{eq.ativos?.descricao || eq.descricao_livre || 'Equipamento'}</div><div className="text-xs text-muted-foreground mt-1">{[eq.ativos?.tipo, eq.patrimonio || eq.ativos?.patrimonio, eq.placa || eq.ativos?.placa].filter(Boolean).join(' - ') || 'Sem detalhes'}</div></div>)}{row.equipamentos.length === 0 && <p className="text-sm text-muted-foreground">Sem equipamento vinculado.</p>}</div>
          </div>)}
        </div>
      </div>}

      {tab === 'novo' && <div className="card-premium p-5 space-y-3">
        <Select value={form.colaborador_id} onValueChange={v => setForm(f => ({ ...f, colaborador_id: v }))}><SelectTrigger><SelectValue placeholder="Selecionar mecanico / tecnico" /></SelectTrigger><SelectContent>{tecnicos.map(t => <SelectItem key={t.user_id} value={t.user_id}>{t.nome_completo} ({t.email})</SelectItem>)}</SelectContent></Select>
        <Select value={form.cliente_id} onValueChange={selecionarCliente}><SelectTrigger><SelectValue placeholder="Selecionar cliente do faturamento" /></SelectTrigger><SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}</SelectContent></Select>
        <Select value={form.contrato_id} onValueChange={v => setForm(f => ({ ...f, contrato_id: v, equipamento_id: '' }))} disabled={!form.cliente_id}><SelectTrigger><SelectValue placeholder="Selecionar contrato sem exibir valor" /></SelectTrigger><SelectContent>{contratosCliente.map(c => <SelectItem key={c.id} value={c.id}>{c.numero} - {c.tipo}</SelectItem>)}</SelectContent></Select>
        <Select value={form.equipamento_id} onValueChange={v => setForm(f => ({ ...f, equipamento_id: v }))} disabled={!form.contrato_id}><SelectTrigger><SelectValue placeholder="Selecionar equipamento / compressor" /></SelectTrigger><SelectContent>{equipamentosContrato.map(e => <SelectItem key={e.id} value={e.id}>{e.ativos?.descricao || e.descricao_livre || e.patrimonio || e.placa || 'Equipamento'}</SelectItem>)}</SelectContent></Select>
        <Input placeholder="Cliente" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} />
        <Input placeholder="Local do servico" value={form.local_servico} onChange={e => setForm(f => ({ ...f, local_servico: e.target.value }))} />
        <Input placeholder="Tipo de servico" value={form.tipo_servico} onChange={e => setForm(f => ({ ...f, tipo_servico: e.target.value }))} />
        <Textarea placeholder="Itens previstos" value={form.itens_previstos} onChange={e => setForm(f => ({ ...f, itens_previstos: e.target.value }))} rows={2} />
        <Textarea placeholder="Observacoes" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
        <Button className="w-full h-12 text-base font-semibold rounded-xl" onClick={enviar} disabled={loading}>{loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Send className="w-5 h-5 mr-2" />}Enviar chamado</Button>
      </div>}

      {tab === 'lista' && <div className="space-y-2">{chamados.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Nenhum chamado</p> : chamados.map(c => <div key={c.id} className="card-premium p-4 space-y-1"><div className="flex justify-between items-center"><span className="font-semibold text-sm">{c.cliente}</span><span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{statusLabel[c.status] || c.status}</span></div><div className="text-xs text-muted-foreground flex items-center gap-1"><Wrench className="w-3 h-3" />{c.tipo_servico || 'Sem tipo'}</div><div className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />{tecnicos.find(t => t.user_id === c.colaborador_id)?.nome_completo || '-'}</div>{c.info_adicional && <div className="text-xs text-muted-foreground flex items-start gap-1 whitespace-pre-wrap"><FileText className="w-3 h-3 mt-0.5" />{c.info_adicional}</div>}</div>)}</div>}
    </div>
  );
};

export default DespacharChamadoPage;
