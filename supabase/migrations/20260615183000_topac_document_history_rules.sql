-- Padroniza categorias do Historico Documental e registra o envio de atestados.
create or replace function public.topac_normalizar_documento_funcionario()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_texto text;
  v_evento text;
begin
  v_texto := translate(
    lower(concat_ws(' ', new.categoria, new.tipo_documento, new.descricao, new.nome_arquivo)),
    'áàâãäéèêëíìîïóòôõöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );

  if v_texto ~ '(atestado|declaracao medica|justificativa medica)' then
    new.categoria := 'ATESTADO';
  elsif v_texto ~ '(\maso\M|exame admissional|exame periodico|retorno ao trabalho|exame demissional)' then
    new.categoria := 'ASO';
  elsif v_texto ~ '(contrato de trabalho|contrato experiencia|contrato de experiencia)' then
    new.categoria := 'CONTRATO';
  end if;

  if tg_op = 'UPDATE'
     and new.status_envio = 'enviado'
     and old.status_envio is distinct from 'enviado'
     and new.categoria = 'ATESTADO' then
    new.enviado_em := coalesce(new.enviado_em, now());
    v_evento := 'Atestado enviado para contabilidade em '
      || to_char(new.enviado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
      || ' as '
      || to_char(new.enviado_em at time zone 'America/Sao_Paulo', 'HH24:MI');

    if position(v_evento in coalesce(new.observacao, '')) = 0 then
      new.observacao := concat_ws(E'\n', nullif(trim(coalesce(new.observacao, '')), ''), v_evento);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_topac_normalizar_documento_funcionario on public.documentos_funcionario;
create trigger trg_topac_normalizar_documento_funcionario
before insert or update of categoria, tipo_documento, descricao, nome_arquivo, status_envio
on public.documentos_funcionario
for each row
execute function public.topac_normalizar_documento_funcionario();

-- Reclassifica documentos antigos sem apagar arquivo ou historico.
update public.documentos_funcionario
set categoria = 'ATESTADO'
where translate(
  lower(concat_ws(' ', categoria, tipo_documento, descricao, nome_arquivo)),
  'áàâãäéèêëíìîïóòôõöúùûüç',
  'aaaaaeeeeiiiiooooouuuuc'
) ~ '(atestado|declaracao medica|justificativa medica)'
and categoria is distinct from 'ATESTADO';

update public.documentos_funcionario
set categoria = 'ASO'
where translate(
  lower(concat_ws(' ', categoria, tipo_documento, descricao, nome_arquivo)),
  'áàâãäéèêëíìîïóòôõöúùûüç',
  'aaaaaeeeeiiiiooooouuuuc'
) ~ '(\maso\M|exame admissional|exame periodico|retorno ao trabalho|exame demissional)'
and categoria is distinct from 'ASO';

notify pgrst, 'reload schema';
