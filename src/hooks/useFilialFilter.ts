import { useApp } from '@/context/AppContext';

const CODIGOS_FILIAIS = new Set(['topac-matriz', 'topac-pg', 'topac-gyn']);
const FILIAL_ROLES = new Set(['filial_matriz', 'filial_praia', 'filial_goiania']);

/**
 * Reaproveita o escopo de empresas já autorizado pelo AppContext.
 * A autorização real não é decidida aqui: ela vem das funções oficiais do banco.
 * O código de preview administrativo é apenas uma seleção visual da sessão global.
 */
export const useFilialFilter = () => {
  const { userRoles, companies } = useApp();
  const isAdmin = userRoles.includes('admin');
  const isFilialUser = userRoles.some((role) => FILIAL_ROLES.has(role));
  const previewCodigo = typeof window !== 'undefined'
    ? sessionStorage.getItem('admin_filial_preview_codigo')
    : null;
  const adminPreviewCodigo = isAdmin && previewCodigo && CODIGOS_FILIAIS.has(previewCodigo)
    ? previewCodigo
    : null;

  const authorizedFilialCompany = isFilialUser && companies.length === 1 ? companies[0] : null;
  const codigoFilial = authorizedFilialCompany?.codigo || adminPreviewCodigo || null;
  const filialCompanyId = codigoFilial
    ? companies.find((company) => company.codigo === codigoFilial)?.id || null
    : null;
  const isFilial = Boolean(codigoFilial);

  const getCompanyFilter = (selectedCompanyId?: string): string | null => {
    if (isFilial) return filialCompanyId;
    return selectedCompanyId || null;
  };

  return {
    isFilial,
    filialCompanyId,
    getCompanyFilter,
    filialCodigo: codigoFilial,
    isAdminPreview: Boolean(adminPreviewCodigo),
  };
};
