import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { registrarDocumento } from '@/lib/documentoHistorico';
import { buildPdfFileName, printDocumentAsPdf } from '@/lib/savePdf';
import {
  buildEpiSnapshot,
  classifyEpiRole,
  consolidateEpiNeeds,
  daysBetweenIsoDates,
  EPI_RESPONSIBILITY_TEXT,
  isEpiRenewalAlert,
  isEpiRenewalOverdue,
  type EpiCatalogRow,
  type EpiEligibleEmployeeSnapshot,
  type EpiSnapshotItem,
} from '@/lib/epiRules';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  HardHat,
  History,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dateBr = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const userNameFrom = (session: any) => session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || session?.user?.email || 'Sistema';

const asItems = (value: unknown): EpiSnapshotItem[] => Array.isArray(value) ? value as EpiSnapshotItem[] : [];

type EpiEntrega = {
  id: string;
  solicitacao_id?: string | null;
  funcionario_id: string;
  company_id: string;
  funcionario_nome: string;
  cargo: string;
  empresa_nome: string;
  data_prevista: string;
  data_entrega?: string | null;
  proxima_reposicao?: string | null;
  status: 'emitida' | 'entregue' | 'cancelada';
  itens: EpiSnapshotItem[];
  termo_responsabilidade?: string;
  documento_funcionario_id?: string | null;
  created_at?: string;
};

type EpiSolicitacao = {
  id: string;
  data_referencia: string;
  status: 'rascunho' | 'para_aprovacao' | 'aprovada' | 'comprada' | 'cancelada';
  observacoes?: string;
  criado_por_nome?: string;
  aprovado_por_nome?: string | null;
  aprovado_em?: string | null;
  created_at?: string;
};

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  para_aprovacao: 'Aguardando aprovação',
  aprovada: 'Aprovada',
  comprada: 'Compra realizada',
  cancelada: 'Cancelada',
  emitida: 'Ficha emitida',
  entregue: 'Entrega efetivada',
};

const statusClass = (status: string) => {
  if (status === 'entregue' || status === 'aprovada' || status === 'comprada') return 'bg-success text-success-foreground';
  if (status === 'cancelada') return 'bg-destructive text-destructive-foreground';
  return 'bg-warning text-warning-foreground';
};

const EPIPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const fichaId = searchParams.get('ficha');
  const solicitacaoId = searchParams.get('solicitacao');

  if (fichaId) return <EpiFichaPersistida id={fichaId} onBack={() => setSearchParams({})} />;
  if (solicitacaoId) return <EpiSolicitacaoRelatorio id={solicitacaoId} onBack={() => setSearchParams({})} />;

  return <EpiGestaoHome onOpenFicha={(id) => setSearchParams({ ficha: id })} onOpenSolicitacao={(id) => setSearchParams({ solicitacao: id })} />;
};

