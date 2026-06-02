import type { Company, Employee, MonthlyEntry } from '@/types/database';
import { asoStatus, feriasStatus } from '@/lib/calculations';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'success';

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  category: 'feriado' | 'ponto_facultativo' | 'data_corporativa' | 'fechamento';
  scope: 'nacional' | 'estadual' | 'municipal' | 'corporativo';
  location?: string;
  message: string;
  severity: AlertSeverity;
  daysUntil: number;
};

export type IntelligenceAlert = {
  id: string;
  area: 'RH' | 'Frota' | 'Operacional' | 'Documentos' | 'Fechamento' | 'Diretoria';
  title: string;
  message: string;
  severity: AlertSeverity;
  count?: number;
  actionPath?: string;
};

export type WeatherLocation = {
  id: string;
  label: string;
  city: string;
  latitude: number;
  longitude: number;
};

export type WeatherSnapshot = {
  locationId: string;
  locationLabel: string;
  temperature: number | null;
  maxTemperature: number | null;
  minTemperature: number | null;
  rainProbability: number | null;
  windSpeed: number | null;
  condition: string;
  fetchedAt: string;
  alerts: IntelligenceAlert[];
};

export type SupabaseIntelligenceCounts = {
  documentosPendentes?: number;
  feriasProgramadas?: number;
  solicitacoesPendentes?: number;
  solicitacoesDiretor?: number;
  veiculosAtivos?: number;
  veiculosDocumentosVencendo?: number;
  faturamentoAberto?: number;
  contasPagarAberto?: number;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const fromDateKey = (key: string) => new Date(`${key}T00:00:00`);

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const differenceInDays = (future: Date, base: Date) => {
  const a = fromDateKey(toDateKey(future)).getTime();
  const b = fromDateKey(toDateKey(base)).getTime();
  return Math.round((a - b) / 86400000);
};

const makeDate = (year: number, month: number, day: number) => new Date(year, month - 1, day);

const easterDate = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeDate(year, month, day);
};

const brDate = (date: string | Date) =>
  new Date(typeof date === 'string' ? `${date}T00:00:00` : date).toLocaleDateString('pt-BR');

const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const event = (
  title: string,
  date: Date,
  category: CalendarEvent['category'],
  scope: CalendarEvent['scope'],
  message: string,
  severity: AlertSeverity,
  location?: string,
) => ({
  id: `${toDateKey(date)}-${normalize(title).replace(/[^a-z0-9]+/g, '-')}-${normalize(location || scope).replace(/[^a-z0-9]+/g, '-')}`,
  title,
  date: toDateKey(date),
  category,
  scope,
  location,
  message,
  severity,
  daysUntil: 0,
});

