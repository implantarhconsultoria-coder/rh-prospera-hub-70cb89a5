// Types derived from Supabase tables for companies, employees, and entries
// These replace the old hardcoded types from src/data/*

export interface Company {
  id: string;
  codigo: string;
  nome: string;
  cnpj: string;
  cidade: string;
  status: string;
  observacoes: string;
}

export interface Employee {
  id: string;
  company_id: string;
  codigo: string;
  registro: string;
  matricula_esocial: string;
  nome: string;
  cpf: string;
  rg: string;
  cargo: string;
  categoria: string;
  salario_base: number;
  data_admissao: string | null;
  data_exame_medico: string | null;
  vr_ativo: boolean;
  vr_diario: number;
  va_ativo: boolean;
  va_mensal: number;
  vt_ativo: boolean;
  vt_diario: number;
  insalubridade_ativa: boolean;
  insalubridade_valor: number;
  status: string;
  telefone: string;
  celular: string;
  email: string;
  endereco: string;
  pix: string;
  banco: string;
  agencia: string;
  conta: string;
  observacoes: string;
  inss: number | null;
  liquido: number | null;
  referencia_competencia: string | null;
}

export interface MonthlyEntry {
  id: string;
  funcionario_id: string;
  company_id: string;
  competencia: string;
  faltas_dias: number;
  atrasos: number;
  he50: number;
  he100: number;
  adicionais: number;
  descontos_diversos: number;
  adiantamento: number;
  vr_aplicado: boolean;
  vr_dias: number;
  va_aplicado: boolean;
  vt_aplicado: boolean;
  vt_desconto: number;
  comissao_base: number;
  insalubridade_aplicada: boolean;
  status_conferencia: string;
  observacoes: string;
}

export interface Fechamento {
  companyId: string;
  competencia: string;
  status: 'aberto' | 'em_conferencia' | 'fechado';
  observacoes: string;
  dataFechamento?: string;
}

// Re-export delivery types (these stay client-side for now)
export type { Delivery, DeliveryItem, BenefitReport } from '@/data/deliveries';

// Helper: map old Employee shape for backward compatibility in calculations
export const employeeToCalcFormat = (emp: Employee) => ({
  id: emp.id,
  companyId: emp.company_id,
  name: emp.nome,
  cargo: emp.cargo,
  categoria: emp.categoria as 'operacional' | 'socio',
  salarioBase: emp.salario_base,
  dataAdmissao: emp.data_admissao || '',
  dataExameMedico: emp.data_exame_medico || '',
  vrAtivo: emp.vr_ativo,
  vrDiario: emp.vr_diario,
  vaAtivo: emp.va_ativo,
  vaMensal: emp.va_mensal,
  vtAtivo: emp.vt_ativo,
  vtDiario: emp.vt_diario,
  insalubridadeAtiva: emp.insalubridade_ativa,
  insalubridadeValor: emp.insalubridade_valor,
  status: emp.status,
});

// Helper: map old MonthlyEntry shape for backward compatibility in calculations
export const entryToCalcFormat = (entry: MonthlyEntry) => ({
  employeeId: entry.funcionario_id,
  companyId: entry.company_id,
  competencia: entry.competencia,
  faltasDias: entry.faltas_dias,
  atrasos: entry.atrasos,
  he50: entry.he50,
  he100: entry.he100,
  adicionais: entry.adicionais,
  descontosDiversos: entry.descontos_diversos,
  adiantamento: entry.adiantamento,
  vrAplicado: entry.vr_aplicado,
  vrDias: entry.vr_dias,
  vaAplicado: entry.va_aplicado,
  vtAplicado: entry.vt_aplicado,
  vtDesconto: entry.vt_desconto,
  comissaoBase: entry.comissao_base,
  insalubridadeAplicada: entry.insalubridade_aplicada,
  statusConferencia: entry.status_conferencia,
  observacoes: entry.observacoes,
});
