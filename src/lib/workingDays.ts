/**
 * Calculate working days (Mon-Fri) for a given YYYY-MM competência,
 * optionally subtracting feriados (array of 'YYYY-MM-DD').
 */
export const getWorkingDays = (competencia: string, feriados: string[] = []): number => {
  const [year, month] = competencia.split('-').map(Number);
  if (!year || !month) return 22;

  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  return getWorkingDaysBetween(start, end, feriados);
};

const parseIsoDateOnly = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

/**
 * Inclusive working-day count between two YYYY-MM-DD dates.
 * Keeps the same Mon-Fri + optional holiday semantics used by getWorkingDays.
 */
export const getWorkingDaysBetween = (startDate: string, endDate: string, feriados: string[] = []): number => {
  const start = parseIsoDateOnly(startDate);
  const end = parseIsoDateOnly(endDate);
  if (!start || !end || start.getTime() > end.getTime()) return 0;

  const feriadoSet = new Set(feriados.map((item) => String(item || '').slice(0, 10)));
  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const weekday = cursor.getDay();
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (weekday !== 0 && weekday !== 6 && !feriadoSet.has(iso)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

/**
 * First business day of the month after the selected competência.
 */
export const getFirstBusinessDayOfNextMonth = (competencia: string): string => {
  const [year, month] = competencia.split('-').map(Number);
  if (!year || !month) return new Date().toLocaleDateString('pt-BR');

  const issueDate = new Date(year, month, 1);
  while (issueDate.getDay() === 0 || issueDate.getDay() === 6) {
    issueDate.setDate(issueDate.getDate() + 1);
  }

  return issueDate.toLocaleDateString('pt-BR');
};

export const formatCompetencia = (competencia: string): string => {
  const [year, month] = competencia.split('-').map(Number);
  if (!year || !month) return competencia;
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
};
