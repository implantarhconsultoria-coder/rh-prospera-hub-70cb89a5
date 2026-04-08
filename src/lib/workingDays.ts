/**
 * Calculate working days (Mon-Fri) for a given YYYY-MM competência.
 * Does not account for holidays — manual override available.
 */
export const getWorkingDays = (competencia: string): number => {
  const [year, month] = competencia.split('-').map(Number);
  if (!year || !month) return 22;

  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
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
