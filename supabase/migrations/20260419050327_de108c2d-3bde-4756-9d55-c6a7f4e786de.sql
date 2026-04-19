-- Bucket para selfies de ponto
INSERT INTO storage.buckets (id, name, public)
VALUES ('ponto-selfies', 'ponto-selfies', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas para o bucket ponto-selfies
DROP POLICY IF EXISTS "Selfies são públicas para visualização" ON storage.objects;
CREATE POLICY "Selfies são públicas para visualização"
ON storage.objects FOR SELECT
USING (bucket_id = 'ponto-selfies');

DROP POLICY IF EXISTS "Usuários podem fazer upload de própria selfie" ON storage.objects;
CREATE POLICY "Usuários podem fazer upload de própria selfie"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ponto-selfies' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Adicionar coluna selfie_url em registros_ponto se ainda não existir
ALTER TABLE public.registros_ponto ADD COLUMN IF NOT EXISTS selfie_url TEXT;