import { requireAdmin, sendJson } from '../src/server/payrollServer.js';

export default async function handler(req: any, res?: any) {
  if (!['GET', 'POST'].includes(String(req?.method || 'GET').toUpperCase())) {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    await requireAdmin(req);
    return sendJson(res, {
      ok: true,
      mode: 'PDF_COLLECTOR_ONLY',
      processed: 0,
      message: 'A Central da Contabilidade funciona somente como coletor de PDFs recebidos por e-mail. Nenhum documento é vinculado automaticamente a funcionário, pré-cadastro, folha ou assinatura digital.',
    });
  } catch (error: any) {
    console.error('[accounting-email-process]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
