import { getServiceClient, PAYROLL_BUCKET, sendJson } from '../src/server/payrollServer.js';

const TOKEN = 'topac-reset-storage-20260824-5d9f31aa';

export default async function handler(req: any, res?: any) {
  if (req?.method !== 'GET') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  const token = String(req?.query?.token || '');
  if (token !== TOKEN) return sendJson(res, { ok: false, error: 'forbidden' }, 403);

  try {
    const service = getServiceClient();
    const files: string[] = [];

    const walk = async (prefix = ''): Promise<void> => {
      let offset = 0;
      while (true) {
        const { data, error } = await service.storage.from(PAYROLL_BUCKET).list(prefix, {
          limit: 100,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (error) throw error;
        if (!data?.length) break;
        for (const item of data) {
          const path = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id) files.push(path);
          else await walk(path);
        }
        if (data.length < 100) break;
        offset += data.length;
      }
    };

    await walk();
    let deleted = 0;
    for (let i = 0; i < files.length; i += 100) {
      const batch = files.slice(i, i + 100);
      const { error } = await service.storage.from(PAYROLL_BUCKET).remove(batch);
      if (error) throw error;
      deleted += batch.length;
    }

    return sendJson(res, { ok: true, found: files.length, deleted });
  } catch (error: any) {
    return sendJson(res, { ok: false, error: error?.message || String(error) }, 500);
  }
}
