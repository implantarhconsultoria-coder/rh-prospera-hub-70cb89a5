TRUNCATE TABLE public.acesso_cpf_logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.links_acesso_publico RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.funcionario_modulos RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.tecnicos_link_historico RESTART IDENTITY CASCADE;

UPDATE public.tecnicos_campo
   SET access_token = NULL,
       link_status  = 'revogado',
       link_bloqueado = true;

UPDATE public.funcionarios
   SET acesso_cpf_liberado = false
 WHERE acesso_cpf_liberado IS DISTINCT FROM false;