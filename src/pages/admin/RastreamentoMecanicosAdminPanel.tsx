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
const TZ = 'America/Sao_Paulo';

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
  endereco?: string | null;
  velocidade_kmh?: number | null;
  fora_horario?: boolean | null;
};

type VehiclePoint = {
  veiculo_placa: string;
  funcionario_nome: string;
  saida_em: string;
  chegada_em?: string | null;
};

type AppVehicle = {
  placa: string;
  descricao?: string | null;
  responsavel?: string | null;
  empresa?: string | null;
};

type DashboardMechanic = {
  nome?: string;
  empresa?: string;
  veiculo_atribuido?: { placa?: string | null; veiculo?: string | null };
  km?: { placa?: string | null; veiculo?: string | null };
};

const normalizePlate = (value?: string | null) => String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const hhmm = (value?: string | null) => value ? String(value).slice(0, 5) : '';
const localDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ }).format(date);
};

const eventLabel = (event: TrackerEvent) => {
  const type = String(event.tipo || '').toLowerCase();
  if (type.includes('ign') || event.ignicao != null) return event.ignicao === false ? 'Ignição desligada' : 'Ignição ligada';
  if (type.includes('pos')) return 'Posição';
  return event.tipo || 'Evento';
};

export default function RastreamentoMecanicosAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Config>({
    provider: 'grtracker',
    status: 'aguardando_acesso',
    timezone: TZ,
    tolerancia_minutos: 0,
    regras_ativas: false,
  });
  const [schedules, setSchedules] = useState<Schedule[]>(DAYS.map((day) => ({
    dia_semana: day.id,
    ativo: false,
    hora_inicio: null,
    hora_fim: null,
  })));
  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [vehicles, setVehicles] = useState<AppVehicle[]>([]);
  const [points, setPoints] = useState<VehiclePoint[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 14);

      const [configRes, scheduleRes, eventsRes, dashboardRes, pointsRes] = await Promise.all([
        db.from('rastreamento_configuracao').select('*').eq('provider', 'grtracker').maybeSingle(),
        db.from('rastreamento_janelas_servico').select('*').order('dia_semana'),
        db.from('rastreamento_eventos_classificados')
          .select('id,placa,tipo,ignicao,evento_em,endereco,velocidade_kmh,fora_horario')
          .order('evento_em', { ascending: false })
          .limit(500),
        db.rpc('admin_app_mecanicos_dashboard'),
        db.from('ponto_veiculo')
          .select('veiculo_placa,funcionario_nome,saida_em,chegada_em')
          .gte('data', localDate(since))
          .order('saida_em', { ascending: false })
          .limit(1000),
      ]);

      const fatal = [configRes, scheduleRes, eventsRes, dashboardRes].find((result) => result.error);
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

      const dashboard = dashboardRes.data || {};
      const mechanics = Array.isArray(dashboard?.mecanicos) ? dashboard.mecanicos as DashboardMechanic[] : [];
      const vehicleMap = new Map<string, AppVehicle>();
      mechanics.forEach((mechanic) => {
        const assignedPlate = normalizePlate(mechanic.veiculo_atribuido?.placa || mechanic.km?.placa);
        if (!assignedPlate) return;
        const current = vehicleMap.get(assignedPlate);
        vehicleMap.set(assignedPlate, {
          placa: assignedPlate,
          descricao: mechanic.veiculo_atribuido?.veiculo || mechanic.km?.veiculo || current?.descricao || null,
          responsavel: mechanic.nome || current?.responsavel || null,
          empresa: mechanic.empresa || current?.empresa || null,
        });
      });

      const appVehicles = [...vehicleMap.values()].sort((a, b) => a.placa.localeCompare(b.placa));
      const allowed = new Set(appVehicles.map((vehicle) => normalizePlate(vehicle.placa)));

      setVehicles(appVehicles);
      setEvents((Array.isArray(eventsRes.data) ? eventsRes.data : []).filter((event: TrackerEvent) => allowed.has(normalizePlate(event.placa))));
      setPoints((Array.isArray(pointsRes.data) ? pointsRes.data : []).filter((point: VehiclePoint) => allowed.has(normalizePlate(point.veiculo_placa))));
    } catch (error: any) {
      console.error('Falha ao carregar rastreamento dos mecânicos:', error);
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

  const saveSchedule = async () => {
    const invalid = schedules.find((row) => row.ativo && (!row.hora_inicio || !row.hora_fim));
    if (invalid) {
      toast.error('Preencha início e fim de todos os dias ativados.');
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
        timezone: TZ,
        tolerancia_minutos: Number(config.tolerancia_minutos || 0),
        regras_ativas: hasRule,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider' });
      if (configError) throw configError;

      toast.success(hasRule ? 'Horários salvos e regra ativada.' : 'Horários salvos. Regra ainda desativada.');
      await load();
    } catch (error: any) {
      toast.error(`Não foi possível salvar: ${error?.message || 'erro inesperado'}`);
    } finally {
      setSaving(false);
    }
  };

  const pointForEvent = useCallback((event: TrackerEvent) => {
    const plate = normalizePlate(event.placa);
    const eventTime = new Date(event.evento_em).getTime();
    if (!plate || Number.isNaN(eventTime)) return null;
    return points.find((point) => {
      if (normalizePlate(point.veiculo_placa) !== plate) return false;
      const start = new Date(point.saida_em).getTime();
      const end = point.chegada_em ? new Date(point.chegada_em).getTime() : start + 24 * 60 * 60 * 1000;
      return eventTime >= start && eventTime <= end;
    }) || null;
  }, [points]);

  const vehicleForEvent = useCallback((event: TrackerEvent) => vehicles.find((vehicle) => normalizePlate(vehicle.placa) === normalizePlate(event.placa)) || null, [vehicles]);

  const outside = useMemo(() => events.filter((event) => event.fora_horario === true), [events]);
  const today = localDate(new Date());
  const outsideToday = useMemo(() => outside.filter((event) => localDate(new Date(event.evento_em)) === today), [outside, today]);
  const connectionReady = String(config.status || '').toLowerCase() === 'conectado';

  if (loading) {
    return <div className="flex min-h-[260px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-400" /></div>;
  }

  return (
    <section className="space-y-4 rounded-xl border border-fuchsia-500/15 bg-[#07070d] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Radar className="h-5 w-5 text-amber-400" /><h2 className="text-lg font-black text-white">Rastreamento dos veículos do App Mecânicos</h2></div>
          <p className="mt-1 text-xs text-zinc-500">Área exclusiva da administração. Só entram aqui os veículos atualmente vinculados aos mecânicos no próprio app.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
          <div className="flex items-center justify-between text-xs text-zinc-500"><span>GR Tracker</span>{connectionReady ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Unplug className="h-5 w-5 text-amber-400" />}</div>
          <div className={`mt-3 text-lg font-black ${connectionReady ? 'text-emerald-300' : 'text-amber-300'}`}>{connectionReady ? 'Conectado' : 'Aguardando acesso'}</div>
        </Card>
        <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
          <div className="flex items-center justify-between text-xs text-zinc-500"><span>Veículos do app</span><Car className="h-5 w-5 text-fuchsia-400" /></div>
          <div className="mt-3 text-2xl font-black">{vehicles.length}</div>
          <div className="mt-1 text-xs text-zinc-600">não usa a frota geral de 133 veículos</div>
        </Card>
        <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
          <div className="flex items-center justify-between text-xs text-zinc-500"><span>Fora do horário hoje</span><ShieldAlert className="h-5 w-5 text-red-400" /></div>
          <div className="mt-3 text-2xl font-black text-red-300">{outsideToday.length}</div>
          <div className="mt-1 text-xs text-zinc-600">somente placas vinculadas no app</div>
        </Card>
        <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
          <div className="flex items-center justify-between text-xs text-zinc-500"><span>Regra de horário</span><Clock3 className="h-5 w-5 text-amber-400" /></div>
          <div className={`mt-3 text-lg font-black ${config.regras_ativas ? 'text-emerald-300' : 'text-zinc-300'}`}>{config.regras_ativas ? 'Ativa' : 'A configurar'}</div>
        </Card>
      </div>

      {!connectionReady && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[.06] p-3">
          <Satellite className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div><strong className="text-sm text-amber-200">Aguardando o acesso da GR Tracker</strong><p className="mt-1 text-xs text-amber-100/60">Assim que a conexão real for liberada, ignição, horário e localização serão cruzados com KM/Ponto do Carro nesta mesma tela administrativa.</p></div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[390px_1fr]">
        <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
          <div className="mb-4"><h3 className="font-black">Período autorizado</h3><p className="mt-1 text-xs text-zinc-600">Defina quando um veículo pode circular sem gerar alerta.</p></div>
          <div className="space-y-2">
            {DAYS.map((day) => {
              const row = schedules.find((item) => item.dia_semana === day.id)!;
              return (
                <div key={day.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-white/5 bg-black/20 p-2.5">
                  <div className="flex items-center gap-2"><Switch checked={row.ativo} onCheckedChange={(ativo) => setSchedules((current) => current.map((item) => item.dia_semana === day.id ? { ...item, ativo } : item))} /><span className="text-sm text-zinc-300">{day.label}</span></div>
                  <div className="flex items-center gap-1.5">
                    <Input type="time" value={row.hora_inicio || ''} disabled={!row.ativo} onChange={(e) => setSchedules((current) => current.map((item) => item.dia_semana === day.id ? { ...item, hora_inicio: e.target.value } : item))} className="h-8 w-[104px]" />
                    <span className="text-xs text-zinc-600">até</span>
                    <Input type="time" value={row.hora_fim || ''} disabled={!row.ativo} onChange={(e) => setSchedules((current) => current.map((item) => item.dia_semana === day.id ? { ...item, hora_fim: e.target.value } : item))} className="h-8 w-[104px]" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <Label className="text-xs text-zinc-500">Tolerância em minutos</Label>
            <Input type="number" min={0} max={180} value={config.tolerancia_minutos} onChange={(e) => setConfig((current) => ({ ...current, tolerancia_minutos: Math.max(0, Math.min(180, Number(e.target.value || 0))) }))} className="mt-1" />
          </div>
          <Button className="mt-4 w-full" onClick={() => void saveSchedule()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar horários</Button>
        </Card>

        <div className="space-y-4">
          <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
            <h3 className="font-black">Veículos monitorados no App Mecânicos</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {vehicles.map((vehicle) => (
                <div key={vehicle.placa} className="rounded-lg border border-white/5 bg-black/20 p-3">
                  <strong className="text-sm text-fuchsia-300">{vehicle.placa}</strong>
                  <div className="mt-1 truncate text-xs text-zinc-500">{vehicle.descricao || 'Veículo'}</div>
                  <div className="mt-2 text-[11px] text-zinc-600">Responsável no app: <span className="text-zinc-300">{vehicle.responsavel || 'Não identificado'}</span></div>
                </div>
              ))}
              {!vehicles.length && <div className="col-span-full rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-600">Nenhum veículo vinculado a mecânico no app.</div>}
            </div>
          </Card>

          <Card className="overflow-hidden border-zinc-800 bg-[#090a10] text-white">
            <div className="border-b border-zinc-800 p-4"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-400" /><h3 className="font-black">Eventos para conferência</h3></div><p className="mt-1 text-xs text-zinc-600">Tracker × placa do app × responsável × Ponto do Carro.</p></div>
            {!events.length ? (
              <div className="p-8 text-center text-sm text-zinc-600">Nenhum evento real da GR Tracker recebido para estes veículos.</div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-xs"><thead className="bg-white/[.03] text-zinc-500"><tr><th className="p-3 text-left">Situação</th><th className="p-3 text-left">Placa</th><th className="p-3 text-left">Evento</th><th className="p-3 text-left">Data/hora</th><th className="p-3 text-left">Responsável</th><th className="p-3 text-left">Local</th></tr></thead><tbody className="divide-y divide-white/5">{events.map((event) => {
                const point = pointForEvent(event);
                const vehicle = vehicleForEvent(event);
                const responsible = point?.funcionario_nome || vehicle?.responsavel || 'Não identificado';
                return <tr key={event.id} className="align-top hover:bg-white/[.02]"><td className="p-3">{event.fora_horario === true ? <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 font-bold text-red-300"><AlertTriangle className="h-3.5 w-3.5" />Fora do horário</span> : event.fora_horario === false ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Normal</span> : <span className="rounded-full bg-zinc-800 px-2 py-1 text-zinc-400">Sem regra</span>}</td><td className="p-3 font-bold text-zinc-100">{normalizePlate(event.placa)}</td><td className="p-3"><span className="inline-flex items-center gap-1.5"><Power className="h-3.5 w-3.5 text-fuchsia-400" />{eventLabel(event)}</span>{event.velocidade_kmh != null && <div className="mt-1 text-[11px] text-zinc-600">{Number(event.velocidade_kmh)} km/h</div>}</td><td className="p-3 text-zinc-300">{formatDateTime(event.evento_em)}</td><td className="p-3"><div className="font-medium text-zinc-200">{responsible}</div><div className="mt-1 text-[10px] text-zinc-600">{point ? 'Confirmado pelo Ponto do Carro' : 'Vínculo atual do app'}</div></td><td className="max-w-[280px] p-3 text-zinc-400">{event.endereco ? <span className="inline-flex gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />{event.endereco}</span> : '—'}</td></tr>;
              })}</tbody></table></div>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}
