import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRightLeft, BellRing, Building2, ClipboardList, Edit2, Eye,
  FileText, KeyRound, Loader2, Send, ShieldCheck, User, Wrench, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { useOperatorBootstrap } from '@/hooks/useOperatorBootstrap';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import OperadorCodeDialog from '@/components/OperadorCodeDialog';
import OperadoresOperacaoPanel from '@/components/OperadoresOperacaoPanel';
import OperacionalChamadoDetailDialog from '@/components/operacional/OperacionalChamadoDetailDialog';
import OperacionalMovimentacoesPanel from '@/components/operacional/OperacionalMovimentacoesPanel';
import OperacionalClientesPanel from '@/components/operacional/OperacionalClientesPanel';
import OperacionalDisponibilidadePlacas from '@/components/operacional/OperacionalDisponibilidadePlacas';
import OperacionalOcorrenciasHistoricoPanel from '@/components/operacional/OperacionalOcorrenciasHistoricoPanel';
import { formalizarOperacaoPorEmail } from '@/lib/operacionalFormalizacao';
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
  pendente: 'border border-amber-500/25 bg-amber-500/10 text-amber-300',
  aceito: 'border border-sky-500/25 bg-sky-500/10 text-sky-300',
  em_deslocamento: 'border border-violet-500/25 bg-violet-500/10 text-violet-300',
  no_local: 'border border-indigo-500/25 bg-indigo-500/10 text-indigo-300',
  em_execucao: 'border border-orange-500/25 bg-orange-500/10 text-orange-300',
  em_atendimento: 'border border-orange-500/25 bg-orange-500/10 text-orange-300',
  concluido: 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  cancelado: 'border border-rose-500/25 bg-rose-500/10 text-rose-300',
};

const emptyChamadoForm = {
  colaborador_id: '',
  cliente_id: '',
  contrato_id: '',
  equipamento_id: '',
  alocacao_id: '',
  cliente: '',
  local_servico: '',
  tipo_servico: '',
  itens_previstos: '',
  observacoes: '',
  solicitante_nome: '',
  solicitante_contato: '',
};

type Tab = 'clientes' | 'disponibilidade' | 'novo' | 'lista' | 'historico' | 'movimentacoes' | 'operadores';

