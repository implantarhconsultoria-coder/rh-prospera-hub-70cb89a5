import { describe, expect, it } from 'vitest';
import { normalizeKmOcrField, normalizePumpOcrFields } from '@/app-mecanico/lib/abastecimentoOcr';

describe('autopreenchimento OCR do abastecimento', () => {
  it('preserva números plausíveis mesmo quando o provedor pede revisão', () => {
    expect(normalizePumpOcrFields({
      ok: false,
      valor: 250,
      litros: 40,
      valor_por_litro: 0,
    })).toEqual({ valor: 250, litros: 40, precoLitro: 6.25 });
  });

  it('calcula o campo ausente a partir dos outros dois números', () => {
    expect(normalizePumpOcrFields({ litros: '32,5', valor_por_litro: '6,10' })).toEqual({
      valor: 198.25,
      litros: 32.5,
      precoLitro: 6.1,
    });
  });

  it('normaliza o KM reconhecido no painel', () => {
    expect(normalizeKmOcrField({ ok: false, km: '123.456' })).toBe(123456);
  });
});
