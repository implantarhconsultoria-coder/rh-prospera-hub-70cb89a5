-- Libera a solicitação de abastecimento quando o próprio fluxo do app entrega a mensagem ao WhatsApp.
-- A validação mantém a operação restrita ao funcionário dono da solicitação.

create or replace function public.app_mecanico_liberar_abastecimento_apos_whatsapp(
  p_acesso_id uuid,
  p_autorizacao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.acessos_externos;
  a public.abastecimento_autorizacoes;
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  end;

  select * into a
    from public.abastecimento_autorizacoes
   where id = p_autorizacao_id
     and funcionario_id = v.funcionario_id
   for update;

  if a.id is null then
    return jsonb_build_object('ok', false, 'error', 'solicitacao_nao_encontrada');
  end if;

  if a.status = 'pendente' then
    update public.abastecimento_autorizacoes
       set status = 'autorizado',
           autorizado = true,
           autorizado_em = coalesce(autorizado_em, now()),
           autorizado_por = null,
           autorizado_por_nome = 'Sistema TOPAC',
           updated_at = now()
     where id = a.id
     returning * into a;
  end if;

  return jsonb_build_object(
    'ok', true,
    'authorization', to_jsonb(a)
  );
end;
$function$;

grant execute on function public.app_mecanico_liberar_abastecimento_apos_whatsapp(uuid, uuid) to anon, authenticated;
