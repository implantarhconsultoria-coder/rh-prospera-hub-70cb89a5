import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  MapPin,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { calcPayrollBreakdown, formatCurrency } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
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
  chamadosAbertos: number;
  chamadosConcluidos: number;
  faturamento: number;
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
  operacional: {
    chamadosAbertos: number;
    chamadosConcluidos: number;
    clientesMapeados: number;
    equipamentosMapeados: number;
  };
  porEmpresa: CompanyRow[];
};

type TrendRow = {
  mes: string;
  competencia: string;
  faturamento: number;
  custos: number;
  folha: number;
  chamados: number;
};

type ComparisonData = {
  faturamento: number;
  custos: number;
  folha: number;
  chamadosConcluidos: number;
};

type OperationalPoint = {
  id: string;
  cliente: string;
  cidade: string;
  uf: string;
  chamadosRealizados: number;
  equipamentos: number;
  valorFaturado: number;
  ultimasVisitas: string;
};

const INITIAL_REPORT: ExecutiveData = {
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
  operacional: {
    chamadosAbertos: 0,
    chamadosConcluidos: 0,
    clientesMapeados: 0,
    equipamentosMapeados: 0,
  },
  porEmpresa: [],
};

const normalize = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateOnly = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const monthKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
const monthLabel = (competencia: string) => {
  const [year, month] = competencia.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
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
    out.add(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
};

const buildTrendMonths = (endDate: string, count = 6) => {
  const end = monthStart(new Date(`${endDate}T00:00:00`));
  return Array.from({ length: count }, (_, idx) => {
    const d = addMonths(end, idx - count + 1);
    const competencia = monthKey(d);
    return { competencia, mes: monthLabel(competencia), date: d };
  });
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

const previousRange = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return {
    start: toDateOnly(addMonths(start, -1)),
    end: toDateOnly(addMonths(end, -1)),
  };
};

const dateInRange = (date: string | null | undefined, start: string, end: string) => {
  const value = String(date || '').slice(0, 10);
  return value >= start && value <= end;
};

const valueByRange = (rows: any[], start: string, end: string, getter: (row: any) => number) =>
  rows.filter((row) => dateInRange(row.data || row.created_at, start, end)).reduce((sum, row) => sum + getter(row), 0);

const variation = (current: number, previous: number) => {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const shortCurrency = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `R$ ${(value / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1000) return `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return formatCurrency(value);
};

const statusOpen = new Set(['aberto', 'parcial', 'vencido', 'pendente', 'em_aberto', 'em andamento', 'em_andamento', 'novo']);
const statusDone = new Set(['concluido', 'concluido com sucesso', 'finalizado', 'encerrado', 'resolvido']);

const isIgnorableSupabaseError = (message?: string) => {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('could not find the table') ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('permission denied')
  );
};

const safeRows = <T,>(data: T[] | null | undefined): T[] => (Array.isArray(data) ? data : []);

