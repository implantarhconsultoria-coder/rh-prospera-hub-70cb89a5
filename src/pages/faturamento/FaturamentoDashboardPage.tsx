import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, FileText, AlertTriangle, CheckCircle2, Clock, TrendingUp, Building2, Users, Package, RefreshCw, ClipboardCheck } from 'lucide-react';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';
import Dn4ImportPanel from '@/components/Dn4ImportPanel';
import TopacCentralDashboard from '@/components/TopacCentralDashboard';

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FaturamentoDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const ext = useAcessoExternoFiltro();
  const [loading, setLoading] = useState(true);
  const [painelKpis, setPainelKpis] = useState<any>(null);
  const [stats, setStats] = useState({
    previsto: 0, emitido: 0, pago: 0, vencidos: 0, aVencer: 0,
    contratosAtivos: 0, clientesAtivos: 0, equipamentosFaturando: 0,
    pendencias: 0, reajustesProximos: 0,
  });
  const [porEmpresa, setPorEmpresa] = useState<Array<{ nome: string; total: number }>>([]);
  const [topClientes, setTopClientes] = useState<Array<{ razao_social: string; total: number }>>([]);
  const portalBase = location.pathname.match(/^\/faturamento-ext\/[^/]+/)?.[0]
    || (location.pathname.startsWith('/faturamento') ? '/faturamento' : '/admin/faturamento');
  const fatPath = (path = '') => `${portalBase}${path}`;

  const carregar = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
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
      applyEmp(supabase.from('faturas').select('total, status, data_vencimento, empresa_id, cliente_id')),
      applyEmp(supabase.from('contratos').select('id, status, empresa_id')),
      supabase.from('clientes_fat').select('id, razao_social, status'),
      supabase.from('contrato_equipamentos').select('id, status, contrato_id, contratos!inner(empresa_id)'),
      supabase.from('faturamento_pendencias').select('id').eq('status', 'aberta'),
      applyEmp(supabase.from('contratos').select('id, proximo_reajuste, empresa_id').not('proximo_reajuste', 'is', null).lte('proximo_reajuste', em30)),
      safeIds ? supabase.from('empresas').select('id, nome').in('id', safeIds) : supabase.from('empresas').select('id, nome'),
    ]);

    const f = faturas.data || [];
    const previsto = f.filter(x => ['prevista', 'em_aberto', 'enviada'].includes(x.status)).reduce((s, x) => s + Number(x.total || 0), 0);
    const emitido = f.filter(x => ['enviada', 'em_aberto', 'vencida', 'paga', 'parcial'].includes(x.status)).reduce((s, x) => s + Number(x.total || 0), 0);
    const pago = f.filter(x => x.status === 'paga' || x.status === 'parcial').reduce((s, x) => s + Number(x.total || 0), 0);
    const vencidos = f.filter(x => x.status === 'vencida' || (['em_aberto', 'enviada'].includes(x.status) && x.data_vencimento < hoje)).reduce((s, x) => s + Number(x.total || 0), 0);
    const aVencer = f.filter(x => ['em_aberto', 'enviada'].includes(x.status) && x.data_vencimento >= hoje && x.data_vencimento <= em30).reduce((s, x) => s + Number(x.total || 0), 0);

    setStats({
      previsto, emitido, pago, vencidos, aVencer,
      contratosAtivos: (contratos.data || []).filter(c => c.status === 'ativo').length,
      clientesAtivos: (clientes.data || []).filter(c => c.status === 'ativo').length,
      equipamentosFaturando: (contratoEquip.data || []).filter((e: any) => e.status === 'ativo' && (!safeIds || safeIds.includes(e.contratos?.empresa_id))).length,
      pendencias: pendencias.data?.length || 0,
      reajustesProximos: contratosReaj.data?.length || 0,
    });

    const empMap = new Map((empresas.data || []).map(e => [e.id, e.nome]));
    const porEmp = new Map<string, number>();
    f.forEach(x => {
      const nome = empMap.get(x.empresa_id) || 'Outros';
      porEmp.set(nome, (porEmp.get(nome) || 0) + Number(x.total || 0));
    });
    setPorEmpresa(Array.from(porEmp.entries()).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total));

    const cliMap = new Map((clientes.data || []).map(c => [c.id, c.razao_social]));
    const porCli = new Map<string, number>();
    f.forEach(x => {
      const nome = cliMap.get(x.cliente_id) || 'Outros';
      porCli.set(nome, (porCli.get(nome) || 0) + Number(x.total || 0));
    });
    setTopClientes(Array.from(porCli.entries()).map(([razao_social, total]) => ({ razao_social, total })).sort((a, b) => b.total - a.total).slice(0, 5));

    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const kpis = [
    { label: 'Faturamento Previsto', value: fmtBRL(stats.previsto), icon: TrendingUp, color: 'text-cyan-200' },
    { label: 'Total Emitido', value: fmtBRL(stats.emitido), icon: FileText, color: 'text-blue-200', onClick: () => navigate(fatPath('/faturas')) },
    { label: 'Recebido', value: fmtBRL(stats.pago), icon: CheckCircle2, color: 'text-emerald-300' },
    { label: 'Vencidos', value: fmtBRL(stats.vencidos), icon: AlertTriangle, color: stats.vencidos > 0 ? 'text-rose-300' : 'text-emerald-300', onClick: () => navigate(fatPath('/faturas?status=vencida')) },
  ];

  const actions = [
    { label: 'Faturas', icon: FileText, onClick: () => navigate(fatPath('/faturas')), tone: 'primary' as const },
    { label: 'Contratos', icon: ClipboardCheck, onClick: () => navigate(fatPath('/contratos')) },
    { label: 'Clientes', icon: Users, onClick: () => navigate(fatPath('/clientes')) },
    { label: 'Reajustes', icon: RefreshCw, onClick: () => navigate(fatPath('/reajustes')) },
    { label: 'Pendências', icon: AlertTriangle, onClick: () => navigate(fatPath('/pendencias')) },
  ];

  const alerts = [
    stats.pendencias > 0
      ? { title: 'Pendências', description: `${stats.pendencias} pendências abertas no faturamento`, tone: 'danger' as const }
      : { title: 'Pendências', description: 'Nenhuma pendência aberta agora', tone: 'success' as const },
    stats.vencidos > 0
      ? { title: 'Faturas vencidas', description: `${fmtBRL(stats.vencidos)} precisa de tratativa`, tone: 'danger' as const }
      : { title: 'Faturas', description: 'Sem vencidos críticos no momento', tone: 'success' as const },
    { title: 'A vencer 30 dias', description: `${fmtBRL(stats.aVencer)} em acompanhamento`, tone: 'warning' as const },
    { title: 'Reajustes próximos', description: `${stats.reajustesProximos} contratos nos próximos 30 dias`, tone: stats.reajustesProximos > 0 ? 'warning' as const : 'success' as const },
  ];

  const leftPanelItems = porEmpresa.map(e => ({ title: e.nome, value: fmtBRL(e.total), meta: stats.emitido > 0 ? `${Math.round((e.total / stats.emitido) * 100)}% do emitido` : undefined }));
  const rightPanelItems = topClientes.map(c => ({ title: c.razao_social, value: fmtBRL(c.total) }));

  if (painelKpis) {
    leftPanelItems.unshift({ title: `Faturado em ${painelKpis.competencia}`, value: fmtBRL(Number(painelKpis.total_faturado_mes || 0)), meta: 'Conferência mensal' });
    rightPanelItems.unshift({ title: 'Medições pendentes', value: String(painelKpis.medicoes_pendentes || 0), meta: 'Aguardando conferência', danger: Number(painelKpis.medicoes_pendentes || 0) > 0 });
  }

  return (
    <TopacCentralDashboard
      modulo="Faturamento"
      subtitle="Painel fluido de faturamento e DN4"
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
      dn4Slot={<Dn4ImportPanel modulo="faturamento" />}
    />
  );
};

export default FaturamentoDashboardPage;
