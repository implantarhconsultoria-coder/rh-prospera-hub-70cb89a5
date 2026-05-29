import React, { useState, useCallback, useEffect, useRef } from 'react';
import { type Company, type Employee, type MonthlyEntry, type Fechamento, mapCompany, mapEmployee, mapEntry, mapFechamento, entryToRow, employeeToRow, buildEmployeeObservacoes } from '@/types/database';
import type { Delivery, BenefitReport } from '@/data/deliveries';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { AppContext, defaultConfig, type AppConfig } from '@/context/AppContextValue';
import { useApp } from '@/hooks/useApp';
import { employeeHasInsalubridade } from '@/lib/employeeRoleRules';

// Re-export para compatibilidade
export { useApp };

let deliveryCounter = 0;
let reportCounter = 0;

const isMissingSchema = (error: any) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return error?.code === 'PGRST205' ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist');
};

const missingColumnFromError = (error: any): string | null => {
  const message = `${error?.message || ''} ${error?.details || ''}`;
  const match = message.match(/Could not find the '([^']+)' column/i) || message.match(/column "([^"]+)" .* does not exist/i);
  return match?.[1] || null;
};

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

  // ref sempre com a versao mais nova das entries (evita closure stale em updateEntry)
  const entriesRef = useRef<MonthlyEntry[]>([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  // Lock para evitar getOrCreateEntries duplicado (race ao montar tela)
  const creatingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      console.warn('Timeout ao carregar sessao inicial do Supabase.');
      setLoading(false);
      setDataLoading(false);
    }, 12000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!active) return;
      setSession(sess);
      setLoading(false);
    });

    supabase.auth.getSession()
      .then(({ data: { session: sess } }) => {
        if (!active) return;
        setSession(sess);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Erro ao carregar sessao:', error);
        if (!active) return;
        setSession(null);
        setLoading(false);
        setDataLoading(false);
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!session) {
      setCompanies([]); setEmployees([]); setEntries([]); setFechamentos([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    try {
      const [companiesRes, employeesRes, fechamentosRes] = await Promise.all([
        supabase.from('empresas').select('*').order('nome'),
        supabase.from('funcionarios').select('*').order('nome'),
        supabase.from('fechamentos_filial').select('*'),
      ]);

      if (companiesRes.error) console.error('Erro ao carregar empresas:', companiesRes.error);
      if (employeesRes.error) console.error('Erro ao carregar funcionarios:', employeesRes.error);
      if (fechamentosRes.error && !isMissingSchema(fechamentosRes.error)) console.error('Erro ao carregar fechamentos:', fechamentosRes.error);

      setCompanies((companiesRes.data || []).map(mapCompany));
      setEmployees((employeesRes.data || []).map(mapEmployee));
      setFechamentos(fechamentosRes.error ? [] : ((fechamentosRes.data || []).map(mapFechamento)));

      const entriesRes = await supabase
        .from('lancamentos_mensais')
        .select('*')
        .is('apagado_em', null);

      if (entriesRes.error) {
        if (isMissingSchema(entriesRes.error)) {
          setEntries([]);
        } else {
          console.error('Erro ao carregar lancamentos mensais:', entriesRes.error);
        }
      } else {
        setEntries((entriesRes.data || []).map(mapEntry));
      }
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
    const currentEmployee = employees.find(e => e.id === id);
    const row = employeeToRow({
      ...data,
      name: data.name ?? currentEmployee?.name,
      cargo: data.cargo ?? currentEmployee?.cargo,
      insalubridadeValor: data.insalubridadeValor ?? currentEmployee?.insalubridadeValor,
    });
    const hasBankingData = ['pix', 'banco', 'agencia', 'conta'].some((key) =>
      Object.prototype.hasOwnProperty.call(data, key),
    );
    if (hasBankingData || data.observacoes !== undefined) {
      row.observacoes = buildEmployeeObservacoes(
        data.observacoes ?? currentEmployee?.observacoes ?? '',
        {
          pix: data.pix ?? currentEmployee?.pix ?? '',
          banco: data.banco ?? currentEmployee?.banco ?? '',
          agencia: data.agencia ?? currentEmployee?.agencia ?? '',
          conta: data.conta ?? currentEmployee?.conta ?? '',
        },
      );
    }
    if (Object.keys(row).length > 0) {
      let payload = { ...row };
      let result = await supabase
        .from('funcionarios')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      let missingColumn = missingColumnFromError(result.error);
      while (result.error && missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
        delete payload[missingColumn];
        if (Object.keys(payload).length === 0) break;
        result = await supabase
          .from('funcionarios')
          .update(payload)
          .eq('id', id)
          .select('*')
          .single();
        missingColumn = missingColumnFromError(result.error);
      }

      const { data: saved, error } = result;
      if (error) {
        console.error('Erro ao salvar funcionario:', error);
        toast.error('Erro ao salvar funcionario: ' + error.message);
        await fetchData();
        return { ok: false, error };
      }
      if (saved) {
        setEmployees(prev => prev.map(e => e.id === id ? mapEmployee(saved) : e));
      }
    }
    return { ok: true };
  }, [employees, fetchData]);

  /**
   * Garante que existem lancamentos para todos os funcionarios ativos da empresa/competencia.
   * Usa lock para impedir corrida quando a pagina chama duas vezes em sequencia.
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
      insalubridadeAplicada: employeeHasInsalubridade(emp),
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
          console.error('Erro ao criar lancamentos:', error);
          return;
        }
        if (data) {
          setEntries(prev => {
            // Remove apenas os otimistas SEM id desta empresa/competencia
            const limpa = prev.filter(e => !(e.companyId === companyId && e.competencia === competencia && !e.id));
            const novos = data.map(mapEntry);
            // Mantem quem ja existia (com id) e adiciona os novos
            return [...limpa.filter(e => !novos.some(n => n.id === e.id)), ...novos];
          });
        }
      });

    // Otimista: adiciona localmente para UI responder na hora
    setEntries(prev => [...prev, ...newEntries]);
    return [...existing, ...newEntries];
  }, [employees]);

  /**
   * updateEntry - corrigido para:
   * - sempre ler entry atual da REF (nao da closure)
   * - persistir SEMPRE que houver id; sem id, agendar persistencia depois que o insert criar
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
      // Nao tem id ainda - faz upsert por chave (funcionario_id, competencia)
      const fullRow = {
        ...entryToRow({ employeeId, competencia, ...data }),
      };
      supabase.from('lancamentos_mensais')
        .upsert(fullRow, { onConflict: 'funcionario_id,competencia' })
        .select()
        .single()
        .then(({ data: saved, error }) => {
          if (error) { console.error('upsert lancamento falhou:', error); return; }
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
   * deleteEntry - soft-delete: marca apagado_em + zera variaveis para sair do calculo,
   * mantendo historico no banco para auditoria.
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

  const updateFechamento = useCallback(async (
    companyId: string,
    competencia: string,
    data: Partial<Fechamento>,
    options: { persist?: boolean } = {},
  ): Promise<{ ok: boolean; error?: unknown }> => {
    const current = fechamentos.find(f => f.companyId === companyId && f.competencia === competencia);
    const nextFechamento: Fechamento = {
      companyId,
      competencia,
      status: 'aberto',
      observacoes: '',
      ...current,
      ...data,
    };

    setFechamentos(prev => {
      const idx = prev.findIndex(f => f.companyId === companyId && f.competencia === competencia);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...data };
        return updated;
      }
      return [...prev, nextFechamento];
    });

    if (options.persist === false) return { ok: true };

    try {
      const userName = session?.user?.user_metadata?.nome_completo ||
        session?.user?.user_metadata?.full_name ||
        session?.user?.email ||
        '';
      const isFechado = nextFechamento.status === 'fechado';
      const fechadoEm = isFechado
        ? (nextFechamento.dataFechamento || new Date().toISOString())
        : (nextFechamento.dataFechamento || current?.dataFechamento || null);

      const payload = {
        company_id: companyId,
        competencia,
        status: nextFechamento.status,
        observacoes: nextFechamento.observacoes || '',
        fechado_em: fechadoEm,
        fechado_por_nome: isFechado ? userName : (nextFechamento.fechadoPorNome || current?.fechadoPorNome || ''),
      };

      const { data: saved, error } = await supabase
        .from('fechamentos_filial')
        .upsert(payload as any, { onConflict: 'company_id,competencia' })
        .select('*')
        .single();

      if (error) {
        console.error('Erro Supabase ao salvar fechamento:', error, { etapa: 'upsert_fechamentos_filial', payload });
        throw error;
      }

      const savedFechamento = mapFechamento(saved);
      setFechamentos(prev => {
        const idx = prev.findIndex(f => f.companyId === companyId && f.competencia === competencia);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedFechamento;
          return updated;
        }
        return [...prev, savedFechamento];
      });

      const lancamentoPatch: Record<string, unknown> = {
        fechamento_id: savedFechamento.id,
        bloqueado: isFechado,
      };

      const { error: lancError } = await supabase
        .from('lancamentos_mensais')
        .update(lancamentoPatch as any)
        .eq('company_id', companyId)
        .eq('competencia', competencia)
        .is('apagado_em', null);

      if (lancError) {
        console.error('Erro Supabase ao salvar fechamento:', lancError, { etapa: 'vincular_lancamentos_mensais', payload: lancamentoPatch });
        throw lancError;
      }

      setEntries(prev => prev.map(entry =>
        entry.companyId === companyId && entry.competencia === competencia
          ? { ...entry, fechamentoId: savedFechamento.id || null, bloqueado: isFechado }
          : entry,
      ));

      if (session?.user?.id && savedFechamento.id) {
        const acao = isFechado ? 'fechado' : (current?.id ? 'ajustado' : 'criado');
        const { error: histError } = await supabase.from('fechamentos_historico').insert({
          fechamento_id: savedFechamento.id,
          acao,
          user_id: session.user.id,
          usuario_nome: userName || session.user.email || 'Sistema',
          detalhes: {
            status: savedFechamento.status,
            total_funcionarios: Math.round(Number(nextFechamento.totalFuncionarios) || 0),
            total_proventos: Number(nextFechamento.totalProventos) || 0,
            total_descontos: Number(nextFechamento.totalDescontos) || 0,
            total_liquido: Number(nextFechamento.totalLiquido) || 0,
          },
        } as any);
        if (histError) console.error('Erro ao registrar historico do fechamento:', histError);
      }

      return { ok: true };
    } catch (error) {
      console.error('Erro Supabase ao salvar fechamento:', error);
      return { ok: false, error };
    }
  }, [fechamentos, session]);

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
      refreshData: fetchData,
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
