import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const source = fs.readFileSync('src/pages/admin/EnviosMensaisClinicasV2Page.tsx', 'utf8');
const redirect = fs.readFileSync('src/pages/admin/EmailsContabilidadePage.tsx', 'utf8');

describe('envios mensais para clínicas', () => {
  it('ativa a página automática na rota administrativa existente', () => {
    expect(redirect).toContain("EnviosMensaisClinicasV2Page");
  });

  it('recupera pendências e arquivos persistidos sem envio automático', () => {
    for (const token of [
      "from('clinicas_envios_mensais')",
      "from('clinicas-envios').download",
      "status: 'PRONTO PARA ENVIAR'",
      "status: 'ENVIADO'",
      'Conferir e enviar',
      'EmailPdfModal',
    ]) expect(source).toContain(token);
    expect(source).not.toContain('sendEmail(');
  });

  it('preserva idempotência, histórico e validação do template oficial', () => {
    for (const token of [
      "onConflict: 'empresa_id,clinica_id,competencia,tipo_envio'",
      "isFinalClinicStatus(current?.status)",
      'CLINICA_TEMPLATE_HASH',
      "workbook.SheetNames[0] !== 'Modelo1'",
      'headers.length !== 118',
      "hash !== row.arquivo_hash",
    ]) expect(source).toContain(token);
  });

  it('prepara sequencialmente e interrompe o lote após a primeira falha', () => {
    expect(source).toContain('for (const company of pending)');
    expect(source).toContain('if (!ok)');
    expect(source).toContain('break;');
  });
});
