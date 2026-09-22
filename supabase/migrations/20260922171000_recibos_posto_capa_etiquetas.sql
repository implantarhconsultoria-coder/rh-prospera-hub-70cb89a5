-- Histórico global de capas dos recibos do posto. O período somente avança
-- depois de o usuário confirmar que imprimiu/salvou o PDF.
create table if not exists public.receipt_post_label_prints (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  printed_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint receipt_post_label_prints_dates_ok check (period_start <= period_end)
);

create index if not exists receipt_post_label_prints_created_idx
  on public.receipt_post_label_prints (created_at desc, id desc);

alter table public.receipt_post_label_prints enable row level security;

revoke all on public.receipt_post_label_prints from anon;
grant select, insert on public.receipt_post_label_prints to authenticated;

drop policy if exists receipt_post_label_prints_read on public.receipt_post_label_prints;
create policy receipt_post_label_prints_read
on public.receipt_post_label_prints
for select to authenticated
using (public.topac_has_any_role(array[
  'admin', 'diretor_geral', 'faturamento', 'financeiro',
  'filial_matriz', 'filial_praia', 'filial_goiania', 'almoxarifado'
]::text[], auth.uid()));

drop policy if exists receipt_post_label_prints_insert on public.receipt_post_label_prints;
create policy receipt_post_label_prints_insert
on public.receipt_post_label_prints
for insert to authenticated
with check (
  printed_by = auth.uid()
  and public.topac_has_any_role(array[
    'admin', 'diretor_geral', 'faturamento', 'financeiro',
    'filial_matriz', 'filial_praia', 'filial_goiania', 'almoxarifado'
  ]::text[], auth.uid())
);