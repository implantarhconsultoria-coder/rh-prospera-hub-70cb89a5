import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  FileText,
  Home,
  Loader2,
  MapPin,
  Navigation,
  Power,
  Printer,
  Radar,
  RefreshCw,
  Satellite,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const db = supabase as any;
const TZ = 'America/Sao_Paulo';

type Config = {
  provider: string;
  status: string;
  timezone: string;
  ultima_sincronizacao_em?: string | null;
};

type TrackerEvent = {
  id: string;
  placa: string;
  tipo: string;
  ignicao?: boolean | null;
  evento_em: string;
  endereco?: string | null;
  velocidade_kmh?: number | null;
  latitude?: number | null;
  longitude?: number | null;
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
  funcionario_id?: string | null;
  endereco_residencial?: string | null;
};

type DashboardMechanic = {
  funcionario_id?: string | null;
  nome?: string;
  empresa?: string;
  veiculo_atribuido?: { placa?: string | null; veiculo?: string | null };
  km?: { placa?: string | null; veiculo?: string | null };
};

type ResidenceMechanic = {
  funcionario_id?: string | null;
  nome?: string | null;
  endereco_residencial?: string | null;
};

type DailyMovement = {
  key: string;
  date: string;
  plate: string;
  vehicle: AppVehicle;
  point: VehiclePoint | null;
  arrivalHome: TrackerEvent | null;
  movementAfterHome: TrackerEvent | null;
};

const normalizePlate = (value?: string | null) => String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const localDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
const normalizeName = (value?: string | null) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const normalizeText = (value?: string | null) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ }).format(date);
};

const formatTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(date);
};

const formatDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day, 12).toLocaleDateString('pt-BR');
};

const eventLabel = (event: TrackerEvent) => {
  const type = String(event.tipo || '').toLowerCase();
  if (type.includes('ign') || event.ignicao != null) return event.ignicao === false ? 'Ignição desligada' : 'Ignição ligada';
  if (type.includes('pos')) return 'Posição';
  return event.tipo || 'Evento';
};

const STREET_WORDS = new Set(['rua', 'r', 'avenida', 'av', 'estrada', 'est', 'rodovia', 'rod', 'travessa', 'tv', 'alameda', 'al']);

function addressParts(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return { normalized: '', streetTokens: [] as string[], number: '' };
  const segments = raw.split(',').map((part) => normalizeText(part)).filter(Boolean);
  const first = segments[0] || '';
  const streetTokens = first.split(' ').filter((token) => token.length >= 2 && !STREET_WORDS.has(token));
  const numberSegment = segments.slice(1, 3).find((segment) => /^\d{1,5}$/.test(segment));
  return { normalized: normalizeText(raw), streetTokens, number: numberSegment || '' };
}

function isHomeAddress(eventAddress?: string | null, homeAddress?: string | null) {
  const event = addressParts(eventAddress);
  const home = addressParts(homeAddress);
  if (!event.normalized || !home.normalized || !home.streetTokens.length) return false;

  const eventTokens = new Set(event.normalized.split(' '));
  const sharedStreetTokens = home.streetTokens.filter((token) => eventTokens.has(token)).length;
  const streetRequired = Math.min(2, home.streetTokens.length);
  if (sharedStreetTokens < streetRequired) return false;

  if (home.number) {
    const numberRegex = new RegExp(`(^|\\s)${home.number}(\\s|$)`);
    if (!numberRegex.test(event.normalized)) return false;
  }

  return true;
}

function isMovementEvent(event: TrackerEvent) {
  if (event.ignicao === true) return true;
  if (event.velocidade_kmh != null && Number(event.velocidade_kmh) > 5) return true;
  const type = normalizeText(event.tipo);
  return type.includes('movimento') || type.includes('movimentacao') || type.includes('deslocamento');
}

function isArrivalEvent(event: TrackerEvent) {
  if (event.ignicao === false) return true;
  if (event.velocidade_kmh != null && Number(event.velocidade_kmh) <= 5) return true;
  const type = normalizeText(event.tipo);
  return type.includes('parado') || type.includes('parada');
}

