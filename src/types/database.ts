// Types for the application - matching Supabase schema but with app-friendly names
// Companies and employees are fetched from Supabase tables

export interface Company {
  id: string;         // UUID from empresas table
  codigo: string;     // e.g. 'topac-matriz'
  name: string;       // mapped from 'nome'
  cnpj: string;
  city: string;       // mapped from 'cidade'
  status: 'ativa' | 'inativa';
  notes: string;      // mapped from 'observacoes'
}

export interface Employee {
  id: string;         // UUID from funcionarios table
  companyId: string;  // UUID mapped from company_id
  registro: string;
  matriculaEsocial: string;
  name: string;       // mapped from 'nome'
  cpf: string;
  rg: string;
  cargo: string;
  categoria: 'operacional' | 'socio';
  salarioBase: number;
  dataAdmissao: string;
  dataExameMedico: string;
  vrAtivo: boolean;
  vrDiario: number;
  vaAtivo: boolean;
  vaMensal: number;
  vtAtivo: boolean;
  vtDiario: number;
  insalubridadeAtiva: boolean;
  insalubridadeValor: number;
  status: 'ativo' | 'afastado' | 'férias' | 'desligado';
  telefone: string;
  celular: string;
  email: string;
  endereco: string;
  pix: string;
  banco: string;
  agencia: string;
  conta: string;
  observacoes: string;
  inss?: number;
  liquido?: number;
  referenciaCompetencia?: string;
}

export interface MonthlyEntry {
  id?: string;
  employeeId: string;   // mapped from funcionario_id
  companyId: string;     // mapped from company_id
  competencia: string;
  faltasDias: number;
  atrasos: number;
  he50: number;
  he100: number;
  adicionais: number;
  descontosDiversos: number;
  adiantamento: number;
  vrAplicado: boolean;
  vrDias: number;
  vaAplicado: boolean;
  vtAplicado: boolean;
  vtDesconto: number;
  comissaoBase: number;
  insalubridadeAplicada: boolean;
  statusConferencia: 'pendente' | 'conferido' | 'divergente';
  observacoes: string;
  origem?: 'manual' | 'consolidado';
  bloqueado?: boolean;
  fechamentoId?: string | null;
}

export interface Fechamento {
  companyId: string;
  competencia: string;
  status: 'aberto' | 'em_conferencia' | 'fechado';
  observacoes: string;
  dataFechamento?: string;
}

// Mappers: Supabase row -> App types
export const mapCompany = (row: any): Company => ({
  id: row.id,
  codigo: row.codigo,
  name: row.nome,
  cnpj: row.cnpj,
  city: row.cidade,
  status: row.status,
  notes: row.observacoes,
});

export const mapEmployee = (row: any): Employee => ({
  id: row.id,
  companyId: row.company_id,
  registro: row.registro || '',
  matriculaEsocial: row.matricula_esocial || '',
  name: row.nome,
  cpf: row.cpf || '',
  rg: row.rg || '',
  cargo: row.cargo || '',
  categoria: row.categoria || 'operacional',
  salarioBase: Number(row.salario_base) || 0,
  dataAdmissao: row.data_admissao || '',
  dataExameMedico: row.data_exame_medico || '',
  vrAtivo: row.vr_ativo ?? false,
  vrDiario: Number(row.vr_diario) || 0,
  vaAtivo: row.va_ativo ?? false,
  vaMensal: Number(row.va_mensal) || 0,
  vtAtivo: row.vt_ativo ?? false,
  vtDiario: Number(row.vt_diario) || 0,
  insalubridadeAtiva: row.insalubridade_ativa ?? false,
  insalubridadeValor: Number(row.insalubridade_valor) || 0,
  status: row.status || 'ativo',
  telefone: row.telefone || '',
  celular: row.celular || '',
  email: row.email || '',
  endereco: row.endereco || '',
  pix: row.pix || '',
  banco: row.banco || '',
  agencia: row.agencia || '',
  conta: row.conta || '',
  observacoes: row.observacoes || '',
  inss: row.inss ? Number(row.inss) : undefined,
  liquido: row.liquido ? Number(row.liquido) : undefined,
  referenciaCompetencia: row.referencia_competencia || undefined,
});

export const mapEntry = (row: any): MonthlyEntry => ({
  id: row.id,
  employeeId: row.funcionario_id,
  companyId: row.company_id,
  competencia: row.competencia,
  faltasDias: Number(row.faltas_dias) || 0,
  atrasos: Number(row.atrasos) || 0,
  he50: Number(row.he50) || 0,
  he100: Number(row.he100) || 0,
  adicionais: Number(row.adicionais) || 0,
  descontosDiversos: Number(row.descontos_diversos) || 0,
  adiantamento: Number(row.adiantamento) || 0,
  vrAplicado: row.vr_aplicado ?? false,
  vrDias: Number(row.vr_dias) || 0,
  vaAplicado: row.va_aplicado ?? false,
  vtAplicado: row.vt_aplicado ?? false,
  vtDesconto: Number(row.vt_desconto) || 0,
  comissaoBase: Number(row.comissao_base) || 0,
  insalubridadeAplicada: row.insalubridade_aplicada ?? false,
  statusConferencia: row.status_conferencia || 'pendente',
  observacoes: row.observacoes || '',
  origem: row.origem || 'manual',
  bloqueado: row.bloqueado ?? false,
  fechamentoId: row.fechamento_id || null,
});