const calendarEventsForYear = (year: number, companies: Company[]) => {
  const easter = easterDate(year);
  const base: Omit<CalendarEvent, 'daysUntil'>[] = [
    event('Ano Novo', makeDate(year, 1, 1), 'feriado', 'nacional', 'Planeje escalas e atendimentos do inicio do ano.', 'info'),
    event('Carnaval', addDays(easter, -47), 'ponto_facultativo', 'nacional', 'Verifique escala operacional, frota e atendimentos externos.', 'warning'),
    event('Sexta-feira Santa', addDays(easter, -2), 'feriado', 'nacional', 'Antecipe entregas, documentos e programacoes de equipe.', 'warning'),
    event('Pascoa', easter, 'data_corporativa', 'nacional', 'Data comemorativa relevante para comunicados internos.', 'info'),
    event('Tiradentes', makeDate(year, 4, 21), 'feriado', 'nacional', 'Ajuste prazos administrativos e operacionais.', 'info'),
    event('Dia do Trabalhador', makeDate(year, 5, 1), 'feriado', 'nacional', 'Revise escalas, beneficios e plantao se houver.', 'warning'),
    event('Corpus Christi', addDays(easter, 60), 'ponto_facultativo', 'nacional', 'Estamos entrando na semana de Corpus Christi. Verifique equipes, entregas e atendimentos.', 'warning'),
    event('Independencia do Brasil', makeDate(year, 9, 7), 'feriado', 'nacional', 'Antecipe rotinas de fechamento e atendimento.', 'info'),
    event('Nossa Senhora Aparecida', makeDate(year, 10, 12), 'feriado', 'nacional', 'Confirme equipes de campo e rotas previstas.', 'info'),
    event('Finados', makeDate(year, 11, 2), 'feriado', 'nacional', 'Organize prazos de documentos e operacao.', 'info'),
    event('Proclamacao da Republica', makeDate(year, 11, 15), 'feriado', 'nacional', 'Revise programacao operacional antes do feriado.', 'info'),
    event('Consciencia Negra', makeDate(year, 11, 20), 'feriado', 'nacional', 'Confirme aplicacao por localidade e escala de equipe.', 'info'),
    event('Natal', makeDate(year, 12, 25), 'feriado', 'nacional', 'Organize ferias, documentos e pendencias de fim de ano.', 'warning'),
  ];

  const cities = new Set(companies.map((c) => normalize(`${c.city} ${c.name}`)));
  const hasSaoPaulo = [...cities].some((c) => c.includes('sao paulo') || c.includes('matriz') || c.includes('lmt') || c.includes('alqui'));
  const hasPraia = [...cities].some((c) => c.includes('praia grande'));
  const hasGoiania = [...cities].some((c) => c.includes('goian'));

  if (hasSaoPaulo) {
    base.push(
      event('Aniversario de Sao Paulo', makeDate(year, 1, 25), 'feriado', 'municipal', 'Validar operacao da Matriz, LMT e ALQUI na cidade de Sao Paulo.', 'info', 'Sao Paulo/SP'),
      event('Revolucao Constitucionalista', makeDate(year, 7, 9), 'feriado', 'estadual', 'Feriado estadual em Sao Paulo. Ajuste equipes e prazos.', 'warning', 'SP'),
    );
  }

  if (hasPraia) {
    base.push(
      event('Aniversario de Praia Grande', makeDate(year, 1, 19), 'feriado', 'municipal', 'Validar agenda da filial Praia Grande.', 'info', 'Praia Grande/SP'),
      event('Revolucao Constitucionalista', makeDate(year, 7, 9), 'feriado', 'estadual', 'Feriado estadual em Sao Paulo. Ajuste equipes da filial Praia Grande.', 'warning', 'SP'),
    );
  }

  if (hasGoiania) {
    base.push(
      event('Aniversario de Goiania', makeDate(year, 10, 24), 'feriado', 'municipal', 'Validar rotas, entregas e escala da filial Goiania.', 'warning', 'Goiania/GO'),
    );
  }

  base.push(
    event('Fechamento operacional - dia 10', makeDate(year, new Date().getMonth() + 1, 10), 'fechamento', 'corporativo', 'Lembrete de apontamentos e conferencias iniciais.', 'info'),
    event('Fechamento operacional - dia 15', makeDate(year, new Date().getMonth() + 1, 15), 'fechamento', 'corporativo', 'Conferencia de documentos, ASO, ferias e pendencias.', 'warning'),
    event('Fechamento operacional - dia 20', makeDate(year, new Date().getMonth() + 1, 20), 'fechamento', 'corporativo', 'Preparacao para fechamento mensal.', 'warning'),
    event('Fechamento operacional - dia 24', makeDate(year, new Date().getMonth() + 1, 24), 'fechamento', 'corporativo', 'Fechamento operacional do mes.', 'critical'),
  );

  return base;
};

export const getUpcomingCalendarEvents = (companies: Company[], now = new Date(), horizonDays = 45): CalendarEvent[] => {
  const years = [now.getFullYear(), now.getFullYear() + 1];
  return years
    .flatMap((year) => calendarEventsForYear(year, companies))
    .map((item) => ({ ...item, daysUntil: differenceInDays(fromDateKey(item.date), now) }))
    .filter((item) => item.daysUntil >= 0 && item.daysUntil <= horizonDays)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.title.localeCompare(b.title));
};

