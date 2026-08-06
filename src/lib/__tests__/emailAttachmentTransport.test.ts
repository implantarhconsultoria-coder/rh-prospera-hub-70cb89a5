import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const frontend = readFileSync(resolve(root, 'src/lib/emailUtils.ts'), 'utf8');
const backend = readFileSync(resolve(root, 'api/send-email-pdf.ts'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260806103500_email_anexos_temporarios.sql'), 'utf8');

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

  it('protege as referências no backend e usa URL remota no Resend', () => {
    expect(backend).toContain("storageBucket !== EMAIL_ATTACHMENT_BUCKET");
    expect(backend).toContain('storagePath.startsWith(`${userId}/`)');
    expect(backend).toContain('createSignedUrl');
    expect(backend).toContain('path: attachment.signedUrl');
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
});
