import React, { createContext, useContext, useState, useCallback } from 'react';
import { employees as initialEmployees, type Employee } from '@/data/employees';
import { type MonthlyEntry, type Fechamento, generateDefaultEntries, initialEntries } from '@/data/entries';
import { companies, type Company } from '@/data/companies';
import type { Delivery, BenefitReport } from '@/data/deliveries';

// HMR v2

interface AppState {
  isAuthenticated: boolean;
  login: (u: string, p: string) => boolean;
  logout: () => void;
  companies: Company[];
  employees: Employee[];
  updateEmployee: (id: string, data: Partial<Employee>) => void;
  entries: MonthlyEntry[];
  setEntries: React.Dispatch<React.SetStateAction<MonthlyEntry[]>>;
  getOrCreateEntries: (companyId: string, competencia: string) => MonthlyEntry[];
  updateEntry: (employeeId: string, competencia: string, data: Partial<MonthlyEntry>) => void;
  fechamentos: Fechamento[];
  setFechamentos: React.Dispatch<React.SetStateAction<Fechamento[]>>;
  getFechamento: (companyId: string, competencia: string) => Fechamento;
  updateFechamento: (companyId: string, competencia: string, data: Partial<Fechamento>) => void;
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  // Deliveries (EPI & Uniforms)
  deliveries: Delivery[];
  addDelivery: (data: Omit<Delivery, 'id' | 'createdAt'>) => Delivery;
  // Benefit reports (VR & VT)
  benefitReports: BenefitReport[];
  addBenefitReport: (data: Omit<BenefitReport, 'id' | 'createdAt'>) => BenefitReport;
}

interface AppConfig {
  platformName: string;
  pctAdiantamento: number;
  valorInsalubridade: number;
  mensagemInstitucional: string;
}

const defaultConfig: AppConfig = {
  platformName: 'Topac RH Multiempresa PRO',
  pctAdiantamento: 40,
  valorInsalubridade: 648.40,
  mensagemInstitucional: 'Sistema desenvolvido por ImplantaRH ConsultoriaPRO',
};

const AppContext = createContext<AppState | null>(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

let deliveryCounter = 0;
let reportCounter = 0;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setAuth] = useState(() => sessionStorage.getItem('topac_auth') === 'true');
  const [emps, setEmps] = useState<Employee[]>(initialEmployees);
  const [entries, setEntries] = useState<MonthlyEntry[]>(initialEntries);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [benefitReports, setBenefitReports] = useState<BenefitReport[]>([]);

  const login = useCallback((u: string, p: string) => {
    if ((u === 'admin' && p === 'admin') || (u === 'rh' && p === 'rh123')) {
      setAuth(true); sessionStorage.setItem('topac_auth', 'true'); return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => { setAuth(false); sessionStorage.removeItem('topac_auth'); }, []);

  

  const updateEmployee = useCallback((id: string, data: Partial<Employee>) => {
    setEmps(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
  }, []);

  const getOrCreateEntries = useCallback((companyId: string, competencia: string) => {
    const existing = entries.filter(e => e.companyId === companyId && e.competencia === competencia);
    if (existing.length > 0) return existing;
    const compEmps = emps.filter(e => e.companyId === companyId && e.status === 'ativo' && e.categoria === 'operacional');
    const newEntries = generateDefaultEntries(companyId, competencia, compEmps.map(e => e.id));
    setEntries(prev => [...prev, ...newEntries]);
    return newEntries;
  }, [entries, emps]);

  const updateEntry = useCallback((employeeId: string, competencia: string, data: Partial<MonthlyEntry>) => {
    setEntries(prev => prev.map(e =>
      e.employeeId === employeeId && e.competencia === competencia ? { ...e, ...data } : e
    ));
  }, []);

  const getFechamento = useCallback((companyId: string, competencia: string): Fechamento => {
    const f = fechamentos.find(f => f.companyId === companyId && f.competencia === competencia);
    return f || { companyId, competencia, status: 'aberto', observacoes: '' };
  }, [fechamentos]);

  const updateFechamento = useCallback((companyId: string, competencia: string, data: Partial<Fechamento>) => {
    setFechamentos(prev => {
      const idx = prev.findIndex(f => f.companyId === companyId && f.competencia === competencia);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...data };
        return updated;
      }
      return [...prev, { companyId, competencia, status: 'aberto', observacoes: '', ...data }];
    });
  }, []);

  const addDelivery = useCallback((data: Omit<Delivery, 'id' | 'createdAt'>): Delivery => {
    deliveryCounter++;
    const delivery: Delivery = { ...data, id: `del-${Date.now()}-${deliveryCounter}`, createdAt: new Date().toISOString() };
    setDeliveries(prev => [...prev, delivery]);
    return delivery;
  }, []);

  const addBenefitReport = useCallback((data: Omit<BenefitReport, 'id' | 'createdAt'>): BenefitReport => {
    reportCounter++;
    const report: BenefitReport = { ...data, id: `rpt-${Date.now()}-${reportCounter}`, createdAt: new Date().toISOString() };
    setBenefitReports(prev => [...prev, report]);
    return report;
  }, []);

  return (
    <AppContext.Provider value={{
      isAuthenticated, login, logout, companies, employees: emps, updateEmployee,
      entries, setEntries, getOrCreateEntries, updateEntry,
      fechamentos, setFechamentos, getFechamento, updateFechamento,
      config, setConfig,
      deliveries, addDelivery,
      benefitReports, addBenefitReport,
    }}>
      {children}
    </AppContext.Provider>
  );
};
