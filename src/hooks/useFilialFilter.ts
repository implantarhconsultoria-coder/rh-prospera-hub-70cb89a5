import { useApp } from '@/context/AppContext';

/**
 * Filters data by company for filial users.
 * Uses the company `codigo` field to map roles to companies.
 * RLS at the database level enforces this - this hook is for UI convenience.
 */
export const useFilialFilter = () => {
  const { userRole, companies } = useApp();

  const isFilial = userRole === 'filial_praia' || userRole === 'filial_goiania';

  // Map role to company codigo
  const ROLE_CODIGO_MAP: Record<string, string> = {
    filial_praia: 'topac-pg',
    filial_goiania: 'topac-gyn',
  };

  const filialCompanyId = isFilial
    ? companies.find(c => c.codigo === ROLE_CODIGO_MAP[userRole!])?.id || null
    : null;

  const getCompanyFilter = (selectedCompanyId?: string): string | null => {
    if (isFilial) return filialCompanyId;
    return selectedCompanyId || null;
  };

  return { isFilial, filialCompanyId, getCompanyFilter };
};
