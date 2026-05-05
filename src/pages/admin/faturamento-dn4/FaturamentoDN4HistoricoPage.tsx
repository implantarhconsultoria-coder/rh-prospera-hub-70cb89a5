import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Trash2, Search, History } from 'lucide-react';
import { fmtBRL, statusMeta, STATUS_DN4 } from '@/lib/dn4';

const FaturamentoDN4HistoricoPage: React.FC = () => {
  const [params] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState(params.get('status') || 'todos');
  const [mes, setMes] = useState('todos');

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from('faturamento_dn4' as any).select('*').order('created_at', { ascending: false });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const meses = useMemo(() => Array.from(new Set(rows.map((r) => r.competencia).filter(Boolean))).sort().reverse(), [rows]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'todos' && r.status !== status) return false;
      if (mes !== 'todos' && r.competencia !== mes) return false;
      if (q) {
        const blob = `${r.cliente_nome} ${r.empresa_filial} ${r.numero_pedido} ${r.descricao} ${r.cnpj_cpf}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, busca, status, mes]);

  const total = filtrados.reduce((s, r) => s + Number(r.valor_total || 0), 0);

  const excluir = async (id: string) => {
    if (!window.confirm('Excluir este faturamento? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('faturamento_dn4' as any).delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Excluído');
    carregar();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold">Histórico</h2>
      </div>

      <div className="grid md:grid-cols-4 gap-2">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente, pedido, descrição..." className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {STATUS_DN4.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as competências</SelectItem>
            {meses.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left text-xs uppercase">Comp.</th>
              <th className="px-3 py-2 text-left text-xs uppercase">Cliente</th>
              <th className="px-3 py-2 text-left text-xs uppercase">Empresa</th>
              <th className="px-3 py-2 text-left text-xs uppercase">Pedido</th>
              <th className="px-3 py-2 text-left text-xs uppercase">Descrição</th>
              <th className="px-3 py-2 text-right text-xs uppercase">Total</th>
              <th className="px-3 py-2 text-left text-xs uppercase">Vencto</th>
              <th className="px-3 py-2 text-left text-xs uppercase">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Nenhum faturamento encontrado.</td></tr>
            ) : filtrados.map((r) => {
              const m = statusMeta(r.status);
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs">{r.competencia}</td>
                  <td className="px-3 py-2">{r.cliente_nome}</td>
                  <td className="px-3 py-2 text-xs">{r.empresa_filial || '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.numero_pedido || '—'}</td>
                  <td className="px-3 py-2 text-xs truncate max-w-[260px]">{r.descricao}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtBRL(r.valor_total)}</td>
                  <td className="px-3 py-2 text-xs">{r.vencimento || '—'}</td>
                  <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded ${m.cls}`}>{m.label}</span></td>
                  <td className="px-3 py-2 text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => excluir(r.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/30 border-t border-border">
            <tr>
              <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase font-semibold">Total filtrado</td>
              <td className="px-3 py-2 text-right font-bold text-primary">{fmtBRL(total)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default FaturamentoDN4HistoricoPage;
