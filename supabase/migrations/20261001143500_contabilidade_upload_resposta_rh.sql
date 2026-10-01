alter table public.contabilidade_portal_uploads
  add column if not exists rh_resposta text,
  add column if not exists rh_resposta_em timestamptz,
  add column if not exists rh_resposta_por uuid;
