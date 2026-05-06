ALTER TABLE public.acessos_externos DROP CONSTRAINT IF EXISTS acessos_externos_modulo_chk;
ALTER TABLE public.acessos_externos DROP CONSTRAINT IF EXISTS acessos_externos_perfil_chk;

ALTER TABLE public.acessos_externos ADD CONSTRAINT acessos_externos_modulo_chk
  CHECK (modulo = ANY (ARRAY['mecanico','financeiro','faturamento','rh','almoxarifado','operacional','filial','campo']));

ALTER TABLE public.acessos_externos ADD CONSTRAINT acessos_externos_perfil_chk
  CHECK (perfil_acesso = ANY (ARRAY['mecanico_externo','tecnico_campo','financeiro','faturamento','rh','almoxarifado','operacional','filial']));