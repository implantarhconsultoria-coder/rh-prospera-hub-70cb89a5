import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ChevronRight, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { daysBetweenIsoDates } from '@/lib/epiRules';
import { useApp } from '@/context/AppContext';

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dateBr = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

type AlertRow = {
  id: string;
  funcionario_nome: string;
  empresa_nome: string;
  proxima_reposicao: string;
};

const EpiSemestralAlert: React.FC = () => {
  const navigate = useNavigate();
  const { userRole } = useApp();
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const today = todayIso();

  const load = useCallback(async () => {
    if (userRole !== 'admin') {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const limit = new Date(`${today}T12:00:00`);
    limit.setDate(limit.getDate() + 7);
    const limitIso = limit.toLocaleDateString('en-CA');
    const { data, error } = await (supabase as any)
      .from('epi_entregas')
      .select('id,funcionario_nome,empresa_nome,proxima_reposicao')
      .eq('status', 'entregue')
      .not('proxima_reposicao', 'is', null)
      .lte('proxima_reposicao', limitIso)
      .order('proxima_reposicao', { ascending: true })
      .limit(30);
    if (!error) setRows((data || []) as AlertRow[]);
    setLoading(false);
  }, [today, userRole]);

  useEffect(() => { load(); }, [load]);

  const overdue = useMemo(() => rows.filter((row) => daysBetweenIsoDates(today, row.proxima_reposicao) < 0), [rows, today]);
  const upcoming = rows.length - overdue.length;

  if (userRole !== 'admin') return null;
  if (loading) {
    return <div className="mb-5 no-print rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-xs text-muted-foreground flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Verificando ciclo semestral de EPI...</div>;
  }
  if (!rows.length) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/admin/epi')}
      className="mb-5 no-print w-full text-left rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-5 py-4 transition-colors hover:bg-amber-500/[0.11]"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400"><CalendarClock className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-foreground">Organização da entrega semestral de EPI</p>
            {overdue.length > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive"><AlertTriangle className="inline w-3 h-3 mr-1" />{overdue.length} vencida(s)</span>}
            {upcoming > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">{upcoming} nos próximos 7 dias</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{rows.slice(0, 4).map((row) => `${row.funcionario_nome} · ${dateBr(row.proxima_reposicao)}`).join('  •  ')}{rows.length > 4 ? `  •  +${rows.length - 4}` : ''}</p>
        </div>
        <ChevronRight className="w-4 h-4 shrink-0 text-amber-500 mt-2" />
      </div>
    </button>
  );
};

export default EpiSemestralAlert;
