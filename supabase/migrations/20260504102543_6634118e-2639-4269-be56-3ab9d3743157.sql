DROP POLICY IF EXISTS "Authenticated view compras_historico" ON public.compras_historico;

CREATE POLICY "Scoped view compras_historico"
ON public.compras_historico
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role) OR
  EXISTS (
    SELECT 1
    FROM public.compras c
    WHERE c.id = compras_historico.compra_id
      AND (
        c.empresa_nome = ANY (public.get_user_empresas())
        OR c.solicitante_user_id = auth.uid()
      )
  )
);