import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, ChevronRight, Fuel, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

type FuelAuthorization = {
  id: string;
  funcionario_nome: string;
  empresa_nome?: string | null;
  filial?: string | null;
  placa?: string | null;
  combustivel?: string | null;
  posto_nome?: string | null;
  solicitado_em: string;
  autorizado_em?: string | null;
  autorizado_por_nome?: string | null;
  status: string;
};

const storageKey = 'topac-fuel-release-notifications-shown';
const RECENT_HOURS = 12;

const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : 'Agora';

export default function AdminRequestNotifications() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FuelAuthorization[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<FuelAuthorization | null>(null);
  const [popup, setPopup] = useState<FuelAuthorization | null>(null);
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

  const surfaceLatest = useCallback((released: FuelAuthorization[]) => {
    const unseen = released.find(row => !shownIds.current.has(row.id));
    if (!unseen) return;
    rememberShown(unseen.id);
    setPopup(unseen);
  }, [rememberShown]);

  const load = useCallback(async (showNew = true) => {
    const since = new Date(Date.now() - RECENT_HOURS * 60 * 60 * 1000).toISOString();
    const { data, error } = await (supabase as any)
      .from('abastecimento_autorizacoes')
      .select('id,funcionario_nome,empresa_nome,filial,placa,combustivel,posto_nome,solicitado_em,autorizado_em,autorizado_por_nome,status')
      .eq('status', 'autorizado')
      .eq('autorizado_por_nome', 'Sistema TOPAC')
      .gte('solicitado_em', since)
      .order('autorizado_em', { ascending: false })
      .limit(30);

    if (error) return;
    const released = (data || []) as FuelAuthorization[];
    setRows(released);
    if (showNew || !initialized.current) surfaceLatest(released);
    initialized.current = true;
  }, [surfaceLatest]);

  useEffect(() => {
    void load(true);

    const timer = window.setInterval(() => void load(true), 15000);
    const channel = (supabase as any)
      .channel('admin-abastecimento-liberacoes-automaticas')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'abastecimento_autorizacoes' },
        (payload: any) => {
          const next = payload?.new as FuelAuthorization | undefined;
          if (next?.id && next.status === 'autorizado' && next.autorizado_por_nome === 'Sistema TOPAC' && !shownIds.current.has(next.id)) {
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
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-zinc-300 transition hover:bg-white/[.04] active:bg-white/[.06]"
        aria-label="Abastecimentos liberados"
        title="Abastecimentos liberados"
      >
        <Bell className="h-5 w-5" />
        {rows.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#ffb400] px-1 text-[9px] font-black text-black shadow-[0_0_14px_rgba(255,180,0,.35)]">
            {rows.length > 99 ? '99+' : rows.length}
          </span>
        )}
      </button>

      {popup && (
        <div className="fixed inset-x-3 bottom-[92px] z-[80] animate-in slide-in-from-bottom-8 fade-in duration-300 md:left-auto md:right-6 md:bottom-20 md:w-[420px]">
          <div className="flex items-start gap-3 overflow-hidden rounded-2xl border border-emerald-400/35 bg-[#0a0910]/98 p-4 text-left shadow-[0_24px_80px_rgba(0,0,0,.72),0_0_35px_rgba(16,185,129,.10)] backdrop-blur-xl">
            <button type="button" onClick={() => openRequest(popup)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-400">
                <Fuel className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.08em] text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Abastecimento liberado
                </span>
                <span className="mt-1 block truncate text-sm font-black text-white">{popup.funcionario_nome}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">{popup.placa || 'Sem placa'} · {popup.combustivel || 'Combustível'} · {popup.posto_nome || 'Posto'}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-fuchsia-400">Ver registro <ChevronRight className="h-3.5 w-3.5" /></span>
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
          <section className="fixed inset-x-0 bottom-0 z-[90] max-h-[82vh] animate-in slide-in-from-bottom duration-300 overflow-hidden rounded-t-[28px] border-t border-fuchsia-500/30 bg-[#07070d] shadow-[0_-28px_90px_rgba(0,0,0,.72)] md:left-auto md:right-6 md:bottom-6 md:w-[430px] md:rounded-[28px] md:border">
            <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-zinc-700" />
            <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-white"><Bell className="h-4 w-4 text-fuchsia-400" /> Notificações de abastecimento</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">{rows.length} liberação(ões) automática(s) nas últimas {RECENT_HOURS}h</div>
              </div>
              <button type="button" onClick={() => { setDrawerOpen(false); setSelected(null); }} className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 active:bg-white/[.06]" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>

            <div className="max-h-[calc(82vh-82px)] overflow-y-auto p-4 pb-[max(22px,env(safe-area-inset-bottom))]">
              {selected ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[.05] p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-400"><Fuel className="h-6 w-6" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-black text-white">{selected.funcionario_nome}</div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">{selected.empresa_nome || 'TOPAC'}{selected.filial ? ` · ${selected.filial}` : ''}</div>
                        <div className="mt-2 text-[10px] text-zinc-600">Liberado em {dateTime(selected.autorizado_em || selected.solicitado_em)}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/[.06] bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wide text-zinc-600">Veículo</div><div className="mt-1 text-sm font-bold text-white">{selected.placa || 'Não informado'}</div></div>
                      <div className="rounded-xl border border-white/[.06] bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wide text-zinc-600">Combustível</div><div className="mt-1 text-sm font-bold text-white">{selected.combustivel || 'Não informado'}</div></div>
                      <div className="col-span-2 rounded-xl border border-white/[.06] bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wide text-zinc-600">Posto</div><div className="mt-1 text-sm font-bold text-white">{selected.posto_nome || 'Não informado'}</div></div>
                    </div>

                    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[.06] p-3 text-[11px] leading-relaxed text-emerald-300">
                      Liberação automática concluída após o envio ao WhatsApp. Nenhuma aprovação sua é necessária.
                    </div>
                  </div>

                  <button type="button" onClick={openCentral} className="w-full rounded-xl border border-fuchsia-500/20 py-3 text-xs font-bold text-fuchsia-400">Abrir Central do App Mecânico</button>
                  <button type="button" onClick={() => setSelected(null)} className="w-full rounded-xl py-2 text-xs font-bold text-zinc-500">Voltar para notificações</button>
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
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"><Fuel className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-white">{row.funcionario_nome}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-zinc-500">{row.placa || 'Sem placa'} · {row.combustivel || 'Combustível'} · {row.posto_nome || 'Posto'}</span>
                        <span className="mt-1 block text-[9px] text-zinc-700">{dateTime(row.autorizado_em || row.solicitado_em)}</span>
                      </span>
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-black text-emerald-400">LIBERADO</span>
                      <ChevronRight className="h-5 w-5 text-zinc-700" />
                    </button>
                  ))}
                  <button type="button" onClick={openCentral} className="mt-2 w-full rounded-xl border border-fuchsia-500/20 py-3 text-xs font-bold text-fuchsia-400">Abrir Central do App Mecânico</button>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                  <div className="mt-3 text-sm font-black text-white">Sem liberações recentes</div>
                  <div className="mt-1 text-xs text-zinc-600">Quando alguém solicitar e enviar ao WhatsApp, a liberação aparecerá aqui.</div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
