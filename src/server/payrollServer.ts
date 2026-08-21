import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export const PAYROLL_BUCKET = 'payroll-private';

const getEnv = (...names: string[]) => {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return '';
};

export const getServiceClient = (): SupabaseClient => {
  const url = getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('missing_supabase_service_role');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });

export const sendJson = (res: any, body: unknown, status = 200) => {
  if (res) return res.status(status).setHeader('Cache-Control', 'no-store').json(body);
  return jsonResponse(body, status);
};

export const readBody = (req: any) => {
  if (!req?.body) return {} as Record<string, any>;
  if (typeof req.body === 'object') return req.body as Record<string, any>;
  try { return JSON.parse(req.body); } catch { return {}; }
};

export const sha256 = (value: string | Buffer | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');

const cryptoSecret = () => {
  const raw = getEnv('PAYROLL_TOKEN_ENCRYPTION_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!raw) throw new Error('missing_payroll_crypto_secret');
  return createHash('sha256').update(raw).digest();
};

export const encryptSecret = (plain: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cryptoSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64url'),
    nonce: iv.toString('base64url'),
  };
};

export const decryptSecret = (ciphertext: string, nonce: string) => {
  const packed = Buffer.from(ciphertext, 'base64url');
  const iv = Buffer.from(nonce, 'base64url');
  if (packed.length < 17) throw new Error('invalid_encrypted_token');
  const encrypted = packed.subarray(0, packed.length - 16);
  const tag = packed.subarray(packed.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', cryptoSecret(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

export const randomToken = () => randomBytes(32).toString('base64url');
export const randomOtp = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const otpPepper = () => getEnv('PAYROLL_OTP_PEPPER', 'PAYROLL_TOKEN_ENCRYPTION_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
export const otpHash = (challengeId: string, otp: string) =>
  createHmac('sha256', otpPepper()).update(`${challengeId}:${otp}`).digest('hex');

export const safeEqualHex = (a: string, b: string) => {
  try {
    const aa = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return aa.length === bb.length && timingSafeEqual(aa, bb);
  } catch { return false; }
};

export const digits = (value: unknown) => String(value || '').replace(/\D/g, '');

export const normalizePhone = (value: unknown) => {
  let phone = digits(value);
  if ((phone.length === 10 || phone.length === 11) && !phone.startsWith('55')) phone = `55${phone}`;
  if (!phone.startsWith('55') || ![12, 13].includes(phone.length)) return '';
  return phone;
};

export const maskPhone = (value: unknown) => {
  const phone = normalizePhone(value);
  if (!phone) return 'telefone inválido';
  const local = phone.slice(2);
  return `(${local.slice(0,2)}) *****-${local.slice(-4)}`;
};

export const maskCpf = (value: unknown) => {
  const cpf = digits(value).padStart(11, '0').slice(-11);
  return `***.${cpf.slice(3,6)}.${cpf.slice(6,9)}-**`;
};

export const clientIp = (req: any) => {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim();
  return forwarded || req?.socket?.remoteAddress || null;
};

export const userAgent = (req: any) => String(req?.headers?.['user-agent'] || '').slice(0, 1000);

export const parseBrowserDevice = (ua: string) => {
  const lower = ua.toLowerCase();
  const browser = lower.includes('edg/') ? 'Edge'
    : lower.includes('chrome/') ? 'Chrome'
    : lower.includes('safari/') && !lower.includes('chrome/') ? 'Safari'
    : lower.includes('firefox/') ? 'Firefox'
    : 'Outro';
  const device = /iphone|ipad|ipod/.test(lower) ? 'iOS'
    : lower.includes('android') ? 'Android'
    : lower.includes('windows') ? 'Windows'
    : lower.includes('mac os') ? 'macOS'
    : 'Outro';
  return { browser, device };
};

export const requestBaseUrl = (req: any) => {
  const configured = getEnv('PAYROLL_PUBLIC_BASE_URL');
  if (configured) return configured.replace(/\/$/, '');
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0];
  if (!host) throw new Error('missing_public_base_url');
  return `${proto}://${host}`;
};

export const requireAdmin = async (req: any) => {
  const auth = String(req?.headers?.authorization || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw Object.assign(new Error('unauthorized'), { status: 401 });
  const service = getServiceClient();
  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user) throw Object.assign(new Error('unauthorized'), { status: 401 });
  const { data: roles, error: roleError } = await service.from('user_roles').select('role').eq('user_id', userData.user.id);
  if (roleError) throw roleError;
  const allowed = (roles || []).some((row: any) => ['admin','diretor_geral'].includes(row.role));
  if (!allowed) throw Object.assign(new Error('forbidden'), { status: 403 });
  return { service, user: userData.user, roles: (roles || []).map((r: any) => r.role) };
};

export const assertCompanyEnabled = async (service: SupabaseClient, companyId: string) => {
  const { data, error } = await service.rpc('payroll_company_enabled', { p_company_id: companyId });
  if (error) throw error;
  if (!data) throw Object.assign(new Error('company_not_enabled'), { status: 403 });
};

export const addEvent = async (service: SupabaseClient, data: {
  request_id?: string | null;
  company_id: string;
  employee_id?: string | null;
  event_type: string;
  actor_type?: string;
  actor_user_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  payload?: Record<string, unknown>;
}) => {
  const { error } = await service.from('payroll_signature_events').insert({
    request_id: data.request_id || null,
    company_id: data.company_id,
    employee_id: data.employee_id || null,
    event_type: data.event_type,
    actor_type: data.actor_type || 'SYSTEM',
    actor_user_id: data.actor_user_id || null,
    ip: data.ip || null,
    user_agent: data.user_agent || null,
    payload: data.payload || {},
  });
  if (error) throw error;
};

const messageProvider = () => {
  if (getEnv('TOPAC_PAYROLL_MESSAGE_WEBHOOK_URL')) return 'WEBHOOK';
  if (getEnv('EVOLUTION_API_URL') && getEnv('EVOLUTION_API_KEY') && getEnv('EVOLUTION_INSTANCE')) return 'EVOLUTION';
  return '';
};

export const sendPayrollMessage = async (input: {
  phone: string;
  text: string;
  copyCode?: string;
}) => {
  const phone = normalizePhone(input.phone);
  if (!phone) throw Object.assign(new Error('invalid_phone'), { code: 'invalid_phone' });
  const provider = messageProvider();
  if (!provider) throw Object.assign(new Error('message_channel_not_configured'), { code: 'message_channel_not_configured' });

  if (provider === 'WEBHOOK') {
    const url = getEnv('TOPAC_PAYROLL_MESSAGE_WEBHOOK_URL');
    const token = getEnv('TOPAC_PAYROLL_MESSAGE_WEBHOOK_TOKEN');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        channel: 'whatsapp',
        phone,
        text: input.text,
        buttons: input.copyCode ? [{ type: 'copy', label: 'COPIAR CÓDIGO', copy_text: input.copyCode }] : [],
      }),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`message_provider_${response.status}:${raw.slice(0,300)}`);
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    return { provider, id: parsed.id || parsed.messageId || parsed.key?.id || null };
  }

  const base = getEnv('EVOLUTION_API_URL').replace(/\/$/, '');
  const instance = getEnv('EVOLUTION_INSTANCE');
  const response = await fetch(`${base}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: getEnv('EVOLUTION_API_KEY') },
    body: JSON.stringify({ number: phone, text: input.text, delay: 0, linkPreview: false }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`evolution_${response.status}:${raw.slice(0,300)}`);
  let parsed: any = {};
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  return { provider, id: parsed.key?.id || parsed.id || parsed.messageId || null };
};

export const logMessage = async (service: SupabaseClient, data: {
  requestId: string;
  companyId: string;
  employeeId: string;
  kind: string;
  phone: string;
  template: string;
  status: 'PENDENTE'|'ENVIADO'|'ENTREGUE'|'FALHOU'|'CANCELADO';
  attempt: number;
  error?: string | null;
  providerId?: string | null;
  nextScheduledAt?: string | null;
  idempotencyKey: string;
}) => {
  const { error } = await service.from('payroll_message_logs').insert({
    request_id: data.requestId,
    company_id: data.companyId,
    employee_id: data.employeeId,
    message_kind: data.kind,
    channel: 'WHATSAPP',
    destination_masked: maskPhone(data.phone),
    message_template: data.template,
    status: data.status,
    provider_message_id: data.providerId || null,
    attempt: data.attempt,
    error: data.error || null,
    next_scheduled_at: data.nextScheduledAt || null,
    idempotency_key: data.idempotencyKey,
    sent_at: data.status === 'ENVIADO' ? new Date().toISOString() : null,
  });
  if (error && error.code !== '23505') throw error;
};

const saoPauloParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce<Record<string,string>>((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) };
};

const atSaoPaulo = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00-03:00`);

export const nextReminderAt = (config: any, from = new Date()) => {
  const local = saoPauloParts(from);
  const first = Number(String(config?.first_reminder_time || '12:00').slice(0,2)) || 12;
  const interval = Number(config?.reminder_interval_hours || 3);
  const end = Number(String(config?.reminder_window_end || '21:00').slice(0,2)) || 21;
  const slots: number[] = [];
  for (let h = first; h <= end; h += interval) slots.push(h);
  for (const h of slots) {
    const candidate = atSaoPaulo(local.year, local.month, local.day, h);
    if (candidate.getTime() > from.getTime()) return candidate;
  }
  const tomorrowNoon = new Date(atSaoPaulo(local.year, local.month, local.day, first).getTime() + 24 * 60 * 60 * 1000);
  return tomorrowNoon;
};

export const createReminderJob = async (service: SupabaseClient, request: any, config: any, from = new Date()) => {
  const scheduled = nextReminderAt(config, from);
  const slot = scheduled.toISOString();
  const kind = request.reminder_count > 0 ? 'COLLECTION' : 'REMINDER';
  const key = `${request.id}:${kind}:${slot}`;
  const { error } = await service.from('payroll_reminder_jobs').insert({
    request_id: request.id,
    company_id: request.company_id,
    employee_id: request.employee_id,
    job_kind: kind,
    scheduled_at: slot,
    idempotency_key: key,
  });
  if (error && error.code !== '23505') throw error;
  await service.from('payroll_signature_requests').update({ next_reminder_at: slot }).eq('id', request.id);
  return scheduled;
};

const pdfSafe = (value: unknown) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, ' ')
  .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export const buildCertificatePdf = (evidence: Record<string, any>) => {
  const lines = [
    'CERTIFICADO DE ASSINATURA ELETRONICA',
    '',
    `Funcionario: ${evidence.employee_name || ''}`,
    `CPF: ${maskCpf(evidence.employee_cpf)}`,
    `Empresa: ${evidence.company_name || ''}`,
    `CNPJ: ${evidence.company_cnpj || ''}`,
    `Competencia: ${evidence.competencia || ''}`,
    `ID da assinatura: ${evidence.signature_id || ''}`,
    `Data/hora: ${evidence.signed_at || ''} (America/Sao_Paulo)`,
    `Metodo: ${evidence.authentication_method || 'OTP'}`,
    `Telefone: ${maskPhone(evidence.phone_used)}`,
    `IP: ${evidence.ip || ''}`,
    `Documento: ${evidence.document_id || ''} - versao ${evidence.document_version || ''}`,
    `SHA-256: ${evidence.document_sha256_final || ''}`,
    '',
    'Integridade: documento validado por hash SHA-256 e trilha de auditoria.',
    'Este certificado esta permanentemente associado ao registro de assinatura.',
  ];
  const commands = ['BT', '/F1 15 Tf', '50 790 Td'];
  lines.forEach((line, index) => {
    if (index === 0) commands.push(`(${pdfSafe(line)}) Tj`, '0 -28 Td', '/F1 10 Tf');
    else commands.push(`(${pdfSafe(line)}) Tj`, '0 -18 Td');
  });
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, idx) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) pdf += `${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
};

export const signedUrl = async (service: SupabaseClient, path: string, expiresIn = 600) => {
  const { data, error } = await service.storage.from(PAYROLL_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw error || new Error('signed_url_failed');
  return data.signedUrl;
};
