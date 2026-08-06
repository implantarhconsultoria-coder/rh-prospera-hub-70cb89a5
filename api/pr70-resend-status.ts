const sendJson = (res: any, status: number, body: unknown) => {
  if (res?.status) return res.status(status).json(body);
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};

export default async function handler(req: any, res?: any) {
  if ((req?.method || 'GET') !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  const url = new URL(req?.url || 'https://local.invalid');
  const id = String(req?.query?.id || url.searchParams.get('id') || '').trim();
  if (!id) return sendJson(res, 400, { ok: false, error: 'missing_id' });
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return sendJson(res, 501, { ok: false, error: 'missing_resend_api_key' });

  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  return sendJson(res, response.status, { ok: response.ok, data });
}
