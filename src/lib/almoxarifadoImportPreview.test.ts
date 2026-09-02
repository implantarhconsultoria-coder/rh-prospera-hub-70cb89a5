import { describe, expect, it } from 'vitest';
import { horarioAlmoxarifadoFechado } from './almoxarifadoImportPreview';

describe('horarioAlmoxarifadoFechado', () => {
  it('mantém aberto antes de 17:30', () => {
    expect(horarioAlmoxarifadoFechado(new Date(2026, 8, 2, 17, 29))).toBe(false);
  });

  it('fecha exatamente às 17:30', () => {
    expect(horarioAlmoxarifadoFechado(new Date(2026, 8, 2, 17, 30))).toBe(true);
  });

  it('permanece fechado às 18:10', () => {
    expect(horarioAlmoxarifadoFechado(new Date(2026, 8, 2, 18, 10))).toBe(true);
  });
});
