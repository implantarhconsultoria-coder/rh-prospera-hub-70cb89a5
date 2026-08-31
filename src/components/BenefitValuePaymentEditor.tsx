import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/calculations';
import { sha256Browser } from '@/lib/payrollDocuments';
import { buildBenefitComplementReceiptPdfBlob } from '@/lib/benefitComplementPdf';

const PAYROLL_BUCKET = 'payroll-private';
const roundMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const safeFile = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_')
  .slice(0, 100);

const competenciaPt = (value: string) => {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : value;
};

type PaymentDoc = {
  id: string;
  competencia: string;
  net_amount: number | string | null;
  is_current: boolean;
  status: string;
  payment_event_id?: string | null;
  payment_kind?: 'ORIGINAL' | 'COMPLEMENTAR' | null;
  payment_sequence?: number | null;
  entitlement_amount?: number | string | null;
  prior_paid_amount?: number | string | null;
  payment_reason?: string | null;
  payment_state?: 'GERADO' | 'PAGO' | null;
  extracted_data?: any;
  created_at: string;
};

type PaymentContext = {
  competencia: string;
  daysConsidered: number;
  alreadyPaid: number;
  sequence: number;
  docs: PaymentDoc[];
};

type Props = {
  benefitType: 'VR' | 'VT';
  employee: any;
  company: any;
  currentValue: number;
  onUpdateValue: (value: number) => Promise<any> | any;
  actorId?: string | null;
};

