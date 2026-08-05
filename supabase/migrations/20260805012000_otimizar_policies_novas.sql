-- TOPAC RH PRO Multiempresas
-- Evita reavaliação de auth.uid() por linha nas policies criadas pela PR #63.

DROP POLICY IF EXISTS documentos_duplicidade_auditoria_admin_select
  ON public.documentos_duplicidade_auditoria;
CREATE POLICY documentos_duplicidade_auditoria_admin_select
ON public.documentos_duplicidade_auditoria
FOR SELECT TO authenticated
USING (
  public.topac_has_any_role(
    ARRAY['admin','diretor_geral'],
    (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS protocolos_documentos_roles_select
  ON public.protocolos_documentos;
CREATE POLICY protocolos_documentos_roles_select
ON public.protocolos_documentos
FOR SELECT TO authenticated
USING (
  public.topac_has_any_role(
    ARRAY['admin','diretor_geral','operacional'],
    (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS protocolos_documentos_roles_insert
  ON public.protocolos_documentos;
CREATE POLICY protocolos_documentos_roles_insert
ON public.protocolos_documentos
FOR INSERT TO authenticated
WITH CHECK (
  public.topac_has_any_role(
    ARRAY['admin','diretor_geral','operacional'],
    (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS protocolos_documentos_roles_update
  ON public.protocolos_documentos;
CREATE POLICY protocolos_documentos_roles_update
ON public.protocolos_documentos
FOR UPDATE TO authenticated
USING (
  public.topac_has_any_role(
    ARRAY['admin','diretor_geral','operacional'],
    (SELECT auth.uid())
  )
)
WITH CHECK (
  public.topac_has_any_role(
    ARRAY['admin','diretor_geral','operacional'],
    (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS protocolos_documentos_admin_delete
  ON public.protocolos_documentos;
CREATE POLICY protocolos_documentos_admin_delete
ON public.protocolos_documentos
FOR DELETE TO authenticated
USING (
  public.topac_has_any_role(
    ARRAY['admin','diretor_geral'],
    (SELECT auth.uid())
  )
);
