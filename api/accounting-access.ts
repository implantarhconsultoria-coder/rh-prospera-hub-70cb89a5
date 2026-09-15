import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getServiceClient, randomOtp, randomToken, readBody, sendJson, sha256 } from '../src/server/payrollServer.js';

const clean = (value: unknown) => String(value || '').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const emailOf = (value: unknown) => clean(value).toLowerCase();

const secret = () => clean(
  process.env.ACCOUNTING_ACCESS_PEPPER ||
  process.env.PAYROLL_TOKEN_ENCRYPTION_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const hmac = (scope: string, value: string) => {
  const key = secret();
  if (!key) throw new Error('missing_accounting_access_secret');
  return createHmac('sha256', key).update(`${scope}:${value}`).digest('hex');
};

const safeHexEqual = (a: string, b: string) => {
  try {
    const aa = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return aa.length === bb.length && timingSafeEqual(aa, bb);
  } catch { return false; }
};

const validatePortal = (raw: unknown) => {
  const portal = clean(raw).toLowerCase();
  if (!['principal', 'goiania'].includes(portal)) throw Object.assign(new Error('portal_invalido'), { status: 400 });
  return portal;
};

const createPortalSession = async (service: any, user: any) => {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 60 * 60_000);
  const { error } = await service.from('contabilidade_portal_sessoes').insert({
    usuario_id: user.id,
    token_hash: sha256(token),
    portal: user.portal,
    criado_em: now.toISOString(),
    expira_em: expires.toISOString(),
    ultimo_uso_em: now.toISOString(),
  });
  if (error) throw error;
  await service.from('contabilidade_portal_usuarios').update({
    ultimo_acesso_em: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', user.id);
  return {
    token,
    expira_em: expires.toISOString(),
    usuario: { id: user.id, nome: user.nome, email: user.email || null, portal: user.portal },
  };
};

const sendVerificationEmail = async (input: { to: string; name: string; otp: string }) => {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) throw Object.assign(new Error('email_nao_configurado'), { status: 503 });
  const configuredFrom = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM);
  const from = configuredFrom && !/@resend\.dev/i.test(configuredFrom)
    ? configuredFrom
    : 'TOPAC RH PRO <no-reply@topacrh.pro>';
  const subject = 'Código de verificação — Portal da Contabilidade';
  const text = `Olá, ${input.name}.\n\nSeu código de verificação para o primeiro acesso ao Portal da Contabilidade do TOPAC RH PRO é: ${input.otp}\n\nO código expira em 10 minutos.\n\nSe você não iniciou este acesso, ignore esta mensagem.`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111827;line-height:1.5"><div style="max-width:560px;margin:auto"><h2>Primeiro acesso ao Portal da Contabilidade</h2><p>Olá, <strong>${String(input.name).replace(/[<>&"]/g, '')}</strong>.</p><p>Use o código abaixo para confirmar seu e-mail:</p><div style="font-size:30px;font-weight:800;letter-spacing:8px;padding:18px 22px;background:#f4f4f5;border-radius:10px;text-align:center">${input.otp}</div><p>O código expira em 10 minutos.</p><p style="color:#6b7280;font-size:12px">Se você não iniciou este acesso, ignore esta mensagem.</p></div></body></html>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [input.to], subject, text, html }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.warn('[accounting-access][verification-email]', response.status, detail.slice(0, 600));
    throw Object.assign(new Error('falha_envio_codigo'), { status: 502 });
  }
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);

  try {
    const service = getServiceClient();
    const body = readBody(req);
    const action = clean(body.action);
    const portal = validatePortal(body.portal);

    if (action === 'login') {
      const pin = digits(body.pin);
      if (pin.length !== 6) return sendJson(res, { ok: false, error: 'codigo_invalido', message: 'Informe seu código pessoal de 6 dígitos.' }, 400);

      const lookup = hmac(`pin-lookup:${portal}`, pin);
      const { data: user, error } = await service.from('contabilidade_portal_usuarios')
        .select('id,nome,email,portal,pin_hash,ativo,primeiro_acesso_concluido_em')
        .eq('portal', portal)
        .eq('pin_lookup_hash', lookup)
        .eq('ativo', true)
        .maybeSingle();
      if (error) throw error;

      if (user?.pin_hash && safeHexEqual(user.pin_hash, hmac(`pin-user:${user.id}`, pin))) {
        return sendJson(res, { ok: true, ...(await createPortalSession(service, user)) });
      }

      // Goiânia continua compatível com o acesso legado enquanto não houver e-mail cadastrado.
      if (portal === 'goiania') {
        const { data: legacy, error: legacyError } = await service.rpc('contabilidade_portal_login', { p_portal: portal, p_codigo: pin });
        if (!legacyError && (legacy as any)?.ok) return sendJson(res, legacy as any);
      }

      return sendJson(res, { ok: false, error: 'credenciais_invalidas', message: 'Código pessoal não reconhecido.' }, 401);
    }

    if (action === 'start_first_access') {
      const email = emailOf(body.email);
      const initialCode = digits(body.initial_code);
      if (!email || initialCode.length !== 6) return sendJson(res, { ok: false, error: 'dados_invalidos', message: 'Informe o e-mail e o código inicial de 6 dígitos.' }, 400);

      const { data: user, error } = await service.from('contabilidade_portal_usuarios')
        .select('id,nome,email,portal,codigo_hash,codigo_inicial_hash,ativo,primeiro_acesso_concluido_em')
        .eq('portal', portal)
        .eq('ativo', true)
        .ilike('email', email)
        .maybeSingle();
      if (error) throw error;
      if (!user) return sendJson(res, { ok: false, error: 'dados_nao_conferem', message: 'E-mail ou código inicial não conferem.' }, 401);
      if (user.primeiro_acesso_concluido_em) return sendJson(res, { ok: false, error: 'primeiro_acesso_concluido', message: 'Seu primeiro acesso já foi concluído. Entre com seu código pessoal.' }, 409);

      const initialHash = String(user.codigo_inicial_hash || user.codigo_hash || '');
      if (!initialHash || !safeHexEqual(initialHash, sha256(initialCode))) {
        return sendJson(res, { ok: false, error: 'dados_nao_conferem', message: 'E-mail ou código inicial não conferem.' }, 401);
      }

      const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
      const { count } = await service.from('contabilidade_portal_email_verificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', user.id)
        .gte('created_at', cutoff);
      if (Number(count || 0) >= 3) return sendJson(res, { ok: false, error: 'muitas_tentativas', message: 'Muitos códigos solicitados. Tente novamente em alguns minutos.' }, 429);

      const verificationId = randomUUID();
      const otp = randomOtp();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const { error: insertError } = await service.from('contabilidade_portal_email_verificacoes').insert({
        id: verificationId,
        usuario_id: user.id,
        otp_hash: hmac(`email-otp:${verificationId}`, otp),
        expira_em: expiresAt,
      });
      if (insertError) throw insertError;
      await sendVerificationEmail({ to: email, name: user.nome, otp });
      return sendJson(res, { ok: true, verification_id: verificationId, expira_em: expiresAt, nome: user.nome });
    }

    if (action === 'verify_email') {
      const verificationId = clean(body.verification_id);
      const otp = digits(body.otp);
      if (!verificationId || otp.length !== 6) return sendJson(res, { ok: false, error: 'codigo_verificacao_invalido' }, 400);

      const { data: verification, error } = await service.from('contabilidade_portal_email_verificacoes')
        .select('id,usuario_id,otp_hash,expira_em,tentativas,usado_em')
        .eq('id', verificationId)
        .maybeSingle();
      if (error) throw error;
      if (!verification || verification.usado_em || new Date(verification.expira_em).getTime() <= Date.now()) {
        return sendJson(res, { ok: false, error: 'codigo_expirado', message: 'Código expirado. Solicite um novo.' }, 410);
      }
      if (Number(verification.tentativas || 0) >= 5) return sendJson(res, { ok: false, error: 'codigo_bloqueado', message: 'Limite de tentativas atingido. Solicite um novo código.' }, 429);

      const expected = hmac(`email-otp:${verificationId}`, otp);
      if (!safeHexEqual(String(verification.otp_hash || ''), expected)) {
        await service.from('contabilidade_portal_email_verificacoes').update({ tentativas: Number(verification.tentativas || 0) + 1 }).eq('id', verificationId);
        return sendJson(res, { ok: false, error: 'codigo_incorreto', message: 'Código de verificação incorreto.' }, 401);
      }

      const setupToken = randomToken();
      const now = new Date().toISOString();
      const { error: updateError } = await service.from('contabilidade_portal_email_verificacoes').update({
        setup_token_hash: hmac(`setup-token:${verificationId}`, setupToken),
        usado_em: now,
      }).eq('id', verificationId);
      if (updateError) throw updateError;
      await service.from('contabilidade_portal_usuarios').update({ email_verificado_em: now, updated_at: now }).eq('id', verification.usuario_id);
      return sendJson(res, { ok: true, setup_token: setupToken });
    }

    if (action === 'set_pin') {
      const verificationId = clean(body.verification_id);
      const setupToken = clean(body.setup_token);
      const pin = digits(body.pin);
      if (!verificationId || !setupToken || pin.length !== 6) return sendJson(res, { ok: false, error: 'dados_invalidos', message: 'Crie um código pessoal de 6 dígitos.' }, 400);

      const { data: verification, error } = await service.from('contabilidade_portal_email_verificacoes')
        .select('id,usuario_id,setup_token_hash,expira_em,usado_em')
        .eq('id', verificationId)
        .maybeSingle();
      if (error) throw error;
      if (!verification?.usado_em || new Date(verification.expira_em).getTime() <= Date.now()) return sendJson(res, { ok: false, error: 'configuracao_expirada', message: 'A validação expirou. Refaça o primeiro acesso.' }, 410);
      if (!safeHexEqual(String(verification.setup_token_hash || ''), hmac(`setup-token:${verificationId}`, setupToken))) {
        return sendJson(res, { ok: false, error: 'configuracao_invalida' }, 401);
      }

      const { data: user, error: userError } = await service.from('contabilidade_portal_usuarios')
        .select('id,nome,email,portal,ativo')
        .eq('id', verification.usuario_id)
        .eq('portal', portal)
        .eq('ativo', true)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) return sendJson(res, { ok: false, error: 'usuario_invalido' }, 404);

      const pinLookup = hmac(`pin-lookup:${portal}`, pin);
      const { data: conflict } = await service.from('contabilidade_portal_usuarios')
        .select('id')
        .eq('portal', portal)
        .eq('pin_lookup_hash', pinLookup)
        .eq('ativo', true)
        .neq('id', user.id)
        .maybeSingle();
      if (conflict) return sendJson(res, { ok: false, error: 'codigo_em_uso', message: 'Escolha outro código pessoal de 6 dígitos.' }, 409);

      const now = new Date().toISOString();
      const { error: saveError } = await service.from('contabilidade_portal_usuarios').update({
        pin_lookup_hash: pinLookup,
        pin_hash: hmac(`pin-user:${user.id}`, pin),
        primeiro_acesso_concluido_em: now,
        email_verificado_em: now,
        updated_at: now,
      }).eq('id', user.id);
      if (saveError) throw saveError;

      return sendJson(res, { ok: true, ...(await createPortalSession(service, user)) });
    }

    return sendJson(res, { ok: false, error: 'action_invalid' }, 400);
  } catch (error: any) {
    console.error('[accounting-access]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error), message: String(error?.message || error) }, Number(error?.status || 500));
  }
}
