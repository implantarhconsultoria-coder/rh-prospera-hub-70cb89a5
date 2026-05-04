-- Enable RLS on realtime.messages (no-op if already enabled)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop prior policy if a previous attempt exists
DROP POLICY IF EXISTS "Chamados realtime: admin or owner subscribe" ON realtime.messages;

CREATE POLICY "Chamados realtime: admin or owner subscribe"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Admins receive every chamados-related event
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      realtime.topic() = 'chamados'
      OR realtime.topic() LIKE 'chamados:%'
      OR realtime.topic() LIKE 'chamados-%'
    )
  )
  OR
  -- Per-chamado topic: only the assigned tecnico or the creator
  (
    realtime.topic() LIKE 'chamados:%'
    AND EXISTS (
      SELECT 1
      FROM public.chamados c
      LEFT JOIN public.tecnicos_campo t ON t.id = c.colaborador_id
      WHERE c.id::text = split_part(realtime.topic(), ':', 2)
        AND (
          c.criado_por = auth.uid()
          OR t.user_id = auth.uid()
        )
    )
  )
);