const DespacharChamadoPage: React.FC = () => {
  const { session, userRoles } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const hasAdminRole = userRoles.includes('admin') || userRoles.includes('diretor_geral');
  const showAdminTools = hasAdminRole && location.pathname.startsWith('/admin/operacional');
  const canBootstrapOperator = Boolean(session?.user?.id) && (hasAdminRole || userRoles.includes('operacional'));
  const operatorBootstrap = useOperatorBootstrap('operacional', canBootstrapOperator);
  const { developerMode } = useDeveloperMode();

  const [tab, setTab] = useState<Tab>('clientes');
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);
  const [equipamentos, setEquipamentos] = useState<any[]>([]);
  const [locais, setLocais] = useState<any[]>([]);
  const [alocacoes, setAlocacoes] = useState<any[]>([]);
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
    const [tec, cl, ct, eq, ch, ad, lo, al] = await Promise.all([
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
      supabase.from('chamados').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('chamado_adicionais' as any).select('id,chamado_id,status,visualizado_em,created_at').is('visualizado_em', null).order('created_at', { ascending: false }).limit(100),
      supabase.from('cliente_locais_operacionais' as any).select('id,cliente_id,nome,cidade,uf,ativo').eq('ativo', true).order('nome'),
      supabase.from('operacional_alocacoes' as any).select('id,cliente_id,cliente_local_id,ativo_id,placa,patrimonio,fonte,fonte_arquivo,fonte_pagina,data_base,observacao,alerta_conferencia,ativo').eq('ativo', true).order('patrimonio'),
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
    setLocais(lo.error ? [] : ((lo.data as any[]) || []));
    setAlocacoes(al.error ? [] : ((al.data as any[]) || []));
    setChamados((ch.data as any[]) || []);
    setAdicionaisPendentes(ad.error ? [] : ((ad.data as any[]) || []));
  };

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(() => void carregar(), 10000);
    return () => window.clearInterval(timer);
  }, []);

  const alocacoesCliente = alocacoes.filter((a) => a.cliente_id === form.cliente_id && a.ativo !== false);
  const alocacaoSelecionada = alocacoes.find((a) => a.id === form.alocacao_id);


  const contratosCliente = contratos.filter((c) => c.cliente_id === form.cliente_id);
  const equipamentosContrato = equipamentos.filter((e) => e.contrato_id === form.contrato_id);

  const metricas = useMemo(() => ({
    novos: chamados.filter((c) => c.status === 'pendente').length,
    andamento: chamados.filter((c) => ['aceito', 'em_deslocamento', 'no_local', 'em_execucao', 'em_atendimento'].includes(c.status)).length,
    adicionais: adicionaisPendentes.length,
    concluidos: chamados.filter((c) => c.status === 'concluido').length,
  }), [chamados, adicionaisPendentes]);

  useEffect(() => {
    const chamadoId = new URLSearchParams(location.search).get('chamado');
    if (!chamadoId || !chamados.length) return;
    const alvo = chamados.find((item) => item.id === chamadoId);
    if (alvo) {
      setTab('lista');
      setDetail(alvo);
    }
  }, [location.search, chamados]);

  const selecionarCliente = (clienteId: string) => {
    const c = clientes.find((x) => x.id === clienteId);
    setForm((f) => ({
      ...f,
      cliente_id: clienteId,
      contrato_id: '',
      equipamento_id: '',
      alocacao_id: '',
      cliente: c?.razao_social || '',
      local_servico: [c?.endereco, c?.cidade, c?.uf].filter(Boolean).join(' - '),
    }));
  };

  const abrirChamado = (clienteId: string, alocacaoId?: string) => {
    const cliente = clientes.find((item) => item.id === clienteId);
    const alocacao = alocacaoId ? alocacoes.find((item) => item.id === alocacaoId) : null;
    const local = alocacao?.cliente_local_id ? locais.find((item) => item.id === alocacao.cliente_local_id) : null;

    setForm({
      ...emptyChamadoForm,
      cliente_id: clienteId,
      alocacao_id: alocacao?.id || '',
      cliente: cliente?.razao_social || '',
      local_servico: local?.nome || [cliente?.endereco, cliente?.cidade, cliente?.uf].filter(Boolean).join(' - '),
    });
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
    if (developerMode) {
      void action('');
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
      const { data, error } = await rpc.rpc('operacional_criar_chamado_v2', {
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
        p_alocacao_id: form.alocacao_id || null,
        p_itens_previstos: form.itens_previstos.trim() || null,
        p_observacoes: form.observacoes.trim() || null,
      });
      setLoading(false);
      if (error || !data?.ok) {
        toast.error(data?.error || error?.message || 'Código inválido ou chamado não autorizado.');
        return;
      }
      toast.success(`Ocorrência #${data.numero} enviada por ${data.operador}.`);
      try {
        await formalizarOperacaoPorEmail({ type: 'ocorrencia_aberta', id: data.id });
      } catch (mailError: any) {
        toast.warning(mailError?.message || 'Ocorrência registrada; formalização por e-mail ficou pendente.');
      }
      setForm(emptyChamadoForm);
      setCodigoOpen(false);
      setPendingAction(null);
      await carregar();
      setTab('lista');
    }, 'Confirmar abertura da ocorrência', 'Informe seu código. Seu nome, data e hora ficarão registrados como responsável pela abertura.');
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
      alocacao_id: chamado.alocacao_id || '',
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

    const motivo = window.prompt('Motivo obrigatório da alteração:')?.trim();
    if (!motivo || motivo.length < 3) {
      toast.error('A alteração só pode ser salva com o motivo registrado.');
      return;
    }

    exigirOperador(async (codigo) => {
      setSavingEdit(true);
      const { data, error } = await rpc.rpc('operacional_editar_chamado_auditado', {
        p_codigo_operador: codigo,
        p_chamado_id: editando.id,
        p_colaborador_id: editForm.colaborador_id,
        p_cliente: editForm.cliente.trim(),
        p_local_servico: editForm.local_servico.trim(),
        p_tipo_servico: editForm.tipo_servico.trim(),
        p_itens_previstos: editForm.itens_previstos.trim() || null,
        p_observacoes: editForm.observacoes.trim() || null,
        p_motivo: motivo,
      });
      setSavingEdit(false);
      if (error || !data?.ok) {
        toast.error(data?.error || error?.message || 'Código inválido ou alteração não autorizada.');
        return;
      }
      toast.success(`Ocorrência atualizada por ${data.operador}. Motivo registrado.`);
      try {
        await formalizarOperacaoPorEmail({ type: 'ocorrencia_alterada', id: editando.id });
      } catch (mailError: any) {
        toast.warning(mailError?.message || 'Alteração registrada; formalização por e-mail ficou pendente.');
      }
      setEditando(null);
      setEditForm(emptyChamadoForm);
      setCodigoOpen(false);
      setPendingAction(null);
      await carregar();
    }, 'Confirmar alteração', 'Informe seu código de operador. A alteração e o motivo ficarão preservados na linha do tempo.');
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
      toast.success(`Ocorrência cancelada por ${data.operador}.`);
      try {
        await formalizarOperacaoPorEmail({ type: 'ocorrencia_cancelada', id: chamado.id });
      } catch (mailError: any) {
        toast.warning(mailError?.message || 'Cancelamento registrado; formalização por e-mail ficou pendente.');
      }
      setCodigoOpen(false);
      setPendingAction(null);
      await carregar();
    }, 'Confirmar cancelamento', 'A ocorrência não será apagada. Motivo, operador, data e hora ficarão no histórico.');
  };

  const selecionarContrato = (contratoId: string) => {
    setForm((f) => ({ ...f, contrato_id: contratoId, equipamento_id: '' }));
  };

  const tabs: Array<{ key: Tab; label: string; alert?: number }> = [
    { key: 'clientes', label: 'Clientes' },
    { key: 'disponibilidade', label: 'Disponibilidade de placas' },
    { key: 'novo', label: 'Nova ocorrência' },
    { key: 'lista', label: 'Ocorrências', alert: metricas.adicionais },
    { key: 'historico', label: 'Histórico' },
    { key: 'movimentacoes', label: 'Movimentações' },
    ...(showAdminTools ? [{ key: 'operadores' as Tab, label: 'Operadores' }] : []),
  ];

  return (
    <div className="space-y-3 animate-fade-in text-zinc-100">
      <section className="rounded-[10px] border border-[#2c2235] bg-[#05080b] p-4 shadow-[0_12px_35px_rgba(0,0,0,.24)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-violet-400">
              <ClipboardList className="h-4 w-4 text-[#ffb400]" /> Operacional
            </div>
            <h1 className="mt-1 text-[20px] font-black tracking-[-.02em] text-white">Central da Operação</h1>
            <p className="mt-1 text-[11px] text-zinc-500">Clientes, ocorrências, movimentações e disponibilidade em um único fluxo.</p>
          </div>
          {operatorBootstrap.operador && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[.05] px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <div>
                <div className="text-[10px] font-black text-emerald-300">{developerMode ? 'Modo administrativo' : 'Estação autorizada'}</div>
                <div className="text-[9px] text-zinc-600">{developerMode ? 'Sem bloqueio de operador' : 'Código individual nas ações'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <button type="button" onClick={() => setTab('lista')} className="rounded-[9px] border border-[#2b2631] bg-[#080b10] p-3 text-left transition hover:border-violet-500/30">
            <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">Aguardando aceite</p><strong className="mt-1 block text-xl text-white">{metricas.novos}</strong>
          </button>
          <button type="button" onClick={() => setTab('lista')} className="rounded-[9px] border border-[#2b2631] bg-[#080b10] p-3 text-left transition hover:border-violet-500/30">
            <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">Em andamento</p><strong className="mt-1 block text-xl text-white">{metricas.andamento}</strong>
          </button>
          <button type="button" onClick={() => setTab('lista')} className={`rounded-[9px] border p-3 text-left transition ${metricas.adicionais ? 'border-amber-500/30 bg-amber-500/[.07]' : 'border-[#2b2631] bg-[#080b10]'}`}>
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-zinc-600"><BellRing className="h-3 w-3" /> Adicionais</p><strong className={`mt-1 block text-xl ${metricas.adicionais ? 'text-amber-300' : 'text-white'}`}>{metricas.adicionais}</strong>
          </button>
          <button type="button" onClick={() => setTab('historico')} className="rounded-[9px] border border-[#2b2631] bg-[#080b10] p-3 text-left transition hover:border-violet-500/30">
            <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">Concluídos</p><strong className="mt-1 block text-xl text-white">{metricas.concluidos}</strong>
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-1 rounded-[10px] border border-[#2c2235] bg-[#05080b] p-1.5">
        {tabs.map((item) => (
          <Button key={item.key} variant="ghost" size="sm" onClick={() => setTab(item.key)} className={`relative h-8 rounded-[7px] px-3 text-[10px] font-bold ${tab === item.key ? 'bg-violet-500/15 text-white ring-1 ring-violet-500/30' : 'text-zinc-500 hover:bg-white/[.04] hover:text-zinc-200'}`}>
            {item.label}
            {!!item.alert && item.alert > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{item.alert}</span>}
          </Button>
        ))}
        {canShowProtocolo && <Button variant="ghost" size="sm" onClick={abrirProtocolo} className="h-8 rounded-[7px] px-3 text-[10px] font-bold text-zinc-500 hover:bg-white/[.04] hover:text-zinc-200">Protocolo</Button>}
      </div>

      {tab === 'clientes' && (
        <OperacionalClientesPanel
          clientes={clientes}
          locais={locais}
          alocacoes={alocacoes}
          busca={busca}
          onBuscaChange={setBusca}
          onAbrirChamado={abrirChamado}
        />
      )}

      {tab === 'disponibilidade' && <OperacionalDisponibilidadePlacas />}

      {tab === 'novo' && (
        <div className="space-y-4 rounded-[10px] border border-[#2c2235] bg-[#05080b] p-5">
          <div>
            <h2 className="font-bold">Nova ocorrência de manutenção</h2>
            <p className="text-xs text-muted-foreground">Registre quem pediu no cliente e depois identifique o operador TOPAC pelo código individual.</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Select value={form.cliente_id} onValueChange={selecionarCliente}>
              <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
              <SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}</SelectContent>
            </Select>

            <Select
              value={form.alocacao_id}
              onValueChange={(value) => {
                const alocacao = alocacoes.find((item) => item.id === value);
                const local = alocacao?.cliente_local_id ? locais.find((item) => item.id === alocacao.cliente_local_id) : null;
                setForm((current) => ({
                  ...current,
                  alocacao_id: value,
                  local_servico: local?.nome || current.local_servico,
                }));
              }}
              disabled={!form.cliente_id || alocacoesCliente.length === 0}
            >
              <SelectTrigger><SelectValue placeholder={alocacoesCliente.length ? "Equipamento / patrimônio alocado" : "Sem alocação operacional"} /></SelectTrigger>
              <SelectContent>
                {alocacoesCliente.map((item) => {
                  const local = locais.find((l) => l.id === item.cliente_local_id);
                  return (
                    <SelectItem key={item.id} value={item.id}>
                      {[item.patrimonio, item.placa, local?.nome].filter(Boolean).join(' • ')}
                    </SelectItem>
                  );
                })}
              </SelectContent>
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
            {alocacaoSelecionada && (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground lg:col-span-2">
                Patrimônio: <b className="text-foreground">{alocacaoSelecionada.patrimonio || '—'}</b> • Placa: <b className="text-foreground">{alocacaoSelecionada.placa || '—'}</b>
                {alocacaoSelecionada.alerta_conferencia ? <span className="ml-2 font-bold text-amber-700">• Conferência pendente no cadastro</span> : null}
              </div>
            )}

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
            Enviar ocorrência para o mecânico
          </Button>
        </div>
      )}

      {tab === 'lista' && (
        <div className="space-y-3">
          {adicionaisPendentes.length > 0 && (
            <div className="flex items-center gap-3 rounded-[10px] border border-amber-500/25 bg-amber-500/[.07] p-4 text-amber-200">
              <AlertTriangle className="h-5 w-5" />
              <div><p className="font-bold">Há {adicionaisPendentes.length} adicional(is) aguardando ciência do Operacional.</p><p className="text-xs">Abra o chamado destacado para ver o que o mecânico encontrou e utilizou.</p></div>
            </div>
          )}

          {chamados.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma ocorrência</p> : chamados.map((c) => {
            const temAdicional = adicionaisPendentes.some((a) => a.chamado_id === c.id);
            return (
              <div key={c.id} className={`space-y-2 rounded-[10px] border border-[#2c2235] bg-[#05080b] p-4 transition hover:border-violet-500/25 ${temAdicional ? 'border-amber-500/30 bg-amber-500/[.05]' : ''}`}>
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
                  <Button size="sm" variant="outline" onClick={() => setDetail(c)}><Eye className="mr-1 h-4 w-4" />Detalhes</Button>
                  {!['concluido', 'cancelado'].includes(c.status) && <Button size="sm" variant="outline" onClick={() => abrirEdicao(c)}><Edit2 className="mr-1 h-4 w-4" />Editar</Button>}
                  {!['concluido', 'cancelado'].includes(c.status) && <Button size="sm" variant="destructive" onClick={() => cancelarChamado(c)}><XCircle className="mr-1 h-4 w-4" />Cancelar</Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'historico' && (
        <OperacionalOcorrenciasHistoricoPanel
          chamados={chamados}
          nomeTecnico={nomeTecnico}
          onOpenDetail={setDetail}
        />
      )}

      {tab === 'movimentacoes' && <OperacionalMovimentacoesPanel equipamentos={equipamentos} clientes={clientes} />}
      {tab === 'operadores' && showAdminTools && <OperadoresOperacaoPanel />}

      <Dialog open={!!editando} onOpenChange={(open) => { if (!open && !savingEdit) setEditando(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar ocorrência {editando?.numero ? `#${editando.numero}` : ''}</DialogTitle></DialogHeader>
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
