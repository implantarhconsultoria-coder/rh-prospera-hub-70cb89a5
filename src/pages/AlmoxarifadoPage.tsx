import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Building2, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { AppContext } from '@/context/AppContextValue';
import { supabase } from '@/integrations/supabase/client';
import LegacyAlmoxarifadoPage from '@/pages/AlmoxarifadoPageLegacy';

const STORAGE_KEY = 'topac_almox_company_id';
const TOPAC_COMPANY_CODES = new Set(['topac-matriz', 'topac-pg', 'topac-gyn']);

type ScopeState = 'idle' | 'loading' | 'ready' | 'error';

const AlmoxarifadoPage: React.FC = () => {
  const location = useLocation();
  const app = useApp();
  const { session, companies, dataLoading } = app;
  const isExternalPortal = location.pathname.includes('/almoxarifado-ext/');

  const topacCompanies = useMemo(
    () => companies
      .filter(company => TOPAC_COMPANY_CODES.has(company.codigo))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [companies],
  );

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(STORAGE_KEY) || '';
  });
  const [scopeState, setScopeState] = useState<ScopeState>('idle');

  const selectedCompany = useMemo(
    () => topacCompanies.find(company => company.id === selectedCompanyId) || null,
    [topacCompanies, selectedCompanyId],
  );

  const scopedApp = useMemo(() => {
    if (!selectedCompany) return app;
    return {
      ...app,
      companies: [selectedCompany],
      employees: app.employees.filter(employee => employee.companyId === selectedCompany.id),
    };
  }, [app, selectedCompany]);

  useEffect(() => {
    if (isExternalPortal || dataLoading) return;

    if (topacCompanies.length === 1 && !selectedCompanyId) {
      const onlyCompanyId = topacCompanies[0].id;
      window.localStorage.setItem(STORAGE_KEY, onlyCompanyId);
      setSelectedCompanyId(onlyCompanyId);
      return;
    }

    if (selectedCompanyId && !topacCompanies.some(company => company.id === selectedCompanyId)) {
      window.localStorage.removeItem(STORAGE_KEY);
      setSelectedCompanyId('');
      setScopeState('idle');
    }
  }, [dataLoading, isExternalPortal, selectedCompanyId, topacCompanies]);

  useEffect(() => {
    if (isExternalPortal || !session?.user?.id || !selectedCompanyId || !selectedCompany) return;

    let active = true;
    setScopeState('loading');

    supabase
      .rpc('almoxarifado_set_company_context' as any, { p_company_id: selectedCompanyId })
      .then(({ error }) => {
        if (!active) return;
        if (error) {
          console.error('[almoxarifado] falha ao definir empresa ativa', error);
          setScopeState('error');
          toast.error('Não foi possível validar a unidade do Almoxarifado.');
          return;
        }
        setScopeState('ready');
      });

    return () => { active = false; };
  }, [isExternalPortal, selectedCompany, selectedCompanyId, session?.user?.id]);

  if (isExternalPortal) return <LegacyAlmoxarifadoPage />;

  if (dataLoading) {
    return (
      <div className="min-h-[360px] flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Carregando unidades do Almoxarifado...
      </div>
    );
  }

  if (!selectedCompanyId || !selectedCompany) {
    return (
      <div className="max-w-xl mx-auto mt-10 card-premium p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Selecione a unidade do Almoxarifado</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Estoque, entradas, saídas, funcionários e histórico ficarão vinculados somente à unidade escolhida.
            </p>
          </div>
        </div>

        <select
          className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedCompanyId}
          onChange={event => {
            const value = event.target.value;
            setScopeState('loading');
            setSelectedCompanyId(value);
            if (value) window.localStorage.setItem(STORAGE_KEY, value);
            else window.localStorage.removeItem(STORAGE_KEY);
          }}
        >
          <option value="">Escolha a unidade...</option>
          {topacCompanies.map(company => (
            <option key={company.id} value={company.id}>{company.name}</option>
          ))}
        </select>

        {topacCompanies.length === 0 && (
          <p className="text-sm text-destructive">Nenhuma unidade TOPAC disponível para este acesso.</p>
        )}
      </div>
    );
  }

  if (scopeState === 'loading' || scopeState === 'idle') {
    return (
      <div className="min-h-[360px] flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Validando acesso à {selectedCompany.name}...
      </div>
    );
  }

  if (scopeState === 'error') {
    return (
      <div className="max-w-xl mx-auto mt-10 card-premium p-6 space-y-4">
        <h1 className="text-lg font-bold">Unidade não validada</h1>
        <p className="text-sm text-muted-foreground">
          O acesso à unidade selecionada não foi autorizado pelo banco. Nenhum dado do estoque foi carregado.
        </p>
        <button
          type="button"
          className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          onClick={() => {
            setScopeState('idle');
            setSelectedCompanyId('');
            window.localStorage.removeItem(STORAGE_KEY);
          }}
        >
          Selecionar outra unidade
        </button>
      </div>
    );
  }

  return (
    <AppContext.Provider value={scopedApp}>
      <div className="space-y-3">
        <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Unidade ativa</div>
              <div className="text-sm font-semibold truncate">{selectedCompany.name}</div>
            </div>
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={selectedCompanyId}
            onChange={event => {
              const value = event.target.value;
              setScopeState('loading');
              setSelectedCompanyId(value);
              window.localStorage.setItem(STORAGE_KEY, value);
            }}
          >
            {topacCompanies.map(company => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </div>

        <LegacyAlmoxarifadoPage key={selectedCompanyId} />
      </div>
    </AppContext.Provider>
  );
};

export default AlmoxarifadoPage;
