import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Activity, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Linha {
  data: string;
  entradas_previstas: number;
  entradas_realizadas: number;
  saidas_previstas: number;
  saidas_realizadas: number;
  saldo_dia: number;
  saldo_acumulado: number;
}

const FluxoCaixaPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const [periodo, setPeriodo] = useState({
    inicio: new Date().toISOString().slice(0, 10),
    fim: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
  });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    setLoading(true);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const applyEmp = (q: any) => safeIds ? q.in('empresa_id', safeIds) : q;
    const [tRec, tPag, recs, pags, cb] = await Promise.all([
      applyEmp(supabase.from('titulos_receber').select('data_vencimento, saldo, status, empresa_id').gte('data_vencimento', periodo.inicio).lte('data_vencimento', periodo.fim)),
      applyEmp(supabase.from('titulos_pagar').select('data_vencimento, saldo, status, empresa_id').gte('data_vencimento', periodo.inicio).lte('data_vencimento', periodo.fim)),
      supabase.from('recebimentos').select('data, valor, titulos_receber!inner(empresa_id)').gte('data', periodo.inicio).lte('data', periodo.fim),
      supabase.from('pagamentos').select('data, valor, titulos_pagar!inner(empresa_id)').gte('data', periodo.inicio).lte('data', periodo.fim),
      applyEmp(supabase.from('contas_bancarias').select('saldo_atual, empresa_id').eq('status', 'ativa')),
    ]);
    const recsF = (recs.data || []).filter((r: any) => !safeIds || safeIds.includes(r.titulos_receber?.empresa_id));
    const pagsF = (pags.data || []).filter((p: any) => !safeIds || safeIds.includes(p.titulos_pagar?.empresa_id));

    const saldo = (cb.data || []).reduce((s, c) => s + Number(c.saldo_atual || 0), 0);
    setSaldoInicial(saldo);

    const mapa = new Map<string, Linha>();
    const add = (data: string, campo: keyof Linha, valor: number) => {
      if (!mapa.has(data)) mapa.set(data, { data, entradas_previstas: 0, entradas_realizadas: 0, saidas_previstas: 0, saidas_realizadas: 0, saldo_dia: 0, saldo_acumulado: 0 });
      (mapa.get(data) as any)[campo] += valor;
    };

    (tRec.data || []).filter(t => ['aberto', 'parcial', 'vencido'].includes(t.status)).forEach(t => add(t.data_vencimento, 'entradas_previstas', Number(t.saldo)));
    (tPag.data || []).filter(t => ['aberto', 'parcial', 'vencido'].includes(t.status)).forEach(t => add(t.data_vencimento, 'saidas_previstas', Number(t.saldo)));
    recsF.forEach(r => add(r.data, 'entradas_realizadas', Number(r.valor)));
    pagsF.forEach(p => add(p.data, 'saidas_realizadas', Number(p.valor)));

    const arr = Array.from(mapa.values()).sort((a, b) => a.data.localeCompare(b.data));
    let acum = saldo;
    arr.forEach(l => {
      l.saldo_dia = (l.entradas_previstas + l.entradas_realizadas) - (l.saidas_previstas + l.saidas_realizadas);
      acum += l.saldo_dia;
      l.saldo_acumulado = acum;
    });
    setLinhas(arr);
    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const totais = useMemo(() => ({
    ent_prev: linhas.reduce((s, l) => s + l.entradas_previstas, 0),
    ent_real: linhas.reduce((s, l) => s + l.entradas_realizadas, 0),
    sai_prev: linhas.reduce((s, l) => s + l.saidas_previstas, 0),
    sai_real: linhas.reduce((s, l) => s + l.saidas_realizadas, 0),
  }), [linhas]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /> Fluxo de Caixa</h1>
          <p className="text-sm text-muted-foreground">Saldo inicial em bancos: <span className="font-semibold">{fmtBRL(saldoInicial)}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={periodo.inicio} onChange={e => setPeriodo({ ...periodo, inicio: e.target.value })} className="bg-card border border-border rounded-md px-2 py-1 text-sm" />
          <span className="text-muted-foreground">→</span>
          <input type="date" value={periodo.fim} onChange={e => setPeriodo({ ...periodo, fim: e.target.value })} className="bg-card border border-border rounded-md px-2 py-1 text-sm" />
          <button onClick={carregar} className="btn-secondary text-sm flex items-center gap-1"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Entradas previstas</p><p className="text-base font-bold text-success">{fmtBRL(totais.ent_prev)}</p></div>
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Entradas realizadas</p><p className="text-base font-bold text-success">{fmtBRL(totais.ent_real)}</p></div>
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Saídas previstas</p><p className="text-base font-bold text-destructive">{fmtBRL(totais.sai_prev)}</p></div>
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Saídas realizadas</p><p className="text-base font-bold text-destructive">{fmtBRL(totais.sai_real)}</p></div>
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Data</th>
              <th className="text-right p-3">Ent. Prev.</th>
              <th className="text-right p-3">Ent. Real.</th>
              <th className="text-right p-3">Saí. Prev.</th>
              <th className="text-right p-3">Saí. Real.</th>
              <th className="text-right p-3">Saldo dia</th>
              <th className="text-right p-3">Saldo acum.</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.data} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{l.data}</td>
                <td className="p-3 text-right text-success/70">{fmtBRL(l.entradas_previstas)}</td>
                <td className="p-3 text-right text-success font-semibold">{fmtBRL(l.entradas_realizadas)}</td>
                <td className="p-3 text-right text-destructive/70">{fmtBRL(l.saidas_previstas)}</td>
                <td className="p-3 text-right text-destructive font-semibold">{fmtBRL(l.saidas_realizadas)}</td>
                <td className={`p-3 text-right font-semibold ${l.saldo_dia >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtBRL(l.saldo_dia)}</td>
                <td className={`p-3 text-right font-bold ${l.saldo_acumulado >= 0 ? 'text-primary' : 'text-destructive'}`}>{fmtBRL(l.saldo_acumulado)}</td>
              </tr>
            ))}
            {linhas.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Sem movimentação no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FluxoCaixaPage;
