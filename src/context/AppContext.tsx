import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { employees as initialEmployees, type Employee } from '@/data/employees';
import { type MonthlyEntry, type Fechamento, generateDefaultEntries, initialEntries } from '@/data/entries';
import { companies, type Company } from '@/data/companies';
import type { Delivery, BenefitReport } from '@/data/deliveries';
import { getWorkingDays } from '@/lib/workingDays';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';

// HMR v4

interface AppState {
  isAuthenticated: boolean;
  session: Session | null;
  loading: boolean;
  userRole: AppRole | null;
  roleLoading: boolean;
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
  deliveries: Delivery[];
  addDelivery: (data: Omit<Delivery, 'id' | 'createdAt'>) => Delivery;
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
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { role: userRole, roleLoading } = useUserRole(session);
  const [emps, setEmps] = useState<Employee[]>(initialEmployees);
  const [entries, setEntries] = useState<MonthlyEntry[]>(initialEntries);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [benefitReports, setBenefitReports] = useState<BenefitReport[]>([]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const updateEmployee = useCallback((id: string, data: Partial<Employee>) => {
    setEmps(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
  }, []);

  const getOrCreateEntries = useCallback((companyId: string, competencia: string) => {
    const existing = entries.filter(e => e.companyId === companyId && e.competencia === competencia);
    if (existing.length > 0) return existing;
    const compEmps = emps.filter(e => e.companyId === companyId && e.status === 'ativo' && e.categoria === 'operacional');
    const newEntries = generateDefaultEntries(companyId, competencia, compEmps.map(e => e.id));
    // Apply fixed employee data to entries
    const enrichedEntries = newEntries.map(entry => {
      const emp = emps.find(e => e.id === entry.employeeId);
      if (!emp) return entry;
      return {
        ...entry,
        vrAplicado: emp.vrAtivo,
        vrDias: emp.vrAtivo ? getWorkingDays(competencia) : 0,
        vaAplicado: emp.vaAtivo,
        vtAplicado: emp.vtAtivo,
        insalubridadeAplicada: emp.insalubridadeAtiva,
      };
    });
    setEntries(prev => [...prev, ...enrichedEntries]);
    return enrichedEntries;
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
      isAuthenticated: !!session, session, loading, userRole, roleLoading, logout, companies, employees: emps, updateEmployee,
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
