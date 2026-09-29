alter table public.lancamentos_mensais
  add column if not exists he60 numeric not null default 0;

comment on column public.lancamentos_mensais.he60 is
  'Quantidade de horas extras pagas com adicional de 60%. Padrão disponível para todas as empresas.';

create index if not exists idx_lancamentos_mensais_he60
  on public.lancamentos_mensais(company_id, competencia)
  where he60 <> 0;
