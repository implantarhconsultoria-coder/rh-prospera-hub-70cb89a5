export type AccountingEmailAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  bytes?: Uint8Array;
};

export type AccountingEmailMessage = {
  provider: 'GMAIL' | 'MICROSOFT';
  providerMessageId: string;
  mailbox: string;
  sender: string;
  subject: string;
  receivedAt: string;
  attachments: AccountingEmailAttachment[];
  metadata?: Record<string, unknown>;
};

const env = (name: string) => String(process.env[name] || '').trim();
const daysLookback = () => Math.max(1, Math.min(365, Number(env('ACCOUNTING_EMAIL_SYNC_LOOKBACK_DAYS') || 30)));
const maxMessages = () => Math.max(1, Math.min(100, Number(env('ACCOUNTING_EMAIL_SYNC_MAX_MESSAGES') || 40)));

const fetchJson = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(`email_provider_${response.status}:${String(data?.error?.message || data?.error_description || data?.error || text).slice(0, 500)}`);
  return data;
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return new Uint8Array(Buffer.from(normalized + padding, 'base64'));
};

const gmailToken = async () => {
  const clientId = env('ACCOUNTING_GMAIL_CLIENT_ID');
  const clientSecret = env('ACCOUNTING_GMAIL_CLIENT_SECRET');
  const refreshToken = env('ACCOUNTING_GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) throw new Error('gmail_not_configured');
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  const data = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params.toString(),
  });
  if (!data.access_token) throw new Error('gmail_access_token_missing');
  return String(data.access_token);
};

const gmailHeaders = (payload: any) => Object.fromEntries((payload?.headers || []).map((row: any) => [String(row.name || '').toLowerCase(), String(row.value || '')]));

const gmailAttachmentParts = (payload: any): any[] => {
  const output: any[] = [];
  const walk = (part: any) => {
    const name = String(part?.filename || '');
    const attachmentId = String(part?.body?.attachmentId || '');
    const inlineData = String(part?.body?.data || '');
    if (name || attachmentId) output.push({ ...part, _attachmentId: attachmentId, _inlineData: inlineData });
    (part?.parts || []).forEach(walk);
  };
  walk(payload);
  return output;
};

const readGmail = async (): Promise<AccountingEmailMessage[]> => {
  const token = await gmailToken();
  const mailbox = env('ACCOUNTING_GMAIL_MAILBOX') || 'me';
  const userId = encodeURIComponent(mailbox);
  const auth = { authorization: `Bearer ${token}` };
  const query = encodeURIComponent(`has:attachment newer_than:${daysLookback()}d`);
  const list = await fetchJson(`https://gmail.googleapis.com/gmail/v1/users/${userId}/messages?q=${query}&maxResults=${maxMessages()}`, { headers: auth });
  const output: AccountingEmailMessage[] = [];

  for (const summary of list.messages || []) {
    const id = String(summary.id || '');
    if (!id) continue;
    const full = await fetchJson(`https://gmail.googleapis.com/gmail/v1/users/${userId}/messages/${encodeURIComponent(id)}?format=full`, { headers: auth });
    const headers = gmailHeaders(full.payload);
    const parts = gmailAttachmentParts(full.payload);
    const attachments: AccountingEmailAttachment[] = [];
    for (const part of parts) {
      const name = String(part.filename || 'anexo');
      const contentType = String(part.mimeType || 'application/octet-stream');
      const size = Number(part?.body?.size || 0);
      let bytes: Uint8Array | undefined;
      if (part._inlineData) bytes = base64UrlToBytes(part._inlineData);
      else if (part._attachmentId) {
        const attachment = await fetchJson(`https://gmail.googleapis.com/gmail/v1/users/${userId}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(part._attachmentId)}`, { headers: auth });
        if (attachment.data) bytes = base64UrlToBytes(String(attachment.data));
      }
      attachments.push({ id: part._attachmentId || `${id}:${name}`, name, contentType, size: bytes?.byteLength || size, bytes });
    }
    output.push({
      provider: 'GMAIL', providerMessageId: id, mailbox, sender: headers.from || '', subject: headers.subject || '',
      receivedAt: headers.date ? new Date(headers.date).toISOString() : new Date(Number(full.internalDate || Date.now())).toISOString(),
      attachments,
      metadata: { thread_id: full.threadId || null, history_id: full.historyId || null },
    });
  }
  return output;
};

