create or replace function public.topac_fixar_destinatarios_atestado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email_marisa := 'marisa@aatconsultoria.com.br, lucilene@aatconsultoria.com.br, dp@aatconsultoria.com.br';
  new.email_robson := '';
  new.emails_copia := 'adm.matriz@topac.com.br, robson@topac.com.br';
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_topac_fixar_destinatarios_atestado
  on public.config_emails_contabilidade;

create trigger trg_topac_fixar_destinatarios_atestado
before insert or update on public.config_emails_contabilidade
for each row
execute function public.topac_fixar_destinatarios_atestado();

update public.config_emails_contabilidade
set email_marisa = 'marisa@aatconsultoria.com.br, lucilene@aatconsultoria.com.br, dp@aatconsultoria.com.br',
    email_robson = '',
    emails_copia = 'adm.matriz@topac.com.br, robson@topac.com.br',
    updated_at = now();

notify pgrst, 'reload schema';
