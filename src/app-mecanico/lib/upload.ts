import { supabase } from "@/integrations/supabase/client";

type UploadBucket = "ponto-selfies" | "abastecimento-fotos";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const RETRY_DELAYS_MS = [0, 900, 2200] as const;

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

const esperar = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isRetryable = (message: string) => {
  const normalized = message.toLowerCase();
  return [
    "network",
    "fetch",
    "timeout",
    "timed out",
    "connection",
    "socket",
    "503",
    "502",
    "504",
  ].some((item) => normalized.includes(item));
};

/** Upload de selfie/foto. Para buckets públicos retorna URL pública; privados retorna URL assinada quando possível. */
export async function uploadFoto(
  bucket: UploadBucket,
  acessoId: string,
  prefix: string,
  blob: Blob,
): Promise<string> {
  if (!blob || blob.size === 0) throw new Error("Arquivo vazio. Tire a foto novamente.");
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("A foto ficou muito grande. Tire novamente para o app reduzir o arquivo.");
  if (!acessoId) throw new Error("Acesso do mecânico não encontrado. Entre novamente pelo PIN.");

  const ext = getExt(blob);
  const safeAcessoId = limparPartePath(acessoId);
  const safePrefix = limparPartePath(prefix);
  const path = `${safeAcessoId}/${safePrefix}-${Date.now()}.${ext}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (RETRY_DELAYS_MS[attempt] > 0) await esperar(RETRY_DELAYS_MS[attempt]);
    try {
      const { error } = await supabase.storage.from(bucket).upload(path, blob, {
        contentType: blob.type || (ext === "pdf" ? "application/pdf" : "image/jpeg"),
        cacheControl: "0",
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

      if (signedError) {
        console.warn("Selfie enviada, mas URL assinada não foi gerada. Salvando caminho privado.", signedError);
        return path;
      }

      return signed?.signedUrl || path;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error || "");
      console.error("Erro no upload do app mecânico:", { bucket, path, attempt: attempt + 1, error });
      if (!isRetryable(message) || attempt === RETRY_DELAYS_MS.length - 1) break;
    }
  }

  throw new Error(mensagemUpload(bucket, lastError instanceof Error ? lastError.message : undefined));
}
