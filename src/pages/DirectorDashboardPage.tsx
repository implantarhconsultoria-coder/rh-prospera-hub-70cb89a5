import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Car,
  Download,
  FileText,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { calcPayrollBreakdown, formatCurrency } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import CorporateAssistantPanel from '@/components/assistente/CorporateAssistantPanel';
import { buildCorporateSnapshot } from '@/lib/assistenteCorporativo';
import {
  buildInternalAlerts,
  fetchSupabaseIntelligenceCounts,
  getUpcomingCalendarEvents,
  type SupabaseIntelligenceCounts,
} from '@/lib/inteligenciaOperacional';

type PeriodPreset = 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'personalizado';

type CompanyRow = {
  companyId: string;
  companyName: string;
  ativos: number;
  folhaCusto: number;
  folhaProventos: number;
  folhaDescontos: number;
  folhaLiquida: number;
  aReceber: number;
  aPagar: number;
  abastecimentos: number;
  valorAbastecido: number;
};

type ExecutiveData = {
  financeiro: {
    aReceber: number;
    aPagar: number;
    vencidoReceber: number;
    vencidoPagar: number;
    recebidoPeriodo: number;
    pagoPeriodo: number;
    saldoProjetado: number;
  };
  rh: {
    ativos: number;
    operacionais: number;
    socios: number;
    folhaCusto: number;
    proventos: number;
    descontos: number;
    folhaBruta: number;
    folhaLiquida: number;
    inss: number;
    fgts: number;
  };
  frota: {
    veiculosAtivos: number;
    abastecimentos: number;
    litros: number;
    valorAbastecido: number;
    kmMedio: number;
  };
  porEmpresa: CompanyRow[];
};

