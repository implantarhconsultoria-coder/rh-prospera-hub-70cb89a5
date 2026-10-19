/** Restrições de visualização. A autorização efetiva é feita no Supabase/RLS. */
export const ADMIN_RH_RESTRITO_EMAIL = 'adm1.matriz@topac.com.br';

export const isAdminRhRestrito = (email: string | null | undefined): boolean =>
  String(email || '').trim().toLowerCase() === ADMIN_RH_RESTRITO_EMAIL;

export const isAssinaturaDigitalBlockedPath = (pathname: string): boolean =>
  pathname === '/admin/folha-pagamento' ||
  pathname.startsWith('/admin/folha-pagamento/');
