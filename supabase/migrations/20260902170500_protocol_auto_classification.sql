create or replace function public.protocol_apply_rental_tracking()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_before_arrow text;
  v_lote text;
begin
  if new.categoria_ativo is null or btrim(new.categoria_ativo) = '' then
    new.categoria_ativo := case
      when nullif(btrim(coalesce(new.placa, '')), '') is not null then 'veiculo'
      else 'compressor'
    end;
  end if;

  if new.protocolo_lote_id is null then
    v_lote := current_setting('topac.protocol_lote_id', true);
    if v_lote is null or v_lote = '' then
      v_lote := gen_random_uuid()::text;
      perform set_config('topac.protocol_lote_id', v_lote, true);
    end if;
    new.protocolo_lote_id := v_lote::uuid;
  end if;

  if coalesce(new.status_locacao, 'ativo') = 'ativo' and upper(coalesce(new.observacoes, '')) like '%SUBSTITUIÇÃO:%' then
    v_before_arrow := split_part(upper(coalesce(new.observacoes, '')), '→', 1);
    if (
      nullif(btrim(coalesce(new.placa, '')), '') is not null
      and position(upper(new.placa) in v_before_arrow) > 0
    ) or (
      nullif(btrim(coalesce(new.patrimonio, '')), '') is not null
      and position(upper(new.patrimonio) in v_before_arrow) > 0
    ) then
      new.status_locacao := 'alterado';
    end if;
  end if;

  new.status_atualizado_em := coalesce(new.status_atualizado_em, now());
  return new;
end;
$$;

drop trigger if exists trg_protocol_apply_rental_tracking on public.protocolos_documentos;
create trigger trg_protocol_apply_rental_tracking
before insert on public.protocolos_documentos
for each row execute function public.protocol_apply_rental_tracking();
