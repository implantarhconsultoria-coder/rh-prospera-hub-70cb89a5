import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import emailHandler from '../../../api/send-email-pdf';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const frontend = readFileSync(resolve(root, 'src/lib/emailUtils.ts'), 'utf8');
const backend = readFileSync(resolve(root, 'api/send-email-pdf.ts'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260806103500_email_anexos_temporarios.sql'), 'utf8');

const createResponse = () => {
  let statusCode = 200;
  let payload: unknown;
  const response = {
    status(code: number) { statusCode = code; return response; },
    json(body: unknown) { payload = body; return body; },
  };
  return { response, getStatus: () => statusCode, getPayload: () => payload };
};

describe('transporte de anexos de e-mail', () => {
  it('não serializa blobs em base64 no navegador', () => {
    expect(frontend).not.toContain('readAsDataURL');
    expect(frontend).not.toContain('blobToBase64');
    expect(frontend).not.toContain('attachmentBase64');
    expect(frontend).toContain("storageBucket: EMAIL_ATTACHMENT_BUCKET");
    expect(frontend).toContain('storagePath');
  });

  it('envia ao endpoint apenas referências temporárias', () => {
    const requestBlock = frontend.slice(frontend.indexOf("fetch('/api/send-email-pdf'"));
    expect(requestBlock).toContain('attachments: storedAttachments');
    expect(requestBlock).not.toContain('firstAttachment');
    expect(requestBlock).not.toContain('attachmentBase64');
  });

  it('propaga a sessão autenticada mesmo quando o módulo não fornece token', () => {
    expect(frontend).toContain('const effectiveAuthToken = authToken || session?.access_token ||');
    expect(frontend).toContain('const authenticatedUserId = session?.user?.id ||');
    expect(frontend).toContain('authorization: `Bearer ${effectiveAuthToken}`');
    expect(frontend).toContain('uploadEmailAttachments(rawAttachments, authenticatedUserId)');
  });

  it('protege as referências e incorpora o anexo no Resend antes da limpeza', () => {
    expect(backend).toContain("storageBucket !== EMAIL_ATTACHMENT_BUCKET");
    expect(backend).toContain('storagePath.startsWith(`${userId}/`)');
    expect(backend).toContain('createSignedUrl');
    expect(backend).toContain('content: attachment.attachmentBase64');
    expect(backend).toContain('await loadAttachmentBase64(supabase, attachment)');
    expect(backend).toContain("error: 'unauthorized'");
  });

  it('limita arquivos e limpa objetos temporários', () => {
    expect(backend).toContain('MAX_ATTACHMENT_BYTES');
    expect(backend).toContain('PROVIDER_RAW_LIMITS');
    expect(backend).toContain('cleanupAttachments');
    expect(frontend).toContain('cleanupStoredAttachments');
  });

  it('restringe o bucket privado à pasta do usuário autenticado', () => {
    expect(migration).toContain("'email-anexos-temporarios'");
    expect(migration).toContain('false');
    expect(migration).toContain('(storage.foldername(name))[1] = (select auth.uid())::text');
    expect(migration).toContain('to authenticated');
  });

  it('recusa métodos diferentes de POST antes de acessar serviços externos', async () => {
    const result = createResponse();
    await emailHandler({ method: 'GET' }, result.response);
    expect(result.getStatus()).toBe(405);
    expect(result.getPayload()).toEqual({ ok: false, error: 'method_not_allowed' });
  });

  it('recusa POST sem sessão autenticada antes de acessar o provedor', async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    try {
      const result = createResponse();
      await emailHandler({ method: 'POST', headers: {}, body: {} }, result.response);
      expect(result.getStatus()).toBe(401);
      expect(result.getPayload()).toEqual({
        ok: false,
        error: 'unauthorized',
        message: 'Sua sessão expirou ou não é válida. Entre novamente na plataforma.',
      });
    } finally {
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
    }
  });
});
