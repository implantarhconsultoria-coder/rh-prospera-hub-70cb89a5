alter table public.movimento_diario
  drop constraint if exists movimento_diario_tipo_check;

alter table public.movimento_diario
  add constraint movimento_diario_tipo_check
  check (tipo = any (array[
    'falta'::text,
    'atraso'::text,
    'he50'::text,
    'he60'::text,
    'he100'::text,
    'comissao'::text,
    'adicional'::text,
    'desconto'::text,
    'adiantamento'::text,
    'observacao'::text
  ]));