const chartTooltip = (value: unknown, name: string) => {
  const numeric = Number(value || 0);
  const moneyLabels = ['faturamento', 'custos', 'folha', 'aReceber', 'aPagar', 'folhaCusto'];
  return [moneyLabels.includes(name) ? formatCurrency(numeric) : numeric.toLocaleString('pt-BR'), name];
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
  const [report, setReport] = useState<ExecutiveData>(INITIAL_REPORT);
  const [previous, setPrevious] = useState<ComparisonData>({ faturamento: 0, custos: 0, folha: 0, chamadosConcluidos: 0 });
  const [trendData, setTrendData] = useState<TrendRow[]>([]);
  const [mapPoints, setMapPoints] = useState<OperationalPoint[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string>('');

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
    const competencia = monthKey(today);
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
      const trendMonths = buildTrendMonths(endDate);
      const trendStart = toDateOnly(trendMonths[0].date);
      const prevRange = previousRange(startDate, endDate);
      const today = toDateOnly(new Date());

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
      const filteredEntries = entries.filter((e) => companyIds.has(e.companyId) && competenciaRange.has(e.competencia));

      const calcFolhaForEntries = (entryList: typeof entries) => {
        let custo = 0;
        let proventos = 0;
        let descontos = 0;
        let bruto = 0;
        let liquido = 0;
        let inss = 0;
        let fgts = 0;

        for (const entry of entryList) {
          const emp = filteredEmployees.find((e) => e.id === entry.employeeId);
          if (!emp) continue;
          const company = companyById.get(entry.companyId);
          const comissaoPct = company?.codigo === 'topac-gyn' ? 0.02 : 0.01;
          const diasUteis = getWorkingDays(entry.competencia);
          const payroll = calcPayrollBreakdown(emp, entry, { diasUteis, comissaoPct });
          const descontosEntry =
            payroll.descontosLegais + payroll.descontosOperacionais + payroll.adiantamento + payroll.descontosDiversos;
          proventos += payroll.proventos;
          descontos += descontosEntry;
          bruto += payroll.bruto;
          liquido += payroll.liquido;
          inss += payroll.inss;
          fgts += payroll.fgts;
          custo += payroll.proventos + payroll.fgts;
        }

        return { custo, proventos, descontos, bruto, liquido, inss, fgts };
      };

      const payrollTotals = calcFolhaForEntries(filteredEntries);
      const previousCompetencias = buildCompetenciasInRange(prevRange.start, prevRange.end);
      const previousEntries = entries.filter((e) => companyIds.has(e.companyId) && previousCompetencias.has(e.competencia));
      const previousPayroll = calcFolhaForEntries(previousEntries);

      const [
        titulosReceberRes,
        titulosPagarRes,
        recebimentosRes,
        pagamentosRes,
        veiculosRes,
        abastecimentosRes,
        chamadosRes,
        clientesRes,
        equipamentosRes,
      ] = await Promise.all([
        supabase.from('titulos_receber').select('saldo,status,data_vencimento,empresa_id'),
        supabase.from('titulos_pagar').select('saldo,status,data_vencimento,empresa_id'),
        supabase
          .from('recebimentos')
          .select('valor,data,titulos_receber!inner(empresa_id)')
          .gte('data', trendStart)
          .lte('data', endDate),
        supabase
          .from('pagamentos')
          .select('valor,data,titulos_pagar!inner(empresa_id)')
          .gte('data', trendStart)
          .lte('data', endDate),
        supabase.from('veiculos').select('id,status,placa'),
        supabase
          .from('abastecimentos')
          .select('empresa,data,litros,valor,km_atual,status,excluido')
          .gte('data', trendStart)
          .lte('data', endDate),
        supabase
          .from('chamados' as any)
          .select('id,status,created_at,empresa_id,cliente_id,equipamento_id')
          .gte('created_at', `${trendStart}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`)
          .limit(2000),
        supabase
          .from('clientes_fat' as any)
          .select('id,razao_social,nome_fantasia,cidade,uf,empresa_id')
          .limit(1000),
        supabase.from('equipamentos' as any).select('id,cliente_id').limit(2000),
      ]);

      const queryErrors = [
        titulosReceberRes.error,
        titulosPagarRes.error,
        recebimentosRes.error,
        pagamentosRes.error,
        veiculosRes.error,
        abastecimentosRes.error,
        chamadosRes.error,
        clientesRes.error,
        equipamentosRes.error,
      ].filter(Boolean);

      const fatalQueryError = queryErrors.find((err) => !isIgnorableSupabaseError(err?.message));
      if (fatalQueryError) throw new Error(fatalQueryError.message);

      const titulosReceber = safeRows(titulosReceberRes.data).filter((t: any) => companyIds.has(t.empresa_id));
      const titulosPagar = safeRows(titulosPagarRes.data).filter((t: any) => companyIds.has(t.empresa_id));
      const recebimentos = safeRows(recebimentosRes.data).filter((r: any) => companyIds.has(r.titulos_receber?.empresa_id));
      const pagamentos = safeRows(pagamentosRes.data).filter((p: any) => companyIds.has(p.titulos_pagar?.empresa_id));
      const chamados = safeRows(chamadosRes.data).filter((c: any) => !c.empresa_id || companyIds.has(c.empresa_id));
      const clientes = safeRows(clientesRes.data).filter((c: any) => !c.empresa_id || companyIds.has(c.empresa_id));
      const equipamentos = safeRows(equipamentosRes.data);

      const aReceber = titulosReceber
        .filter((t: any) => statusOpen.has(String(t.status)))
        .reduce((s: number, t: any) => s + Number(t.saldo || 0), 0);
      const aPagar = titulosPagar
        .filter((t: any) => statusOpen.has(String(t.status)))
        .reduce((s: number, t: any) => s + Number(t.saldo || 0), 0);
      const vencidoReceber = titulosReceber
        .filter((t: any) => statusOpen.has(String(t.status)) && String(t.data_vencimento || '') < today)
        .reduce((s: number, t: any) => s + Number(t.saldo || 0), 0);
      const vencidoPagar = titulosPagar
        .filter((t: any) => statusOpen.has(String(t.status)) && String(t.data_vencimento || '') < today)
        .reduce((s: number, t: any) => s + Number(t.saldo || 0), 0);

      const recebidoPeriodo = valueByRange(recebimentos, startDate, endDate, (r) => Number(r.valor || 0));
      const pagoPeriodo = valueByRange(pagamentos, startDate, endDate, (p) => Number(p.valor || 0));
      const recebidoAnterior = valueByRange(recebimentos, prevRange.start, prevRange.end, (r) => Number(r.valor || 0));
      const pagoAnterior = valueByRange(pagamentos, prevRange.start, prevRange.end, (p) => Number(p.valor || 0));

      const abastBase = safeRows(abastecimentosRes.data).filter((a: any) => !a.excluido && a.status !== 'cancelado');
      const selectedCompanyId = companyFilter === 'geral' ? '' : targetCompanies[0]?.id;
      const abastFiltrados = companyFilter === 'geral'
        ? abastBase
        : selectedCompanyId
          ? abastBase.filter((a: any) => matchAbastCompany(a.empresa || '', selectedCompanyId))
          : [];
      const abastPeriodo = abastFiltrados.filter((a: any) => dateInRange(a.data, startDate, endDate));
      const frotaVeiculosAtivos = safeRows(veiculosRes.data).filter((v: any) => String(v.status).toLowerCase() === 'ativo').length;
      const frotaLitros = abastPeriodo.reduce((s: number, a: any) => s + Number(a.litros || 0), 0);
      const frotaValor = abastPeriodo.reduce((s: number, a: any) => s + Number(a.valor || 0), 0);
      const kmComValor = abastPeriodo.map((a: any) => Number(a.km_atual)).filter((v) => Number.isFinite(v) && v > 0);
      const kmMedio = kmComValor.length ? kmComValor.reduce((s, v) => s + v, 0) / kmComValor.length : 0;

      const chamadosPeriodo = chamados.filter((c: any) => dateInRange(c.created_at, startDate, endDate));
      const chamadosAbertos = chamadosPeriodo.filter((c: any) => statusOpen.has(normalize(c.status))).length;
      const chamadosConcluidos = chamadosPeriodo.filter((c: any) => statusDone.has(normalize(c.status))).length;
      const chamadosConcluidosAnterior = chamados
        .filter((c: any) => dateInRange(c.created_at, prevRange.start, prevRange.end) && statusDone.has(normalize(c.status)))
        .length;

      const porEmpresa: CompanyRow[] = targetCompanies.map((company) => {
        const emps = activeEmployees.filter((e) => e.companyId === company.id).length;
        const entriesCompany = filteredEntries.filter((e) => e.companyId === company.id);
        const totalsCompany = calcFolhaForEntries(entriesCompany);
        const recCompany = titulosReceber
          .filter((t: any) => t.empresa_id === company.id && statusOpen.has(String(t.status)))
          .reduce((s: number, t: any) => s + Number(t.saldo || 0), 0);
        const faturamentoCompany = recebimentos
          .filter((r: any) => r.titulos_receber?.empresa_id === company.id && dateInRange(r.data, startDate, endDate))
          .reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
        const pagCompany = titulosPagar
          .filter((t: any) => t.empresa_id === company.id && statusOpen.has(String(t.status)))
          .reduce((s: number, t: any) => s + Number(t.saldo || 0), 0);
        const abastCompany = abastBase.filter((a: any) => matchAbastCompany(a.empresa || '', company.id));
        const valorAbastCompany = abastCompany
          .filter((a: any) => dateInRange(a.data, startDate, endDate))
          .reduce((s: number, a: any) => s + Number(a.valor || 0), 0);
        const chamadosCompany = chamadosPeriodo.filter((c: any) => c.empresa_id === company.id);

        return {
          companyId: company.id,
          companyName: company.name,
          ativos: emps,
          folhaCusto: totalsCompany.custo,
          folhaProventos: totalsCompany.proventos,
          folhaDescontos: totalsCompany.descontos,
          folhaLiquida: totalsCompany.liquido,
          aReceber: recCompany,
          aPagar: pagCompany,
          abastecimentos: abastCompany.length,
          valorAbastecido: valorAbastCompany,
          chamadosAbertos: chamadosCompany.filter((c: any) => statusOpen.has(normalize(c.status))).length,
          chamadosConcluidos: chamadosCompany.filter((c: any) => statusDone.has(normalize(c.status))).length,
          faturamento: faturamentoCompany,
        };
      });

      const trends: TrendRow[] = trendMonths.map(({ competencia, mes }) => {
        const monthEntries = entries.filter((e) => companyIds.has(e.companyId) && e.competencia === competencia);
        const monthPayroll = calcFolhaForEntries(monthEntries);
        const monthRecebimentos = recebimentos
          .filter((r: any) => monthKey(new Date(`${String(r.data).slice(0, 10)}T00:00:00`)) === competencia)
          .reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
        const monthPagamentos = pagamentos
          .filter((p: any) => monthKey(new Date(`${String(p.data).slice(0, 10)}T00:00:00`)) === competencia)
          .reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
        const monthChamados = chamados
          .filter((c: any) => monthKey(new Date(String(c.created_at || '').slice(0, 10))) === competencia)
          .filter((c: any) => statusDone.has(normalize(c.status))).length;
        return {
          mes,
          competencia,
          faturamento: monthRecebimentos,
          custos: monthPagamentos,
          folha: monthPayroll.custo,
          chamados: monthChamados,
        };
      });

      const points: OperationalPoint[] = clientes
        .filter((cliente: any) => cliente.cidade || cliente.uf)
        .slice(0, 12)
        .map((cliente: any) => {
          const clienteChamados = chamados.filter((c: any) => c.cliente_id === cliente.id);
          const clienteEquipamentos = equipamentos.filter((e: any) => e.cliente_id === cliente.id).length;
          const clienteReceber = titulosReceber
            .filter((t: any) => t.cliente_id === cliente.id)
            .reduce((s: number, t: any) => s + Number(t.saldo || 0), 0);
          const lastVisit = clienteChamados
            .map((c: any) => String(c.created_at || '').slice(0, 10))
            .filter(Boolean)
            .sort()
            .pop();

          return {
            id: cliente.id,
            cliente: cliente.razao_social || cliente.nome_fantasia || 'Cliente sem nome',
            cidade: cliente.cidade || '-',
            uf: cliente.uf || '',
            chamadosRealizados: clienteChamados.length,
            equipamentos: clienteEquipamentos,
            valorFaturado: clienteReceber,
            ultimasVisitas: lastVisit ? new Date(`${lastVisit}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem registro',
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
          folhaCusto: payrollTotals.custo,
          proventos: payrollTotals.proventos,
          descontos: payrollTotals.descontos,
          folhaBruta: payrollTotals.bruto,
          folhaLiquida: payrollTotals.liquido,
          inss: payrollTotals.inss,
          fgts: payrollTotals.fgts,
        },
        frota: {
          veiculosAtivos: frotaVeiculosAtivos,
          abastecimentos: abastPeriodo.length,
          litros: frotaLitros,
          valorAbastecido: frotaValor,
          kmMedio,
        },
        operacional: {
          chamadosAbertos,
          chamadosConcluidos,
          clientesMapeados: clientes.length,
          equipamentosMapeados: equipamentos.length,
        },
        porEmpresa,
      });
      setPrevious({
        faturamento: recebidoAnterior,
        custos: pagoAnterior,
        folha: previousPayroll.custo,
        chamadosConcluidos: chamadosConcluidosAnterior,
      });
      setTrendData(trends);
      setMapPoints(points);
      setSelectedPointId((current) => current || points[0]?.id || '');
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
      ['RESUMO EXECUTIVO'],
      ['Faturamento total', report.financeiro.recebidoPeriodo],
      ['Custos operacionais', report.financeiro.pagoPeriodo + report.frota.valorAbastecido],
      ['Custos de folha', report.rh.folhaCusto],
      ['Funcionarios ativos', report.rh.ativos],
      ['Chamados abertos', report.operacional.chamadosAbertos],
      ['Chamados concluidos', report.operacional.chamadosConcluidos],
      ['Valor a receber', report.financeiro.aReceber],
      ['Valor a pagar', report.financeiro.aPagar],
      [],
      ['POR EMPRESA'],
      ['Empresa', 'Ativos', 'Custo folha', 'Faturamento', 'Proventos', 'Descontos', 'Folha liquida', 'A receber', 'A pagar', 'Chamados abertos', 'Chamados concluidos'],
      ...report.porEmpresa.map((r) => [
        r.companyName,
        r.ativos,
        r.folhaCusto,
        r.faturamento,
        r.folhaProventos,
        r.folhaDescontos,
        r.folhaLiquida,
        r.aReceber,
        r.aPagar,
        r.chamadosAbertos,
        r.chamadosConcluidos,
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
    'Diretor',
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
  const selectedPoint = mapPoints.find((point) => point.id === selectedPointId) || mapPoints[0];
  const operationalCost = report.financeiro.pagoPeriodo + report.frota.valorAbastecido;
  const margin = report.financeiro.recebidoPeriodo - operationalCost - report.rh.folhaCusto;
  const totalOverviewCards = [
    { label: 'Funcionarios ativos', value: report.rh.ativos.toLocaleString('pt-BR') },
    { label: 'Custo de folha', value: formatCurrency(report.rh.folhaCusto) },
    { label: 'Faturamento', value: formatCurrency(report.financeiro.recebidoPeriodo) },
    { label: 'Contas a receber', value: formatCurrency(report.financeiro.aReceber) },
    { label: 'Contas a pagar', value: formatCurrency(report.financeiro.aPagar) },
    { label: 'Chamados abertos', value: report.operacional.chamadosAbertos.toLocaleString('pt-BR') },
    { label: 'Chamados concluidos', value: report.operacional.chamadosConcluidos.toLocaleString('pt-BR') },
  ];

  const executiveCards = [
    {
      label: 'Faturamento Total',
      value: shortCurrency(report.financeiro.recebidoPeriodo),
      rawValue: report.financeiro.recebidoPeriodo,
      previousValue: previous.faturamento,
      helper: 'Recebimentos no periodo',
      icon: CircleDollarSign,
      color: '#2563eb',
    },
    {
      label: 'Custos Operacionais',
      value: shortCurrency(operationalCost),
      rawValue: operationalCost,
      previousValue: previous.custos,
      helper: 'Pagamentos + abastecimento',
      icon: CreditCard,
      color: '#f97316',
    },
    {
      label: 'Custos de Folha',
      value: shortCurrency(report.rh.folhaCusto),
      rawValue: report.rh.folhaCusto,
      previousValue: previous.folha,
      helper: 'Proventos + FGTS',
      icon: Wallet,
      color: '#7c3aed',
    },
    {
      label: 'Funcionarios Ativos',
      value: String(report.rh.ativos),
      rawValue: report.rh.ativos,
      previousValue: report.rh.ativos,
      helper: `${report.rh.operacionais} operacionais`,
      icon: Users,
      color: '#059669',
    },
    {
      label: 'Chamados Abertos',
      value: String(report.operacional.chamadosAbertos),
      rawValue: report.operacional.chamadosAbertos,
      previousValue: 0,
      helper: 'Pendencias operacionais',
      icon: ClipboardList,
      color: '#dc2626',
    },
    {
      label: 'Chamados Concluidos',
      value: String(report.operacional.chamadosConcluidos),
      rawValue: report.operacional.chamadosConcluidos,
      previousValue: previous.chamadosConcluidos,
      helper: 'Entrega no periodo',
      icon: CheckCircle2,
      color: '#16a34a',
    },
    {
      label: 'Valor a Receber',
      value: shortCurrency(report.financeiro.aReceber),
      rawValue: report.financeiro.aReceber,
      previousValue: 0,
      helper: `${formatCurrency(report.financeiro.vencidoReceber)} vencido`,
      icon: TrendingUp,
      color: '#0891b2',
    },
    {
      label: 'Valor a Pagar',
      value: shortCurrency(report.financeiro.aPagar),
      rawValue: report.financeiro.aPagar,
      previousValue: 0,
      helper: `${formatCurrency(report.financeiro.vencidoPagar)} vencido`,
      icon: FileText,
      color: '#be123c',
    },
  ];

  const comparisonNarratives = [
    {
      label: 'Faturamento',
      value: variation(report.financeiro.recebidoPeriodo, previous.faturamento),
      text: 'em relacao ao mes anterior',
    },
    {
      label: 'Custos operacionais',
      value: variation(operationalCost, previous.custos),
      text: 'comparado ao periodo anterior',
    },
    {
      label: 'Folha salarial',
      value: variation(report.rh.folhaCusto, previous.folha),
      text: 'na comparacao mensal',
    },
    {
      label: 'Chamados concluidos',
      value: variation(report.operacional.chamadosConcluidos, previous.chamadosConcluidos),
      text: 'de produtividade operacional',
    },
  ];

  const companyComparisonData = report.porEmpresa.map((company) => ({
    empresa: company.companyName.replace('TOPAC FILIAL ', '').replace('TOPAC ', ''),
    faturamento: company.faturamento,
    folhaCusto: company.folhaCusto,
    aReceber: company.aReceber,
    aPagar: company.aPagar,
  }));

  return (
    <div className="animate-fade-in rounded-lg bg-slate-50 p-3 text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:p-4 md:p-6">
      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
              <ShieldCheck className="h-4 w-4 text-slate-700" />
              Diretor Geral - somente leitura
            </div>
            <h1 className="break-words text-2xl font-black tracking-tight text-slate-950 sm:text-3xl md:text-4xl">Dashboard Executivo TOPAC</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Painel gerencial consolidado para acompanhar saude da empresa, tendencias, custos, faturamento, RH e operacao sem acesso a edicao.
            </p>
            {generatedAt && <p className="mt-2 text-xs text-slate-500">Atualizado em {generatedAt}</p>}
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
            <Button variant="outline" onClick={exportarCsv} className="h-11 w-full border-slate-300 bg-white text-slate-800 hover:bg-slate-100">
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button variant="outline" onClick={exportarCsv} className="h-11 w-full border-slate-300 bg-white text-slate-800 hover:bg-slate-100">
              <FileText className="mr-2 h-4 w-4" />
              Solicitar relatorio
            </Button>
            <Button onClick={runReport} disabled={loading} className="h-11 w-full bg-slate-950 text-white hover:bg-slate-800">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar painel
            </Button>
          </div>
        </div>
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Periodo</label>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="diario">Diario</option>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
            <option value="mensal">Mensal</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Empresa</label>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="geral">Geral consolidado</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Data inicial</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setPreset('personalizado');
              setStartDate(e.target.value);
            }}
            className="border-slate-300 bg-white text-slate-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Data final</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setPreset('personalizado');
              setEndDate(e.target.value);
            }}
            className="border-slate-300 bg-white text-slate-900"
          />
        </div>
        <div className="flex items-end text-sm text-slate-500 sm:col-span-2 xl:col-span-1">
          <div className="flex min-h-10 items-center gap-2 break-words">
            <CalendarDays className="h-4 w-4" />
            {startDate} ate {endDate}
          </div>
        </div>
      </section>

      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {executiveCards.map((card) => {
          const Icon = card.icon;
          const delta = variation(card.rawValue, card.previousValue);
          const showDelta = card.previousValue > 0 || card.rawValue > 0;
          const positive = delta >= 0;
          return (
            <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{card.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.helper}</p>
                </div>
                <div className="rounded-md p-2 text-white" style={{ backgroundColor: card.color }}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs">
                {showDelta ? (
                  <>
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {Math.abs(delta).toFixed(1)}%
                    </span>
                    <span className="text-slate-500">mes anterior</span>
                  </>
                ) : (
                  <span className="text-slate-400">Sem base anterior</span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[.85fr_1.15fr]">
        <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Total geral consolidado</p>
          <h2 className="mt-2 text-2xl font-black">Visao geral executiva</h2>
          <p className="mt-1 text-sm text-slate-300">Consolidado das empresas do grupo para leitura rapida da diretoria.</p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {totalOverviewCards.map((item) => (
              <div key={item.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-400">{item.label}</p>
                <p className="mt-2 break-words text-lg font-black text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Visao por empresa</h2>
              <p className="text-sm text-slate-500">Resumo individual de Matriz, filiais e empresas do grupo.</p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{report.porEmpresa.length} empresa(s)</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.porEmpresa.map((company) => (
              <article key={company.companyId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="break-words text-sm font-black text-slate-950">{company.companyName}</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Ativos</span><strong>{company.ativos}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Folha</span><strong>{formatCurrency(company.folhaCusto)}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Faturamento</span><strong>{formatCurrency(company.faturamento)}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">A receber</span><strong>{formatCurrency(company.aReceber)}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">A pagar</span><strong>{formatCurrency(company.aPagar)}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Chamados</span><strong>{company.chamadosAbertos}/{company.chamadosConcluidos}</strong></div>
                </div>
              </article>
            ))}
            {report.porEmpresa.length === 0 && <p className="text-sm text-slate-500">Sem empresas para o filtro atual.</p>}
          </div>
        </div>
      </section>

      <section className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Comparativo inteligente</h2>
              <p className="text-sm text-slate-500">Leitura automatica do mes atual contra o mes anterior.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-slate-500" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {comparisonNarratives.map((item) => {
              const positive = item.value >= 0;
              return (
                <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{item.label}</p>
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${positive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {Math.abs(item.value).toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {item.label} {positive ? 'aumentou' : 'reduziu'} {Math.abs(item.value).toFixed(1)}% {item.text}.
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
          <h2 className="text-lg font-bold">Saude executiva</h2>
          <p className="mt-1 text-sm text-slate-300">Indicadores consolidados sem edicao operacional.</p>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-slate-300">Margem projetada</span>
              <strong className={margin >= 0 ? 'text-emerald-300' : 'text-red-300'}>{formatCurrency(margin)}</strong>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-slate-300">Documentos pendentes</span>
              <strong>{Number(intelligenceCounts.documentosPendentes || 0)}</strong>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-slate-300">Solicitacoes pendentes</span>
              <strong>{Number(intelligenceCounts.solicitacoesPendentes || 0)}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">ASOs em alerta</span>
              <strong>{Number(corporateSnapshot.asoAlertas || 0)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-lg font-bold text-slate-950">Evolucao mensal</h2>
          <p className="mb-4 text-sm text-slate-500">Faturamento, custos e folha em linha gerencial.</p>
          <div className="h-72 overflow-x-auto">
            <div className="h-full min-w-[640px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="directorRevenue" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis dataKey="mes" stroke="#64748b" tickLine={false} />
                <YAxis stroke="#64748b" tickLine={false} tickFormatter={(v) => shortCurrency(Number(v)).replace('R$ ', '')} width={64} />
                <Tooltip formatter={chartTooltip} />
                <Area type="monotone" dataKey="faturamento" name="faturamento" stroke="#2563eb" fill="url(#directorRevenue)" strokeWidth={3} />
                <Line type="monotone" dataKey="custos" name="custos" stroke="#f97316" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="folha" name="folha" stroke="#7c3aed" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-lg font-bold text-slate-950">Evolucao de chamados</h2>
          <p className="mb-4 text-sm text-slate-500">Chamados concluidos por mes, para leitura operacional consolidada.</p>
          <div className="h-72 overflow-x-auto">
            <div className="h-full min-w-[520px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis dataKey="mes" stroke="#64748b" tickLine={false} />
                <YAxis stroke="#64748b" tickLine={false} width={36} />
                <Tooltip formatter={chartTooltip} />
                <Bar dataKey="chamados" name="chamados" radius={[4, 4, 0, 0]}>
                  {trendData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#22c55e' : '#0891b2'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-lg font-bold text-slate-950">Comparativo entre empresas</h2>
          <p className="mb-4 text-sm text-slate-500">Matriz, filiais e empresas do grupo com leitura consolidada.</p>
          <div className="h-80 overflow-x-auto">
            <div className="h-full min-w-[620px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={companyComparisonData} layout="vertical" margin={{ left: 18 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis type="number" stroke="#64748b" tickLine={false} tickFormatter={(v) => shortCurrency(Number(v)).replace('R$ ', '')} />
                <YAxis type="category" dataKey="empresa" stroke="#64748b" tickLine={false} width={115} />
                <Tooltip formatter={chartTooltip} />
                <Bar dataKey="faturamento" name="faturamento" fill="#16a34a" radius={[0, 4, 4, 0]} />
                <Bar dataKey="folhaCusto" name="folha" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                <Bar dataKey="aReceber" name="aReceber" fill="#2563eb" radius={[0, 4, 4, 0]} />
                <Bar dataKey="aPagar" name="aPagar" fill="#f97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Mapa operacional</h2>
              <p className="text-sm text-slate-500">Clientes e operacoes carregados da base real.</p>
            </div>
            <MapPin className="h-5 w-5 text-slate-500" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[.85fr_1fr]">
            <div className="relative min-h-72 overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.18)_1px,transparent_1px)] bg-[size:28px_28px]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_28%,rgba(37,99,235,.35),transparent_28%),radial-gradient(circle_at_74%_70%,rgba(34,197,94,.24),transparent_26%)]" />
              <div className="relative grid h-full min-h-72 grid-cols-3 grid-rows-4 gap-4 p-5">
                {mapPoints.slice(0, 12).map((point, idx) => (
                  <button
                    key={point.id}
                    type="button"
                    onClick={() => setSelectedPointId(point.id)}
                    className={`self-center justify-self-center rounded-full border-2 p-1 transition ${selectedPoint?.id === point.id ? 'scale-125 border-white bg-blue-500' : 'border-white/70 bg-emerald-400 hover:scale-110'}`}
                    title={`${point.cliente} - ${point.cidade}/${point.uf}`}
                    style={{ gridColumn: (idx % 3) + 1, gridRow: Math.floor(idx / 3) + 1 }}
                  >
                    <span className="block h-3 w-3 rounded-full bg-white" />
                  </button>
                ))}
                {mapPoints.length === 0 && (
                  <div className="col-span-3 row-span-4 flex items-center justify-center text-center text-sm text-slate-300">
                    Nenhum cliente com cidade/UF carregado para montar pontos operacionais.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              {selectedPoint ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ponto selecionado</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-950">{selectedPoint.cliente}</h3>
                  <p className="text-sm text-slate-600">{selectedPoint.cidade}/{selectedPoint.uf}</p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-3 border-b border-slate-200 pb-2">
                      <span className="text-slate-500">Chamados realizados</span>
                      <strong>{selectedPoint.chamadosRealizados}</strong>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-slate-200 pb-2">
                      <span className="text-slate-500">Equipamentos vinculados</span>
                      <strong>{selectedPoint.equipamentos}</strong>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-slate-200 pb-2">
                      <span className="text-slate-500">Valor faturado/aberto</span>
                      <strong>{formatCurrency(selectedPoint.valorFaturado)}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Ultimas visitas</span>
                      <strong>{selectedPoint.ultimasVisitas}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Estrutura pronta para receber clientes com localizacao real.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-bold text-slate-950">Empresas do grupo</h2>
          </div>
          <p className="text-xs text-slate-500">Somente leitura. Sem cadastro, lancamento ou alteracao operacional.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {report.porEmpresa.map((r) => (
            <article key={r.companyId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h3 className="break-words text-sm font-black text-slate-950">{r.companyName}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="block text-slate-500">Ativos</span><strong>{r.ativos}</strong></div>
                <div><span className="block text-slate-500">Faturamento</span><strong>{formatCurrency(r.faturamento)}</strong></div>
                <div><span className="block text-slate-500">Custo folha</span><strong>{formatCurrency(r.folhaCusto)}</strong></div>
                <div><span className="block text-slate-500">A receber</span><strong>{formatCurrency(r.aReceber)}</strong></div>
                <div><span className="block text-slate-500">A pagar</span><strong>{formatCurrency(r.aPagar)}</strong></div>
                <div><span className="block text-slate-500">Chamados</span><strong>{r.chamadosAbertos}/{r.chamadosConcluidos}</strong></div>
              </div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-3 text-left">Empresa</th>
                <th className="px-2 py-2 text-right">Ativos</th>
                <th className="px-2 py-2 text-right">Custo folha</th>
                <th className="px-2 py-2 text-right">Faturamento</th>
                <th className="px-2 py-2 text-right">A receber</th>
                <th className="px-2 py-2 text-right">A pagar</th>
                <th className="px-2 py-2 text-right">Chamados abertos</th>
                <th className="px-2 py-2 text-right">Chamados concluidos</th>
                <th className="py-2 pl-2 text-right">Abastecimento</th>
              </tr>
            </thead>
            <tbody>
              {report.porEmpresa.map((r) => (
                <tr key={r.companyId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 pr-3 font-semibold text-slate-900">{r.companyName}</td>
                  <td className="px-2 py-3 text-right">{r.ativos}</td>
                  <td className="px-2 py-3 text-right">{formatCurrency(r.folhaCusto)}</td>
                  <td className="px-2 py-3 text-right">{formatCurrency(r.faturamento)}</td>
                  <td className="px-2 py-3 text-right">{formatCurrency(r.aReceber)}</td>
                  <td className="px-2 py-3 text-right">{formatCurrency(r.aPagar)}</td>
                  <td className="px-2 py-3 text-right">{r.chamadosAbertos}</td>
                  <td className="px-2 py-3 text-right">{r.chamadosConcluidos}</td>
                  <td className="py-3 pl-2 text-right">{formatCurrency(r.valorAbastecido)}</td>
                </tr>
              ))}
              {report.porEmpresa.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-500">
                    Sem dados para o filtro atual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Alertas executivos</h2>
          <div className="mt-3 space-y-2">
            {intelligenceAlerts.slice(0, 4).map((alert) => (
              <div key={alert.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">{alert.title}</p>
                <p className="mt-1 text-sm text-slate-600">{alert.message}</p>
              </div>
            ))}
            {intelligenceAlerts.length === 0 && <p className="text-sm text-slate-500">Nenhum alerta critico encontrado nos dados carregados.</p>}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Calendario corporativo</h2>
          <div className="mt-3 space-y-2">
            {calendarEvents.slice(0, 4).map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="font-semibold text-slate-900">{event.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{event.message}</p>
                </div>
                <span className="whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white">
                  {event.daysUntil} dia(s)
                </span>
              </div>
            ))}
            {calendarEvents.length === 0 && <p className="text-sm text-slate-500">Sem eventos relevantes nos proximos 30 dias.</p>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DirectorDashboardPage;
