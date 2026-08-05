import { describe, expect, it } from 'vitest';
import { distanceMeters, shouldSendLocation } from '@/lib/locationTracking';

describe('locationTracking', () => {
  it('calcula deslocamento aproximado em metros', () => {
    const distance = distanceMeters(
      { latitude: -23.55052, longitude: -46.633308 },
      { latitude: -23.5462, longitude: -46.633308 },
    );

    expect(distance).toBeGreaterThan(450);
    expect(distance).toBeLessThan(520);
  });

  it('envia a primeira localização', () => {
    expect(shouldSendLocation({
      current: { latitude: -23.55, longitude: -46.63 },
      previous: null,
      lastSentAt: null,
      now: 10_000,
    })).toBe(true);
  });

  it('não envia novamente antes de 500 metros ou quatro minutos', () => {
    expect(shouldSendLocation({
      current: { latitude: -23.5506, longitude: -46.6333 },
      previous: { latitude: -23.5505, longitude: -46.6333 },
      lastSentAt: 10_000,
      now: 10_000 + 60_000,
    })).toBe(false);
  });

  it('envia quando o deslocamento passa de 500 metros', () => {
    expect(shouldSendLocation({
      current: { latitude: -23.5457, longitude: -46.6333 },
      previous: { latitude: -23.5505, longitude: -46.6333 },
      lastSentAt: 10_000,
      now: 10_000 + 60_000,
    })).toBe(true);
  });

  it('envia o sinal de presença após quatro minutos mesmo sem deslocamento', () => {
    expect(shouldSendLocation({
      current: { latitude: -23.5505, longitude: -46.6333 },
      previous: { latitude: -23.5505, longitude: -46.6333 },
      lastSentAt: 10_000,
      now: 10_000 + (4 * 60 * 1000),
    })).toBe(true);
  });
});
