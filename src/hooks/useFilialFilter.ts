import { useApp } from '@/context/AppContext';

/**
 * Maps filial roles to their company IDs.
 * Used to filter data so filial users only see their own branch.
 */
const ROLE_COMPANY_MAP: Record<string, string> = {
  filial_praia: 'topac-pg',
  filial_goiania: 'topac-gyn',
};

export const useFilialFilter = () => {
  const { userRole } = useApp();

  const isFilial = userRole === 'filial_praia' || userRole === 'filial_goiania';
  const filialCompanyId = isFilial ? ROLE_COMPANY_MAP[userRole!] : null;

  /**
   * Returns the company ID to filter by.
   * - For filial users: their specific branch company ID
   * - For admin: the provided companyId (or null for all)
   */
  const getCompanyFilter = (selectedCompanyId?: string): string | null => {
    if (isFilial) return filialCompanyId;
    return selectedCompanyId || null;
  };

  return { isFilial, filialCompanyId, getCompanyFilter };
};
