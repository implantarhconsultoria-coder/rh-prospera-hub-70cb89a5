import { getWorkingDays } from '@/lib/workingDays';

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
  vrDias: number;
  vaAplicado: boolean;
  vtAplicado: boolean;
  vtDesconto: number;
  comissaoBase: number; // valor base para cálculo de comissão
  insalubridadeAplicada: boolean;
  statusConferencia: 'pendente' | 'conferido' | 'divergente';
  observacoes: string;
}

export const generateDefaultEntries = (companyId: string, competencia: string, employeeIds: string[]): MonthlyEntry[] => {
  const diasUteis = getWorkingDays(competencia);

  return employeeIds.map(eid => ({
    employeeId: eid, companyId, competencia,
    faltasDias: 0, atrasos: 0, he50: 0, he100: 0,
    adicionais: 0, descontosDiversos: 0, adiantamento: 0,
    vrAplicado: true, vrDias: diasUteis,
    vaAplicado: true, vtAplicado: true, vtDesconto: 0, comissaoBase: 0,
    insalubridadeAplicada: true,
    statusConferencia: 'pendente', observacoes: '',
  }));
};

// Pre-populated benefit entries for ALQUI — competência 2026-04
export const initialEntries: MonthlyEntry[] = [
  { employeeId: 'alqui-25', companyId: 'alqui', competencia: '2026-04', faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0, descontosDiversos: 0, adiantamento: 0, vrAplicado: true, vrDias: 19, vaAplicado: false, vtAplicado: true, vtDesconto: 10.00, insalubridadeAplicada: true, comissaoBase: 0, statusConferencia: 'pendente', observacoes: '' },
  { employeeId: 'alqui-40', companyId: 'alqui', competencia: '2026-04', faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0, descontosDiversos: 0, adiantamento: 0, vrAplicado: true, vrDias: 20, vaAplicado: false, vtAplicado: false, vtDesconto: 0, insalubridadeAplicada: true, comissaoBase: 0, statusConferencia: 'pendente', observacoes: '' },
  { employeeId: 'alqui-50', companyId: 'alqui', competencia: '2026-04', faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0, descontosDiversos: 0, adiantamento: 0, vrAplicado: true, vrDias: 20, vaAplicado: false, vtAplicado: true, vtDesconto: 25.40, insalubridadeAplicada: false, comissaoBase: 0, statusConferencia: 'pendente', observacoes: '' },
  { employeeId: 'alqui-17', companyId: 'alqui', competencia: '2026-04', faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0, descontosDiversos: 0, adiantamento: 0, vrAplicado: true, vrDias: 20, vaAplicado: false, vtAplicado: false, vtDesconto: 0, insalubridadeAplicada: true, comissaoBase: 0, statusConferencia: 'pendente', observacoes: '' },
  { employeeId: 'alqui-46', companyId: 'alqui', competencia: '2026-04', faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0, descontosDiversos: 0, adiantamento: 0, vrAplicado: true, vrDias: 20, vaAplicado: false, vtAplicado: true, vtDesconto: 39.36, insalubridadeAplicada: false, comissaoBase: 0, statusConferencia: 'pendente', observacoes: '' },
  { employeeId: 'alqui-51', companyId: 'alqui', competencia: '2026-04', faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0, descontosDiversos: 0, adiantamento: 0, vrAplicado: true, vrDias: 20, vaAplicado: false, vtAplicado: true, vtDesconto: 38.00, insalubridadeAplicada: true, comissaoBase: 0, statusConferencia: 'pendente', observacoes: '' },
  { employeeId: 'alqui-53', companyId: 'alqui', competencia: '2026-04', faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0, descontosDiversos: 0, adiantamento: 0, vrAplicado: true, vrDias: 20, vaAplicado: false, vtAplicado: true, vtDesconto: 35.00, insalubridadeAplicada: true, comissaoBase: 0, statusConferencia: 'pendente', observacoes: '' },
  { employeeId: 'alqui-54', companyId: 'alqui', competencia: '2026-04', faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0, descontosDiversos: 0, adiantamento: 0, vrAplicado: true, vrDias: 20, vaAplicado: false, vtAplicado: true, vtDesconto: 35.10, insalubridadeAplicada: true, comissaoBase: 0, statusConferencia: 'pendente', observacoes: '' },
  { employeeId: 'alqui-45', companyId: 'alqui', competencia: '2026-04', faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0, descontosDiversos: 0, adiantamento: 0, vrAplicado: true, vrDias: 20, vaAplicado: false, vtAplicado: false, vtDesconto: 0, insalubridadeAplicada: true, comissaoBase: 0, statusConferencia: 'pendente', observacoes: '' },
  { employeeId: 'alqui-41', companyId: 'alqui', competencia: '2026-04', faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0, descontosDiversos: 0, adiantamento: 0, vrAplicado: true, vrDias: 20, vaAplicado: false, vtAplicado: false, vtDesconto: 0, insalubridadeAplicada: true, comissaoBase: 0, statusConferencia: 'pendente', observacoes: '' },
];

export interface Fechamento {
  companyId: string;
  competencia: string;
  status: 'aberto' | 'em_conferencia' | 'fechado';
  observacoes: string;
  dataFechamento?: string;
}
