-- TOPAC RH PRO Multiempresas
-- Funções exclusivas de trigger não devem ser invocadas via RPC.

revoke all on function public.topac_block_duplicate_documento_funcionario()
  from public, anon, authenticated;

revoke all on function public.topac_block_duplicate_pre_cadastro_documento()
  from public, anon, authenticated;

revoke all on function public.topac_block_duplicate_rh_documento_upload()
  from public, anon, authenticated;
