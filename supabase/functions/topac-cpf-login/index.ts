import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.103.0';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

const allowedOrigin = (origin: string) => {
  if (!origin) return 'https://topacrh.pro';
  if (origin === 'https://topacrh.pro' || origin === 'https://www.topacrh.pro') return origin;
  if (/^https:\/\/rh-prospera-hub-70cb89a5[^/]*\.vercel\.app$/.test(origin)) return origin;
  if (/^http:\/\/localhost(?::\d+)?$/.test(origin)) return origin;
  return 'https://topacrh.pro';
};

const cors = (req: Request) => ({
  'Access-Control-Allow-Origin': allowedOrigin(req.headers.get('origin') || ''),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

const reply = (req: Request, data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...jsonHeaders, ...cors(req) },
});

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, { ok: false, message: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('topac-cpf-login: variáveis internas ausentes');
    return reply(req, { ok: false, message: 'Serviço de acesso indisponível.' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let cpf = '';
  let phoneLast4 = '';
  try {
    const body = await req.json();
    cpf = digits(body?.cpf);
    phoneLast4 = digits(body?.phoneLast4 ?? body?.celularFinal4);
  } catch {
    return reply(req, { ok: false, message: 'Dados de acesso inválidos.' }, 400);
  }

  if (cpf.length !== 11 || phoneLast4.length !== 4) {
    return reply(req, { ok: false, message: 'Informe o CPF e os 4 últimos dígitos do celular.' }, 400);
  }

  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const realIp = req.headers.get('x-real-ip')?.trim() || '';
  const ip = forwarded || realIp || 'unknown';
  const [cpfHash, ipHash] = await Promise.all([sha256(`cpf:${cpf}`), sha256(`ip:${ip}`)]);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  try {
    const [{ count: cpfFailures }, { count: ipFailures }] = await Promise.all([
      admin.from('topac_login_attempts').select('id', { count: 'exact', head: true }).eq('cpf_hash', cpfHash).eq('success', false).gte('created_at', since),
      admin.from('topac_login_attempts').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).eq('success', false).gte('created_at', since),
    ]);
    if ((cpfFailures ?? 0) >= 8 || (ipFailures ?? 0) >= 30) {
      return reply(req, { ok: false, message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, 429);
    }
  } catch (error) {
    console.error('topac-cpf-login rate-limit check', error);
  }

  const recordAttempt = async (success: boolean) => {
    const { error } = await admin.from('topac_login_attempts').insert({ cpf_hash: cpfHash, ip_hash: ipHash, success });
    if (error) console.error('topac-cpf-login attempt log', error.message);
  };

  try {
    const { data: identity, error: identityError } = await admin.rpc('topac_login_identity', {
      p_cpf: cpf,
      p_phone_last4: phoneLast4,
    });

    if (identityError) throw identityError;
    if (!identity?.ok || identity?.authorized !== true) {
      await recordAttempt(false);
      return reply(req, { ok: false, message: 'CPF, celular ou acesso não conferem.' }, 401);
    }

    let userId = identity.user_id ? String(identity.user_id) : '';
    let authEmail = '';

    if (userId) {
      const { data: existing, error } = await admin.auth.admin.getUserById(userId);
      if (error || !existing?.user?.email) throw error || new Error('Usuário autenticável sem e-mail interno.');
      authEmail = existing.user.email;
    } else {
      const accessEmail = String(identity.email || '').trim().toLowerCase();
      if (accessEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accessEmail)) {
        authEmail = accessEmail;
      } else {
        const synthetic = (await sha256(`topac-login:${cpf}`)).slice(0, 32);
        authEmail = `cpf-${synthetic}@login.topacrh.pro`;
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: authEmail,
        email_confirm: true,
        user_metadata: {
          cpf,
          nome_completo: String(identity.nome || 'Usuario TOPAC'),
          telefone: String(identity.telefone || ''),
          acesso_origem: 'cpf_phone_last4',
        },
      });

      if (createError || !created?.user?.id) {
        const { data: retryIdentity } = await admin.rpc('topac_login_identity', {
          p_cpf: cpf,
          p_phone_last4: phoneLast4,
        });
        if (!retryIdentity?.user_id) throw createError || new Error('Não foi possível preparar o usuário.');
        userId = String(retryIdentity.user_id);
        const { data: existing, error } = await admin.auth.admin.getUserById(userId);
        if (error || !existing?.user?.email) throw error || new Error('Usuário autenticável não encontrado.');
        authEmail = existing.user.email;
      } else {
        userId = created.user.id;
      }
    }

    const { data: accessResult, error: accessError } = await admin.rpc('topac_aplicar_acesso_por_cpf', {
      p_user_id: userId,
      p_cpf: cpf,
      p_email: authEmail,
      p_nome: String(identity.nome || ''),
      p_telefone: String(identity.telefone || ''),
    });

    if (accessError) throw accessError;
    if (!accessResult?.ok || accessResult?.authorized !== true || accessResult?.status !== 'aprovado') {
      await recordAttempt(false);
      return reply(req, { ok: false, message: 'Acesso ainda não liberado para este usuário.' }, 403);
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
      options: { redirectTo: 'https://topacrh.pro/' },
    });

    if (linkError) throw linkError;
    const tokenHash = linkData?.properties?.hashed_token;
    if (!tokenHash) throw new Error('Token de sessão não foi gerado.');

    await recordAttempt(true);
    await admin.from('topac_login_attempts').delete().eq('cpf_hash', cpfHash).eq('success', false);
    await admin.from('topac_login_attempts').delete().lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    return reply(req, { ok: true, token_hash: tokenHash, type: 'magiclink' });
  } catch (error) {
    console.error('topac-cpf-login', error);
    await recordAttempt(false);
    return reply(req, { ok: false, message: 'Não foi possível concluir o acesso. Tente novamente.' }, 500);
  }
});