export default function RastreamentoMecanicosAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Config>({ provider: 'grtracker', status: 'aguardando_acesso', timezone: TZ });
  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [vehicles, setVehicles] = useState<AppVehicle[]>([]);
  const [points, setPoints] = useState<VehiclePoint[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 31);

      const [configRes, eventsRes, dashboardRes, residenceRes, pointsRes] = await Promise.all([
        db.from('rastreamento_configuracao').select('provider,status,timezone,ultima_sincronizacao_em').eq('provider', 'grtracker').maybeSingle(),
        db.from('rastreamento_eventos')
          .select('id,placa,tipo,ignicao,evento_em,endereco,velocidade_kmh,latitude,longitude')
          .gte('evento_em', since.toISOString())
          .order('evento_em', { ascending: false })
          .limit(2000),
        db.rpc('admin_app_mecanicos_dashboard'),
        db.rpc('admin_app_mecanicos_rastreamento_base'),
        db.from('ponto_veiculo')
          .select('veiculo_placa,funcionario_nome,saida_em,chegada_em')
          .gte('data', localDate(since))
          .order('saida_em', { ascending: false })
          .limit(1500),
      ]);

      const fatal = [configRes, eventsRes, dashboardRes, residenceRes].find((result) => result.error);
      if (fatal?.error) throw fatal.error;

      if (configRes.data) setConfig(configRes.data as Config);

      const dashboard = dashboardRes.data || {};
      const mechanics = Array.isArray(dashboard?.mecanicos) ? dashboard.mecanicos as DashboardMechanic[] : [];
      const residences = Array.isArray(residenceRes.data?.mecanicos) ? residenceRes.data.mecanicos as ResidenceMechanic[] : [];
      const residenceByEmployee = new Map(residences.filter((row) => row.funcionario_id).map((row) => [String(row.funcionario_id), row]));
      const residenceByName = new Map(residences.filter((row) => row.nome).map((row) => [normalizeName(row.nome), row]));

      const vehicleMap = new Map<string, AppVehicle>();
      mechanics.forEach((mechanic) => {
        const assignedPlate = normalizePlate(mechanic.veiculo_atribuido?.placa || mechanic.km?.placa);
        if (!assignedPlate) return;
        const residence = mechanic.funcionario_id
          ? residenceByEmployee.get(String(mechanic.funcionario_id))
          : residenceByName.get(normalizeName(mechanic.nome));
        const current = vehicleMap.get(assignedPlate);
        vehicleMap.set(assignedPlate, {
          placa: assignedPlate,
          descricao: mechanic.veiculo_atribuido?.veiculo || mechanic.km?.veiculo || current?.descricao || null,
          responsavel: mechanic.nome || current?.responsavel || null,
          empresa: mechanic.empresa || current?.empresa || null,
          funcionario_id: mechanic.funcionario_id || current?.funcionario_id || null,
          endereco_residencial: residence?.endereco_residencial || current?.endereco_residencial || null,
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

  const connectionReady = String(config.status || '').toLowerCase() === 'conectado';

  const pointForPlateAndDate = useCallback((plate: string, date: string) => {
    const normalized = normalizePlate(plate);
    const sameDay = points
      .filter((point) => normalizePlate(point.veiculo_placa) === normalized && localDate(new Date(point.saida_em)) === date)
      .sort((a, b) => new Date(a.saida_em).getTime() - new Date(b.saida_em).getTime());
    return sameDay[0] || null;
  }, [points]);

  const dailyMovements = useMemo<DailyMovement[]>(() => {
    const result: DailyMovement[] = [];
    const byPlateAndDate = new Map<string, TrackerEvent[]>();

    events.forEach((event) => {
      const plate = normalizePlate(event.placa);
      const date = localDate(new Date(event.evento_em));
      const key = `${plate}|${date}`;
      const list = byPlateAndDate.get(key) || [];
      list.push(event);
      byPlateAndDate.set(key, list);
    });

    vehicles.forEach((vehicle) => {
      const plate = normalizePlate(vehicle.placa);
      const keys = [...byPlateAndDate.keys()].filter((key) => key.startsWith(`${plate}|`));
      keys.forEach((key) => {
        const date = key.split('|')[1];
        const dayEvents = [...(byPlateAndDate.get(key) || [])].sort((a, b) => new Date(a.evento_em).getTime() - new Date(b.evento_em).getTime());
        const point = pointForPlateAndDate(plate, date);
        const startTime = point ? new Date(point.saida_em).getTime() : (dayEvents[0] ? new Date(dayEvents[0].evento_em).getTime() : 0);
        const relevantEvents = dayEvents.filter((event) => new Date(event.evento_em).getTime() >= startTime);

        let leftHome = false;
        let arrivalHome: TrackerEvent | null = null;
        let movementAfterHome: TrackerEvent | null = null;

        for (const event of relevantEvents) {
          const atHome = isHomeAddress(event.endereco, vehicle.endereco_residencial);
          if (!arrivalHome) {
            if (!atHome) leftHome = true;
            if (leftHome && atHome && isArrivalEvent(event)) arrivalHome = event;
            continue;
          }

          if (new Date(event.evento_em).getTime() > new Date(arrivalHome.evento_em).getTime() && isMovementEvent(event)) {
            movementAfterHome = event;
            break;
          }
        }

        result.push({ key, date, plate, vehicle, point, arrivalHome, movementAfterHome });
      });
    });

    return result.sort((a, b) => b.date.localeCompare(a.date) || a.plate.localeCompare(b.plate));
  }, [events, vehicles, pointForPlateAndDate]);

  const today = localDate(new Date());
  const arrivedHomeToday = dailyMovements.filter((row) => row.date === today && row.arrivalHome).length;
  const afterHomeToday = dailyMovements.filter((row) => row.date === today && row.movementAfterHome).length;
  const incidents = dailyMovements.filter((row) => row.movementAfterHome);
  const addressesReady = vehicles.filter((vehicle) => Boolean(vehicle.endereco_residencial)).length;

  const latestEventByPlate = useMemo(() => {
    const map = new Map<string, TrackerEvent>();
    [...events]
      .sort((a, b) => new Date(b.evento_em).getTime() - new Date(a.evento_em).getTime())
      .forEach((event) => {
        const plate = normalizePlate(event.placa);
        if (!map.has(plate)) map.set(plate, event);
      });
    return map;
  }, [events]);

  if (loading) {
    return <div className="flex min-h-[260px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-400" /></div>;
  }

  return (
    <section className="space-y-4 rounded-xl border border-fuchsia-500/15 bg-[#07070d] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Radar className="h-5 w-5 text-amber-400" /><h2 className="text-lg font-black text-white">Rastreamento dos veículos do App Mecânicos</h2></div>
          <p className="mt-1 text-xs text-zinc-500">Área exclusiva da administração. O controle considera somente os veículos vinculados aos mecânicos no app.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/[.06] p-3 text-xs text-blue-100/75">
        <strong className="text-blue-200">Regra operacional:</strong> o horário normal da empresa continua como referência, mas não gera ocorrência sozinho. Trânsito, atraso e viagem não são tratados automaticamente como uso indevido. O ciclo do rastreamento é encerrado quando o veículo retorna ao endereço residencial cadastrado do responsável; qualquer nova movimentação depois dessa chegada entra no relatório com observação.
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
          <div className="flex items-center justify-between text-xs text-zinc-500"><span>GR Tracker</span>{connectionReady ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Unplug className="h-5 w-5 text-amber-400" />}</div>
          <div className={`mt-3 text-lg font-black ${connectionReady ? 'text-emerald-300' : 'text-amber-300'}`}>{connectionReady ? 'Conectado' : 'Aguardando acesso'}</div>
          <div className="mt-1 text-[11px] text-zinc-600">{config.ultima_sincronizacao_em ? `Última sincronização: ${formatDateTime(config.ultima_sincronizacao_em)}` : 'Nenhuma sincronização'}</div>
        </Card>
        <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
          <div className="flex items-center justify-between text-xs text-zinc-500"><span>Endereços residenciais</span><Home className="h-5 w-5 text-fuchsia-400" /></div>
          <div className="mt-3 text-2xl font-black">{addressesReady}/{vehicles.length}</div>
          <div className="mt-1 text-xs text-zinc-600">responsáveis com endereço cadastrado</div>
        </Card>
        <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
          <div className="flex items-center justify-between text-xs text-zinc-500"><span>Chegaram em casa hoje</span><MapPin className="h-5 w-5 text-emerald-400" /></div>
          <div className="mt-3 text-2xl font-black text-emerald-300">{arrivedHomeToday}</div>
          <div className="mt-1 text-xs text-zinc-600">fechamento do ciclo pelo rastreador</div>
        </Card>
        <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
          <div className="flex items-center justify-between text-xs text-zinc-500"><span>Uso após chegada hoje</span><AlertTriangle className="h-5 w-5 text-red-400" /></div>
          <div className="mt-3 text-2xl font-black text-red-300">{afterHomeToday}</div>
          <div className="mt-1 text-xs text-zinc-600">movimentações para conferência</div>
        </Card>
      </div>

      {!connectionReady && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[.06] p-3">
          <Satellite className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div><strong className="text-sm text-amber-200">Estrutura pronta — aguardando o acesso da GR Tracker</strong><p className="mt-1 text-xs text-amber-100/60">Assim que a conexão real for liberada, localização e ignição passam a alimentar automaticamente a chegada em casa e o relatório de uso posterior.</p></div>
        </div>
      )}

      <Card className="border-zinc-800 bg-[#090a10] p-4 text-white">
        <div className="flex items-center gap-2"><Car className="h-4 w-4 text-fuchsia-400" /><h3 className="font-black">Veículos monitorados no App Mecânicos</h3></div>
        <p className="mt-1 text-xs text-zinc-600">Endereço residencial é usado somente nesta área administrativa para identificar o encerramento do uso do veículo.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {vehicles.map((vehicle) => {
            const latest = latestEventByPlate.get(normalizePlate(vehicle.placa));
            return (
              <div key={vehicle.placa} className="rounded-lg border border-white/5 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-2"><div><strong className="text-sm text-fuchsia-300">{vehicle.placa}</strong><div className="mt-1 truncate text-xs text-zinc-500">{vehicle.descricao || 'Veículo'}</div></div>{vehicle.endereco_residencial ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}</div>
                <div className="mt-2 text-[11px] text-zinc-600">Responsável: <span className="text-zinc-300">{vehicle.responsavel || 'Não identificado'}</span></div>
                <div className="mt-2 flex gap-1.5 text-[11px] text-zinc-500"><Home className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{vehicle.endereco_residencial || 'Endereço residencial não cadastrado'}</span></div>
                <div className="mt-2 border-t border-white/5 pt-2 text-[10px] text-zinc-600">Última localização: <span className="text-zinc-400">{latest?.endereco || 'Aguardando dados da GR Tracker'}</span>{latest && <span> · {formatDateTime(latest.evento_em)}</span>}</div>
              </div>
            );
          })}
          {!vehicles.length && <div className="col-span-full rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-600">Nenhum veículo vinculado a mecânico no app.</div>}
        </div>
      </Card>

      <Card id="tracker-after-home-report" className="overflow-hidden border-zinc-800 bg-[#090a10] text-white">
        <style>{`@media print{body *{visibility:hidden!important}#tracker-after-home-report,#tracker-after-home-report *{visibility:visible!important}#tracker-after-home-report{position:absolute;left:0;top:0;width:100%;background:white!important;color:black!important;border:0!important}#tracker-after-home-report .no-print{display:none!important}#tracker-after-home-report table,#tracker-after-home-report th,#tracker-after-home-report td{color:black!important;border-color:#ddd!important}}`}</style>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
          <div><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-red-400" /><h3 className="font-black">Relatório — uso após chegada em casa</h3></div><p className="mt-1 text-xs text-zinc-600">Só aparece aqui quando o veículo retorna ao endereço residencial e volta a ser movimentado depois.</p></div>
          <Button className="no-print" variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir relatório</Button>
        </div>
        {!incidents.length ? (
          <div className="p-8 text-center text-sm text-zinc-600">Nenhuma movimentação após chegada em casa identificada.</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-xs"><thead className="bg-white/[.03] text-zinc-500"><tr><th className="p-3 text-left">Data</th><th className="p-3 text-left">Placa</th><th className="p-3 text-left">Responsável</th><th className="p-3 text-left">Chegada em casa</th><th className="p-3 text-left">Novo uso</th><th className="p-3 text-left">Local do novo uso</th><th className="p-3 text-left">Observação</th></tr></thead><tbody className="divide-y divide-white/5">{incidents.map((row) => (
            <tr key={row.key} className="align-top hover:bg-white/[.02]"><td className="p-3">{formatDate(row.date)}</td><td className="p-3 font-bold">{row.plate}</td><td className="p-3">{row.vehicle.responsavel || row.point?.funcionario_nome || 'Não identificado'}</td><td className="p-3 text-emerald-300">{formatDateTime(row.arrivalHome?.evento_em)}</td><td className="p-3 text-red-300">{formatDateTime(row.movementAfterHome?.evento_em)}</td><td className="max-w-[260px] p-3">{row.movementAfterHome?.endereco || 'Localização não informada'}</td><td className="max-w-[320px] p-3">Veículo voltou a ser utilizado após a chegada ao endereço residencial registrada às {formatTime(row.arrivalHome?.evento_em)}.</td></tr>
          ))}</tbody></table></div>
        )}
      </Card>

      <Card className="overflow-hidden border-zinc-800 bg-[#090a10] text-white">
        <div className="border-b border-zinc-800 p-4"><div className="flex items-center gap-2"><Navigation className="h-4 w-4 text-fuchsia-400" /><h3 className="font-black">Eventos e localização para conferência</h3></div><p className="mt-1 text-xs text-zinc-600">GR Tracker × veículo do app × responsável × Ponto do Carro.</p></div>
        {!events.length ? (
          <div className="p-8 text-center text-sm text-zinc-600">Nenhum evento real da GR Tracker recebido para estes veículos.</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-xs"><thead className="bg-white/[.03] text-zinc-500"><tr><th className="p-3 text-left">Placa</th><th className="p-3 text-left">Evento</th><th className="p-3 text-left">Data/hora</th><th className="p-3 text-left">Responsável</th><th className="p-3 text-left">Local</th></tr></thead><tbody className="divide-y divide-white/5">{events.map((event) => {
            const vehicle = vehicles.find((item) => normalizePlate(item.placa) === normalizePlate(event.placa));
            const atHome = isHomeAddress(event.endereco, vehicle?.endereco_residencial);
            return <tr key={event.id} className="align-top hover:bg-white/[.02]"><td className="p-3 font-bold text-zinc-100">{normalizePlate(event.placa)}</td><td className="p-3"><span className="inline-flex items-center gap-1.5"><Power className="h-3.5 w-3.5 text-fuchsia-400" />{eventLabel(event)}</span>{event.velocidade_kmh != null && <div className="mt-1 text-[11px] text-zinc-600">{Number(event.velocidade_kmh)} km/h</div>}</td><td className="p-3 text-zinc-300">{formatDateTime(event.evento_em)}</td><td className="p-3">{vehicle?.responsavel || 'Não identificado'}</td><td className="max-w-[320px] p-3 text-zinc-400">{event.endereco ? <span className="inline-flex gap-1.5"><MapPin className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${atHome ? 'text-emerald-400' : 'text-zinc-600'}`} />{event.endereco}{atHome && <span className="ml-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">CASA</span>}</span> : '—'}</td></tr>;
          })}</tbody></table></div>
        )}
      </Card>
    </section>
  );
}
