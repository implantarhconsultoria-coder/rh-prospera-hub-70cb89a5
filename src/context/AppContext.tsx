import React, { useState, useCallback, useEffect, useRef } from 'react';
import { type Company, type Employee, type MonthlyEntry, type Fechamento, mapCompany, mapEmployee, mapEntry, entryToRow, employeeToRow } from '@/types/database';
import type { Delivery, BenefitReport } from '@/data/deliveries';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { useUserRole } from '@/hooks/useUserRole';
import { AppContext, defaultConfig, type AppConfig } from '@/context/AppContextValue';
import { useApp } from '@/hooks/useApp';

// Re-export para compatibilidade
export { useApp };

let deliveryCounter = 0;
let reportCounter = 0;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { role: userRole, roles: userRoles, roleLoading } = useUserRole(session);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<MonthlyEntry[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [benefitReports, setBenefitReports] = useState<BenefitReport[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // ref sempre com a versão mais nova das entries (evita closure stale em updateEntry)
  const entriesRef = useRef<MonthlyEntry[]>([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  // Lock para evitar getOrCreateEntries duplicado (race ao montar tela)
  const creatingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchData = useCallback(async () => {
    if (!session) {
      setCompanies([]); setEmployees([]); setEntries([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    try {
      const [companiesRes, employeesRes, entriesRes] = await Promise.all([
        supabase.from('empresas').select('*').order('nome'),
        supabase.from('funcionarios').select('*').order('nome'),
        // Filtra entries marcados como apagados
        supabase.from('lancamentos_mensais').select('*').is('apagado_em', null),
      ]);

      if (companiesRes.data) setCompanies(companiesRes.data.map(mapCompany));
      if (employeesRes.data) setEmployees(employeesRes.data.map(mapEmployee));
      if (entriesRes.data) setEntries(entriesRes.data.map(mapEntry));
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setDataLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const updateEmployee = useCallback(async (id: string, data: Partial<Employee>) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
    const row = employeeToRow(data);
    if (Object.keys(row).length > 0) {
      await supabase.from('funcionarios').update(row).eq('id', id);
    }
  }, []);

  /**
   * Garante que existem lançamentos para todos os funcionários ativos da empresa/competência.
   * Usa lock para impedir corrida quando a página chama duas vezes em sequência.
   */
  const getOrCreateEntries = useCallback((companyId: string, competencia: string): MonthlyEntry[] => {
    const lockKey = `${companyId}|${competencia}`;
    const existing = entriesRef.current.filter(e => e.companyId === companyId && e.competencia === competencia);

    const compEmps = employees.filter(
      e => e.companyId === companyId && e.status === 'ativo' && e.categoria === 'operacional',
    );
    const faltam = compEmps.filter(emp => !existing.some(e => e.employeeId === emp.id));

    if (faltam.length === 0 || creatingRef.current.has(lockKey)) {
      return existing;
    }

    creatingRef.current.add(lockKey);

    const newEntries: MonthlyEntry[] = faltam.map(emp => ({
      employeeId: emp.id,
      companyId,
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

    const rows = newEntries.map(e => entryToRow(e));
    supabase
      .from('lancamentos_mensais')
      .insert(rows)
      .select()
      .then(({ data, error }) => {
        creatingRef.current.delete(lockKey);
        if (error) {
          console.error('Erro ao criar lançamentos:', error);
          return;
        }
        if (data) {
          setEntries(prev => {
            // Remove apenas os otimistas SEM id desta empresa/competência
            const limpa = prev.filter(e => !(e.companyId === companyId && e.competencia === competencia && !e.id));
            const novos = data.map(mapEntry);
            // Mantém quem já existia (com id) e adiciona os novos
            return [...limpa.filter(e => !novos.some(n => n.id === e.id)), ...novos];
          });
        }
      });

    // Otimista: adiciona localmente para UI responder na hora
    setEntries(prev => [...prev, ...newEntries]);
    return [...existing, ...newEntries];
  }, [employees]);

  /**
   * updateEntry — corrigido para:
   * - sempre ler entry atual da REF (não da closure)
   * - persistir SEMPRE que houver id; sem id, agendar persistência depois que o insert criar
   */
  const updateEntry = useCallback((employeeId: string, competencia: string, data: Partial<MonthlyEntry>) => {
    setEntries(prev => prev.map(e =>
      e.employeeId === employeeId && e.competencia === competencia ? { ...e, ...data } : e,
    ));

    const row = entryToRow(data);
    if (Object.keys(row).length === 0) return;

    const entry = entriesRef.current.find(
      e => e.employeeId === employeeId && e.competencia === competencia,
    );

    if (entry?.id) {
      supabase.from('lancamentos_mensais').update(row).eq('id', entry.id).then(({ error }) => {
        if (error) console.error('updateEntry falhou:', error);
      });
    } else {
      // Não tem id ainda — faz upsert por chave (funcionario_id, competencia)
      const fullRow = {
        ...entryToRow({ employeeId, competencia, ...data }),
      };
      supabase.from('lancamentos_mensais')
        .upsert(fullRow, { onConflict: 'funcionario_id,competencia' })
        .select()
        .single()
        .then(({ data: saved, error }) => {
          if (error) { console.error('upsert lançamento falhou:', error); return; }
          if (saved) {
            setEntries(prev => prev.map(e =>
              e.employeeId === employeeId && e.competencia === competencia
                ? { ...mapEntry(saved) }
                : e,
            ));
          }
        });
    }
  }, []);

  /**
   * deleteEntry — soft-delete: marca apagado_em + zera variáveis para sair do cálculo,
   * mantendo histórico no banco para auditoria.
   */
  const deleteEntry = useCallback(async (employeeId: string, competencia: string): Promise<void> => {
    const entry = entriesRef.current.find(
      e => e.employeeId === employeeId && e.competencia === competencia,
    );
    const userId = session?.user?.id;
    const userName = session?.user?.email || 'Sistema';

    // Remove do estado local imediatamente
    setEntries(prev => prev.filter(e => !(e.employeeId === employeeId && e.competencia === competencia)));

    if (entry?.id) {
      const { error } = await supabase
        .from('lancamentos_mensais')
        .update({
          apagado_em: new Date().toISOString(),
          apagado_por_user_id: userId,
          apagado_por_nome: userName,
        } as any)
        .eq('id', entry.id);
      if (error) {
        console.error('deleteEntry falhou:', error);
        // Reverte se falhou
        setEntries(prev => [...prev, entry]);
        throw error;
      }
    }
  }, [session]);

  const refreshEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from('lancamentos_mensais')
      .select('*')
      .is('apagado_em', null);
    if (error) { console.error('refreshEntries falhou:', error); return; }
    if (data) setEntries(data.map(mapEntry));
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
      isAuthenticated: !!session, session, loading, userRole, userRoles, roleLoading, logout,
      companies, employees, updateEmployee,
      entries, setEntries, getOrCreateEntries, updateEntry,
      deleteEntry, refreshEntries,
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
