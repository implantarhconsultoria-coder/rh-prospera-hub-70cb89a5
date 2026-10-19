-- Testes transacionais para rodar em homologação APÓS a migration de sessão.
-- Não retornar CPF, nascimento, PIN ou token no resultado da consulta.
BEGIN;
DO $test$
DECLARE
 v_id uuid;
 v_other uuid;
 v_cpf text;
 v_pin text;
 v_birth date;
 v_result jsonb;
 v_token text;
 v_user public.acessos_externos;
 v_denied boolean := false;
BEGIN
 SELECT a.id,a.cpf_clean,a.pin,f.data_nascimento
 INTO v_id,v_cpf,v_pin,v_birth
 FROM public.acessos_externos a
 JOIN public.funcionarios f on f.id=a.funcionario_id
 WHERE a.modulo='mecanico' AND a.status='ativo' AND a.acesso_liberado=true
   AND length(a.cpf_clean)=11 AND f.data_nascimento is not null
 ORDER BY a.id LIMIT 1;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Sem fixtures ativas'; END IF;
 SELECT id INTO v_other FROM public.acessos_externos
 WHERE modulo='mecanico' AND id<>v_id AND status='ativo' LIMIT 1;
 IF v_other IS NULL THEN RAISE EXCEPTION 'Sem segundo usuario'; END IF;
 v_result:=public.app_mecanico_abrir_sessao(v_cpf,v_birth,v_pin);
 IF v_result->>'ok'<>'true' THEN RAISE EXCEPTION 'Login falhou'; END IF;
 v_token:=v_result->>'token';
 IF length(v_token)<>64 THEN RAISE EXCEPTION 'Token de tamanho incorreto'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-client-info','supabase-js mec-session='||v_token)::text,true);
 v_user:=public._app_mecanico_get_acesso(v_id);
 IF v_user.id<>v_id THEN RAISE EXCEPTION 'Conta errada'; END IF;
 BEGIN
   v_user:=public._app_mecanico_get_acesso(v_other);
 EXCEPTION WHEN others THEN
   v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Token de uma conta acessou outra'; END IF;
 PERFORM public.app_mecanico_encerrar_sessao(v_token);
 v_denied:=false;
 BEGIN
   v_user:=public._app_mecanico_get_acesso(v_id);
 EXCEPTION WHEN others THEN
   v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Token revogado ainda autorizado'; END IF;
END;
$test$;
ROLLBACK;
