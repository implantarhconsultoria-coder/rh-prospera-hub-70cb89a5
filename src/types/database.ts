import { cleanNullableText } from '@/lib/textClean';

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
  dataNascimento: string;
  dataExameMedico: string;
  setorGhe: string;
  cpfPendenteAcesso: boolean;
  vrAtivo: boolean;
  vrDiario: number;
  vaAtivo: boolean;
  vaMensal: number;
  vtAtivo: boolean;
  vtDiario: number;
  insalubridadeAtiva: boolean;
  insalubridadeValor: number;
  status: 'ativo' | 'afastado' | 'férias' | 'desligado' | 'excluido';
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
  employeeId: string;
  companyId: string;
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

const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

type BankingInfo = {
  pix?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
};

export const parseEmployeeObservacoes = (value: unknown): { text: string; banking: BankingInfo } => {
  const raw = String(value || '');
  if (!raw.trim()) return { text: '', banking: {} };

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.__topac_rh_meta === true) {
      const banking = parsed.dados_bancarios || {};
      return {
        text: cleanNullableText(parsed.texto),
        banking: {
          pix: cleanNullableText(banking.pix),
          banco: cleanNullableText(banking.banco),
          agencia: cleanNullableText(banking.agencia),
          conta: cleanNullableText(banking.conta),
        },
      };
    }
  } catch {
    // Texto livre antigo: manter como observacao normal.
  }

  return { text: cleanNullableText(raw), banking: {} };
};

export const buildEmployeeObservacoes = (
  text: unknown,
  banking: BankingInfo,
): string => JSON.stringify({
  __topac_rh_meta: true,
  texto: cleanNullableText(text),
  dados_bancarios: {
    pix: cleanNullableText(banking.pix),
    banco: cleanNullableText(banking.banco),
    agencia: cleanNullableText(banking.agencia),
    conta: cleanNullableText(banking.conta),
  },
});

const inferCompanyCode = (row: any): string => {
  if (row.codigo) return row.codigo;
  const cnpj = onlyDigits(row.cnpj);
  const nome = String(row.nome || '').toLowerCase();
  const cidade = String(row.cidade || '').toLowerCase();

  if (cnpj === '07291648000103') return 'topac-matriz';
  if (cnpj === '07291648000294') return 'topac-pg';
  if (cnpj === '07291648000375') return 'topac-gyn';
  if (cnpj === '214967711000100' || cnpj === '21967711000100' || nome.includes('lmt')) return 'lmt';
  if (cnpj === '14464586000150' || nome.includes('alqui')) return 'alqui';
  if (nome.includes('praia') || cidade.includes('praia')) return 'topac-pg';
  if (nome.includes('goian') || cidade.includes('goian')) return 'topac-gyn';
  return row.id;
};

export const mapCompany = (row: any): Company => ({
  id: row.id,
  codigo: inferCompanyCode(row),
  name: cleanNullableText(row.nome),
  cnpj: cleanNullableText(row.cnpj),
  city: cleanNullableText(row.cidade),
  status: row.status || (row.ativa === false ? 'inativa' : 'ativa'),
  notes: cleanNullableText(row.observacoes || row.tipo),
});

