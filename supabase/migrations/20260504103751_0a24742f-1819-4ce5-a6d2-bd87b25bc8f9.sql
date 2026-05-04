DROP POLICY IF EXISTS "Authenticated upload abastecimento fotos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload galao fotos" ON storage.objects;

CREATE POLICY "Self upload abastecimento fotos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'abastecimento-fotos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "Self upload galao fotos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'galao-fotos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );