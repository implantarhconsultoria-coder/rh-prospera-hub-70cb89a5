/**
 * Calculate working days (Mon-Fri) for a given YYYY-MM competência,
 * optionally subtracting feriados (array of 'YYYY-MM-DD').
 */
export const getWorkingDays = (competencia: string, feriados: string[] = []): number => {
  const [year, month] = competencia.split('-').map(Number);
  if (!year || !month) return 22;

  const feriadoSet = new Set(feriados);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const day = date.getDay();
    if (day === 0 || day === 6) continue;
    const iso = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (feriadoSet.has(iso)) continue;
    count++;
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
