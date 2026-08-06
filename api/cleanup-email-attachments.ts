import { createClient } from '@supabase/supabase-js';

const BUCKET = 'email-anexos-temporarios';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_FILES_PER_RUN = 5000;

const env = (name: string) => String(process.env[name] || '').trim();
const sendJson = (res: any, status: number, body: unknown) => res.status(status).json(body);

const isAuthorizedCron = (req: any) => {
  const secret = env('CRON_SECRET');
  const authorization = String(req?.headers?.authorization || '');
  const userAgent = String(req?.headers?.['user-agent'] || '').toLowerCase();
  return Boolean((secret && authorization === `Bearer ${secret}`) || userAgent.startsWith('vercel-cron/'));
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!isAuthorizedCron(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceRole = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRole) return sendJson(res, 501, { ok: false, error: 'storage_not_configured' });

  const supabase = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const storage = supabase.storage.from(BUCKET);
  const cutoff = Date.now() - MAX_AGE_MS;
  const stalePaths: string[] = [];
  const scanErrors: string[] = [];

  const walk = async (prefix = '', depth = 0): Promise<void> => {
    if (depth > 4 || stalePaths.length >= MAX_FILES_PER_RUN) return;
    let offset = 0;
    while (stalePaths.length < MAX_FILES_PER_RUN) {
      const { data, error } = await storage.list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) {
        scanErrors.push(`${prefix || '/'}: ${error.message}`);
        return;
      }
      const entries = data || [];
      for (const entry of entries as any[]) {
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const isFolder = !entry.id && !entry.metadata;
        if (isFolder) await walk(fullPath, depth + 1);
        else {
          const timestamp = Date.parse(entry.updated_at || entry.created_at || '');
          if (Number.isFinite(timestamp) && timestamp < cutoff) stalePaths.push(fullPath);
        }
        if (stalePaths.length >= MAX_FILES_PER_RUN) break;
      }
      if (entries.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  };

  await walk();
  const removed: string[] = [];
  const removeErrors: string[] = [];
  for (let index = 0; index < stalePaths.length; index += 100) {
    const batch = stalePaths.slice(index, index + 100);
    const { error } = await storage.remove(batch);
    if (error) removeErrors.push(error.message);
    else removed.push(...batch);
  }

  const ok = scanErrors.length === 0 && removeErrors.length === 0;
  console.log('EMAIL_ATTACHMENT_EXPIRY_SWEEP', JSON.stringify({ ok, scannedStale: stalePaths.length, removed: removed.length, scanErrors, removeErrors }));
  return sendJson(res, ok ? 200 : 500, { ok, staleFound: stalePaths.length, removed: removed.length, scanErrors, removeErrors });
}
