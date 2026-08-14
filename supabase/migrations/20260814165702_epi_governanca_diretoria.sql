-- TOPAC RH PRO — Governanca do modulo EPI
-- Diretoria: leitura e aprovacao da solicitacao.
-- Admin: catalogo, geracao de solicitacao, fichas e efetivacao da entrega.

drop policy if exists epi_catalogo_admin_write on public.epi_catalogo;
create policy epi_catalogo_admin_write on public.epi_catalogo
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists epi_solicitacoes_admin_all on public.epi_solicitacoes;
create policy epi_solicitacoes_select_diretoria on public.epi_solicitacoes
for select to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));
create policy epi_solicitacoes_insert_admin on public.epi_solicitacoes
for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'));
create policy epi_solicitacoes_update_diretoria on public.epi_solicitacoes
for update to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()))
with check (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));
create policy epi_solicitacoes_delete_admin on public.epi_solicitacoes
for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists epi_solicitacao_funcionarios_admin_all on public.epi_solicitacao_funcionarios;
create policy epi_solicitacao_funcionarios_select_diretoria on public.epi_solicitacao_funcionarios
for select to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));
create policy epi_solicitacao_funcionarios_insert_admin on public.epi_solicitacao_funcionarios
for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'));
create policy epi_solicitacao_funcionarios_update_admin on public.epi_solicitacao_funcionarios
for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
create policy epi_solicitacao_funcionarios_delete_admin on public.epi_solicitacao_funcionarios
for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists epi_entregas_admin_write on public.epi_entregas;
create policy epi_entregas_admin_write on public.epi_entregas
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists epi_historico_admin_insert on public.epi_historico;
create policy epi_historico_admin_insert on public.epi_historico
for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'));
