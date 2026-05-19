-- Bootstrap do administrador principal.
-- Idempotente: se o usuario ja existe no Auth, garante profile e role admin.
INSERT INTO public.profiles (user_id, nome_completo, email)
SELECT id, 'Administrador Matriz', email
FROM auth.users
WHERE lower(email) = 'adm.matriz@topac.com.br'
ON CONFLICT (user_id) DO UPDATE
SET
  nome_completo = COALESCE(NULLIF(public.profiles.nome_completo, ''), EXCLUDED.nome_completo),
  email = EXCLUDED.email;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'adm.matriz@topac.com.br'
ON CONFLICT (user_id, role) DO NOTHING;
