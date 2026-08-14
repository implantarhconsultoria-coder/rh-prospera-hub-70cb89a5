export const EPI_RESPONSIBILITY_TEXT = 'Declaro ter recebido, nesta data, o KIT DE EPIs NOVOS referente à entrega semestral programada. Comprometo-me a utilizá-los exclusivamente para fins profissionais durante a jornada de trabalho, bem como zelar pela sua guarda e conservação. Estou ciente de que, em caso de dano ou extravio por uso indevido, deverei comunicar imediatamente o empregador. Declaro ainda estar ciente das Normas Internas da Empresa e das Normas Regulamentadoras (NRs) pertinentes, em especial a NR-6, quanto ao uso adequado e obrigatório dos equipamentos.';

export const EPI_CODES = {
  mascaraAirTox: 'mascara-air-tox-ii',
  protetorSolar: 'protetor-solar',
  abafadorConcha: 'abafador-concha',
  cinta: 'cinta',
  luvasSeguranca: 'luvas-seguranca',
  cremeProtetor: 'creme-protetor',
  oculosProtecao: 'oculos-protecao',
  protetorAuricular: 'protetor-auricular',
  luvasProcedimento: 'luvas-procedimento',
  cintoSeguranca: 'cinto-seguranca-epi',
} as const;

export type EpiCatalogRow = {
  id?: string;
  codigo: string;
  nome: string;
  ca?: string | null;
  grupo?: string | null;
  regra_elegibilidade?: string | null;
  quantidade_padrao?: number | null;
  ativo?: boolean | null;
  ordem?: number | null;
};

export type EpiSnapshotItem = {
  codigo: string;
  nome: string;
  ca: string;
  grupo: string;
  quantidade: number;
  tamanho: string;
  observacao: string;
};

export type EpiRoleClassification = {
  eligible: boolean;
  isMechanic: boolean;
  isPainter: boolean;
  isWorkshop: boolean;
};

export const normalizeEpiText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

export const classifyEpiRole = (cargo: unknown): EpiRoleClassification => {
  const normalized = normalizeEpiText(cargo);
  const isMechanic = normalized.includes('MECANIC');
  const isPainter = normalized.includes('PINTOR');
  const isWorkshop = normalized.includes('OFICINA');
  return {
    eligible: isMechanic || isPainter || isWorkshop,
    isMechanic,
    isPainter,
    isWorkshop,
  };
};

const BASE_CODES = [
  EPI_CODES.abafadorConcha,
  EPI_CODES.cinta,
  EPI_CODES.luvasSeguranca,
  EPI_CODES.cremeProtetor,
  EPI_CODES.oculosProtecao,
  EPI_CODES.protetorAuricular,
  EPI_CODES.luvasProcedimento,
  EPI_CODES.cintoSeguranca,
] as const;

export const getEligibleEpiCodes = (cargo: unknown, mecanicoExterno = false): string[] => {
  const role = classifyEpiRole(cargo);
  if (!role.eligible) return [];
  const codes = [...BASE_CODES] as string[];
  if (role.isPainter) codes.unshift(EPI_CODES.mascaraAirTox);
  if (role.isMechanic && mecanicoExterno) codes.unshift(EPI_CODES.protetorSolar);
  return Array.from(new Set(codes));
};

export const buildEpiSnapshot = (
  catalog: EpiCatalogRow[],
  cargo: unknown,
  mecanicoExterno = false,
): EpiSnapshotItem[] => {
  const eligibleCodes = new Set(getEligibleEpiCodes(cargo, mecanicoExterno));
  return catalog
    .filter((item) => item.ativo !== false && eligibleCodes.has(item.codigo))
    .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    .map((item) => ({
      codigo: item.codigo,
      nome: item.nome,
      ca: String(item.ca || ''),
      grupo: String(item.grupo || 'Adicional'),
      quantidade: Math.max(1, Number(item.quantidade_padrao || 1)),
      tamanho: '',
      observacao: '',
    }));
};

export type EpiEligibleEmployeeSnapshot = {
  employeeId: string;
  companyId: string;
  employeeName: string;
  cargo: string;
  companyName: string;
  mecanicoExterno: boolean;
  items: EpiSnapshotItem[];
};

export type EpiConsolidatedItem = {
  codigo: string;
  nome: string;
  ca: string;
  grupo: string;
  quantidade: number;
  funcionarios: number;
  empresas: Record<string, number>;
};

export const consolidateEpiNeeds = (employees: EpiEligibleEmployeeSnapshot[]): EpiConsolidatedItem[] => {
  const result = new Map<string, EpiConsolidatedItem>();
  employees.forEach((employee) => {
    employee.items.forEach((item) => {
      const current = result.get(item.codigo) || {
        codigo: item.codigo,
        nome: item.nome,
        ca: item.ca,
        grupo: item.grupo,
        quantidade: 0,
        funcionarios: 0,
        empresas: {},
      };
      current.quantidade += Math.max(1, Number(item.quantidade || 1));
      current.funcionarios += 1;
      current.empresas[employee.companyName] = (current.empresas[employee.companyName] || 0) + Math.max(1, Number(item.quantidade || 1));
      result.set(item.codigo, current);
    });
  });
  return Array.from(result.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

export const addMonthsIsoDate = (isoDate: string, months: number) => {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const targetFirst = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = targetFirst.getUTCFullYear();
  const targetMonth = targetFirst.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
};

export const daysBetweenIsoDates = (from: string, to: string) => {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.round((b - a) / 86400000);
};

export const isEpiRenewalAlert = (nextDate: string | null | undefined, todayIso: string) => {
  if (!nextDate) return false;
  const days = daysBetweenIsoDates(todayIso, nextDate);
  return Number.isFinite(days) && days >= 0 && days <= 7;
};

export const isEpiRenewalOverdue = (nextDate: string | null | undefined, todayIso: string) => {
  if (!nextDate) return false;
  const days = daysBetweenIsoDates(todayIso, nextDate);
  return Number.isFinite(days) && days < 0;
};
