import { describe, expect, it } from 'vitest';
import { detectarDuracaoAtestado } from './medicalEvidence';

describe('duração documental de atestados', () => {
  it('detecta dias e não interpreta data como duração', () => {
    expect(detectarDuracaoAtestado('ATESTADO 3 dias, recebido em 15/09/2026')).toMatchObject({ unidade: 'dias', quantidade: 3 });
  });
  it('detecta horas sem converter em dias de desconto', () => {
    expect(detectarDuracaoAtestado('Declaração de comparecimento: 2,5 horas')).toMatchObject({ unidade: 'horas', quantidade: 2.5, requerConferencia: true });
  });
  it('mantém documentos sem medida como pendência', () => {
    expect(detectarDuracaoAtestado('IMG_8995.jpeg')).toMatchObject({ unidade: 'indefinido', quantidade: null, requerConferencia: true });
  });
  it('exige conferência quando o documento menciona horas e dias', () => {
    expect(detectarDuracaoAtestado('1 dia e 2 horas')).toMatchObject({ unidade: 'indefinido', requerConferencia: true });
  });
});
