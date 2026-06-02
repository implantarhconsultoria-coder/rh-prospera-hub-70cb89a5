-- TOPAC RH PRO - preferencias visuais e liberacao temporaria do diretor.
-- Mantem o layout atual e adiciona controle opt-in por usuario.

CREATE TABLE IF NOT EXISTS public.user_visual_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  layout_mode text NOT NULL DEFAULT 'premium',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT user_visual_preferences_layout_mode_check
    CHECK (layout_mode IN ('original', 'premium'))
);

ALTER TABLE public.user_visual_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_visual_preferences_admin_all ON public.user_visual_preferences;
CREATE POLICY user_visual_preferences_admin_all
ON public.user_visual_preferences
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS user_visual_preferences_own_select ON public.user_visual_preferences;
CREATE POLICY user_visual_preferences_own_select
ON public.user_visual_preferences
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_visual_preferences_own_insert ON public.user_visual_preferences;
CREATE POLICY user_visual_preferences_own_insert
ON public.user_visual_preferences
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_visual_preferences_own_update ON public.user_visual_preferences;
CREATE POLICY user_visual_preferences_own_update
ON public.user_visual_preferences
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.director_temporary_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  director_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modulo text NOT NULL,
  permissao text NOT NULL DEFAULT 'editar',
  expira_em timestamptz NOT NULL,
  liberado_por uuid,
  liberado_por_nome text,
  liberado_em timestamptz NOT NULL DEFAULT now(),
  motivo text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_director_temp_permissions_user
  ON public.director_temporary_permissions(director_user_id);

CREATE INDEX IF NOT EXISTS idx_director_temp_permissions_active
  ON public.director_temporary_permissions(director_user_id, modulo, permissao, expira_em)
  WHERE ativo = true;

ALTER TABLE public.director_temporary_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS director_temp_permissions_admin_all ON public.director_temporary_permissions;
CREATE POLICY director_temp_permissions_admin_all
ON public.director_temporary_permissions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS director_temp_permissions_director_select ON public.director_temporary_permissions;
CREATE POLICY director_temp_permissions_director_select
ON public.director_temporary_permissions
FOR SELECT
TO authenticated
USING (
  director_user_id = auth.uid()
  AND public.has_role(auth.uid(), 'diretor_geral'::public.app_role)
);

CREATE TABLE IF NOT EXISTS public.director_permission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_id uuid REFERENCES public.director_temporary_permissions(id) ON DELETE SET NULL,
  director_user_id uuid,
  acao text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid,
  usuario_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_director_permission_audit_director
  ON public.director_permission_audit(director_user_id, created_at DESC);

ALTER TABLE public.director_permission_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS director_permission_audit_admin_all ON public.director_permission_audit;
CREATE POLICY director_permission_audit_admin_all
ON public.director_permission_audit
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS director_permission_audit_director_select ON public.director_permission_audit;
CREATE POLICY director_permission_audit_director_select
ON public.director_permission_audit
FOR SELECT
TO authenticated
USING (
  director_user_id = auth.uid()
  AND public.has_role(auth.uid(), 'diretor_geral'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.diretor_tem_permissao_temporaria(
  _user_id uuid DEFAULT auth.uid(),
  _modulo text DEFAULT '',
  _permissao text DEFAULT 'editar'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.director_temporary_permissions p
    WHERE p.director_user_id = _user_id
      AND p.ativo = true
      AND p.expira_em > now()
      AND lower(p.modulo) = lower(COALESCE(_modulo, ''))
      AND (
        lower(p.permissao) = lower(COALESCE(_permissao, 'editar'))
        OR lower(p.permissao) = 'editar'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.diretor_pode_editar_modulo(_modulo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'diretor_geral'::public.app_role)
      AND (
        lower(COALESCE(_modulo, '')) IN ('financeiro', 'faturamento', 'contas_pagar', 'prestacao_contas')
        OR public.diretor_tem_permissao_temporaria(auth.uid(), lower(COALESCE(_modulo, '')), 'editar')
      )
    );
$$;

DROP TRIGGER IF EXISTS trg_user_visual_preferences_updated_at ON public.user_visual_preferences;
CREATE TRIGGER trg_user_visual_preferences_updated_at
BEFORE UPDATE ON public.user_visual_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_director_temp_permissions_updated_at ON public.director_temporary_permissions;
CREATE TRIGGER trg_director_temp_permissions_updated_at
BEFORE UPDATE ON public.director_temporary_permissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.user_visual_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.director_temporary_permissions TO authenticated;
GRANT SELECT, INSERT ON public.director_permission_audit TO authenticated;

NOTIFY pgrst, 'reload schema';
