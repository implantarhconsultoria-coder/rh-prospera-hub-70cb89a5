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

const normalizeAttachmentName = (value: unknown) => {
  const fileName = String(value || 'documento.pdf').trim() || 'documento.pdf';
  return fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
};

const normalizeBase64 = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/^data:[^;]+;base64,/, '');

const sendWithResend = async (payload: any) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || process.env.EMAIL_FROM || 'TOPAC RH PRO <adm.matriz@topac.com.br>',
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

const sendWithSendGrid = async (payload: any) => {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return null;

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
        email: process.env.MAIL_FROM_EMAIL || process.env.EMAIL_FROM_EMAIL || 'adm.matriz@topac.com.br',
        name: process.env.MAIL_FROM_NAME || process.env.EMAIL_FROM_NAME || 'TOPAC RH PRO',
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
    return send({ ok: false, error: 'dados_invalidos' }, 400);
  }

  try {
    const result = (await sendWithResend(payload)) || (await sendWithSendGrid(payload));
    if (!result) {
      return send({
        ok: false,
        error: 'missing_email_provider_env',
        required: ['RESEND_API_KEY ou SENDGRID_API_KEY', 'MAIL_FROM/EMAIL_FROM opcional'],
      }, 501);
    }

    return send({ ok: true, ...result });
  } catch (error: any) {
    return send({ ok: false, error: error?.message || 'email_send_failed' }, 500);
  }
}
