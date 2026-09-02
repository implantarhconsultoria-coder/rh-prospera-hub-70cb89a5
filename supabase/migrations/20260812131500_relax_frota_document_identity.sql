-- Permite arquivar o documento da Frota mesmo quando RENAVAM/Chassi
-- não puderem ser extraídos automaticamente. Valores informados continuam
-- sendo normalizados e validados quando presentes.
create or replace function public.topac_validate_vehicle_document_identity()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_document_changed boolean;
begin
  if coalesce(new.tipo, '') <> 'veiculo' then
    return new;
  end if;

  v_document_changed := tg_op = 'INSERT'
    or new.arquivo_url is distinct from old.arquivo_url
    or new.documento_url is distinct from old.documento_url
    or new.renavam is distinct from old.renavam
    or new.chassi is distinct from old.chassi;

  if not v_document_changed then
    return new;
  end if;

  new.placa := upper(regexp_replace(coalesce(new.placa, ''), '[^A-Z0-9]', '', 'g'));
  new.renavam := regexp_replace(coalesce(new.renavam, ''), '[^0-9]', '', 'g');
  new.chassi := upper(regexp_replace(coalesce(new.chassi, ''), '[^A-HJ-NPR-Z0-9]', '', 'g'));

  if new.renavam <> '' and length(new.renavam) < 9 then
    raise exception using errcode = '23514', message = 'RENAVAM informado é inválido. Corrija o campo ou deixe em branco para conferência posterior.';
  end if;

  if new.chassi <> '' and length(new.chassi) <> 17 then
    raise exception using errcode = '23514', message = 'Chassi informado é inválido. Corrija o campo ou deixe em branco para conferência posterior.';
  end if;

  return new;
end;
$function$;
