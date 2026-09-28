import { requireAdmin, sendJson } from '../src/server/payrollServer.js';

export default async function handler(req: any, res?: any) {
  if (!['GET', 'POST'].includes(String(req?.method || 'GET').toUpperCase())) {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    await requireAdmin(req);
    return sendJson(res, {
      ok: true,
      mode: 'INTELLIGENT_EMAIL_CENTER_V1',
      processed: 0,
      message: 'A Central classifica e organiza e-mails de RH em modo somente leitura. Ela pode sugerir contexto de empresa/funcionário por correspondência segura, mas não importa nem altera automaticamente folha, pré-cadastro ou assinatura digital.',
    });
  } catch (error: any) {
    console.error('[accounting-email-process]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
