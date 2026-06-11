import { describe, expect, it } from 'vitest';
import { normalizeOdometerOcrResult, parseOdometerOcrText, parsePumpOcrText } from '@/app-mecanico/lib/abastecimentoRules';

describe('OCR do abastecimento', () => {
  it('extrai exatamente total, litros e preço por litro da bomba', () => {
    const reading = parsePumpOcrText(`
      TOTAL A PAGAR R$ 205,30
      LITROS 29,37
      PREÇO POR LITRO 6,990
    `);

    expect(reading).toEqual({ valor: 205.3, litros: 29.37, precoLitro: 6.99, complete: true });
  });

  it('usa o maior número compatível com odômetro visível', () => {
    expect(parseOdometerOcrText('TRIP A 845,2 KM ODO 123.456 AUTONOMIA 410')).toBe(123456);
  });

  it('preserva KM plausível mesmo quando a confiança remota pede revisão', () => {
    expect(normalizeOdometerOcrResult({ km: '98.765', ocr_texto_bruto: 'ODO 98.765' })).toBe(98765);
  });
});
