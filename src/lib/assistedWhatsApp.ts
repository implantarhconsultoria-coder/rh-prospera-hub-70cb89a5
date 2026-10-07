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
  try {
    // Mantém o mesmo mecanismo já usado pela TOPAC. Com noopener alguns navegadores
    // retornam null mesmo abrindo o app/janela, por isso a abertura é tratada como tentativa conhecida.
    window.open(url, '_blank', 'noopener,noreferrer');
    return { ok: true as const, phone, url };
  } catch {
    return { ok: false as const, reason: 'open_failed' as const, phone, url };
  }
};
