import type { Employee, MonthlyEntry } from '@/types/database';

export type BenefitReportRow = {
  emp: Employee;
  entry?: MonthlyEntry;
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

const buildBenefitRow = ({
  emp,
  entry,
  diasUteis,
  type,
}: {
  emp: Employee;
  entry?: MonthlyEntry;
  diasUteis: number;
  type: 'vr' | 'vt';
}): BenefitReportRow => {
  const faltasDias = entry?.faltasDias || 0;
  const diasPrevistos = type === 'vr' ? (entry?.vrDias ?? diasUteis) : diasUteis;
  const diasDescontados = Math.min(faltasDias, diasPrevistos);
  const diasFinais = Math.max(0, diasPrevistos - diasDescontados);
  const valorDiario = type === 'vr' ? emp.vrDiario : emp.vtDiario;
  const valorTotal = roundCurrency(valorDiario * diasFinais);

  return {
    emp,
    entry,
    valorDiario: roundCurrency(valorDiario),
    diasPrevistos,
    diasDescontados,
    diasFinais,
    valorTotal,
    motivo: diasDescontados > 0 ? `${faltasDias} falta(s)` : '',
  };
};

export const buildVRReportRows = (employees: Employee[], entries: MonthlyEntry[], diasUteis: number) =>
  employees.map((emp) =>
    buildBenefitRow({
      emp,
      entry: entries.find((item) => item.employeeId === emp.id),
      diasUteis,
      type: 'vr',
    }),
  );

export const buildVTReportRows = (employees: Employee[], entries: MonthlyEntry[], diasUteis: number) =>
  employees.map((emp) =>
    buildBenefitRow({
      emp,
      entry: entries.find((item) => item.employeeId === emp.id),
      diasUteis,
      type: 'vt',
    }),
  );

export const sumBenefitRows = (rows: BenefitReportRow[]) =>
  roundCurrency(rows.reduce((sum, row) => sum + row.valorTotal, 0));

export const buildIndividualBenefitData = ({
  emp,
  entry,
  diasUteis,
  type,
}: {
  emp?: Employee;
  entry?: MonthlyEntry;
  diasUteis: number;
  type: 'vr' | 'vt';
}) => {
  if (!emp) return null;
  if (type === 'vr' && !emp.vrAtivo) return null;
  if (type === 'vt' && !emp.vtAtivo) return null;

  const row = buildBenefitRow({ emp, entry, diasUteis, type });
  return {
    valorDiario: row.valorDiario,
    diasPrevistos: row.diasPrevistos,
    diasDescontados: row.diasDescontados,
    diasFinais: row.diasFinais,
    valorTotal: row.valorTotal,
    motivo: row.motivo,
  };
};