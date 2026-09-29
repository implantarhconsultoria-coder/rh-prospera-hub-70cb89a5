-- Prepara o App Operacional para os colaboradores de SP.
-- O acesso externo fica bloqueado até o administrador cadastrar o e-mail corporativo.

insert into public.acessos_externos (
  funcionario_id, cpf, cpf_clean, nome, email, email_corporativo, telefone,
  tipo_acesso, modulos_liberados, ativo, pin, empresa, filial, funcao,
  perfil_acesso, modulo, status, acesso_liberado, observacoes, created_at, updated_at
)
select
  f.id,
  regexp_replace(coalesce(f.cpf,''),'[^0-9]','','g'),
  regexp_replace(coalesce(f.cpf,''),'[^0-9]','','g'),
  f.nome,
  null,
  null,
  coalesce(nullif(f.celular,''),nullif(f.telefone,'')),
  'operacional',
  '["operacional"]'::jsonb,
  true,
  null,
  coalesce(e.nome,e.razao_social,'TOPAC'),
  'SP',
  f.cargo,
  'operacional',
  'operacional',
  'ativo',
  false,
  'Pré-cadastro do App Operacional. Aguardando e-mail corporativo para liberação.',
  now(),
  now()
from public.funcionarios f
left join public.empresas e on e.id=coalesce(f.company_id,f.empresa_id)
where f.id in (
  'aefe80e9-d8c5-4627-8bd9-57966988780c',
  '18ced057-ca65-4f7e-8471-2e9fc874c2a0',
  '0af6d35d-60bd-43e4-8bb7-fcae288f5a7a'
)
and not exists (
  select 1 from public.acessos_externos a
  where a.funcionario_id=f.id and a.modulo='operacional'
);

create or replace function public.operador_operacao_definir_email(
  p_operador_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_funcionario_id uuid;
begin
  if not public.operador_operacao_is_admin() then
    return jsonb_build_object('ok', false, 'error', 'sem_permissao');
  end if;

  v_email := lower(trim(coalesce(p_email,'')));
  if v_email = '' or position('@' in v_email) < 2 then
    return jsonb_build_object('ok', false, 'error', 'email_invalido');
  end if;

  if exists (
    select 1 from public.operadores_operacao
    where lower(coalesce(email,'')) = v_email
      and id <> p_operador_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'email_ja_vinculado');
  end if;

  update public.operadores_operacao
  set email = v_email,
      updated_at = now()
  where id = p_operador_id
  returning funcionario_id into v_funcionario_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'operador_nao_encontrado');
  end if;

  if v_funcionario_id is not null then
    update public.acessos_externos
       set email = v_email,
           email_corporativo = v_email,
           acesso_liberado = true,
           status = 'ativo',
           ativo = true,
           ultima_validacao_email_em = null,
           observacoes = 'App Operacional liberado pelo administrador. E-mail corporativo vinculado; primeira validação por e-mail pendente.',
           updated_at = now()
     where funcionario_id = v_funcionario_id
       and modulo = 'operacional';
  end if;

  return jsonb_build_object('ok', true, 'email', v_email, 'app_operacional_liberado', v_funcionario_id is not null);
end;
$$;

revoke all on function public.operador_operacao_definir_email(uuid,text) from public, anon;
grant execute on function public.operador_operacao_definir_email(uuid,text) to authenticated;
