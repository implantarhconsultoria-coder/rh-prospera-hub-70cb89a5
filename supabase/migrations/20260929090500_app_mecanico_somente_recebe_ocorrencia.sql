
create or replace function public.app_mecanico_criar_chamado(
  p_acesso_id uuid,
  p_tipo_servico text,
  p_itens_previstos text default null,
  p_observacoes text default null,
  p_local_servico text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  return jsonb_build_object(
    'ok', false,
    'error', 'criacao_no_app_desabilitada',
    'message', 'O app mecânico somente recebe ocorrências abertas pelo Operacional.'
  );
end;
$$;
