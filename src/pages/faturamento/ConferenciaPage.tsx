import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ClipboardCheck, Ban, Edit3, RefreshCw, Landmark } from 'lucide-react';
import { toast } from 'sonner';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBR = (d?: string | null) => d ? new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR') : '—';
const STATUS_OPTS = [
  { value: '', label: 'Todos' }, { value: 'em_aberto', label: 'Prontas / Em aberto' },
  { value: 'enviada', label: 'Cobranças enviadas' }, { value: 'vencida', label: 'Vencidas' },
  { value: 'paga', label: 'Pagas' }, { value: 'cancelada', label: 'Canceladas' },
];
const STATUS_COLORS: Record<string, string> = {
  em_aberto: 'bg-warning/20 text-warning', enviada: 'bg-primary/20 text-primary',
  vencida: 'bg-destructive/20 text-destructive', paga: 'bg-success/20 text-success',
  cancelada: 'bg-muted text-muted-foreground', prevista: 'bg-muted text-muted-foreground',
};

const ConferenciaPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const status = params.get('status') || '';

  const carregar = async () => {
    setLoading(true);
    await supabase.rpc('faturamento_marcar_vencidas' as any);
    let query = supabase.from('vw_faturamento_conferencia' as any).select('*').order('data_vencimento', { ascending: true });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setRows((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [status]);

  const cancelar = async (row: any) => {
    if (!confirm(`Cancelar a fatura ${row.numero}? O título a receber também será cancelado.`)) return;
    const { data: titulo, error: findError } = await supabase.from('titulos_receber').select('id, status, valor_pago').eq('fatura_id', row.id).maybeSingle();
    if (findError) return toast.error(findError.message);
    if (titulo && (titulo.status === 'pago' || Number(titulo.valor_pago || 0) > 0)) return toast.error('Existe recebimento registrado. Estorne a baixa antes de cancelar.');
    const { error: titleError } = await supabase.from('titulos_receber').update({ status: 'cancelado', saldo: 0 }).eq('fatura_id', row.id);
    if (titleError) return toast.error(`Título financeiro não foi cancelado: ${titleError.message}`);
    const { error } = await supabase.from('faturas').update({ status: 'cancelada' }).eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Fatura e título financeiro cancelados');
    carregar();
  };

  const totais = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const pago = rows.reduce((sum, row) => sum + Number(row.valor_pago || 0), 0);
    return { total, pago, saldo: total - pago, qtd: rows.length };
  }, [rows]);

  return <div className="space-y-4 animate-fade-in">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold font-display flex items-center gap-2"><ClipboardCheck className="w-6 h-6 text-primary" /> Conferência de Faturamento</h1><p className="text-sm text-muted-foreground">Conferência operacional antes da cobrança e do recebimento</p></div>
      <div className="flex items-center gap-2"><select value={status} onChange={e => setParams(e.target.value ? { status: e.target.value } : {})} className="bg-background border border-border rounded-md px-3 py-2 text-sm">{STATUS_OPTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button onClick={carregar} className="btn-secondary text-sm flex items-center gap-1"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button></div>
    </div>
    <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2"><Landmark className="w-4 h-4 text-primary" /> Pagamento não é confirmado nesta tela. A baixa deve ser registrada em Contas a Receber e depois conciliada com o banco.</div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Faturas listadas</p><p className="text-lg font-bold mt-1">{totais.qtd}</p></div>
      <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Total</p><p className="text-lg font-bold text-primary mt-1">{fmtBRL(totais.total)}</p></div>
      <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Recebido registrado</p><p className="text-lg font-bold text-success mt-1">{fmtBRL(totais.pago)}</p></div>
      <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Saldo</p><p className="text-lg font-bold text-warning mt-1">{fmtBRL(totais.saldo)}</p></div>
    </div>
    <div className="card-premium overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Fatura</th><th className="text-left p-3">Cliente</th><th className="text-left p-3">Contrato</th><th className="text-left p-3">Período</th><th className="text-left p-3">Vencimento</th><th className="text-right p-3">Valor</th><th className="text-center p-3">Status</th><th className="text-center p-3">Ações</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Carregando...</td></tr> : rows.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhuma fatura para conferência.</td></tr> : rows.map(row => <tr key={row.id} className="border-t border-border hover:bg-sidebar-accent/10"><td className="p-3 font-mono text-xs">{row.numero}</td><td className="p-3"><div className="font-medium truncate max-w-[220px]">{row.cliente_nome || '—'}</div><div className="text-[10px] text-muted-foreground">{row.empresa_nome}</div></td><td className="p-3 text-xs">{row.contrato_numero || '—'}</td><td className="p-3 text-xs">{fmtBR(row.periodo_inicio)} → {fmtBR(row.periodo_fim)}</td><td className={`p-3 ${row.status === 'vencida' ? 'text-destructive font-semibold' : ''}`}>{fmtBR(row.data_vencimento)}</td><td className="p-3 text-right font-semibold">{fmtBRL(row.total)}</td><td className="p-3 text-center"><span className={`text-[10px] px-2 py-1 rounded-full ${STATUS_COLORS[row.status] || 'bg-muted'}`}>{row.status}</span></td><td className="p-3 text-center"><div className="flex items-center justify-center gap-1">{row.contrato_id && <button title="Abrir contrato" onClick={() => navigate(`/admin/faturamento/contratos/${row.contrato_id}`)} className="p-1.5 hover:bg-muted rounded"><Edit3 className="w-4 h-4" /></button>}{row.status !== 'cancelada' && row.status !== 'paga' && <button title="Cancelar" onClick={() => cancelar(row)} className="p-1.5 hover:bg-destructive/10 rounded text-destructive"><Ban className="w-4 h-4" /></button>}</div></td></tr>)}
    </tbody></table></div>
  </div>;
};

export default ConferenciaPage;