const LOCATION_COORDS: WeatherLocation[] = [
  { id: 'sao-paulo', label: 'Matriz / Sao Paulo', city: 'Sao Paulo', latitude: -23.5505, longitude: -46.6333 },
  { id: 'praia-grande', label: 'Praia Grande', city: 'Praia Grande', latitude: -24.0058, longitude: -46.4028 },
  { id: 'goiania', label: 'Goiania', city: 'Goiania', latitude: -16.6869, longitude: -49.2648 },
];

export const resolveWeatherLocations = (companies: Company[]) => {
  const found = new Map<string, WeatherLocation>();
  companies.forEach((company) => {
    const text = normalize(`${company.name} ${company.codigo} ${company.city}`);
    if (text.includes('goian')) found.set('goiania', LOCATION_COORDS[2]);
    else if (text.includes('praia')) found.set('praia-grande', LOCATION_COORDS[1]);
    else found.set('sao-paulo', LOCATION_COORDS[0]);
  });
  return [...found.values()].length ? [...found.values()] : LOCATION_COORDS;
};

const weatherCodeText = (code: number | null | undefined) => {
  if (code == null) return 'Sem leitura';
  if ([0].includes(code)) return 'Ceu limpo';
  if ([1, 2, 3].includes(code)) return 'Parcialmente nublado';
  if ([45, 48].includes(code)) return 'Neblina';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Garoa';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Chuva';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Frio intenso';
  if ([95, 96, 99].includes(code)) return 'Tempestade';
  return 'Condicao monitorada';
};

export const fetchWeatherSnapshot = async (location: WeatherLocation): Promise<WeatherSnapshot> => {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,precipitation,rain,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,wind_speed_10m_max',
    forecast_days: '3',
    timezone: 'America/Sao_Paulo',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) throw new Error(`weather_http_${res.status}`);
  const data = await res.json();
  const current = data.current || {};
  const daily = data.daily || {};
  const temperature = Number.isFinite(Number(current.temperature_2m)) ? Number(current.temperature_2m) : null;
  const maxTemperature = Number.isFinite(Number(daily.temperature_2m_max?.[0])) ? Number(daily.temperature_2m_max[0]) : null;
  const minTemperature = Number.isFinite(Number(daily.temperature_2m_min?.[1])) ? Number(daily.temperature_2m_min[1]) : null;
  const rainProbability = Number.isFinite(Number(daily.precipitation_probability_max?.[1])) ? Number(daily.precipitation_probability_max[1]) : null;
  const windSpeed = Number.isFinite(Number(daily.wind_speed_10m_max?.[0])) ? Number(daily.wind_speed_10m_max[0]) : null;
  const code = Number(current.weather_code ?? daily.weather_code?.[0]);
  const alerts: IntelligenceAlert[] = [];

  if ((maxTemperature ?? temperature ?? 0) >= 35) {
    alerts.push({
      id: `${location.id}-heat`,
      area: 'Operacional',
      title: 'Calor extremo previsto',
      message: `${location.label}: temperatura acima de 35C. Reforce hidratacao das equipes de campo.`,
      severity: 'critical',
    });
  }

  if ((minTemperature ?? temperature ?? 99) <= 12) {
    alerts.push({
      id: `${location.id}-cold`,
      area: 'Operacional',
      title: 'Queda de temperatura',
      message: `${location.label}: queda brusca/frio previsto. Oriente equipes externas.`,
      severity: 'warning',
    });
  }

  if ((rainProbability ?? 0) >= 60 || [61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) {
    alerts.push({
      id: `${location.id}-rain`,
      area: 'Operacional',
      title: 'Previsao de chuva forte',
      message: `${location.label}: ha risco de chuva. Verifique atividades externas, equipamentos e deslocamentos.`,
      severity: code >= 95 ? 'critical' : 'warning',
    });
  }

  if ((windSpeed ?? 0) >= 45) {
    alerts.push({
      id: `${location.id}-wind`,
      area: 'Operacional',
      title: 'Ventos fortes',
      message: `${location.label}: ventos fortes previstos. Confirme seguranca em campo e transporte.`,
      severity: 'warning',
    });
  }

  return {
    locationId: location.id,
    locationLabel: location.label,
    temperature,
    maxTemperature,
    minTemperature,
    rainProbability,
    windSpeed,
    condition: weatherCodeText(code),
    fetchedAt: new Date().toISOString(),
    alerts,
  };
};

