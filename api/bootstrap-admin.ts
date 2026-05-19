import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'adm.matriz@topac.com.br';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

export default async function handler(req: any, res?: any) {
  const method = req?.method || 'GET';
  const send = (body: unknown, status = 200) => {
    if (res) return res.status(status).json(body);
    return json(body, status);
  };

  if (method === 'GET') {
    return send({
      ok: true,
      route: 'bootstrap-admin',
      has_supabase_url: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      has_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
  }

  if (method !== 'POST') {
    return send({ ok: false, error: 'method_not_allowed' }, 405);
  }

  let body: { supabase_url?: string; service_role_key?: string } = {};
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch {
    body = {};
  }

  const supabaseUrl = body.supabase_url || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = body.service_role_key || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return send({
      ok: false,
      error: 'missing_service_role_env',
      required: ['SUPABASE_URL or VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY or POST service_role_key'],
    }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: users, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) return send({ ok: false, error: listError.message }, 500);

  const user = users.users.find((item) => item.email?.toLowerCase() === ADMIN_EMAIL);
  if (!user) return send({ ok: false, error: 'admin_user_not_found', email: ADMIN_EMAIL }, 404);

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      user_id: user.id,
      nome_completo: user.user_metadata?.nome_completo || 'Administrador Matriz',
      email: ADMIN_EMAIL,
    }, { onConflict: 'user_id' });

  if (profileError) return send({ ok: false, step: 'profiles', error: profileError.message }, 500);

  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({ user_id: user.id, role: 'admin' }, { onConflict: 'user_id,role' });

  if (roleError) return send({ ok: false, step: 'user_roles', error: roleError.message }, 500);

  return send({ ok: true, email: ADMIN_EMAIL, user_id: user.id, role: 'admin' });
}
