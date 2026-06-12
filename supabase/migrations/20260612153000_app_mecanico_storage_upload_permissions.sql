CREATE OR REPLACE FUNCTION public.app_mecanico_storage_upload_permitido(
  p_bucket_id text,
  p_object_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acesso_id uuid;
  v_extension text;
BEGIN
  IF p_bucket_id NOT IN ('abastecimento-fotos', 'ponto-selfies') THEN
    RETURN false;
  END IF;

  BEGIN
    v_acesso_id := split_part(COALESCE(p_object_name, ''), '/', 1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  v_extension := lower(COALESCE(storage.extension(p_object_name), ''));
  IF p_bucket_id = 'ponto-selfies' AND v_extension NOT IN ('jpg', 'jpeg', 'png', 'webp') THEN
    RETURN false;
  END IF;
  IF p_bucket_id = 'abastecimento-fotos' AND v_extension NOT IN ('jpg', 'jpeg', 'png', 'webp', 'pdf') THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.acessos_externos acesso
     WHERE acesso.id = v_acesso_id
       AND acesso.modulo = 'mecanico'
       AND acesso.status = 'ativo'
       AND acesso.acesso_liberado = true
       AND COALESCE(acesso.ativo, true) = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.app_mecanico_storage_upload_permitido(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_mecanico_storage_upload_permitido(text, text) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone upload abastecimento-fotos" ON storage.objects;
CREATE POLICY "Mecanico upload abastecimento-fotos"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'abastecimento-fotos'
    AND public.app_mecanico_storage_upload_permitido(bucket_id, name)
  );

DROP POLICY IF EXISTS "Anyone upload ponto-selfies" ON storage.objects;
CREATE POLICY "Mecanico upload ponto-selfies"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'ponto-selfies'
    AND public.app_mecanico_storage_upload_permitido(bucket_id, name)
  );
