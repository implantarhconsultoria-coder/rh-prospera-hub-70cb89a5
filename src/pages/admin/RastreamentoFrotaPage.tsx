import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Power,
  Radar,
  RefreshCw,
  Save,
  Satellite,
  ShieldAlert,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const db = supabase as any;

const DAYS = [
  { id: 1, label: 'Segunda-feira' },
  { id: 2, label: 'Terça-feira' },
  { id: 3, label: 'Quarta-feira' },
  { id: 4, label: 'Quinta-feira' },
  { id: 5, label: 'Sexta-feira' },
  { id: 6, label: 'Sábado' },
  { id: 0, label: 'Domingo' },
];

type Config = {
  provider: string;
  status: string;
  timezone: string;
  tolerancia_minutos: number;
  regras_ativas: boolean;
  ultima_sincronizacao_em?: string | null;
};

type Schedule = {
  dia_semana: number;
  ativo: boolean;
  hora_inicio: string | null;
  hora_fim: string | null;
};

type TrackerEvent = {
  id: string;
  placa: string;
  tipo: string;
  ignicao?: boolean | null;
  evento_em: string;
  evento_em_local?: string | null;
  endereco?: string | null;
  velocidade_kmh?: number | null;
  fora_horario?: boolean | null;
};

type FleetVehicle = {
  id: string;
  placa: string;
  descricao?: string | null;
  status?: string | null;
};

type VehiclePoint = {
  veiculo_placa: string;
  funcionario_nome: string;
  status: string;
  saida_em: string;
  chegada_em?: string | null;
};

const normalizePlate = (value?: string | null) => String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const hhmm = (value?: string | null) => (value ? String(value).slice(0, 5) : '');
const pad = (value: number) => String(value).padStart(2, '0');

const localDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
};

const eventLabel = (event: TrackerEvent) => {
  const kind = String(event.tipo || '').toLowerCase();
  if (kind.includes('ign') || event.ignicao != null) return event.ignicao === false ? 'Ignição desligada' : 'Ignição ligada';
  if (kind.includes('pos')) return 'Posição';
  return event.tipo || 'Evento';
};

