import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, FileText, AlertTriangle, CheckCircle2, Clock, TrendingUp, Building2, Users, Package, RefreshCw, ClipboardCheck, UserX } from 'lucide-react';

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FaturamentoDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<any>(null);
  const [stats, setStats] = useState({
    previsto: 0, emitido: 0, pago: 0, vencidos: 0, aVencer: 0,
    contratosAtivos: 0, clientesAtivos: 0, equipamentosFaturando: 0,
    pendencias: 0, reajustesProximos: 0,
  });
  const [porEmpresa, setPorEmpresa] = useState<Array<{ nome: string; total: number }>>([]);
  const [topClientes, setTopClientes] = useState<Array<{ razao_social: string; total: number }>>([]);

  const carregar = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    // KPIs vivos via RPC (já marca faturas vencidas automaticamente)
    const { data: kpiData } = await supabase.rpc('dashboard_faturamento_kpis' as any);
    setKpis(kpiData || null);

    const [faturas, contratos, clientes, contratoEquip, pendencias, contratosReaj, empresas] = await Promise.all([
      supabase.from('faturas').select('total, status, data_vencimento, empresa_id, cliente_id'),
      supabase.from('contratos').select('id, status'),
      supabase.from('clientes_fat').select('id, razao_social, status'),
      supabase.from('contrato_equipamentos').select('id, status'),
      supabase.from('faturamento_pendencias').select('id').eq('status', 'aberta'),
      supabase.from('contratos').select('id, proximo_reajuste').not('proximo_reajuste', 'is', null).lte('proximo_reajuste', em30),
      supabase.from('empresas').select('id, nome'),
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
      equipamentosFaturando: (contratoEquip.data || []).filter(e => e.status === 'ativo').length,
      pendencias: pendencias.data?.length || 0,
      reajustesProximos: contratosReaj.data?.length || 0,
    });

    // Por empresa
    const empMap = new Map((empresas.data || []).map(e => [e.id, e.nome]));
    const porEmp = new Map<string, number>();
    f.forEach(x => {
      const nome = empMap.get(x.empresa_id) || 'Outros';
      porEmp.set(nome, (porEmp.get(nome) || 0) + Number(x.total || 0));
    });
    setPorEmpresa(Array.from(porEmp.entries()).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total));

    // Top clientes
    const cliMap = new Map((clientes.data || []).map(c => [c.id, c.razao_social]));
    const porCli = new Map<string, number>();
    f.forEach(x => {
      const nome = cliMap.get(x.cliente_id) || 'Outros';
      porCli.set(nome, (porCli.get(nome) || 0) + Number(x.total || 0));
    });
    setTopClientes(Array.from(porCli.entries()).map(([razao_social, total]) => ({ razao_social, total })).sort((a, b) => b.total - a.total).slice(0, 5));

    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const cards = [
    { label: 'Faturamento Previsto', value: fmtBRL(stats.previsto), icon: TrendingUp, color: 'text-primary' },
    { label: 'Total Emitido', value: fmtBRL(stats.emitido), icon: FileText, color: 'text-foreground' },
    { label: 'Recebido (Pago)', value: fmtBRL(stats.pago), icon: CheckCircle2, color: 'text-success' },
    { label: 'Vencidos', value: fmtBRL(stats.vencidos), icon: AlertTriangle, color: 'text-destructive', onClick: () => navigate('/admin/faturamento/faturas?status=vencida') },
    { label: 'A Vencer (30d)', value: fmtBRL(stats.aVencer), icon: Clock, color: 'text-warning' },
    { label: 'Pendências', value: stats.pendencias.toString(), icon: AlertTriangle, color: stats.pendencias > 0 ? 'text-destructive' : 'text-success', onClick: () => navigate('/admin/faturamento/pendencias') },
  ];

  const mini = [
    { label: 'Contratos Ativos', value: stats.contratosAtivos, icon: FileText, path: '/admin/faturamento/contratos' },
    { label: 'Clientes Ativos', value: stats.clientesAtivos, icon: Users, path: '/admin/faturamento/clientes' },
    { label: 'Equipamentos Faturando', value: stats.equipamentosFaturando, icon: Package, path: '/admin/faturamento/contratos' },
    { label: 'Reajustes próx. 30d', value: stats.reajustesProximos, icon: RefreshCw, path: '/admin/faturamento/reajustes' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Wallet className="w-6 h-6 text-primary" /> Dashboard de Faturamento</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada em tempo real</p>
        </div>
        <button onClick={carregar} disabled={loading} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={() => navigate('/admin/faturamento/conferencia')} className="card-premium p-4 text-left hover:bg-sidebar-accent/20 transition-colors">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Faturado em {kpis.competencia}</p>
            <p className="text-lg font-bold font-display mt-1 text-primary">{fmtBRL(Number(kpis.total_faturado_mes || 0))}</p>
          </button>
          <button onClick={() => navigate('/admin/faturamento/medicoes')} className="card-premium p-4 text-left hover:bg-sidebar-accent/20 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Medições pendentes</p>
                <p className="text-lg font-bold font-display mt-1">{kpis.medicoes_pendentes}</p>
              </div>
              <ClipboardCheck className="w-5 h-5 text-warning opacity-50" />
            </div>
          </button>
          <button onClick={() => navigate('/admin/faturamento/conferencia')} className="card-premium p-4 text-left hover:bg-sidebar-accent/20 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vencem em 7 dias</p>
                <p className="text-lg font-bold font-display mt-1 text-warning">{kpis.cobrancas_a_vencer}</p>
              </div>
              <Clock className="w-5 h-5 text-warning opacity-50" />
            </div>
          </button>
          <button onClick={() => navigate('/admin/faturamento/conferencia?status=vencida')} className="card-premium p-4 text-left hover:bg-sidebar-accent/20 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Clientes inadimplentes</p>
                <p className="text-lg font-bold font-display mt-1 text-destructive">{kpis.clientes_inadimplentes}</p>
              </div>
              <UserX className="w-5 h-5 text-destructive opacity-50" />
            </div>
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            onClick={c.onClick}
            className={`card-premium p-4 ${c.onClick ? 'cursor-pointer hover:bg-sidebar-accent/20' : ''}`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{c.label}</p>
                <p className={`text-base font-bold font-display mt-1 ${c.color} truncate`}>{c.value}</p>
              </div>
              <c.icon className={`w-5 h-5 ${c.color} opacity-30 flex-shrink-0 ml-2`} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {mini.map((m, i) => (
          <button key={m.label} onClick={() => navigate(m.path)} className="card-premium p-4 text-left hover:bg-sidebar-accent/20 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
                <p className="text-xl font-bold font-display mt-1">{m.value}</p>
              </div>
              <m.icon className="w-6 h-6 text-primary opacity-40" />
            </div>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card-premium p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Faturamento por Empresa</h2>
          {porEmpresa.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem faturas emitidas ainda.</p>
          ) : (
            <ul className="space-y-2">
              {porEmpresa.map(e => {
                const pct = stats.emitido > 0 ? (e.total / stats.emitido) * 100 : 0;
                return (
                  <li key={e.nome}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium truncate pr-2">{e.nome}</span>
                      <span className="text-muted-foreground">{fmtBRL(e.total)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card-premium p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Top Clientes</h2>
          {topClientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem clientes faturados ainda.</p>
          ) : (
            <ul className="space-y-2">
              {topClientes.map(c => (
                <li key={c.razao_social} className="flex justify-between text-sm border-b border-border last:border-0 py-1.5">
                  <span className="truncate pr-2">{c.razao_social}</span>
                  <span className="font-semibold text-primary">{fmtBRL(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default FaturamentoDashboardPage;
