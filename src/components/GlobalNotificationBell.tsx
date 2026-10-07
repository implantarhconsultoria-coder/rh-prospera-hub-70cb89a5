import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, CircleAlert, Info, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';

type AlertSeverity = 'informativa' | 'atencao' | 'critica';

type GlobalNotification = {
  id: string;
  title: string;
  message: string;
  source: string;
  severity: AlertSeverity;
  createdAt: string | null;
  actionUrl: string | null;
  status: string;
  isRead: boolean;
};

const CRITICAL_CYCLES = [
  { minutes: 8 * 60 + 30, label: '08:30' },
  { minutes: 11 * 60 + 30, label: '11:30' },
  { minutes: 14 * 60 + 30, label: '14:30' },
  { minutes: 17 * 60, label: '17:00' },
] as const;

const getOperationalCycleKey = (now = new Date()): string | null => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const currentMinutes = Number(values.hour || 0) * 60 + Number(values.minute || 0);
  const currentCycle = [...CRITICAL_CYCLES].reverse().find((cycle) => currentMinutes >= cycle.minutes);
  if (!currentCycle) return null;
  return `${values.year}-${values.month}-${values.day}:${currentCycle.label}`;
};

const normalizeSeverity = (value: unknown): AlertSeverity => {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('crit')) return 'critica';
  if (normalized.includes('aten') || normalized.includes('warn')) return 'atencao';
  return 'informativa';
};

const severityLabel = (severity: AlertSeverity) => {
  if (severity === 'critica') return 'Crítica';
  if (severity === 'atencao') return 'Atenção';
  return 'Informativa';
};

