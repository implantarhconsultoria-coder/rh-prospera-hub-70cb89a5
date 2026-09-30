// @ts-nocheck
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const TZ = 'America/Sao_Paulo';
const MAX_FAILURES = 5;
const BLOCK_MINUTES = 15;
const EXTENSION_MINUTES = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const send = (res: any, body: unknown, status = 200) =>
  res ? res.status(status).json(body) : json(body, status);

const parseBody = (req: any) => {
  if (typeof req?.body === 'object' && req.body !== null) return req.body;
  try { return JSON.parse(req?.body || '{}'); } catch { return {}; }
};

const env = (name: string) => String(process.env[name] || '').trim();
const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const cleanText = (value: unknown, max = 180) => String(value || '').replace(/[<>\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const getServer = () => {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || 'https://djfjnxmbvjgweqzjvqtr.supabase.co';
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

const hashPassword = (pin: string) => {
  const salt = randomBytes(16);
  const digest = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString('base64')}$${digest.toString('base64')}`;
};

const verifyPassword = (pin: string, stored: string) => {
  try {
    const [kind, saltText, hashText] = String(stored || '').split('$');
    if (kind !== 'scrypt' || !saltText || !hashText) return false;
    const expected = Buffer.from(hashText, 'base64');
    const actual = scryptSync(pin, Buffer.from(saltText, 'base64'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
};

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

const getIpHash = (req: any) => {
  const raw = String(req?.headers?.['x-forwarded-for'] || req?.headers?.get?.('x-forwarded-for') || '').split(',')[0].trim();
  return raw ? createHash('sha256').update(raw).digest('hex') : null;
};

const getUserAgent = (req: any) =>
  cleanText(req?.headers?.['user-agent'] || req?.headers?.get?.('user-agent') || '', 500) || null;

const zonedParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: pick('year'), month: pick('month'), day: pick('day'), hour: pick('hour') % 24, minute: pick('minute'), second: pick('second') };
};

const zonedLocalToUtc = (year: number, month: number, day: number, hour: number, minute = 0) => {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const actual = zonedParts(guess);
  const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
  const intendedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(guess.getTime() - (actualAsUtc - intendedAsUtc));
};

const getPeriodExpiry = (now = new Date()) => {
  const p = zonedParts(now);
  const dayOfWeek = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const weekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (weekend) return { expiry: new Date(now.getTime() + EXTENSION_MINUTES * 60000), period: 'fora_horario' };

  if (p.hour < 12) {
    return { expiry: zonedLocalToUtc(p.year, p.month, p.day, 12, 0), period: 'manha' };
  }

  const endHour = dayOfWeek === 5 ? 16 : 17;
  const endMinute = 30;
  const end = zonedLocalToUtc(p.year, p.month, p.day, endHour, endMinute);
  if (now < end) return { expiry: end, period: 'tarde' };
  return { expiry: new Date(now.getTime() + EXTENSION_MINUTES * 60000), period: 'fora_horario' };
};

const activeAccessRows = async (db: any, cpf: string, modulo?: string) => {
  const { data, error } = await db
    .from('acessos_externos')
    .select('id,nome,cpf_clean,email,email_corporativo,empresa,filial,funcao,modulo,perfil_acesso,status,acesso_liberado,ativo,funcionario_id')
    .eq('cpf_clean', cpf);
  if (error) throw error;
  return (data || []).filter((row: any) => {
    const m = String(row.modulo || '').toLowerCase();
    const ok = row.status === 'ativo' && row.acesso_liberado === true && row.ativo !== false && m !== 'mecanico';
    return ok && (!modulo || modulo === 'todos' || m === modulo);
  });
};

const audit = async (db: any, req: any, input: {
  credencialId?: string | null;
  sessaoId?: string | null;
  email?: string | null;
  evento: string;
  modulo?: string | null;
  acessoId?: string | null;
  motivo?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  try {
    await db.from('portal_acesso_auditoria').insert({
      credencial_id: input.credencialId || null,
      sessao_id: input.sessaoId || null,
      email: input.email || null,
      evento: input.evento,
      modulo: input.modulo || null,
      acesso_id: input.acessoId || null,
      motivo: input.motivo || null,
      ip_hash: getIpHash(req),
      user_agent: getUserAgent(req),
      metadata: input.metadata || {},
    });
  } catch (e) {
    console.error('portal_audit_failed', e);
  }
};

const sendWelcomeEmail = async (to: string, nome: string, pin: string, accessUrl: string) => {
  const subject = 'Bem-vindo ao TOPAC RH PRO';
  const text = [
    `Olá, ${nome}.`,
    '',
    'Seu acesso ao TOPAC RH PRO foi preparado.',
    `Login: ${to}`,
    `Senha inicial: ${pin}`,
    '',
    'A senha inicial corresponde aos 4 últimos números do seu CPF.',
    `Acesso: ${accessUrl}`,
    '',
    'Por segurança, o acesso é encerrado automaticamente no horário do almoço e no fim do expediente. Se houver necessidade de continuar em uma urgência, o sistema solicitará o motivo e registrará a extensão.',
    '',
    'TOPAC RH PRO',
  ].join('\n');

  const from = env('EMAIL_FROM') || env('MAIL_FROM') || 'TOPAC RH PRO <no-reply@topacrh.pro>';

  if (env('RESEND_API_KEY')) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.message || data?.error || 'resend_failed'));
    return { provider: 'resend', id: data?.id || null };
  }

  if (env('SENDGRID_API_KEY')) {
    const emailOnly = (from.match(/<([^>]+)>/)?.[1] || from).trim();
    const nameOnly = (from.match(/^(.+?)\s*</)?.[1] || 'TOPAC RH PRO').replace(/^"|"$/g, '').trim();
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${env('SENDGRID_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }], subject }],
        from: { email: emailOnly, name: nameOnly },
        content: [{ type: 'text/plain', value: text }],
      }),
    });
    if (!response.ok) throw new Error(await response.text().catch(() => '') || 'sendgrid_failed');
    return { provider: 'sendgrid', id: null };
  }

  throw new Error('email_provider_not_configured');
};

const sessionByToken = async (db: any, token: string) => {
  if (!token) return null;
  const { data, error } = await db
    .from('portal_sessoes')
    .select('*,portal_credenciais(id,email,cpf_clean,nome,funcao,status)')
    .eq('token_hash', tokenHash(token))
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export default async function handler(req: any, res?: any) {
  if ((req?.method || 'GET') !== 'POST') return send(res, { ok: false, error: 'method_not_allowed' }, 405);
  const db = getServer();
  if (!db) return send(res, { ok: false, error: 'server_not_configured' }, 503);

  const body = parseBody(req);
  const action = String(body.action || '').trim().toLowerCase();

  try {
    if (action === 'register') {
      const email = normalizeEmail(body.email);
      const nome = cleanText(body.nome, 160);
      const cpf = onlyDigits(body.cpf);
      const funcao = cleanText(body.funcao, 120);
      const accessPath = String(body.accessPath || '/modulos').startsWith('/') ? String(body.accessPath) : '/modulos';
      const accessUrl = `https://topacrh.pro${accessPath}`;

      if (!email || !email.includes('@') || nome.length < 3 || cpf.length !== 11 || funcao.length < 2) {
        return send(res, { ok: false, error: 'dados_invalidos', message: 'Preencha e-mail corporativo, nome completo, CPF e função.' }, 400);
      }

      const [{ data: existingByEmail }, { data: existingByCpf }] = await Promise.all([
        db.from('portal_credenciais').select('id').eq('email', email).maybeSingle(),
        db.from('portal_credenciais').select('id').eq('cpf_clean', cpf).maybeSingle(),
      ]);
      if (existingByEmail || existingByCpf) {
        return send(res, { ok: false, error: 'cadastro_ja_existe', message: 'Este acesso já foi cadastrado. Use a tela de login.' }, 409);
      }

      const { data: funcionario } = await db
        .from('funcionarios')
        .select('id,nome,cpf,email,telefone,celular,cargo,status')
        .eq('cpf', cpf)
        .maybeSingle();

      let acessos = await activeAccessRows(db, cpf);
      const existingEmails = acessos
        .flatMap((row: any) => [row.email, row.email_corporativo])
        .filter(Boolean)
        .map((v: any) => normalizeEmail(v));
      if (existingEmails.length && !existingEmails.includes(email)) {
        return send(res, { ok: false, error: 'email_diverge_cadastro', message: 'O e-mail corporativo informado não confere com o acesso já cadastrado. Procure o administrador.' }, 409);
      }

      const pin = cpf.slice(-4);
      const { data: credential, error: credError } = await db
        .from('portal_credenciais')
        .insert({
          funcionario_id: funcionario?.id || acessos[0]?.funcionario_id || null,
          email,
          cpf_clean: cpf,
          nome: funcionario?.nome || nome,
          funcao: funcionario?.cargo || funcao,
          senha_hash: hashPassword(pin),
          status: acessos.length ? 'ativo' : 'inativo',
        })
        .select('id')
        .single();
      if (credError) throw credError;

      if (acessos.length) {
        await db
          .from('acessos_externos')
          .update({
            email,
            email_corporativo: email,
            nome: funcionario?.nome || nome,
            telefone: funcionario?.telefone || funcionario?.celular || null,
            funcao: funcionario?.cargo || funcao,
            updated_at: new Date().toISOString(),
          })
          .eq('cpf_clean', cpf)
          .neq('modulo', 'mecanico');
      }

      let emailResult: any = null;
      let emailError = '';
      try {
        emailResult = await sendWelcomeEmail(email, funcionario?.nome || nome, pin, accessUrl);
      } catch (e: any) {
        emailError = String(e?.message || e);
      }

      await audit(db, req, {
        credencialId: credential.id,
        email,
        evento: 'cadastro',
        metadata: { acessos_liberados: acessos.length, email_enviado: Boolean(emailResult), email_provider: emailResult?.provider || null, email_error: emailError || null },
      });

      return send(res, {
        ok: true,
        status: acessos.length ? 'ativo' : 'aguardando_liberacao',
        email_enviado: Boolean(emailResult),
        message: acessos.length
          ? (emailResult ? 'Cadastro concluído. Enviamos o e-mail de boas-vindas com sua senha inicial.' : 'Cadastro concluído, mas o e-mail de boas-vindas não pôde ser enviado agora.')
          : 'Cadastro recebido. O administrador precisa liberar um módulo antes do primeiro acesso.',
      });
    }

    if (action === 'login') {
      const email = normalizeEmail(body.email);
      const senha = onlyDigits(body.senha);
      const modulo = String(body.modulo || 'todos').toLowerCase();
      const lembrar = body.lembrar === true;

      if (!email || !email.includes('@') || senha.length !== 4) {
        return send(res, { ok: false, error: 'credenciais_invalidas', message: 'Informe o e-mail corporativo e a senha de 4 números.' }, 400);
      }

      const { data: cred, error: credError } = await db
        .from('portal_credenciais')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      if (credError) throw credError;
      if (!cred) {
        await audit(db, req, { email, evento: 'login_falhou', motivo: 'credencial_nao_encontrada' });
        return send(res, { ok: false, error: 'credenciais_invalidas', message: 'E-mail ou senha inválidos.' }, 401);
      }

      if (cred.status !== 'ativo') {
        await audit(db, req, { credencialId: cred.id, email, evento: 'login_falhou', motivo: 'credencial_inativa' });
        return send(res, { ok: false, error: 'acesso_nao_liberado', message: 'Seu cadastro existe, mas o acesso ainda não está liberado.' }, 403);
      }

      if (cred.bloqueado_ate && new Date(cred.bloqueado_ate).getTime() > Date.now()) {
        return send(res, { ok: false, error: 'temporariamente_bloqueado', message: 'Muitas tentativas incorretas. Aguarde alguns minutos e tente novamente.' }, 429);
      }

      if (!verifyPassword(senha, cred.senha_hash)) {
        const failures = Number(cred.falhas_consecutivas || 0) + 1;
        const blocked = failures >= MAX_FAILURES;
        await db.from('portal_credenciais').update({
          falhas_consecutivas: blocked ? 0 : failures,
          bloqueado_ate: blocked ? new Date(Date.now() + BLOCK_MINUTES * 60000).toISOString() : null,
          atualizado_em: new Date().toISOString(),
        }).eq('id', cred.id);
        await audit(db, req, { credencialId: cred.id, email, evento: 'login_falhou', motivo: blocked ? 'bloqueio_tentativas' : 'senha_incorreta', metadata: { tentativa: failures } });
        return send(res, { ok: false, error: 'credenciais_invalidas', message: blocked ? 'Acesso bloqueado por 15 minutos após tentativas incorretas.' : 'E-mail ou senha inválidos.' }, 401);
      }

      const acessos = await activeAccessRows(db, cred.cpf_clean, modulo);
      if (!acessos.length) {
        await audit(db, req, { credencialId: cred.id, email, evento: 'login_falhou', motivo: 'modulo_nao_liberado', modulo });
        return send(res, { ok: false, error: 'modulo_nao_liberado', message: 'Este usuário não possui acesso liberado a este módulo.' }, 403);
      }

      const { expiry, period } = getPeriodExpiry();
      const token = randomBytes(32).toString('base64url');
      const { data: session, error: sessionError } = await db
        .from('portal_sessoes')
        .insert({
          credencial_id: cred.id,
          token_hash: tokenHash(token),
          lembrar_dispositivo: lembrar,
          expira_em: expiry.toISOString(),
        })
        .select('id,expira_em')
        .single();
      if (sessionError) throw sessionError;

      await db.from('portal_credenciais').update({
        falhas_consecutivas: 0,
        bloqueado_ate: null,
        ultimo_login_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      }).eq('id', cred.id);

      await audit(db, req, {
        credencialId: cred.id, sessaoId: session.id, email, evento: 'login_sucesso', modulo: modulo === 'todos' ? null : modulo,
        metadata: { periodo: period, lembrar_dispositivo: lembrar, expira_em: session.expira_em },
      });

      return send(res, {
        ok: true,
        session_token: token,
        sessao_id: session.id,
        expira_em: session.expira_em,
        periodo: period,
        nome: cred.nome,
        email: cred.email,
        cpf_clean: cred.cpf_clean,
        lembrar,
        portais: acessos.map((row: any) => ({
          acesso_id: row.id,
          modulo: row.modulo,
          perfil_acesso: row.perfil_acesso,
          empresa: row.empresa || '',
          filial: row.filial || '',
          funcao: row.funcao || cred.funcao || '',
        })),
      });
    }

    if (action === 'validate') {
      const token = String(body.token || '');
      const session = await sessionByToken(db, token);
      if (!session || session.encerrado_em || new Date(session.expira_em).getTime() <= Date.now() || session.portal_credenciais?.status !== 'ativo') {
        return send(res, { ok: false, error: 'sessao_expirada' }, 401);
      }
      return send(res, { ok: true, expira_em: session.expira_em, extensoes: session.extensoes || 0 });
    }

    if (action === 'extend') {
      const token = String(body.token || '');
      const motivo = cleanText(body.motivo, 500);
      if (motivo.length < 5) return send(res, { ok: false, error: 'motivo_obrigatorio', message: 'Informe o motivo da necessidade de continuar conectado.' }, 400);
      const session = await sessionByToken(db, token);
      if (!session || session.encerrado_em || session.portal_credenciais?.status !== 'ativo') {
        return send(res, { ok: false, error: 'sessao_expirada' }, 401);
      }

      const base = Math.max(Date.now(), new Date(session.expira_em).getTime());
      const newExpiry = new Date(base + EXTENSION_MINUTES * 60000);
      const { error } = await db.from('portal_sessoes').update({
        expira_em: newExpiry.toISOString(),
        extensoes: Number(session.extensoes || 0) + 1,
        ultimo_motivo_extensao: motivo,
        atualizado_em: new Date().toISOString(),
      }).eq('id', session.id);
      if (error) throw error;

      await audit(db, req, {
        credencialId: session.credencial_id,
        sessaoId: session.id,
        email: session.portal_credenciais?.email || null,
        evento: 'sessao_estendida',
        motivo,
        metadata: { minutos: EXTENSION_MINUTES, expira_em: newExpiry.toISOString() },
      });
      return send(res, { ok: true, expira_em: newExpiry.toISOString(), extensao_minutos: EXTENSION_MINUTES });
    }

    if (action === 'logout') {
      const token = String(body.token || '');
      const motivo = cleanText(body.motivo || 'manual', 500);
      const session = await sessionByToken(db, token);
      if (session && !session.encerrado_em) {
        await db.from('portal_sessoes').update({
          encerrado_em: new Date().toISOString(),
          encerramento_motivo: motivo,
          atualizado_em: new Date().toISOString(),
        }).eq('id', session.id);
        await audit(db, req, {
          credencialId: session.credencial_id,
          sessaoId: session.id,
          email: session.portal_credenciais?.email || null,
          evento: motivo === 'automatico_periodo' ? 'logout_automatico' : 'logout',
          motivo,
        });
      }
      return send(res, { ok: true });
    }

    if (action === 'event') {
      const token = String(body.token || '');
      const session = await sessionByToken(db, token);
      if (!session || session.encerrado_em || new Date(session.expira_em).getTime() <= Date.now()) {
        return send(res, { ok: false, error: 'sessao_expirada' }, 401);
      }
      await audit(db, req, {
        credencialId: session.credencial_id,
        sessaoId: session.id,
        email: session.portal_credenciais?.email || null,
        evento: cleanText(body.evento || 'evento', 80),
        modulo: cleanText(body.modulo || '', 80) || null,
        acessoId: String(body.acessoId || '') || null,
        motivo: cleanText(body.motivo || '', 500) || null,
        metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata : {},
      });
      return send(res, { ok: true });
    }

    return send(res, { ok: false, error: 'acao_invalida' }, 400);
  } catch (error: any) {
    console.error('portal_access_error', error);
    return send(res, { ok: false, error: 'portal_access_failed', message: String(error?.message || error) }, 500);
  }
}
