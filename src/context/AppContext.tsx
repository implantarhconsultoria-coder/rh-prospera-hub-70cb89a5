import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { type Company, type Employee, type MonthlyEntry, type Fechamento, mapCompany, mapEmployee, mapEntry, entryToRow, employeeToRow } from '@/types/database';
import type { Delivery, BenefitReport } from '@/data/deliveries';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';

// HMR v6

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
  dataLoading: boolean;
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<MonthlyEntry[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [benefitReports, setBenefitReports] = useState<BenefitReport[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

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

  // Fetch data from Supabase when authenticated
  const fetchData = useCallback(async () => {
    if (!session) {
      setCompanies([]);
      setEmployees([]);
      setEntries([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    try {
      const [companiesRes, employeesRes, entriesRes] = await Promise.all([
        supabase.from('empresas').select('*').order('nome'),
        supabase.from('funcionarios').select('*').order('nome'),
        supabase.from('lancamentos_mensais').select('*'),
      ]);

      if (companiesRes.data) {
        setCompanies(companiesRes.data.map(mapCompany));
      }

      if (employeesRes.data) {
        setEmployees(employeesRes.data.map(mapEmployee));
      }

      if (entriesRes.data) {
        setEntries(entriesRes.data.map(mapEntry));
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setDataLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session, fetchData]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const updateEmployee = useCallback(async (id: string, data: Partial<Employee>) => {
    // Update locally first for responsiveness
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
    // Then persist to Supabase
    const row = employeeToRow(data);
    if (Object.keys(row).length > 0) {
      await supabase.from('funcionarios').update(row).eq('id', id);
    }
  }, []);

  const getOrCreateEntries = useCallback((companyId: string, competencia: string): MonthlyEntry[] => {
    const existing = entries.filter(e => e.companyId === companyId && e.competencia === competencia);
    if (existing.length > 0) return existing;

    // Create default entries for all active operational employees
    const compEmps = employees.filter(e => e.companyId === companyId && e.status === 'ativo' && e.categoria === 'operacional');

    const newEntries: MonthlyEntry[] = compEmps.map(emp => ({
      employeeId: emp.id,
      companyId: companyId,
      competencia,
      faltasDias: 0,
      atrasos: 0,
      he50: 0,
      he100: 0,
      adicionais: 0,
      descontosDiversos: 0,
      adiantamento: Math.round(emp.salarioBase * 0.4 * 100) / 100,
      vrAplicado: emp.vrAtivo,
      vrDias: emp.vrAtivo ? 22 : 0,
      vaAplicado: emp.vaAtivo,
      vtAplicado: emp.vtAtivo,
      vtDesconto: 0,
      comissaoBase: 0,
      insalubridadeAplicada: emp.insalubridadeAtiva,
      statusConferencia: 'pendente' as const,
      observacoes: '',
    }));

    if (newEntries.length > 0) {
      // Insert into Supabase asynchronously
      const rows = newEntries.map(e => entryToRow(e));
      supabase.from('lancamentos_mensais').insert(rows).select().then(({ data }) => {
        if (data) {
          setEntries(prev => {
            // Remove optimistic entries and add real ones
            const filtered = prev.filter(e => !(e.companyId === companyId && e.competencia === competencia && !e.id));
            return [...filtered, ...data.map(mapEntry)];
          });
        }
      });

      // Add optimistically
      setEntries(prev => [...prev, ...newEntries]);
    }

    return newEntries;
  }, [entries, employees]);

  const updateEntry = useCallback((employeeId: string, competencia: string, data: Partial<MonthlyEntry>) => {
    setEntries(prev => prev.map(e =>
      e.employeeId === employeeId && e.competencia === competencia ? { ...e, ...data } : e
    ));
    // Persist to Supabase
    const row = entryToRow(data);
    if (Object.keys(row).length > 0) {
      const entry = entries.find(e => e.employeeId === employeeId && e.competencia === competencia);
      if (entry?.id) {
        supabase.from('lancamentos_mensais').update(row).eq('id', entry.id);
      }
    }
  }, [entries]);

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
      isAuthenticated: !!session, session, loading, userRole, roleLoading, logout,
      companies, employees, updateEmployee,
      entries, setEntries, getOrCreateEntries, updateEntry,
      fechamentos, setFechamentos, getFechamento, updateFechamento,
      config, setConfig,
      deliveries, addDelivery,
      benefitReports, addBenefitReport,
      dataLoading,
    }}>
      {children}
    </AppContext.Provider>
  );
};
