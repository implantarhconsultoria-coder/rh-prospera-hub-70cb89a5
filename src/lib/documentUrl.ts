import { supabase } from '@/integrations/supabase/client';

/**
 * Buckets conhecidos do projeto. A ordem dentro de cada categoria
 * define a sequência de tentativa quando o caminho original falhar.
 */
export const KNOWN_BUCKETS = [
  'documentos-funcionarios',
  'documentos-ativos',
  'atestados',
  'ferias-avisos',
  'ponto-selfies',
  'galao-fotos',
  'km-fotos',
  'faturamento-docs',
] as const;

/**
 * Mapeia tipo de documento → buckets candidatos (em ordem de prioridade).
 */
const TYPE_BUCKET_MAP: Record<string, string[]> = {
  funcionario: ['documentos-funcionarios', 'documentos-ativos'],
  atestado: ['atestados', 'documentos-funcionarios'],
  ferias: ['ferias-avisos', 'documentos-funcionarios'],
  veiculo: ['documentos-ativos'],
  ativo: ['documentos-ativos'],
  protocolo: ['documentos-ativos'],
  ponto: ['ponto-selfies'],
  abastecimento: ['galao-fotos'],
  km: ['km-fotos'],
  faturamento: ['faturamento-docs'],
};

const SIGNED_TTL_SECONDS = 60 * 60; // 1h

export interface DocumentSource {
  url?: string | null;          // pode ser https público, signed, ou caminho
  bucket?: string | null;       // bucket explícito
  path?: string | null;         // caminho dentro do bucket
  storage_path?: string | null; // alias
  file_path?: string | null;    // alias
  arquivo_url?: string | null;  // alias usado no schema do projeto
  tipo?: string | null;         // dica de tipo p/ resolver bucket alternativo
}

/** Detecta {bucket, path} a partir de uma URL completa do Supabase Storage. */
const parseSupabaseStorageUrl = (raw: string): { bucket: string; path: string } | null => {
  if (!raw) return null;
  // Aceita /object/public/<bucket>/<path>, /object/sign/<bucket>/<path>, /object/authenticated/<bucket>/<path>
  const m = raw.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (m) return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  return null;
};

/** Tenta gerar uma signed URL para o bucket/path informado. */
const trySignedUrl = async (bucket: string, path: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
};

/** Verifica se uma URL retorna 200 (HEAD). Falhas silenciosas → false. */
const headOk = async (url: string): Promise<boolean> => {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
};

/**
 * Resolve uma URL final, válida e acessível, para visualizar/baixar/imprimir
 * um documento, lidando com:
 *  - URL pública completa
 *  - URL assinada já existente
 *  - Bucket privado (gera signed URL)
 *  - Apenas caminho salvo no banco (sem bucket) → tenta buckets candidatos
 *  - URL antiga apontando p/ bucket trocado → tenta o bucket correto pelo tipo
 *
 * Retorna null quando nenhuma combinação funciona.
 */
export const getDocumentUrl = async (src: DocumentSource | string | null | undefined): Promise<string | null> => {
  if (!src) return null;
  const input: DocumentSource = typeof src === 'string' ? { url: src } : src;

  const rawUrl = input.url || input.arquivo_url || '';
  const explicitBucket = input.bucket || undefined;
  const explicitPath = input.path || input.storage_path || input.file_path || undefined;
  const tipo = (input.tipo || '').toLowerCase();

  // 1) URL absoluta: tenta como está; se 403/404 e for de storage, tenta signed.
  if (rawUrl && /^https?:\/\//i.test(rawUrl)) {
    if (await headOk(rawUrl)) return rawUrl;
    const parsed = parseSupabaseStorageUrl(rawUrl);
    if (parsed) {
      const signed = await trySignedUrl(parsed.bucket, parsed.path);
      if (signed) return signed;
      // Tenta buckets candidatos pelo tipo
      const candidates = TYPE_BUCKET_MAP[tipo] || KNOWN_BUCKETS;
      for (const b of candidates) {
        if (b === parsed.bucket) continue;
        const s = await trySignedUrl(b, parsed.path);
        if (s) return s;
      }
    }
    return null;
  }

  // 2) Bucket + path explícitos
  if (explicitBucket && explicitPath) {
    const signed = await trySignedUrl(explicitBucket, explicitPath);
    if (signed) return signed;
  }

  // 3) Apenas path: tenta buckets candidatos pelo tipo, depois todos
  const path = explicitPath || rawUrl; // rawUrl pode ser caminho relativo
  if (path) {
    const candidates = [
      ...(explicitBucket ? [explicitBucket] : []),
      ...(TYPE_BUCKET_MAP[tipo] || []),
      ...KNOWN_BUCKETS,
    ];
    const seen = new Set<string>();
    for (const b of candidates) {
      if (seen.has(b)) continue;
      seen.add(b);
      const s = await trySignedUrl(b, path);
      if (s) return s;
    }
  }

  return null;
};

/** Faz download de um documento forçando salvar (sem abrir nova aba branca). */
export const downloadDocument = async (
  src: DocumentSource | string | null | undefined,
  filename = 'documento.pdf',
): Promise<boolean> => {
  const url = await getDocumentUrl(src);
  if (!url) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 5_000);
    return true;
  } catch {
    return false;
  }
};

/** Abre o documento em nova aba (após resolver para URL válida). */
export const openDocumentInNewTab = async (
  src: DocumentSource | string | null | undefined,
): Promise<boolean> => {
  const url = await getDocumentUrl(src);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
};
