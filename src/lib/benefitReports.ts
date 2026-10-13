import type { Employee, MonthlyEntry } from '@/types/database';
import { getWorkingDaysBetween } from '@/lib/workingDays';

export type VrCalculationType = 'MENSAL' | 'PROPORCIONAL_ADMISSAO';

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
  tipoCalculo?: VrCalculationType;
  dataAdmissao?: string | null;
  periodoInicio?: string | null;
  periodoFim?: string | null;
  diasUteisCalculados?: number;
};

export type VrAdmissionCalculation = {
  eligible: boolean;
  tipoCalculo: VrCalculationType;
  dataAdmissao: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  diasUteisCalculados: number | null;
  reason?: 'ADMISSION_AFTER_COMPETENCIA';
};

export type BenefitGenerationSnapshotRow = {
  employee_id: string;
  [key: string]: unknown;
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

const getCompetenciaBounds = (competencia: string) => {
  const match = String(competencia || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    first: `${match[1]}-${match[2]}-01`,
    last: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
  };
};

const normalizeDateOnly = (value: unknown) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

export const getVRAdmissionCalculation = (
  employee: Pick<Employee, 'dataAdmissao'>,
  competencia: string,
  feriados: string[] = [],
): VrAdmissionCalculation => {
  const bounds = getCompetenciaBounds(competencia);
  const dataAdmissao = normalizeDateOnly(employee?.dataAdmissao);
  if (!bounds || !dataAdmissao || dataAdmissao < bounds.first) {
    return {
      eligible: true,
      tipoCalculo: 'MENSAL',
      dataAdmissao,
      periodoInicio: null,
      periodoFim: null,
      diasUteisCalculados: null,
    };
  }
  if (dataAdmissao > bounds.last) {
    return {
      eligible: false,
      tipoCalculo: 'MENSAL',
      dataAdmissao,
      periodoInicio: null,
      periodoFim: null,
      diasUteisCalculados: 0,
      reason: 'ADMISSION_AFTER_COMPETENCIA',
    };
  }
  return {
    eligible: true,
    tipoCalculo: 'PROPORCIONAL_ADMISSAO',
    dataAdmissao,
    periodoInicio: dataAdmissao,
    periodoFim: bounds.last,
    diasUteisCalculados: getWorkingDaysBetween(dataAdmissao, bounds.last, feriados),
  };
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

const getDiasPrevistos = (entry: MonthlyEntry | undefined, diasUteis: number, type: 'vr' | 'vt') => {
  const diasPagosSelecionados = Math.max(0, Number(diasUteis || 0));
  if (diasPagosSelecionados > 0) return diasPagosSelecionados;
  if (type === 'vt') return 0;
  return Math.max(0, Number(entry?.vrDias || 0));
};

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
  // VR e VT são pagos antecipadamente. As faltas lançadas no mês anterior
  // são descontadas na competência atual. O lançamento do próprio mês não
  // pode reduzir o benefício que já está sendo pago agora.
  const faltasCompetenciaAnterior = Math.max(0, Number(descontoEntry?.faltasDias || 0));
  const diasPrevistos = getDiasPrevistos(entry, diasUteis, type);
  const diasDescontados = Math.min(faltasCompetenciaAnterior, diasPrevistos);
  const diasFinais = Math.max(0, diasPrevistos - diasDescontados);
  const valorDiario = Math.max(0, Number(type === 'vr' ? emp.vrDiario : emp.vtDiario) || 0);
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

export const buildVRReportRows = (
  employees: Employee[],
  entries: MonthlyEntry[],
  diasUteis: number,
  competencia?: string,
  feriados: string[] = [],
) => {
  const currentCompetencia = inferCompetencia(entries, competencia);
  const previousCompetencia = getPreviousCompetencia(currentCompetencia);
  return employees.flatMap((emp) => {
    const admission = getVRAdmissionCalculation(emp, currentCompetencia, feriados);
    if (!admission.eligible) return [];
    const proportional = admission.tipoCalculo === 'PROPORCIONAL_ADMISSAO';
    const diasBase = proportional ? Number(admission.diasUteisCalculados || 0) : diasUteis;
    const row = buildBenefitRow({
      emp,
      entry: findEntryWithFallback(entries, emp.id, currentCompetencia),
      // Funcionário admitido na competência atual não trabalhou na competência anterior.
      descontoEntry: proportional || !previousCompetencia
        ? undefined
        : findEntryWithFallback(entries, emp.id, previousCompetencia),
      diasUteis: diasBase,
      type: 'vr',
    });
    return [{
      ...row,
      tipoCalculo: admission.tipoCalculo,
      dataAdmissao: admission.dataAdmissao,
      periodoInicio: admission.periodoInicio,
      periodoFim: admission.periodoFim,
      diasUteisCalculados: proportional ? Number(admission.diasUteisCalculados || 0) : row.diasPrevistos,
    }];
  });
};

export const buildVTReportRows = (employees: Employee[], entries: MonthlyEntry[], diasUteis: number, competencia?: string) => {
  const currentCompetencia = inferCompetencia(entries, competencia);
  const previousCompetencia = getPreviousCompetencia(currentCompetencia);
  return employees.map((emp) =>
    buildBenefitRow({
      emp,
      entry: findEntryWithFallback(entries, emp.id, currentCompetencia),
      descontoEntry: previousCompetencia ? findEntryWithFallback(entries, emp.id, previousCompetencia) : undefined,
      diasUteis,
      type: 'vt',
    }),
  );
};

export const sumBenefitRows = (rows: BenefitReportRow[]) =>
  roundCurrency(rows.reduce((sum, row) => sum + row.valorTotal, 0));

/** Merge one employee into a consolidated benefit snapshot without deleting peers. */
export const mergeBenefitGenerationSnapshot = <T extends BenefitGenerationSnapshotRow>(
  existingSnapshot: T[] | null | undefined,
  employeeSnapshot: T,
): T[] => {
  const existing = Array.isArray(existingSnapshot) ? existingSnapshot : [];
  const index = existing.findIndex((item) => item?.employee_id === employeeSnapshot.employee_id);
  if (index < 0) return [...existing, employeeSnapshot];
  return existing.map((item, itemIndex) => itemIndex === index ? employeeSnapshot : item);
};

/** Receipt emission is unconditional; digital-signature publication follows company configuration. */
export const getVrGenerationDestinations = (payrollCompanyEnabled: boolean) => ({
  receipt: true as const,
  digitalSignature: Boolean(payrollCompanyEnabled),
});

/** Preserve current idempotency/signed-document rules for digital-signature publication. */
export const shouldCreateVrPayrollDocument = ({
  currentHash,
  nextHash,
  currentConfirmed,
  hasComplement,
  hasSignature,
}: {
  currentHash?: string | null;
  nextHash: string;
  currentConfirmed?: boolean | null;
  hasComplement?: boolean;
  hasSignature?: boolean;
}) => {
  if (hasComplement || hasSignature) return false;
  if (currentHash === nextHash && currentConfirmed) return false;
  return true;
};

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

  const row = buildBenefitRow({ emp, entry, descontoEntry, diasUteis, type });
  return {
    valorDiario: row.valorDiario,
    diasPrevistos: row.diasPrevistos,
    diasDescontados: row.diasDescontados,
    diasFinais: row.diasFinais,
    valorTotal: row.valorTotal,
    motivo: row.motivo,
  };
};
