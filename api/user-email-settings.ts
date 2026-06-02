import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const env = (name: string) => String(process.env[name] || '').trim();

const parseBody = (req: any) => {
  if (typeof req?.body === 'object' && req.body !== null) return req.body;
  try {
    return JSON.parse(req?.body || '{}');
  } catch {
    return {};
  }
};

const getHeader = (req: any, name: string) => {
  if (typeof req?.headers?.get === 'function') return req.headers.get(name);
  return req?.headers?.[name] || req?.headers?.[name.toLowerCase()] || '';
};

const getBearerToken = (req: any) => {
  const auth = String(getHeader(req, 'authorization') || '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

const getSupabaseServer = () => {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('missing_supabase_service_env');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const cleanEmail = (value: unknown) => {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.toLowerCase() || '';
};

const allowedProvider = (value: unknown) => {
  const provider = String(value || 'global').trim();
  return ['global', 'smtp_individual', 'oauth_microsoft', 'oauth_google'].includes(provider)
    ? provider
    : 'global';
};

const uuidOrNull = (value: unknown) => {
  const text = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
};

const getEncryptionSecret = () => env('EMAIL_SETTINGS_SECRET') || env('SUPABASE_SERVICE_ROLE_KEY');

const encryptPassword = (plain: string) => {
  const secret = getEncryptionSecret();
  if (!secret) throw new Error('missing_email_settings_secret');
  const iv = randomBytes(12);
  const key = createHash('sha256').update(secret).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const providerStatus = () => {
  if (env('RESEND_API_KEY')) return { ok: true, provider: 'resend', missing: [] as string[] };
  const smtpMissing = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'].filter((key) => !env(key));
  if (smtpMissing.length === 0) return { ok: true, provider: 'smtp', missing: [] as string[] };
  if (env('SENDGRID_API_KEY')) return { ok: true, provider: 'sendgrid', missing: [] as string[] };
  return {
    ok: false,
    provider: '',
    missing: ['RESEND_API_KEY', 'EMAIL_FROM'],
  };
};

const send = (res: any, body: unknown, status = 200) => {
  if (res) return res.status(status).json(body);
  return json(body, status);
};

export default async function handler(req: any, res?: any) {
  const method = req?.method || 'GET';
  if (method !== 'POST') {
    return send(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const supabase = getSupabaseServer();
    const token = getBearerToken(req);
    const { data: authData, error: authError } = token
      ? await supabase.auth.getUser(token)
      : { data: null, error: new Error('missing_token') as any };

    const requesterId = authData?.user?.id;
    if (authError || !requesterId) {
      return send(res, { ok: false, error: 'nao_autenticado', message: 'Faca login novamente para salvar o e-mail corporativo.' }, 401);
    }

    const body = parseBody(req);
    const action = String(body.action || 'save');
    const targetUserId = uuidOrNull(body.userId) || requesterId;

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', requesterId);

    const isAdmin = (roles || []).some((r: any) => String(r.role) === 'admin' || String(r.role) === 'diretor_geral');
    if (targetUserId !== requesterId && !isAdmin) {
      return send(res, { ok: false, error: 'nao_autorizado', message: 'Voce nao tem permissao para alterar o e-mail deste usuario.' }, 403);
    }

    if (action === 'test') {
      const [{ data: profile }, { data: settings }] = await Promise.all([
        supabase.from('profiles').select('email,email_corporativo,nome_completo').eq('user_id', targetUserId).maybeSingle(),
        supabase.from('user_email_settings').select('*').eq('user_id', targetUserId).maybeSingle(),
      ]);
      const corporateEmail = cleanEmail((settings as any)?.email_corporativo || (profile as any)?.email_corporativo || (profile as any)?.email);
      if (!corporateEmail) {
        return send(res, { ok: false, error: 'email_corporativo_vazio', message: 'Informe o e-mail corporativo vinculado antes de testar.' }, 400);
      }

      const providerType = String((settings as any)?.provider_type || 'global');
      if (providerType.startsWith('oauth_')) {
        return send(res, {
          ok: false,
          error: 'oauth_nao_conectado',
          message: 'OAuth esta preparado na estrutura, mas a conta ainda nao foi conectada.',
        }, 400);
      }

      if (providerType === 'smtp_individual') {
        const smtpMissing = ['SMTP_HOST', 'SMTP_PORT'].filter((key) => !env(key));
        const hasCredential = Boolean((settings as any)?.smtp_user && (settings as any)?.smtp_pass_configured);
        if (smtpMissing.length || !hasCredential) {
          return send(res, {
            ok: false,
            error: 'smtp_individual_incompleto',
            message: `Configure SMTP_HOST/SMTP_PORT no servidor e usuario/senha do e-mail ${corporateEmail}.`,
            missing: smtpMissing,
          }, 400);
        }
        return send(res, {
          ok: true,
          provider: 'smtp_individual',
          email: corporateEmail,
          message: `Configuracao individual pronta para ${corporateEmail}.`,
        });
      }

      const status = providerStatus();
      if (!status.ok) {
        return send(res, {
          ok: false,
          error: 'missing_email_provider_env',
          message: 'Envio global ainda nao esta configurado no servidor.',
          missing: status.missing,
        }, 501);
      }

      return send(res, {
        ok: true,
        provider: status.provider,
        email: corporateEmail,
        message: `E-mail corporativo ${corporateEmail} pronto para envio via ${status.provider}.`,
      });
    }

    const emailCorporativo = cleanEmail(body.emailCorporativo || body.email_corporativo);
    if (!emailCorporativo) {
      return send(res, { ok: false, error: 'email_invalido', message: 'Informe um e-mail corporativo valido.' }, 400);
    }

    const providerType = allowedProvider(body.providerType);
    const smtpUser = providerType === 'smtp_individual' ? String(body.smtpUser || emailCorporativo).trim() : '';
    const password = String(body.smtpAppPassword || '');
    const clearPassword = Boolean(body.clearPassword);
    const payload: Record<string, unknown> = {
      user_id: targetUserId,
      email_corporativo: emailCorporativo,
      provider_type: providerType,
      smtp_user: smtpUser,
      oauth_provider: providerType.startsWith('oauth_') ? providerType.replace('oauth_', '') : null,
      oauth_status: providerType.startsWith('oauth_') ? 'nao_conectado' : 'nao_configurado',
      modulos: Array.isArray(body.modulos) ? body.modulos.map(String) : [],
      updated_at: new Date().toISOString(),
    };

    if (password) {
      payload.smtp_pass_encrypted = encryptPassword(password);
      payload.smtp_pass_configured = true;
    } else if (clearPassword) {
      payload.smtp_pass_encrypted = null;
      payload.smtp_pass_configured = false;
    }

    const { error: upsertError } = await supabase
      .from('user_email_settings')
      .upsert(payload, { onConflict: 'user_id' });
    if (upsertError) throw upsertError;

    await supabase
      .from('profiles')
      .update({ email_corporativo: emailCorporativo } as any)
      .eq('user_id', targetUserId);

    return send(res, {
      ok: true,
      email_corporativo: emailCorporativo,
      smtp_pass_configured: Boolean(password) || Boolean(body.smtpPassConfigured),
      message: 'E-mail corporativo vinculado ao usuario.',
    });
  } catch (error: any) {
    return send(res, {
      ok: false,
      error: error?.message || 'email_settings_failed',
      message: error?.message === 'missing_supabase_service_env'
        ? 'Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.'
        : 'Nao foi possivel salvar/testar o e-mail corporativo agora.',
    }, 500);
  }
}
