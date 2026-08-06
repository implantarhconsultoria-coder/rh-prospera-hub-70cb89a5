import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const modal = readFileSync(resolve(root, 'src/components/EmailPdfModal.tsx'), 'utf8');
const helper = readFileSync(resolve(root, 'src/lib/emailUtils.ts'), 'utf8');
const history = readFileSync(resolve(root, 'src/components/HistoricoDocumentalFuncionario.tsx'), 'utf8');

describe('regressões do envio de anexos', () => {
  it('não abre cliente de e-mail nem baixa arquivos automaticamente quando o envio falha', () => {
    expect(modal).not.toContain('handleManualSend(false)');
    expect(modal).not.toContain('O e-mail manual foi aberto e os anexos foram baixados.');
    expect(modal).toContain('Nenhuma janela ou download foi aberto automaticamente.');
  });

  it('não abre preview automático no helper após falha', () => {
    expect(helper).not.toContain('openPdfPreview(attachmentBlob)');
    expect(helper).not.toContain("const openPdfPreview = (blob: Blob)");
  });

  it('preserva o Blob e o MIME reais de documento, imagem ou atestado', () => {
    expect(history).not.toContain("new Blob([originalBlob], { type: 'application/pdf' })");
    expect(history).not.toContain('Este documento ainda nao esta salvo como PDF.');
    expect(history).toContain('attachmentBlob: originalBlob');
    expect(history).toContain("attachmentContentType: originalBlob.type || 'application/octet-stream'");
  });
});
