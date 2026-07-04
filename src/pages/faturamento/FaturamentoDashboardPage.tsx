import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';
import Dn4ImportPanel from '@/components/Dn4ImportPanel';
import Dn4OperationalFlowPanel from '@/components/Dn4OperationalFlowPanel';
import TopacCentralDashboard from '@/components/TopacCentralDashboard';
import '@/styles/faturamento-dn4.css';

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const normalize = (value?: string | null) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const digits = (value?: string | null) => String(value || '').replace(/\D/g, '');
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

type ConsultaCliente = {
  codigo: string;
  nome: string;
  documento: string;
  cidade: string;
  status: string;
};

const consultaInicial: ConsultaCliente = { codigo: '', nome: '', documento: '', cidade: '', status: '' };

const FaturamentoDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const ext = useAcessoExternoFiltro();

  const [loading, setLoading] = useState(true);
  const [painelKpis, setPainelKpis] = useState<any>(null);
  const [clientesDn4, setClientesDn4] = useState<any[]>([]);
  const [contratosDn4, setContratosDn4] = useState<any[]>([]);
  const [faturasDn4, setFaturasDn4] = useState<any[]>([]);
  const [equipamentosDn4, setEquipamentosDn4] = useState<any[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [consulta, setConsulta] = useState<ConsultaCliente>(consultaInicial);
  const [stats, setStats] = useState({
    previsto: 0,
    emitido: 0,
    pago: 0,
    vencidos: 0,
    aVencer: 0,
    pendencias: 0,
    reajustesProximos: 0,
  });
  const [porEmpresa, setPorEmpresa] = useState<Array<{ nome: string; total: number }>>([]);
  const [topClientes, setTopClientes] = useState<Array<{ razao_social: string; total: number }>>([]);

  const portalBase = location.pathname.match(/^\/faturamento-ext\/[^/]+/)?.[0]
    || (location.pathname.startsWith('/faturamento') ? '/faturamento' : '/admin/faturamento');
  const fatPath = (path = '') => `${portalBase}${path}`;
  const go = (path = '') => navigate(fatPath(path));

  const clientesOrdenados = useMemo(() => (
    [...clientesDn4].sort((a, b) => String(a.razao_social || '').localeCompare(String(b.razao_social || ''), 'pt-BR'))
  ), [clientesDn4]);

  const clientesFiltrados = useMemo(() => (
    clientesOrdenados.filter((cliente) => {
      const codigo = String(cliente.id || '').slice(0, 8).toUpperCase();
      if (consulta.codigo && !normalize(codigo).includes(normalize(consulta.codigo))) return false;
      if (consulta.nome && !normalize(`${cliente.razao_social || ''} ${cliente.nome_fantasia || ''}`).includes(normalize(consulta.nome))) return false;
      if (consulta.documento && !digits(cliente.cnpj_cpf).includes(digits(consulta.documento))) return false;
      if (consulta.cidade && !normalize(`${cliente.cidade || ''} ${cliente.uf || ''}`).includes(normalize(consulta.cidade))) return false;
      if (consulta.status && normalize(cliente.status) !== normalize(consulta.status)) return false;
      return true;
    })
  ), [clientesOrdenados, consulta]);

  const clienteSelecionado = useMemo(() => (
    clientesOrdenados.find(cliente => cliente.id === selectedClienteId)
    || clientesFiltrados[0]
    || clientesOrdenados.find(cliente => cliente.status === 'ativo')
    || clientesOrdenados[0]
    || null
  ), [clientesFiltrados, clientesOrdenados, selectedClienteId]);

  useEffect(() => {
    if (!selectedClienteId && clientesOrdenados.length) {
      setSelectedClienteId((clientesOrdenados.find(cliente => cliente.status === 'ativo') || clientesOrdenados[0]).id);
    }
  }, [clientesOrdenados, selectedClienteId]);

  const carregar = async () => {
    setLoading(true);
    const hoje = todayISO();
    const em30 = addDaysISO(30);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const applyEmp = (q: any) => safeIds ? q.in('empresa_id', safeIds) : q;

    if (!ext.isExterno) {
      const { data: kpiData } = await supabase.rpc('dashboard_faturamento_kpis' as any);
      setPainelKpis(kpiData || null);
    } else {
      setPainelKpis(null);
    }

    const [faturas, contratos, clientes, contratoEquip, pendencias, contratosReaj, empresas] = await Promise.all([
      applyEmp(supabase.from('faturas').select('id, numero, competencia, total, status, data_vencimento, empresa_id, cliente_id, contrato_id')),
      applyEmp(supabase.from('contratos').select('id, numero, status, empresa_id, cliente_id, data_inicio, data_fim, valor_mensal, regra_faturamento, dia_vencimento, clientes_fat(razao_social, cnpj_cpf), empresas(nome)')),
      supabase.from('clientes_fat').select('*').order('razao_social'),
      supabase.from('contrato_equipamentos').select('id, status, contrato_id, valor_unitario, descricao_livre, patrimonio, placa, data_envio, data_retorno, ativos(descricao, placa, patrimonio, tipo), contratos!inner(empresa_id, cliente_id, numero)'),
      supabase.from('faturamento_pendencias').select('id').eq('status', 'aberta'),
      applyEmp(supabase.from('contratos').select('id, proximo_reajuste, empresa_id').not('proximo_reajuste', 'is', null).lte('proximo_reajuste', em30)),
      safeIds ? supabase.from('empresas').select('id, nome').in('id', safeIds) : supabase.from('empresas').select('id, nome'),
    ]);

    const faturasData = faturas.data || [];
    const contratosData = contratos.data || [];
    const clientesData = clientes.data || [];
    const equipamentosData = (contratoEquip.data || []).filter((item: any) => !safeIds || safeIds.includes(item.contratos?.empresa_id));

    setFaturasDn4(faturasData);
    setContratosDn4(contratosData);
    setClientesDn4(clientesData);
    setEquipamentosDn4(equipamentosData);

    const previsto = faturasData.filter(item => ['prevista', 'em_aberto', 'enviada'].includes(item.status)).reduce((sum, item) => sum + Number(item.total || 0), 0);
    const emitido = faturasData.filter(item => ['enviada', 'em_aberto', 'vencida', 'paga', 'parcial'].includes(item.status)).reduce((sum, item) => sum + Number(item.total || 0), 0);
    const pago = faturasData.filter(item => ['paga', 'parcial'].includes(item.status)).reduce((sum, item) => sum + Number(item.total || 0), 0);
    const vencidos = faturasData.filter(item => item.status === 'vencida' || (['em_aberto', 'enviada'].includes(item.status) && item.data_vencimento < hoje)).reduce((sum, item) => sum + Number(item.total || 0), 0);
    const aVencer = faturasData.filter(item => ['em_aberto', 'enviada'].includes(item.status) && item.data_vencimento >= hoje && item.data_vencimento <= em30).reduce((sum, item) => sum + Number(item.total || 0), 0);

    setStats({
      previsto,
      emitido,
      pago,
      vencidos,
      aVencer,
      pendencias: pendencias.data?.length || 0,
      reajustesProximos: contratosReaj.data?.length || 0,
    });

    const empMap = new Map((empresas.data || []).map(item => [item.id, item.nome]));
    const porEmp = new Map<string, number>();
    faturasData.forEach(item => {
      const nome = empMap.get(item.empresa_id) || 'Outros';
      porEmp.set(nome, (porEmp.get(nome) || 0) + Number(item.total || 0));
    });
    setPorEmpresa(Array.from(porEmp.entries()).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total));

    const clienteMap = new Map(clientesData.map(item => [item.id, item.razao_social]));
    const porCli = new Map<string, number>();
    faturasData.forEach(item => {
      const nome = clienteMap.get(item.cliente_id) || 'Outros';
      porCli.set(nome, (porCli.get(nome) || 0) + Number(item.total || 0));
    });
    setTopClientes(Array.from(porCli.entries()).map(([razao_social, total]) => ({ razao_social, total })).sort((a, b) => b.total - a.total).slice(0, 5));
    setLoading(false);
  };

  useEffect(() => {
    if (!ext.loading) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const kpis = [
    { label: 'Faturamento Previsto', value: fmtBRL(stats.previsto), icon: TrendingUp, color: 'text-cyan-200' },
    { label: 'Total Emitido', value: fmtBRL(stats.emitido), icon: FileText, color: 'text-blue-200', onClick: () => go('/faturas') },
    { label: 'Recebido', value: fmtBRL(stats.pago), icon: CheckCircle2, color: 'text-emerald-300' },
    { label: 'Vencidos', value: fmtBRL(stats.vencidos), icon: AlertTriangle, color: stats.vencidos > 0 ? 'text-rose-300' : 'text-emerald-300', onClick: () => go('/faturas?status=vencida') },
  ];

  const actions = [
    { label: 'Faturas', icon: FileText, onClick: () => go('/faturas'), tone: 'primary' as const },
    { label: 'Contratos', icon: ClipboardCheck, onClick: () => go('/contratos') },
    { label: 'Clientes', icon: Users, onClick: () => go('/clientes') },
    { label: 'Reajustes', icon: RefreshCw, onClick: () => go('/reajustes') },
    { label: 'Pendencias', icon: AlertTriangle, onClick: () => go('/pendencias') },
  ];

  const alerts = [
    stats.pendencias > 0
      ? { title: 'Pendencias', description: `${stats.pendencias} pendencias abertas no faturamento`, tone: 'danger' as const }
      : { title: 'Pendencias', description: 'Nenhuma pendencia aberta agora', tone: 'success' as const },
    stats.vencidos > 0
      ? { title: 'Faturas vencidas', description: `${fmtBRL(stats.vencidos)} precisa de tratativa`, tone: 'danger' as const }
      : { title: 'Faturas', description: 'Sem vencidos criticos no momento', tone: 'success' as const },
    { title: 'A vencer 30 dias', description: `${fmtBRL(stats.aVencer)} em acompanhamento`, tone: 'warning' as const },
    { title: 'Reajustes proximos', description: `${stats.reajustesProximos} contratos nos proximos 30 dias`, tone: stats.reajustesProximos > 0 ? 'warning' as const : 'success' as const },
  ];

  const leftPanelItems = porEmpresa.map(item => ({ title: item.nome, value: fmtBRL(item.total), meta: stats.emitido > 0 ? `${Math.round((item.total / stats.emitido) * 100)}% do emitido` : undefined }));
  const rightPanelItems = topClientes.map(item => ({ title: item.razao_social, value: fmtBRL(item.total) }));

  if (painelKpis) {
    leftPanelItems.unshift({ title: `Faturado em ${painelKpis.competencia}`, value: fmtBRL(Number(painelKpis.total_faturado_mes || 0)), meta: 'Conferencia mensal' });
    rightPanelItems.unshift({ title: 'Medicoes pendentes', value: String(painelKpis.medicoes_pendentes || 0), meta: 'Aguardando conferencia', danger: Number(painelKpis.medicoes_pendentes || 0) > 0 });
  }

  return (
    <TopacCentralDashboard
      modulo="Faturamento"
      subtitle="Painel operacional de faturamento e DN4"
      loading={loading}
      onRefresh={carregar}
      kpis={kpis}
      actions={actions}
      alerts={alerts}
      leftPanelTitle="Faturamento por Empresa"
      leftPanelItems={leftPanelItems}
      rightPanelTitle="Top Clientes"
      rightPanelItems={rightPanelItems}
      emptyLeft="Sem faturas emitidas ainda."
      emptyRight="Sem clientes faturados ainda."
      dn4Slot={(
        <div className="fat-dn4-stack">
          <div className="fat-dn4-card fat-dn4-query-card">
            <div className="fat-dn4-card-title"><Search /><span>Consulta de Cliente</span></div>
            <div className="fat-dn4-query-grid">
              <label className="fat-dn4-query-input"><span>Codigo</span><input value={consulta.codigo} onChange={event => setConsulta({ ...consulta, codigo: event.target.value })} /></label>
              <label className="fat-dn4-query-input"><span>Nome / Razao</span><input value={consulta.nome} onChange={event => setConsulta({ ...consulta, nome: event.target.value })} /></label>
              <label className="fat-dn4-query-input"><span>CNPJ</span><input value={consulta.documento} onChange={event => setConsulta({ ...consulta, documento: event.target.value })} /></label>
              <label className="fat-dn4-query-input"><span>Cidade</span><input value={consulta.cidade} onChange={event => setConsulta({ ...consulta, cidade: event.target.value })} /></label>
            </div>
            <select value={consulta.status} onChange={event => setConsulta({ ...consulta, status: event.target.value })} className="fat-dn4-status-select" aria-label="Situacao do cliente">
              <option value="">Todas as situacoes</option>
              <option value="ativo">Cliente ativo</option>
              <option value="inativo">Cliente inativo</option>
            </select>
            <div className="fat-dn4-query-actions">
              <button type="button" className="fat-dn4-query-button" onClick={() => setConsulta(consultaInicial)}>Limpar</button>
            </div>
            <div className="fat-dn4-result-list">
              {clientesFiltrados.slice(0, 6).map(cliente => (
                <button key={cliente.id} type="button" onClick={() => setSelectedClienteId(cliente.id)} className={cliente.id === clienteSelecionado?.id ? 'is-selected' : ''}>
                  <strong>{cliente.razao_social}</strong>
                  <small>{String(cliente.id || '').slice(0, 8).toUpperCase()} - {cliente.cidade || 'Sem cidade'} {cliente.uf || ''}</small>
                </button>
              ))}
              {clientesFiltrados.length === 0 && <p>Nenhum cliente encontrado com esses filtros.</p>}
            </div>
          </div>

          <Dn4OperationalFlowPanel
            cliente={clienteSelecionado}
            clientes={clientesDn4}
            contratos={contratosDn4}
            equipamentos={equipamentosDn4}
            faturas={faturasDn4}
            pendencias={stats.pendencias}
            go={go}
          />
          <Dn4ImportPanel modulo="faturamento" />
        </div>
      )}
    />
  );
};

export default FaturamentoDashboardPage;
