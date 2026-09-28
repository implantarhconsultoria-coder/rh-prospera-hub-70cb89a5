-- Indices de performance do novo fluxo Operacional.

create index if not exists idx_chamados_cliente_local_id on public.chamados(cliente_local_id);
create index if not exists idx_chamados_contrato_id on public.chamados(contrato_id);
create index if not exists idx_chamados_operador_abertura_id on public.chamados(operador_abertura_id);
create index if not exists idx_chamados_aceito_por_acesso_id on public.chamados(aceito_por_acesso_id);
create index if not exists idx_chamados_cancelado_por_operador_id on public.chamados(cancelado_por_operador_id);

create index if not exists idx_chamado_eventos_operador_id on public.chamado_eventos(operador_id);
create index if not exists idx_chamado_eventos_mecanico_acesso_id on public.chamado_eventos(mecanico_acesso_id);
create index if not exists idx_chamado_eventos_mecanico_funcionario_id on public.chamado_eventos(mecanico_funcionario_id);

create index if not exists idx_chamado_adicionais_mecanico_acesso_id on public.chamado_adicionais(mecanico_acesso_id);
create index if not exists idx_chamado_adicionais_mecanico_funcionario_id on public.chamado_adicionais(mecanico_funcionario_id);
create index if not exists idx_chamado_adicionais_visualizado_operador_id on public.chamado_adicionais(visualizado_por_operador_id);

create index if not exists idx_chamado_materiais_adicional_id on public.chamado_materiais(adicional_id);
create index if not exists idx_chamado_materiais_almox_item_id on public.chamado_materiais(almoxarifado_item_id);
create index if not exists idx_chamado_materiais_mecanico_acesso_id on public.chamado_materiais(mecanico_acesso_id);
create index if not exists idx_chamado_materiais_mecanico_funcionario_id on public.chamado_materiais(mecanico_funcionario_id);

create index if not exists idx_operacional_mov_ativo_id on public.operacional_movimentacoes(ativo_id);
create index if not exists idx_operacional_mov_cliente_origem_id on public.operacional_movimentacoes(cliente_origem_id);
create index if not exists idx_operacional_mov_contrato_id on public.operacional_movimentacoes(contrato_id);
create index if not exists idx_operacional_mov_local_origem_id on public.operacional_movimentacoes(local_origem_id);
create index if not exists idx_operacional_mov_local_destino_id on public.operacional_movimentacoes(local_destino_id);
create index if not exists idx_operacional_mov_operador_id on public.operacional_movimentacoes(operador_id);
