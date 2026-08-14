-- TOPAC RH PRO — liberacao final da Diretoria para leitura e aprovacao de solicitacoes EPI

drop policy if exists epi_solicitacoes_select_admin on public.epi_solicitacoes;
drop policy if exists epi_solicitacoes_select_diretoria on public.epi_solicitacoes;
create policy epi_solicitacoes_select_diretoria on public.epi_solicitacoes
for select to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

drop policy if exists epi_solicitacoes_update_admin on public.epi_solicitacoes;
drop policy if exists epi_solicitacoes_update_diretoria on public.epi_solicitacoes;
create policy epi_solicitacoes_update_diretoria on public.epi_solicitacoes
for update to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()))
with check (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

drop policy if exists epi_solicitacao_funcionarios_select_admin on public.epi_solicitacao_funcionarios;
drop policy if exists epi_solicitacao_funcionarios_select_diretoria on public.epi_solicitacao_funcionarios;
create policy epi_solicitacao_funcionarios_select_diretoria on public.epi_solicitacao_funcionarios
for select to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));
