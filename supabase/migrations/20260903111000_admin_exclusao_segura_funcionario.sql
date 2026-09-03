alter table public.funcionarios
  add column if not exists excluido_em timestamptz,
  add column if not exists excluido_por uuid,
  add column if not exists exclusao_motivo text,
  add column if not exists exclusao_origem text;

create or replace function public.admin_excluir_funcionario_seguro(
  p_funcionario_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_nome text;
  v_total bigint := 0;
  v_count bigint := 0;
  v_vinculos jsonb := '{}'::jsonb;
begin
  if auth.role() <> 'service_role' and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas administradores podem excluir funcionários.' using errcode = '42501';
  end if;

  select nome into v_nome
  from public.funcionarios
  where id = p_funcionario_id
  for update;

  if v_nome is null then
    raise exception 'Funcionário não encontrado.' using errcode = 'P0002';
  end if;

  select count(*) into v_count from public.aso_documentos where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('aso_documentos', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.contracheque_envio_status where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('contracheque_envio_status', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.epi_entregas where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('epi_entregas', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.ferias_avisos where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('ferias_avisos', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.funcionario_login_tokens where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('funcionario_login_tokens', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.funcionario_novos_vinculos where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('funcionario_novos_vinculos', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.grupo_documentos_funcionarios where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('grupo_documentos_funcionarios', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.holerite_funcionario_documentos where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('holerite_funcionario_documentos', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.holerite_funcionario_itens where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('holerite_funcionario_itens', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.lancamentos_mensais where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('lancamentos_mensais', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.pendencias_ponto where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('pendencias_ponto', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.ponto_funcionario_dia where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('ponto_funcionario_dia', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.ponto_marcacoes where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('ponto_marcacoes', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.ponto_tokens where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('ponto_tokens', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.recibos_pagamento_digitais where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('recibos_pagamento_digitais', v_count); v_total := v_total + v_count;
  select count(*) into v_count from public.uniforme_entregas where funcionario_id = p_funcionario_id;
  v_vinculos := v_vinculos || jsonb_build_object('uniforme_entregas', v_count); v_total := v_total + v_count;

  if v_total = 0 then
    delete from public.funcionarios where id = p_funcionario_id;
    return jsonb_build_object('ok', true, 'modo', 'definitiva', 'funcionario', v_nome, 'vinculos_total', 0, 'vinculos', v_vinculos);
  end if;

  update public.funcionarios
  set ativo = false,
      status = 'excluido',
      excluido_em = now(),
      excluido_por = auth.uid(),
      exclusao_motivo = nullif(trim(coalesce(p_motivo, '')), ''),
      exclusao_origem = 'painel_admin'
  where id = p_funcionario_id;

  return jsonb_build_object('ok', true, 'modo', 'historico_preservado', 'funcionario', v_nome, 'vinculos_total', v_total, 'vinculos', v_vinculos);
end;
$$;

revoke all on function public.admin_excluir_funcionario_seguro(uuid, text) from public;
grant execute on function public.admin_excluir_funcionario_seguro(uuid, text) to authenticated;
