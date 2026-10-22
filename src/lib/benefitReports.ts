import type { Employee, MonthlyEntry } from '@/types/database';
import { getWorkingDaysBetween } from '@/lib/workingDays';

export type VrCalculationType = 'MENSAL' | 'PROPORCIONAL_ADMISSAO';
export type BenefitMedicalLeave = {
  employeeId: string;
  companyId: string;
  dataInicio: string;
  dataFim: string;
  status: string;
  aplicarVR: boolean;
  aplicarVT: boolean;
};

export type BenefitReportRow = {
  emp: Employee;
  entry?: MonthlyEntry;
  descontoEntry?: MonthlyEntry;
  valorDiario: number;
  diasPrevistos: number;
  diasDescontados: number;
  diasAtestado?: number;
  pendenciaConferencia?: boolean;
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

export const medicalLeaveWorkingDays = (
  employee: Pick<Employee, 'id' | 'companyId'>,
  competenciaAnterior: string,
  tipo: 'vr' | 'vt',
  atestados: BenefitMedicalLeave[] = [],
  feriados: string[] = [],
): number => {
  const bounds = getCompetenciaBounds(competenciaAnterior);
  if (!bounds) return 0;
  const uniqueDays = new Set<string>();
  for (const atestado of atestados) {
    if (atestado.employeeId !== employee.id || atestado.companyId !== employee.companyId ||
        atestado.status !== 'confirmado' ||
        !(tipo === 'vr' ? atestado.aplicarVR : atestado.aplicarVT)) continue;
    const inicio = normalizeDateOnly(atestado.dataInicio);
    const fim = normalizeDateOnly(atestado.dataFim);
    if (!inicio || !fim || inicio > fim || inicio > bounds.last || fim < bounds.first) continue;
    const from = inicio > bounds.first ? inicio : bounds.first;
    const to = fim < bounds.last ? fim : bounds.last;
    const date = new Date(`${from}T12:00:00Z`);
    const last = new Date(`${to}T12:00:00Z`);
    while (date <= last) {
      const day = date.toISOString().slice(0, 10);
      if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !feriados.includes(day)) {
        uniqueDays.add(day);
      }
      date.setUTCDate(date.getUTCDate() + 1);
    }
  }
  return uniqueDays.size;
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
  diasAtestado = 0,
}: {
  emp: Employee;
  entry?: MonthlyEntry;
  descontoEntry?: MonthlyEntry;
  diasUteis: number;
  type: 'vr' | 'vt';
  diasAtestado?: number;
}): BenefitReportRow => {
  // VR e VT são pagos antecipadamente. As faltas lançadas no mês anterior
  // são descontadas na competência atual. O lançamento do próprio mês não
  // pode reduzir o benefício que já está sendo pago agora.
  // Ponto não registrado não comprova ausência. Não abater importação não conferida.
  const pendenciaConferencia = Boolean(
    descontoEntry?.observacoes?.includes('[PONTO_MECANICOS]') &&
    descontoEntry.statusConferencia !== 'conferido' &&
    Number(descontoEntry.faltasDias || 0) > 0,
  );
  const faltasValidadas = pendenciaConferencia ? 0 : Math.max(0, Number(descontoEntry?.faltasDias || 0));
  const diasPrevistos = getDiasPrevistos(entry, diasUteis, type);
  // Sem datas das faltas, usar o maior dos dois conjuntos evita abatimento duplicado.
  const diasDescontados = Math.min(Math.max(faltasValidadas, diasAtestado), diasPrevistos);
  const diasFinais = Math.max(0, diasPrevistos - diasDescontados);
  const valorDiario = Math.max(0, Number(type === 'vr' ? emp.vrDiario : emp.vtDiario) || 0);
  const valorTotal = roundCurrency(valorDiario * diasFinais);
  const motivo = [
    faltasValidadas > 0 ? `${faltasValidadas} falta(s) conferida(s) da competência anterior` : '',
    diasAtestado > 0 ? `${diasAtestado} dia(s) de atestado validado (sem duplicar falta)` : '',
    pendenciaConferencia ? 'PENDENTE: ausência de ponto sem conferência; desconto suspenso' : '',
  ].filter(Boolean).join(' | ');

  return {
    emp,
    entry,
    descontoEntry,
    valorDiario: roundCurrency(valorDiario),
    diasPrevistos,
    diasDescontados,
    diasAtestado,
    pendenciaConferencia,
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
  atestados: BenefitMedicalLeave[] = [],
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
      diasAtestado: proportional ? 0 : medicalLeaveWorkingDays(emp, previousCompetencia, 'vr', atestados, feriados),
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

export const buildVTReportRows = (employees: Employee[], entries: MonthlyEntry[], diasUteis: number, competencia?: string, atestados: BenefitMedicalLeave[] = []) => {
  const currentCompetencia = inferCompetencia(entries, competencia);
  const previousCompetencia = getPreviousCompetencia(currentCompetencia);
  return employees.map((emp) =>
    buildBenefitRow({
      emp,
      entry: findEntryWithFallback(entries, emp.id, currentCompetencia),
      descontoEntry: previousCompetencia ? findEntryWithFallback(entries, emp.id, previousCompetencia) : undefined,
      diasUteis,
      type: 'vt',
      diasAtestado: medicalLeaveWorkingDays(emp, previousCompetencia, 'vt', atestados),
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
