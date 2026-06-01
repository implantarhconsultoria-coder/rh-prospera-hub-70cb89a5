import * as net from 'node:net';
import * as tls from 'node:tls';

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

const cleanList = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter((item) => item.includes('@'))
    : [];

const PDF_CONTENT_TYPE = 'application/pdf';
const EMAIL_TIMEOUT_MS = 30000;

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

const env = (name: string) => String(process.env[name] || '').trim();
const DEFAULT_EMAIL_FROM = 'TOPAC RH PRO <no-reply@topacrh.pro>';

const isResendSandboxFrom = (value: string) => /@resend\.dev/i.test(value);

const getEmailFrom = () => {
  const configured = env('EMAIL_FROM') || env('MAIL_FROM');
  return configured && !isResendSandboxFrom(configured) ? configured : DEFAULT_EMAIL_FROM;
};

const parseEmailAddress = (value: string) => {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
};

const parseEmailName = (value: string) => {
  const match = value.match(/^(.+?)\s*</);
  return (match?.[1] || env('EMAIL_FROM_NAME') || env('MAIL_FROM_NAME') || 'TOPAC RH PRO')
    .replace(/^"|"$/g, '')
    .trim();
};

const getConfiguredProvider = () => {
  if (env('RESEND_API_KEY')) return 'resend';
  if (['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'].some(env)) return 'smtp';
  if (env('SENDGRID_API_KEY')) return 'sendgrid';
  return '';
};

const ensureFromConfigured = (provider: string) => {
  const from = getEmailFrom();
  if (!from) {
    throw new EmailConfigError(
      'Envio de e-mail sem remetente configurado. Configure EMAIL_FROM no ambiente de produção.',
      ['EMAIL_FROM'],
      [['RESEND_API_KEY', 'EMAIL_FROM'], ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']],
      provider,
    );
  }
  return from;
};

const missingSmtpEnv = () =>
  ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'].filter((key) =>
    key === 'EMAIL_FROM' ? !getEmailFrom() : !env(key),
  );

const normalizeAttachmentName = (value: unknown) => {
  const fileName = String(value || 'documento.pdf').trim() || 'documento.pdf';
  return fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
};

const normalizeBase64 = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/^data:[^;]+;base64,/, '');

const encodeHeader = (value: string) =>
  `=?UTF-8?B?${Buffer.from(String(value || ''), 'utf8').toString('base64')}?=`;

const wrapBase64 = (value: string) => value.replace(/.{1,76}/g, '$&\r\n').trim();

const buildMimeMessage = (payload: any, from: string) => {
  const boundary = `topac-pdf-${Date.now()}`;
  const recipients = [...payload.to, ...payload.cc];
  const headers = [
    `From: ${from}`,
    `To: ${payload.to.join(', ')}`,
    ...(payload.cc.length ? [`Cc: ${payload.cc.join(', ')}`] : []),
    `Subject: ${encodeHeader(payload.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  return {
    recipients,
    raw: [
      ...headers,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      payload.body,
      '',
      `--${boundary}`,
      `Content-Type: ${payload.attachmentContentType}; name="${payload.attachmentName}"`,
      `Content-Disposition: attachment; filename="${payload.attachmentName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(payload.attachmentBase64),
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n'),
  };
};

const waitForSmtpResponse = (socket: net.Socket | tls.TLSSocket) =>
  new Promise<{ code: number; response: string }>((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('smtp_timeout'));
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const complete = buffer.match(/(?:^|\r?\n)(\d{3}) [^\r\n]*(?:\r?\n)?$/);
      if (!complete) return;
      cleanup();
      resolve({ code: Number(complete[1]), response: buffer.trim() });
    };
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });

const expectSmtp = async (
  socket: net.Socket | tls.TLSSocket,
  command: string,
  expected: number[],
) => {
  socket.write(`${command}\r\n`);
  const result = await waitForSmtpResponse(socket);
  if (!expected.includes(result.code)) {
    throw new Error(`smtp_failed_${result.code}: ${result.response}`);
  }
  return result;
};

const sendWithSmtpSocket = async (payload: any, from: string) => {
  const port = Number(env('SMTP_PORT'));
  const host = env('SMTP_HOST');
  const secure = port === 465 || /^true$/i.test(env('SMTP_SECURE'));
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  const fromEmail = parseEmailAddress(from);
  const mime = buildMimeMessage(payload, from);

  let socket: net.Socket | tls.TLSSocket = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

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
    await expectSmtp(socket, `MAIL FROM:<${fromEmail}>`, [250]);
    for (const recipient of mime.recipients) {
      await expectSmtp(socket, `RCPT TO:<${recipient}>`, [250, 251]);
    }
    await expectSmtp(socket, 'DATA', [354]);
    socket.write(`${mime.raw.replace(/^\./gm, '..')}\r\n.\r\n`);
    const dataResult = await waitForSmtpResponse(socket);
    if (dataResult.code !== 250) {
      throw new Error(`smtp_failed_${dataResult.code}: ${dataResult.response}`);
    }
    await expectSmtp(socket, 'QUIT', [221]);
  } finally {
    socket.destroy();
  }
};

const sendWithResend = async (payload: any) => {
  const apiKey = env('RESEND_API_KEY');
  if (!apiKey) return null;
  const from = ensureFromConfigured('resend');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      text: payload.body,
      attachments: [
        {
          filename: payload.attachmentName,
          content: payload.attachmentBase64,
          content_type: payload.attachmentContentType,
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || 'resend_failed');
  return { provider: 'resend', data };
};

const sendWithSmtp = async (payload: any) => {
  const hasSmtp = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'].some(env);
  if (!hasSmtp) return null;
  const missing = missingSmtpEnv();
  if (missing.length) {
    throw new EmailConfigError(
      'Configuração SMTP incompleta no ambiente de produção.',
      missing,
      [['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']],
      'smtp',
    );
  }
  const from = ensureFromConfigured('smtp');
  await sendWithSmtpSocket(payload, from);
  return { provider: 'smtp' };
};

const sendWithSendGrid = async (payload: any) => {
  const apiKey = env('SENDGRID_API_KEY');
  if (!apiKey) return null;
  const from = ensureFromConfigured('sendgrid');

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: payload.to.map((email: string) => ({ email })),
          cc: payload.cc.map((email: string) => ({ email })),
          subject: payload.subject,
        },
      ],
      from: {
        email: env('MAIL_FROM_EMAIL') || env('EMAIL_FROM_EMAIL') || parseEmailAddress(from),
        name: env('MAIL_FROM_NAME') || env('EMAIL_FROM_NAME') || parseEmailName(from),
      },
      content: [{ type: 'text/plain', value: payload.body }],
      attachments: [
        {
          content: payload.attachmentBase64,
          filename: payload.attachmentName,
          type: payload.attachmentContentType,
          disposition: 'attachment',
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || 'sendgrid_failed');
  }
  return { provider: 'sendgrid' };
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
  const payload = {
    to: cleanList(body.to),
    cc: cleanList(body.cc),
    subject: String(body.subject || '').trim(),
    body: String(body.body || '').trim(),
    attachmentName: normalizeAttachmentName(body.attachmentName),
    attachmentBase64: normalizeBase64(body.attachmentBase64 || body.attachment || body.content),
    attachmentContentType: PDF_CONTENT_TYPE,
    attachmentSize: Number(body.attachmentSize || 0),
  };

  if (!payload.to.length || !payload.subject || !payload.body || !payload.attachmentBase64) {
    return send({
      ok: false,
      error: 'dados_invalidos',
      message: 'Informe destinatário, assunto, mensagem e PDF anexado antes de enviar.',
    }, 400);
  }

  try {
    const provider = getConfiguredProvider();
    const result = provider === 'resend'
      ? await sendWithResend(payload)
      : provider === 'smtp'
        ? await sendWithSmtp(payload)
        : provider === 'sendgrid'
          ? await sendWithSendGrid(payload)
          : null;

    if (!result) {
      return send({
        ok: false,
        error: 'missing_email_provider_env',
        message: 'Envio de e-mail não configurado no servidor. Configure Resend ou SMTP nas variáveis de ambiente da Vercel.',
        missing: ['RESEND_API_KEY', 'EMAIL_FROM'],
        alternatives: [
          ['RESEND_API_KEY', 'EMAIL_FROM'],
          ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'],
        ],
      }, 501);
    }

    return send({ ok: true, ...result });
  } catch (error: any) {
    if (error instanceof EmailConfigError) {
      return send({
        ok: false,
        error: 'missing_email_provider_env',
        message: error.message,
        provider: error.provider,
        missing: error.missing,
        alternatives: error.alternatives,
      }, 501);
    }

    return send({
      ok: false,
      error: 'email_provider_failed',
      message: error?.message || 'Falha ao enviar e-mail pelo provedor configurado.',
    }, 500);
  }
}
