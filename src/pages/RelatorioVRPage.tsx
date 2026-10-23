import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, UtensilsCrossed, ClipboardCheck, FileSpreadsheet } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getWorkingDays } from '@/lib/workingDays';
import {
  buildVRReportRows,
  applyBenefitCorrection,
  getPreviousCompetencia,
  getVRAdmissionCalculation,
  getVrGenerationDestinations,
  mergeBenefitGenerationSnapshot,
  shouldCreateVrPayrollDocument,
  sumBenefitRows,
  type BenefitReportRow,
} from '@/lib/benefitReports';
import { useRecibosCorrecoes } from '@/hooks/useRecibosCorrecoes';
import { useBenefitMedicalLeaves } from '@/hooks/useBenefitMedicalLeaves';
import { useOperatorIdentity } from '@/hooks/useOperatorIdentity';
import { registrarAcao } from '@/lib/acoesLog';
import ConsolidadoBeneficiosPage from '@/pages/ConsolidadoBeneficiosPage';
import BenefitMedicalReview from '@/components/BenefitMedicalReview';
import { sha256Browser } from '@/lib/payrollDocuments';
import { buildVRReceiptPdfBlob } from '@/lib/vrReceiptPdf';
import { formatCurrency } from '@/lib/calculations';

const PAYROLL_BUCKET = 'payroll-private';
const VR_DOCUMENT_TYPE = 'BENEFICIO_VR';
const ALL_COMPANIES = 'todas';

type VrBlock = {
  company: any;
  rows: BenefitReportRow[];
};

type VrBulkMode = 'sem_guincheiros' | 'todos' | 'somente_guincheiros';

const normalizeText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const isSignatureExcluded = (employee: any) => {
  const cargo = normalizeText(employee?.cargo);
  return cargo.includes('socio') || cargo.includes('pro labore') || cargo.includes('prolabore');
};

const isGuincheiro = (employee: any) => {
  const text = normalizeText([employee?.cargo, employee?.setorGhe, employee?.observacoes, employee?.name].join(' '));
  return text.includes('guincheir') || text.includes('motorista guincho') || /\bguincho\b/.test(text);
};

const safeFile = (value: string) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_')
  .slice(0, 100);

const parseMoney = (value: string) => {
  const normalized = String(value || '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
};

const dataBr = (value?: string | null) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
};

const RelatorioVRPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, session, updateEmployee, refreshData } = useApp();
  const [searchParams] = useSearchParams();
  const correcoes = useRecibosCorrecoes({ tipo: 'vr' });
  const defaultCompetencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);

  const [competencia, setCompetencia] = useState(defaultCompetencia);
  const medical = useBenefitMedicalLeaves(competencia);
  const operador = useOperatorIdentity();
  const [showConsolidado, setShowConsolidado] = useState(false);
  const [diasPagos, setDiasPagos] = useState(String(getWorkingDays(defaultCompetencia)));
  const [dataPagamento, setDataPagamento] = useState(searchParams.get('dataPagamento') || '');
  const [selectionMode, setSelectionMode] = useState<'all' | 'selected'>('all');
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState('');

  const [vrBulkValue, setVrBulkValue] = useState('31,00');
  const [vrBulkCompany, setVrBulkCompany] = useState(ALL_COMPANIES);
  const [vrBulkMode, setVrBulkMode] = useState<VrBulkMode>('sem_guincheiros');
  const [updatingVr, setUpdatingVr] = useState(false);

  const [individualCompanyId, setIndividualCompanyId] = useState(searchParams.get('empresa') || '');
  const [individualEmployeeId, setIndividualEmployeeId] = useState(searchParams.get('funcionario') || '');
  const [individualCompetencia, setIndividualCompetencia] = useState(defaultCompetencia);
  const individualMedical = useBenefitMedicalLeaves(individualCompetencia);
  const [individualPaymentDate, setIndividualPaymentDate] = useState(searchParams.get('dataPagamento') || '');
  const [individualGenerating, setIndividualGenerating] = useState(false);
  const [lastIndividualUrl, setLastIndividualUrl] = useState('');

  useEffect(() => {
    const queryEmployeeId = searchParams.get('funcionario');
    if (!queryEmployeeId) return;
    const employee = employees.find((item) => item.id === queryEmployeeId);
    if (!employee) return;
    setIndividualEmployeeId(employee.id);
    setIndividualCompanyId(employee.companyId);
  }, [employees, searchParams]);

  useEffect(() => {
    setDiasPagos(String(getWorkingDays(competencia)));
  }, [competencia]);

  const selectedCompanyIds = useMemo(() => {
    if (selectionMode === 'all') return companies.map(company => company.id);
    return Array.from(selectedCompanies);
  }, [selectionMode, companies, selectedCompanies]);

  const toggleCompany = (id: string) => {
    setSelectedCompanies(previous => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyCorrection = (row: BenefitReportRow, companyId: string, targetCompetencia: string): BenefitReportRow =>
    applyBenefitCorrection(row, correcoes.findFor('vr', companyId, row.emp.id, targetCompetencia));

  const buildEntryPool = (companyIds: string[], targetCompetencia: string) => {
    const previous = getPreviousCompetencia(targetCompetencia);
    const entryPool = [...entries];
    companyIds.forEach(companyId => {
      getOrCreateEntries(companyId, targetCompetencia).forEach(row => {
        if (!entryPool.some(item => item.employeeId === row.employeeId && item.competencia === row.competencia)) entryPool.push(row);
      });
      if (previous) getOrCreateEntries(companyId, previous).forEach(row => {
        if (!entryPool.some(item => item.employeeId === row.employeeId && item.competencia === row.competencia)) entryPool.push(row);
      });
    });
    return entryPool;
  };

  const buildBlocks = (companyIds: string[], entryPool: any[]): VrBlock[] => {
    const days = Math.max(0, Number(diasPagos || 0));
    return companyIds
      .map(companyId => companies.find(company => company.id === companyId))
      .filter(Boolean)
      .map((company: any) => {
        const companyEmployees = employees
          .filter(employee => employee.companyId === company.id
            && employee.status === 'ativo'
            && employee.categoria === 'operacional'
            && employee.vrAtivo
            && !isSignatureExcluded(employee))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        const previous = getPreviousCompetencia(competencia);
        const companyEntries = entryPool.filter(entry => entry.companyId === company.id
          && (entry.competencia === competencia || entry.competencia === previous));
        const rows = buildVRReportRows(companyEmployees, companyEntries, days, competencia, [], medical.atestados)
          .map(row => applyCorrection(row, company.id, competencia));
        return { company, rows };
      });
  };

  const snapshotRow = (row: BenefitReportRow) => ({
    employee_id: row.emp.id,
    employee_name: row.emp.name,
    cargo: row.emp.cargo,
    valor_diario: row.valorDiario,
    dias_previstos: row.diasPrevistos,
    dias_descontados: row.diasDescontados,
    dias_atestado: row.diasAtestado || 0,
    pendencia_conferencia: row.pendenciaConferencia || false,
    dias_finais: row.diasFinais,
    valor_total: row.valorTotal,
    motivo: row.motivo || null,
    correcao_motivo: row.correcaoMotivo || null,
    correcao_observacao: row.correcaoObservacao || null,
    data_pagamento_individual: (row as any).dataPagamentoCorrecao || null,
    tipo_calculo: row.tipoCalculo || 'MENSAL',
    ...(row.tipoCalculo === 'PROPORCIONAL_ADMISSAO' ? {
      data_admissao: row.dataAdmissao || row.emp.dataAdmissao || null,
      periodo_inicio: row.periodoInicio || null,
      periodo_fim: row.periodoFim || null,
      dias_uteis_calculados: row.diasUteisCalculados ?? row.diasPrevistos,
    } : {}),
  });

  const persistGeneration = async (block: VrBlock, actorId: string | null) => {
    const snapshot = block.rows.map(snapshotRow);
    const { error } = await (supabase as any).from('benefit_generations').upsert({
      tipo: 'vr',
      company_id: block.company.id,
      competencia,
      dias_pagos: Math.max(0, Number(diasPagos || 0)),
      data_pagamento: dataPagamento || null,
      report_snapshot: snapshot,
      total: sumBenefitRows(block.rows),
      generated_by: actorId,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tipo,company_id,competencia' });
    if (error) throw error;
    await registrarAcao({ modulo: 'beneficios_vr', entidade: 'benefit_generation', entidadeId: block.company.id, acao: 'gerou', observacao: `Competência ${competencia}; geração por ${operador.nome || 'usuário autenticado'}` }, { userId: session?.user?.id, userEmail: session?.user?.email, funcionarioNome: operador.nome, cpf: operador.cpf, origem: 'admin' });
  };

  const persistIndividualGeneration = async (
    companyId: string,
    row: BenefitReportRow,
    actorId: string,
    targetCompetencia: string,
    paymentDate: string,
  ) => {
    const { data: current, error: currentError } = await (supabase as any).from('benefit_generations')
      .select('id,report_snapshot,total,dias_pagos,data_pagamento')
      .eq('tipo', 'vr')
      .eq('company_id', companyId)
      .eq('competencia', targetCompetencia)
      .maybeSingle();
    if (currentError) throw currentError;

    const employeeSnapshot = {
      ...snapshotRow(row),
      data_pagamento_individual: (row as any).dataPagamentoCorrecao || paymentDate || null,
    };
    const merged = mergeBenefitGenerationSnapshot(current?.report_snapshot || [], employeeSnapshot);
    const total = Math.round(merged.reduce((sum: number, item: any) => sum + Number(item?.valor_total || 0), 0) * 100) / 100;
    const now = new Date().toISOString();

    if (current?.id) {
      const { error } = await (supabase as any).from('benefit_generations').update({
        report_snapshot: merged,
        total,
        generated_by: actorId,
        updated_at: now,
      }).eq('id', current.id);
      if (error) throw error;
      return;
    }

    const { error } = await (supabase as any).from('benefit_generations').insert({
      tipo: 'vr',
      company_id: companyId,
      competencia: targetCompetencia,
      dias_pagos: getWorkingDays(targetCompetencia),
      data_pagamento: paymentDate || null,
      report_snapshot: merged,
      total,
      generated_by: actorId,
      generated_at: now,
      updated_at: now,
    });
    if (error) throw error;
  };

  const syncReceiptForSignature = async (
    block: VrBlock,
    row: BenefitReportRow,
    actorId: string,
    targetCompetencia: string,
    paymentDate: string,
  ) => {
    const effectivePaymentDate = (row as any).dataPagamentoCorrecao || paymentDate || '';
    const blob = buildVRReceiptPdfBlob(block.company, row, {
      competencia: targetCompetencia,
      dataPagamento: effectivePaymentDate,
      operador,
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await sha256Browser(bytes);

    const { data: current, error: currentError } = await (supabase as any).from('payroll_documents')
      .select('id,document_sha256,confirmed,payment_event_id')
      .eq('company_id', block.company.id)
      .eq('employee_id', row.emp.id)
      .eq('competencia', targetCompetencia)
      .eq('document_type', VR_DOCUMENT_TYPE)
      .eq('payment_kind', 'ORIGINAL')
      .eq('is_current', true)
      .maybeSingle();
    if (currentError) throw currentError;

    let hasComplement = false;
    let hasSignature = false;
    if (current?.id) {
      const [{ data: complements, error: complementError }, { data: signatures, error: signatureError }] = await Promise.all([
        (supabase as any).from('payroll_documents').select('id').eq('company_id', block.company.id).eq('employee_id', row.emp.id).eq('competencia', targetCompetencia).eq('document_type', VR_DOCUMENT_TYPE).eq('payment_kind', 'COMPLEMENTAR').eq('is_current', true).limit(1),
        (supabase as any).from('payroll_signatures').select('id').eq('document_id', current.id).limit(1),
      ]);
      if (complementError) throw complementError;
      if (signatureError) throw signatureError;
      hasComplement = Boolean((complements || []).length);
      hasSignature = Boolean((signatures || []).length);
    }

    if (!shouldCreateVrPayrollDocument({
      currentHash: current?.document_sha256,
      nextHash: hash,
      currentConfirmed: current?.confirmed,
      hasComplement,
      hasSignature,
    })) return false;

    const paymentEventId = current?.payment_event_id || crypto.randomUUID();
    const filename = `RECIBO_VR_${safeFile(row.emp.name)}_${targetCompetencia}.pdf`;
    const path = `${block.company.id}/${targetCompetencia}/beneficios/${row.emp.id}/vr/${crypto.randomUUID()}-${filename}`;
    const { error: uploadError } = await supabase.storage.from(PAYROLL_BUCKET).upload(
      path,
      new Blob([bytes as any], { type: 'application/pdf' }),
      { contentType: 'application/pdf', upsert: false },
    );
    if (uploadError) throw uploadError;

    const { error: insertError } = await (supabase as any).from('payroll_documents').insert({
      company_id: block.company.id,
      employee_id: row.emp.id,
      competencia: targetCompetencia,
      document_type: VR_DOCUMENT_TYPE,
      storage_bucket: PAYROLL_BUCKET,
      storage_path: path,
      original_filename: filename,
      mime_type: 'application/pdf',
      file_size: bytes.byteLength,
      document_sha256: hash,
      source_sha256: hash,
      net_amount: row.valorTotal,
      payment_event_id: paymentEventId,
      payment_kind: 'ORIGINAL',
      payment_sequence: 1,
      payment_state: 'GERADO',
      entitlement_amount: row.valorTotal,
      prior_paid_amount: 0,
      payment_reason: row.correcaoMotivo || row.motivo || 'Pagamento original de VR',
      extracted_data: {
        origem: 'VR_GERADOR_UNIFICADO',
        data_pagamento: effectivePaymentDate || null,
        valor_diario: row.valorDiario,
        dias_previstos: row.diasPrevistos,
        dias_descontados: row.diasDescontados,
        dias_finais: row.diasFinais,
        tipo_calculo: row.tipoCalculo || 'MENSAL',
        data_admissao: row.tipoCalculo === 'PROPORCIONAL_ADMISSAO' ? row.dataAdmissao : null,
        periodo_inicio: row.tipoCalculo === 'PROPORCIONAL_ADMISSAO' ? row.periodoInicio : null,
        periodo_fim: row.tipoCalculo === 'PROPORCIONAL_ADMISSAO' ? row.periodoFim : null,
      },
      match_confidence: 100,
      status: 'AGUARDANDO_ASSINATURA',
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      confirmed_by: actorId,
      created_by: actorId,
    });
    if (insertError) {
      await supabase.storage.from(PAYROLL_BUCKET).remove([path]);
      throw insertError;
    }
    return true;
  };

  const buildReceiptsUrl = ({
    targetCompetencia,
    companyIds,
    employeeIds,
    days,
    paymentDate,
  }: {
    targetCompetencia: string;
    companyIds: string[];
    employeeIds?: string[];
    days: number;
    paymentDate?: string;
  }) => {
    const params = new URLSearchParams({
      formato: 'vr',
      competencia: targetCompetencia,
      empresas: companyIds.join(','),
      diasUteis: String(days),
    });
    if (employeeIds?.length) params.set('funcionarios', employeeIds.join(','));
    if (paymentDate) params.set('dataPagamento', paymentDate);
    return `/recibos-beneficio?${params.toString()}`;
  };

  const handleGenerate = async () => {
    const days = Number(diasPagos || 0);
    if (!competencia) return toast.error('Selecione o mês.');
    if (!Number.isFinite(days) || days <= 0) return toast.error('Informe os dias pagos.');
    if (!selectedCompanyIds.length) return toast.error('Selecione ao menos uma empresa.');
    if (!session?.user?.id) return toast.error('Sessão administrativa expirada. Entre novamente.');
    if (operador.loading || !operador.completo) return toast.error('Para emitir o documento, atualize o nome completo e CPF do operador no cadastro administrativo.');
    if (medical.loading || medical.error) return toast.error(medical.error || 'Consultando atestados.');
    if (selectedCompanyIds.some(id => (medical.pendentesPorEmpresa[id] || 0) > 0)) return toast.error('Há atestados sem datas conferidas nas empresas selecionadas. Revise antes de gerar VR.');

    setGenerating(true);
    try {
      const entryPool = buildEntryPool(selectedCompanyIds, competencia);
      const blocks = buildBlocks(selectedCompanyIds, entryPool);
      if (blocks.some(block => block.rows.some(row => row.pendenciaConferencia))) throw new Error('Faltas importadas do ponto sem conferência: revise o fechamento antes de gerar VR.');
      const candidateCount = employees.filter(employee => selectedCompanyIds.includes(employee.companyId)
        && employee.status === 'ativo'
        && employee.categoria === 'operacional'
        && employee.vrAtivo
        && !isSignatureExcluded(employee)).length;
      let synced = 0;
      let disabledCompanies = 0;
      for (const block of blocks) {
        await persistGeneration(block, session.user.id);
        const { data: payrollEnabled, error: payrollStatusError } = await (supabase as any).rpc('payroll_company_enabled', { p_company_id: block.company.id });
        if (payrollStatusError) throw payrollStatusError;
        const destinations = getVrGenerationDestinations(Boolean(payrollEnabled));
        if (destinations.digitalSignature) {
          for (const row of block.rows) {
            if (await syncReceiptForSignature(block, row, session.user.id, competencia, dataPagamento)) synced += 1;
          }
        } else if (block.rows.length) {
          disabledCompanies += 1;
        }
      }

      const total = blocks.reduce((sum, block) => sum + block.rows.length, 0);
      setLastGeneratedUrl(buildReceiptsUrl({
        targetCompetencia: competencia,
        companyIds: selectedCompanyIds,
        days,
        paymentDate: dataPagamento,
      }));
      toast.success(`VR gerado para ${total} funcionário(s). Recibos disponíveis para visualização e impressão.`);
      if (synced > 0) toast.success(`${synced} recibo(s) também disponibilizado(s) para assinatura digital.`);
      if (disabledCompanies > 0) toast.info('Assinatura digital não habilitada para esta empresa. O recibo foi gerado normalmente.');
      if (candidateCount > total) toast.info(`${candidateCount - total} funcionário(s) ainda não admitido(s) nesta competência e sem recibo de VR.`);
    } catch (error: any) {
      console.error('[vr-unified-generation]', error);
      toast.error(`Não foi possível gerar o VR: ${error?.message || error}`);
    } finally {
      setGenerating(false);
    }
  };

  const individualEmployees = useMemo(() => employees
    .filter(employee => employee.companyId === individualCompanyId && employee.status === 'ativo' && employee.vrAtivo)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, individualCompanyId]);

  const individualEmployee = useMemo(() => employees.find(employee => employee.id === individualEmployeeId), [employees, individualEmployeeId]);
  const individualAdmission = useMemo(() => individualEmployee
    ? getVRAdmissionCalculation(individualEmployee, individualCompetencia)
    : null, [individualEmployee, individualCompetencia]);
  const individualDaysInMonth = getWorkingDays(individualCompetencia);
  const individualPreviewRow = useMemo(() => {
    if (!individualEmployee || !individualAdmission?.eligible) return null;
    const previous = getPreviousCompetencia(individualCompetencia);
    const pool = entries.filter(entry => entry.companyId === individualEmployee.companyId
      && (entry.competencia === individualCompetencia || entry.competencia === previous));
    const row = buildVRReportRows([individualEmployee], pool, individualDaysInMonth, individualCompetencia, [], individualMedical.atestados)[0];
    return row ? applyCorrection(row, individualEmployee.companyId, individualCompetencia) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [individualEmployee, individualAdmission?.eligible, individualCompetencia, individualDaysInMonth, entries, correcoes.data, individualMedical.atestados]);

  const handleIndividualCompanyChange = (companyId: string) => {
    setIndividualCompanyId(companyId);
    setIndividualEmployeeId('');
    setLastIndividualUrl('');
  };

  const handleIndividualEmployeeChange = (employeeId: string) => {
    setIndividualEmployeeId(employeeId);
    const selected = employees.find(employee => employee.id === employeeId);
    if (selected) setIndividualCompanyId(selected.companyId);
    setLastIndividualUrl('');
  };

  const handleIndividualGenerate = async () => {
    if (!session?.user?.id) return toast.error('Sessão administrativa expirada. Entre novamente.');
    if (!individualEmployee) return toast.error('Selecione um funcionário.');
    if (individualMedical.loading || individualMedical.error) return toast.error(individualMedical.error || 'Consultando atestados.');
    if ((individualMedical.pendentesPorFuncionario[individualEmployee.id] || 0) > 0) return toast.error('Revise as datas dos atestados deste funcionário antes da emissão individual.');
    if (individualEmployee.status !== 'ativo' || !individualEmployee.vrAtivo) return toast.error('Funcionário não está ativo com VR habilitado.');
    const admission = getVRAdmissionCalculation(individualEmployee, individualCompetencia);
    if (!admission.eligible) return toast.info('Funcionário ainda não admitido nesta competência.');

    if (operador.loading || !operador.completo) return toast.error('Operador sem nome completo e CPF no perfil.');
    setIndividualGenerating(true);
    try {
      const pool = buildEntryPool([individualEmployee.companyId], individualCompetencia);
      const rowBase = buildVRReportRows([individualEmployee], pool, getWorkingDays(individualCompetencia), individualCompetencia, [], individualMedical.atestados)[0];
      if (!rowBase) return toast.info('Funcionário ainda não admitido nesta competência.');
      if (rowBase.pendenciaConferencia) throw new Error('Faltas ainda não conferidas no ponto. Não é seguro emitir o recibo individual.');
      const row = applyCorrection(rowBase, individualEmployee.companyId, individualCompetencia);
      const company = companies.find(item => item.id === individualEmployee.companyId);
      if (!company) throw new Error('Empresa do funcionário não encontrada.');

      await persistIndividualGeneration(company.id, row, session.user.id, individualCompetencia, individualPaymentDate);
      const { data: payrollEnabled, error: payrollStatusError } = await (supabase as any).rpc('payroll_company_enabled', { p_company_id: company.id });
      if (payrollStatusError) throw payrollStatusError;
      const destinations = getVrGenerationDestinations(Boolean(payrollEnabled));
      let synced = false;
      if (destinations.digitalSignature) {
        synced = await syncReceiptForSignature({ company, rows: [row] }, row, session.user.id, individualCompetencia, individualPaymentDate);
      }

      const url = buildReceiptsUrl({
        targetCompetencia: individualCompetencia,
        companyIds: [company.id],
        employeeIds: [individualEmployee.id],
        days: getWorkingDays(individualCompetencia),
        paymentDate: individualPaymentDate,
      });
      setLastIndividualUrl(url);
      toast.success(`Recibo de VR de ${individualEmployee.name} emitido com ${row.diasFinais} dias e total de ${formatCurrency(row.valorTotal)}.`);
      if (destinations.digitalSignature && synced) toast.success('1 recibo também disponibilizado para assinatura digital.');
      if (!destinations.digitalSignature) toast.info('Assinatura digital não habilitada para esta empresa. O recibo foi gerado normalmente.');
    } catch (error: any) {
      console.error('[vr-individual-generation]', error);
      toast.error(`Não foi possível emitir o recibo individual: ${error?.message || error}`);
    } finally {
      setIndividualGenerating(false);
    }
  };

  const handleBulkUpdate = async () => {
    const valor = parseMoney(vrBulkValue);
    if (!(valor > 0)) return toast.error('Informe um valor diário de VR válido.');

    const targets = employees.filter(employee => {
      if (employee.status !== 'ativo') return false;
      if (vrBulkCompany !== ALL_COMPANIES && employee.companyId !== vrBulkCompany) return false;
      const guincheiro = isGuincheiro(employee);
      if (vrBulkMode === 'sem_guincheiros' && guincheiro) return false;
      if (vrBulkMode === 'somente_guincheiros' && !guincheiro) return false;
      return true;
    });
    if (!targets.length) return toast.error('Nenhum funcionário encontrado para esse filtro.');

    setUpdatingVr(true);
    try {
      await Promise.all(targets.map(employee => Promise.resolve(updateEmployee(employee.id, { vrDiario: valor }))));
      await refreshData();
      toast.success(`Valor do VR atualizado para ${targets.length} funcionário(s).`);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar o valor do VR.');
    } finally {
      setUpdatingVr(false);
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="rounded-2xl border border-purple-500/30 bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-purple-500/15 p-3 text-purple-300"><UtensilsCrossed className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold">Vale-Refeição</h1>
            <p className="text-sm text-muted-foreground">Emissão de recibos independente da assinatura digital, com cálculo proporcional de admissão.</p>
          </div>
        </div>
      </div>

      <section aria-label="Conferência integrada de VR" className="rounded-xl border border-violet-400/30 bg-violet-500/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Recibos e conferência de VR</p>
            <p className="text-xs text-muted-foreground">
              Atestados e faltas cruzados com o fechamento de {getPreviousCompetencia(competencia)}.
              {' '}{medical.loading ? 'Verificando documentos...' :
                medical.error ? 'Falha ao conferir os documentos médicos.' :
                medical.documentosPendentes > 0 ? `${medical.documentosPendentes} documento(s) sem período comprovado — exigem validação antes do pagamento.` :
                `Documentos médicos identificados: ${medical.documentosEmDias} com duração em dias, ${medical.documentosEmHoras} em horas, ${medical.documentosSemDuracao} sem duração explícita; ${medical.documentosContabilidade} referência(s) na contabilidade.`}
            </p>
          </div>
          <button type="button" aria-expanded={showConsolidado}
            className="flex min-h-16 min-w-44 flex-col items-center justify-center rounded-xl border border-amber-400/60 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-300 hover:bg-amber-400/20"
            onClick={() => setShowConsolidado(v => !v)}>
            <FileSpreadsheet className="mb-1 h-5 w-5" />
            {showConsolidado ? 'Ocultar' : 'Ver'} consolidado VR
          </button>
        </div>
      </section>
      <BenefitMedicalReview tipo="vr" competencia={competencia} />
      {showConsolidado && <ConsolidadoBeneficiosPage key={`vr-${competencia}`} tipo="vr" embutido competenciaInicial={competencia} />}

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr_1fr_auto] lg:items-end">
          <label className="space-y-1 text-xs text-muted-foreground">
            Mês
            <Input type="month" value={competencia} onChange={event => setCompetencia(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Dias pagos (base mensal)
            <Input type="number" min="1" value={diasPagos} onChange={event => setDiasPagos(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Data de pagamento (opcional)
            <Input type="date" value={dataPagamento} onChange={event => setDataPagamento(event.target.value)} />
          </label>
          <Button onClick={handleGenerate} disabled={generating} className="min-w-40 bg-amber-400 text-black hover:bg-amber-300">
            {generating ? 'GERANDO...' : 'GERAR VR'}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant={selectionMode === 'all' ? 'default' : 'outline'} onClick={() => setSelectionMode('all')}>Todas as empresas</Button>
          <Button size="sm" variant={selectionMode === 'selected' ? 'default' : 'outline'} onClick={() => setSelectionMode('selected')}>Empresas selecionadas</Button>
          {lastGeneratedUrl && (
            <Button size="sm" className="ml-auto" onClick={() => window.open(lastGeneratedUrl, '_blank')}>
              <ExternalLink className="mr-2 h-4 w-4" /> ABRIR RECIBOS GERADOS
            </Button>
          )}
        </div>

        {selectionMode === 'selected' && (
          <div className="mt-3 grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {companies.map(company => (
              <label key={company.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={selectedCompanies.has(company.id)} onCheckedChange={() => toggleCompany(company.id)} />
                <span>{company.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div id="emissao-individual-vr" className="rounded-2xl border border-purple-500/25 bg-card p-4">
        <div className="mb-4">
          <h2 className="font-semibold">EMISSÃO INDIVIDUAL</h2>
          <p className="text-xs text-muted-foreground">Emite somente o funcionário selecionado e preserva a geração consolidada da empresa.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-xs text-muted-foreground">
            Empresa
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={individualCompanyId} onChange={event => handleIndividualCompanyChange(event.target.value)}>
              <option value="">Selecione</option>
              {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Funcionário
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={individualEmployeeId} onChange={event => handleIndividualEmployeeChange(event.target.value)} disabled={!individualCompanyId}>
              <option value="">Selecione</option>
              {individualEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Competência
            <Input type="month" value={individualCompetencia} onChange={event => { setIndividualCompetencia(event.target.value); setLastIndividualUrl(''); }} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Data de pagamento
            <Input type="date" value={individualPaymentDate} onChange={event => setIndividualPaymentDate(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-border/70 p-3"><p className="text-xs text-muted-foreground">Data de admissão</p><p className="font-semibold">{dataBr(individualEmployee?.dataAdmissao)}</p></div>
          <div className="rounded-xl border border-border/70 p-3"><p className="text-xs text-muted-foreground">Valor diário de VR</p><p className="font-semibold">{formatCurrency(individualPreviewRow?.valorDiario || Number(individualEmployee?.vrDiario || 0))}</p></div>
          <div className="rounded-xl border border-border/70 p-3"><p className="text-xs text-muted-foreground">Dias úteis do mês</p><p className="font-semibold">{individualDaysInMonth}</p></div>
          <div className="rounded-xl border border-border/70 p-3"><p className="text-xs text-muted-foreground">Dias proporcionais calculados</p><p className="font-semibold">{individualPreviewRow?.diasPrevistos ?? '—'}</p></div>
          <div className="rounded-xl border border-border/70 p-3"><p className="text-xs text-muted-foreground">Valor total</p><p className="font-semibold">{formatCurrency(individualPreviewRow?.valorTotal || 0)}</p></div>
        </div>

        {individualAdmission?.reason === 'ADMISSION_AFTER_COMPETENCIA' && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Funcionário ainda não admitido nesta competência.</p>
        )}
        {individualPreviewRow?.tipoCalculo === 'PROPORCIONAL_ADMISSAO' && (
          <div className="mt-3 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm">
            <strong>Cálculo proporcional por admissão</strong>
            <span className="ml-2 text-muted-foreground">Período: {dataBr(individualPreviewRow.periodoInicio)} até {dataBr(individualPreviewRow.periodoFim)} · Dias de VR: {individualPreviewRow.diasFinais} · Valor diário: {formatCurrency(individualPreviewRow.valorDiario)} · Total: {formatCurrency(individualPreviewRow.valorTotal)}</span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={handleIndividualGenerate} disabled={individualGenerating || !individualEmployeeId || individualAdmission?.eligible === false} className="bg-purple-600 hover:bg-purple-500">
            {individualGenerating ? 'EMITINDO...' : 'EMITIR RECIBO INDIVIDUAL'}
          </Button>
          {lastIndividualUrl && (
            <Button variant="outline" onClick={() => window.open(lastIndividualUrl, '_blank')}>
              <ExternalLink className="mr-2 h-4 w-4" /> ABRIR RECIBO INDIVIDUAL
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-card p-4">
        <div className="mb-4">
          <h2 className="font-semibold">Atualização de valor do VR</h2>
          <p className="text-xs text-muted-foreground">Único ajuste administrativo mantido nesta tela.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[.7fr_1fr_1.2fr_auto] lg:items-end">
          <label className="space-y-1 text-xs text-muted-foreground">
            Valor diário
            <Input value={vrBulkValue} onChange={event => setVrBulkValue(event.target.value)} placeholder="31,00" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Empresa
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={vrBulkCompany} onChange={event => setVrBulkCompany(event.target.value)}>
              <option value={ALL_COMPANIES}>Todas as empresas</option>
              {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Funcionários
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={vrBulkMode} onChange={event => setVrBulkMode(event.target.value as VrBulkMode)}>
              <option value="sem_guincheiros">Todos, exceto guincheiros</option>
              <option value="todos">Todos</option>
              <option value="somente_guincheiros">Somente guincheiros</option>
            </select>
          </label>
          <Button onClick={handleBulkUpdate} disabled={updatingVr} className="bg-amber-400 text-black hover:bg-amber-300">
            {updatingVr ? 'ATUALIZANDO...' : 'ATUALIZAR VALOR DO VR'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RelatorioVRPage;
