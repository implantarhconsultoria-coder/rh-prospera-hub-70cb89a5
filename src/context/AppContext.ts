import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { Employee } from '@/data/employees';
import type { MonthlyEntry, Fechamento } from '@/data/entries';
import type { Company } from '@/data/companies';

export interface AppState {
  isAuthenticated: boolean;
  login: (u: string, p: string) => boolean;
  logout: () => void;
  companies: Company[];
  employees: Employee[];
  updateEmployee: (id: string, data: Partial<Employee>) => void;
  entries: MonthlyEntry[];
  setEntries: Dispatch<SetStateAction<MonthlyEntry[]>>;
  getOrCreateEntries: (companyId: string, competencia: string) => MonthlyEntry[];
  updateEntry: (employeeId: string, competencia: string, data: Partial<MonthlyEntry>) => void;
  fechamentos: Fechamento[];
  setFechamentos: Dispatch<SetStateAction<Fechamento[]>>;
  getFechamento: (companyId: string, competencia: string) => Fechamento;
  updateFechamento: (companyId: string, competencia: string, data: Partial<Fechamento>) => void;
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
}

export interface AppConfig {
  platformName: string;
  pctAdiantamento: number;
  valorInsalubridade: number;
  mensagemInstitucional: string;
}

export const AppContext = createContext<AppState | null>(null);
AppContext.displayName = 'AppContext';

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
