-- Aplica a lista fixa inicial aos usuarios Auth ja existentes.

WITH fixed_users AS (
  SELECT
    au.id AS user_id,
    lower(au.email) AS auth_email,
    f.cpf_clean,
    f.nome,
    COALESCE(NULLIF(f.email, ''), au.email) AS email,
    f.telefone,
    f.perfil,
    public.topac_roles_validas(f.roles) AS roles,
    f.empresa,
    f.filial
  FROM auth.users au
  JOIN public.topac_acessos_fixos f
    ON lower(COALESCE(au.email, '')) = lower(COALESCE(f.email, ''))
  WHERE f.ativo = true
)
INSERT INTO public.profiles(user_id, email, nome_completo, telefone, cpf, empresa, filial, cargo)
SELECT user_id, lower(email), nome, telefone, cpf_clean, empresa, filial, perfil
  FROM fixed_users
ON CONFLICT (user_id) DO UPDATE
   SET email = EXCLUDED.email,
       nome_completo = COALESCE(NULLIF(EXCLUDED.nome_completo, ''), profiles.nome_completo),
       telefone = COALESCE(NULLIF(EXCLUDED.telefone, ''), profiles.telefone),
       cpf = COALESCE(NULLIF(EXCLUDED.cpf, ''), profiles.cpf),
       empresa = COALESCE(NULLIF(EXCLUDED.empresa, ''), profiles.empresa),
       filial = COALESCE(NULLIF(EXCLUDED.filial, ''), profiles.filial),
       cargo = COALESCE(NULLIF(EXCLUDED.cargo, ''), profiles.cargo),
       updated_at = now();

WITH fixed_users AS (
  SELECT au.id AS user_id, public.topac_roles_validas(f.roles) AS roles
    FROM auth.users au
    JOIN public.topac_acessos_fixos f
      ON lower(COALESCE(au.email, '')) = lower(COALESCE(f.email, ''))
   WHERE f.ativo = true
)
DELETE FROM public.user_roles ur
USING fixed_users fu
 WHERE ur.user_id = fu.user_id
   AND NOT (ur.role = ANY(fu.roles));

WITH fixed_roles AS (
  SELECT au.id AS user_id, unnest(public.topac_roles_validas(f.roles)) AS role
    FROM auth.users au
    JOIN public.topac_acessos_fixos f
      ON lower(COALESCE(au.email, '')) = lower(COALESCE(f.email, ''))
   WHERE f.ativo = true
)
INSERT INTO public.user_roles(user_id, role)
SELECT user_id, role
  FROM fixed_roles
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE auth.users au
   SET email_confirmed_at = COALESCE(au.email_confirmed_at, now()),
       banned_until = NULL,
       updated_at = now()
  FROM public.topac_acessos_fixos f
 WHERE f.ativo = true
   AND lower(COALESCE(au.email, '')) = lower(COALESCE(f.email, ''));

UPDATE public.acessos_externos ae
   SET profile_user_id = au.id,
       email = COALESCE(NULLIF(ae.email, ''), lower(au.email)),
       email_corporativo = COALESCE(NULLIF(ae.email_corporativo, ''), lower(au.email)),
       updated_at = now()
  FROM auth.users au
  JOIN public.topac_acessos_fixos f
    ON lower(COALESCE(au.email, '')) = lower(COALESCE(f.email, ''))
 WHERE f.ativo = true
   AND (
     public.topac_clean_cpf(COALESCE(ae.cpf_clean, ae.cpf, '')) = f.cpf_clean
     OR lower(COALESCE(ae.email, ae.email_corporativo, '')) = lower(COALESCE(f.email, ''))
   );

UPDATE public.cadastros_pendentes cp
   SET auth_user_id = au.id,
       cpf = f.cpf_clean,
       status = 'aprovado',
       email_confirmed_manual = true,
       email_confirmed_at = COALESCE(cp.email_confirmed_at, now()),
       aprovado_em = COALESCE(cp.aprovado_em, now()),
       updated_at = now()
  FROM auth.users au
  JOIN public.topac_acessos_fixos f
    ON lower(COALESCE(au.email, '')) = lower(COALESCE(f.email, ''))
 WHERE lower(cp.email) = lower(COALESCE(au.email, ''))
   AND f.ativo = true;