export const mapEmployee = (row: any): Employee => {
  const notes = parseEmployeeObservacoes(row.observacoes);
  return {
    id: row.id,
    companyId: row.company_id || row.empresa_id,
    registro: cleanNullableText(row.registro),
    matriculaEsocial: cleanNullableText(row.matricula_esocial),
    name: cleanNullableText(row.nome),
    cpf: cleanNullableText(row.cpf),
    rg: cleanNullableText(row.rg),
    cargo: cleanNullableText(row.cargo),
    categoria: row.categoria || row.setor || 'operacional',
    salarioBase: Number(row.salario_base ?? row.salario) || 0,
    dataAdmissao: cleanNullableText(row.data_admissao),
    dataNascimento: cleanNullableText(row.data_nascimento),
    dataExameMedico: cleanNullableText(row.data_exame_medico),
    setorGhe: cleanNullableText(row.setor_ghe || row.setor),
    cpfPendenteAcesso: row.cpf_pendente_acesso ?? !row.cpf,
    vrAtivo: row.vr_ativo ?? false,
    vrDiario: Number(row.vr_diario) || 0,
    vaAtivo: row.va_ativo ?? false,
    vaMensal: Number(row.va_mensal) || 0,
    vtAtivo: row.vt_ativo ?? false,
    vtDiario: Number(row.vt_diario) || 0,
    insalubridadeAtiva: row.insalubridade_ativa ?? false,
    insalubridadeValor: Number(row.insalubridade_valor) || 0,
    status: row.status === 'excluido' ? 'excluido' : (row.ativo === false ? 'desligado' : (row.status || 'ativo')),
    telefone: cleanNullableText(row.telefone),
    celular: cleanNullableText(row.celular),
    email: cleanNullableText(row.email),
    endereco: cleanNullableText(row.endereco),
    pix: cleanNullableText(row.pix) || notes.banking.pix || '',
    banco: cleanNullableText(row.banco) || notes.banking.banco || '',
    agencia: cleanNullableText(row.agencia) || notes.banking.agencia || '',
    conta: cleanNullableText(row.conta) || notes.banking.conta || '',
    observacoes: notes.text,
    inss: row.inss ? Number(row.inss) : undefined,
    liquido: row.liquido ? Number(row.liquido) : undefined,
    referenciaCompetencia: row.referencia_competencia || undefined,
  };
};

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

export const employeeToRow = (data: Partial<Employee>) => {
  const row: any = {};
  if (data.companyId !== undefined) {
    row.empresa_id = data.companyId;
    row.company_id = data.companyId;
  }
  if (data.registro !== undefined) row.registro = data.registro;
  if (data.matriculaEsocial !== undefined) row.matricula_esocial = data.matriculaEsocial;
  if (data.name !== undefined) row.nome = data.name;
  if (data.cpf !== undefined) row.cpf = data.cpf;
  if (data.rg !== undefined) row.rg = data.rg;
  if (data.cargo !== undefined) row.cargo = data.cargo;
  if (data.categoria !== undefined) {
    row.categoria = data.categoria;
  }
  if (data.salarioBase !== undefined) {
    row.salario = data.salarioBase;
    row.salario_base = data.salarioBase;
  }
  if (data.dataAdmissao !== undefined) row.data_admissao = data.dataAdmissao || null;
  if (data.dataNascimento !== undefined) row.data_nascimento = data.dataNascimento || null;
  if (data.dataExameMedico !== undefined) row.data_exame_medico = data.dataExameMedico || null;
  if (data.setorGhe !== undefined) row.setor_ghe = data.setorGhe;
  if (data.vrAtivo !== undefined) row.vr_ativo = data.vrAtivo;
  if (data.vrDiario !== undefined) row.vr_diario = data.vrDiario;
  if (data.vaAtivo !== undefined) row.va_ativo = data.vaAtivo;
  if (data.vaMensal !== undefined) row.va_mensal = data.vaMensal;
  if (data.vtAtivo !== undefined) row.vt_ativo = data.vtAtivo;
  if (data.vtDiario !== undefined) row.vt_diario = data.vtDiario;
  if (data.insalubridadeAtiva !== undefined) row.insalubridade_ativa = data.insalubridadeAtiva;
  if (data.insalubridadeValor !== undefined) row.insalubridade_valor = data.insalubridadeValor;
  if (data.status !== undefined) {
    row.ativo = data.status !== 'desligado';
    row.status = data.status;
  }
  if (data.telefone !== undefined) row.telefone = data.telefone;
  if (data.celular !== undefined) row.celular = data.celular;
  if (data.email !== undefined) row.email = data.email;
  if (data.endereco !== undefined) row.endereco = data.endereco;
  if (data.observacoes !== undefined) row.observacoes = data.observacoes;
  return row;
};
