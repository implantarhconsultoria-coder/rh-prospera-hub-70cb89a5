import { supabase } from "@/integrations/supabase/client";

/** Upload de selfie/foto. Para buckets públicos retorna URL pública; privados retorna URL assinada. */
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

  if (bucket === "abastecimento-fotos") {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  return signed?.signedUrl || path;
}
