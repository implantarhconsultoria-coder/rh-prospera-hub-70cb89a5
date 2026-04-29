/** Helpers de máscara monetária BR: aceita "R$ 1.234,56", "1234,56", "1234.56" → number; e formata BRL */

export const parseCurrencyBR = (input: string | number | null | undefined): number => {
  if (input == null) return 0;
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  let s = String(input).trim();
  if (!s) return 0;
  s = s.replace(/[^\d,.\-]/g, '');
  // se há vírgula, assume vírgula decimal e ponto como milhar
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // se há mais de um ponto, todos exceto último são milhar
    const parts = s.split('.');
    if (parts.length > 2) {
      s = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export const formatBRL = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatPercentBR = (n: number) => {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '%';
};