export const closingDayAlert = (now = new Date()): IntelligenceAlert => {
  const day = now.getDate();
  if (day <= 10) {
    return { id: 'fechamento-dia-10', area: 'Fechamento', title: 'Dia 10 - apontamentos', message: 'Conferir apontamentos e divergencias iniciais do mes.', severity: day === 10 ? 'warning' : 'info', actionPath: '/admin/fechamento' };
  }
  if (day <= 15) {
    return { id: 'fechamento-dia-15', area: 'Fechamento', title: 'Dia 15 - documentos', message: 'Conferir ASOs, ferias, atestados e documentos pendentes.', severity: day === 15 ? 'warning' : 'info', actionPath: '/admin/historico' };
  }
  if (day <= 20) {
    return { id: 'fechamento-dia-20', area: 'Fechamento', title: 'Dia 20 - preparar fechamento', message: 'Preparar fechamento de ponto, beneficios e pendencias operacionais.', severity: day === 20 ? 'warning' : 'info', actionPath: '/admin/fechamento' };
  }
  if (day <= 24) {
    return { id: 'fechamento-dia-24', area: 'Fechamento', title: 'Dia 24 - fechamento operacional', message: 'Executar fechamento operacional e validar dados antes da folha.', severity: 'critical', actionPath: '/admin/fechamento' };
  }
  return { id: 'fechamento-resumo-mes', area: 'Fechamento', title: 'Resumo do mes', message: 'Conferir resumo mensal, documentos finais e pendencias de fechamento.', severity: 'info', actionPath: '/admin/fechamento' };
};

export const daysUntilOperationalClosing = (now = new Date()) => {
  const target = new Date(now.getFullYear(), now.getMonth(), 24);
  if (now.getDate() > 24) target.setMonth(target.getMonth() + 1);
  return Math.max(0, differenceInDays(target, now));
};

