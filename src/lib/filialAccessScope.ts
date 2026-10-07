import type { SupabaseClient } from '@supabase/supabase-js';
import type { Company, Employee } from '@/types/database';

export interface FilialProfileScope {
  userId: string;
  empresa: string | null;
  filial: string | null;
}

export interface FilialAccessScope {
  profile: FilialProfileScope | null;
  allowedCompanyIds: Set<string>;
  allowedEmployeeIds: Set<string>;
}

type ResolveFilialAccessScopeParams = {
  supabase: SupabaseClient<any>;
  userId: string;
  companies: Company[];
  employees: Employee[];
};

const resolveAllowedIds = async <T extends { id: string }>(
  items: T[],
  check: (id: string) => Promise<{ allowed: boolean; error?: unknown }>,
): Promise<Set<string>> => {
  const results = await Promise.all(items.map(async (item) => ({ item, result: await check(item.id) })));
  const failure = results.find(({ result }) => result.error);
  if (failure) throw failure.result.error;
  return new Set(results.filter(({ result }) => result.allowed).map(({ item }) => item.id));
};

/**
 * Fonte única do escopo de filial no frontend.
 *
 * A autorização é decidida pelas funções SECURITY DEFINER oficiais do banco;
 * `profiles` fornece apenas a identificação da unidade/empresa do usuário.
 * Nenhum mapa local de role -> empresa participa da decisão de acesso.
 */
export const resolveFilialAccessScope = async ({
  supabase,
  userId,
  companies,
  employees,
}: ResolveFilialAccessScopeParams): Promise<FilialAccessScope> => {
  const profilePromise = supabase
    .from('profiles')
    .select('user_id, empresa, filial')
    .eq('user_id', userId)
    .maybeSingle();

  const allowedCompanyIdsPromise = resolveAllowedIds(companies, async (companyId) => {
    const { data, error } = await (supabase as any).rpc('topac_filial_company_allowed', {
      p_company_id: companyId,
      p_user_id: userId,
    });
    return { allowed: data === true, error };
  });

  const allowedEmployeeIdsPromise = resolveAllowedIds(employees, async (employeeId) => {
    const { data, error } = await (supabase as any).rpc('topac_filial_employee_allowed', {
      p_funcionario_id: employeeId,
      p_user_id: userId,
    });
    return { allowed: data === true, error };
  });

  const [profileResult, allowedCompanyIds, allowedEmployeeIds] = await Promise.all([
    profilePromise,
    allowedCompanyIdsPromise,
    allowedEmployeeIdsPromise,
  ]);

  if (profileResult.error) throw profileResult.error;

  const profile = profileResult.data
    ? {
        userId: profileResult.data.user_id,
        empresa: profileResult.data.empresa ?? null,
        filial: profileResult.data.filial ?? null,
      }
    : null;

  return { profile, allowedCompanyIds, allowedEmployeeIds };
};