const normalize = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateOnly = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const weekStart = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const buildCompetenciasInRange = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const out = new Set<string>();
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const stop = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= stop) {
    out.add(`${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
};

const presetRange = (preset: PeriodPreset) => {
  const today = new Date();
  const end = toDateOnly(today);
  if (preset === 'diario') return { start: end, end };
  if (preset === 'semanal') return { start: toDateOnly(weekStart(today)), end };
  if (preset === 'quinzenal') return { start: toDateOnly(addDays(today, -13)), end };
  if (preset === 'mensal') return { start: toDateOnly(monthStart(today)), end };
  return { start: end, end };
};

const statusOpen = new Set(['aberto', 'parcial', 'vencido']);
const isIgnorableSupabaseError = (message?: string) => {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('could not find the table') ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('permission denied')
  );
};

const DirectorDashboardPage: React.FC = () => {
  const { companies, employees, entries, session } = useApp();
  const [preset, setPreset] = useState<PeriodPreset>('mensal');
  const [companyFilter, setCompanyFilter] = useState<string>('geral');
  const [startDate, setStartDate] = useState<string>(presetRange('mensal').start);
  const [endDate, setEndDate] = useState<string>(presetRange('mensal').end);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [intelligenceCounts, setIntelligenceCounts] = useState<SupabaseIntelligenceCounts>({});

  const [report, setReport] = useState<ExecutiveData>({
    financeiro: {
      aReceber: 0,
      aPagar: 0,
      vencidoReceber: 0,
      vencidoPagar: 0,
      recebidoPeriodo: 0,
      pagoPeriodo: 0,
      saldoProjetado: 0,
    },
    rh: {
      ativos: 0,
      operacionais: 0,
      socios: 0,
      folhaCusto: 0,
      proventos: 0,
      descontos: 0,
      folhaBruta: 0,
      folhaLiquida: 0,
      inss: 0,
      fgts: 0,
    },
    frota: {
      veiculosAtivos: 0,
      abastecimentos: 0,
      litros: 0,
      valorAbastecido: 0,
      kmMedio: 0,
    },
    porEmpresa: [],
  });

  const targetCompanies = useMemo(
    () => (companyFilter === 'geral' ? companies : companies.filter((c) => c.id === companyFilter)),
    [companies, companyFilter],
  );

  useEffect(() => {
    if (preset === 'personalizado') return;
    const range = presetRange(preset);
    setStartDate(range.start);
    setEndDate(range.end);
  }, [preset]);

  useEffect(() => {
    const today = new Date();
    const competencia = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`;
    fetchSupabaseIntelligenceCounts(supabase, competencia, today)
      .then(setIntelligenceCounts)
      .catch((err) => console.warn('Dashboard diretor: leitura parcial da inteligencia operacional:', err));
  }, []);

  const runReport = async () => {
    if (!startDate || !endDate) return;
    if (startDate > endDate) {
      setError('Intervalo invalido: data inicial maior que data final.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const companyIds = new Set(targetCompanies.map((c) => c.id));
      const companyById = new Map(companies.map((c) => [c.id, c]));
      const competenciaRange = buildCompetenciasInRange(startDate, endDate);
      const today = toDateOnly(new Date());

      const selectedCompany = targetCompanies[0];
      const matchAbastCompany = (empresa: string, companyId: string) => {
        const company = companyById.get(companyId);
        if (!company) return false;
        const target = normalize(empresa);
        const terms = [company.name, company.codigo, company.city].map(normalize).filter(Boolean);
        return terms.some((t) => target.includes(t));
      };

      const filteredEmployees = employees.filter((e) => companyIds.has(e.companyId));
      const activeEmployees = filteredEmployees.filter((e) => e.status === 'ativo');
      const operacionais = activeEmployees.filter((e) => e.categoria === 'operacional');
      const socios = activeEmployees.filter((e) => e.categoria === 'socio');

      const filteredEntries = entries.filter(
        (e) => companyIds.has(e.companyId) && competenciaRange.has(e.competencia),
      );

      let folhaCusto = 0;
      let folhaProventos = 0;
      let folhaDescontos = 0;
      let folhaBruta = 0;
      let folhaLiquida = 0;
      let folhaInss = 0;
      let folhaFgts = 0;

      for (const entry of filteredEntries) {
        const emp = filteredEmployees.find((e) => e.id === entry.employeeId);
        if (!emp) continue;
        const company = companyById.get(entry.companyId);
        const comissaoPct = company?.codigo === 'topac-gyn' ? 0.02 : 0.01;
        const diasUteis = getWorkingDays(entry.competencia);
        const payroll = calcPayrollBreakdown(emp, entry, { diasUteis, comissaoPct });
        const descontos = payroll.descontosLegais + payroll.descontosOperacionais + payroll.adiantamento + payroll.descontosDiversos;
        folhaProventos += payroll.proventos;
        folhaDescontos += descontos;
        folhaBruta += payroll.bruto;
        folhaLiquida += payroll.liquido;
        folhaInss += payroll.inss;
        folhaFgts += payroll.fgts;
        folhaCusto += payroll.proventos + payroll.fgts;
      }

      const [titulosReceberRes, titulosPagarRes, recebimentosRes, pagamentosRes, veiculosRes, abastecimentosRes] =
        await Promise.all([
          supabase.from('titulos_receber').select('saldo,status,data_vencimento,empresa_id'),
          supabase.from('titulos_pagar').select('saldo,status,data_vencimento,empresa_id'),
          supabase
            .from('recebimentos')
            .select('valor,data,titulos_receber!inner(empresa_id)')
            .gte('data', startDate)
            .lte('data', endDate),
          supabase
            .from('pagamentos')
            .select('valor,data,titulos_pagar!inner(empresa_id)')
            .gte('data', startDate)
            .lte('data', endDate),
          supabase.from('veiculos').select('id,status,placa'),
          supabase
            .from('abastecimentos')
            .select('empresa,data,litros,valor,km_atual,status,excluido')
            .gte('data', startDate)
            .lte('data', endDate),
        ]);

      const queryErrors = [
        titulosReceberRes.error,
        titulosPagarRes.error,
        recebimentosRes.error,
        pagamentosRes.error,
        veiculosRes.error,
        abastecimentosRes.error,
      ].filter(Boolean);

      const fatalQueryError = queryErrors.find((err) => !isIgnorableSupabaseError(err?.message));
      if (fatalQueryError) {
        throw new Error(fatalQueryError.message);
      }

      const titulosReceber = (titulosReceberRes.data || []).filter((t) => companyIds.has(t.empresa_id));
      const titulosPagar = (titulosPagarRes.data || []).filter((t) => companyIds.has(t.empresa_id));
      const recebimentos = (recebimentosRes.data || []).filter((r: any) =>
        companyIds.has(r.titulos_receber?.empresa_id),
      );
      const pagamentos = (pagamentosRes.data || []).filter((p: any) =>
        companyIds.has(p.titulos_pagar?.empresa_id),
      );

      const aReceber = titulosReceber
        .filter((t) => statusOpen.has(String(t.status)))
        .reduce((s, t) => s + Number(t.saldo || 0), 0);
      const aPagar = titulosPagar
        .filter((t) => statusOpen.has(String(t.status)))
        .reduce((s, t) => s + Number(t.saldo || 0), 0);

      const vencidoReceber = titulosReceber
        .filter((t) => statusOpen.has(String(t.status)) && String(t.data_vencimento || '') < today)
        .reduce((s, t) => s + Number(t.saldo || 0), 0);
      const vencidoPagar = titulosPagar
        .filter((t) => statusOpen.has(String(t.status)) && String(t.data_vencimento || '') < today)
        .reduce((s, t) => s + Number(t.saldo || 0), 0);

      const recebidoPeriodo = recebimentos.reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
      const pagoPeriodo = pagamentos.reduce((s: number, p: any) => s + Number(p.valor || 0), 0);

      const abastBase = (abastecimentosRes.data || []).filter((a) => !a.excluido && a.status !== 'cancelado');
      const selectedCompanyId = selectedCompany?.id;
      const abastFiltrados = companyFilter === 'geral'
        ? abastBase
        : selectedCompanyId
          ? abastBase.filter((a) => matchAbastCompany(a.empresa || '', selectedCompanyId))
          : [];

      const frotaVeiculosAtivos = (veiculosRes.data || []).filter((v) => String(v.status).toLowerCase() === 'ativo').length;
      const frotaLitros = abastFiltrados.reduce((s, a) => s + Number(a.litros || 0), 0);
      const frotaValor = abastFiltrados.reduce((s, a) => s + Number(a.valor || 0), 0);
      const kmComValor = abastFiltrados.map((a) => Number(a.km_atual)).filter((v) => Number.isFinite(v) && v > 0);
      const kmMedio = kmComValor.length ? kmComValor.reduce((s, v) => s + v, 0) / kmComValor.length : 0;

      const porEmpresa: CompanyRow[] = targetCompanies.map((company) => {
        const emps = activeEmployees.filter((e) => e.companyId === company.id).length;
        const entriesCompany = filteredEntries.filter((e) => e.companyId === company.id);
        let custoCompany = 0;
        let proventosCompany = 0;
        let descontosCompany = 0;
        let liquidoCompany = 0;
        for (const entry of entriesCompany) {
          const emp = filteredEmployees.find((e) => e.id === entry.employeeId);
          if (!emp) continue;
          const comissaoPct = company.codigo === 'topac-gyn' ? 0.02 : 0.01;
          const diasUteis = getWorkingDays(entry.competencia);
          const payroll = calcPayrollBreakdown(emp, entry, { diasUteis, comissaoPct });
          const descontos = payroll.descontosLegais + payroll.descontosOperacionais + payroll.adiantamento + payroll.descontosDiversos;
          proventosCompany += payroll.proventos;
          descontosCompany += descontos;
          liquidoCompany += payroll.liquido;
          custoCompany += payroll.proventos + payroll.fgts;
        }

        const recCompany = titulosReceber
          .filter((t) => t.empresa_id === company.id && statusOpen.has(String(t.status)))
          .reduce((s, t) => s + Number(t.saldo || 0), 0);
        const pagCompany = titulosPagar
          .filter((t) => t.empresa_id === company.id && statusOpen.has(String(t.status)))
          .reduce((s, t) => s + Number(t.saldo || 0), 0);

        const abastCompany = abastBase.filter((a) => matchAbastCompany(a.empresa || '', company.id));
        const valorAbastCompany = abastCompany.reduce((s, a) => s + Number(a.valor || 0), 0);

        return {
          companyId: company.id,
          companyName: company.name,
          ativos: emps,
          folhaCusto: custoCompany,
          folhaProventos: proventosCompany,
          folhaDescontos: descontosCompany,
          folhaLiquida: liquidoCompany,
          aReceber: recCompany,
          aPagar: pagCompany,
          abastecimentos: abastCompany.length,
          valorAbastecido: valorAbastCompany,
        };
      });

      setReport({
        financeiro: {
          aReceber,
          aPagar,
          vencidoReceber,
          vencidoPagar,
          recebidoPeriodo,
          pagoPeriodo,
          saldoProjetado: aReceber - aPagar,
        },
        rh: {
          ativos: activeEmployees.length,
          operacionais: operacionais.length,
          socios: socios.length,
          folhaCusto,
          proventos: folhaProventos,
          descontos: folhaDescontos,
          folhaBruta,
          folhaLiquida,
          inss: folhaInss,
          fgts: folhaFgts,
        },
        frota: {
          veiculosAtivos: frotaVeiculosAtivos,
          abastecimentos: abastFiltrados.length,
          litros: frotaLitros,
          valorAbastecido: frotaValor,
          kmMedio,
        },
        porEmpresa,
      });
      setGeneratedAt(new Date().toLocaleString('pt-BR'));
    } catch (err: any) {
      setError(err?.message || 'Falha ao gerar dashboard executivo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companies.length) return;
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies.length, companyFilter, startDate, endDate]);

  const exportarCsv = () => {
    const linhas: Array<Array<string | number>> = [
      ['PERIODO', `${startDate} ate ${endDate}`],
      ['EMPRESA', companyFilter === 'geral' ? 'GERAL' : (targetCompanies[0]?.name || '')],
      [],
      ['RESUMO FINANCEIRO'],
      ['A Receber', report.financeiro.aReceber],
      ['A Pagar', report.financeiro.aPagar],
      ['Vencido Receber', report.financeiro.vencidoReceber],
      ['Vencido Pagar', report.financeiro.vencidoPagar],
      ['Recebido no periodo', report.financeiro.recebidoPeriodo],
      ['Pago no periodo', report.financeiro.pagoPeriodo],
      ['Saldo projetado', report.financeiro.saldoProjetado],
      [],
      ['RESUMO RH'],
      ['Funcionarios ativos', report.rh.ativos],
      ['Operacionais', report.rh.operacionais],
      ['Socios', report.rh.socios],
      ['Custo estimado da folha', report.rh.folhaCusto],
      ['Proventos estimados', report.rh.proventos],
      ['Descontos estimados', report.rh.descontos],
      ['Folha bruta', report.rh.folhaBruta],
      ['Folha liquida', report.rh.folhaLiquida],
      ['INSS', report.rh.inss],
      ['FGTS', report.rh.fgts],
      [],
      ['RESUMO FROTA'],
      ['Veiculos ativos', report.frota.veiculosAtivos],
      ['Abastecimentos', report.frota.abastecimentos],
      ['Litros', report.frota.litros],
      ['Valor abastecido', report.frota.valorAbastecido],
      ['KM medio', report.frota.kmMedio],
      [],
      ['POR EMPRESA'],
      ['Empresa', 'Ativos', 'Custo folha', 'Proventos', 'Descontos', 'Folha liquida', 'A receber', 'A pagar', 'Abastecimentos', 'Valor abastecido'],
      ...report.porEmpresa.map((r) => [
        r.companyName,
        r.ativos,
        r.folhaCusto,
        r.folhaProventos,
        r.folhaDescontos,
        r.folhaLiquida,
        r.aReceber,
        r.aPagar,
        r.abastecimentos,
        r.valorAbastecido,
      ]),
    ];

    const csv = linhas
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-diretor-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const directorName = String(
    session?.user?.user_metadata?.nome_completo ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.email?.split('@')[0] ||
    'Robson',
  );
  const corporateSnapshot = useMemo(
    () => buildCorporateSnapshot({
      companies: targetCompanies,
      employees,
      entries,
      counts: intelligenceCounts,
      finance: report.financeiro,
      fleet: report.frota,
    }),
    [targetCompanies, employees, entries, intelligenceCounts, report],
  );
  const intelligenceAlerts = useMemo(
    () => buildInternalAlerts(targetCompanies, employees, entries, intelligenceCounts),
    [targetCompanies, employees, entries, intelligenceCounts],
  );
  const calendarEvents = useMemo(() => getUpcomingCalendarEvents(targetCompanies, new Date(), 30), [targetCompanies]);
  const totalEmpresas = report.porEmpresa.length || targetCompanies.length;
  const margemFinanceira = report.financeiro.recebidoPeriodo - report.financeiro.pagoPeriodo;
  const pendenciasCriticas =
    Number(intelligenceCounts.documentosPendentes || 0) +
    Number(intelligenceCounts.solicitacoesPendentes || 0) +
    Number(corporateSnapshot.asoAlertas || 0);

  const executiveCards = [
    {
      label: 'Empresas do grupo',
      value: String(totalEmpresas),
      detail: companyFilter === 'geral' ? 'visao consolidada' : 'empresa filtrada',
      icon: Building2,
      tone: 'text-cyan-300',
    },
    {
      label: 'Funcionarios ativos',
      value: String(report.rh.ativos),
      detail: `${report.rh.operacionais} operacionais / ${report.rh.socios} socios`,
      icon: Users,
      tone: 'text-emerald-300',
    },
    {
      label: 'Custo estimado da folha',
      value: formatCurrency(report.rh.folhaCusto),
      detail: 'proventos + FGTS informativo',
      icon: Wallet,
      tone: 'text-violet-300',
    },
    {
      label: 'Valor liquido estimado',
      value: formatCurrency(report.rh.folhaLiquida),
      detail: 'baseado nos lancamentos do periodo',
      icon: TrendingUp,
      tone: 'text-lime-300',
    },
  ];

  const strategicIndicators = [
    { label: 'Proventos estimados', value: formatCurrency(report.rh.proventos) },
    { label: 'Descontos estimados', value: formatCurrency(report.rh.descontos) },
    { label: 'INSS estimado', value: formatCurrency(report.rh.inss) },
    { label: 'FGTS informativo', value: formatCurrency(report.rh.fgts) },
    { label: 'A receber disponivel', value: formatCurrency(report.financeiro.aReceber) },
    { label: 'A pagar disponivel', value: formatCurrency(report.financeiro.aPagar) },
    { label: 'Saldo projetado', value: formatCurrency(report.financeiro.saldoProjetado) },
    { label: 'Margem do periodo', value: formatCurrency(margemFinanceira) },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-5 md:p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Diretor Geral - somente leitura
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Painel Executivo</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Visao consolidada do grupo para acompanhamento gerencial, sem rotinas operacionais de RH.
              </p>
            </div>
            {generatedAt && <p className="text-xs text-muted-foreground">Atualizado em {generatedAt}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportarCsv}>
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
            <Button variant="outline" onClick={exportarCsv}>
              <FileText className="w-4 h-4 mr-2" />
              Solicitar relatorio consolidado
            </Button>
            <Button onClick={runReport} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar indicadores
            </Button>
          </div>
        </div>
      </section>

      <CorporateAssistantPanel
        variant="director"
        displayName={directorName}
        snapshot={corporateSnapshot}
        alerts={intelligenceAlerts}
        calendarEvents={calendarEvents}
      />

      <div className="card-premium p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Periodo</label>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
          >
            <option value="diario">Diario</option>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
            <option value="mensal">Mensal</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
          >
            <option value="geral">Geral</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Data inicial</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setPreset('personalizado');
              setStartDate(e.target.value);
            }}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Data final</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setPreset('personalizado');
              setEndDate(e.target.value);
            }}
          />
        </div>
        <div className="flex items-end">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            {startDate} ate {endDate}
          </div>
        </div>
      </div>

      {error && <div className="card-premium p-3 text-sm text-destructive">{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {executiveCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card-premium p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.detail}</p>
                </div>
                <div className={`rounded-xl bg-white/5 p-2 ${card.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-premium p-4 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Indicadores consolidados</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {strategicIndicators.map((indicator) => (
              <div key={indicator.label} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{indicator.label}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{indicator.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card-premium p-4">
          <div className="mb-3 flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Resumo operacional</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Veiculos ativos</span>
              <strong>{report.frota.veiculosAtivos}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Abastecimentos</span>
              <strong>{report.frota.abastecimentos}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Litros no periodo</span>
              <strong>{report.frota.litros.toFixed(2)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Custo abastecido</span>
              <strong>{formatCurrency(report.frota.valorAbastecido)}</strong>
            </div>
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
              Pendencias gerenciais: <strong>{pendenciasCriticas}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="card-premium p-4">
        <div className="flex flex-col gap-1 mb-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Empresas do grupo</h2>
          </div>
          <p className="text-xs text-muted-foreground">Leitura executiva. Sem acesso a edicao de funcionarios ou rotinas de RH.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                <th className="text-left py-2 pr-3">Empresa</th>
                <th className="text-right py-2 px-2">Ativos</th>
                <th className="text-right py-2 px-2">Custo folha</th>
                <th className="text-right py-2 px-2">Proventos</th>
                <th className="text-right py-2 px-2">Descontos</th>
                <th className="text-right py-2 px-2">Folha liquida</th>
                <th className="text-right py-2 px-2">A receber</th>
                <th className="text-right py-2 px-2">A pagar</th>
                <th className="text-right py-2 px-2">Abastecimentos</th>
                <th className="text-right py-2 pl-2">Valor abastecido</th>
              </tr>
            </thead>
            <tbody>
              {report.porEmpresa.map((r) => (
                <tr key={r.companyId} className="border-b border-border/60">
                  <td className="py-2 pr-3">{r.companyName}</td>
                  <td className="py-2 px-2 text-right">{r.ativos}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(r.folhaCusto)}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(r.folhaProventos)}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(r.folhaDescontos)}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(r.folhaLiquida)}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(r.aReceber)}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(r.aPagar)}</td>
                  <td className="py-2 px-2 text-right">{r.abastecimentos}</td>
                  <td className="py-2 pl-2 text-right">{formatCurrency(r.valorAbastecido)}</td>
                </tr>
              ))}
              {report.porEmpresa.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-muted-foreground">
                    Sem dados para o filtro atual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DirectorDashboardPage;
