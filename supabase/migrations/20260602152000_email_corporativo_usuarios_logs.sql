ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_corporativo text DEFAULT '';

CREATE TABLE IF NOT EXISTS public.user_email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email_corporativo text NOT NULL DEFAULT '',
  provider_type text NOT NULL DEFAULT 'global',
  smtp_user text NOT NULL DEFAULT '',
  smtp_pass_encrypted text,
  smtp_pass_configured boolean NOT NULL DEFAULT false,
  oauth_provider text,
  oauth_status text NOT NULL DEFAULT 'nao_configurado',
  modulos text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_email_settings_provider_check
    CHECK (provider_type IN ('global', 'smtp_individual', 'oauth_microsoft', 'oauth_google'))
);

CREATE INDEX IF NOT EXISTS idx_user_email_settings_user_id
  ON public.user_email_settings(user_id);

ALTER TABLE public.user_email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage user email settings" ON public.user_email_settings;
CREATE POLICY "Admins can manage user email settings"
  ON public.user_email_settings
  FOR ALL
  USING (public._topac_admin_usuario_autorizado())
  WITH CHECK (public._topac_admin_usuario_autorizado());

DROP POLICY IF EXISTS "Users can view own email settings" ON public.user_email_settings;
CREATE POLICY "Users can view own email settings"
  ON public.user_email_settings
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own email settings" ON public.user_email_settings;
CREATE POLICY "Users can update own email settings"
  ON public.user_email_settings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.email_envios_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  usuario_nome text,
  email_corporativo_usado text,
  email_remetente text,
  reply_to text,
  provider text,
  modulo_origem text,
  documento_id uuid,
  documento_nome text,
  destinatarios text,
  cc text,
  assunto text,
  status text NOT NULL DEFAULT 'enviado',
  erro text,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_envios_log_user_id
  ON public.email_envios_log(user_id);

CREATE INDEX IF NOT EXISTS idx_email_envios_log_enviado_em
  ON public.email_envios_log(enviado_em DESC);

ALTER TABLE public.email_envios_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view email send logs" ON public.email_envios_log;
CREATE POLICY "Admins can view email send logs"
  ON public.email_envios_log
  FOR SELECT
  USING (public._topac_admin_usuario_autorizado());

DROP POLICY IF EXISTS "Users can view own email send logs" ON public.email_envios_log;
CREATE POLICY "Users can view own email send logs"
  ON public.email_envios_log
  FOR SELECT
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.user_email_settings TO authenticated;
GRANT SELECT ON public.email_envios_log TO authenticated;
