import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  CloudRain,
  CloudSun,
  FileText,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Truck,
  Users,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/calculations';
import {
  buildInternalAlerts,
  buildMorningLines,
  fetchWeatherSnapshot,
  formatBRDate,
  formatCalendarDistance,
  getUpcomingCalendarEvents,
  resolveWeatherLocations,
  toDateKey,
  type IntelligenceAlert,
  type SupabaseIntelligenceCounts,
  type WeatherSnapshot,
} from '@/lib/inteligenciaOperacional';

type LoadingState = 'idle' | 'loading' | 'done' | 'error';

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const safeRows = (data: any) => (Array.isArray(data) ? data : []);

const isOpenStatus = (value: unknown) => {
  const s = String(value || '').toLowerCase();
  return ['aberto', 'em_aberto', 'enviada', 'prevista', 'parcial', 'vencida', 'pendente'].includes(s);
};

const severityClass: Record<string, string> = {
  critical: 'border-red-500/50 bg-red-500/10 text-red-100',
  warning: 'border-amber-500/50 bg-amber-500/10 text-amber-100',
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-100',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
};

const severityIcon = (severity: string) => {
  if (severity === 'critical' || severity === 'warning') return AlertTriangle;
  if (severity === 'success') return CheckCircle2;
  return Bell;
};

const cardClass = 'rounded-2xl border border-emerald-500/20 bg-slate-950/70 shadow-sm';

const fromTable = (table: string) => supabase.from(table as any) as any;