const BenefitValuePaymentEditor: React.FC<Props> = ({
  benefitType,
  employee,
  company,
  currentValue,
  onUpdateValue,
  actorId,
}) => {
  const [value, setValue] = useState(String(Number(currentValue || 0)));
  const [reason, setReason] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [context, setContext] = useState<PaymentContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const documentType = benefitType === 'VT' ? 'BENEFICIO_VT' : 'BENEFICIO_VR';

  useEffect(() => {
    setValue(String(Number(currentValue || 0)));
  }, [currentValue]);

  const loadContext = async () => {
    if (!employee?.id || !employee?.companyId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('payroll_documents')
        .select('id,competencia,net_amount,is_current,status,payment_event_id,payment_kind,payment_sequence,entitlement_amount,prior_paid_amount,payment_reason,payment_state,extracted_data,created_at')
        .eq('company_id', employee.companyId)
        .eq('employee_id', employee.id)
        .eq('document_type', documentType)
        .eq('confirmed', true)
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) throw error;
      const rows = (data || []) as PaymentDoc[];
      if (!rows.length) {
        setContext(null);
        return;
      }

      const competencia = rows[0].competencia;
      const sameCompetencia = rows.filter(row => row.competencia === competencia);
      const currentDocs = sameCompetencia.filter(row => row.is_current && row.status !== 'SUBSTITUIDO');
      const reference = sameCompetencia.find(row => Number(row.extracted_data?.dias_finais || 0) > 0)
        || sameCompetencia.find(row => Number(row.extracted_data?.dias_pagos || 0) > 0)
        || sameCompetencia[0];
      const daysConsidered = Math.max(0, Number(reference?.extracted_data?.dias_finais || reference?.extracted_data?.dias_pagos || 0));
      const alreadyPaid = roundMoney(currentDocs.reduce((sum, row) => sum + Number(row.net_amount || 0), 0));
      const sequence = Math.max(0, ...currentDocs.map(row => Number(row.payment_sequence || 1)));
      setContext({ competencia, daysConsidered, alreadyPaid, sequence, docs: currentDocs });
    } catch (error: any) {
      console.error('[benefit-payment-context]', error);
      toast.error(`Não foi possível conferir os pagamentos de ${benefitType}: ${error?.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadContext();
  }, [employee?.id, employee?.companyId, documentType]);

  const newDailyValue = Math.max(0, Number(value || 0));
  const newEntitlement = useMemo(
    () => context?.daysConsidered ? roundMoney(newDailyValue * context.daysConsidered) : 0,
    [newDailyValue, context?.daysConsidered],
  );
  const difference = useMemo(
    () => context ? roundMoney(newEntitlement - context.alreadyPaid) : 0,
    [context, newEntitlement],
  );
  const needsComplement = Boolean(context && context.alreadyPaid > 0 && context.daysConsidered > 0 && difference > 0.009);
  const hasOverpayment = Boolean(context && context.alreadyPaid > 0 && context.daysConsidered > 0 && difference < -0.009);

  const save = async () => {
    if (!Number.isFinite(newDailyValue) || newDailyValue < 0) return toast.error('Informe um valor válido.');
    if (needsComplement && !reason.trim()) return toast.error('Informe o motivo do pagamento complementar.');
    if (!actorId) return toast.error('Sessão administrativa expirada. Entre novamente.');

    setSaving(true);
    try {
      const result = await onUpdateValue(newDailyValue);
      if (result && result.ok === false) throw result.error || new Error('Não foi possível atualizar o benefício.');

      if (!needsComplement || !context || !company) {
        if (hasOverpayment) {
          toast.warning(`${benefitType} atualizado. O valor já pago é maior que o novo total; nenhum recibo negativo foi criado.`);
        } else {
          toast.success(`${benefitType} atualizado.`);
        }
        await loadContext();
        return;
      }

      // Reconfere o total já registrado imediatamente antes de criar o complemento.
      const { data: currentRows, error: currentError } = await (supabase as any)
        .from('payroll_documents')
        .select('id,net_amount,is_current,status,payment_sequence,payment_state')
        .eq('company_id', employee.companyId)
        .eq('employee_id', employee.id)
        .eq('competencia', context.competencia)
        .eq('document_type', documentType)
        .eq('confirmed', true)
        .eq('is_current', true);
      if (currentError) throw currentError;
      const liveRows = (currentRows || []).filter((row: any) => row.status !== 'SUBSTITUIDO');
      const livePaid = roundMoney(liveRows.reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0));
      const liveDifference = roundMoney(newEntitlement - livePaid);
      if (liveDifference <= 0.009) {
        toast.success(`${benefitType} atualizado. Não há diferença adicional para pagar.`);
        await loadContext();
        return;
      }

      // Entrar pela Edição de Benefícios com um recibo já existente significa
      // que esse pagamento anterior deve ser preservado. Ele passa a ser a base
      // paga e somente a diferença vira um novo evento/recibo complementar.
      const liveIds = liveRows.map((row: any) => row.id).filter(Boolean);
      if (liveIds.length) {
        const { error: paidStateError } = await (supabase as any)
          .from('payroll_documents')
          .update({ payment_state: 'PAGO', updated_at: new Date().toISOString() })
          .in('id', liveIds);
        if (paidStateError) throw paidStateError;
      }

      const nextSequence = Math.max(context.sequence, ...liveRows.map((row: any) => Number(row.payment_sequence || 1)), 0) + 1;
      const eventId = crypto.randomUUID();
      const blob = buildBenefitComplementReceiptPdfBlob({
        benefitType,
        company: { name: company.name || '', cnpj: company.cnpj || '' },
        employee: {
          name: employee.name || '',
          cpf: employee.cpf || '',
          cargo: employee.cargo || '',
          registro: employee.registro || '',
        },
        competencia: context.competencia,
        paymentDate: paymentDate || null,
        dailyValue: newDailyValue,
        daysConsidered: context.daysConsidered,
        entitlementAmount: newEntitlement,
        priorPaidAmount: livePaid,
        complementAmount: liveDifference,
        reason: reason.trim(),
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const hash = await sha256Browser(bytes);
      const filename = `RECIBO_${benefitType}_COMPLEMENTAR_${safeFile(employee.name || 'FUNCIONARIO')}_${context.competencia}_${nextSequence}.pdf`;
      const path = `${employee.companyId}/${context.competencia}/beneficios/${employee.id}/${benefitType.toLowerCase()}/complementos/${eventId}-${filename}`;

      const { error: uploadError } = await supabase.storage.from(PAYROLL_BUCKET).upload(
        path,
        new Blob([bytes as any], { type: 'application/pdf' }),
        { contentType: 'application/pdf', upsert: false },
      );
      if (uploadError) throw uploadError;

      const { error: insertError } = await (supabase as any).from('payroll_documents').insert({
        company_id: employee.companyId,
        employee_id: employee.id,
        competencia: context.competencia,
        document_type: documentType,
        storage_bucket: PAYROLL_BUCKET,
        storage_path: path,
        original_filename: filename,
        mime_type: 'application/pdf',
        file_size: bytes.byteLength,
        document_sha256: hash,
        source_sha256: hash,
        net_amount: liveDifference,
        payment_event_id: eventId,
        payment_kind: 'COMPLEMENTAR',
        payment_sequence: nextSequence,
        entitlement_amount: newEntitlement,
        prior_paid_amount: livePaid,
        payment_reason: reason.trim(),
        payment_state: 'GERADO',
        extracted_data: {
          origem: 'EDICAO_BENEFICIOS',
          pagamento_tipo: 'COMPLEMENTAR',
          valor_diario_atualizado: newDailyValue,
          dias_finais: context.daysConsidered,
          total_devido_atualizado: newEntitlement,
          valor_pago_anteriormente: livePaid,
          valor_complementar: liveDifference,
          motivo: reason.trim(),
          data_pagamento: paymentDate || null,
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

      toast.success(`Pagamento complementar de ${benefitType} criado: ${formatCurrency(liveDifference)}. O recibo anterior foi preservado.`);
      setReason('');
      setPaymentDate('');
      await loadContext();
    } catch (error: any) {
      console.error('[benefit-complement-save]', error);
      toast.error(`Não foi possível salvar a alteração: ${error?.message || error}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="text-xs text-muted-foreground block mb-1">Valor Diário {benefitType}</label>
          <Input type="number" min="0" step="0.01" value={value} onChange={event => setValue(event.target.value)} />
        </div>
        <Button type="button" onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar alteração
        </Button>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Conferindo pagamentos já gerados...</p>}

      {!loading && context && context.alreadyPaid > 0 && context.daysConsidered > 0 && (
        <div className="rounded-md border bg-background p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">Competência {competenciaPt(context.competencia)}</Badge>
            <span>Já pago/registrado: <strong>{formatCurrency(context.alreadyPaid)}</strong></span>
            <span>Novo total devido: <strong>{formatCurrency(newEntitlement)}</strong></span>
            {needsComplement && <Badge>Complemento: {formatCurrency(difference)}</Badge>}
            {hasOverpayment && <Badge variant="destructive">Pago a maior: {formatCurrency(Math.abs(difference))}</Badge>}
          </div>

          {needsComplement && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Motivo do novo pagamento *</label>
                <Input
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  placeholder="Ex.: atualização do valor do VT após pagamento original"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Data do novo pagamento (opcional)</label>
                <Input type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} />
              </div>
              <p className="md:col-span-2 text-xs text-muted-foreground">
                O recibo já pago permanece intacto. Ao salvar, somente a diferença será criada como um novo recibo para assinatura.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BenefitValuePaymentEditor;
