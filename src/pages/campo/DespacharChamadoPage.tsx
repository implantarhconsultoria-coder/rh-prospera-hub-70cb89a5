import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRightLeft, BellRing, Building2, ClipboardList, Edit2, Eye,
  EyeOff, FileText, KeyRound, Loader2, Package, Search, Send, ShieldCheck,
  User, Wrench, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { useOperatorBootstrap } from '@/hooks/useOperatorBootstrap';
import OperadorCodeDialog from '@/components/OperadorCodeDialog';
import OperadoresOperacaoPanel from '@/components/OperadoresOperacaoPanel';
import OperacionalChamadoDetailDialog from '@/components/operacional/OperacionalChamadoDetailDialog';
import OperacionalMovimentacoesPanel from '@/components/operacional/OperacionalMovimentacoesPanel';
import { toast } from 'sonner';

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};

const statusLabel: Record<string, string> = {
  pendente: 'Aguardando aceite',
  aceito: 'Aceito',
  em_deslocamento: 'A caminho',
  no_local: 'No cliente',
  em_execucao: 'Em atendimento',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const statusClass: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-800',
  aceito: 'bg-blue-100 text-blue-800',
  em_deslocamento: 'bg-violet-100 text-violet-800',
  no_local: 'bg-indigo-100 text-indigo-800',
  em_execucao: 'bg-orange-100 text-orange-800',
  em_atendimento: 'bg-orange-100 text-orange-800',
  concluido: 'bg-emerald-100 text-emerald-800',
  cancelado: 'bg-red-100 text-red-800',
};

const emptyChamadoForm = {
  colaborador_id: '',
  cliente_id: '',
  contrato_id: '',
  equipamento_id: '',
  cliente: '',
  local_servico: '',
  tipo_servico: '',
  itens_previstos: '',
  observacoes: '',
  solicitante_nome: '',
  solicitante_contato: '',
};

type Tab = 'clientes' | 'novo' | 'lista' | 'movimentacoes' | 'operadores';

