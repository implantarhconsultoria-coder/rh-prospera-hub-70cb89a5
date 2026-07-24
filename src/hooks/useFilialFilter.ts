import { useApp } from '@/context/AppContext';

const ROLE_CODIGO_MAP: Record<string, string> = {
  filial_matriz: 'topac-matriz',
  filial_praia: 'topac-pg',
  filial_goiania: 'topac-gyn',
};

const CODIGOS_FILIAIS = new Set(Object.values(ROLE_CODIGO_MAP));

/**
 * Filters data by company for filial users and for admin preview mode.
 * Admin preview is selected from the module switcher and reuses the current session.
 */
export const useFilialFilter = () => {
  const { userRole, userRoles, companies } = useApp();
  const isAdmin = userRoles.includes('admin');
  const roleCodigo = userRole ? ROLE_CODIGO_MAP[userRole] : undefined;
  const previewCodigo = typeof window !== 'undefined'
    ? sessionStorage.getItem('admin_filial_preview_codigo')
    : null;
  const codigoFilial = roleCodigo || (isAdmin && previewCodigo && CODIGOS_FILIAIS.has(previewCodigo) ? previewCodigo : null);
  const isFilial = Boolean(codigoFilial);

  const filialCompanyId = codigoFilial
    ? companies.find(company => company.codigo === codigoFilial)?.id || null
    : null;

  const getCompanyFilter = (selectedCompanyId?: string): string | null => {
    if (isFilial) return filialCompanyId;
    return selectedCompanyId || null;
  };

  return { isFilial, filialCompanyId, getCompanyFilter, filialCodigo: codigoFilial, isAdminPreview: isAdmin && !roleCodigo && Boolean(codigoFilial) };
};
