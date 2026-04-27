import { createContext } from 'react';
import type { Company, Employee, MonthlyEntry, Fechamento } from '@/types/database';
import type { Delivery, BenefitReport } from '@/data/deliveries';
import type { Session } from '@supabase/supabase-js';
import type { AppRole } from '@/hooks/useUserRole';

export interface AppConfig {
  platformName: string;
  pctAdiantamento: number;
  valorInsalubridade: number;
  mensagemInstitucional: string;
}

export interface AppState {
  isAuthenticated: boolean;
  session: Session | null;
  loading: boolean;
  userRole: AppRole | null;
  userRoles: AppRole[];
  roleLoading: boolean;
  logout: () => void;
  companies: Company[];
  employees: Employee[];
  updateEmployee: (id: string, data: Partial<Employee>) => void;
  entries: MonthlyEntry[];
  setEntries: React.Dispatch<React.SetStateAction<MonthlyEntry[]>>;
  getOrCreateEntries: (companyId: string, competencia: string) => MonthlyEntry[];
  updateEntry: (employeeId: string, competencia: string, data: Partial<MonthlyEntry>) => void;
  deleteEntry: (employeeId: string, competencia: string) => Promise<void>;
  refreshEntries: () => Promise<void>;
  fechamentos: Fechamento[];
  setFechamentos: React.Dispatch<React.SetStateAction<Fechamento[]>>;
  getFechamento: (companyId: string, competencia: string) => Fechamento;
  updateFechamento: (companyId: string, competencia: string, data: Partial<Fechamento>) => void;
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  deliveries: Delivery[];
  addDelivery: (data: Omit<Delivery, 'id' | 'createdAt'>) => Delivery;
  benefitReports: BenefitReport[];
  addBenefitReport: (data: Omit<BenefitReport, 'id' | 'createdAt'>) => BenefitReport;
  dataLoading: boolean;
}

export const defaultConfig: AppConfig = {
  platformName: 'Topac RH Multiempresa PRO',
  pctAdiantamento: 40,
  valorInsalubridade: 648.40,
  mensagemInstitucional: '',
};

export const AppContext = createContext<AppState | null>(null);
