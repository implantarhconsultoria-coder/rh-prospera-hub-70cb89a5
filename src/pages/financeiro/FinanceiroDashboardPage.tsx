import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, Building2, RefreshCw, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FinanceiroDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const ext = useAcessoExternoFiltro();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    aReceber: 0, aReceberVencido: 0, recebido30d: 0,
    aPagar: 0, aPagarVencido: 0, pago30d: 0,
    saldoBancos: 0, inadimplencia: 0, saldoPrevisto: 0,
  });
  const [contas, setContas] = useState<Array<{ nome: string; saldo: number; empresa: string }>>([]);
  const [topInadimplentes, setTopInadimplentes] = useState<Array<{ cliente: string; valor: number; dias: number }>>([]);

  const carregar = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const ha30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    // Filtro por empresa para acesso externo
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
    const aReceberVencido = tr.filter(t => ['aberto', 'parcial'].includes(t.status) && t.data_vencimento < hoje || t.status === 'vencido').reduce((s, t) => s + Number(t.saldo || 0), 0);
    const recsFiltered = (recs.data || []).filter((r: any) => empIds === null || empIds.includes(r.titulos_receber?.empresa_id));
    const pagsFiltered = (pags.data || []).filter((p: any) => empIds === null || empIds.includes(p.titulos_pagar?.empresa_id));
    const recebido30d = recsFiltered.reduce((s, r: any) => s + Number(r.valor || 0), 0);

    const aPagar = tp.filter(t => ['aberto', 'parcial', 'vencido'].includes(t.status)).reduce((s, t) => s + Number(t.saldo || 0), 0);
    const aPagarVencido = tp.filter(t => ['aberto', 'parcial'].includes(t.status) && t.data_vencimento < hoje || t.status === 'vencido').reduce((s, t) => s + Number(t.saldo || 0), 0);
    const pago30d = pagsFiltered.reduce((s, p: any) => s + Number(p.valor || 0), 0);

    const saldoBancos = (cb.data || []).reduce((s, c) => s + Number(c.saldo_atual || 0), 0);
    const saldoPrevisto = saldoBancos + aReceber - aPagar;

    setStats({
      aReceber, aReceberVencido, recebido30d,
      aPagar, aPagarVencido, pago30d,
      saldoBancos, inadimplencia: aReceberVencido, saldoPrevisto,
    });

    setContas((cb.data || []).map(c => ({ nome: c.nome, saldo: Number(c.saldo_atual), empresa: (c.empresas as any)?.nome || '-' })));

    // Top inadimplentes
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

  const cards = [
    { label: 'Saldo em Bancos', value: fmtBRL(stats.saldoBancos), icon: Wallet, color: 'text-primary', onClick: () => navigate('/admin/financeiro/bancos') },
    { label: 'Saldo Previsto', value: fmtBRL(stats.saldoPrevisto), icon: TrendingUp, color: stats.saldoPrevisto >= 0 ? 'text-success' : 'text-destructive' },
    { label: 'A Receber', value: fmtBRL(stats.aReceber), icon: ArrowDownCircle, color: 'text-success', onClick: () => navigate('/admin/financeiro/contas-receber') },
    { label: 'A Pagar', value: fmtBRL(stats.aPagar), icon: ArrowUpCircle, color: 'text-warning', onClick: () => navigate('/admin/financeiro/contas-pagar') },
    { label: 'Inadimplência', value: fmtBRL(stats.inadimplencia), icon: AlertTriangle, color: 'text-destructive', onClick: () => navigate('/admin/financeiro/inadimplencia') },
    { label: 'Pagar Vencido', value: fmtBRL(stats.aPagarVencido), icon: Clock, color: 'text-destructive' },
  ];

  const mini = [
    { label: 'Recebido (30d)', value: fmtBRL(stats.recebido30d), icon: TrendingUp, color: 'text-success' },
    { label: 'Pago (30d)', value: fmtBRL(stats.pago30d), icon: TrendingDown, color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Wallet className="w-6 h-6 text-primary" /> Dashboard Financeiro</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada em tempo real</p>
        </div>
        <button onClick={carregar} disabled={loading} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

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

      <div className="grid grid-cols-2 gap-3">
        {mini.map((m, i) => (
          <div key={i} className="card-premium p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
              <p className={`text-xl font-bold font-display mt-1 ${m.color}`}>{m.value}</p>
            </div>
            <m.icon className={`w-6 h-6 ${m.color} opacity-40`} />
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card-premium p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Contas Bancárias</h2>
          {contas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cadastre uma conta bancária em "Bancos".</p>
          ) : (
            <ul className="space-y-2">
              {contas.map((c, i) => (
                <li key={i} className="flex justify-between text-sm border-b border-border last:border-0 py-1.5">
                  <span><span className="font-medium">{c.nome}</span> <span className="text-xs text-muted-foreground">· {c.empresa}</span></span>
                  <span className={`font-semibold ${c.saldo >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtBRL(c.saldo)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-premium p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Top Inadimplentes</h2>
          {topInadimplentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem inadimplência no momento.</p>
          ) : (
            <ul className="space-y-2">
              {topInadimplentes.map((c, i) => (
                <li key={i} className="flex justify-between text-sm border-b border-border last:border-0 py-1.5">
                  <span className="truncate pr-2">{c.cliente} <span className="text-[10px] text-destructive">· {c.dias}d atraso</span></span>
                  <span className="font-semibold text-destructive">{fmtBRL(c.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinanceiroDashboardPage;
