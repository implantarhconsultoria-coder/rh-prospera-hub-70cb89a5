import { requireAdmin, sendJson, readBody } from '../src/server/payrollServer.js';

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  try {
    const { service } = await requireAdmin(req);
    const body = readBody(req);
    const uploadId = String(body.upload_id || '').trim();
    if (!uploadId) return sendJson(res, { ok: false, error: 'upload_id_required' }, 400);

    const { data: upload, error } = await service
      .from('contabilidade_portal_uploads')
      .select('id,storage_bucket,storage_path,arquivo_nome')
      .eq('id', uploadId)
      .maybeSingle();
    if (error || !upload) return sendJson(res, { ok: false, error: 'documento_nao_encontrado' }, 404);

    const { data: signed, error: signedError } = await service.storage
      .from(upload.storage_bucket)
      .createSignedUrl(upload.storage_path, 600);
    if (signedError || !signed?.signedUrl) throw signedError || new Error('signed_url_failed');

    return sendJson(res, { ok: true, url: signed.signedUrl, arquivo_nome: upload.arquivo_nome, expires_in: 600 });
  } catch (error: any) {
    console.error('[accounting-portal-admin-view]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
