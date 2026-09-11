import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, Fuel, Loader2, X, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type FuelAuthorization = {
  id: string;
  funcionario_nome: string;
  empresa_nome?: string | null;
  filial?: string | null;
  placa?: string | null;
  combustivel?: string | null;
  posto_nome?: string | null;
  solicitado_em: string;
  status: string;
};

const storageKey = 'topac-mobile-notifications-shown';

const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : 'Agora';

export default function AdminRequestNotifications() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FuelAuthorization[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<FuelAuthorization | null>(null);
  const [popup, setPopup] = useState<FuelAuthorization | null>(null);
  const [acting, setActing] = useState('');
  const initialized = useRef(false);
  const shownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) shownIds.current = new Set(saved.map(String));
    } catch {
      shownIds.current = new Set();
    }
  }, []);

  const rememberShown = useCallback((id: string) => {
    shownIds.current.add(id);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...shownIds.current].slice(-100)));
    } catch {
      // Session storage may be unavailable in private/embedded contexts.
    }
  }, []);

  const surfaceLatest = useCallback((pending: FuelAuthorization[]) => {
    const unseen = pending.find(row => !shownIds.current.has(row.id));
    if (!unseen) return;
    rememberShown(unseen.id);
    setPopup(unseen);
  }, [rememberShown]);

  const load = useCallback(async (showNew = true) => {
    const { data, error } = await (supabase as any)
      .from('abastecimento_autorizacoes')
      .select('id,funcionario_nome,empresa_nome,filial,placa,combustivel,posto_nome,solicitado_em,status')
      .eq('status', 'pendente')
      .order('solicitado_em', { ascending: false })
      .limit(30);

    if (error) return;
    const pending = (data || []) as FuelAuthorization[];
    setRows(pending);
    if (showNew || !initialized.current) surfaceLatest(pending);
    initialized.current = true;
  }, [surfaceLatest]);

  useEffect(() => {
    void load(true);

    const timer = window.setInterval(() => void load(true), 15000);
    const channel = (supabase as any)
      .channel('admin-mobile-abastecimento-autorizacoes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'abastecimento_autorizacoes' },
        (payload: any) => {
          const next = payload?.new as FuelAuthorization | undefined;
          if (next?.id && next.status === 'pendente' && !shownIds.current.has(next.id)) {
            rememberShown(next.id);
            setPopup(next);
          }
          void load(false);
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      void (supabase as any).removeChannel(channel);
    };
  }, [load, rememberShown]);

  const openRequest = (row: FuelAuthorization) => {
    rememberShown(row.id);
    setPopup(null);
    setSelected(row);
    setDrawerOpen(true);
  };

  const decide = async (row: FuelAuthorization, decision: 'autorizar' | 'negar') => {
    setActing(row.id);
    try {
      const { error } = await (supabase as any).rpc('topac_decidir_abastecimento', {
        p_id: row.id,
        p_decisao: decision,
      });
      if (error) throw error;

      toast.success(decision === 'autorizar' ? 'Abastecimento autorizado.' : 'Solicitação negada.');
      setRows(current => current.filter(item => item.id !== row.id));
      setSelected(null);
      if (rows.length <= 1) setDrawerOpen(false);
      await load(false);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível registrar a decisão.');
    } finally {
      setActing('');
    }
  };

  const openCentral = () => {
    setPopup(null);
    setDrawerOpen(false);
    setSelected(null);
    navigate('/admin/app-mecanico');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setSelected(null); setDrawerOpen(true); }}
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-zinc-300 transition active:bg-white/[.06]"
        aria-label="Solicitações pendentes"
      >
        <Bell className="h-5 w-5" />
        {rows.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#ffb400] px-1 text-[9px] font-black text-black shadow-[0_0_14px_rgba(255,180,0,.35)]">
            {rows.length > 99 ? '99+' : rows.length}
          </span>
        )}
      </button>

      {popup && (
        <div className="fixed inset-x-3 bottom-[92px] z-[80] animate-in slide-in-from-bottom-8 fade-in duration-300">
          <div className="flex items-start gap-3 overflow-hidden rounded-2xl border border-amber-400/35 bg-[#0a0910]/98 p-4 text-left shadow-[0_24px_80px_rgba(0,0,0,.72),0_0_35px_rgba(245,158,11,.10)] backdrop-blur-xl">
            <button type="button" onClick={() => openRequest(popup)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-400">
                <Fuel className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.08em] text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> Nova solicitação
                </span>
                <span className="mt-1 block truncate text-sm font-black text-white">{popup.funcionario_nome}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">{popup.placa || 'Sem placa'} · {popup.combustivel || 'Combustível'} · {popup.posto_nome || 'Posto'}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-fuchsia-400">Toque para liberar <ChevronRight className="h-3.5 w-3.5" /></span>
              </span>
            </button>
            <button type="button" aria-label="Fechar notificação" onClick={() => setPopup(null)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-zinc-600 active:bg-white/[.06]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm" onClick={() => { setDrawerOpen(false); setSelected(null); }} />
          <section className="fixed inset-x-0 bottom-0 z-[90] max-h-[82vh] animate-in slide-in-from-bottom duration-300 overflow-hidden rounded-t-[28px] border-t border-fuchsia-500/30 bg-[#07070d] shadow-[0_-28px_90px_rgba(0,0,0,.72)]">
            <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-zinc-700" />
            <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-white"><Bell className="h-4 w-4 text-fuchsia-400" /> Solicitações</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">{rows.length} aguardando liberação</div>
              </div>
              <button type="button" onClick={() => { setDrawerOpen(false); setSelected(null); }} className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 active:bg-white/[.06]" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>

            <div className="max-h-[calc(82vh-82px)] overflow-y-auto p-4 pb-[max(22px,env(safe-area-inset-bottom))]">
              {selected ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[.05] p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-400"><Fuel className="h-6 w-6" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-black text-white">{selected.funcionario_nome}</div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">{selected.empresa_nome || 'TOPAC'}{selected.filial ? ` · ${selected.filial}` : ''}</div>
                        <div className="mt-2 text-[10px] text-zinc-600">Solicitado em {dateTime(selected.solicitado_em)}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/[.06] bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wide text-zinc-600">Veículo</div><div className="mt-1 text-sm font-bold text-white">{selected.placa || 'Não informado'}</div></div>
                      <div className="rounded-xl border border-white/[.06] bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wide text-zinc-600">Combustível</div><div className="mt-1 text-sm font-bold text-white">{selected.combustivel || 'Não informado'}</div></div>
                      <div className="col-span-2 rounded-xl border border-white/[.06] bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wide text-zinc-600">Posto</div><div className="mt-1 text-sm font-bold text-white">{selected.posto_nome || 'Não informado'}</div></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={acting === selected.id}
                      onClick={() => void decide(selected, 'negar')}
                      className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-400 disabled:opacity-50"
                    >
                      {acting === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Negar
                    </button>
                    <button
                      type="button"
                      disabled={acting === selected.id}
                      onClick={() => void decide(selected, 'autorizar')}
                      className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-400 disabled:opacity-50"
                    >
                      {acting === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Autorizar
                    </button>
                  </div>

                  <button type="button" onClick={() => setSelected(null)} className="w-full rounded-xl py-2 text-xs font-bold text-zinc-500">Voltar para solicitações</button>
                </div>
              ) : rows.length ? (
                <div className="space-y-2">
                  {rows.map(row => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => openRequest(row)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-white/[.07] bg-[#0a0a11] p-3 text-left transition active:border-fuchsia-500/30 active:bg-fuchsia-500/[.05]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-400"><Fuel className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-white">{row.funcionario_nome}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-zinc-500">{row.placa || 'Sem placa'} · {row.combustivel || 'Combustível'} · {row.posto_nome || 'Posto'}</span>
                        <span className="mt-1 block text-[9px] text-zinc-700">{dateTime(row.solicitado_em)}</span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-zinc-700" />
                    </button>
                  ))}
                  <button type="button" onClick={openCentral} className="mt-2 w-full rounded-xl border border-fuchsia-500/20 py-3 text-xs font-bold text-fuchsia-400">Abrir Central do App Mecânico</button>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                  <div className="mt-3 text-sm font-black text-white">Tudo liberado</div>
                  <div className="mt-1 text-xs text-zinc-600">Nenhuma solicitação aguardando decisão.</div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
