
-- ===== Tornar buckets sensíveis privados =====
UPDATE storage.buckets SET public = false WHERE id IN (
  'documentos-funcionarios','ferias-avisos','atestados','faturamento-docs',
  'ponto-selfies','km-fotos','abastecimento-fotos','galao-fotos','documentos-ativos'
);

-- ===== Remover SELECT públicas (anon/public) =====
DROP POLICY IF EXISTS "Anyone can view documentos" ON storage.objects;
DROP POLICY IF EXISTS "Atestados publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Public read ferias-avisos" ON storage.objects;
DROP POLICY IF EXISTS "Public read faturamento-docs" ON storage.objects;
DROP POLICY IF EXISTS "Selfies são públicas para visualização" ON storage.objects;
DROP POLICY IF EXISTS "Public can view km fotos" ON storage.objects;
DROP POLICY IF EXISTS "Abastecimento fotos publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Galao fotos public read" ON storage.objects;

-- ===== Política SELECT autenticada para signed URL nos buckets sensíveis =====
DROP POLICY IF EXISTS "Auth read sensitive buckets" ON storage.objects;
CREATE POLICY "Auth read sensitive buckets" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (
      'documentos-funcionarios','ferias-avisos','atestados','faturamento-docs',
      'ponto-selfies','km-fotos','abastecimento-fotos','galao-fotos','documentos-ativos'
    )
  );