export const buildInternalAlerts = (
  companies: Company[],
  employees: Employee[],
  entries: MonthlyEntry[],
  counts: SupabaseIntelligenceCounts,
  now = new Date(),
): IntelligenceAlert[] => {
  const activeEmployees = employees.filter((e) => e.status === 'ativo');
  const asoProblem = activeEmployees.filter((e) => asoStatus(e.dataExameMedico).status !== 'ok');
  const asoCritical = activeEmployees.filter((e) => asoStatus(e.dataExameMedico).status === 'vencido');
  const feriasProblem = activeEmployees.filter((e) => feriasStatus(e.dataAdmissao).status !== 'em dia');
  const currentCompetencia = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const pendingEntries = entries.filter((entry) => entry.competencia === currentCompetencia && entry.statusConferencia !== 'conferido');

  const alerts: IntelligenceAlert[] = [
    closingDayAlert(now),
  ];

  if (asoProblem.length) {
    alerts.push({
      id: 'rh-aso',
      area: 'RH',
      title: asoCritical.length ? 'ASOs vencidos ou proximos' : 'ASOs vencendo',
      message: `${asoProblem.length} ASO(s) precisam de acompanhamento nos proximos dias.`,
      severity: asoCritical.length ? 'critical' : 'warning',
      count: asoProblem.length,
      actionPath: '/admin/aso',
    });
  }

  if (feriasProblem.length || counts.feriasProgramadas) {
    const total = Math.max(feriasProblem.length, counts.feriasProgramadas || 0);
    alerts.push({
      id: 'rh-ferias',
      area: 'RH',
      title: 'Ferias para revisar',
      message: `${total} colaborador(es) com ferias programadas, em atencao ou vencidas.`,
      severity: feriasProblem.some((e) => feriasStatus(e.dataAdmissao).status === 'vencido') ? 'critical' : 'warning',
      count: total,
      actionPath: '/admin/aviso-ferias',
    });
  }

  if (counts.documentosPendentes) {
    alerts.push({
      id: 'docs-pendentes',
      area: 'Documentos',
      title: 'Documentos aguardando acao',
      message: `${counts.documentosPendentes} documento(s) ainda nao enviados, aprovados ou vinculados.`,
      severity: 'warning',
      count: counts.documentosPendentes,
      actionPath: '/admin/historico',
    });
  }

  if (counts.solicitacoesPendentes) {
    alerts.push({
      id: 'ops-solicitacoes',
      area: 'Operacional',
      title: 'Solicitacoes operacionais pendentes',
      message: `${counts.solicitacoesPendentes} solicitacao(oes) aguardando revisao do admin.`,
      severity: 'critical',
      count: counts.solicitacoesPendentes,
      actionPath: '/admin/solicitacoes-operacionais',
    });
  }

  if (counts.veiculosDocumentosVencendo) {
    alerts.push({
      id: 'frota-docs',
      area: 'Frota',
      title: 'Documentos de frota vencendo',
      message: `${counts.veiculosDocumentosVencendo} veiculo(s) com IPVA/licenciamento proximo do vencimento.`,
      severity: 'warning',
      count: counts.veiculosDocumentosVencendo,
      actionPath: '/admin/documentos-ativos',
    });
  }

  if (pendingEntries.length) {
    alerts.push({
      id: 'fechamento-conferencia',
      area: 'Fechamento',
      title: 'Lancamentos do mes em conferencia',
      message: `${pendingEntries.length} lancamento(s) mensais ainda nao conferidos na competencia atual.`,
      severity: 'warning',
      count: pendingEntries.length,
      actionPath: '/admin/fechamento',
    });
  }

  if (!alerts.some((a) => a.severity === 'critical' || a.severity === 'warning')) {
    alerts.push({
      id: 'sem-critico',
      area: 'Diretoria',
      title: 'Nenhuma pendencia critica',
      message: `Operacao monitorada em ${companies.length || 0} empresa(s), sem alerta critico neste momento.`,
      severity: 'success',
    });
  }

  return alerts;
};

export const greetingForNow = (now = new Date()) => {
  const hour = now.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

export const buildMorningLines = (
  displayName: string,
  weather: WeatherSnapshot[],
  alerts: IntelligenceAlert[],
  now = new Date(),
) => {
  const primaryWeather = weather[0];
  const warningCount = alerts.filter((a) => a.severity === 'warning' || a.severity === 'critical').length;
  const rainTomorrow = weather.some((w) => (w.rainProbability || 0) >= 60);
  const lines = [
    `Hoje e ${now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}.`,
    primaryWeather?.temperature != null ? `Temperatura atual: ${Math.round(primaryWeather.temperature)}C.` : 'Temperatura atual: indisponivel.',
    primaryWeather?.maxTemperature != null ? `Maxima prevista: ${Math.round(primaryWeather.maxTemperature)}C.` : 'Maxima prevista: aguardando clima.',
    `Faltam ${daysUntilOperationalClosing(now)} dia(s) para o fechamento operacional.`,
    warningCount ? `Existem ${warningCount} alerta(s) para acompanhar hoje.` : 'Nenhuma pendencia critica identificada hoje.',
    rainTomorrow ? 'Ha previsao de chuva para as proximas 24/48 horas.' : 'Sem alerta de chuva forte no momento.',
  ];
  return [`${greetingForNow(now)}, ${displayName || 'Rodrigo'}.`, ...lines, 'Desejamos um excelente dia de trabalho.'];
};

export const formatCalendarDistance = (daysUntil: number) => {
  if (daysUntil === 0) return 'Hoje';
  if (daysUntil === 1) return 'Amanha';
  return `Em ${daysUntil} dias`;
};

export const formatBRDate = brDate;
