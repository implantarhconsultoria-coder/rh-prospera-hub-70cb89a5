import { supabase } from "@/integrations/supabase/client";

/** Upload a Blob to a public/private bucket and return the public URL (works for public buckets only). */
export async function uploadFoto(
  bucket: "ponto-selfies" | "abastecimento-fotos",
  acessoId: string,
  prefix: string,
  blob: Blob,
): Promise<string> {
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const path = `${acessoId}/${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  // Sempre tenta gerar URL assinada longa (buckets são privados)
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  return signed?.signedUrl || path;
}
