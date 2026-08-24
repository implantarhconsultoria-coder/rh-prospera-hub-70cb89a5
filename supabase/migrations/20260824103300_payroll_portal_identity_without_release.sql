-- Portal de Holerite: a identidade deve ser validada pelos dados cadastrais,
-- independentemente de já existir documento liberado.
-- A disponibilidade do holerite continua condicionada a documento conferido + pagamento confirmado.
create or replace function public.payroll_match_identity(
  p_cpf text,
  p_birth date,
  p_phone_last4 text
)
returns table(employee_id uuid, company_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select f.id, coalesce(f.company_id, f.empresa_id)
  from public.funcionarios f
  where regexp_replace(coalesce(f.cpf,''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf,''), '\D', '', 'g')
    and f.data_nascimento = p_birth
    and coalesce(f.status, 'ativo') = 'ativo'
    and length(regexp_replace(coalesce(p_phone_last4,''), '\D', '', 'g')) = 4
    and (
      right(regexp_replace(coalesce(f.celular,''), '\D', '', 'g'), 4) = regexp_replace(coalesce(p_phone_last4,''), '\D', '', 'g')
      or right(regexp_replace(coalesce(f.telefone,''), '\D', '', 'g'), 4) = regexp_replace(coalesce(p_phone_last4,''), '\D', '', 'g')
    )
    and public.payroll_company_enabled(coalesce(f.company_id, f.empresa_id))
  limit 2;
$function$;
