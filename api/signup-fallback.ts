import { createClient } from '@supabase/supabase-js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const parseBody = (req: any) => {
  if (typeof req?.body === 'object' && req.body !== null) return req.body;
  try {
    return JSON.parse(req?.body || '{}');
  } catch {
    return {};
  }
};

const findUserByEmail = async (supabase: ReturnType<typeof createClient>, email: string) => {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email);
};

export default async function handler(req: any, res?: any) {
  const method = req?.method || 'GET';
  const send = (body: unknown, status = 200) => {
    if (res) return res.status(status).json(body);
    return json(body, status);
  };

  if (method !== 'POST') {
    return send({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const body = parseBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const nomeCompleto = String(body.nome_completo || '').trim();
  const cpf = String(body.cpf || '').replace(/\D/g, '');
  const telefone = String(body.telefone || '').trim();
  const motivo = String(body.motivo || 'fallback_email_rate_limit');

  if (!email || !email.includes('@') || password.length < 6 || !nomeCompleto || cpf.length !== 11) {
    return send({ ok: false, error: 'dados_invalidos' }, 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return send({ ok: false, error: 'missing_service_role_env' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    let user = await findUserByEmail(supabase, email);

    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nome_completo: nomeCompleto,
          cpf,
          telefone,
          cadastro_origem: 'topac_cadastro_fallback',
          cadastro_motivo: motivo,
        },
        app_metadata: {
          topac_status: 'aguardando_liberacao',
        },
      });

      if (error) throw error;
      user = data.user;
    } else {
      await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true,
        password,
        user_metadata: {
          ...user.user_metadata,
          nome_completo: user.user_metadata?.nome_completo || nomeCompleto,
          cpf: user.user_metadata?.cpf || cpf,
          telefone: user.user_metadata?.telefone || telefone,
          cadastro_origem: user.user_metadata?.cadastro_origem || 'topac_cadastro_fallback',
          cadastro_motivo: motivo,
        },
      });
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        user_id: user.id,
        email,
        nome_completo: nomeCompleto,
        telefone,
        cpf,
        cargo: 'usuario',
      }, { onConflict: 'user_id' });

    if (profileError) throw profileError;

    await supabase.rpc('registrar_cadastro_pendente_v2', {
      p_email: email,
      p_nome: nomeCompleto,
      p_telefone: telefone,
      p_cpf: cpf,
      p_motivo: motivo,
    });

    const { data: acessoData, error: acessoError } = await supabase.rpc('topac_aplicar_acesso_por_cpf', {
      p_user_id: user.id,
      p_cpf: cpf,
      p_email: email,
      p_nome: nomeCompleto,
      p_telefone: telefone,
    });

    if (acessoError) throw acessoError;

    return send({
      ok: true,
      user_id: user.id,
      email,
      status: (acessoData as any)?.authorized ? 'aprovado_por_cpf' : 'aguardando_liberacao',
      authorized: Boolean((acessoData as any)?.authorized),
      roles: (acessoData as any)?.roles || [],
      email_confirmed_manual: true,
    });
  } catch (error: any) {
    return send({ ok: false, error: error?.message || 'fallback_signup_failed' }, 500);
  }
}