export default function RastreamentoFrotaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Config>({
    provider: 'grtracker',
    status: 'aguardando_acesso',
    timezone: 'America/Sao_Paulo',
    tolerancia_minutos: 0,
    regras_ativas: false,
  });
  const [schedules, setSchedules] = useState<Schedule[]>(
    DAYS.map((day) => ({ dia_semana: day.id, ativo: false, hora_inicio: null, hora_fim: null })),
  );
  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [points, setPoints] = useState<VehiclePoint[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const sinceDate = localDateKey(since);

      const [configRes, scheduleRes, eventsRes, vehiclesRes, pointsRes] = await Promise.all([
        db.from('rastreamento_configuracao').select('*').eq('provider', 'grtracker').maybeSingle(),
        db.from('rastreamento_janelas_servico').select('*').order('dia_semana'),
        db.from('rastreamento_eventos_classificados')
          .select('id,placa,tipo,ignicao,evento_em,evento_em_local,endereco,velocidade_kmh,fora_horario')
          .order('evento_em', { ascending: false })
          .limit(250),
        db.from('ativos')
          .select('id,placa,descricao,status')
          .eq('tipo', 'veiculo')
          .eq('status', 'ativo')
          .not('placa', 'is', null)
          .order('placa'),
        db.from('ponto_veiculo')
          .select('veiculo_placa,funcionario_nome,status,saida_em,chegada_em')
          .gte('data', sinceDate)
          .order('saida_em', { ascending: false })
          .limit(800),
      ]);

      const fatal = [configRes, scheduleRes, eventsRes].find((result) => result.error);
      if (fatal?.error) throw fatal.error;

      if (configRes.data) setConfig(configRes.data as Config);
      if (Array.isArray(scheduleRes.data)) {
        const byDay = new Map<number, Schedule>(scheduleRes.data.map((row: Schedule) => [Number(row.dia_semana), row]));
        setSchedules(DAYS.map((day) => {
          const row = byDay.get(day.id);
          return row
            ? { ...row, hora_inicio: hhmm(row.hora_inicio), hora_fim: hhmm(row.hora_fim) }
            : { dia_semana: day.id, ativo: false, hora_inicio: null, hora_fim: null };
        }));
      }
      setEvents(Array.isArray(eventsRes.data) ? eventsRes.data : []);
      setVehicles(Array.isArray(vehiclesRes.data) ? vehiclesRes.data : []);
      setPoints(Array.isArray(pointsRes.data) ? pointsRes.data : []);
    } catch (error: any) {
      console.error('Falha ao carregar rastreamento da frota:', error);
      toast.error(`Não foi possível carregar o rastreamento: ${error?.message || 'erro inesperado'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener('topac:refresh-current', refresh as EventListener);
    return () => window.removeEventListener('topac:refresh-current', refresh as EventListener);
  }, [load]);

  const setSchedule = (day: number, patch: Partial<Schedule>) => {
    setSchedules((current) => current.map((row) => row.dia_semana === day ? { ...row, ...patch } : row));
  };

  const saveSchedule = async () => {
    const invalid = schedules.find((row) => row.ativo && (!row.hora_inicio || !row.hora_fim));
    if (invalid) {
      toast.error('Preencha início e fim de todos os dias de serviço ativados.');
      return;
    }

    const hasRule = schedules.some((row) => row.ativo);
    setSaving(true);
    try {
      const rows = schedules.map((row) => ({
        dia_semana: row.dia_semana,
        ativo: row.ativo,
        hora_inicio: row.ativo ? row.hora_inicio : null,
        hora_fim: row.ativo ? row.hora_fim : null,
        updated_at: new Date().toISOString(),
      }));

      const { error: scheduleError } = await db.from('rastreamento_janelas_servico').upsert(rows, { onConflict: 'dia_semana' });
      if (scheduleError) throw scheduleError;

      const { error: configError } = await db.from('rastreamento_configuracao').upsert({
        provider: 'grtracker',
        status: config.status || 'aguardando_acesso',
        timezone: 'America/Sao_Paulo',
        tolerancia_minutos: Number(config.tolerancia_minutos || 0),
        regras_ativas: hasRule,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider' });
      if (configError) throw configError;

      setConfig((current) => ({ ...current, regras_ativas: hasRule }));
      toast.success(hasRule ? 'Horários de serviço salvos e monitoramento ativado.' : 'Horários salvos. Regras permanecem desativadas.');
      await load();
    } catch (error: any) {
      console.error('Erro ao salvar regras de rastreamento:', error);
      toast.error(`Não foi possível salvar: ${error?.message || 'erro inesperado'}`);
    } finally {
      setSaving(false);
    }
  };

  const driverForEvent = useCallback((event: TrackerEvent) => {
    const plate = normalizePlate(event.placa);
    const time = new Date(event.evento_em).getTime();
    if (!plate || Number.isNaN(time)) return null;
    return points.find((point) => {
      if (normalizePlate(point.veiculo_placa) !== plate) return false;
      const start = new Date(point.saida_em).getTime();
      const end = point.chegada_em ? new Date(point.chegada_em).getTime() : start + (24 * 60 * 60 * 1000);
      return time >= start && time <= end;
    }) || null;
  }, [points]);

  const todayKey = localDateKey(new Date());
  const outside = useMemo(() => events.filter((event) => event.fora_horario === true), [events]);
  const outsideToday = useMemo(() => outside.filter((event) => {
    const date = new Date(event.evento_em);
    return !Number.isNaN(date.getTime()) && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date) === todayKey;
  }), [outside, todayKey]);
  const connectionReady = String(config.status || '').toLowerCase() === 'conectado';

  if (loading) {
    return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-400" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-violet-400"><Radar className="h-4 w-4" /> Controle de frota</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Uso fora do expediente</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">Preparado para cruzar eventos do GR Tracker com o Ponto do Carro e identificar automaticamente uso de veículos fora do período de serviço.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="border-zinc-700 bg-zinc-950 text-zinc-200"><RefreshCw className="mr-2 h-4 w-4" /> Atualizar</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-zinc-800 bg-[#080b10] p-4 text-white">
          <div className="flex items-center justify-between"><span className="text-xs text-zinc-500">GR Tracker</span>{connectionReady ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Unplug className="h-5 w-5 text-amber-400" />}</div>
          <div className={`mt-3 text-lg font-bold ${connectionReady ? 'text-emerald-300' : 'text-amber-300'}`}>{connectionReady ? 'Conectado' : 'Aguardando acesso'}</div>
          <div className="mt-1 text-xs text-zinc-600">{config.ultima_sincronizacao_em ? `Última sincronização: ${formatDateTime(config.ultima_sincronizacao_em)}` : 'Nenhuma sincronização realizada'}</div>
        </Card>
        <Card className="border-zinc-800 bg-[#080b10] p-4 text-white">
          <div className="flex items-center justify-between"><span className="text-xs text-zinc-500">Frota cadastrada</span><Car className="h-5 w-5 text-violet-400" /></div>
          <div className="mt-3 text-2xl font-black">{vehicles.length}</div>
          <div className="mt-1 text-xs text-zinc-600">veículos ativos encontrados no TOPAC</div>
        </Card>
        <Card className="border-zinc-800 bg-[#080b10] p-4 text-white">
          <div className="flex items-center justify-between"><span className="text-xs text-zinc-500">Fora do horário hoje</span><ShieldAlert className="h-5 w-5 text-red-400" /></div>
          <div className="mt-3 text-2xl font-black text-red-300">{outsideToday.length}</div>
          <div className="mt-1 text-xs text-zinc-600">eventos classificados automaticamente</div>
        </Card>
        <Card className="border-zinc-800 bg-[#080b10] p-4 text-white">
          <div className="flex items-center justify-between"><span className="text-xs text-zinc-500">Regras de horário</span><Clock3 className="h-5 w-5 text-amber-400" /></div>
          <div className={`mt-3 text-lg font-bold ${config.regras_ativas ? 'text-emerald-300' : 'text-zinc-300'}`}>{config.regras_ativas ? 'Ativas' : 'A configurar'}</div>
          <div className="mt-1 text-xs text-zinc-600">sem regra não haverá falso alerta</div>
        </Card>
      </div>

      {!connectionReady && (
        <Card className="border-amber-500/25 bg-amber-500/[.07] p-4">
          <div className="flex items-start gap-3">
            <Satellite className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <div className="font-semibold text-amber-200">Estrutura pronta — falta somente o acesso da GR Tracker</div>
              <p className="mt-1 text-sm text-amber-100/65">Não estamos inventando API nem salvando senha no navegador. Assim que o acesso for validado, a integração será ligada ao servidor e os eventos reais de ignição/localização passam a alimentar esta tela.</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card className="border-zinc-800 bg-[#080b10] p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">Período autorizado de serviço</h2>
              <p className="mt-1 text-xs text-zinc-500">Dia desligado = qualquer uso nesse dia será considerado fora do expediente.</p>
            </div>
            <Clock3 className="h-5 w-5 text-violet-400" />
          </div>

          <div className="mt-4 space-y-2.5">
            {DAYS.map((day) => {
              const row = schedules.find((item) => item.dia_semana === day.id) || { dia_semana: day.id, ativo: false, hora_inicio: null, hora_fim: null };
              return (
                <div key={day.id} className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-zinc-200">{day.label}</span>
                    <Switch checked={row.ativo} onCheckedChange={(checked) => setSchedule(day.id, { ativo: checked })} />
                  </div>
                  {row.ativo && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div><Label className="text-[11px] text-zinc-500">Início</Label><Input type="time" value={hhmm(row.hora_inicio)} onChange={(event) => setSchedule(day.id, { hora_inicio: event.target.value })} className="mt-1 border-zinc-700 bg-zinc-950 text-white" /></div>
                      <div><Label className="text-[11px] text-zinc-500">Fim</Label><Input type="time" value={hhmm(row.hora_fim)} onChange={(event) => setSchedule(day.id, { hora_fim: event.target.value })} className="mt-1 border-zinc-700 bg-zinc-950 text-white" /></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <Label className="text-xs text-zinc-400">Tolerância do horário (minutos)</Label>
            <Input type="number" min={0} max={180} value={config.tolerancia_minutos} onChange={(event) => setConfig((current) => ({ ...current, tolerancia_minutos: Math.max(0, Math.min(180, Number(event.target.value || 0))) }))} className="mt-1 border-zinc-700 bg-zinc-950 text-white" />
          </div>

          <Button onClick={() => void saveSchedule()} disabled={saving} className="mt-4 w-full bg-violet-600 text-white hover:bg-violet-500">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar regras de horário
          </Button>
        </Card>

        <Card className="overflow-hidden border-zinc-800 bg-[#080b10] text-white">
          <div className="flex items-center justify-between border-b border-zinc-800 p-5">
            <div>
              <h2 className="font-bold">Eventos da frota</h2>
              <p className="mt-1 text-xs text-zinc-500">Ignição, horário, localização e cruzamento com o Ponto do Carro.</p>
            </div>
            <div className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-400">{events.length} eventos</div>
          </div>

          {events.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <Radar className="h-12 w-12 text-zinc-700" />
              <div className="mt-4 font-semibold text-zinc-300">Nenhum evento do rastreador recebido ainda</div>
              <p className="mt-2 max-w-md text-sm text-zinc-600">Assim que conectarmos o GR Tracker, os eventos reais aparecerão aqui. Nenhum dado fictício será criado.</p>
            </div>
          ) : (
            <div className="max-h-[760px] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-[#0c1016] text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr><th className="px-4 py-3">Status</th><th className="px-4 py-3">Veículo</th><th className="px-4 py-3">Evento</th><th className="px-4 py-3">Data / hora</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Local</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {events.map((event) => {
                    const point = driverForEvent(event);
                    return (
                      <tr key={event.id} className="align-top hover:bg-white/[.02]">
                        <td className="px-4 py-3">
                          {event.fora_horario === true ? <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-xs font-bold text-red-300"><AlertTriangle className="h-3.5 w-3.5" /> Fora do horário</span>
                            : event.fora_horario === false ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Normal</span>
                              : <span className="inline-flex rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-400">Sem regra</span>}
                        </td>
                        <td className="px-4 py-3"><strong className="text-zinc-100">{event.placa}</strong></td>
                        <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-zinc-300"><Power className="h-3.5 w-3.5 text-violet-400" />{eventLabel(event)}</span>{event.velocidade_kmh != null && <div className="mt-1 text-xs text-zinc-600">{Number(event.velocidade_kmh)} km/h</div>}</td>
                        <td className="px-4 py-3 text-zinc-300">{formatDateTime(event.evento_em)}</td>
                        <td className="px-4 py-3">{point ? <><div className="font-medium text-zinc-200">{point.funcionario_nome}</div><div className="mt-0.5 text-xs text-zinc-600">Ponto do Carro</div></> : <span className="text-zinc-600">Não identificado</span>}</td>
                        <td className="max-w-[300px] px-4 py-3 text-zinc-400">{event.endereco ? <span className="inline-flex gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />{event.endereco}</span> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
