-- 1) Remove acessos RH (módulo desnecessário; filial já cobre RH)
DELETE FROM public.acessos_externos WHERE modulo = 'rh' OR perfil_acesso = 'rh';

-- 2) Atualiza constraints removendo 'rh' como módulo/perfil válido
ALTER TABLE public.acessos_externos DROP CONSTRAINT IF EXISTS acessos_externos_modulo_chk;
ALTER TABLE public.acessos_externos DROP CONSTRAINT IF EXISTS acessos_externos_perfil_chk;

ALTER TABLE public.acessos_externos
  ADD CONSTRAINT acessos_externos_modulo_chk
  CHECK (modulo IN ('mecanico','campo','operacional','faturamento','financeiro','almoxarifado','filial'));

ALTER TABLE public.acessos_externos
  ADD CONSTRAINT acessos_externos_perfil_chk
  CHECK (perfil_acesso IN ('mecanico_externo','tecnico_campo','operacional','faturamento','financeiro','almoxarifado','filial'));