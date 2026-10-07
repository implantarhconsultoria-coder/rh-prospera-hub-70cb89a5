import { describe, expect, it } from 'vitest';
import { buildAssistedWhatsAppUrl, normalizeAssistedWhatsAppPhone } from './assistedWhatsApp';

describe('assisted WhatsApp', () => {
  it('normalizes Brazilian mobile and landline numbers', () => {
    expect(normalizeAssistedWhatsAppPhone('(11) 99999-1234')).toBe('5511999991234');
    expect(normalizeAssistedWhatsAppPhone('(11) 3333-1234')).toBe('551133331234');
    expect(normalizeAssistedWhatsAppPhone('+55 (11) 99999-1234')).toBe('5511999991234');
    expect(normalizeAssistedWhatsAppPhone('0055 11 99999-1234')).toBe('5511999991234');
  });

  it('rejects numbers without DDD or malformed numbers', () => {
    expect(normalizeAssistedWhatsAppPhone('99999-1234')).toBe('');
    expect(normalizeAssistedWhatsAppPhone('123')).toBe('');
    expect(normalizeAssistedWhatsAppPhone('')).toBe('');
  });

  it('builds a prefilled WhatsApp URL', () => {
    const url = buildAssistedWhatsAppUrl('(11) 99999-1234', 'Olá, João.\nTOPAC RH PRO');
    expect(url).toContain('https://wa.me/5511999991234?text=');
    expect(decodeURIComponent(url.split('?text=')[1])).toBe('Olá, João.\nTOPAC RH PRO');
  });
});
