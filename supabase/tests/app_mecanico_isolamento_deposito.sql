-- Executar APENAS em ambiente de testes apos a migration.
-- Lê as contas existentes; não cria abastecimento nem altera registros.
DO $test$
DECLARE
  v_sp uuid;
  v_pg uuid;
  r jsonb;
BEGIN
  select id into v_sp from public.acessos_externos where modulo='mecanico' and status='ativo' and upper(filial)='SAO PAULO' order by nome limit 1;
  select id into v_pg from public.acessos_externos where modulo='mecanico' and status='ativo' and upper(filial) like '%PRAIA%' order by nome limit 1;
  if v_sp is null or v_pg is null then raise exception 'Fixtures SP/PG indisponiveis'; end if;
  r:=public.app_mecanico_validar_qr_posto(v_sp,'COMB-PG-001');
  if r->>'error' <> 'posto_fora_unidade' then raise exception 'SP acessou Praia Grande: %',r; end if;
  r:=public.app_mecanico_validar_qr_posto(v_pg,'COMB-SP-001');
  if r->>'error' <> 'posto_fora_unidade' then raise exception 'Praia Grande acessou SP: %',r; end if;
  r:=public.app_mecanico_validar_qr_posto(v_sp,'COMB-SP-001');
  if r->>'ok' <> 'true' then raise exception 'Posto de SP bloqueado indevidamente: %',r; end if;
  r:=public.app_mecanico_validar_qr_posto(v_pg,'COMB-PG-001');
  if r->>'ok' <> 'true' then raise exception 'Posto da Praia bloqueado indevidamente: %',r; end if;
END;
$test$;
