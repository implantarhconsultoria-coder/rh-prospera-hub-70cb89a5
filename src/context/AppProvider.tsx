import React, { useCallback, useState } from 'react';
import { employees as initialEmployees, type Employee } from '@/data/employees';
import { type MonthlyEntry, type Fechamento, generateDefaultEntries, initialEntries } from '@/data/entries';
import { companies } from '@/data/companies';
import { AppContext, type AppConfig } from '@/context/AppContext';

const defaultConfig: AppConfig = {
  platformName: 'Topac RH Multiempresa PRO',
  pctAdiantamento: 40,
  valorInsalubridade: 648.40,
  mensagemInstitucional: 'Sistema desenvolvido por ImplantaRH ConsultoriaPRO',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setAuth] = useState(false);
  const [emps, setEmps] = useState<Employee[]>(initialEmployees);
  const [entries, setEntries] = useState<MonthlyEntry[]>(initialEntries);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [config, setConfig] = useState<AppConfig>(defaultConfig);

  const login = useCallback((u: string, p: string) => {
    if ((u === 'admin' && p === 'admin') || (u === 'rh' && p === 'rh123')) {
      setAuth(true);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => setAuth(false), []);

  const updateEmployee = useCallback((id: string, data: Partial<Employee>) => {
    setEmps(prev => prev.map(e => (e.id === id ? { ...e, ...data } : e)));
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
    setEntries(prev => prev.map(e => (
      e.employeeId === employeeId && e.competencia === competencia ? { ...e, ...data } : e
    )));
  }, []);

  const getFechamento = useCallback((companyId: string, competencia: string): Fechamento => {
    const fechamento = fechamentos.find(f => f.companyId === companyId && f.competencia === competencia);
    return fechamento || { companyId, competencia, status: 'aberto', observacoes: '' };
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

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        login,
        logout,
        companies,
        employees: emps,
        updateEmployee,
        entries,
        setEntries,
        getOrCreateEntries,
        updateEntry,
        fechamentos,
        setFechamentos,
        getFechamento,
        updateFechamento,
        config,
        setConfig,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
