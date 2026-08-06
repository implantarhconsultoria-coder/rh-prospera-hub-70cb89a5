import * as net from 'node:net';
import * as tls from 'node:tls';
import { createDecipheriv, createHash } from 'node:crypto';
import { createClient, type User } from '@supabase/supabase-js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const parseBody = (req: any) => {
  if (typeof req?.body === 'object' && req.body !== null) return req.body;
  try { return JSON.parse(req?.body || '{}'); } catch { return {}; }
};

const cleanList = (value: unknown) => {
  const raw = Array.isArray(value) ? value.join(' ') : String(value || '');
  const matches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((email) => email.trim().toLowerCase())));
};

const EMAIL_TIMEOUT_MS = 30000;
const EMAIL_ATTACHMENT_BUCKET = 'email-anexos-temporarios';
const MAX_EMAIL_ATTACHMENTS = 30;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const PROVIDER_RAW_LIMITS: Record<string, number> = {
  resend: 28 * 1024 * 1024,
  sendgrid: 14 * 1024 * 1024,
  smtp: 20 * 1024 * 1024,
};
const DEFAULT_EMAIL_FROM = 'TOPAC RH PRO <no-reply@topacrh.pro>';
const DEFAULT_EMAIL_REPLY_TO = 'adm.matriz@topac.com.br';
const TOPAC_DOMAIN_FALLBACK = 'topacrh.pro';
const PDF_CONTENT_TYPE = 'application/pdf';

type SupabaseServer = ReturnType<typeof createClient>;
type AttachmentReference = {
  storageBucket: string;
  storagePath: string;
  attachmentName: string;
  attachmentContentType: string;
  attachmentSize: number;
  documentId?: string | null;
  documentName?: string;
};
type ResolvedAttachment = AttachmentReference & {
  signedUrl: string;
  verifiedSize: number;
  attachmentBase64?: string;
};

class EmailConfigError extends Error {
  missing: string[];
  alternatives: string[][];
  provider?: string;
  constructor(message: string, missing: string[], alternatives: string[][] = [], provider?: string) {
    super(message);
    this.name = 'EmailConfigError';
    this.missing = missing;
    this.alternatives = alternatives;
    this.provider = provider;
  }
}

