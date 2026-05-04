DROP POLICY IF EXISTS "Auth read sensitive buckets" ON storage.objects;

-- Admin: read all sensitive buckets
CREATE POLICY "Admin read sensitive buckets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND bucket_id = ANY (ARRAY[
      'documentos-funcionarios','ferias-avisos','atestados','faturamento-docs',
      'ponto-selfies','km-fotos','abastecimento-fotos','galao-fotos','documentos-ativos'
    ])
  );

-- Filial: read files of own empresa (folder layout: <empresa_nome>/...)
CREATE POLICY "Filial read company-scoped buckets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = ANY (ARRAY[
      'documentos-funcionarios','ferias-avisos','atestados','faturamento-docs','documentos-ativos'
    ])
    AND (storage.foldername(name))[1] = ANY (public.get_user_empresas())
  );

-- Self-folder buckets: only the owning user (folder layout: <auth.uid()>/...)
CREATE POLICY "Self read own selfies/km/abast/galao"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = ANY (ARRAY['ponto-selfies','km-fotos','abastecimento-fotos','galao-fotos'])
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );