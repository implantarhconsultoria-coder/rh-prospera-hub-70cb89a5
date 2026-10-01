alter table public.contabilidade_folha_ciclos
  add column if not exists rh_recebeu_em timestamptz,
  add column if not exists rh_recebeu_por uuid;
