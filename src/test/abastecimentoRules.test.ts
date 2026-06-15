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

  it('rejeita leitura em que total não corresponde a litros vezes preço', () => {
    const reading = parsePumpOcrText(`
      TOTAL A PAGAR R$ 205,30
      LITROS 29,37
      PREÇO POR LITRO 5,000
    `);

    expect(reading.complete).toBe(false);
  });

  it('usa o maior número compatível com odômetro visível', () => {
    expect(parseOdometerOcrText('TRIP A 845,2 KM ODO 123.456 AUTONOMIA 410')).toBe(123456);
  });

  it('preserva KM plausível mesmo quando a confiança remota pede revisão', () => {
    expect(normalizeOdometerOcrResult({ km: '98.765', ocr_texto_bruto: 'ODO 98.765' })).toBe(98765);
  });

  it('ignora hora e temperatura e usa o número seguido de km', () => {
    expect(parseOdometerOcrText(`
      15:21
      21°C
      25542 km
    `)).toBe(25542);
  });

  it('prioriza os três visores grandes por ordem vertical e o KM inferior próximo de km', () => {
    const pump = parsePumpOcrText(`
      12:48
      TOTAL
      190,52
      LITROS
      28.017
      PREÇO/L
      6,800
      BOMBA 03
    `);
    const km = parseOdometerOcrText(`
      14:32
      AUTONOMIA 410
      25542 km
    `);

    expect(pump).toEqual({ valor: 190.52, litros: 28.017, precoLitro: 6.8, complete: true });
    expect(km).toBe(25542);
  });
});
