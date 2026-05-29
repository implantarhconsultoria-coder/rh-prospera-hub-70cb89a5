const DEFAULT_INSALUBRIDADE = 648.40;
const PERICULOSIDADE_MOTOBOY_PCT = 0.3;

export const normalizeCargo = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

export const isMechanicRole = (cargo?: string | null) => normalizeCargo(cargo).includes('MECANIC');

export const isMotoboyRole = (cargo?: string | null) => {
  const normalized = normalizeCargo(cargo).replace(/[^A-Z0-9]/g, '');
  return normalized.includes('MOTOBOY') || normalized.includes('MOTOFRETISTA') || normalized.includes('MOTOCICLISTA');
};

export const getInsalubridadeAplicavel = (
  emp: { cargo?: string | null; insalubridadeAtiva?: boolean; insalubridadeValor?: number | null },
  entry?: { insalubridadeAplicada?: boolean } | null,
  fallbackValor: number = DEFAULT_INSALUBRIDADE,
) => {
  if (!isMechanicRole(emp.cargo)) return 0;
  if (entry && entry.insalubridadeAplicada === false) return 0;
  return Number(emp.insalubridadeValor || fallbackValor || 0);
};

export const getPericulosidadeAplicavel = (
  emp: { cargo?: string | null; salarioBase?: number | null },
) => {
  if (!isMotoboyRole(emp.cargo)) return 0;
  return Math.round(Number(emp.salarioBase || 0) * PERICULOSIDADE_MOTOBOY_PCT * 100) / 100;
};

