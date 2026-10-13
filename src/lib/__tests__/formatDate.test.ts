import { describe, expect, it } from 'vitest';
import { formatTopacDate } from '../dateFormat';

describe('formatTopacDate', () => {
  it.each([
    ['2026-10-14', '14/10/2026'],
    ['2026-10-13', '13/10/2026'],
    ['2026-01-01', '01/01/2026'],
  ])('preserva DATE puro %s', (input, expected) => {
    expect(formatTopacDate(input)).toBe(expected);
  });

  it('mantem timestamps reais no fuso operacional de Sao Paulo', () => {
    expect(formatTopacDate('2026-10-14T01:00:00.000Z')).toBe('13/10/2026');
    expect(formatTopacDate('2026-10-14T15:00:00.000Z')).toBe('14/10/2026');
  });
});