const EpiGestaoHome: React.FC<{ onOpenFicha: (id: string) => void; onOpenSolicitacao: (id: string) => void }> = ({ onOpenFicha, onOpenSolicitacao }) => {
  const { companies, employees, session } = useApp();
  const [catalog, setCatalog] = useState<EpiCatalogRow[]>([]);
  const [externalIds, setExternalIds] = useState<Set<string>>(new Set());
  const [deliveries, setDeliveries] = useState<EpiEntrega[]>([]);
  const [requests, setRequests] = useState<EpiSolicitacao[]>([]);
  const [tab, setTab] = useState<'solicitacao' | 'entregas' | 'historico'>('solicitacao');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[] | null>(null);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const db = supabase as any;
      const [catalogRes, externalRes, deliveryRes, requestRes] = await Promise.all([
        db.from('epi_catalogo').select('*').eq('ativo', true).order('ordem'),
        db.rpc('epi_mecanicos_externos'),
        db.from('epi_entregas').select('*').order('created_at', { ascending: false }).limit(500),
        db.from('epi_solicitacoes').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      if (catalogRes.error) throw catalogRes.error;
      if (externalRes.error) throw externalRes.error;
      if (deliveryRes.error) throw deliveryRes.error;
      if (requestRes.error) throw requestRes.error;
      setCatalog((catalogRes.data || []) as EpiCatalogRow[]);
      setExternalIds(new Set((externalRes.data || []).map((row: any) => String(row.funcionario_id))));
      setDeliveries((deliveryRes.data || []).map((row: any) => ({ ...row, itens: asItems(row.itens) })) as EpiEntrega[]);
      setRequests((requestRes.data || []) as EpiSolicitacao[]);
    } catch (error: any) {
      console.error('Falha ao carregar módulo de EPI:', error);
      toast.error(error?.message || 'Não foi possível carregar o módulo de EPI.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const companyMap = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const selectedCompanyNames = useMemo(() => {
    if (selectedCompanyIds === null) return companies.map((company) => company.name);
    const selected = new Set(selectedCompanyIds);
    return companies.filter((company) => selected.has(company.id)).map((company) => company.name);
  }, [companies, selectedCompanyIds]);

  const companyPickerLabel = useMemo(() => {
    if (selectedCompanyIds === null) return 'Todas as empresas';
    if (selectedCompanyIds.length === 0) return 'Nenhuma empresa selecionada';
    if (selectedCompanyIds.length === 1) return selectedCompanyNames[0] || '1 empresa selecionada';
    return `${selectedCompanyIds.length} empresas selecionadas`;
  }, [selectedCompanyIds, selectedCompanyNames]);

  const toggleCompany = (companyId: string) => {
    setSelectedCompanyIds((current) => {
      if (current === null) return [companyId];
      if (current.includes(companyId)) return current.filter((id) => id !== companyId);
      return [...current, companyId];
    });
  };

  const companyIsSelected = (companyId: string) => selectedCompanyIds !== null && selectedCompanyIds.includes(companyId);
  const companyAllowed = (companyId: string) => selectedCompanyIds === null || selectedCompanyIds.includes(companyId);

  const eligible = useMemo<EpiEligibleEmployeeSnapshot[]>(() => employees
    .filter((employee) => employee.status === 'ativo' && classifyEpiRole(employee.cargo).eligible)
    .map((employee) => {
      const company = companyMap.get(employee.companyId);
      const mecanicoExterno = externalIds.has(employee.id);
      return {
        employeeId: employee.id,
        companyId: employee.companyId,
        employeeName: employee.name,
        cargo: employee.cargo || '',
        companyName: company?.name || 'Empresa não identificada',
        mecanicoExterno,
        items: buildEpiSnapshot(catalog, employee.cargo, mecanicoExterno),
      };
    })
    .filter((employee) => employee.items.length > 0), [employees, companyMap, externalIds, catalog]);

  const filteredEligible = useMemo(() => eligible.filter((employee) => {
    if (!companyAllowed(employee.companyId)) return false;
    const q = employeeSearch.trim().toLowerCase();
    if (q && !`${employee.employeeName} ${employee.cargo} ${employee.companyName}`.toLowerCase().includes(q)) return false;
    return true;
  }), [eligible, selectedCompanyIds, employeeSearch]);

  const consolidated = useMemo(() => consolidateEpiNeeds(filteredEligible), [filteredEligible]);
  const latestRequest = requests.find((request) => request.status !== 'cancelada') || null;
  const today = todayIso();
  const renewalAlerts = deliveries.filter((delivery) => delivery.status === 'entregue' && (isEpiRenewalAlert(delivery.proxima_reposicao, today) || isEpiRenewalOverdue(delivery.proxima_reposicao, today)));
  const filteredRenewalAlerts = renewalAlerts.filter((delivery) => companyAllowed(delivery.company_id));
  const filteredDeliveries = deliveries.filter((delivery) => companyAllowed(delivery.company_id));

  const lastDeliveryByEmployee = useMemo(() => {
    const map = new Map<string, EpiEntrega>();
    deliveries.filter((d) => d.status !== 'cancelada').forEach((delivery) => {
      if (!map.has(delivery.funcionario_id)) map.set(delivery.funcionario_id, delivery);
    });
    return map;
  }, [deliveries]);

  const registerProfileDocument = async ({ employee, type, description, fileName, date, observation }: {
    employee: EpiEligibleEmployeeSnapshot;
    type: string;
    description: string;
    fileName: string;
    date: string;
    observation: string;
  }) => {
    try {
      await registrarDocumento({
        funcionarioId: employee.employeeId,
        funcionarioNome: employee.employeeName,
        companyId: employee.companyId,
        empresaNome: employee.companyName,
        tipoDocumento: type,
        competencia: date.slice(0, 7),
        descricao: description,
        geradoPorUserId: session?.user?.id || ZERO_UUID,
        geradoPorNome: userNameFrom(session),
        unidade: employee.companyName,
        categoria: 'EPI',
        origem: 'gerado_sistema',
        observacao: observation,
        nomeArquivo: fileName,
        dataDocumento: new Date().toISOString(),
      });
    } catch (error) {
      console.error('EPI persistido, mas não foi possível registrar no histórico documental:', error);
    }
  };

  const generateRequest = async () => {
    if (!filteredEligible.length) return toast.error('Não há funcionários elegíveis nas empresas selecionadas.');
    if (!session?.user) return toast.error('Sessão inválida. Entre novamente.');
    setSaving(true);
    try {
      const db = supabase as any;
      const scopeText = selectedCompanyIds === null
        ? 'Consolidação multiempresas para entrega semestral de EPI.'
        : `Consolidação das empresas selecionadas para entrega semestral de EPI: ${selectedCompanyNames.join(', ')}.`;
      const { data: request, error } = await db.from('epi_solicitacoes').insert({
        data_referencia: deliveryDate,
        status: 'para_aprovacao',
        criado_por: session.user.id,
        criado_por_nome: userNameFrom(session),
        observacoes: scopeText,
      }).select('*').single();
      if (error) throw error;

      const snapshotRows = filteredEligible.map((employee) => ({
        solicitacao_id: request.id,
        funcionario_id: employee.employeeId,
        company_id: employee.companyId,
        funcionario_nome: employee.employeeName,
        cargo: employee.cargo,
        empresa_nome: employee.companyName,
        mecanico_externo: employee.mecanicoExterno,
        itens: employee.items,
      }));
      const { error: snapshotError } = await db.from('epi_solicitacao_funcionarios').insert(snapshotRows);
      if (snapshotError) throw snapshotError;

      await db.from('epi_historico').insert(filteredEligible.map((employee) => ({
        solicitacao_id: request.id,
        funcionario_id: employee.employeeId,
        company_id: employee.companyId,
        acao: 'incluido_solicitacao_semestral',
        detalhes: { data_referencia: deliveryDate, itens: employee.items },
        user_id: session.user.id,
        usuario_nome: userNameFrom(session),
      })));

      await Promise.allSettled(filteredEligible.map((employee) => registerProfileDocument({
        employee,
        type: 'Lista Semestral de EPI - Solicitação',
        description: `Incluído na solicitação semestral de EPI com ${employee.items.length} item(ns).`,
        fileName: buildPdfFileName('Lista EPI', employee.companyName, employee.employeeName, deliveryDate),
        date: deliveryDate,
        observation: `Solicitação consolidada ${request.id}.`,
      })));

      await reload();
      toast.success('Solicitação consolidada gerada somente para as empresas selecionadas.');
      onOpenSolicitacao(request.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Não foi possível gerar a solicitação de EPI.');
    } finally {
      setSaving(false);
    }
  };

  const createFicha = async (employee: EpiEligibleEmployeeSnapshot, requestId?: string | null, open = true) => {
    if (!session?.user) throw new Error('Sessão inválida.');
    const db = supabase as any;
    const existing = deliveries.find((delivery) => delivery.funcionario_id === employee.employeeId && delivery.status === 'emitida');
    let delivery: any = existing;
    if (existing) {
      const { data, error } = await db.from('epi_entregas').update({
        solicitacao_id: requestId || existing.solicitacao_id || null,
        data_prevista: deliveryDate,
        itens: employee.items,
        criado_por_nome: userNameFrom(session),
      }).eq('id', existing.id).select('*').single();
      if (error) throw error;
      delivery = data;
    } else {
      const { data, error } = await db.from('epi_entregas').insert({
        solicitacao_id: requestId || null,
        funcionario_id: employee.employeeId,
        company_id: employee.companyId,
        funcionario_nome: employee.employeeName,
        cargo: employee.cargo,
        empresa_nome: employee.companyName,
        data_prevista: deliveryDate,
        status: 'emitida',
        itens: employee.items,
        termo_responsabilidade: EPI_RESPONSIBILITY_TEXT,
        criado_por: session.user.id,
        criado_por_nome: userNameFrom(session),
      }).select('*').single();
      if (error) throw error;
      delivery = data;

      await db.from('epi_historico').insert({
        entrega_id: delivery.id,
        solicitacao_id: requestId || null,
        funcionario_id: employee.employeeId,
        company_id: employee.companyId,
        acao: 'ficha_emitida',
        detalhes: { data_prevista: deliveryDate, itens: employee.items },
        user_id: session.user.id,
        usuario_nome: userNameFrom(session),
      });

      const doc = await registrarDocumento({
        funcionarioId: employee.employeeId,
        funcionarioNome: employee.employeeName,
        companyId: employee.companyId,
        empresaNome: employee.companyName,
        tipoDocumento: 'Ficha de Entrega - EPI Semestral',
        competencia: deliveryDate.slice(0, 7),
        descricao: `Ficha semestral de EPI emitida com ${employee.items.length} item(ns). Data prevista: ${dateBr(deliveryDate)}.`,
        geradoPorUserId: session.user.id,
        geradoPorNome: userNameFrom(session),
        unidade: employee.companyName,
        categoria: 'EPI',
        origem: 'gerado_sistema',
        observacao: `Ficha EPI ${delivery.id}. A entrega física ainda deve ser oficializada.`,
        nomeArquivo: buildPdfFileName('Ficha EPI', employee.companyName, employee.employeeName, deliveryDate),
        dataDocumento: new Date().toISOString(),
      });
      if ((doc as any)?.id) await db.from('epi_entregas').update({ documento_funcionario_id: (doc as any).id }).eq('id', delivery.id);
    }
    await reload();
    if (open) onOpenFicha(delivery.id);
    return delivery;
  };

  const generateAllFichas = async () => {
    if (!filteredEligible.length) return toast.error('Não há funcionários elegíveis nas empresas selecionadas.');
    setSaving(true);
    try {
      for (const employee of filteredEligible) await createFicha(employee, latestRequest?.id || null, false);
      toast.success(`${filteredEligible.length} ficha(s) nominal(is) preparada(s).`);
      setTab('entregas');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível preparar todas as fichas.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card-premium p-10 text-center text-muted-foreground"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" />Carregando gestão de EPI...</div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center"><HardHat className="w-7 h-7" /></div>
            <div>
              <h1 className="text-2xl font-bold font-display">Gestão e Fichas de EPI</h1>
              <p className="text-primary-foreground/70 text-sm">Solicitação, entrega semestral, reposição e histórico individual</p>
            </div>
          </div>
          <Button variant="secondary" onClick={reload}><RefreshCw className="w-4 h-4 mr-2" />Atualizar</Button>
        </div>
      </div>

      {filteredRenewalAlerts.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <CalendarClock className="w-5 h-5 text-warning mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-foreground">Organizar nova entrega semestral</p>
              <p className="text-sm text-muted-foreground">{filteredRenewalAlerts.length} colaborador(es) das empresas selecionadas já estão no prazo de 7 dias ou com reposição vencida.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {filteredRenewalAlerts.slice(0, 8).map((delivery) => (
                  <button key={delivery.id} className="text-xs border rounded-full px-3 py-1 bg-background" onClick={() => onOpenFicha(delivery.id)}>
                    {delivery.funcionario_nome} · {dateBr(delivery.proxima_reposicao)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric icon={<Users className="w-4 h-4" />} label="Elegíveis ativos" value={filteredEligible.length} />
        <Metric icon={<ShoppingCart className="w-4 h-4" />} label="Itens consolidados" value={consolidated.reduce((sum, item) => sum + item.quantidade, 0)} />
        <Metric icon={<ShieldCheck className="w-4 h-4" />} label="Mecânicos externos" value={filteredEligible.filter((employee) => employee.mecanicoExterno).length} />
        <Metric icon={<AlertTriangle className="w-4 h-4" />} label="Alertas semestrais" value={filteredRenewalAlerts.length} />
      </div>

      <div className="card-premium overflow-hidden">
        <div className="flex overflow-x-auto border-b">
          <TabButton active={tab === 'solicitacao'} onClick={() => setTab('solicitacao')} icon={<ShoppingCart className="w-4 h-4" />} label="Etapa A · Solicitação / Compra" />
          <TabButton active={tab === 'entregas'} onClick={() => setTab('entregas')} icon={<ClipboardCheck className="w-4 h-4" />} label="Etapa B · Fichas / Entrega" />
          <TabButton active={tab === 'historico'} onClick={() => setTab('historico')} icon={<History className="w-4 h-4" />} label="Histórico" />
        </div>

        <div className="p-5 space-y-4">
          <div className="grid md:grid-cols-[1fr_300px_190px] gap-3 items-end no-print">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Buscar funcionário / função / empresa</label>
              <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" /><Input className="pl-9" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Buscar..." /></div>
            </div>
            <div className="relative">
              <label className="text-xs text-muted-foreground block mb-1">Empresas</label>
              <button type="button" onClick={() => setCompanyPickerOpen((open) => !open)} className="w-full min-h-10 border rounded-lg px-3 py-2 bg-background text-foreground text-sm text-left flex items-center justify-between gap-2">
                <span className="truncate">{companyPickerLabel}</span>
                <span className="text-muted-foreground">▾</span>
              </button>
              {companyPickerOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-xl border bg-background shadow-xl p-2 max-h-72 overflow-y-auto">
                  <button type="button" onClick={() => setSelectedCompanyIds(null)} className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-muted ${selectedCompanyIds === null ? 'bg-primary/10 text-primary font-semibold' : ''}`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${selectedCompanyIds === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>{selectedCompanyIds === null ? '✓' : ''}</span>
                    Todas as empresas
                  </button>
                  <div className="my-1 border-t" />
                  {companies.map((company) => (
                    <button key={company.id} type="button" onClick={() => toggleCompany(company.id)} className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-muted ${companyIsSelected(company.id) ? 'bg-primary/5' : ''}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${companyIsSelected(company.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>{companyIsSelected(company.id) ? '✓' : ''}</span>
                      <span className="truncate">{company.name}</span>
                    </button>
                  ))}
                  <div className="pt-2 mt-1 border-t flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">Selecione 1, 2, 3 ou mais empresas</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setCompanyPickerOpen(false)}>Concluir</Button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Data da entrega / referência</label>
              <Input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
            </div>
          </div>

          {selectedCompanyIds !== null && selectedCompanyIds.length > 0 && (
            <div className="no-print flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Empresas selecionadas:</span>
              {selectedCompanyNames.map((name) => <Badge key={name} variant="outline">{name}</Badge>)}
              <button type="button" onClick={() => setSelectedCompanyIds(null)} className="text-primary hover:underline">Limpar seleção</button>
            </div>
          )}

          {selectedCompanyIds !== null && selectedCompanyIds.length === 0 && (
            <div className="no-print rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">Selecione pelo menos uma empresa para gerar a solicitação ou as fichas.</div>
          )}

          {tab === 'solicitacao' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-bold text-foreground">Necessidade consolidada</h2>
                  <p className="text-xs text-muted-foreground">Calculada somente para as empresas marcadas e para Mecânicos, Pintores e funções da Oficina. Capacete não integra o catálogo.</p>
                </div>
                <div className="flex flex-wrap gap-2 no-print">
                  <Button variant="outline" disabled={saving || !filteredEligible.length} onClick={generateAllFichas}><FileText className="w-4 h-4 mr-2" />Preparar fichas nominais</Button>
                  <Button disabled={saving || !filteredEligible.length} onClick={generateRequest}><ShoppingCart className="w-4 h-4 mr-2" />{saving ? 'Gerando...' : 'Gerar solicitação consolidada'}</Button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs"><tr><th className="text-left p-3">EPI</th><th className="text-left p-3">Grupo / regra</th><th className="text-center p-3">CA</th><th className="text-center p-3">Funcionários</th><th className="text-center p-3">Qtd. comprar</th><th className="text-left p-3">Por empresa</th></tr></thead>
                  <tbody className="divide-y">
                    {consolidated.map((item) => (
                      <tr key={item.codigo} className="hover:bg-muted/20">
                        <td className="p-3 font-medium">{item.nome}</td>
                        <td className="p-3 text-xs text-muted-foreground">{item.grupo}</td>
                        <td className="p-3 text-center">{item.ca || '—'}</td>
                        <td className="p-3 text-center">{item.funcionarios}</td>
                        <td className="p-3 text-center font-bold text-primary">{item.quantidade}</td>
                        <td className="p-3 text-xs text-muted-foreground">{Object.entries(item.empresas).map(([company, qty]) => `${company}: ${qty}`).join(' · ')}</td>
                      </tr>
                    ))}
                    {!consolidated.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum funcionário elegível para as empresas selecionadas.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <div className="bg-muted/30 p-3 flex items-center justify-between"><strong className="text-sm">Solicitações recentes</strong><span className="text-xs text-muted-foreground">Diretor / Compras</span></div>
                <div className="divide-y">
                  {requests.slice(0, 8).map((request) => (
                    <div key={request.id} className="p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div><p className="text-sm font-medium">Entrega semestral · {dateBr(request.data_referencia)}</p><p className="text-xs text-muted-foreground">Criada por {request.criado_por_nome || 'Sistema'} · {dateBr(request.created_at)}</p></div>
                      <div className="flex items-center gap-2"><Badge className={statusClass(request.status)}>{statusLabel[request.status] || request.status}</Badge><Button size="sm" variant="outline" onClick={() => onOpenSolicitacao(request.id)}><Printer className="w-4 h-4 mr-1" />Abrir relatório</Button></div>
                    </div>
                  ))}
                  {!requests.length && <p className="p-5 text-sm text-muted-foreground">Nenhuma solicitação semestral registrada.</p>}
                </div>
              </div>
            </div>
          )}

          {tab === 'entregas' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between"><div><h2 className="font-bold">Fichas nominais</h2><p className="text-xs text-muted-foreground">A lista abaixo respeita exatamente as empresas selecionadas.</p></div><Button variant="outline" disabled={saving || !filteredEligible.length} onClick={generateAllFichas}><PackageCheck className="w-4 h-4 mr-2" />Preparar todas</Button></div>
              <div className="divide-y border rounded-xl">
                {filteredEligible.map((employee) => {
                  const last = lastDeliveryByEmployee.get(employee.employeeId);
                  const role = classifyEpiRole(employee.cargo);
                  return (
                    <div key={employee.employeeId} className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0"><p className="font-semibold text-sm">{employee.employeeName}</p><p className="text-xs text-muted-foreground">{employee.companyName} · {employee.cargo}</p><div className="mt-2 flex flex-wrap gap-1"><Badge variant="outline">{employee.items.length} EPIs</Badge>{role.isPainter && <Badge variant="outline">Air Tox II · CA 5757</Badge>}{employee.mecanicoExterno && <Badge variant="outline">Protetor Solar</Badge>}</div></div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {last ? <><Badge className={statusClass(last.status)}>{statusLabel[last.status]}</Badge><span className="text-xs text-muted-foreground">{last.status === 'entregue' ? `Próxima: ${dateBr(last.proxima_reposicao)}` : `Prevista: ${dateBr(last.data_prevista)}`}</span><Button size="sm" variant="outline" onClick={() => onOpenFicha(last.id)}>Abrir ficha</Button></> : <Button size="sm" onClick={async () => { setSaving(true); try { await createFicha(employee, latestRequest?.id || null); } catch (error: any) { toast.error(error?.message || 'Falha ao gerar ficha.'); } finally { setSaving(false); } }} disabled={saving}><FileText className="w-4 h-4 mr-1" />Gerar ficha</Button>}
                      </div>
                    </div>
                  );
                })}
                {!filteredEligible.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum funcionário elegível encontrado nas empresas selecionadas.</p>}
              </div>
            </div>
          )}

          {tab === 'historico' && (
            <div className="space-y-3">
              <div><h2 className="font-bold">Histórico de fichas e ciclos</h2><p className="text-xs text-muted-foreground">O histórico também acompanha a seleção múltipla de empresas.</p></div>
              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-sm min-w-[850px]"><thead className="bg-muted/60 text-xs"><tr><th className="p-3 text-left">Funcionário</th><th className="p-3 text-left">Empresa</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Data entrega</th><th className="p-3 text-left">Próxima reposição</th><th className="p-3 text-center">Itens</th><th className="p-3"></th></tr></thead><tbody className="divide-y">{filteredDeliveries.map((delivery) => <tr key={delivery.id}><td className="p-3 font-medium">{delivery.funcionario_nome}<span className="block text-xs text-muted-foreground">{delivery.cargo}</span></td><td className="p-3">{delivery.empresa_nome}</td><td className="p-3"><Badge className={statusClass(delivery.status)}>{statusLabel[delivery.status]}</Badge></td><td className="p-3">{dateBr(delivery.data_entrega || delivery.data_prevista)}</td><td className="p-3">{dateBr(delivery.proxima_reposicao)}</td><td className="p-3 text-center">{delivery.itens.length}</td><td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => onOpenFicha(delivery.id)}>Abrir</Button></td></tr>)}{!filteredDeliveries.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhuma ficha EPI nas empresas selecionadas.</td></tr>}</tbody></table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <div className="card-premium p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><strong className="text-2xl mt-2 block">{value}</strong></div>
);

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-5 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${active ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{icon}{label}</button>
);

const EpiSolicitacaoRelatorio: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const { session } = useApp();
  const [request, setRequest] = useState<EpiSolicitacao | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const db = supabase as any;
    const [requestRes, rowsRes] = await Promise.all([
      db.from('epi_solicitacoes').select('*').eq('id', id).single(),
      db.from('epi_solicitacao_funcionarios').select('*').eq('solicitacao_id', id).order('empresa_nome').order('funcionario_nome'),
    ]);
    if (requestRes.error || rowsRes.error) toast.error(requestRes.error?.message || rowsRes.error?.message || 'Solicitação não encontrada.');
    else { setRequest(requestRes.data); setRows(rowsRes.data || []); }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const employeeSnapshots = useMemo<EpiEligibleEmployeeSnapshot[]>(() => rows.map((row) => ({ employeeId: row.funcionario_id, companyId: row.company_id, employeeName: row.funcionario_nome, cargo: row.cargo, companyName: row.empresa_nome, mecanicoExterno: !!row.mecanico_externo, items: asItems(row.itens) })), [rows]);
  const consolidated = useMemo(() => consolidateEpiNeeds(employeeSnapshots), [employeeSnapshots]);
  const companies = useMemo(() => Array.from(new Set(rows.map((row) => row.empresa_nome))), [rows]);

  const print = () => printDocumentAsPdf(buildPdfFileName('Solicitacao EPI', 'Multiempresas', request?.data_referencia || todayIso()));
  const approve = async () => {
    if (!session?.user || !request) return;
    const { error } = await (supabase as any).from('epi_solicitacoes').update({ status: 'aprovada', aprovado_por: session.user.id, aprovado_por_nome: userNameFrom(session), aprovado_em: new Date().toISOString() }).eq('id', request.id);
    if (error) return toast.error(error.message);
    toast.success('Solicitação aprovada para compra.');
    load();
  };

  if (loading) return <div className="p-10 text-center text-muted-foreground">Carregando relatório...</div>;
  if (!request) return <div className="p-10 text-center">Solicitação indisponível.</div>;

  return (
    <div className="bg-white text-black min-h-screen" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <style>{`@page{size:A4 landscape;margin:8mm}@media print{html,body{background:white!important;margin:0!important;padding:0!important}body *{visibility:hidden!important}#epi-request-print,#epi-request-print *{visibility:visible!important}#epi-request-print{position:absolute;left:0;top:0;width:100%;margin:0!important;padding:0!important}.no-print{display:none!important}.epi-request-table thead{display:table-header-group}.epi-request-table tr{break-inside:avoid;page-break-inside:avoid}}`}</style>
      <div className="no-print px-6 py-3 bg-gray-100 border-b flex flex-wrap gap-2"><Button variant="outline" onClick={onBack}>← Voltar</Button><Button onClick={print}><Printer className="w-4 h-4 mr-2" />Imprimir / Salvar PDF</Button>{request.status === 'para_aprovacao' && <Button variant="secondary" onClick={approve}><CheckCircle2 className="w-4 h-4 mr-2" />Aprovar para compra</Button>}</div>
      <div id="epi-request-print" className="max-w-[297mm] mx-auto p-5">
        <div className="text-center border-b-2 border-black pb-3 mb-4"><h1 className="text-xl font-bold">TOPAC RH PRO</h1><h2 className="text-base font-bold mt-1">SOLICITAÇÃO CONSOLIDADA DE EPI — ENTREGA SEMESTRAL</h2><p className="text-xs mt-1">Data de referência: {dateBr(request.data_referencia)} · Empresas: {companies.join(' · ')}</p><p className="text-xs">Status: {statusLabel[request.status]}{request.aprovado_por_nome ? ` · Aprovado por ${request.aprovado_por_nome}` : ''}</p></div>
        <div className="grid grid-cols-3 gap-3 mb-4 text-xs"><div className="border p-3"><span className="text-gray-500 block">Funcionários elegíveis</span><strong className="text-lg">{rows.length}</strong></div><div className="border p-3"><span className="text-gray-500 block">Tipos de EPI</span><strong className="text-lg">{consolidated.length}</strong></div><div className="border p-3"><span className="text-gray-500 block">Unidades / empresas</span><strong className="text-lg">{companies.length}</strong></div></div>
        <table className="epi-request-table w-full border-collapse text-[9px]"><thead><tr className="bg-gray-200"><th className="border border-gray-400 p-1.5 text-left">EPI</th><th className="border border-gray-400 p-1.5 text-left">Grupo</th><th className="border border-gray-400 p-1.5 text-center">CA</th><th className="border border-gray-400 p-1.5 text-center">Funcionários</th><th className="border border-gray-400 p-1.5 text-center">Qtd. compra</th><th className="border border-gray-400 p-1.5 text-left">Distribuição por empresa</th></tr></thead><tbody>{consolidated.map((item) => <tr key={item.codigo}><td className="border border-gray-300 p-1.5 font-semibold">{item.nome}</td><td className="border border-gray-300 p-1.5">{item.grupo}</td><td className="border border-gray-300 p-1.5 text-center">{item.ca || '—'}</td><td className="border border-gray-300 p-1.5 text-center">{item.funcionarios}</td><td className="border border-gray-300 p-1.5 text-center font-bold">{item.quantidade}</td><td className="border border-gray-300 p-1.5">{Object.entries(item.empresas).map(([name, qty]) => `${name}: ${qty}`).join(' · ')}</td></tr>)}</tbody></table>
        <div className="mt-5 border rounded p-3 text-xs"><strong>Critérios aplicados:</strong> somente Mecânicos, Pintores e funções da Oficina; Air Tox II CA 5757 somente Pintores; Protetor Solar somente Mecânicos Externos cadastrados no App de Carros; Capacete de segurança removido.</div>
        <div className="grid grid-cols-2 gap-20 mt-14 text-center text-xs"><div className="border-t border-black pt-1">Responsável pela Solicitação / RH</div><div className="border-t border-black pt-1">Aprovação Diretoria / Compras</div></div>
      </div>
    </div>
  );
};

const EpiFichaPersistida: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const { employees, companies, session } = useApp();
  const [delivery, setDelivery] = useState<EpiEntrega | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from('epi_entregas').select('*').eq('id', id).single();
    if (error) toast.error(error.message);
    else {
      const row = { ...data, itens: asItems(data.itens) } as EpiEntrega;
      setDelivery(row);
      setEffectiveDate(row.data_entrega || row.data_prevista || todayIso());
    }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-10 text-center text-muted-foreground">Carregando ficha...</div>;
  if (!delivery) return <div className="p-10 text-center">Ficha EPI não encontrada.</div>;

  const emp = employees.find((employee) => employee.id === delivery.funcionario_id);
  const company = companies.find((item) => item.id === delivery.company_id);
  const printDate = delivery.data_entrega || effectiveDate || delivery.data_prevista;
  const print = () => printDocumentAsPdf(buildPdfFileName('Ficha EPI', delivery.empresa_nome, delivery.funcionario_nome, printDate));

  const officialize = async () => {
    if (!session?.user) return toast.error('Sessão inválida.');
    if (!effectiveDate) return toast.error('Informe a data efetiva da entrega.');
    if (!confirm(`Confirmar entrega física do KIT DE EPIs NOVOS em ${dateBr(effectiveDate)}? O ciclo de 6 meses será iniciado.`)) return;
    setSaving(true);
    try {
      const db = supabase as any;
      const { data, error } = await db.from('epi_entregas').update({
        data_entrega: effectiveDate,
        status: 'entregue',
        efetivado_por: session.user.id,
        efetivado_por_nome: userNameFrom(session),
        efetivado_em: new Date().toISOString(),
      }).eq('id', delivery.id).select('*').single();
      if (error) throw error;
      await db.from('epi_historico').insert({
        entrega_id: delivery.id,
        solicitacao_id: delivery.solicitacao_id || null,
        funcionario_id: delivery.funcionario_id,
        company_id: delivery.company_id,
        acao: 'entrega_efetivada',
        detalhes: { data_entrega: effectiveDate, proxima_reposicao: data.proxima_reposicao, itens: delivery.itens },
        user_id: session.user.id,
        usuario_nome: userNameFrom(session),
      });
      await registrarDocumento({
        funcionarioId: delivery.funcionario_id,
        funcionarioNome: delivery.funcionario_nome,
        companyId: delivery.company_id,
        empresaNome: delivery.empresa_nome,
        tipoDocumento: 'Entrega Semestral de EPI Efetivada',
        competencia: effectiveDate.slice(0, 7),
        descricao: `KIT DE EPIs NOVOS entregue em ${dateBr(effectiveDate)}. Próxima organização prevista para ${dateBr(data.proxima_reposicao)}.`,
        geradoPorUserId: session.user.id,
        geradoPorNome: userNameFrom(session),
        unidade: delivery.empresa_nome,
        categoria: 'EPI',
        origem: 'gerado_sistema',
        observacao: `Ciclo semestral da ficha ${delivery.id}.`,
        nomeArquivo: buildPdfFileName('Ficha EPI', delivery.empresa_nome, delivery.funcionario_nome, effectiveDate),
        dataDocumento: new Date().toISOString(),
      });
      toast.success(`Entrega oficializada. Próxima reposição: ${dateBr(data.proxima_reposicao)}.`);
      load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível oficializar a entrega.');
    } finally {
      setSaving(false);
    }
  };

  const daysToRenewal = delivery.proxima_reposicao ? daysBetweenIsoDates(todayIso(), delivery.proxima_reposicao) : null;
  const term = delivery.termo_responsabilidade || EPI_RESPONSIBILITY_TEXT;

  return (
    <div className="bg-white text-black min-h-screen" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <style>{`@page{size:A4;margin:12mm}@media print{html,body{margin:0!important;padding:0!important;background:white!important}body *{visibility:hidden!important}#epi-delivery-print,#epi-delivery-print *{visibility:visible!important}#epi-delivery-print{position:absolute;left:0;top:0;width:100%;margin:0!important;padding:0!important}.no-print{display:none!important}.epi-delivery-table thead{display:table-header-group}.epi-delivery-table tr{break-inside:avoid;page-break-inside:avoid}}`}</style>
      <div className="no-print flex flex-wrap items-end gap-3 px-6 py-3 bg-gray-100 border-b">
        <Button variant="outline" onClick={onBack}>← Voltar</Button>
        <Button variant="outline" onClick={print}><Printer className="w-4 h-4 mr-2" />Imprimir / Salvar PDF</Button>
        {delivery.status !== 'entregue' && <><div><label className="text-xs text-gray-600 block mb-1">Data da Entrega</label><Input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="bg-white" /></div><Button onClick={officialize} disabled={saving}><PackageCheck className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Oficializar entrega física'}</Button></>}
        {delivery.status === 'entregue' && <Badge className="bg-success text-success-foreground">Entrega efetiva: {dateBr(delivery.data_entrega)} · Próxima: {dateBr(delivery.proxima_reposicao)}</Badge>}
      </div>

      <div id="epi-delivery-print" className="max-w-[210mm] mx-auto px-8 py-6" style={{ fontSize: '11px' }}>
        <div className="border-b-2 border-black pb-3 mb-4"><div className="flex justify-between items-start"><div><h1 className="text-lg font-bold">{delivery.empresa_nome}</h1><p className="text-xs text-gray-600">CNPJ: {company?.cnpj || '—'}</p></div><div className="text-right"><p className="text-sm font-bold">FICHA DE ENTREGA DE EPI</p><p className="text-xs">Data da Entrega: {dateBr(printDate)}</p><p className="text-xs">Ciclo: Semestral</p></div></div></div>

        <div className="border border-gray-400 rounded p-3 mb-4"><p className="text-[9px] uppercase text-gray-500 mb-2 font-bold">DADOS DO COLABORADOR</p><div className="grid grid-cols-3 gap-2 text-xs"><div><span className="text-gray-500">Nome:</span> <strong>{delivery.funcionario_nome}</strong></div><div><span className="text-gray-500">Função:</span> {delivery.cargo}</div><div><span className="text-gray-500">CPF:</span> {emp?.cpf || '—'}</div><div><span className="text-gray-500">RG:</span> {emp?.rg || '—'}</div><div><span className="text-gray-500">Matrícula:</span> {emp?.registro || '—'}</div><div><span className="text-gray-500">Empresa:</span> {delivery.empresa_nome}</div><div><span className="text-gray-500">CNPJ:</span> {company?.cnpj || '—'}</div><div><span className="text-gray-500">Unidade:</span> {company?.city || delivery.empresa_nome}</div><div><span className="text-gray-500">Admissão:</span> {dateBr(emp?.dataAdmissao)}</div></div></div>

        <table className="epi-delivery-table w-full border-collapse mb-4 text-[10px]"><thead><tr className="bg-gray-200"><th className="border border-gray-400 px-2 py-1 text-left">Item / Descrição</th><th className="border border-gray-400 px-2 py-1 text-center">CA</th><th className="border border-gray-400 px-2 py-1 text-center">Tamanho</th><th className="border border-gray-400 px-2 py-1 text-center">Qtd</th><th className="border border-gray-400 px-2 py-1 text-left">Observação</th></tr></thead><tbody>{delivery.itens.map((item, index) => <tr key={`${item.codigo}-${index}`} className="even:bg-gray-50"><td className="border border-gray-300 px-2 py-1">{item.nome}<span className="block text-[8px] text-gray-500">{item.grupo}</span></td><td className="border border-gray-300 px-2 py-1 text-center">{item.ca || '—'}</td><td className="border border-gray-300 px-2 py-1 text-center">{item.tamanho || '—'}</td><td className="border border-gray-300 px-2 py-1 text-center">{item.quantidade}</td><td className="border border-gray-300 px-2 py-1">{item.observacao || '—'}</td></tr>)}</tbody></table>

        <div className="border border-gray-400 rounded p-3 mb-6"><p className="text-[9px] uppercase text-gray-500 mb-1 font-bold">TERMO DE RESPONSABILIDADE</p><p className="text-xs leading-relaxed text-justify">{term}</p></div>

        {delivery.status === 'entregue' && <div className="border border-gray-300 rounded p-2 mb-4 text-[10px]"><strong>Controle semestral:</strong> entrega efetiva em {dateBr(delivery.data_entrega)} · próxima organização/reposição em {dateBr(delivery.proxima_reposicao)}.</div>}

        <div className="grid grid-cols-2 gap-16 mt-16"><div className="text-center"><div className="border-t border-black pt-1"><p className="text-xs font-bold">{delivery.funcionario_nome}</p><p className="text-[9px] text-gray-500">Colaborador</p></div></div><div className="text-center"><div className="border-t border-black pt-1"><p className="text-xs font-bold">&nbsp;</p><p className="text-[9px] text-gray-500">Responsável pela Entrega</p></div></div></div>

        {daysToRenewal !== null && daysToRenewal <= 7 && <p className="no-print mt-4 text-xs text-amber-700">Atenção: esta ficha está no período de organização da próxima entrega.</p>}
      </div>
    </div>
  );
};

export default EPIPage;
