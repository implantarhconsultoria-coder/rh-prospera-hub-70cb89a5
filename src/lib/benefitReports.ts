import type { Employee, MonthlyEntry } from '@/types/database';

export type BenefitReportRow = {
  emp: Employee;
  entry?: MonthlyEntry;
  descontoEntry?: MonthlyEntry;
  valorDiario: number;
  diasPrevistos: number;
  diasDescontados: number;
  diasFinais: number;
  valorTotal: number;
  motivo: string;
  corrigido?: boolean;
  correcaoObservacao?: string | null;
  correcaoMotivo?: string | null;
};

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const getPreviousCompetencia = (competencia: string) => {
  const match = String(competencia || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const previous = new Date(year, monthIndex - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
};

const getCompleteEntries = (entries: MonthlyEntry[]) => {
  if (typeof window === 'undefined') return entries;
  const cached = (window as any).__topacMonthlyEntries;
  return Array.isArray(cached) ? cached as MonthlyEntry[] : entries;
};

const inferCompetencia = (entries: MonthlyEntry[], competencia?: string) =>
  competencia || entries.find((entry) => Boolean(entry.competencia))?.competencia || '';

const findEntry = (entries: MonthlyEntry[], employeeId: string, competencia?: string) =>
  entries.find((item) => item.employeeId === employeeId && (!competencia || item.competencia === competencia));

const findEntryWithFallback = (entries: MonthlyEntry[], employeeId: string, competencia?: string) =>
  findEntry(entries, employeeId, competencia) || findEntry(getCompleteEntries(entries), employeeId, competencia);

const buildBenefitRow = ({
  emp,
  entry,
  descontoEntry,
  diasUteis,
  type,
}: {
  emp: Employee;
  entry?: MonthlyEntry;
  descontoEntry?: MonthlyEntry;
  diasUteis: number;
  type: 'vr' | 'vt';
}): BenefitReportRow => {
  const faltasDias = descontoEntry?.faltasDias || 0;
  const diasPrevistos = type === 'vr' ? (entry?.vrDias ?? diasUteis) : diasUteis;
  const diasDescontados = Math.min(faltasDias, diasPrevistos);
  const diasFinais = Math.max(0, diasPrevistos - diasDescontados);
  const valorDiario = type === 'vr' ? emp.vrDiario : emp.vtDiario;
  const valorTotal = roundCurrency(valorDiario * diasFinais);
  const motivo = diasDescontados > 0
    ? `${diasDescontados} falta(s) da competência anterior${descontoEntry?.competencia ? ` (${descontoEntry.competencia})` : ''}`
    : '';

  return {
    emp,
    entry,
    descontoEntry,
    valorDiario: roundCurrency(valorDiario),
    diasPrevistos,
    diasDescontados,
    diasFinais,
    valorTotal,
    motivo,
  };
};

export const buildVRReportRows = (employees: Employee[], entries: MonthlyEntry[], diasUteis: number, competencia?: string) => {
  const currentCompetencia = inferCompetencia(entries, competencia);
  const previousCompetencia = getPreviousCompetencia(currentCompetencia);
  return employees.map((emp) =>
    buildBenefitRow({
      emp,
      entry: findEntryWithFallback(entries, emp.id, currentCompetencia),
      descontoEntry: previousCompetencia ? findEntryWithFallback(entries, emp.id, previousCompetencia) : findEntry(entries, emp.id),
      diasUteis,
      type: 'vr',
    }),
  );
};

export const buildVTReportRows = (employees: Employee[], entries: MonthlyEntry[], diasUteis: number, competencia?: string) => {
  const currentCompetencia = inferCompetencia(entries, competencia);
  const previousCompetencia = getPreviousCompetencia(currentCompetencia);
  return employees.map((emp) =>
    buildBenefitRow({
      emp,
      entry: findEntryWithFallback(entries, emp.id, currentCompetencia),
      descontoEntry: previousCompetencia ? findEntryWithFallback(entries, emp.id, previousCompetencia) : findEntry(entries, emp.id),
      diasUteis,
      type: 'vt',
    }),
  );
};

export const sumBenefitRows = (rows: BenefitReportRow[]) =>
  roundCurrency(rows.reduce((sum, row) => sum + row.valorTotal, 0));

export const buildIndividualBenefitData = ({
  emp,
  entry,
  descontoEntry,
  diasUteis,
  type,
}: {
  emp?: Employee;
  entry?: MonthlyEntry;
  descontoEntry?: MonthlyEntry;
  diasUteis: number;
  type: 'vr' | 'vt';
}) => {
  if (!emp) return null;
  if (type === 'vr' && !emp.vrAtivo) return null;
  if (type === 'vt' && !emp.vtAtivo) return null;

  const row = buildBenefitRow({ emp, entry, descontoEntry: descontoEntry ?? entry, diasUteis, type });
  return {
    valorDiario: row.valorDiario,
    diasPrevistos: row.diasPrevistos,
    diasDescontados: row.diasDescontados,
    diasFinais: row.diasFinais,
    valorTotal: row.valorTotal,
    motivo: row.motivo,
  };
};