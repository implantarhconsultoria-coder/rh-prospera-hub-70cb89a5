import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, TrendingUp, AlertTriangle, Clock, Building2, RefreshCw, ArrowDownCircle, ArrowUpCircle, Landmark, GitMerge } from 'lucide-react';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';
import Dn4ImportPanel from '@/components/Dn4ImportPanel';
import TopacCentralDashboard from '@/components/TopacCentralDashboard';
import FinanceiroDashboardDN4 from '@/components/FinanceiroDashboardDN4';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FinanceiroDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const ext = useAcessoExternoFiltro();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    aReceber: 0, aReceberVencido: 0, recebido30d: 0,
    aPagar: 0, aPagarVencido: 0, pago30d: 0,
    saldoBancos: 0, inadimplencia: 0, saldoPrevisto: 0,
  });
  const [contas, setContas] = useState<Array<{ nome: string; saldo: number; empresa: string }>>([]);
  const [topInadimplentes, setTopInadimplentes] = useState<Array<{ cliente: string; valor: number; dias: number }>>([]);
  const portalBase = location.pathname.match(/^\/financeiro-ext\/[^/]+/)?.[0]
    || (location.pathname.startsWith('/financeiro') ? '/financeiro' : '/admin/financeiro');
  const finPath = (path = '') => `${portalBase}${path}`;

  const carregar = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const ha30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const applyEmp = (q: any) => empIds !== null ? q.in('empresa_id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : q;

    const [tRec, tPag, recs, pags, cb, clis] = await Promise.all([
      applyEmp(supabase.from('titulos_receber').select('saldo, status, data_vencimento, cliente_id, empresa_id')),
      applyEmp(supabase.from('titulos_pagar').select('saldo, status, data_vencimento, empresa_id')),
      supabase.from('recebimentos').select('valor, data, titulos_receber!inner(empresa_id)').gte('data', ha30),
      supabase.from('pagamentos').select('valor, data, titulos_pagar!inner(empresa_id)').gte('data', ha30),
      applyEmp(supabase.from('contas_bancarias').select('nome, saldo_atual, empresa_id, empresas(nome)').eq('status', 'ativa')),
      supabase.from('clientes_fat').select('id, razao_social'),
    ]);

    const tr = tRec.data || [];
    const tp = tPag.data || [];

    const aReceber = tr.filter(t => ['aberto', 'parcial', 'vencido'].includes(t.status)).reduce((s, t) => s + Number(t.saldo || 0), 0);
    const aReceberVencido = tr.filter(t => (['aberto', 'parcial'].includes(t.status) && t.data_vencimento < hoje) || t.status === 'vencido').reduce((s, t) => s + Number(t.saldo || 0), 0);
    const recsFiltered = (recs.data || []).filter((r: any) => empIds === null || empIds.includes(r.titulos_receber?.empresa_id));
    const pagsFiltered = (pags.data || []).filter((p: any) => empIds === null || empIds.includes(p.titulos_pagar?.empresa_id));
    const recebido30d = recsFiltered.reduce((s, r: any) => s + Number(r.valor || 0), 0);

    const aPagar = tp.filter(t => ['aberto', 'parcial', 'vencido'].includes(t.status)).reduce((s, t) => s + Number(t.saldo || 0), 0);
    const aPagarVencido = tp.filter(t => (['aberto', 'parcial'].includes(t.status) && t.data_vencimento < hoje) || t.status === 'vencido').reduce((s, t) => s + Number(t.saldo || 0), 0);
    const pago30d = pagsFiltered.reduce((s, p: any) => s + Number(p.valor || 0), 0);

    const saldoBancos = (cb.data || []).reduce((s, c) => s + Number(c.saldo_atual || 0), 0);
    const saldoPrevisto = saldoBancos + aReceber - aPagar;

    setStats({
      aReceber, aReceberVencido, recebido30d,
      aPagar, aPagarVencido, pago30d,
      saldoBancos, inadimplencia: aReceberVencido, saldoPrevisto,
    });

    setContas((cb.data || []).map(c => ({ nome: c.nome, saldo: Number(c.saldo_atual), empresa: (c.empresas as any)?.nome || '-' })));

    const cliMap = new Map((clis.data || []).map(c => [c.id, c.razao_social]));
    const inad = new Map<string, { valor: number; dias: number }>();
    tr.filter(t => ['aberto', 'parcial', 'vencido'].includes(t.status) && t.data_vencimento < hoje).forEach(t => {
      const cli = cliMap.get(t.cliente_id) || 'Outros';
      const dias = Math.floor((Date.now() - new Date(t.data_vencimento).getTime()) / 86400000);
      const cur = inad.get(cli) || { valor: 0, dias: 0 };
      inad.set(cli, { valor: cur.valor + Number(t.saldo || 0), dias: Math.max(cur.dias, dias) });
    });
    setTopInadimplentes(Array.from(inad.entries()).map(([cliente, v]) => ({ cliente, ...v })).sort((a, b) => b.valor - a.valor).slice(0, 5));

    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const kpis = [
    { label: 'Saldo em Bancos', value: fmtBRL(stats.saldoBancos), icon: Wallet, color: 'text-cyan-200', onClick: () => navigate(finPath('/bancos')) },
    { label: 'Saldo Previsto', value: fmtBRL(stats.saldoPrevisto), icon: TrendingUp, color: stats.saldoPrevisto >= 0 ? 'text-emerald-300' : 'text-rose-300' },
    { label: 'A Receber', value: fmtBRL(stats.aReceber), icon: ArrowDownCircle, color: 'text-emerald-300', onClick: () => navigate(finPath('/contas-receber')) },
    { label: 'A Pagar', value: fmtBRL(stats.aPagar), icon: ArrowUpCircle, color: 'text-fuchsia-300', onClick: () => navigate(finPath('/contas-pagar')) },
  ];

  const actions = [
    { label: 'Contas a Receber', icon: ArrowDownCircle, onClick: () => navigate(finPath('/contas-receber')), tone: 'primary' as const },
    { label: 'Contas a Pagar', icon: ArrowUpCircle, onClick: () => navigate(finPath('/contas-pagar')) },
    { label: 'Bancos', icon: Landmark, onClick: () => navigate(finPath('/bancos')) },
    { label: 'Inadimplência', icon: AlertTriangle, onClick: () => navigate(finPath('/inadimplencia')) },
    { label: 'Conciliação', icon: GitMerge, onClick: () => navigate(finPath('/conciliacao')) },
  ];

  const alerts = [
    stats.inadimplencia > 0
      ? { title: 'Inadimplência', description: `${fmtBRL(stats.inadimplencia)} vencido para cobrança`, tone: 'danger' as const }
      : { title: 'Cobrança em dia', description: 'Sem inadimplência crítica no momento', tone: 'success' as const },
    stats.aPagarVencido > 0
      ? { title: 'Pagar Vencido', description: `${fmtBRL(stats.aPagarVencido)} em títulos vencidos`, tone: 'danger' as const }
      : { title: 'Pagamentos', description: 'Nenhum vencido financeiro crítico', tone: 'success' as const },
    { title: 'Recebido 30 dias', description: `${fmtBRL(stats.recebido30d)} confirmado no período`, tone: 'success' as const },
    { title: 'Pago 30 dias', description: `${fmtBRL(stats.pago30d)} baixado no período`, tone: 'warning' as const },
  ];

  return (
    <TopacCentralDashboard
      modulo="Financeiro"
      subtitle="Visão financeira em tempo real"
      loading={loading}
      onRefresh={carregar}
      kpis={kpis}
      actions={actions}
      alerts={alerts}
      leftPanelTitle="Contas Bancárias"
      leftPanelItems={contas.map(c => ({ title: c.nome, meta: c.empresa, value: fmtBRL(c.saldo), danger: c.saldo < 0 }))}
      rightPanelTitle="Top Inadimplentes"
      rightPanelItems={topInadimplentes.map(c => ({ title: c.cliente, meta: `${c.dias}d atraso`, value: fmtBRL(c.valor), danger: true }))}
      emptyLeft="Cadastre uma conta bancária em Bancos."
      emptyRight="Sem inadimplência no momento."
      dn4Slot={<Dn4ImportPanel modulo="financeiro" />}
    />
  );
};

export default FinanceiroDashboardPage;
