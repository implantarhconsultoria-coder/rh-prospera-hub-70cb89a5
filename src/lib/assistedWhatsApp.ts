export const INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE = 'Não foi possível abrir o WhatsApp porque não há um número válido cadastrado para este contato.';

export const normalizeAssistedWhatsAppPhone = (value: unknown) => {
  let phone = String(value ?? '').replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  while (phone.startsWith('0') && phone.length > 11) phone = phone.slice(1);
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  if (!phone.startsWith('55') || ![12, 13].includes(phone.length)) return '';
  return phone;
};

export const buildAssistedWhatsAppUrl = (phoneValue: unknown, message: string) => {
  const phone = normalizeAssistedWhatsAppPhone(phoneValue);
  if (!phone) return '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

export const openAssistedWhatsApp = (phoneValue: unknown, message: string) => {
  const phone = normalizeAssistedWhatsAppPhone(phoneValue);
  if (!phone) return { ok: false as const, reason: 'invalid_phone' as const };
  if (typeof window === 'undefined') return { ok: false as const, reason: 'browser_unavailable' as const };

  const url = buildAssistedWhatsAppUrl(phone, message);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) return { ok: false as const, reason: 'open_blocked' as const, phone, url };
  return { ok: true as const, phone, url };
};
