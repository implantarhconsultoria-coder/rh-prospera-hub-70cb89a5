create table if not exists public.topac_login_attempts (
  id uuid primary key default gen_random_uuid(),
  cpf_hash text not null,
  ip_hash text not null,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists topac_login_attempts_cpf_created_idx
  on public.topac_login_attempts (cpf_hash, created_at desc);
create index if not exists topac_login_attempts_ip_created_idx
  on public.topac_login_attempts (ip_hash, created_at desc);

alter table public.topac_login_attempts enable row level security;
revoke all on table public.topac_login_attempts from public, anon, authenticated;
grant select, insert, delete on table public.topac_login_attempts to service_role;

create or replace function public.topac_login_identity(p_cpf text, p_phone_last4 text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_cpf text := public.topac_clean_cpf(p_cpf);
  v_last4 text := regexp_replace(coalesce(p_phone_last4, ''), '\D', '', 'g');
  v_employee public.funcionarios%rowtype;
  v_access jsonb;
  v_access_email text := '';
  v_user_id uuid;
  v_user_cpf text := '';
begin
  if auth.role() <> 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  end if;

  if length(v_cpf) <> 11 or length(v_last4) <> 4 then
    return jsonb_build_object('ok', false, 'error', 'credencial_invalida');
  end if;

  select f.*
    into v_employee
    from public.funcionarios f
   where public.topac_clean_cpf(f.cpf) = v_cpf
     and coalesce(f.status, 'ativo') = 'ativo'
     and coalesce(f.ativo, true) = true
     and f.data_demissao is null
     and (
       right(regexp_replace(coalesce(f.celular, ''), '\D', '', 'g'), 4) = v_last4
       or right(regexp_replace(coalesce(f.telefone, ''), '\D', '', 'g'), 4) = v_last4
     )
   limit 1;

  if v_employee.id is null then
    return jsonb_build_object('ok', false, 'error', 'credencial_invalida');
  end if;

  v_access := public.topac_resolver_acesso_cpf(v_cpf, coalesce(v_employee.email, ''), coalesce(v_employee.nome, ''));

  if coalesce((v_access->>'authorized')::boolean, false) is not true then
    return jsonb_build_object('ok', true, 'authorized', false, 'error', 'acesso_nao_liberado');
  end if;

  v_access_email := lower(coalesce(nullif(v_access->>'email', ''), nullif(v_employee.email, ''), ''));

  select au.id,
         public.topac_clean_cpf(coalesce(p.cpf, au.raw_user_meta_data->>'cpf', ''))
    into v_user_id, v_user_cpf
    from auth.users au
    left join public.profiles p on p.user_id = au.id
   where public.topac_clean_cpf(coalesce(p.cpf, au.raw_user_meta_data->>'cpf', '')) = v_cpf
      or (
        v_access_email <> ''
        and lower(coalesce(au.email, '')) = v_access_email
        and public.topac_clean_cpf(coalesce(p.cpf, au.raw_user_meta_data->>'cpf', '')) in ('', v_cpf)
      )
   order by
     case when public.topac_clean_cpf(coalesce(p.cpf, au.raw_user_meta_data->>'cpf', '')) = v_cpf then 0 else 1 end,
     au.created_at asc
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'authorized', true,
    'user_id', v_user_id,
    'cpf', v_cpf,
    'nome', coalesce(nullif(v_access->>'nome', ''), v_employee.nome, 'Usuario TOPAC'),
    'email', v_access_email,
    'telefone', coalesce(nullif(v_employee.celular, ''), nullif(v_employee.telefone, ''), ''),
    'empresa', coalesce(v_access->>'empresa', ''),
    'filial', coalesce(v_access->>'filial', ''),
    'cargo', coalesce(v_access->>'cargo', ''),
    'roles', coalesce(v_access->'roles', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.topac_login_identity(text, text) from public, anon, authenticated;
grant execute on function public.topac_login_identity(text, text) to service_role;
