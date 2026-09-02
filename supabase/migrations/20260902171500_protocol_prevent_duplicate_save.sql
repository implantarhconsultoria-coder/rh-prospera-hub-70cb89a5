update public.protocolos_documentos
set status_locacao = 'alterado', status_atualizado_em = now()
where upper(coalesce(observacoes,'')) like '%SUBSTITUIÇÃO:%'
  and (
    (nullif(btrim(coalesce(placa,'')), '') is not null and position(upper(placa) in split_part(upper(observacoes), '→', 1)) > 0)
    or
    (nullif(btrim(coalesce(patrimonio,'')), '') is not null and position(upper(patrimonio) in split_part(upper(observacoes), '→', 1)) > 0)
  );

create or replace function public.protocol_prevent_duplicate_save()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.protocolos_documentos p
    where p.created_at >= now() - interval '15 minutes'
      and p.data_emissao is not distinct from new.data_emissao
      and p.ativo_id is not distinct from new.ativo_id
      and coalesce(p.placa, '') = coalesce(new.placa, '')
      and coalesce(p.patrimonio, '') = coalesce(new.patrimonio, '')
      and coalesce(p.empresa_destinataria, '') = coalesce(new.empresa_destinataria, '')
      and coalesce(p.local_canteiro, '') = coalesce(new.local_canteiro, '')
      and coalesce(p.responsavel_recebimento, '') = coalesce(new.responsavel_recebimento, '')
      and coalesce(p.observacoes, '') = coalesce(new.observacoes, '')
      and coalesce(p.texto_original, '') = coalesce(new.texto_original, '')
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protocol_prevent_duplicate_save on public.protocolos_documentos;
create trigger trg_protocol_prevent_duplicate_save
before insert on public.protocolos_documentos
for each row execute function public.protocol_prevent_duplicate_save();
