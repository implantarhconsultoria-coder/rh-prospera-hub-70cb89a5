// Hook isolado para evitar quebrar o Fast Refresh do Vite/SWC.
// Mantém um único ponto de consumo do AppContext.
import { useContext } from 'react';
import { AppContext } from '@/context/AppContextValue';

const exposeEntriesForBenefitReports = (ctx: NonNullable<React.ContextType<typeof AppContext>>) => {
  if (typeof window === 'undefined') return;
  (window as any).__topacMonthlyEntries = ctx.entries;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  exposeEntriesForBenefitReports(ctx);
  return ctx;
};
