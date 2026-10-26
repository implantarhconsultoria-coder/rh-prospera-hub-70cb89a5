-- PIN pessoal no primeiro uso; preserva os codigos ja emitidos e as trilhas de auditoria.
create or replace function public.operador_operacao_configurar_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_operador public.operadores_operacao;
  v_conflito boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'nao_autenticado');
  end if;
  if not public.usuario_tem_modulo_operacional('operacional') then
    return jsonb_build_object('ok', false, 'error', 'sem_permissao');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'pin_deve_ter_6_digitos');
  end if;
  if p_pin ~ '^([0-9])\1{5}$'
     or p_pin in ('123456','654321','012345','543210','112233','121212') then
    return jsonb_build_object('ok', false, 'error', 'escolha_um_pin_menos_obvio');
  end if;
  select * into v_operador
  from public.operadores_operacao o
  where o.user_id = v_uid
    and o.ativo = true
    and 'operacional' = any(o.modulos)
  for update;
  if v_operador.id is null then
    return jsonb_build_object('ok', false, 'error', 'operador_nao_vinculado_ou_inativo');
  end if;
  if v_operador.codigo_hash is not null then
    return jsonb_build_object('ok', false, 'error', 'pin_ja_configurado');
  end if;
  select exists (
    select 1 from public.operadores_operacao o
    where o.id <> v_operador.id and o.codigo_hash is not null
      and crypt(p_pin, o.codigo_hash) = o.codigo_hash
  ) into v_conflito;
  if v_conflito then
    return jsonb_build_object('ok', false, 'error', 'escolha_outro_pin');
  end if;
  update public.operadores_operacao
  set codigo_hash = crypt(p_pin, gen_salt('bf', 8)),
      codigo_hint = right(p_pin, 2),
      codigo_emitido_em = now(),
      updated_at = now()
  where id = v_operador.id and codigo_hash is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'pin_ja_configurado');
  end if;
  return jsonb_build_object('ok', true, 'operador_id', v_operador.id);
end;
$$;
revoke all on function public.operador_operacao_configurar_pin(text) from public, anon;
grant execute on function public.operador_operacao_configurar_pin(text) to authenticated;
