const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const formatTopacDate = (value: string) => {
  if (!value) return '—';

  const dateOnly = DATE_ONLY_RE.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const candidate = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
    const valid = candidate.getFullYear() === Number(year)
      && candidate.getMonth() === Number(month) - 1
      && candidate.getDate() === Number(day);
    return valid ? `${day}/${month}/${year}` : '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};