// Reverse mapper: App entry -> Supabase row for insert/update
export const entryToRow = (entry: Partial<MonthlyEntry>) => {
  const row: any = {};
  if (entry.employeeId !== undefined) row.funcionario_id = entry.employeeId;
  if (entry.companyId !== undefined) row.company_id = entry.companyId;
  if (entry.competencia !== undefined) row.competencia = entry.competencia;
  if (entry.faltasDias !== undefined) row.faltas_dias = entry.faltasDias;
  if (entry.atrasos !== undefined) row.atrasos = entry.atrasos;
  if (entry.he50 !== undefined) row.he50 = entry.he50;
  if (entry.he100 !== undefined) row.he100 = entry.he100;
  if (entry.adicionais !== undefined) row.adicionais = entry.adicionais;
  if (entry.descontosDiversos !== undefined) row.descontos_diversos = entry.descontosDiversos;
  if (entry.adiantamento !== undefined) row.adiantamento = entry.adiantamento;
  if (entry.vrAplicado !== undefined) row.vr_aplicado = entry.vrAplicado;
  if (entry.vrDias !== undefined) row.vr_dias = entry.vrDias;
  if (entry.vaAplicado !== undefined) row.va_aplicado = entry.vaAplicado;
  if (entry.vtAplicado !== undefined) row.vt_aplicado = entry.vtAplicado;
  if (entry.vtDesconto !== undefined) row.vt_desconto = entry.vtDesconto;
  if (entry.comissaoBase !== undefined) row.comissao_base = entry.comissaoBase;
  if (entry.insalubridadeAplicada !== undefined) row.insalubridade_aplicada = entry.insalubridadeAplicada;
  if (entry.statusConferencia !== undefined) row.status_conferencia = entry.statusConferencia;
  if (entry.observacoes !== undefined) row.observacoes = entry.observacoes;
  return row;
};

// Reverse mapper: App employee -> Supabase row for update
export const employeeToRow = (data: Partial<Employee>) => {
  const row: any = {};
  if (data.companyId !== undefined) row.company_id = data.companyId;
  if (data.registro !== undefined) row.registro = data.registro;
  if (data.matriculaEsocial !== undefined) row.matricula_esocial = data.matriculaEsocial;
  if (data.name !== undefined) row.nome = data.name;
  if (data.cpf !== undefined) row.cpf = data.cpf;
  if (data.rg !== undefined) row.rg = data.rg;
  if (data.cargo !== undefined) row.cargo = data.cargo;
  if (data.categoria !== undefined) row.categoria = data.categoria;
  if (data.salarioBase !== undefined) row.salario_base = data.salarioBase;
  if (data.dataAdmissao !== undefined) row.data_admissao = data.dataAdmissao || null;
  if (data.dataExameMedico !== undefined) row.data_exame_medico = data.dataExameMedico || null;
  if (data.vrAtivo !== undefined) row.vr_ativo = data.vrAtivo;
  if (data.vrDiario !== undefined) row.vr_diario = data.vrDiario;
  if (data.vaAtivo !== undefined) row.va_ativo = data.vaAtivo;
  if (data.vaMensal !== undefined) row.va_mensal = data.vaMensal;
  if (data.vtAtivo !== undefined) row.vt_ativo = data.vtAtivo;
  if (data.vtDiario !== undefined) row.vt_diario = data.vtDiario;
  if (data.insalubridadeAtiva !== undefined) row.insalubridade_ativa = data.insalubridadeAtiva;
  if (data.insalubridadeValor !== undefined) row.insalubridade_valor = data.insalubridadeValor;
  if (data.status !== undefined) row.status = data.status;
  if (data.telefone !== undefined) row.telefone = data.telefone;
  if (data.celular !== undefined) row.celular = data.celular;
  if (data.email !== undefined) row.email = data.email;
  if (data.endereco !== undefined) row.endereco = data.endereco;
  if (data.pix !== undefined) row.pix = data.pix;
  if (data.banco !== undefined) row.banco = data.banco;
  if (data.agencia !== undefined) row.agencia = data.agencia;
  if (data.conta !== undefined) row.conta = data.conta;
  if (data.observacoes !== undefined) row.observacoes = data.observacoes;
  return row;
};
