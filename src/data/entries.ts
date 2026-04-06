export interface MonthlyEntry {
  employeeId: string;
  companyId: string;
  competencia: string; // YYYY-MM
  faltasDias: number;
  atrasos: number; // em horas
  he50: number; // horas
  he100: number; // horas
  adicionais: number; // valor
  descontosDiversos: number;
  adiantamento: number;
  vrAplicado: boolean;
  vaAplicado: boolean;
  vtAplicado: boolean;
  insalubridadeAplicada: boolean;
  statusConferencia: 'pendente' | 'conferido' | 'divergente';
  observacoes: string;
}

export const generateDefaultEntries = (companyId: string, competencia: string, employeeIds: string[]): MonthlyEntry[] =>
  employeeIds.map(eid => ({
    employeeId: eid, companyId, competencia,
    faltasDias: 0, atrasos: 0, he50: 0, he100: 0,
    adicionais: 0, descontosDiversos: 0, adiantamento: 0,
    vrAplicado: true, vaAplicado: true, vtAplicado: true,
    insalubridadeAplicada: true,
    statusConferencia: 'pendente', observacoes: '',
  }));

export interface Fechamento {
  companyId: string;
  competencia: string;
  status: 'aberto' | 'em_conferencia' | 'fechado';
  observacoes: string;
  dataFechamento?: string;
}