class EmailRequestError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EmailRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const env = (name: string) => String(process.env[name] || '').trim();
const formatBytes = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1).replace('.', ',')} MB`;
};
const getEmailFrom = () => {
  const configured = env('EMAIL_FROM') || env('MAIL_FROM');
  return configured && !/@resend\.dev/i.test(configured) ? configured : DEFAULT_EMAIL_FROM;
};
const getEmailReplyTo = () => env('EMAIL_REPLY_TO') || env('REPLY_TO') || DEFAULT_EMAIL_REPLY_TO;
const getSupabaseServer = () => {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};
const getHeader = (req: any, name: string) => {
  if (typeof req?.headers?.get === 'function') return req.headers.get(name);
  return req?.headers?.[name] || req?.headers?.[name.toLowerCase()] || '';
};
const getBearerToken = (req: any) => {
  const match = String(getHeader(req, 'authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};
const getAuthenticatedUser = async (req: any, supabase: SupabaseServer | null): Promise<User | null> => {
  const token = getBearerToken(req);
  if (!token || !supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data?.user || null;
};
const getEncryptionSecret = () => env('EMAIL_SETTINGS_SECRET') || env('SUPABASE_SERVICE_ROLE_KEY');
const decryptPassword = (encrypted: string) => {
  if (!encrypted) return '';
  const [version, ivText, tagText, cipherText] = encrypted.split(':');
  const secret = getEncryptionSecret();
  if (version !== 'v1' || !ivText || !tagText || !cipherText || !secret) return '';
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64')), decipher.final()]).toString('utf8');
};
const parseEmailAddress = (value: string) => (value.match(/<([^>]+)>/)?.[1] || value).trim();
const parseEmailName = (value: string) =>
  (value.match(/^(.+?)\s*</)?.[1] || env('EMAIL_FROM_NAME') || env('MAIL_FROM_NAME') || 'TOPAC RH PRO')
    .replace(/^"|"$/g, '').trim();
const domainOf = (value: string) => {
  const email = parseEmailAddress(value).toLowerCase();
  return email.includes('@') ? email.split('@').pop() || '' : '';
};
const cleanName = (value: unknown) => String(value || '').replace(/[<>\r\n"]+/g, ' ').replace(/\s+/g, ' ').trim();
const formatFrom = (name: string, email: string) => `${cleanName(name) || 'TOPAC RH PRO'} <${parseEmailAddress(email)}>`;
const uuidOrNull = (value: unknown) => {
  const text = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
};
const normalizeAttachmentName = (value: unknown) =>
  (String(value || 'documento').trim() || 'documento')
    .replace(/[<>:"/\\|?*\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
const normalizeContentType = (value: unknown) => String(value || PDF_CONTENT_TYPE).trim() || PDF_CONTENT_TYPE;
const getModuleInstitutionalEmail = (moduleOrigin: string) => {
  const key = moduleOrigin.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (key.includes('aso') || key.includes('rh') || key.includes('admiss')) return 'adm.matriz@topac.com.br';
  if (key.includes('finance') || key.includes('fatur')) return env('EMAIL_FINANCEIRO_FROM') || 'financeiro@topac.com.br';
  return '';
};
const canUseCorporateFromWithResend = (corporateEmail: string, configuredFrom: string) => {
  if (/^true$/i.test(env('RESEND_ALLOW_CORPORATE_FROM'))) return true;
  return Boolean(domainOf(corporateEmail) && domainOf(corporateEmail) === domainOf(configuredFrom));
};
const getConfiguredProvider = () => {
  if (env('RESEND_API_KEY')) return 'resend';
  if (['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'].some(env)) return 'smtp';
  if (env('SENDGRID_API_KEY')) return 'sendgrid';
  return '';
};
const ensureFromConfigured = (provider: string) => {
  const from = getEmailFrom();
  if (!from) throw new EmailConfigError('Envio de e-mail sem remetente configurado. Configure EMAIL_FROM no ambiente de produção.', ['EMAIL_FROM'], [['RESEND_API_KEY', 'EMAIL_FROM'], ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']], provider);
  return from;
};

const resolveSenderContext = async (body: any, provider: string, supabase: SupabaseServer, user: User) => {
  const defaultFrom = getEmailFrom();
  const moduleOrigin = String(body.moduleOrigin || body.moduloOrigem || 'documentos').trim() || 'documentos';
  let senderName = cleanName(body.senderName || body.usuarioNome);
  let corporateEmail = cleanList(body.senderEmail || body.emailCorporativo || body.email_corporativo)[0] || '';
  let providerType = 'global';
  let smtpUser = '';
  let smtpPass = '';

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from('profiles').select('nome_completo,email,email_corporativo').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_email_settings').select('email_corporativo,provider_type,smtp_user,smtp_pass_encrypted').eq('user_id', user.id).maybeSingle(),
  ]);
  senderName = senderName || cleanName((profile as any)?.nome_completo);
  corporateEmail = cleanList((settings as any)?.email_corporativo || (profile as any)?.email_corporativo || corporateEmail || (profile as any)?.email || user.email)[0] || corporateEmail;
  providerType = String((settings as any)?.provider_type || 'global');
  if (providerType === 'smtp_individual' && (settings as any)?.smtp_user && (settings as any)?.smtp_pass_encrypted) {
    smtpPass = decryptPassword((settings as any).smtp_pass_encrypted);
    smtpUser = smtpPass ? String((settings as any).smtp_user) : '';
  }

  corporateEmail = corporateEmail || getModuleInstitutionalEmail(moduleOrigin);
  const replyTo = corporateEmail || getEmailReplyTo();
  const fromName = senderName || parseEmailName(defaultFrom);
  let from = defaultFrom;
  if (corporateEmail) {
    if (provider === 'smtp' || provider === 'sendgrid' || canUseCorporateFromWithResend(corporateEmail, defaultFrom)) from = formatFrom(fromName, corporateEmail);
    else from = formatFrom(fromName, parseEmailAddress(defaultFrom) || `${fromName.replace(/\s+/g, '.').toLowerCase()}@${TOPAC_DOMAIN_FALLBACK}`);
  }
  return {
    senderUserId: user.id,
    senderName: fromName,
    senderCorporateEmail: corporateEmail,
    providerType,
    moduleOrigin,
    documentId: uuidOrNull(body.documentId || body.documentoId),
    documentName: String(body.documentName || body.documentoNome || '').trim(),
    from,
    replyTo,
    smtpUser,
    smtpPass,
  };
};

const normalizeAttachmentReferences = (body: any, userId: string): AttachmentReference[] => {
  if (body.attachmentBase64 || body.attachment || body.content || body.base64) {
    throw new EmailRequestError('attachment_reference_invalid', 'O formato antigo de anexo não é mais aceito. Atualize a tela e tente o envio novamente.', 400);
  }
  const raw = Array.isArray(body.attachments) ? body.attachments : [];
  if (!raw.length) throw new EmailRequestError('dados_invalidos', 'Informe destinatário, assunto, mensagem e anexos antes de enviar.', 400);
  if (raw.length > MAX_EMAIL_ATTACHMENTS) throw new EmailRequestError('dados_invalidos', `O envio aceita no máximo ${MAX_EMAIL_ATTACHMENTS} anexos por e-mail.`, 400);

  return raw.map((item: any) => {
    if (item?.attachmentBase64 || item?.content || item?.base64) {
      throw new EmailRequestError('attachment_reference_invalid', 'O formato antigo de anexo não é mais aceito. Atualize a tela e tente novamente.', 400);
    }
    const storageBucket = String(item?.storageBucket || '').trim();
    const storagePath = String(item?.storagePath || '').trim();
    const attachmentName = normalizeAttachmentName(item?.attachmentName || item?.filename || item?.name);
    const attachmentContentType = normalizeContentType(item?.attachmentContentType || item?.contentType || item?.type);
    const attachmentSize = Number(item?.attachmentSize || item?.size || 0);
    if (storageBucket !== EMAIL_ATTACHMENT_BUCKET || !storagePath || !storagePath.startsWith(`${userId}/`)) {
      throw new EmailRequestError('attachment_reference_invalid', `A referência temporária do arquivo ${attachmentName} é inválida. Gere o envio novamente.`, 403);
    }
    if (!Number.isFinite(attachmentSize) || attachmentSize <= 0) throw new EmailRequestError('attachment_reference_invalid', `O tamanho do arquivo ${attachmentName} não pôde ser validado.`, 400);
    if (attachmentSize > MAX_ATTACHMENT_BYTES) throw new EmailRequestError('attachment_too_large', `O arquivo ${attachmentName} tem ${formatBytes(attachmentSize)}. O limite por arquivo é ${formatBytes(MAX_ATTACHMENT_BYTES)}.`, 413);
    return {
      storageBucket,
      storagePath,
      attachmentName,
      attachmentContentType,
      attachmentSize,
      documentId: uuidOrNull(item?.documentId || item?.documentoId),
      documentName: String(item?.documentName || item?.documentoNome || attachmentName).trim(),
    };
  });
};

const verifyRemoteAttachment = async (signedUrl: string, fallbackSize: number, attachmentName: string) => {
  const response = await fetch(signedUrl, { method: 'HEAD', redirect: 'follow' });
  if (!response.ok) throw new EmailRequestError('attachment_download_failed', `Não foi possível validar o anexo temporário ${attachmentName}.`, 502);
  const contentLength = Number(response.headers.get('content-length') || fallbackSize);
  return Number.isFinite(contentLength) && contentLength > 0 ? contentLength : fallbackSize;
};

const resolveAttachments = async (supabase: SupabaseServer, refs: AttachmentReference[], provider: string): Promise<ResolvedAttachment[]> => {
  const resolved: ResolvedAttachment[] = [];
  for (const ref of refs) {
    const { data, error } = await supabase.storage.from(ref.storageBucket).createSignedUrl(ref.storagePath, 3600, { download: ref.attachmentName });
    if (error || !data?.signedUrl) throw new EmailRequestError('attachment_download_failed', `Não foi possível gerar o acesso temporário ao anexo ${ref.attachmentName}.`, 502);
    const verifiedSize = await verifyRemoteAttachment(data.signedUrl, ref.attachmentSize, ref.attachmentName);
    if (verifiedSize > MAX_ATTACHMENT_BYTES) throw new EmailRequestError('attachment_too_large', `O arquivo ${ref.attachmentName} tem ${formatBytes(verifiedSize)}. O limite por arquivo é ${formatBytes(MAX_ATTACHMENT_BYTES)}.`, 413);
    resolved.push({ ...ref, signedUrl: data.signedUrl, verifiedSize });
  }
  const total = resolved.reduce((sum, item) => sum + item.verifiedSize, 0);
  const limit = PROVIDER_RAW_LIMITS[provider] || PROVIDER_RAW_LIMITS.smtp;
  if (total > limit) {
    throw new EmailRequestError('attachments_total_too_large', `Os anexos somam ${formatBytes(total)}. Para ${provider || 'o provedor atual'}, o limite seguro deste envio é ${formatBytes(limit)}. Divida os anexos em mais de um e-mail.`, 413, { total, limit, provider });
  }
  return resolved;
};

const loadAttachmentBase64 = async (supabase: SupabaseServer, attachment: ResolvedAttachment) => {
  if (attachment.attachmentBase64) return attachment.attachmentBase64;
  const { data, error } = await supabase.storage.from(attachment.storageBucket).download(attachment.storagePath);
  if (error || !data) throw new EmailRequestError('attachment_download_failed', `Não foi possível recuperar o anexo ${attachment.attachmentName}.`, 502);
  const buffer = Buffer.from(await data.arrayBuffer());
  if (!buffer.length) throw new EmailRequestError('attachment_download_failed', `O anexo ${attachment.attachmentName} está vazio.`, 502);
  attachment.verifiedSize = buffer.length;
  attachment.attachmentBase64 = buffer.toString('base64');
  return attachment.attachmentBase64;
};

const cleanupAttachments = async (supabase: SupabaseServer | null, refs: AttachmentReference[]) => {
  if (!supabase || !refs.length) return;
  const groups = new Map<string, string[]>();
  refs.forEach((ref) => groups.set(ref.storageBucket, [...(groups.get(ref.storageBucket) || []), ref.storagePath]));
  for (const [bucket, paths] of groups) {
    try { await supabase.storage.from(bucket).remove(paths); } catch (error) { console.error('Falha ao limpar anexos temporários:', error); }
  }
};

const encodeHeader = (value: string) => `=?UTF-8?B?${Buffer.from(String(value || ''), 'utf8').toString('base64')}?=`;
const wrapBase64 = (value: string) => value.replace(/.{1,76}/g, '$&\r\n').trim();
const buildMimeMessage = (payload: any, from: string) => {
  const boundary = `topac-email-${Date.now()}`;
  const recipients = [...payload.to, ...payload.cc];
  const attachmentParts = payload.attachments.flatMap((attachment: ResolvedAttachment) => [
    `--${boundary}`,
    `Content-Type: ${attachment.attachmentContentType}; name="${attachment.attachmentName}"`,
    `Content-Disposition: attachment; filename="${attachment.attachmentName}"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(attachment.attachmentBase64 || ''),
    '',
  ]);
  return {
    recipients,
    raw: [
      `From: ${from}`,
      ...(payload.replyTo ? [`Reply-To: ${payload.replyTo}`] : []),
      `To: ${payload.to.join(', ')}`,
      ...(payload.cc.length ? [`Cc: ${payload.cc.join(', ')}`] : []),
      `Subject: ${encodeHeader(payload.subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      payload.body,
      '',
      ...attachmentParts,
      `--${boundary}--`,
      '',
    ].join('\r\n'),
  };
};
const waitForSmtpResponse = (socket: net.Socket | tls.TLSSocket) => new Promise<{ code: number; response: string }>((resolve, reject) => {
  let buffer = '';
  const cleanup = () => { socket.off('data', onData); socket.off('error', onError); socket.off('timeout', onTimeout); };
  const onError = (error: Error) => { cleanup(); reject(error); };
  const onTimeout = () => { cleanup(); reject(new Error('smtp_timeout')); };
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    const complete = buffer.match(/(?:^|\r?\n)(\d{3}) [^\r\n]*(?:\r?\n)?$/);
    if (!complete) return;
    cleanup();
    resolve({ code: Number(complete[1]), response: buffer.trim() });
  };
  socket.on('data', onData); socket.once('error', onError); socket.once('timeout', onTimeout);
});
const expectSmtp = async (socket: net.Socket | tls.TLSSocket, command: string, expected: number[]) => {
  socket.write(`${command}\r\n`);
  const result = await waitForSmtpResponse(socket);
  if (!expected.includes(result.code)) throw new Error(`smtp_failed_${result.code}: ${result.response}`);
  return result;
};
const sendWithSmtp = async (payload: any, supabase: SupabaseServer) => {
  const host = env('SMTP_HOST');
  const port = Number(env('SMTP_PORT'));
  const user = payload.smtpUser || env('SMTP_USER');
  const pass = payload.smtpPass || env('SMTP_PASS');
  const missing = [!host && 'SMTP_HOST', !port && 'SMTP_PORT', !user && 'SMTP_USER', !pass && 'SMTP_PASS'].filter(Boolean) as string[];
  if (missing.length) throw new EmailConfigError('Configuração SMTP incompleta no ambiente de produção.', missing, [['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']], 'smtp');
  for (const attachment of payload.attachments) await loadAttachmentBase64(supabase, attachment);
  const from = payload.from || ensureFromConfigured('smtp');
  const secure = port === 465 || /^true$/i.test(env('SMTP_SECURE'));
  let socket: net.Socket | tls.TLSSocket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  socket.setTimeout(EMAIL_TIMEOUT_MS);
  try {
    await waitForSmtpResponse(socket);
    await expectSmtp(socket, 'EHLO topacrh.pro', [250]);
    if (!secure) {
      await expectSmtp(socket, 'STARTTLS', [220]);
      socket = tls.connect({ socket, servername: host });
      socket.setTimeout(EMAIL_TIMEOUT_MS);
      await expectSmtp(socket, 'EHLO topacrh.pro', [250]);
    }
    await expectSmtp(socket, 'AUTH LOGIN', [334]);
    await expectSmtp(socket, Buffer.from(user, 'utf8').toString('base64'), [334]);
    await expectSmtp(socket, Buffer.from(pass, 'utf8').toString('base64'), [235]);
    const mime = buildMimeMessage(payload, from);
    await expectSmtp(socket, `MAIL FROM:<${parseEmailAddress(from)}>`, [250]);
    for (const recipient of mime.recipients) await expectSmtp(socket, `RCPT TO:<${recipient}>`, [250, 251]);
    await expectSmtp(socket, 'DATA', [354]);
    socket.write(`${mime.raw.replace(/^\./gm, '..')}\r\n.\r\n`);
    const dataResult = await waitForSmtpResponse(socket);
    if (dataResult.code !== 250) throw new Error(`smtp_failed_${dataResult.code}: ${dataResult.response}`);
    await expectSmtp(socket, 'QUIT', [221]);
  } finally { socket.destroy(); }
  return { provider: 'smtp' };
};
const sendWithResend = async (payload: any) => {
  const apiKey = env('RESEND_API_KEY');
  if (!apiKey) return null;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: payload.from || ensureFromConfigured('resend'),
      reply_to: payload.replyTo || getEmailReplyTo(),
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      text: payload.body,
      attachments: payload.attachments.map((attachment: ResolvedAttachment) => ({ filename: attachment.attachmentName, path: attachment.signedUrl })),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.message || (data as any)?.error || 'resend_failed');
  return { provider: 'resend', data };
};
const sendWithSendGrid = async (payload: any, supabase: SupabaseServer) => {
  const apiKey = env('SENDGRID_API_KEY');
  if (!apiKey) return null;
  for (const attachment of payload.attachments) await loadAttachmentBase64(supabase, attachment);
  const from = payload.from || ensureFromConfigured('sendgrid');
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: payload.to.map((email: string) => ({ email })), cc: payload.cc.map((email: string) => ({ email })), subject: payload.subject }],
      from: { email: env('MAIL_FROM_EMAIL') || env('EMAIL_FROM_EMAIL') || parseEmailAddress(from), name: env('MAIL_FROM_NAME') || env('EMAIL_FROM_NAME') || parseEmailName(from) },
      reply_to: { email: parseEmailAddress(payload.replyTo || getEmailReplyTo()) },
      content: [{ type: 'text/plain', value: payload.body }],
      attachments: payload.attachments.map((attachment: ResolvedAttachment) => ({ content: attachment.attachmentBase64, filename: attachment.attachmentName, type: attachment.attachmentContentType, disposition: 'attachment' })),
    }),
  });
  if (!response.ok) throw new Error(await response.text().catch(() => '') || 'sendgrid_failed');
  return { provider: 'sendgrid' };
};

const recordEmailLog = async (supabase: SupabaseServer | null, payload: any, status: 'enviado' | 'erro', provider: string, error?: string) => {
  if (!supabase) return;
  try {
    await supabase.from('email_envios_log').insert({
      user_id: payload.senderUserId || null,
      usuario_nome: payload.senderName || null,
      email_corporativo_usado: payload.senderCorporateEmail || null,
      email_remetente: payload.from || null,
      reply_to: payload.replyTo || null,
      provider: provider || null,
      modulo_origem: payload.moduleOrigin || null,
      documento_id: payload.documentId || null,
      documento_nome: payload.documentName || payload.attachmentNames || null,
      destinatarios: payload.to.join('; '),
      cc: payload.cc.join('; '),
      assunto: payload.subject,
      status,
      erro: error || null,
    });
  } catch (logError) { console.error('Erro ao registrar log de envio de e-mail:', logError); }
};

export default async function handler(req: any, res?: any) {
  const send = (body: unknown, status = 200) => res ? res.status(status).json(body) : json(body, status);
  if ((req?.method || 'GET') !== 'POST') return send({ ok: false, error: 'method_not_allowed' }, 405);

  const body = parseBody(req);
  const supabase = getSupabaseServer();
  if (!supabase) return send({ ok: false, error: 'missing_email_provider_env', message: 'O servidor não possui acesso seguro ao armazenamento de anexos.', missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] }, 501);
  const user = await getAuthenticatedUser(req, supabase);
  if (!user) return send({ ok: false, error: 'unauthorized', message: 'Sua sessão expirou ou não é válida. Entre novamente na plataforma.' }, 401);

  let references: AttachmentReference[] = [];
  let payload: any = null;
  let provider = getConfiguredProvider();
  try {
    let senderContext = await resolveSenderContext(body, provider, supabase, user);
    if (senderContext.providerType === 'smtp_individual' && env('SMTP_HOST') && env('SMTP_PORT')) {
      provider = 'smtp';
      senderContext = await resolveSenderContext(body, provider, supabase, user);
    }
    references = normalizeAttachmentReferences(body, user.id);
    const attachments = await resolveAttachments(supabase, references, provider);
    const attachmentNames = attachments.map((attachment) => attachment.attachmentName).join('; ');
    payload = {
      to: cleanList(body.to),
      cc: cleanList(body.cc),
      subject: String(body.subject || '').trim(),
      body: String(body.body || '').trim(),
      ...senderContext,
      attachments,
      attachmentNames,
      documentId: senderContext.documentId || attachments[0]?.documentId || null,
      documentName: String(body.documentName || body.documentoNome || senderContext.documentName || attachments[0]?.documentName || attachmentNames || '').trim(),
    };
    if (!payload.to.length || !payload.subject || !payload.body || !payload.attachments.length) throw new EmailRequestError('dados_invalidos', 'Informe destinatário, assunto, mensagem e anexos antes de enviar.', 400);

    const result = provider === 'resend'
      ? await sendWithResend(payload)
      : provider === 'smtp'
        ? await sendWithSmtp(payload, supabase)
        : provider === 'sendgrid'
          ? await sendWithSendGrid(payload, supabase)
          : null;
    if (!result) throw new EmailConfigError('Envio de e-mail não configurado no servidor. Configure Resend, SMTP ou SendGrid nas variáveis de ambiente da Vercel.', ['RESEND_API_KEY', 'EMAIL_FROM'], [['RESEND_API_KEY', 'EMAIL_FROM'], ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'], ['SENDGRID_API_KEY', 'EMAIL_FROM']], provider);

    await recordEmailLog(supabase, payload, 'enviado', result.provider);
    return send({ ok: true, ...result, attachments: references.length });
  } catch (error: any) {
    const message = error?.message || 'Falha ao enviar e-mail pelo provedor configurado.';
    if (payload) await recordEmailLog(supabase, payload, 'erro', provider || 'desconhecido', message);
    if (error instanceof EmailRequestError) return send({ ok: false, error: error.code, message: error.message, ...(error.details || {}) }, error.status);
    if (error instanceof EmailConfigError) return send({ ok: false, error: 'missing_email_provider_env', message: error.message, provider: error.provider, missing: error.missing, alternatives: error.alternatives }, 501);
    return send({ ok: false, error: 'email_provider_failed', message }, 500);
  } finally {
    await cleanupAttachments(supabase, references);
  }
}
