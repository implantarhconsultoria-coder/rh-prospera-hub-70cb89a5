export const SYSTEM_OWNER_USER_ID = 'd8a9f8a0-153b-4882-8f98-3c6cfbf51652';

export type SystemAccessKey =
  | 'global'
  | 'admin_desktop'
  | 'filial'
  | 'almoxarifado'
  | 'operacional'
  | 'campo'
  | 'mecanico'
  | 'estoque_interno';

export type SystemAccessControl = {
  module_key: SystemAccessKey;
  label: string;
  restricted: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
};

export const SYSTEM_ACCESS_MODULES: Array<{ key: Exclude<SystemAccessKey, 'global'>; label: string; detail: string }> = [
  { key: 'admin_desktop', label: 'Administração no computador', detail: 'Painel administrativo acessado pelo desktop.' },
  { key: 'filial', label: 'RH / Filiais', detail: 'Portais e acessos das filiais.' },
  { key: 'almoxarifado', label: 'Almoxarifado', detail: 'Acesso interno, externo e tela administrativa.' },
  { key: 'operacional', label: 'Operacional', detail: 'Chamados, protocolos e operação.' },
  { key: 'campo', label: 'Campo', detail: 'Acesso da equipe de campo.' },
  { key: 'mecanico', label: 'App Mecânicos', detail: 'Acesso e aplicativo dos mecânicos.' },
  { key: 'estoque_interno', label: 'Estoque Interno / Equipe', detail: 'Tela operacional do escritório.' },
];

export const systemAccessKeyForPath = (pathname: string): Exclude<SystemAccessKey, 'global'> | null => {
  const p = pathname.toLowerCase();

  if (
    p.startsWith('/acesso-mecanico') ||
    p.startsWith('/app-mecanico') ||
    p.startsWith('/mecanico-ext') ||
    p.startsWith('/admin/app-mecanico')
  ) return 'mecanico';

  if (
    p.startsWith('/acesso-almoxarifado') ||
    p.startsWith('/almoxarifado') ||
    p.startsWith('/almoxarifado-ext') ||
    p.startsWith('/admin/almoxarifado')
  ) return 'almoxarifado';

  if (
    p.startsWith('/acesso-operacional') ||
    p.startsWith('/operacional') ||
    p.startsWith('/operacional-ext') ||
    p.startsWith('/admin/operacional') ||
    p.startsWith('/admin/chamados')
  ) return 'operacional';

  if (
    p.startsWith('/acesso-campo') ||
    p.startsWith('/campo') ||
    p.startsWith('/campo-ext')
  ) return 'campo';

  if (
    p.startsWith('/acesso-filial') ||
    p.startsWith('/filiais') ||
    p.startsWith('/acesso-rh') ||
    p.startsWith('/filial') ||
    p.startsWith('/filial-ext')
  ) return 'filial';

  if (
    p.startsWith('/estoque-interno') ||
    p.startsWith('/admin/estoque-interno')
  ) return 'estoque_interno';

  if (p.startsWith('/admin')) return 'admin_desktop';

  return null;
};
