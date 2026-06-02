export const DIRECTOR_BLOCKED_MESSAGE = 'Edicao bloqueada para este perfil. Solicite liberacao ao administrador.';

export type DirectorTemporaryLike = {
  modulo?: string | null;
  permissao?: string | null;
  expiraEm?: string | null;
  expira_em?: string | null;
  ativo?: boolean | null;
};

const DIRECTOR_ALLOWED_ADMIN_PREFIXES = [
  '/admin/diretoria',
  '/admin/inteligencia-operacional',
  '/admin/faturamento',
  '/admin/faturamento/migracao-dn4',
  '/admin/financeiro',
  '/admin/relatorio',
  '/admin/relatorio-vr',
  '/admin/relatorio-vt',
];

const DIRECTOR_BLOCKED_EDIT_PREFIXES = [
  '/admin/empresas',
  '/admin/base-mestra',
  '/admin/funcionarios',
  '/admin/lancamentos',
  '/admin/fechamento',
  '/admin/fechamento-ponto',
  '/admin/fechamentos-filiais',
  '/admin/epi',
  '/admin/uniformes',
  '/admin/aso',
  '/admin/prestadores',
  '/admin/galoes-combustivel',
  '/admin/protocolo',
  '/admin/aviso-ferias',
  '/admin/atestados',
  '/admin/importar-fechamento',
  '/admin/conferencia-ponto',
  '/admin/folha-pagamento',
  '/admin/rescisoes',
  '/admin/compras',
  '/admin/comprovantes-pagamento',
  '/admin/monitoramento',
  '/admin/gerenciar-usuarios',
  '/admin/operacional',
  '/admin/chamados',
  '/admin/app-mecanico',
  '/admin/app-operacional',
  '/admin/combustivel-qr',
  '/admin/abastecimento-qrcode',
  '/admin/configuracoes',
  '/admin/acessos-externos',
  '/admin/assistente',
];

const DIRECTOR_MODULE_BY_PREFIX: Array<{ prefix: string; modulo: string }> = [
  { prefix: '/admin/empresas', modulo: 'rh' },
  { prefix: '/admin/inteligencia-operacional', modulo: 'inteligencia_operacional' },
  { prefix: '/admin/base-mestra', modulo: 'rh' },
  { prefix: '/admin/funcionarios', modulo: 'rh' },
  { prefix: '/admin/lancamentos', modulo: 'fechamento' },
  { prefix: '/admin/fechamento', modulo: 'fechamento' },
  { prefix: '/admin/fechamento-ponto', modulo: 'ponto' },
  { prefix: '/admin/fechamentos-filiais', modulo: 'fechamento' },
  { prefix: '/admin/apontamento-contabilidade', modulo: 'apontamento' },
  { prefix: '/admin/epi', modulo: 'epi' },
  { prefix: '/admin/uniformes', modulo: 'uniformes' },
  { prefix: '/admin/aso', modulo: 'aso' },
  { prefix: '/admin/pre-cadastro-admissional', modulo: 'admissao' },
  { prefix: '/admin/prestadores', modulo: 'prestadores' },
  { prefix: '/admin/galoes-combustivel', modulo: 'galoes' },
  { prefix: '/admin/protocolo', modulo: 'protocolo' },
  { prefix: '/admin/operacional/protocolo', modulo: 'protocolo' },
  { prefix: '/admin/documentos-ativos', modulo: 'frota' },
  { prefix: '/admin/aviso-ferias', modulo: 'ferias' },
  { prefix: '/admin/atestados', modulo: 'atestados' },
  { prefix: '/admin/importar-fechamento', modulo: 'fechamento' },
  { prefix: '/admin/conferencia-ponto', modulo: 'ponto' },
  { prefix: '/admin/folha-pagamento', modulo: 'folha' },
  { prefix: '/admin/rescisoes', modulo: 'rescisoes' },
  { prefix: '/admin/compras', modulo: 'compras' },
  { prefix: '/admin/comprovantes-pagamento', modulo: 'comprovantes_pagamento' },
  { prefix: '/admin/monitoramento', modulo: 'monitoramento' },
  { prefix: '/admin/gerenciar-usuarios', modulo: 'usuarios' },
  { prefix: '/admin/operacional', modulo: 'operacional' },
  { prefix: '/admin/chamados', modulo: 'operacional' },
  { prefix: '/admin/solicitacoes-operacionais', modulo: 'solicitacoes_operacionais' },
  { prefix: '/admin/app-mecanico', modulo: 'app_mecanico' },
  { prefix: '/admin/app-operacional', modulo: 'app_mecanico' },
  { prefix: '/admin/combustivel-qr', modulo: 'abastecimento' },
  { prefix: '/admin/abastecimento-qrcode', modulo: 'abastecimento' },
  { prefix: '/admin/configuracoes', modulo: 'configuracoes' },
  { prefix: '/admin/acessos-externos', modulo: 'acessos' },
  { prefix: '/admin/assistente', modulo: 'assistente' },
];

const normalize = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const isDirectorRole = (roles: string[] = []) => roles.includes('diretor_geral') || roles.includes('diretor');

export const getDirectorModuleFromPath = (pathname: string) => {
  const match = DIRECTOR_MODULE_BY_PREFIX
    .filter(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.modulo || normalize(pathname.replace(/^\/admin\/?/, '')) || 'admin';
};

export const isTemporaryPermissionActive = (permission: DirectorTemporaryLike) => {
  if (permission.ativo === false) return false;
  const expiresAt = permission.expiraEm || permission.expira_em;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > Date.now();
};

export const hasDirectorTemporaryPermission = (
  permissions: DirectorTemporaryLike[] = [],
  moduloOrPath: string,
  permissao = 'editar',
) => {
  const target = moduloOrPath.startsWith('/admin') ? getDirectorModuleFromPath(moduloOrPath) : moduloOrPath;
  const normalizedTarget = normalize(target);
  const normalizedPermission = normalize(permissao);
  return permissions.some((permission) => {
    if (!isTemporaryPermissionActive(permission)) return false;
    const moduleMatch = normalize(permission.modulo) === normalizedTarget || normalize(permission.modulo) === 'todos';
    const permissionMatch = !permission.permissao ||
      normalize(permission.permissao) === normalizedPermission ||
      normalize(permission.permissao) === 'editar' ||
      normalize(permission.permissao) === 'total';
    return moduleMatch && permissionMatch;
  });
};

export const isDirectorRouteAllowed = (pathname: string) => {
  if (pathname === '/admin') return true;

  if (DIRECTOR_BLOCKED_EDIT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }

  return DIRECTOR_ALLOWED_ADMIN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};

export const isDirectorRouteAllowedWithTemporary = (pathname: string, permissions: DirectorTemporaryLike[] = []) =>
  isDirectorRouteAllowed(pathname) || hasDirectorTemporaryPermission(permissions, pathname, 'editar');

export const diretorPodeEditarModulo = (modulo: string) => {
  const normalized = modulo.toLowerCase();
  return normalized === 'financeiro' || normalized === 'faturamento' || normalized === 'contas_pagar' || normalized === 'prestacao_contas';
};
