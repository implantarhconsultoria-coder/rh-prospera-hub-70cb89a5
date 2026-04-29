import { supabase } from '@/integrations/supabase/client';

/**
 * Buckets privados — exigem signed URL para visualizar.
 * Mantém-se em sincronia com a migração que tornou os buckets privados.
 */
export const PRIVATE_BUCKETS = new Set<string>([
  'documentos-funcionarios',
  'ferias-avisos',
  'atestados',
  'faturamento-docs',
  'ponto-selfies',
  'km-fotos',
  'abastecimento-fotos',
  'galao-fotos',
  'documentos-ativos',
]);

/**
 * Devolve uma URL utilizável para o arquivo.
 * - Se o bucket é privado, gera uma signed URL (expira em `expiresIn` segundos).
 * - Se o bucket é público, devolve a URL pública padrão.
 *
 * Aceita tanto path relativo no bucket quanto uma URL completa anterior
 * (extraindo automaticamente o path para regenerar uma signed URL atualizada).
 */
export async function getFileUrl(
  bucket: string,
  pathOrUrl: string,
  expiresIn = 3600,
): Promise<string> {
  if (!pathOrUrl) return '';

  // Se já é signed URL válida e não expirou recentemente, devolve direto
  if (pathOrUrl.includes('/object/sign/') && pathOrUrl.includes('token=')) {
    return pathOrUrl;
  }

  // Extrai path se vier URL pública antiga
  let path = pathOrUrl;
  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const signMarker = `/storage/v1/object/sign/${bucket}/`;
  if (path.includes(publicMarker)) path = path.split(publicMarker)[1] || '';
  else if (path.includes(signMarker)) path = (path.split(signMarker)[1] || '').split('?')[0];

  if (!path) return pathOrUrl;

  if (PRIVATE_BUCKETS.has(bucket)) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
      console.error('Falha ao gerar signed URL', bucket, path, error);
      return '';
    }
    return data.signedUrl;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Abre o arquivo em uma nova aba — sempre via signed URL fresca para buckets privados.
 */
export async function openFile(bucket: string, pathOrUrl: string) {
  const url = await getFileUrl(bucket, pathOrUrl, 3600);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