const CentralInteligenciaOperacionalPage: React.FC = () => {
  const { companies, employees, entries, session, userRoles } = useApp();
  const [weather, setWeather] = useState<WeatherSnapshot[]>([]);
  const [weatherState, setWeatherState] = useState<LoadingState>('idle');
  const [counts, setCounts] = useState<SupabaseIntelligenceCounts>({});
  const [dataState, setDataState] = useState<LoadingState>('idle');
  const [updatedAt, setUpdatedAt] = useState<string>('');

  const displayName = useMemo(() => {
    const meta = session?.user?.user_metadata || {};
    return String(meta.name || meta.nome || session?.user?.email?.split('@')[0] || 'Rodrigo');
  }, [session]);

  const now = useMemo(() => new Date(), [updatedAt]);
  const activeCompanies = useMemo(() => companies.filter((c) => c.status !== 'inativa'), [companies]);
  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'ativo'), [employees]);
  const calendarEvents = useMemo(() => getUpcomingCalendarEvents(activeCompanies, now, 45), [activeCompanies, now]);
  const intelligenceAlerts = useMemo(
    () => buildInternalAlerts(activeCompanies, employees, entries, counts, now).concat(weather.flatMap((w) => w.alerts)),
    [activeCompanies, employees, entries, counts, now, weather],
  );
  const morningLines = useMemo(() => buildMorningLines(displayName, weather, intelligenceAlerts, now), [displayName, weather, intelligenceAlerts, now]);

  const currentCompetencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const payrollEntries = entries.filter((entry) => entry.competencia === currentCompetencia);
  const estimatedPayroll = payrollEntries.reduce((sum, entry) => sum + (Number(entry.adiantamento) || 0), 0);
  const criticalCount = intelligenceAlerts.filter((a) => a.severity === 'critical').length;
  const warningCount = intelligenceAlerts.filter((a) => a.severity === 'warning').length;
  const isDirector = userRoles.includes('diretor') || userRoles.includes('diretor_geral');

  const loadWeather = async () => {
    setWeatherState('loading');
    const locations = resolveWeatherLocations(activeCompanies);
    const snapshots = await Promise.all(
      locations.map(async (location) => {
        try {
          return await fetchWeatherSnapshot(location);
        } catch (error) {
          console.warn('Clima indisponivel para a central de inteligencia:', location.id, error);
          return {
            locationId: location.id,
            locationLabel: location.label,
            temperature: null,
            maxTemperature: null,
            minTemperature: null,
            rainProbability: null,
            windSpeed: null,
            condition: 'Clima indisponivel',
            fetchedAt: new Date().toISOString(),
            alerts: [],
          } satisfies WeatherSnapshot;
        }
      }),
    );
    setWeather(snapshots);
    setWeatherState(snapshots.some((s) => s.temperature != null) ? 'done' : 'error');
  };

  const loadCounts = async () => {
    setDataState('loading');
    const today = toDateKey(new Date());
    const in30 = toDateKey(addDays(new Date(), 30));
    const monthStart = `${currentCompetencia}-01`;
    const monthEnd = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    try {
      const [
        documentosRes,
        feriasRes,
        solicitacoesRes,
        ativosRes,
        faturasRes,
        contasPagarRes,
      ] = await Promise.all([
        fromTable('documentos_funcionario').select('id,status_envio,status,categoria,created_at').limit(1000),
        fromTable('ferias_avisos').select('id,status,periodo_gozo_inicio,periodo_gozo_fim').gte('periodo_gozo_fim', monthStart).lte('periodo_gozo_inicio', monthEnd).limit(500),
        fromTable('operacional_solicitacoes').select('id,status,diretor_status,deleted_at').is('deleted_at', null).limit(1000),
        fromTable('ativos').select('id,tipo,status,vencimento_ipva,vencimento_licenciamento').eq('tipo', 'veiculo').limit(1000),
        fromTable('faturas').select('id,status,total,data_vencimento').limit(1000),
        fromTable('titulos_pagar').select('id,status,saldo,data_vencimento').limit(1000),
      ]);

      const documentos = safeRows(documentosRes.data);
      const ferias = safeRows(feriasRes.data);
      const solicitacoes = safeRows(solicitacoesRes.data);
      const ativos = safeRows(ativosRes.data);
      const faturas = safeRows(faturasRes.data);
      const contasPagar = safeRows(contasPagarRes.data);

      const documentosPendentes = documentos.filter((d: any) => {
        const status = String(d.status_envio || d.status || '').toLowerCase();
        return ['pendente', 'gerado', 'erro', 'aguardando', 'nao_enviado'].includes(status);
      }).length;

      const veiculosDocumentosVencendo = ativos.filter((a: any) => {
        const ipva = String(a.vencimento_ipva || '');
        const lic = String(a.vencimento_licenciamento || '');
        return (ipva >= today && ipva <= in30) || (lic >= today && lic <= in30);
      }).length;

      setCounts({
        documentosPendentes,
        feriasProgramadas: ferias.length,
        solicitacoesPendentes: solicitacoes.filter((s: any) => String(s.status || '') === 'pendente').length,
        solicitacoesDiretor: solicitacoes.filter((s: any) => String(s.diretor_status || '') === 'aguardando_diretor').length,
        veiculosAtivos: ativos.filter((a: any) => String(a.status || '') === 'ativo').length,
        veiculosDocumentosVencendo,
        faturamentoAberto: faturas.filter((f: any) => isOpenStatus(f.status)).length,
        contasPagarAberto: contasPagar.filter((c: any) => isOpenStatus(c.status)).length,
      });
      setDataState('done');
    } catch (error) {
      console.warn('Dados parciais na central de inteligencia:', error);
      setDataState('error');
    } finally {
      setUpdatedAt(new Date().toISOString());
    }
  };

  useEffect(() => {
    loadWeather();
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanies.length, currentCompetencia]);

  const reload = () => {
    loadWeather();
    loadCounts();
  };

  const renderAlert = (alert: IntelligenceAlert) => {
    const Icon = severityIcon(alert.severity);
    const content = (
      <div className={`rounded-xl border p-4 ${severityClass[alert.severity] || severityClass.info}`}>
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold leading-tight">{alert.title}</p>
              {alert.count != null && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10">{alert.count}</span>}
            </div>
            <p className="text-sm opacity-90 mt-1">{alert.message}</p>
          </div>
        </div>
      </div>
    );

    return alert.actionPath ? <Link key={alert.id} to={alert.actionPath}>{content}</Link> : <div key={alert.id}>{content}</div>;
  };

  return (
    <div className="space-y-6">
      <section className={`${cardClass} p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-cyan-300" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-300 font-semibold">Assistente corporativo</p>
              <h1 className="text-3xl font-bold text-white mt-1">Central de Inteligencia Operacional</h1>
              <p className="text-sky-100/70 mt-2 max-w-3xl">
                Calendario, clima, RH, frota, documentos, aprovacoes e fechamento em um painel consultivo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-500/10"
          >
            <RefreshCw className={`w-4 h-4 ${weatherState === 'loading' || dataState === 'loading' ? 'animate-spin' : ''}`} />
            Atualizar inteligencia
          </button>
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <div className="flex items-center gap-3 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-300" />
          <h2 className="text-xl font-semibold text-white">Resumo matinal automatico</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {morningLines.map((line, index) => (
            <div key={`${line}-${index}`} className="rounded-xl border border-slate-700/70 bg-slate-900/80 px-4 py-3 text-sm text-sky-100">
              {line}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`${cardClass} p-5`}>
          <div className="flex items-center gap-2 text-sky-200 text-sm"><Users className="w-4 h-4" /> Funcionarios ativos</div>
          <p className="text-3xl font-bold text-white mt-3">{activeEmployees.length}</p>
        </div>
        <div className={`${cardClass} p-5`}>
          <div className="flex items-center gap-2 text-sky-200 text-sm"><AlertTriangle className="w-4 h-4" /> Alertas criticos</div>
          <p className="text-3xl font-bold text-red-300 mt-3">{criticalCount}</p>
        </div>
        <div className={`${cardClass} p-5`}>
          <div className="flex items-center gap-2 text-sky-200 text-sm"><Bell className="w-4 h-4" /> Alertas de atencao</div>
          <p className="text-3xl font-bold text-amber-300 mt-3">{warningCount}</p>
        </div>
        <div className={`${cardClass} p-5`}>
          <div className="flex items-center gap-2 text-sky-200 text-sm"><Truck className="w-4 h-4" /> Veiculos ativos</div>
          <p className="text-3xl font-bold text-white mt-3">{counts.veiculosAtivos ?? '-'}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className={`${cardClass} p-6`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <CloudSun className="w-5 h-5 text-cyan-300" />
              <h2 className="text-xl font-semibold text-white">Clima e tempo inteligente</h2>
            </div>
            <span className="text-xs text-sky-100/50">Fonte: Open-Meteo</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {weather.map((item) => (
              <div key={item.locationId} className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">{item.locationLabel}</p>
                  {item.condition.includes('Chuva') ? <CloudRain className="w-5 h-5 text-sky-300" /> : <Thermometer className="w-5 h-5 text-cyan-300" />}
                </div>
                <p className="text-3xl font-bold text-white mt-4">{item.temperature == null ? '-' : `${Math.round(item.temperature)}C`}</p>
                <div className="mt-4 space-y-1 text-sm text-sky-100/70">
                  <p>Condicao: {item.condition}</p>
                  <p>Maxima: {item.maxTemperature == null ? '-' : `${Math.round(item.maxTemperature)}C`}</p>
                  <p>Chuva amanha: {item.rainProbability == null ? '-' : `${item.rainProbability}%`}</p>
                  <p>Vento: {item.windSpeed == null ? '-' : `${Math.round(item.windSpeed)} km/h`}</p>
                </div>
              </div>
            ))}
          </div>
          {weatherState === 'error' && <p className="text-sm text-amber-300 mt-4">Clima indisponivel agora. A central segue funcionando com os dados internos.</p>}
        </div>

        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <CalendarDays className="w-5 h-5 text-amber-300" />
            <h2 className="text-xl font-semibold text-white">Calendario corporativo</h2>
          </div>
          <div className="space-y-3">
            {calendarEvents.slice(0, 7).map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-sky-100/60 mt-1">{item.scope}{item.location ? ` - ${item.location}` : ''}</p>
                  </div>
                  <span className="text-xs rounded-full bg-cyan-500/15 text-cyan-100 px-2 py-1 whitespace-nowrap">{formatCalendarDistance(item.daysUntil)}</span>
                </div>
                <p className="text-sm text-sky-100/75 mt-2">{formatBRDate(item.date)} - {item.message}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <div className="flex items-center gap-3 mb-4">
          <Gauge className="w-5 h-5 text-lime-300" />
          <h2 className="text-xl font-semibold text-white">Alertas operacionais cruzados</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {intelligenceAlerts.map(renderAlert)}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-5 h-5 text-cyan-300" />
            <h2 className="text-xl font-semibold text-white">Fechamento e documentos</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
              <p className="text-sm text-sky-100/60">Competencia atual</p>
              <p className="text-2xl font-bold text-white mt-2">{currentCompetencia}</p>
            </div>
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
              <p className="text-sm text-sky-100/60">Dias ate fechamento</p>
              <p className="text-2xl font-bold text-white mt-2">{morningLines.find((line) => line.includes('Faltam'))?.replace('Faltam ', '') || '-'}</p>
            </div>
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
              <p className="text-sm text-sky-100/60">Documentos pendentes</p>
              <p className="text-2xl font-bold text-amber-200 mt-2">{counts.documentosPendentes ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
              <p className="text-sm text-sky-100/60">Base de adiantamentos do mes</p>
              <p className="text-2xl font-bold text-white mt-2">{formatCurrency(estimatedPayroll)}</p>
            </div>
          </div>
        </div>

        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-violet-300" />
            <h2 className="text-xl font-semibold text-white">Mensagem para diretoria</h2>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-5 text-sky-100/80">
            {isDirector || userRoles.includes('admin') ? (
              <>
                <p className="font-semibold text-white">Bom dia.</p>
                <p className="mt-3">
                  {criticalCount || warningCount
                    ? `Existem ${criticalCount + warningCount} ponto(s) de atencao operacional para decisao ou acompanhamento.`
                    : 'Nenhuma pendencia critica identificada hoje. Operacao funcionando dentro dos parametros previstos.'}
                </p>
                <p className="mt-3">
                  Faturamento em aberto: {counts.faturamentoAberto ?? 0} item(ns). Contas a pagar em aberto: {counts.contasPagarAberto ?? 0} item(ns).
                </p>
              </>
            ) : (
              <p>Mensagem executiva disponivel para Rodrigo/admin e perfil Diretor.</p>
            )}
          </div>
        </div>
      </section>

      <p className="text-xs text-sky-100/45">
        Atualizado em {updatedAt ? new Date(updatedAt).toLocaleString('pt-BR') : 'aguardando leitura'}.
        {' '}As consultas usam dados internos existentes e fallback seguro quando alguma tabela ainda nao esta disponivel.
      </p>
    </div>
  );
};

export default CentralInteligenciaOperacionalPage;
