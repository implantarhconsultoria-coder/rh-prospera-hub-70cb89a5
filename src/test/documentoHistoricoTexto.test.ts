import { describe, expect, it } from 'vitest';
import { prepareDocumentTextForSave } from '@/lib/documentoHistoricoTexto';

describe('texto livre do Histórico Documental', () => {
  it('mantém os espaços internos no nome do documento', () => {
    const texto = 'CARTA DEMISSIONAL ILMA MENDES GOIANIA';

    expect(prepareDocumentTextForSave(texto)).toBe(texto);
  });

  it('remove somente espaços externos no salvamento', () => {
    expect(prepareDocumentTextForSave('  CARTA DEMISSIONAL ILMA MENDES GOIANIA  '))
      .toBe('CARTA DEMISSIONAL ILMA MENDES GOIANIA');
  });

  it('preserva espaços e quebras de linha das observações', () => {
    const observacao = 'Primeira linha com espaços\nSegunda linha também preservada';

    expect(prepareDocumentTextForSave(observacao)).toBe(observacao);
  });
});