const dateTime = (value: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : 'Agora';

const toneClasses = (severity: AlertSeverity) => {
  if (severity === 'critica') return 'border-red-400/30 bg-red-500/[.08] text-red-300';
  if (severity === 'atencao') return 'border-amber-400/25 bg-amber-400/[.07] text-amber-300';
  return 'border-cyan-400/20 bg-cyan-400/[.05] text-cyan-300';
};

const SeverityIcon = ({ severity }: { severity: AlertSeverity }) => {
  if (severity === 'critica') return <CircleAlert className="h-4 w-4" />;
  if (severity === 'atencao') return <AlertTriangle className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
};

const isActiveCritical = (row: GlobalNotification) => {
  if (row.severity !== 'critica') return false;
  return !['resolvido', 'resolvida', 'encerrado', 'encerrada', 'inativo', 'inativa'].includes(row.status.toLowerCase());
};

export default function GlobalNotificationBell() {
  const navigate = useNavigate();
  const { session } = useApp();
  const userId = session?.user?.id || null;
  const [rows, setRows] = useState<GlobalNotification[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cycleKey, setCycleKey] = useState<string | null>(() => getOperationalCycleKey());
  const [criticalModalRows, setCriticalModalRows] = useState<GlobalNotification[]>([]);
  const presentationCheckRef = useRef(false);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const { data: alerts, error: alertsError } = await (supabase as any)
        .from('alertas_filial')
        .select('id,modulo,acao,nivel,filial,tabela,registro_id,observacao,created_at,lido,evento,titulo,mensagem,empresa_id,origem_registro_id,destinatario_user_id,escopo,acao_url,status,resolvido_em')
        .order('created_at', { ascending: false })
        .limit(100);

      if (alertsError) throw alertsError;

      const alertRows = alerts || [];
      const ids = alertRows.map((row: any) => row.id).filter(Boolean);
      let readRows: Array<{ alerta_id: string; lido_em: string }> = [];

      if (ids.length > 0) {
        const { data: reads, error: readsError } = await (supabase as any)
          .from('alertas_filial_leituras')
          .select('alerta_id,lido_em')
          .eq('user_id', userId)
          .in('alerta_id', ids);
        if (readsError) throw readsError;
        readRows = reads || [];
      }

      const readIds = new Set(readRows.map((row) => row.alerta_id));
      setRows(alertRows.map((row: any) => ({
        id: row.id,
        title: row.titulo || row.evento || row.acao || 'Notificação',
        message: row.mensagem || row.observacao || 'Existe uma atualização disponível para consulta.',
        source: row.modulo || row.tabela || 'Sistema',
        severity: normalizeSeverity(row.nivel),
        createdAt: row.created_at || null,
        actionUrl: row.acao_url || null,
        status: row.resolvido_em ? 'resolvido' : (row.status || 'ativo'),
        isRead: readIds.has(row.id) || row.lido === true,
      })));
    } catch (error: any) {
      console.error('Erro ao carregar notificações globais:', error);
      setLoadError(error?.message || 'Não foi possível carregar as notificações.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    if (!userId) return;

    const timer = window.setInterval(() => void load(), 30000);
    const channel = (supabase as any)
      .channel(`global-notifications-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas_filial' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas_filial_leituras' }, () => void load())
      .subscribe();

    return () => {
      window.clearInterval(timer);
      void (supabase as any).removeChannel(channel);
    };
  }, [load, userId]);

  useEffect(() => {
    const syncCycle = () => setCycleKey(getOperationalCycleKey());
    syncCycle();
    const timer = window.setInterval(syncCycle, 30000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncCycle();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', syncCycle);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', syncCycle);
    };
  }, []);

  useEffect(() => {
    if (!userId || !cycleKey || criticalModalRows.length > 0 || presentationCheckRef.current) return;
    const activeCritical = rows.filter(isActiveCritical);
    if (activeCritical.length === 0) return;

    let cancelled = false;
    const checkPresentations = async () => {
      presentationCheckRef.current = true;
      try {
        const ids = activeCritical.map((row) => row.id);
        const { data: shown, error: shownError } = await (supabase as any)
          .from('alertas_filial_apresentacoes')
          .select('alerta_id')
          .eq('user_id', userId)
          .eq('ciclo', cycleKey)
          .in('alerta_id', ids);
        if (shownError) throw shownError;

        const shownIds = new Set((shown || []).map((item: any) => item.alerta_id));
        const pending = activeCritical.filter((row) => !shownIds.has(row.id));
        if (pending.length === 0) return;

        const { error: persistError } = await (supabase as any)
          .from('alertas_filial_apresentacoes')
          .upsert(
            pending.map((row) => ({
              alerta_id: row.id,
              user_id: userId,
              ciclo: cycleKey,
              apresentado_em: new Date().toISOString(),
            })),
            { onConflict: 'alerta_id,user_id,ciclo', ignoreDuplicates: true },
          );
        if (persistError) throw persistError;

        if (!cancelled) {
          setDrawerOpen(false);
          setCriticalModalRows(pending);
        }
      } catch (error) {
        console.error('Erro ao controlar apresentação de alerta crítico:', error);
      } finally {
        presentationCheckRef.current = false;
      }
    };

    void checkPresentations();
    return () => { cancelled = true; };
  }, [rows, userId, cycleKey, criticalModalRows.length]);

  const markRead = useCallback(async (notificationId: string) => {
    if (!userId) return false;
    const { error } = await (supabase as any)
      .from('alertas_filial_leituras')
      .upsert(
        { alerta_id: notificationId, user_id: userId, lido_em: new Date().toISOString() },
        { onConflict: 'alerta_id,user_id' },
      );

    if (error) {
      console.error('Erro ao registrar leitura da notificação:', error);
      return false;
    }

    setRows((current) => current.map((row) => row.id === notificationId ? { ...row, isRead: true } : row));
    return true;
  }, [userId]);

  const openNotification = useCallback(async (row: GlobalNotification) => {
    if (!row.isRead) await markRead(row.id);
    setDrawerOpen(false);
    if (row.actionUrl?.startsWith('/')) navigate(row.actionUrl);
  }, [markRead, navigate]);

  const openCriticalNotification = useCallback(async (row: GlobalNotification) => {
    setCriticalModalRows([]);
    await openNotification(row);
  }, [openNotification]);

  const unread = useMemo(() => rows.filter((row) => !row.isRead), [rows]);
  const read = useMemo(() => rows.filter((row) => row.isRead), [rows]);
  const criticalUnread = useMemo(() => unread.filter((row) => row.severity === 'critica').length, [unread]);

  const renderRow = (row: GlobalNotification) => (
    <button
      key={row.id}
      type="button"
      onClick={() => void openNotification(row)}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
        row.isRead
          ? 'border-white/[.05] bg-[#08090e] opacity-70 hover:opacity-100'
          : 'border-white/[.09] bg-[#0b0b12] hover:border-fuchsia-500/30 hover:bg-fuchsia-500/[.035]'
      }`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${toneClasses(row.severity)}`}>
        <SeverityIcon severity={row.severity} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-wide text-zinc-600">{row.source}</span>
          <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase ${toneClasses(row.severity)}`}>
            {severityLabel(row.severity)}
          </span>
          {row.status === 'resolvido' && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[.05] px-1.5 py-0.5 text-[8px] font-black uppercase text-emerald-400">Resolvida</span>
          )}
        </span>
        <span className="mt-1 block text-xs font-black text-white">{row.title}</span>
        <span className="mt-1 block text-[10px] leading-relaxed text-zinc-500">{row.message}</span>
        <span className="mt-1 block text-[9px] text-zinc-700">{dateTime(row.createdAt)}</span>
      </span>
      {row.actionUrl ? <ChevronRight className="h-4 w-4 shrink-0 text-zinc-700" /> : row.isRead ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500/60" /> : null}
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-zinc-300 transition hover:bg-white/[.04] active:bg-white/[.06]"
        aria-label="Central de notificações"
        title="Central de notificações"
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[9px] font-black text-black ${criticalUnread > 0 ? 'bg-red-400' : 'bg-[#ffb400]'}`}>
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </button>

      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <section className="fixed inset-x-0 bottom-0 z-[90] max-h-[86vh] overflow-hidden rounded-t-[28px] border-t border-fuchsia-500/30 bg-[#07070d] shadow-[0_-28px_90px_rgba(0,0,0,.72)] md:left-auto md:right-5 md:top-[68px] md:bottom-auto md:w-[470px] md:max-h-[calc(100vh-88px)] md:rounded-2xl md:border">
            <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-white"><Bell className="h-4 w-4 text-fuchsia-400" /> Central de notificações</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">
                  {loading ? 'Atualizando...' : `${unread.length} não lida(s) · ${read.length} lida(s)`}
                </div>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 hover:bg-white/[.05]" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>

            <div className="max-h-[calc(86vh-70px)] overflow-y-auto p-3 md:max-h-[calc(100vh-158px)]">
              {loadError && (
                <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/[.05] p-3 text-[10px] text-red-300">{loadError}</div>
              )}

              {unread.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-[.12em] text-amber-400">
                    <Bell className="h-3.5 w-3.5" /> Não lidas
                  </div>
                  <div className="space-y-2">{unread.map(renderRow)}</div>
                </div>
              )}

              {read.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-[.12em] text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Lidas
                  </div>
                  <div className="space-y-2">{read.map(renderRow)}</div>
                </div>
              )}

              {!loading && !loadError && rows.length === 0 && (
                <div className="py-12 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                  <div className="mt-3 text-sm font-black text-white">Sem notificações</div>
                  <div className="mt-1 text-xs text-zinc-600">Nenhum aviso disponível para o seu escopo de acesso.</div>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-fuchsia-500/15 bg-fuchsia-500/[.04] p-3 text-[10px] leading-relaxed text-zinc-500">
                Abrir a central não altera leituras. Cada notificação é marcada individualmente quando você abre o item.
              </div>
            </div>
          </section>
        </>
      )}

      {criticalModalRows.length > 0 && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/80 p-4 backdrop-blur-md">
          <section className="w-full max-w-xl overflow-hidden rounded-2xl border border-red-500/35 bg-[#09080d] shadow-[0_30px_120px_rgba(0,0,0,.9),0_0_55px_rgba(239,68,68,.16)]">
            <div className="border-b border-red-500/20 bg-red-500/[.055] p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-400/30 bg-red-500/[.1] text-red-300"><CircleAlert className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-[.16em] text-red-400">Alerta crítico</div>
                  <h2 className="mt-1 text-lg font-black text-white">
                    {criticalModalRows.length === 1 ? 'Existe uma pendência crítica ativa' : `Você possui ${criticalModalRows.length} alertas críticos`}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">Fechar este aviso não resolve a pendência. Ela permanecerá ativa até a origem informar a regularização.</p>
                </div>
                <button type="button" onClick={() => setCriticalModalRows([])} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-white/[.05] hover:text-white" aria-label="Fechar alerta crítico"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="max-h-[58vh] space-y-2 overflow-y-auto p-4">
              {criticalModalRows.map((row) => (
                <button key={row.id} type="button" onClick={() => void openCriticalNotification(row)} className="flex w-full items-center gap-3 rounded-xl border border-red-500/15 bg-[#0c0a10] p-3 text-left transition hover:border-red-400/35 hover:bg-red-500/[.035]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-400/30 bg-red-500/[.08] text-red-300"><CircleAlert className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[9px] font-black uppercase tracking-wide text-red-400/70">{row.source}</span>
                    <span className="mt-0.5 block text-xs font-black text-white">{row.title}</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-zinc-500">{row.message}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-700" />
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/[.06] p-4">
              <span className="text-[9px] text-zinc-600">Ciclo operacional {cycleKey?.split(':').slice(-2).join(':') || ''}</span>
              <button type="button" onClick={() => setCriticalModalRows([])} className="rounded-lg border border-white/[.08] bg-white/[.03] px-4 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/[.06]">Fechar por agora</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
