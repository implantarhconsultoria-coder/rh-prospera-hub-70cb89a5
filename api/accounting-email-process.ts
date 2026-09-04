import { getServiceClient, readBody, requireAdmin, sendJson } from '../src/server/payrollServer.js';
import { processAccountingDocument, processAccountingQueue } from '../src/server/accountingCentralProcessor.js';

const authorize = async (req: any) => {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authorization = String(req?.headers?.authorization || '');
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return { service: getServiceClient(), user: null as any, mode: 'CRON' };
  const admin = await requireAdmin(req);
  return { ...admin, mode: 'ADMIN' };
};

export default async function handler(req: any, res?: any) {
  if (!['GET', 'POST'].includes(String(req?.method || 'GET').toUpperCase())) return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  try {
    const { service, user, mode } = await authorize(req);
    const body = readBody(req);
    const action = String(body.action || (req?.method === 'GET' ? 'process-queue' : 'process-queue'));

    if (action === 'reprocess-document') {
      const documentId = String(body.document_id || '').trim();
      if (!documentId) return sendJson(res, { ok: false, error: 'document_id_required' }, 400);
      const result = await processAccountingDocument(service, documentId, user?.id || null);
      return sendJson(res, { ok: true, mode, result });
    }

    if (action === 'process-queue') {
      const limit = Number(body.limit || req?.query?.limit || 4);
      const results = await processAccountingQueue(service, limit, user?.id || null);
      return sendJson(res, { ok: true, mode, processed: results.length, results });
    }

    return sendJson(res, { ok: false, error: 'unknown_action' }, 400);
  } catch (error: any) {
    console.error('[accounting-email-process]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
