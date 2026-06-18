import { supabase } from "@/integrations/supabase/client";

type UploadBucket = "ponto-selfies" | "abastecimento-fotos";

const limparPartePath = (value: string) =>
  String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "arquivo";

const getExt = (blob: Blob) => {
  if (blob.type.includes("pdf")) return "pdf";
  if (blob.type.includes("png")) return "png";
  if (blob.type.includes("webp")) return "webp";
  return "jpg";
};

const mensagemUpload = (bucket: UploadBucket, message?: string) => {
  const detalhe = message ? ` Detalhe: ${message}` : "";
  if (bucket === "ponto-selfies") return `Não foi possível enviar a selfie.${detalhe}`;
  return `Não foi possível enviar a foto/comprovante de abastecimento.${detalhe}`;
};

/** Upload de selfie/foto. Para buckets públicos retorna URL pública; privados retorna URL assinada. */
export async function uploadFoto(
  bucket: UploadBucket,
  acessoId: string,
  prefix: string,
  blob: Blob,
): Promise<string> {
  if (!blob || blob.size === 0) throw new Error("Arquivo vazio. Tire a foto novamente.");
  if (!acessoId) throw new Error("Acesso do mecânico não encontrado. Entre novamente pelo PIN.");

  const ext = getExt(blob);
  const safeAcessoId = limparPartePath(acessoId);
  const safePrefix = limparPartePath(prefix);
  const path = `${safeAcessoId}/${safePrefix}-${Date.now()}.${ext}`;

  try {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: blob.type || (ext === "pdf" ? "application/pdf" : "image/jpeg"),
      upsert: false,
    });
    if (error) throw error;

    if (bucket === "abastecimento-fotos") {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      if (!data?.publicUrl) throw new Error("URL pública não retornada pelo storage.");
      return data.publicUrl;
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signedError) throw signedError;
    return signed?.signedUrl || path;
  } catch (error) {
    console.error("Erro no upload do app mecânico:", { bucket, path, error });
    throw new Error(mensagemUpload(bucket, error instanceof Error ? error.message : undefined));
  }
}
