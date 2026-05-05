
-- Drop functions CPF
DROP FUNCTION IF EXISTS public.validar_acesso_cpf(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.validar_acesso_cpf_slug(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.acesso_cpf_simples(text, text) CASCADE;
DROP FUNCTION IF EXISTS public._cpf_check_modulo(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.portal_cpf_mecanico_token(text) CASCADE;
DROP FUNCTION IF EXISTS public.portal_cpf_dados_filial(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.portal_cpf_almoxarifado(text) CASCADE;

-- Drop tables CPF
DROP TABLE IF EXISTS public.permissoes_acesso CASCADE;
DROP TABLE IF EXISTS public.acesso_cpf_simples_log CASCADE;
DROP TABLE IF EXISTS public.acesso_cpf_logs CASCADE;
DROP TABLE IF EXISTS public.funcionario_modulos CASCADE;
DROP TABLE IF EXISTS public.links_acesso_publico CASCADE;
