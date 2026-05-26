import { supabase } from '@/integrations/supabase/client';
import type { Company, Employee } from '@/types/database';

export const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const formatCpf = (cpfClean: string) =>
  cpfClean.length === 11
    ? `${cpfClean.slice(0, 3)}.${cpfClean.slice(3, 6)}.${cpfClean.slice(6, 9)}-${cpfClean.slice(9)}`
    : cpfClean;

export const resolveFuncionarioCompanyId = (
  companies: Company[],
  companyId?: string | null,
  empresaNome?: string | null,
) => {
  if (companyId && (!companies.length || companies.some((c) => c.id === companyId))) return companyId;

  const needle = normalize(empresaNome);
  if (!needle) return companyId || null;

  const direct = companies.find((company) => {
    const values = [company.name, company.codigo, company.city, company.cnpj].map(normalize).filter(Boolean);
    return values.some((value) => value === needle || value.includes(needle) || needle.includes(value));
  });
  if (direct) return direct.id;

  const alias = companies.find((company) => {
    const code = normalize(company.codigo);
    const name = normalize(company.name);
    const city = normalize(company.city);
    const joined = `${code} ${name} ${city}`;

    if ((needle.includes('matriz') || needle.includes('sao paulo') || needle.includes('topac/sp') || needle.includes('topac sp')) && (joined.includes('matriz') || joined.includes('sao paulo'))) return true;
    if ((needle.includes('praia') || needle === 'pg' || needle.includes('topac pg')) && (joined.includes('praia') || joined.includes('pg'))) return true;
    if ((needle.includes('goian') || needle === 'go' || needle.includes('topac go')) && (joined.includes('goian') || joined.includes('gyn'))) return true;
    if (needle.includes('alqui') && joined.includes('alqui')) return true;
    if (needle.includes('lmt') && joined.includes('lmt')) return true;
    return false;
  });

  return alias?.id || companyId || null;
};

const findByCpf = (employees: Employee[], cpfClean: string) =>
  employees.find((employee) => onlyDigits(employee.cpf) === cpfClean) || null;

const addFilled = (row: Record<string, unknown>, key: string, value: unknown) => {
  if (value === undefined || value === null) return;
  if (typeof value === 'string' && !value.trim()) return;
  row[key] = value;
};

type UpsertFuncionarioBaseInput = {
  funcionarioId?: string | null;
  employees: Employee[];
  companies: Company[];
  companyId?: string | null;
  empresaNome?: string | null;
  nome: string;
  cpf: string;
  cargo?: string | null;
  email?: string | null;
  telefone?: string | null;
  celular?: string | null;
  rg?: string | null;
  endereco?: string | null;
  salarioBase?: number | null;
  dataAdmissao?: string | null;
  setor?: string | null;
};

export type UpsertFuncionarioBaseResult =
  | { ok: true; employeeId: string; action: 'created' | 'updated' | 'linked' }
  | { ok: false; error: string };

export const upsertFuncionarioBase = async (
  input: UpsertFuncionarioBaseInput,
): Promise<UpsertFuncionarioBaseResult> => {
  const cpfClean = onlyDigits(input.cpf);
  const nome = input.nome.trim();

  if (!nome) return { ok: false, error: 'Informe o nome completo do funcionario.' };
  if (cpfClean.length !== 11) return { ok: false, error: 'CPF valido e obrigatorio para evitar cadastro duplicado.' };

  const localEmployee =
    (input.funcionarioId && input.employees.find((employee) => employee.id === input.funcionarioId)) ||
    findByCpf(input.employees, cpfClean);

  let existingId = localEmployee?.id || input.funcionarioId || null;

  if (!existingId) {
    const cpfMasked = formatCpf(cpfClean);
    const { data } = await (supabase as any)
      .from('funcionarios')
      .select('id,cpf')
      .or(`cpf.eq.${cpfClean},cpf.eq.${cpfMasked}`)
      .limit(1)
      .maybeSingle();

    if (data?.id) existingId = data.id;
  }

  const resolvedCompanyId = resolveFuncionarioCompanyId(
    input.companies,
    input.companyId || localEmployee?.companyId || null,
    input.empresaNome,
  );

  if (!resolvedCompanyId) {
    return { ok: false, error: 'Selecione ou informe uma empresa/filial valida para vincular o funcionario.' };
  }

  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  addFilled(row, 'company_id', resolvedCompanyId);
  addFilled(row, 'nome', nome);
  addFilled(row, 'cpf', input.cpf.trim());
  addFilled(row, 'cargo', input.cargo?.trim() || localEmployee?.cargo);
  addFilled(row, 'email', input.email?.trim().toLowerCase() || localEmployee?.email);
  addFilled(row, 'telefone', input.telefone?.trim() || localEmployee?.telefone);
  addFilled(row, 'celular', input.celular?.trim() || localEmployee?.celular);
  addFilled(row, 'rg', input.rg?.trim() || localEmployee?.rg);
  addFilled(row, 'endereco', input.endereco?.trim() || localEmployee?.endereco);
  addFilled(row, 'setor', input.setor?.trim() || localEmployee?.setorGhe || 'operacional');
  addFilled(row, 'salario_base', input.salarioBase ?? localEmployee?.salarioBase ?? 0);
  addFilled(row, 'data_admissao', input.dataAdmissao || localEmployee?.dataAdmissao || null);

  if (existingId) {
    const { error } = await (supabase as any)
      .from('funcionarios')
      .update(row)
      .eq('id', existingId);

    if (error) return { ok: false, error: error.message || 'Nao foi possivel atualizar o funcionario.' };
    return { ok: true, employeeId: existingId, action: localEmployee ? 'linked' : 'updated' };
  }

  const insertRow = {
    ...row,
    created_at: new Date().toISOString(),
    status: 'ativo',
    categoria: 'operacional',
    salario_base: Number(input.salarioBase) || 0,
    vr_ativo: false,
    va_ativo: false,
    vt_ativo: false,
    insalubridade_ativa: false,
  };

  const { data, error } = await (supabase as any)
    .from('funcionarios')
    .insert(insertRow)
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message || 'Nao foi possivel criar o funcionario.' };
  return { ok: true, employeeId: data.id, action: 'created' };
};

export const getFuncionarioVeiculoInfo = async (funcionarioId?: string | null) => {
  if (!funcionarioId) return null;

  const { data, error } = await (supabase as any)
    .from('tecnicos_campo')
    .select('veiculo_id, veiculos(placa, modelo, identificacao_interna)')
    .eq('funcionario_id', funcionarioId)
    .maybeSingle();

  if (error || !data) return null;

  const veiculo = Array.isArray(data.veiculos) ? data.veiculos[0] : data.veiculos;
  if (!veiculo?.placa) return null;

  const descricao = [veiculo.placa, veiculo.modelo, veiculo.identificacao_interna]
    .filter(Boolean)
    .join(' - ');

  return {
    placa: String(veiculo.placa).toUpperCase(),
    descricao,
  };
};
