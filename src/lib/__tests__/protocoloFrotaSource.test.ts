import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Protocolo integrado a Frota', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/ProtocoloPage.tsx'), 'utf8');
  const creationSource = readFileSync(resolve(process.cwd(), 'src/pages/ProtocoloCriacaoPage.tsx'), 'utf8');

  it('nao possui upload proprio de PDF', () => {
    expect(source).not.toContain('type="file"');
    expect(source).not.toContain('Selecionar PDF');
    expect(source).not.toContain('handlePdfUpload');
    expect(source).not.toContain("storage.from('documentos-ativos').upload");
  });

  it('usa a placa e o cadastro da Frota como fonte', () => {
    expect(source).toContain('ProtocoloCriacaoPage');
    expect(creationSource).toContain('findVehicleByPlate');
    expect(creationSource).toContain('toProtocolVehicleFields');
    expect(creationSource).toContain(".from('ativos')");
    expect(creationSource).toContain('const missingDocs =');
    expect(creationSource).toContain('pdfOf(item.ativo)');
  });
});
