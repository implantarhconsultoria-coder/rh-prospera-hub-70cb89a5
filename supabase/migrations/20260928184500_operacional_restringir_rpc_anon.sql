-- Restringe RPCs administrativos/operacionais a sessoes autenticadas.
-- O app mecanico continua anonimo somente nas RPCs que validam o acesso mecanico.

revoke execute on function public.usuario_tem_modulo_operacional(text) from anon;
revoke execute on function public.operador_operacao_is_admin() from anon;
revoke execute on function public.operador_operacao_garantir_self(text) from anon;
revoke execute on function public.operador_operacao_emitir_codigo(uuid) from anon;
revoke execute on function public.operador_operacao_invalidar_codigo(uuid) from anon;
revoke execute on function public.operador_operacao_listar() from anon;
revoke execute on function public.operador_operacao_definir_ativo(uuid, boolean) from anon;
revoke execute on function public.operador_operacao_validar_codigo(text, text) from anon;
revoke execute on function public._operador_operacao_por_codigo(text, text) from anon, authenticated;

revoke execute on function public.operacional_criar_chamado(text, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid, text, text) from anon;
revoke execute on function public.operacional_editar_chamado(text, uuid, uuid, text, text, text, text, text) from anon;
revoke execute on function public.operacional_cancelar_chamado(text, uuid, text) from anon;
revoke execute on function public.operacional_registrar_movimentacao(text, uuid, text, uuid, uuid, text, text) from anon;
revoke execute on function public.operacional_marcar_adicional_visualizado(text, uuid) from anon;
revoke execute on function public.operacional_chamado_detalhe(uuid) from anon;

grant execute on function public.usuario_tem_modulo_operacional(text) to authenticated;
grant execute on function public.operador_operacao_is_admin() to authenticated;
grant execute on function public.operador_operacao_garantir_self(text) to authenticated;
grant execute on function public.operador_operacao_emitir_codigo(uuid) to authenticated;
grant execute on function public.operador_operacao_invalidar_codigo(uuid) to authenticated;
grant execute on function public.operador_operacao_listar() to authenticated;
grant execute on function public.operador_operacao_definir_ativo(uuid, boolean) to authenticated;
grant execute on function public.operador_operacao_validar_codigo(text, text) to authenticated;
grant execute on function public.operacional_criar_chamado(text, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.operacional_editar_chamado(text, uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.operacional_cancelar_chamado(text, uuid, text) to authenticated;
grant execute on function public.operacional_registrar_movimentacao(text, uuid, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.operacional_marcar_adicional_visualizado(text, uuid) to authenticated;
grant execute on function public.operacional_chamado_detalhe(uuid) to authenticated;