const microsoftToken = async () => {
  const tenant = env('ACCOUNTING_MS_TENANT_ID');
  const clientId = env('ACCOUNTING_MS_CLIENT_ID');
  const secret = env('ACCOUNTING_MS_CLIENT_SECRET');
  if (!tenant || !clientId || !secret) throw new Error('microsoft_not_configured');
  const params = new URLSearchParams({ client_id: clientId, client_secret: secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  const data = await fetchJson(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params.toString(),
  });
  if (!data.access_token) throw new Error('microsoft_access_token_missing');
  return String(data.access_token);
};

const readMicrosoft = async (): Promise<AccountingEmailMessage[]> => {
  const token = await microsoftToken();
  const mailbox = env('ACCOUNTING_MS_MAILBOX');
  if (!mailbox) throw new Error('microsoft_mailbox_missing');
  const auth = { authorization: `Bearer ${token}` };
  const since = new Date(Date.now() - daysLookback() * 86400000).toISOString();
  const params = new URLSearchParams({
    '$filter': `hasAttachments eq true and receivedDateTime ge ${since}`,
    '$select': 'id,subject,from,receivedDateTime,hasAttachments,internetMessageId',
    '$orderby': 'receivedDateTime desc',
    '$top': String(maxMessages()),
  });
  const list = await fetchJson(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?${params.toString()}`, { headers: auth });
  const output: AccountingEmailMessage[] = [];
  for (const message of list.value || []) {
    const id = String(message.id || '');
    if (!id) continue;
    const attachmentList = await fetchJson(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(id)}/attachments`, { headers: auth });
    const attachments: AccountingEmailAttachment[] = [];
    for (const part of attachmentList.value || []) {
      if (!String(part?.['@odata.type'] || '').includes('fileAttachment')) continue;
      const name = String(part.name || 'anexo');
      const contentType = String(part.contentType || 'application/octet-stream');
      let contentBytes = String(part.contentBytes || '');
      if (!contentBytes && part.id) {
        const full = await fetchJson(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(part.id)}`, { headers: auth });
        contentBytes = String(full.contentBytes || '');
      }
      const bytes = contentBytes ? new Uint8Array(Buffer.from(contentBytes, 'base64')) : undefined;
      attachments.push({ id: String(part.id || `${id}:${name}`), name, contentType, size: bytes?.byteLength || Number(part.size || 0), bytes });
    }
    output.push({
      provider: 'MICROSOFT', providerMessageId: id, mailbox,
      sender: String(message?.from?.emailAddress?.address || message?.from?.emailAddress?.name || ''),
      subject: String(message.subject || ''), receivedAt: String(message.receivedDateTime || new Date().toISOString()), attachments,
      metadata: { internet_message_id: message.internetMessageId || null },
    });
  }
  return output;
};

export const accountingEmailProviderStatus = () => {
  const provider = env('ACCOUNTING_EMAIL_PROVIDER').toLowerCase();
  if (provider === 'gmail') {
    const missing = ['ACCOUNTING_GMAIL_CLIENT_ID', 'ACCOUNTING_GMAIL_CLIENT_SECRET', 'ACCOUNTING_GMAIL_REFRESH_TOKEN'].filter((key) => !env(key));
    return { provider: 'GMAIL', configured: missing.length === 0, mailbox: env('ACCOUNTING_GMAIL_MAILBOX') || 'me', missing };
  }
  if (provider === 'microsoft' || provider === 'outlook' || provider === 'm365') {
    const missing = ['ACCOUNTING_MS_TENANT_ID', 'ACCOUNTING_MS_CLIENT_ID', 'ACCOUNTING_MS_CLIENT_SECRET', 'ACCOUNTING_MS_MAILBOX'].filter((key) => !env(key));
    return { provider: 'MICROSOFT', configured: missing.length === 0, mailbox: env('ACCOUNTING_MS_MAILBOX'), missing };
  }
  return { provider: provider ? provider.toUpperCase() : 'NAO_CONFIGURADO', configured: false, mailbox: '', missing: ['ACCOUNTING_EMAIL_PROVIDER'] };
};

export const readAccountingMailbox = async () => {
  const status = accountingEmailProviderStatus();
  if (!status.configured) throw Object.assign(new Error('accounting_email_not_configured'), { details: status });
  return status.provider === 'GMAIL' ? readGmail() : readMicrosoft();
};
