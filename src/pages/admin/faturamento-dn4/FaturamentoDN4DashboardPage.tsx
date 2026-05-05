import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { Wallet, Clock, CheckCircle2, AlertTriangle, FileText, RefreshCw, Calendar, FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtBRL, statusMeta, competenciaAtual } from '@/lib/dn4';

const FaturamentoDN4DashboardPage: React.FC = () => {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const competencia = competenciaAtual();

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from('faturamento_dn4' as any).select('*').order('created_at', { ascending: false });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const stats = useMemo(() => {
    const noMes = rows.filter((r) => r.competencia === competencia);
    const total = noMes.reduce((s, r) => s + Number(r.valor_total || 0), 0);
    const pendentes = rows.filter((r) => r.status === 'pendente').length;
    const conferencia = rows.filter((r) => r.status === 'em_conferencia').length;
    const emitidos = rows.filter((r) => r.status === 'emitido').length;
    const erros = rows.filter((r) => r.status === 'com_erro').length;
    const hoje = new Date().toISOString().slice(0, 10);
    const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const proxVenc = rows.filter((r) => r.vencimento && r.vencimento >= hoje && r.vencimento <= em7);
    return { total, pendentes, conferencia, emitidos, erros, proxVenc };
  }, [rows, competencia]);

  const cards = [
    { label: `Faturado em ${competencia}`, value: fmtBRL(stats.total), icon: Wallet, color: 'text-primary' },
    { label: 'Pendentes', value: String(stats.pendentes), icon: Clock, color: 'text-muted-foreground', onClick: () => nav('/admin/faturamento/dn4/historico?status=pendente') },
    { label: 'Em conferência', value: String(stats.conferencia), icon: AlertTriangle, color: 'text-warning', onClick: () => nav('/admin/faturamento/dn4/conferencia') },
    { label: 'Emitidos', value: String(stats.emitidos), icon: CheckCircle2, color: 'text-success', onClick: () => nav('/admin/faturamento/dn4/historico?status=emitido') },
    { label: 'Com erro', value: String(stats.erros), icon: AlertTriangle, color: stats.erros ? 'text-destructive' : 'text-muted-foreground', onClick: () => nav('/admin/faturamento/dn4/historico?status=com_erro') },
    { label: 'Vencem em 7d', value: String(stats.proxVenc.length), icon: Calendar, color: 'text-warning' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Visão consolidada do faturamento DN4</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={() => nav('/admin/faturamento/dn4/novo')}>
            <FilePlus2 className="w-4 h-4 mr-1" /> Novo Faturamento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c, i) => (
          <motion.button
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={c.onClick}
            className={`text-left rounded-lg border border-border bg-card p-4 transition ${c.onClick ? 'hover:bg-muted/30 cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{c.label}</p>
                <p className={`text-base font-bold mt-1 truncate ${c.color}`}>{c.value}</p>
              </div>
              <c.icon className={`w-5 h-5 opacity-30 ${c.color}`} />
            </div>
          </motion.button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-warning" /> Próximos vencimentos</h2>
          <span className="text-xs text-muted-foreground">{stats.proxVenc.length} fatura(s)</span>
        </div>
        {stats.proxVenc.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Nenhum vencimento nos próximos 7 dias.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left text-xs uppercase">Cliente</th>
                  <th className="px-3 py-2 text-left text-xs uppercase">Pedido</th>
                  <th className="px-3 py-2 text-left text-xs uppercase">Vencimento</th>
                  <th className="px-3 py-2 text-right text-xs uppercase">Valor</th>
                  <th className="px-3 py-2 text-left text-xs uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.proxVenc.map((r) => {
                  const m = statusMeta(r.status);
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2">{r.cliente_nome}</td>
                      <td className="px-3 py-2">{r.numero_pedido || '—'}</td>
                      <td className="px-3 py-2">{new Date(r.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtBRL(r.valor_total)}</td>
                      <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded ${m.cls}`}>{m.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Últimos faturamentos</h2>
        </div>
        {rows.slice(0, 8).length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Nenhum faturamento ainda. Comece em “Novo Faturamento”.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.slice(0, 8).map((r) => {
              const m = statusMeta(r.status);
              return (
                <li key={r.id} className="px-4 py-2 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.cliente_nome} <span className="text-muted-foreground font-normal">— {r.descricao}</span></p>
                    <p className="text-xs text-muted-foreground">{r.competencia} • Pedido {r.numero_pedido || '—'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{fmtBRL(r.valor_total)}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded ${m.cls}`}>{m.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FaturamentoDN4DashboardPage;
