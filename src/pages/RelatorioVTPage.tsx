import React, { useMemo, useState } from 'react';
import { Bus, CheckCircle2, Eye, Pencil, Printer, Save, Settings2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getWorkingDays } from '@/lib/workingDays';
import { buildVTReportRows, getPreviousCompetencia, sumBenefitRows, type BenefitReportRow } from '@/lib/benefitReports';
import { formatCurrency } from '@/lib/calculations';
import { useRecibosCorrecoes } from '@/hooks/useRecibosCorrecoes';
import ReciboCorrecaoModal from '@/components/ReciboCorrecaoModal';
import { sha256Browser } from '@/lib/payrollDocuments';
import { buildVTPackagePdfBlob, buildVTReceiptPdfBlob, type VTPackageBlock } from '@/lib/vtPackagePdf';
import { buildPdfFileName, competenciaPdfPart, downloadPdfBlob } from '@/lib/savePdf';

const PAYROLL_BUCKET = 'payroll-private';
const VT_DOCUMENT_TYPE = 'BENEFICIO_VT';

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

const safeFile = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_')
  .slice(0, 100);

const RelatorioVTPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, session } = useApp();
  const correcoes = useRecibosCorrecoes({ tipo: 'vt' });

  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [diasPagos, setDiasPagos] = useState(String(getWorkingDays(new Date().toISOString().slice(0, 7))));
  const [dataPagamento, setDataPagamento] = useState('');
  const [selectionMode, setSelectionMode] = useState<'all' | 'selected'>('all');
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [generatedBlocks, setGeneratedBlocks] = useState<VTPackageBlock[]>([]);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<{ block: VTPackageBlock; row: BenefitReportRow } | null>(null);
  const [adjustEmployeeKey, setAdjustEmployeeKey] = useState('');

  const selectedCompanyIds = useMemo(() => {
    if (selectionMode === 'all') return companies.map(company => company.id);
    return Array.from(selectedCompanies);
  }, [selectionMode, companies, selectedCompanies]);

  const totalGenerated = useMemo(
    () => generatedBlocks.reduce((sum, block) => sum + sumBenefitRows(block.rows), 0),
    [generatedBlocks],
  );

  const generatedRowsFlat = useMemo(() => generatedBlocks.flatMap(block =>
    block.rows.map(row => ({ key: `${block.company.id}|${row.emp.id}`, block, row }))), [generatedBlocks]);

  const toggleCompany = (id: string) => {
    setSelectedCompanies(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setGeneratedBlocks([]);
  };

  const applyCorrection = (row: BenefitReportRow, companyId: string, override?: any): BenefitReportRow => {
    const correction = override || correcoes.findFor('vt', companyId, row.emp.id, competencia);
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

  const buildBlocks = (companyIds: string[], entryPool: any[]) => {
    const days = Math.max(0, Number(diasPagos || 0));
    return companyIds
      .map(companyId => companies.find(company => company.id === companyId))
      .filter(Boolean)
      .map((company: any) => {
        const companyEmployees = employees
          .filter(employee => employee.companyId === company.id
            && employee.status === 'ativo'
            && employee.categoria === 'operacional'
            && employee.vtAtivo
            && !isSignatureExcluded(employee))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        const previous = getPreviousCompetencia(competencia);
        const companyEntries = entryPool.filter(entry => entry.companyId === company.id
          && (entry.competencia === competencia || entry.competencia === previous));
        const rows = buildVTReportRows(companyEmployees, companyEntries, days, competencia)
          .map(row => applyCorrection(row, company.id));
        return { company, rows } as VTPackageBlock;
      });
  };

  const persistGeneration = async (block: VTPackageBlock, actorId: string | null) => {
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
      tipo: 'vt',
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

  const syncPayrollDocument = async (block: VTPackageBlock, row: BenefitReportRow, actorId: string) => {
    const effectivePaymentDate = (row as any).dataPagamentoCorrecao || dataPagamento || '';
    const blob = buildVTReceiptPdfBlob(block, row, {
      competencia,
      diasPagos: Math.max(0, Number(diasPagos || 0)),
      dataPagamento: effectivePaymentDate,
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await sha256Browser(bytes);

    const { data: current, error: currentError } = await (supabase as any).from('payroll_documents')
      .select('id,document_sha256,confirmed,is_current,payment_event_id,payment_kind,payment_sequence,payment_state')
      .eq('company_id', block.company.id)
      .eq('employee_id', row.emp.id)
      .eq('competencia', competencia)
      .eq('document_type', VT_DOCUMENT_TYPE)
      .eq('payment_kind', 'ORIGINAL')
      .eq('is_current', true)
      .maybeSingle();
    if (currentError) throw currentError;
    // O recibo original pode ser regerado/corrigido enquanto ainda não foi assinado
    // e enquanto não existir complemento. Depois disso, ele vira base imutável.
    if (current?.id) {
      const [{ data: complementRows, error: complementError }, { data: signatureRow, error: signatureError }] = await Promise.all([
        (supabase as any).from('payroll_documents')
          .select('id')
          .eq('company_id', block.company.id)
          .eq('employee_id', row.emp.id)
          .eq('competencia', competencia)
          .eq('document_type', VT_DOCUMENT_TYPE)
          .eq('payment_kind', 'COMPLEMENTAR')
          .eq('is_current', true)
          .limit(1),
        (supabase as any).from('payroll_signatures')
          .select('id')
          .eq('document_id', current.id)
          .limit(1),
      ]);
      if (complementError) throw complementError;
      if (signatureError) throw signatureError;
      if ((complementRows || []).length || (signatureRow || []).length) return false;
    }
    if (current?.document_sha256 === hash && current?.confirmed) return false;
    const paymentEventId = current?.payment_event_id || crypto.randomUUID();

    const filename = `RECIBO_VT_${safeFile(row.emp.name)}_${competencia}.pdf`;
    const path = `${block.company.id}/${competencia}/beneficios/${row.emp.id}/vt/${crypto.randomUUID()}-${filename}`;
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
      document_type: VT_DOCUMENT_TYPE,
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
      payment_reason: row.correcaoMotivo || row.motivo || 'Pagamento original de VT',
      extracted_data: {
        origem: 'VT_GERADOR_UNIFICADO',
        dias_pagos: Math.max(0, Number(diasPagos || 0)),
        data_pagamento: effectivePaymentDate || null,
        valor_diario: row.valorDiario,
        dias_previstos: row.diasPrevistos,
        dias_descontados: row.diasDescontados,
        dias_finais: row.diasFinais,
        motivo: row.motivo || null,
        correcao_motivo: row.correcaoMotivo || null,
        correcao_observacao: row.correcaoObservacao || null,
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
        const currentRows = getOrCreateEntries(companyId, competencia);
        currentRows.forEach(row => {
          if (!entryPool.some(item => item.employeeId === row.employeeId && item.competencia === row.competencia)) entryPool.push(row);
        });
        if (previous) {
          const previousRows = getOrCreateEntries(companyId, previous);
          previousRows.forEach(row => {
            if (!entryPool.some(item => item.employeeId === row.employeeId && item.competencia === row.competencia)) entryPool.push(row);
          });
        }
      });

      const blocks = buildBlocks(selectedCompanyIds, entryPool);
      let receiptCount = 0;
      for (const block of blocks) {
        await persistGeneration(block, session.user.id);
        for (const row of block.rows) {
          if (await syncPayrollDocument(block, row, session.user.id)) receiptCount += 1;
        }
      }
      setGeneratedBlocks(blocks);
      setAdjustEmployeeKey('');
      toast.success(`VT gerado e salvo internamente. ${blocks.length} empresa(s), ${blocks.reduce((n, b) => n + b.rows.length, 0)} recibo(s). ${receiptCount} documento(s) sincronizado(s) para assinatura.`);
    } catch (error: any) {
      console.error('[vt-unified-generation]', error);
      toast.error(`Não foi possível gerar o VT: ${error?.message || error}`);
    } finally {
      setGenerating(false);
    }
  };

  const getPackageBlob = () => buildVTPackagePdfBlob(generatedBlocks, {
    competencia,
    diasPagos: Math.max(0, Number(diasPagos || 0)),
    dataPagamento: dataPagamento || '',
  });

  const handlePreview = () => {
    if (!generatedBlocks.length) return toast.error('Gere o VT primeiro.');
    const url = URL.createObjectURL(getPackageBlob());
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  };

  const handlePrint = () => {
    if (!generatedBlocks.length) return toast.error('Gere o VT primeiro.');
    const url = URL.createObjectURL(getPackageBlob());
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.border = '0';
    frame.src = url;
    frame.onload = () => window.setTimeout(() => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { window.open(url, '_blank', 'noopener,noreferrer'); }
      window.setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 30000);
    }, 500);
    document.body.appendChild(frame);
  };

  const handleSave = () => {
    if (!generatedBlocks.length) return toast.error('Gere o VT primeiro.');
    downloadPdfBlob(getPackageBlob(), buildPdfFileName('VT', 'Relatorio e Recibos', competenciaPdfPart(competencia)));
  };

  const handleCorrectionSave = async (payload: any) => {
    await correcoes.upsert(payload);
    if (!editing || !session?.user?.id) return;
    const correctedRow = applyCorrection(editing.row, editing.block.company.id, payload);
    const correctedBlock: VTPackageBlock = {
      ...editing.block,
      rows: editing.block.rows.map(row => row.emp.id === correctedRow.emp.id ? correctedRow : row),
    };
    await persistGeneration(correctedBlock, session.user.id);
    const synced = await syncPayrollDocument(correctedBlock, correctedRow, session.user.id);
    setGeneratedBlocks(prev => prev.map(block => block.company.id === correctedBlock.company.id ? correctedBlock : block));
    if (synced) {
      toast.success('Ajuste aplicado no relatório, recibo e documento pendente de assinatura.');
    } else {
      toast.info('Pagamento original já está preservado. Para acrescentar valor após pagamento, use a Edição de Benefícios.');
    }
  };

  const handleCorrectionRemove = async (id: string) => {
    await correcoes.remove(id);
    toast.info('Correção removida. Clique em GERAR VT para reconstruir relatório e recibos com os valores originais.');
    setGeneratedBlocks([]);
  };

  const openAdjustmentFromSelector = () => {
    const found = generatedRowsFlat.find(item => item.key === adjustEmployeeKey);
    if (!found) return toast.error('Escolha um funcionário.');
    setEditing({ block: found.block, row: found.row });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center"><Bus className="w-7 h-7" /></div>
          <div>
            <h1 className="text-2xl font-bold font-display">Vale-Transporte</h1>
            <p className="text-primary-foreground/70 text-sm">Um único fluxo: gerar relatório + recibos + liberar para assinatura.</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Mês</label>
            <Input type="month" value={competencia} onChange={event => {
              const value = event.target.value;
              setCompetencia(value);
              setDiasPagos(String(getWorkingDays(value)));
              setGeneratedBlocks([]);
            }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Dias pagos</label>
            <Input type="number" min="1" step="1" value={diasPagos} onChange={event => { setDiasPagos(event.target.value); setGeneratedBlocks([]); }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Data de pagamento <span className="text-muted-foreground/60">(opcional)</span></label>
            <Input type="date" value={dataPagamento} onChange={event => { setDataPagamento(event.target.value); setGeneratedBlocks([]); }} />
          </div>
          <div className="flex items-end">
            <Button onClick={handleGenerate} disabled={generating} className="w-full gradient-accent text-accent-foreground font-bold">
              <Bus className="w-4 h-4 mr-2" />{generating ? 'GERANDO...' : 'GERAR VT'}
            </Button>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={selectionMode === 'all' ? 'default' : 'outline'} onClick={() => { setSelectionMode('all'); setGeneratedBlocks([]); }}>Todas as empresas</Button>
            <Button size="sm" variant={selectionMode === 'selected' ? 'default' : 'outline'} onClick={() => { setSelectionMode('selected'); setGeneratedBlocks([]); }}>Empresas selecionadas</Button>
          </div>
          {selectionMode === 'selected' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 rounded-xl border p-3">
              {companies.map(company => (
                <label key={company.id} className="flex items-center gap-2 text-xs cursor-pointer rounded-lg px-2 py-2 hover:bg-muted/40">
                  <Checkbox checked={selectedCompanies.has(company.id)} onCheckedChange={() => toggleCompany(company.id)} />
                  <span>{company.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {generatedBlocks.length > 0 && (
        <>
          <div className="card-premium p-4 flex flex-wrap items-center justify-between gap-3 border-emerald-500/30">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 font-bold"><CheckCircle2 className="w-4 h-4" />GERADO E SALVO INTERNAMENTE</div>
              <p className="text-xs text-muted-foreground mt-1">Relatório e recibos estão prontos. Os recibos já foram enviados ao fluxo de Assinatura Digital; o Histórico só recebe depois da assinatura.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handlePreview}><Eye className="w-4 h-4 mr-2" />Visualizar</Button>
              <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Imprimir</Button>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" />Salvar PDF</Button>
            </div>
          </div>

          <div className="card-premium p-4 space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Ajustes manuais</p>
                <h2 className="font-bold">Corrigir dias, valor ou desconto de um funcionário</h2>
                <p className="text-xs text-muted-foreground">Ao salvar, relatório + recibo + documento pendente na assinatura são atualizados juntos.</p>
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground block mb-1">Funcionário</label>
                  <select value={adjustEmployeeKey} onChange={event => setAdjustEmployeeKey(event.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background min-w-[280px]">
                    <option value="">Escolher funcionário...</option>
                    {generatedRowsFlat.map(item => <option key={item.key} value={item.key}>{item.row.emp.name} — {item.block.company.name}</option>)}
                  </select>
                </div>
                <Button variant="outline" onClick={openAdjustmentFromSelector}><Settings2 className="w-4 h-4 mr-2" />Abrir ajuste</Button>
              </div>
            </div>
          </div>

          <div className="card-premium overflow-x-auto">
            <div className="p-4 flex flex-wrap justify-between gap-3 border-b">
              <div><h2 className="font-bold">Resultado gerado</h2><p className="text-xs text-muted-foreground">{generatedBlocks.length} empresa(s) · {generatedRowsFlat.length} recibo(s)</p></div>
              <div className="text-right"><p className="text-xs text-muted-foreground">Total VT</p><p className="text-lg font-bold text-success">{formatCurrency(totalGenerated)}</p></div>
            </div>
            <table className="w-full text-xs min-w-[1050px]">
              <thead className="bg-muted/50"><tr>{['Empresa','Funcionário','Função','VT/dia','Dias previstos','Desconto','Dias finais','Valor total','Motivo/Ajuste',''].map(label => <th key={label} className="px-3 py-2 text-left uppercase text-muted-foreground">{label}</th>)}</tr></thead>
              <tbody>
                {generatedBlocks.flatMap(block => block.rows.map(row => (
                  <tr key={`${block.company.id}-${row.emp.id}`} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2">{block.company.name}</td>
                    <td className="px-3 py-2 font-medium">{row.emp.name}{row.corrigido && <Badge variant="secondary" className="ml-2 text-[9px]">Ajustado</Badge>}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.emp.cargo}</td>
                    <td className="px-3 py-2">{formatCurrency(row.valorDiario)}</td>
                    <td className="px-3 py-2 text-center">{row.diasPrevistos}</td>
                    <td className="px-3 py-2 text-center text-destructive">{row.diasDescontados || '—'}</td>
                    <td className="px-3 py-2 text-center">{row.diasFinais}</td>
                    <td className="px-3 py-2 font-bold">{formatCurrency(row.valorTotal)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.correcaoMotivo || row.motivo || '—'}</td>
                    <td className="px-3 py-2"><button onClick={() => setEditing({ block, row })} className="text-amber-500 hover:text-amber-400" title="Ajustar"><Pencil className="w-4 h-4" /></button></td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ReciboCorrecaoModal
        open={!!editing}
        onOpenChange={open => !open && setEditing(null)}
        tipo="vt"
        companyId={editing?.block.company.id || ''}
        companyName={editing?.block.company.name || ''}
        competencia={competencia}
        row={editing?.row || null}
        existing={editing ? correcoes.findFor('vt', editing.block.company.id, editing.row.emp.id, competencia) : undefined}
        defaultDataPagamento={dataPagamento}
        onSave={handleCorrectionSave}
        onRemove={handleCorrectionRemove}
      />
    </div>
  );
};

export default RelatorioVTPage;
