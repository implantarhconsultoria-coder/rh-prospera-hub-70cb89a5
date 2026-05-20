-- TOPAC RH PRO - correcao critica de persistencia/mobile/ponto
-- Rodar no SQL Editor do Supabase de producao.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Buckets usados pelo mobile e pelos anexos operacionais.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('ponto-selfies', 'ponto-selfies', false),
  ('abastecimento-fotos', 'abastecimento-fotos', true),
  ('documentos-ativos', 'documentos-ativos', true),
  ('documentos-funcionarios', 'documentos-funcionarios', true),
  ('atestados', 'atestados', true),
  ('galao-fotos', 'galao-fotos', true),
  ('km-fotos', 'km-fotos', true),
  ('dn4-imports', 'dn4-imports', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "topac_mobile_upload_storage" ON storage.objects;
CREATE POLICY "topac_mobile_upload_storage" ON storage.objects
FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id IN (
    'ponto-selfies',
    'abastecimento-fotos',
    'documentos-ativos',
    'documentos-funcionarios',
    'atestados',
    'galao-fotos',
    'km-fotos',
    'dn4-imports'
  )
);

DROP POLICY IF EXISTS "topac_public_read_storage" ON storage.objects;
CREATE POLICY "topac_public_read_storage" ON storage.objects
FOR SELECT TO anon, authenticated
USING (
  bucket_id IN (
    'abastecimento-fotos',
    'documentos-ativos',
    'documentos-funcionarios',
    'atestados',
    'galao-fotos',
    'km-fotos',
    'dn4-imports'
  )
);

DROP POLICY IF EXISTS "topac_admin_read_private_storage" ON storage.objects;
CREATE POLICY "topac_admin_read_private_storage" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'ponto-selfies'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "topac_update_storage" ON storage.objects;
CREATE POLICY "topac_update_storage" ON storage.objects
FOR UPDATE TO anon, authenticated
USING (
  bucket_id IN (
    'ponto-selfies',
    'abastecimento-fotos',
    'documentos-ativos',
    'documentos-funcionarios',
    'atestados',
    'galao-fotos',
    'km-fotos',
    'dn4-imports'
  )
)
WITH CHECK (
  bucket_id IN (
    'ponto-selfies',
    'abastecimento-fotos',
    'documentos-ativos',
    'documentos-funcionarios',
    'atestados',
    'galao-fotos',
    'km-fotos',
    'dn4-imports'
  )
);

-- Compatibilidade do ponto do app mecanico com acesso externo/PIN.
CREATE TABLE IF NOT EXISTS public.registros_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  tipo text NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  hora time NOT NULL DEFAULT CURRENT_TIME,
  latitude double precision,
  longitude double precision,
  endereco_formatado text DEFAULT '',
  veiculo_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.registros_ponto ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.registros_ponto
  ADD COLUMN IF NOT EXISTS acesso_externo_id uuid,
  ADD COLUMN IF NOT EXISTS mecanico_nome text,
  ADD COLUMN IF NOT EXISTS empresa text,
  ADD COLUMN IF NOT EXISTS filial text,
  ADD COLUMN IF NOT EXISTS dispositivo text,
  ADD COLUMN IF NOT EXISTS selfie_url text;

ALTER TABLE public.registros_ponto ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registros_ponto_acesso
  ON public.registros_ponto(acesso_externo_id);

CREATE INDEX IF NOT EXISTS idx_registros_ponto_data_acesso
  ON public.registros_ponto(data, acesso_externo_id);

DROP POLICY IF EXISTS "topac_mecanico_insert_ponto_externo" ON public.registros_ponto;
CREATE POLICY "topac_mecanico_insert_ponto_externo" ON public.registros_ponto
FOR INSERT TO anon, authenticated
WITH CHECK (acesso_externo_id IS NOT NULL);

DROP POLICY IF EXISTS "topac_admin_select_ponto" ON public.registros_ponto;
CREATE POLICY "topac_admin_select_ponto" ON public.registros_ponto
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operacional'::public.app_role)
);

DROP FUNCTION IF EXISTS public.app_mecanico_registrar_ponto(uuid, text, double precision, double precision, text);
DROP FUNCTION IF EXISTS public.app_mecanico_registrar_ponto(uuid, text, double precision, double precision, text, text, text);

CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_ponto(
  p_acesso_id uuid,
  p_tipo text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_selfie_url text DEFAULT NULL,
  p_dispositivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acesso public.acessos_externos;
  v_tipo text;
  v_id uuid;
BEGIN
  SELECT *
  INTO v_acesso
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND status = 'ativo'
    AND acesso_liberado = true
  LIMIT 1;

  IF v_acesso.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END IF;

  v_tipo := lower(trim(coalesce(p_tipo, '')));
  IF v_tipo = 'pausa_inicio' THEN
    v_tipo := 'almoco_inicio';
  ELSIF v_tipo = 'pausa_fim' THEN
    v_tipo := 'almoco_fim';
  END IF;

  IF v_tipo NOT IN ('entrada', 'saida', 'almoco_inicio', 'almoco_fim') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  END IF;

  INSERT INTO public.registros_ponto(
    user_id,
    tipo,
    data,
    hora,
    latitude,
    longitude,
    endereco_formatado,
    selfie_url,
    acesso_externo_id,
    mecanico_nome,
    empresa,
    filial,
    dispositivo
  ) VALUES (
    v_acesso.profile_user_id,
    v_tipo,
    CURRENT_DATE,
    CURRENT_TIME,
    p_latitude,
    p_longitude,
    p_endereco,
    p_selfie_url,
    v_acesso.id,
    v_acesso.nome,
    v_acesso.empresa,
    v_acesso.filial,
    p_dispositivo
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'tipo', v_tipo);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_status_dia(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acesso public.acessos_externos;
  v_qtd int;
  v_ultimo text;
BEGIN
  SELECT *
  INTO v_acesso
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND status = 'ativo'
    AND acesso_liberado = true
  LIMIT 1;

  IF v_acesso.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END IF;

  SELECT COUNT(*)
  INTO v_qtd
  FROM public.registros_ponto
  WHERE acesso_externo_id = v_acesso.id
    AND data = CURRENT_DATE;

  SELECT tipo
  INTO v_ultimo
  FROM public.registros_ponto
  WHERE acesso_externo_id = v_acesso.id
    AND data = CURRENT_DATE
  ORDER BY hora DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'batidas_hoje', coalesce(v_qtd, 0),
    'ultimo_tipo', coalesce(v_ultimo, '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_ponto(uuid, text, double precision, double precision, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_status_dia(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
