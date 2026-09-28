import { createClient } from '@supabase/supabase-js';

const send = (res: any, body: unknown, status = 200) => {
  if (res) return res.status(status).json(body);
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};

const parseBody = (req: any) => {
  if (!req?.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
};

const enviarEmail = async (destino: string, nome: string, codigo: string) => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) throw new Error('RESEND_API_KEY não configurada.');

  const from = String(process.env.EMAIL_FROM || 'TOPAC RH PRO <no-reply@topacrh.pro>').trim();
  const replyTo = String(process.env.EMAIL_REPLY_TO || 'adm.matriz@topac.com.br').trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [destino],
      reply_to: replyTo,
      subject: 'TOPAC RH PRO — Código de Operador',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717">
          <h2 style="margin-bottom:8px">Código de Operador</h2>
          <p>Olá, ${nome || 'Operador'}.</p>
          <p>Este é o seu código individual para confirmar operações no TOPAC RH PRO:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:18px 20px;border:1px solid #ddd;border-radius:12px;text-align:center">${codigo}</div>
          <p style="font-size:13px;color:#666">O código é pessoal. Não compartilhe. Se um novo código for emitido, o anterior deixa de funcionar.</p>
        </div>`,
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Falha no envio do e-mail (${response.status}): ${text.slice(0, 240)}`);
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') {
    return send(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  const authorization = String(req?.headers?.authorization || req?.headers?.Authorization || '').trim();
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return send(res, { ok: false, error: 'authorization_required' }, 401);
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!supabaseUrl || !anonKey) {
    return send(res, { ok: false, error: 'supabase_env_missing' }, 500);
  }

  const body = parseBody(req) as { operador_id?: string };
  if (!body.operador_id) return send(res, { ok: false, error: 'operador_id_required' }, 400);

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });

  const { data, error } = await client.rpc('operador_operacao_emitir_codigo', { p_operador_id: body.operador_id });
  if (error || !data?.ok) {
    return send(res, { ok: false, error: data?.error || error?.message || 'codigo_nao_emitido' }, 403);
  }

  const email = String(data.email || '').trim();
  if (!email) {
    return send(res, { ok: false, error: 'operador_sem_email' }, 422);
  }

  try {
    await enviarEmail(email, String(data.nome || 'Operador'), String(data.codigo || ''));
  } catch (mailError: any) {
    return send(res, {
      ok: false,
      error: mailError?.message || 'falha_envio_email',
      codigo_gerado: true,
      codigo_hint: data.codigo_hint || null,
    }, 502);
  }

  return send(res, {
    ok: true,
    email,
    nome: data.nome || null,
    codigo_hint: data.codigo_hint || null,
    email_sent: true,
  });
}
