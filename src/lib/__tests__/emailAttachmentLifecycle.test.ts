import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const backend = readFileSync(resolve(root, 'api/send-email-pdf.ts'), 'utf8');
const sweeper = readFileSync(resolve(root, 'api/cleanup-email-attachments.ts'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260806131500_email_anexos_temporarios_mime.sql'), 'utf8');
const vercel = readFileSync(resolve(root, 'vercel.json'), 'utf8');

describe('ciclo de vida dos anexos temporários', () => {
  it('aceita qualquer imagem mantendo os demais tipos corporativos', () => {
    expect(migration).toContain("'image/*'");
    expect(migration).toContain("'application/pdf'");
  });

  it('inspeciona o resultado da remoção, repete e registra falha persistente', () => {
    expect(backend).toContain('firstAttempt.error');
    expect(backend).toContain('retryAttempt.error');
    expect(backend).toContain('Falha persistente ao limpar anexos temporários');
  });

  it('remove uploads abandonados por cron após 24 horas', () => {
    expect(sweeper).toContain('MAX_AGE_MS = 24 * 60 * 60 * 1000');
    expect(sweeper).toContain("storage.remove(batch)");
    expect(vercel).toContain('/api/cleanup-email-attachments');
    expect(vercel).toContain('17 3 * * *');
  });
});
