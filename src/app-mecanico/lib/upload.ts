import { supabase } from "@/integrations/supabase/client";

/** Upload de selfie/foto para bucket privado. Retorna URL assinada de longa duração. */
export async function uploadFoto(
  bucket: "ponto-selfies",
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
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  return signed?.signedUrl || path;
}