const DespacharChamadoPage: React.FC = () => {
  const { session, userRoles } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = userRoles.includes('admin') || userRoles.includes('diretor_geral');
  const canBootstrapOperator = Boolean(session?.user?.id) && (isAdmin || userRoles.includes('operacional'));
  const operatorBootstrap = useOperatorBootstrap('operacional', canBootstrapOperator);

  const [tab, setTab] = useState<Tab>('clientes');
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);
  const [equipamentos, setEquipamentos] = useState<any[]>([]);
  const [chamados, setChamados] = useState<any[]>([]);
  const [adicionaisPendentes, setAdicionaisPendentes] = useState<any[]>([]);
  const [form, setForm] = useState(emptyChamadoForm);
  const [editando, setEditando] = useState<any | null>(null);
  const [editForm, setEditForm] = useState(emptyChamadoForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [codigoOpen, setCodigoOpen] = useState(false);
  const [codigoTitle, setCodigoTitle] = useState('Identificar operador');
  const [codigoDescription, setCodigoDescription] = useState('Informe seu código individual para confirmar esta operação.');
  const [codigoLoading, setCodigoLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<((codigo: string) => Promise<void>) | null>(null);

  const carregar = async () => {
    const [tec, cl, ct, eq, ch, ad] = await Promise.all([
      supabase
        .from('acessos_externos' as any)
        .select('id,nome,email,email_corporativo,empresa,filial,funcao,funcionario_id,status,acesso_liberado')
        .eq('modulo', 'mecanico')
        .eq('perfil_acesso', 'mecanico_externo')
        .eq('status', 'ativo')
        .eq('acesso_liberado', true)
        .not('funcionario_id', 'is', null)
        .order('nome'),
      supabase.from('clientes_fat').select('id, razao_social, nome_fantasia, cnpj_cpf, telefone, email, cidade, uf, endereco, status').eq('status', 'ativo').order('razao_social'),
      supabase.from('contratos').select('id, numero, cliente_id, tipo, status, data_inicio, data_fim, observacoes, clientes_fat(razao_social)').eq('status', 'ativo').order('created_at', { ascending: false }),
      supabase.from('contrato_equipamentos').select('id, contrato_id, ativo_id, descricao_livre, patrimonio, placa, status, observacao, ativos(descricao, placa, patrimonio, tipo)').eq('status', 'ativo').order('created_at', { ascending: false }),
      supabase.from('chamados').select('*').order('created_at', { ascending: false }).limit(150),
      supabase.from('chamado_adicionais' as any).select('id,chamado_id,status,visualizado_em,created_at').is('visualizado_em', null).order('created_at', { ascending: false }).limit(100),
    ]);

    if (tec.error) toast.error(tec.error.message || 'Erro ao carregar mecânicos.');
    setTecnicos(((tec.data as any[]) || []).map((t) => ({
      user_id: t.funcionario_id,
      nome_completo: t.nome,
      email: t.email_corporativo || t.email || '',
      empresa: t.empresa || '',
      filial: t.filial || '',
      funcao: t.funcao || '',
      acesso_id: t.id,
    })));
    setClientes((cl.data as any[]) || []);
    setContratos((ct.data as any[]) || []);
    setEquipamentos((eq.data as any[]) || []);
    setChamados((ch.data as any[]) || []);
    setAdicionaisPendentes(ad.error ? [] : ((ad.data as any[]) || []));
  };

  useEffect(() => { void carregar(); }, []);

  const baseClientes = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return clientes.map((cliente) => {
      const cts = contratos.filter((c) => c.cliente_id === cliente.id);
      const eqs = equipamentos.filter((e) => cts.some((c) => c.id === e.contrato_id));
      return { cliente, contratos: cts, equipamentos: eqs };
    }).filter((r) => !q || `${r.cliente.razao_social} ${r.cliente.nome_fantasia || ''} ${r.cliente.cnpj_cpf || ''}`.toLowerCase().includes(q));
  }, [clientes, contratos, equipamentos, busca]);

  const contratosCliente = contratos.filter((c) => c.cliente_id === form.cliente_id);
  const equipamentosContrato = equipamentos.filter((e) => e.contrato_id === form.contrato_id);

  const metricas = useMemo(() => ({
    novos: chamados.filter((c) => c.status === 'pendente').length,
    andamento: chamados.filter((c) => ['aceito', 'em_deslocamento', 'no_local', 'em_execucao', 'em_atendimento'].includes(c.status)).length,
    adicionais: adicionaisPendentes.length,
    concluidos: chamados.filter((c) => c.status === 'concluido').length,
  }), [chamados, adicionaisPendentes]);

  const selecionarCliente = (clienteId: string) => {
    const c = clientes.find((x) => x.id === clienteId);
    setForm((f) => ({
      ...f,
      cliente_id: clienteId,
      contrato_id: '',
      equipamento_id: '',
      cliente: c?.razao_social || '',
      local_servico: [c?.endereco, c?.cidade, c?.uf].filter(Boolean).join(' - '),
    }));
  };

  const abrirChamado = (clienteId: string) => {
    selecionarCliente(clienteId);
    setTab('novo');
  };

  const canShowProtocolo =
    location.pathname.startsWith('/admin/operacional') ||
    location.pathname.startsWith('/operacional') ||
    location.pathname.startsWith('/operacional-ext');

  const abrirProtocolo = () => {
    if (location.pathname.startsWith('/operacional-ext/')) {
      const base = location.pathname.match(/^\/operacional-ext\/[^/]+/)?.[0] || '/operacional-ext';
      navigate(`${base}/protocolo`);
      return;
    }
    navigate(location.pathname.startsWith('/operacional') ? '/operacional/protocolo' : '/admin/operacional/protocolo');
  };

  const exigirOperador = (
    action: (codigo: string) => Promise<void>,
    title: string,
    description: string,
  ) => {
    if (!session?.user?.id) {
      toast.error('Para registrar operações, faça o primeiro acesso pelo e-mail autorizado e mantenha esta estação conectada.');
      return;
    }
    setPendingAction(() => action);
    setCodigoTitle(title);
    setCodigoDescription(description);
    setCodigoOpen(true);
  };

  const confirmarCodigo = async (codigo: string) => {
    if (!pendingAction) return;
    setCodigoLoading(true);
    try {
      await pendingAction(codigo);
    } finally {
      setCodigoLoading(false);
    }
  };

  const fecharCodigo = () => {
    if (codigoLoading) return;
    setCodigoOpen(false);
    setPendingAction(null);
  };

  const enviar = () => {
    if (!form.colaborador_id || !form.cliente.trim() || !form.tipo_servico.trim() || !form.solicitante_nome.trim()) {
      toast.error('Preencha mecânico, cliente, quem solicitou e serviço solicitado.');
      return;
    }

    exigirOperador(async (codigo) => {
      setLoading(true);
      const { data, error } = await rpc.rpc('operacional_criar_chamado', {
        p_codigo_operador: codigo,
        p_colaborador_id: form.colaborador_id,
        p_cliente: form.cliente.trim(),
        p_local_servico: form.local_servico.trim(),
        p_tipo_servico: form.tipo_servico.trim(),
        p_solicitante_nome: form.solicitante_nome.trim(),
        p_solicitante_contato: form.solicitante_contato.trim() || null,
        p_cliente_id: form.cliente_id || null,
        p_cliente_local_id: null,
        p_contrato_id: form.contrato_id || null,
        p_equipamento_id: form.equipamento_id || null,
        p_itens_previstos: form.itens_previstos.trim() || null,
        p_observacoes: form.observacoes.trim() || null,
      });
      setLoading(false);
      if (error || !data?.ok) {
        toast.error(data?.error || error?.message || 'Código inválido ou chamado não autorizado.');
        return;
      }
      toast.success(`Chamado #${data.numero} enviado por ${data.operador}.`);
      setForm(emptyChamadoForm);
      setCodigoOpen(false);
      setPendingAction(null);
      await carregar();
      setTab('lista');
    }, 'Confirmar abertura do chamado', 'Informe seu código. Seu nome, data e hora ficarão registrados como responsável pela abertura.');
  };

  const nomeTecnico = (funcionarioId: string | null) =>
    tecnicos.find((t) => t.user_id === funcionarioId)?.nome_completo || '-';

  const abrirEdicao = (chamado: any) => {
    setEditando(chamado);
    setEditForm({
      colaborador_id: chamado.colaborador_id || '',
      cliente_id: chamado.cliente_id || '',
      contrato_id: chamado.contrato_id || '',
      equipamento_id: chamado.equipamento_id || '',
      cliente: chamado.cliente || '',
      local_servico: chamado.local_servico || '',
      tipo_servico: chamado.tipo_servico || '',
      itens_previstos: chamado.itens_previstos || '',
      observacoes: chamado.observacoes || '',
      solicitante_nome: chamado.solicitante_nome || '',
      solicitante_contato: chamado.solicitante_contato || '',
    });
  };

  const salvarEdicao = () => {
    if (!editando || !editForm.colaborador_id || !editForm.cliente.trim() || !editForm.tipo_servico.trim()) {
      toast.error('Preencha mecânico, cliente e serviço.');
      return;
    }

    exigirOperador(async (codigo) => {
      setSavingEdit(true);
      const { data, error } = await rpc.rpc('operacional_editar_chamado', {
        p_codigo_operador: codigo,
        p_chamado_id: editando.id,
        p_colaborador_id: editForm.colaborador_id,
        p_cliente: editForm.cliente.trim(),
        p_local_servico: editForm.local_servico.trim(),
        p_tipo_servico: editForm.tipo_servico.trim(),
        p_itens_previstos: editForm.itens_previstos.trim() || null,
        p_observacoes: editForm.observacoes.trim() || null,
      });
      setSavingEdit(false);
      if (error || !data?.ok) {
        toast.error(data?.error || error?.message || 'Código inválido ou alteração não autorizada.');
        return;
      }
      toast.success(`Chamado atualizado por ${data.operador}.`);
      setEditando(null);
      setEditForm(emptyChamadoForm);
      setCodigoOpen(false);
      setPendingAction(null);
      await carregar();
    }, 'Confirmar alteração', 'Informe seu código de operador. A alteração será registrada na linha do tempo do chamado.');
  };

  const cancelarChamado = (chamado: any) => {
    const motivo = window.prompt('Motivo do cancelamento deste chamado:')?.trim();
    if (!motivo) return;

    exigirOperador(async (codigo) => {
      const { data, error } = await rpc.rpc('operacional_cancelar_chamado', {
        p_codigo_operador: codigo,
        p_chamado_id: chamado.id,
        p_motivo: motivo,
      });
      if (error || !data?.ok) {
        toast.error(data?.error || error?.message || 'Código inválido ou cancelamento não autorizado.');
        return;
      }
      toast.success(`Chamado cancelado por ${data.operador}.`);
      setCodigoOpen(false);
      setPendingAction(null);
      await carregar();
    }, 'Confirmar cancelamento', 'O chamado não será apagado. O cancelamento, operador, data e hora ficarão no histórico.');
  };

  const selecionarContrato = (contratoId: string) => {
    setForm((f) => ({ ...f, contrato_id: contratoId, equipamento_id: '' }));
  };

  const tabs: Array<{ key: Tab; label: string; alert?: number }> = [
    { key: 'clientes', label: 'Clientes' },
    { key: 'novo', label: 'Novo chamado' },
    { key: 'lista', label: 'Chamados', alert: metricas.adicionais },
    { key: 'movimentacoes', label: 'Movimentações' },
    ...(isAdmin ? [{ key: 'operadores' as Tab, label: 'Operadores' }] : []),
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold font-display">
            <ClipboardList className="h-6 w-6 text-primary" /> Operacional
          </h1>
          <p className="text-sm text-muted-foreground">Clientes, locações, movimentações e manutenção em uma única linha operacional.</p>
        </div>
        {operatorBootstrap.operador && (
          <div className="rounded-xl border bg-card px-3 py-2 text-right">
            <div className="flex items-center justify-end gap-1 text-xs font-bold"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Estação autorizada</div>
            <div className="text-[10px] text-muted-foreground">Operações exigem código individual</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button type="button" onClick={() => setTab('lista')} className="rounded-2xl border bg-card p-4 text-left">
          <p className="text-xs text-muted-foreground">Aguardando aceite</p><strong className="mt-1 block text-2xl">{metricas.novos}</strong>
        </button>
        <button type="button" onClick={() => setTab('lista')} className="rounded-2xl border bg-card p-4 text-left">
          <p className="text-xs text-muted-foreground">Em andamento</p><strong className="mt-1 block text-2xl">{metricas.andamento}</strong>
        </button>
        <button type="button" onClick={() => setTab('lista')} className={`rounded-2xl border p-4 text-left ${metricas.adicionais ? 'border-amber-300 bg-amber-50' : 'bg-card'}`}>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><BellRing className="h-3.5 w-3.5" /> Adicionais pendentes</p><strong className="mt-1 block text-2xl">{metricas.adicionais}</strong>
        </button>
        <button type="button" onClick={() => setTab('lista')} className="rounded-2xl border bg-card p-4 text-left">
          <p className="text-xs text-muted-foreground">Concluídos</p><strong className="mt-1 block text-2xl">{metricas.concluidos}</strong>
        </button>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        {tabs.map((item) => (
          <Button key={item.key} variant={tab === item.key ? 'default' : 'ghost'} size="sm" onClick={() => setTab(item.key)} className="relative">
            {item.label}
            {!!item.alert && item.alert > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{item.alert}</span>}
          </Button>
        ))}
        {canShowProtocolo && <Button variant="ghost" size="sm" onClick={abrirProtocolo}>Protocolo</Button>}
      </div>

      {tab === 'clientes' && (
        <div className="space-y-4">
          <div className="card-premium flex items-center gap-2 p-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente..." className="flex-1 bg-transparent text-sm outline-none" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {baseClientes.map((row) => (
              <div key={row.cliente.id} className="card-premium space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold"><Building2 className="h-5 w-5 text-primary" />{row.cliente.razao_social}</h2>
                    <p className="text-xs text-muted-foreground">{row.cliente.cnpj_cpf || 'Sem CNPJ'} {row.cliente.cidade ? `- ${row.cliente.cidade}/${row.cliente.uf || ''}` : ''}</p>
                  </div>
                  <Button size="sm" onClick={() => abrirChamado(row.cliente.id)}>Abrir chamado</Button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="admin-metric-cell"><p>Contratos</p><strong>{row.contratos.length}</strong></div>
                  <div className="admin-metric-cell"><p>Equipamentos</p><strong>{row.equipamentos.length}</strong></div>
                  <div className="admin-metric-cell"><p>Valores</p><strong className="inline-flex items-center justify-center gap-1"><EyeOff className="h-3 w-3" />Oculto</strong></div>
                </div>

                <div className="space-y-2">
                  {row.equipamentos.slice(0, 6).map((eq) => (
                    <div key={eq.id} className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium"><Package className="h-4 w-4 text-primary" />{eq.ativos?.descricao || eq.descricao_livre || 'Equipamento'}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{[eq.ativos?.tipo, eq.patrimonio || eq.ativos?.patrimonio, eq.placa || eq.ativos?.placa].filter(Boolean).join(' - ') || 'Sem detalhes'}</div>
                    </div>
                  ))}
                  {row.equipamentos.length === 0 && <p className="text-sm text-muted-foreground">Sem equipamento vinculado.</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'novo' && (
        <div className="card-premium space-y-4 p-5">
          <div>
            <h2 className="font-bold">Novo chamado de manutenção</h2>
            <p className="text-xs text-muted-foreground">Registre quem pediu no cliente e depois identifique o operador TOPAC pelo código individual.</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Select value={form.cliente_id} onValueChange={selecionarCliente}>
              <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
              <SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}</SelectContent>
            </Select>

            <Select value={form.contrato_id} onValueChange={selecionarContrato} disabled={!form.cliente_id}>
              <SelectTrigger><SelectValue placeholder="Contrato / locação" /></SelectTrigger>
              <SelectContent>{contratosCliente.map((c) => <SelectItem key={c.id} value={c.id}>{c.numero} - {c.tipo}</SelectItem>)}</SelectContent>
            </Select>

            <Select value={form.equipamento_id} onValueChange={(value) => setForm((f) => ({ ...f, equipamento_id: value }))} disabled={!form.contrato_id}>
              <SelectTrigger><SelectValue placeholder="Equipamento / patrimônio" /></SelectTrigger>
              <SelectContent>{equipamentosContrato.map((e) => <SelectItem key={e.id} value={e.id}>{e.ativos?.descricao || e.descricao_livre || e.patrimonio || e.placa || 'Equipamento'}</SelectItem>)}</SelectContent>
            </Select>

            <Input placeholder="Canteiro / local do serviço" value={form.local_servico} onChange={(e) => setForm((f) => ({ ...f, local_servico: e.target.value }))} />

            <Input placeholder="Quem solicitou no cliente *" value={form.solicitante_nome} onChange={(e) => setForm((f) => ({ ...f, solicitante_nome: e.target.value }))} />
            <Input placeholder="Telefone / contato do solicitante" value={form.solicitante_contato} onChange={(e) => setForm((f) => ({ ...f, solicitante_contato: e.target.value }))} />

            <div className="lg:col-span-2">
              <Select value={form.colaborador_id} onValueChange={(value) => setForm((f) => ({ ...f, colaborador_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Enviar para qual mecânico?" /></SelectTrigger>
                <SelectContent>
                  {tecnicos.length === 0
                    ? <SelectItem value="sem-mecanico-cadastrado" disabled>Nenhum mecânico cadastrado</SelectItem>
                    : tecnicos.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.nome_completo}{t.empresa ? ` - ${t.empresa}` : ''}{t.email ? ` (${t.email})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Input className="lg:col-span-2" placeholder="Serviço solicitado / problema informado *" value={form.tipo_servico} onChange={(e) => setForm((f) => ({ ...f, tipo_servico: e.target.value }))} />
            <Textarea className="lg:col-span-2" placeholder="Itens previstos / orientações ao mecânico" value={form.itens_previstos} onChange={(e) => setForm((f) => ({ ...f, itens_previstos: e.target.value }))} rows={2} />
            <Textarea className="lg:col-span-2" placeholder="Observações internas" value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} rows={2} />
          </div>

          <Button className="h-12 w-full rounded-xl text-base font-semibold" onClick={enviar} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
            Enviar chamado para o mecânico
          </Button>
        </div>
      )}

      {tab === 'lista' && (
        <div className="space-y-3">
          {adicionaisPendentes.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
              <AlertTriangle className="h-5 w-5" />
              <div><p className="font-bold">Há {adicionaisPendentes.length} adicional(is) aguardando ciência do Operacional.</p><p className="text-xs">Abra o chamado destacado para ver o que o mecânico encontrou e utilizou.</p></div>
            </div>
          )}

          {chamados.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum chamado</p> : chamados.map((c) => {
            const temAdicional = adicionaisPendentes.some((a) => a.chamado_id === c.id);
            return (
              <div key={c.id} className={`card-premium space-y-2 p-4 ${temAdicional ? 'border-amber-300 bg-amber-50/40' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.numero ? `#${c.numero} • ` : ''}{c.cliente}</span>
                      {temAdicional && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">ADICIONAL</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{c.local_servico || 'Sem local'}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClass[c.status] || 'bg-muted text-muted-foreground'}`}>{statusLabel[c.status] || c.status}</span>
                </div>

                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="flex items-center gap-1"><Wrench className="h-3 w-3" />{c.tipo_servico || 'Sem tipo'}</div>
                  <div className="flex items-center gap-1"><User className="h-3 w-3" />Mecânico: {nomeTecnico(c.colaborador_id)}</div>
                  <div className="flex items-center gap-1"><Building2 className="h-3 w-3" />Solicitante: {c.solicitante_nome || 'registro anterior'}</div>
                  <div className="flex items-center gap-1"><KeyRound className="h-3 w-3" />Registrado por: {c.operador_abertura_nome || 'registro anterior'}</div>
                </div>

                {c.info_adicional && <div className="flex items-start gap-1 whitespace-pre-wrap text-xs text-muted-foreground"><FileText className="mt-0.5 h-3 w-3" />{c.info_adicional}</div>}

                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setDetail(c)}><Eye className="mr-1 h-4 w-4" />Histórico</Button>
                  {!['concluido', 'cancelado'].includes(c.status) && <Button size="sm" variant="outline" onClick={() => abrirEdicao(c)}><Edit2 className="mr-1 h-4 w-4" />Editar</Button>}
                  {!['concluido', 'cancelado'].includes(c.status) && <Button size="sm" variant="destructive" onClick={() => cancelarChamado(c)}><XCircle className="mr-1 h-4 w-4" />Cancelar</Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'movimentacoes' && <OperacionalMovimentacoesPanel equipamentos={equipamentos} clientes={clientes} />}
      {tab === 'operadores' && isAdmin && <OperadoresOperacaoPanel />}

      <Dialog open={!!editando} onOpenChange={(open) => { if (!open && !savingEdit) setEditando(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar chamado {editando?.numero ? `#${editando.numero}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={editForm.colaborador_id} onValueChange={(v) => setEditForm((f) => ({ ...f, colaborador_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar mecânico / técnico" /></SelectTrigger>
              <SelectContent>{tecnicos.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.nome_completo}{t.empresa ? ` - ${t.empresa}` : ''}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Cliente" value={editForm.cliente} onChange={(e) => setEditForm((f) => ({ ...f, cliente: e.target.value }))} />
            <Input placeholder="Local do serviço" value={editForm.local_servico} onChange={(e) => setEditForm((f) => ({ ...f, local_servico: e.target.value }))} />
            <Input placeholder="Serviço solicitado" value={editForm.tipo_servico} onChange={(e) => setEditForm((f) => ({ ...f, tipo_servico: e.target.value }))} />
            <Textarea placeholder="Itens previstos" value={editForm.itens_previstos} onChange={(e) => setEditForm((f) => ({ ...f, itens_previstos: e.target.value }))} rows={2} />
            <Textarea placeholder="Observações" value={editForm.observacoes} onChange={(e) => setEditForm((f) => ({ ...f, observacoes: e.target.value }))} rows={2} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button onClick={salvarEdicao} disabled={savingEdit}>
                {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar com código
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <OperadorCodeDialog
        open={codigoOpen}
        onOpenChange={(open) => { if (!open) fecharCodigo(); }}
        loading={codigoLoading}
        title={codigoTitle}
        description={codigoDescription}
        onConfirm={confirmarCodigo}
      />

      <OperacionalChamadoDetailDialog
        chamado={detail}
        open={!!detail}
        onOpenChange={(open) => { if (!open) setDetail(null); }}
        onRefresh={carregar}
      />
    </div>
  );
};

export default DespacharChamadoPage;
