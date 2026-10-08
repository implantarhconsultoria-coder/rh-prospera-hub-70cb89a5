import React, { useMemo, useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getWorkingDays } from '@/lib/workingDays';
import { buildVRReportRows, getPreviousCompetencia, sumBenefitRows, type BenefitReportRow } from '@/lib/benefitReports';
import { useRecibosCorrecoes } from '@/hooks/useRecibosCorrecoes';
import { sha256Browser } from '@/lib/payrollDocuments';
import { buildVRReceiptPdfBlob } from '@/lib/vrReceiptPdf';

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

const RelatorioVRPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, session, updateEmployee, refreshData } = useApp();
  const correcoes = useRecibosCorrecoes({ tipo: 'vr' });

  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [diasPagos, setDiasPagos] = useState(String(getWorkingDays(new Date().toISOString().slice(0, 7))));
  const [dataPagamento, setDataPagamento] = useState('');
  const [selectionMode, setSelectionMode] = useState<'all' | 'selected'>('all');
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  const [vrBulkValue, setVrBulkValue] = useState('31,00');
  const [vrBulkCompany, setVrBulkCompany] = useState(ALL_COMPANIES);
  const [vrBulkMode, setVrBulkMode] = useState<VrBulkMode>('sem_guincheiros');
  const [updatingVr, setUpdatingVr] = useState(false);

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

  const applyCorrection = (row: BenefitReportRow, companyId: string): BenefitReportRow => {
    const correction = correcoes.findFor('vr', companyId, row.emp.id, competencia);
    if (!correction) return row;
    return {
      ...row,
      valorDiario: Number(correction.valor_diario_corrigido ?? row.valorDiario),
      diasFinais: Number(correction.dias_finais_corrigido ?? row.diasFinais),
      valorTotal: Number(correction.valor_total_corrigido ?? row.valorTotal),
      corrigido: true,
      correcaoMotivo: correction.motivo || null,
      correcaoObservacao: correction.observacao || null,
      ...(correction.data_pagamento ? { dataPagamentoCorrecao: correction.data_pagamento } : {}),
    } as BenefitReportRow;
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
        const rows = buildVRReportRows(companyEmployees, companyEntries, days, competencia)
          .map(row => applyCorrection(row, company.id));
        return { company, rows };
      });
  };

  const persistGeneration = async (block: VrBlock, actorId: string | null) => {
    const snapshot = block.rows.map(row => ({
      employee_id: row.emp.id,
      employee_name: row.emp.name,
      cargo: row.emp.cargo,
      valor_diario: row.valorDiario,
      dias_previstos: row.diasPrevistos,
      dias_descontados: row.diasDescontados,
      dias_finais: row.diasFinais,
      valor_total: row.valorTotal,
      motivo: row.motivo || null,
      correcao_motivo: row.correcaoMotivo || null,
      correcao_observacao: row.correcaoObservacao || null,
      data_pagamento_individual: (row as any).dataPagamentoCorrecao || null,
    }));
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
  };

  const syncReceipt = async (block: VrBlock, row: BenefitReportRow, actorId: string) => {
    const effectivePaymentDate = (row as any).dataPagamentoCorrecao || dataPagamento || '';
    const blob = buildVRReceiptPdfBlob(block.company, row, {
      competencia,
      diasPagos: Math.max(0, Number(diasPagos || 0)),
      dataPagamento: effectivePaymentDate,
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await sha256Browser(bytes);

    const { data: current, error: currentError } = await (supabase as any).from('payroll_documents')
      .select('id,document_sha256,confirmed,payment_event_id')
      .eq('company_id', block.company.id)
      .eq('employee_id', row.emp.id)
      .eq('competencia', competencia)
      .eq('document_type', VR_DOCUMENT_TYPE)
      .eq('payment_kind', 'ORIGINAL')
      .eq('is_current', true)
      .maybeSingle();
    if (currentError) throw currentError;

    if (current?.id) {
      const [{ data: complements, error: complementError }, { data: signatures, error: signatureError }] = await Promise.all([
        (supabase as any).from('payroll_documents').select('id').eq('company_id', block.company.id).eq('employee_id', row.emp.id).eq('competencia', competencia).eq('document_type', VR_DOCUMENT_TYPE).eq('payment_kind', 'COMPLEMENTAR').eq('is_current', true).limit(1),
        (supabase as any).from('payroll_signatures').select('id').eq('document_id', current.id).limit(1),
      ]);
      if (complementError) throw complementError;
      if (signatureError) throw signatureError;
      if ((complements || []).length || (signatures || []).length) return false;
    }
    if (current?.document_sha256 === hash && current?.confirmed) return false;

    const paymentEventId = current?.payment_event_id || crypto.randomUUID();
    const filename = `RECIBO_VR_${safeFile(row.emp.name)}_${competencia}.pdf`;
    const path = `${block.company.id}/${competencia}/beneficios/${row.emp.id}/vr/${crypto.randomUUID()}-${filename}`;
    const { error: uploadError } = await supabase.storage.from(PAYROLL_BUCKET).upload(
      path,
      new Blob([bytes as any], { type: 'application/pdf' }),
      { contentType: 'application/pdf', upsert: false },
    );
    if (uploadError) throw uploadError;

    const { error: insertError } = await (supabase as any).from('payroll_documents').insert({
      company_id: block.company.id,
      employee_id: row.emp.id,
      competencia,
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
        dias_pagos: Math.max(0, Number(diasPagos || 0)),
        data_pagamento: effectivePaymentDate || null,
        valor_diario: row.valorDiario,
        dias_previstos: row.diasPrevistos,
        dias_descontados: row.diasDescontados,
        dias_finais: row.diasFinais,
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

  const handleGenerate = async () => {
    const days = Number(diasPagos || 0);
    if (!competencia) return toast.error('Selecione o mês.');
    if (!Number.isFinite(days) || days <= 0) return toast.error('Informe os dias pagos.');
    if (!selectedCompanyIds.length) return toast.error('Selecione ao menos uma empresa.');
    if (!session?.user?.id) return toast.error('Sessão administrativa expirada. Entre novamente.');

    setGenerating(true);
    try {
      const previous = getPreviousCompetencia(competencia);
      const entryPool = [...entries];
      selectedCompanyIds.forEach(companyId => {
        getOrCreateEntries(companyId, competencia).forEach(row => {
          if (!entryPool.some(item => item.employeeId === row.employeeId && item.competencia === row.competencia)) entryPool.push(row);
        });
        if (previous) getOrCreateEntries(companyId, previous).forEach(row => {
          if (!entryPool.some(item => item.employeeId === row.employeeId && item.competencia === row.competencia)) entryPool.push(row);
        });
      });

      const blocks = buildBlocks(selectedCompanyIds, entryPool);
      let synced = 0;
      let signatureUnavailable = 0;
      for (const block of blocks) {
        await persistGeneration(block, session.user.id);
        const { data: payrollEnabled, error: payrollStatusError } = await (supabase as any).rpc('payroll_company_enabled', { p_company_id: block.company.id });
        if (payrollStatusError) throw payrollStatusError;
        if (payrollEnabled) {
          for (const row of block.rows) if (await syncReceipt(block, row, session.user.id)) synced += 1;
        } else {
          signatureUnavailable += block.rows.length;
        }
      }

      const total = blocks.reduce((sum, block) => sum + block.rows.length, 0);
      if (signatureUnavailable) {
        toast.warning(`VR gerado: ${total} recibo(s). ${synced} enviado(s) para assinatura; ${signatureUnavailable} sem assinatura digital habilitada.`);
      } else {
        toast.success(`VR gerado: ${total} recibo(s). ${synced} documento(s) disponibilizado(s) para assinatura.`);
      }
    } catch (error: any) {
      console.error('[vr-unified-generation]', error);
      toast.error(`Não foi possível gerar o VR: ${error?.message || error}`);
    } finally {
      setGenerating(false);
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
            <p className="text-sm text-muted-foreground">Um único fluxo: gerar recibos e liberar para assinatura.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr_1fr_auto] lg:items-end">
          <label className="space-y-1 text-xs text-muted-foreground">
            Mês
            <Input type="month" value={competencia} onChange={event => setCompetencia(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Dias pagos
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
