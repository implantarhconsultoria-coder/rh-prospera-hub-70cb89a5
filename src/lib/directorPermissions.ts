export const DIRECTOR_BLOCKED_MESSAGE = 'Edicao bloqueada para este perfil. Solicite liberacao ao administrador.';

const DIRECTOR_ALLOWED_ADMIN_PREFIXES = [
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

export const isDirectorRole = (roles: string[] = []) => roles.includes('diretor_geral');

export const isDirectorRouteAllowed = (pathname: string) => {
  if (pathname === '/admin') return true;

  if (DIRECTOR_BLOCKED_EDIT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }

  return DIRECTOR_ALLOWED_ADMIN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};

export const diretorPodeEditarModulo = (modulo: string) => {
  const normalized = modulo.toLowerCase();
  return normalized === 'financeiro' || normalized === 'faturamento' || normalized === 'contas_pagar' || normalized === 'prestacao_contas';
};
