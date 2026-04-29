
ALTER FUNCTION public.cria_mov_recebimento() SET search_path = public;
ALTER FUNCTION public.cria_mov_pagamento() SET search_path = public;
ALTER FUNCTION public.update_saldo_titulo_receber() SET search_path = public;
ALTER FUNCTION public.update_saldo_titulo_pagar() SET search_path = public;
ALTER FUNCTION public.baixa_estoque_veiculo_chamado() SET search_path = public;
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.has_role(uuid, app_role) SET search_path = public;
ALTER FUNCTION public.get_user_empresas() SET search_path = public;
ALTER FUNCTION public.gen_tecnico_access_token() SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_tecnico_access_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_empresas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_empresas() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

DROP POLICY IF EXISTS "Filial view fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Admin/financeiro view fornecedores" ON public.fornecedores;
CREATE POLICY "Admin/financeiro view fornecedores" ON public.fornecedores
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'faturamento'));

DROP POLICY IF EXISTS "Filial view clientes_fat" ON public.clientes_fat;
DROP POLICY IF EXISTS "Admin/faturamento view clientes_fat" ON public.clientes_fat;
CREATE POLICY "Admin/faturamento view clientes_fat" ON public.clientes_fat
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "Filial view renegociacoes" ON public.renegociacoes;
DROP POLICY IF EXISTS "Admin/financeiro view renegociacoes" ON public.renegociacoes;
CREATE POLICY "Admin/financeiro view renegociacoes" ON public.renegociacoes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "Filial view impostos" ON public.impostos;
DROP POLICY IF EXISTS "All view impostos" ON public.impostos;
DROP POLICY IF EXISTS "Admin/financeiro view impostos" ON public.impostos;
CREATE POLICY "Admin/financeiro view impostos" ON public.impostos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "Filial view centros_custo" ON public.centros_custo;
DROP POLICY IF EXISTS "All view centros_custo" ON public.centros_custo;
DROP POLICY IF EXISTS "Admin/financeiro view centros_custo" ON public.centros_custo;
CREATE POLICY "Admin/financeiro view centros_custo" ON public.centros_custo
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'faturamento'));

DROP POLICY IF EXISTS "Filial view faturamento_pendencias" ON public.faturamento_pendencias;
CREATE POLICY "Filial view faturamento_pendencias" ON public.faturamento_pendencias
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'faturamento') OR
    public.has_role(auth.uid(),'financeiro') OR
    (contrato_id IS NOT NULL AND (public.has_role(auth.uid(),'filial_praia') OR public.has_role(auth.uid(),'filial_goiania')))
  );

-- tecnicos_campo: limpar políticas antigas e manter só admin
DROP POLICY IF EXISTS "Operacional view tecnicos_campo" ON public.tecnicos_campo;
DROP POLICY IF EXISTS "Operacional manage tecnicos_campo" ON public.tecnicos_campo;
DROP POLICY IF EXISTS "Admin view tecnicos_campo" ON public.tecnicos_campo;
DROP POLICY IF EXISTS "Operacional and admin can manage tecnicos_campo" ON public.tecnicos_campo;

CREATE OR REPLACE VIEW public.tecnicos_campo_safe
WITH (security_invoker = on) AS
SELECT
  id, apelido, funcionario_id, user_id, veiculo_id, status, observacoes,
  link_status, link_bloqueado, link_bloqueado_em, link_regenerado_em,
  ultimo_acesso_em, ultima_atividade_em, revogado_em, revogado_por,
  created_at, updated_at
FROM public.tecnicos_campo;

GRANT SELECT ON public.tecnicos_campo_safe TO authenticated;

-- tecnicos_link_historico: somente admin
DROP POLICY IF EXISTS "Operacional view tecnicos_link_historico" ON public.tecnicos_link_historico;
DROP POLICY IF EXISTS "Operacional manage tecnicos_link_historico" ON public.tecnicos_link_historico;
DROP POLICY IF EXISTS "Admin view tecnicos_link_historico" ON public.tecnicos_link_historico;
DROP POLICY IF EXISTS "Operacional and admin can view tecnicos_link_historico" ON public.tecnicos_link_historico;
DROP POLICY IF EXISTS "Operacional and admin can manage tecnicos_link_historico" ON public.tecnicos_link_historico;
DROP POLICY IF EXISTS "Admin only manage link historico" ON public.tecnicos_link_historico;

CREATE POLICY "Admin only manage link historico" ON public.tecnicos_link_historico
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- chamados: SELECT escopado (admin/operacional total; tecnico só seus via colaborador_id)
ALTER TABLE IF EXISTS public.chamados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All view chamados" ON public.chamados;
DROP POLICY IF EXISTS "Authenticated view chamados" ON public.chamados;
DROP POLICY IF EXISTS "Scoped view chamados" ON public.chamados;
CREATE POLICY "Scoped view chamados" ON public.chamados
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'operacional')
    OR (public.has_role(auth.uid(),'tecnico_campo') AND colaborador_id = auth.uid())
  );
