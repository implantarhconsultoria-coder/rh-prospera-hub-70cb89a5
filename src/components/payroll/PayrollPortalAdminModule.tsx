import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Copy, ExternalLink, FileArchive, FileCheck2, FileSignature, FileUp, Loader2, ReceiptText, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  extractPdfFilesFromZip,
  extractReceiptMetadata,
  mergePdfUrls,
  parsePayrollPdf,
  sha256Browser,
  type PayrollEmployeeMatch,
} from '@/lib/payrollDocuments';
import {
  analyzePayrollFiles,
  safeUuid,
  summarizeAnalyses,
  type PayrollFileAnalysis,
  type PayrollPageDocument,
} from '@/lib/payrollPageDocuments';

const BUCKET = 'payroll-private';
const ALLOWED_CODES = new Set(['topac-matriz', 'topac-pg', 'topac-gyn', 'alqui', 'lmt']);
const ALLOWED_CNPJS = new Set(['07291648000103','07291648000294','07291648000375','14464586000150','21967711000100']);
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const safeFile = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 100);
const brDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const currency = (value?: number | null) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const humanStatus = (value: unknown) => String(value || '').replace(/_/g, ' ');
const AUTO_MATCH_METHODS = new Set(['CPF', 'NOME_VALOR', 'NOME_UNICO']);
const AUTO_OVERRIDE_REASON = 'AUTORIZACAO_AUTOMATICA_POR_NOME_DO_FUNCIONARIO';

const statusClass = (status: string) => {
  if (status === 'ASSINADO' || status === 'LIBERADO NO PORTAL' || status === 'PAGAMENTO CONFIRMADO' || status === 'IDENTIFICADO') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (status.includes('ERRO') || status.includes('INVALIDO') || status.includes('NÃO') || status.includes('NAO')) return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (status.includes('PENDENTE') || status.includes('AGUARDANDO')) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
};

const displayStatus = (row: any) => {
  if (row.signature_status === 'ASSINADO') return 'ASSINADO';
  if (row.holerite_confirmed && row.payment_confirmed) return 'LIBERADO NO PORTAL';
  if (row.payment_status) return humanStatus(row.payment_status);
  return humanStatus(row.holerite_status || 'HOLERITE PENDENTE');
};

const documentTypeLabel = (doc: PayrollPageDocument) => {
  if (doc.documentType === 'SALARY_ADVANCE') return doc.documentSubtype || 'ADIANTAMENTO / ADTO';
  if (doc.documentType === 'PAYSLIP') return doc.documentSubtype || 'HOLERITE';
  if (doc.documentType === 'PAYMENT_RECEIPT') return doc.documentSubtype || 'RECIBO DE PAGAMENTO';
  return doc.documentSubtype || 'NÃO IDENTIFICADO';
};

const apiCall = async (action: string, payload: Record<string, unknown>) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão administrativa expirada. Entre novamente.');
  const response = await fetch('/api/payroll-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    const error: any = new Error(result.error || `Falha ${response.status}`);
    error.payload = result;
    throw error;
  }
  return result;
};

const PayrollPortalAdminModule: React.FC<{ companyId: string; competencia: string }> = ({ companyId, competencia }) => {
  const { companies, employees } = useApp();
  const company = companies.find(c => c.id === companyId);
  const enabled = Boolean(company && ALLOWED_CODES.has(String((company as any).codigo || '').toLowerCase()) && ALLOWED_CNPJS.has(digits(company.cnpj)));
  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/holerite` : '/holerite';
  const scopedEmployees = useMemo<PayrollEmployeeMatch[]>(() => employees
    .filter(e => e.companyId === companyId && e.status === 'ativo')
    .map(e => ({ id: e.id, name: e.name, cpf: e.cpf, cargo: e.cargo, companyId: e.companyId }))
    .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, companyId]);

  const [rows, setRows] = useState<any[]>([]);
  const [unmatchedReceipts, setUnmatchedReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assignDoc, setAssignDoc] = useState<Record<string,string>>({});
  const [assignReceipt, setAssignReceipt] = useState<Record<string,string>>({});
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timeline, setTimeline] = useState<any>({ events: [], messages: [], employee: '' });
  const [consolidatedFilter, setConsolidatedFilter] = useState<'assinados'|'todos'|'pendentes'>('assinados');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAnalyses, setPreviewAnalyses] = useState<PayrollFileAnalysis[]>([]);
  const holeriteInput = useRef<HTMLInputElement>(null);
  const receiptInput = useRef<HTMLInputElement>(null);
  const autoRepairKeyRef = useRef('');

  const load = async () => {
    if (!enabled || !companyId || !competencia) return;
    setLoading(true);
    try {
      const fetchSnapshot = async () => {
        const [{ data: statusRows, error: statusError }, { data: receiptRows, error: receiptError }] = await Promise.all([
          (supabase as any).from('payroll_admin_status_v').select('*').eq('company_id', companyId).eq('competencia', competencia).order('employee_name', { ascending: true, nullsFirst: false }),
          (supabase as any).from('payroll_payment_receipts').select('*').eq('company_id', companyId).eq('competencia', competencia).eq('status', 'PAGAMENTO_NAO_IDENTIFICADO').is('employee_id', null).order('created_at', { ascending: false }),
        ]);
        if (statusError) throw statusError;
        if (receiptError) throw receiptError;
        return { statusRows: statusRows || [], receiptRows: receiptRows || [] };
      };

      let { statusRows, receiptRows } = await fetchSnapshot();
      let changed = false;

      for (const row of statusRows) {
        try {
          if (row.document_id && row.employee_id && !row.holerite_confirmed) {
            await apiCall('confirm-document', { document_id: row.document_id });
            changed = true;
          }
          if (row.receipt_id && row.employee_id && !row.payment_confirmed) {
            await apiCall('confirm-payment', { receipt_id: row.receipt_id, override_reason: AUTO_OVERRIDE_REASON });
            changed = true;
          }
        } catch (error: any) {
          console.warn('[payroll-auto-authorize-existing]', { documentId: row.document_id, receiptId: row.receipt_id, error: error?.message || error });
        }
      }

      const autoRepairKey = `${companyId}:${competencia}`;
      if (autoRepairKeyRef.current !== autoRepairKey && receiptRows.length) {
        autoRepairKeyRef.current = autoRepairKey;
        const docsByEmployee = new Map<string, any>(statusRows.filter((row: any) => row.employee_id && row.document_id).map((row: any) => [row.employee_id, row]));
        for (const receipt of receiptRows) {
          try {
            const { data: receiptBlob, error: downloadError } = await supabase.storage.from(BUCKET).download(receipt.storage_path);
            if (downloadError || !receiptBlob) throw downloadError || new Error('Comprovante sem arquivo no storage.');
            const receiptFile = new File([receiptBlob], receipt.original_filename || 'comprovante.pdf', { type: 'application/pdf' });
            const parsed = await parsePayrollPdf({ file: receiptFile, employees: scopedEmployees, kind: 'COMPROVANTE' });
            if (parsed.length !== 1) continue;
            const item = parsed[0];
            const autoAllowed = Boolean(item.employeeId) && item.confidence >= 85 && AUTO_MATCH_METHODS.has(item.matchMethod);
            if (!autoAllowed || !item.employeeId) continue;
            const doc = docsByEmployee.get(item.employeeId);

            const { error: updateError } = await (supabase as any).from('payroll_payment_receipts').update({
              employee_id: item.employeeId,
              document_id: doc?.document_id || null,
              status: 'PAGAMENTO_IDENTIFICADO',
              match_confidence: item.confidence,
              extracted_data: { ...(receipt.extracted_data || {}), metodo_vinculo: item.matchMethod, reconhecimento_automatico: true },
            }).eq('id', receipt.id);
            if (updateError) throw updateError;

            if (doc?.document_id) {
              if (!doc.holerite_confirmed) await apiCall('confirm-document', { document_id: doc.document_id });
              await apiCall('confirm-payment', { receipt_id: receipt.id, override_reason: AUTO_OVERRIDE_REASON });
            }
            changed = true;
          } catch (error: any) {
            console.warn('[payroll-auto-repair-receipt]', { receiptId: receipt.id, file: receipt.original_filename, error: error?.message || error });
          }
        }
      }

      if (changed) ({ statusRows, receiptRows } = await fetchSnapshot());
      setRows(statusRows);
      setUnmatchedReceipts(receiptRows);
    } catch (error: any) { toast.error(error?.message || 'Não foi possível carregar os holerites.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { autoRepairKeyRef.current = ''; void load(); }, [companyId, competencia, enabled]);
  if (!enabled) return null;

  const netByEmployee = new Map<string, number>(rows.filter(r => r.employee_id && r.net_amount != null).map(r => [r.employee_id, Number(r.net_amount)]));
  const documentByEmployee = new Map<string, any>(rows.filter(r => r.employee_id).map(r => [r.employee_id, r]));
  const previewSummary = summarizeAnalyses(previewAnalyses);
  const previewDocuments = previewAnalyses.flatMap(analysis => analysis.documents.map(document => ({ analysis, document })));

  const copyPortal = async () => {
    try { await navigator.clipboard.writeText(portalUrl); toast.success('Link único do Portal de Holerite copiado.'); }
    catch { window.prompt('Copie o link do Portal de Holerite:', portalUrl); }
  };

  const applyScopeValidation = (analyses: PayrollFileAnalysis[]) => {
    const expectedCnpj = digits(company?.cnpj);
    for (const analysis of analyses) {
      for (const doc of analysis.documents) {
        if (doc.status === 'ERRO') continue;
        const detectedCnpj = digits(doc.cnpjDetected);
        if (detectedCnpj && expectedCnpj && detectedCnpj !== expectedCnpj) {
          doc.status = 'PENDENTE';
          doc.employeeId = null;
          doc.employeeName = null;
          doc.matchMethod = 'NAO_IDENTIFICADO';
          doc.confidence = 0;
          doc.message = `CNPJ do documento (${doc.cnpjDetected}) não corresponde à empresa selecionada.`;
          continue;
        }
        if (doc.competenciaDetected && competencia && doc.competenciaDetected !== competencia) {
          doc.status = 'PENDENTE';
          doc.employeeId = null;
          doc.employeeName = null;
          doc.matchMethod = 'NAO_IDENTIFICADO';
          doc.confidence = 0;
          doc.message = `Competência detectada (${doc.competenciaDetected}) difere da competência selecionada (${competencia}).`;
        }
      }
    }
    return analyses;
  };

  const uploadHolerites = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const pdfFiles = files.filter(file => /\.pdf$/i.test(file.name));
      if (!pdfFiles.length) throw new Error('Selecione pelo menos um arquivo PDF.');
      const analyses = applyScopeValidation(await analyzePayrollFiles({
        files: pdfFiles,
        employees: scopedEmployees,
        onLog: entry => console.error('[payroll-upload-diagnostic]', entry),
      }));
      const summary = summarizeAnalyses(analyses);
      if (!summary.pages) {
        const fatal = analyses.map(analysis => analysis.fatalError).filter(Boolean).join(' | ');
        throw new Error(fatal || 'Nenhuma página de PDF pôde ser analisada.');
      }
      setPreviewAnalyses(analyses);
      setPreviewOpen(true);
      toast.success(`Análise concluída: ${summary.pages} página(s), ${summary.documents} documento(s). O que não for reconhecido não será salvo.`);
    } catch (error: any) {
      console.error('[payroll-upload-fatal]', { fileCount: files.length, message: error?.message, stack: error?.stack, at: new Date().toISOString() });
      toast.error(`Falha ao analisar holerites: ${error?.message || error}`);
    } finally {
      setUploading(false);
      if (holeriteInput.current) holeriteInput.current.value = '';
    }
  };

  const openPreviewDocument = (doc: PayrollPageDocument) => {
    if (!doc.bytes?.byteLength) return toast.error('Esta página não gerou um PDF válido para visualização.');
    const blob = new Blob([doc.bytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (!opened) toast.info('O navegador bloqueou a nova aba. Permita pop-ups para visualizar o documento.');
  };

  const removePreviewDocument = (key: string) => {
    setPreviewAnalyses(current => current
      .map(analysis => ({ ...analysis, documents: analysis.documents.filter(document => document.key !== key) }))
      .filter(analysis => analysis.documents.length > 0));
  };

  const discardUnmatchedReceipts = async () => {
    if (!unmatchedReceipts.length) return;
    setUploading(true);
    try {
      const result = await apiCall('discard-unmatched-receipts', { company_id: companyId, competencia });
      toast.success(`${Number(result.discarded || 0)} comprovante(s) não reconhecido(s) descartado(s).`);
      await load();
    } catch (error: any) {
      toast.error(`Falha ao descartar comprovantes: ${error?.message || error}`);
    } finally {
      setUploading(false);
    }
  };

  const confirmHoleriteImport = async () => {
    if (!previewAnalyses.length) return;
    setUploading(true);
    try {
      let created = 0;
      let rejected = 0;
      let skipped = 0;
      let errors = 0;

      for (const analysis of previewAnalyses) {
        for (const item of analysis.documents) {
          if (item.status === 'ERRO' || !item.bytes.byteLength || !item.sha256) {
            errors += 1;
            continue;
          }
          if (!item.employeeId || item.status === 'PENDENTE') {
            rejected += 1;
            continue;
          }

          const { data: sourceDuplicate, error: sourceDuplicateError } = await (supabase as any)
            .from('payroll_documents')
            .select('id')
            .eq('company_id', companyId)
            .eq('competencia', competencia)
            .eq('source_sha256', analysis.sourceSha256)
            .eq('source_page_start', item.pageNumber)
            .maybeSingle();
          if (sourceDuplicateError) throw sourceDuplicateError;
          if (sourceDuplicate) {
            skipped += 1;
            continue;
          }

          const { data: hashDuplicate, error: hashDuplicateError } = await (supabase as any)
            .from('payroll_documents')
            .select('id')
            .eq('company_id', companyId)
            .eq('competencia', competencia)
            .eq('document_sha256', item.sha256)
            .maybeSingle();
          if (hashDuplicateError) throw hashDuplicateError;
          if (hashDuplicate) {
            skipped += 1;
            continue;
          }

          const path = `${companyId}/${competencia}/holerites/${safeUuid()}-${safeFile(item.filename)}`;
          const blob = new Blob([item.bytes as any], { type: 'application/pdf' });
          const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
          if (storageError) throw storageError;

          const { data: insertedDocument, error: insertError } = await (supabase as any).from('payroll_documents').insert({
            company_id: companyId,
            employee_id: item.employeeId,
            competencia,
            storage_path: path,
            original_filename: item.filename,
            mime_type: 'application/pdf',
            file_size: item.bytes.byteLength,
            document_sha256: item.sha256,
            source_sha256: analysis.sourceSha256,
            source_page_start: item.pageNumber,
            source_page_end: item.pageNumber,
            net_amount: item.amountDetected,
            match_confidence: item.confidence,
            extracted_data: {
              pagina_fisica: item.pageNumber,
              paginas: [item.pageNumber],
              cpf_detectado: item.cpfDetected,
              metodo_vinculo: item.matchMethod,
              status_analise: 'IDENTIFICADO',
              nome_detectado: item.employeeNameDetected,
              codigo_detectado: item.employeeCodeDetected,
              cargo_detectado: item.jobTitleDetected,
              cbo_detectado: item.cboDetected,
              empresa_detectada: item.companyNameDetected,
              cnpj_detectado: item.cnpjDetected,
              competencia_detectada: item.competenciaDetected,
              tipo_documento_detectado: item.documentType,
              subtipo_documento_detectado: item.documentSubtype,
              valor_liquido_detectado: item.amountDetected,
              vias_na_mesma_pagina: item.duplicateCopiesDetected,
              usou_ocr: item.usedOcr,
              regra_importacao: '1_PAGINA_FISICA_1_DOCUMENTO',
            },
            status: 'HOLERITE_PENDENTE',
          }).select('id').single();

          if (insertError) {
            await supabase.storage.from(BUCKET).remove([path]);
            throw insertError;
          }

          created += 1;
          await apiCall('confirm-document', { document_id: insertedDocument.id });

          const { data: receiptCandidates, error: receiptCandidateError } = await (supabase as any)
            .from('payroll_payment_receipts')
            .select('id,document_id,status')
            .eq('company_id', companyId)
            .eq('competencia', competencia)
            .eq('employee_id', item.employeeId)
            .eq('confirmed', false)
            .eq('status', 'PAGAMENTO_IDENTIFICADO')
            .limit(2);
          if (receiptCandidateError) throw receiptCandidateError;
          const eligibleReceipts = (receiptCandidates || []).filter((receipt: any) => !receipt.document_id || receipt.document_id === insertedDocument.id);
          if (eligibleReceipts.length === 1) {
            const receipt = eligibleReceipts[0];
            if (!receipt.document_id) {
              const { error: receiptLinkError } = await (supabase as any).from('payroll_payment_receipts').update({ document_id: insertedDocument.id }).eq('id', receipt.id);
              if (receiptLinkError) throw receiptLinkError;
            }
            await apiCall('confirm-payment', { receipt_id: receipt.id, override_reason: AUTO_OVERRIDE_REASON });
          }
        }
      }

      setPreviewOpen(false);
      setPreviewAnalyses([]);
      toast.success(`${created} holerite(s) salvo(s) e conferido(s) automaticamente.${rejected ? ` ${rejected} não reconhecido(s) descartado(s) sem salvar.` : ''}${skipped ? ` ${skipped} duplicado(s) ignorado(s).` : ''}${errors ? ` ${errors} página(s) com erro descartada(s).` : ''}`);
      await load();
    } catch (error: any) {
      console.error('[payroll-import-fatal]', { message: error?.message, stack: error?.stack, at: new Date().toISOString() });
      toast.error(`Falha ao confirmar importação: ${error?.message || error}`);
    } finally {
      setUploading(false);
    }
  };

  const uploadReceipts = async (incoming: File[]) => {
    if (!incoming.length) return;
    setUploading(true);
    try {
      const files: File[] = [];
      for (const file of incoming) {
        if (/\.zip$/i.test(file.name)) files.push(...await extractPdfFilesFromZip(file));
        else if (/\.pdf$/i.test(file.name)) files.push(file);
      }
      let created = 0; let rejected = 0; let authorized = 0; let waitingHolerite = 0; let duplicates = 0;
      for (const file of files) {
        const parsed = await parsePayrollPdf({ file, employees: scopedEmployees, kind: 'COMPROVANTE', netAmountByEmployee: netByEmployee });
        const sourceHash = await sha256Browser(file);
        for (const item of parsed) {
          const autoAllowed = Boolean(item.employeeId) && item.confidence >= 85 && AUTO_MATCH_METHODS.has(item.matchMethod);
          const employeeId = autoAllowed ? item.employeeId : null;
          if (!employeeId) {
            rejected += 1;
            continue;
          }

          const hash = await sha256Browser(item.bytes);
          const metadata = extractReceiptMetadata(item.text);
          const doc = documentByEmployee.get(employeeId);
          const idempotencyKey = `receipt:${companyId}:${competencia}:${hash}`;
          const { data: duplicateRows, error: duplicateError } = await (supabase as any).from('payroll_payment_receipts').select('id').eq('company_id', companyId).eq('competencia', competencia).eq('receipt_sha256', hash).limit(1);
          if (duplicateError) throw duplicateError;
          if (duplicateRows?.length) { duplicates += 1; continue; }
          const path = `${companyId}/${competencia}/comprovantes/${safeUuid()}-${safeFile(item.filename)}`;
          const blob = new Blob([item.bytes as any], { type: 'application/pdf' });
          const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
          if (storageError) throw storageError;
          const { data: insertedReceipt, error: insertError } = await (supabase as any).from('payroll_payment_receipts').insert({
            company_id: companyId, employee_id: employeeId, document_id: doc?.document_id || null, competencia,
            storage_path: path, original_filename: item.filename, mime_type: 'application/pdf', file_size: item.bytes.byteLength,
            receipt_sha256: hash, source_sha256: sourceHash,
            source_page_start: item.pageNumbers[0] || null, source_page_end: item.pageNumbers[item.pageNumbers.length - 1] || null,
            amount: metadata.amount ?? item.amountDetected, paid_at: metadata.paidAt, bank_name: metadata.bankName,
            transaction_id: metadata.transactionId, bank_authentication: metadata.bankAuthentication, payer_name: metadata.payerName,
            match_confidence: item.confidence,
            extracted_data: { cpf_detectado: item.cpfDetected, metodo_vinculo: item.matchMethod, paginas: item.pageNumbers, reconhecimento_automatico: true },
            status: 'PAGAMENTO_IDENTIFICADO', idempotency_key: idempotencyKey,
          }).select('id').single();
          if (insertError) { await supabase.storage.from(BUCKET).remove([path]); throw insertError; }
          created += 1;

          if (doc?.document_id) {
            if (!doc.holerite_confirmed) await apiCall('confirm-document', { document_id: doc.document_id });
            await apiCall('confirm-payment', { receipt_id: insertedReceipt.id, override_reason: AUTO_OVERRIDE_REASON });
            authorized += 1;
          } else {
            waitingHolerite += 1;
          }
        }
      }
      toast.success(`${created} comprovante(s) reconhecido(s) e salvo(s). ${authorized} pagamento(s) confirmado(s) automaticamente.${waitingHolerite ? ` ${waitingHolerite} reconhecido(s) aguardando o holerite correspondente.` : ''}${rejected ? ` ${rejected} não reconhecido(s) descartado(s) sem salvar.` : ''}${duplicates ? ` ${duplicates} duplicado(s) ignorado(s).` : ''}`);
      await load();
    } catch (error: any) { toast.error(`Falha ao subir comprovantes: ${error?.message || error}`); }
    finally { setUploading(false); if (receiptInput.current) receiptInput.current.value = ''; }
  };

  const confirmDocument = async (row: any) => {
    try { await apiCall('confirm-document', { document_id: row.document_id }); toast.success('Holerite conferido. Aguardando confirmação do pagamento.'); await load(); }
    catch (error: any) { toast.error(error.message); }
  };

  const confirmPayment = async (row: any, overrideReason = '') => {
    try { await apiCall('confirm-payment', { receipt_id: row.receipt_id, override_reason: overrideReason }); toast.success('Pagamento confirmado. Holerite liberado no portal único.'); await load(); }
    catch (error: any) {
      if (error.payload?.error === 'payment_amount_mismatch') {
        const reason = window.prompt(`O comprovante difere do líquido em ${currency(error.payload.difference)}. Se estiver correto, informe o motivo administrativo:`);
        if (reason?.trim()) return confirmPayment(row, reason.trim());
      }
      toast.error(error.message);
    }
  };

  const assignDocument = async (row: any) => {
    const employeeId = assignDoc[row.document_id];
    if (!employeeId) return toast.error('Selecione o funcionário.');
    try {
      const { error } = await (supabase as any).from('payroll_documents').update({ employee_id: employeeId, match_confidence: 100, extracted_data: { ...(row.extracted_data || {}), metodo_vinculo: 'RH_MANUAL' } }).eq('id', row.document_id);
      if (error) throw error; toast.success('Holerite vinculado ao funcionário.'); await load();
    } catch (error: any) { toast.error(error.message); }
  };

  const assignUnmatchedReceipt = async (receipt: any) => {
    const employeeId = assignReceipt[receipt.id];
    const doc = employeeId ? documentByEmployee.get(employeeId) : null;
    if (!employeeId || !doc) return toast.error('Selecione um funcionário que já possua holerite nesta competência.');
    try {
      const { error } = await (supabase as any).from('payroll_payment_receipts').update({
        employee_id: employeeId, document_id: doc.document_id, status: 'PAGAMENTO_IDENTIFICADO', match_confidence: 100,
        extracted_data: { ...(receipt.extracted_data || {}), metodo_vinculo: 'RH_MANUAL' },
      }).eq('id', receipt.id);
      if (error) throw error; toast.success('Comprovante vinculado. Confirme o pagamento após a conferência.'); await load();
    } catch (error: any) { toast.error(error.message); }
  };

  const openAdminFile = async (row: any, kind: 'holerite'|'receipt'|'certificate') => {
    try {
      const result = await apiCall('signed-urls', { document_id: row.document_id });
      const url = kind === 'holerite' ? result.holerite_url : kind === 'receipt' ? result.receipt_url : result.certificate_url;
      if (!url) return toast.error('Arquivo ainda não disponível.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) { toast.error(error.message); }
  };

  const openTimeline = async (row: any) => {
    if (!row.request_id) return toast.info('O funcionário ainda não acessou esse holerite pelo portal.');
    try {
      const data = await apiCall('timeline', { request_id: row.request_id });
      setTimeline({ ...data, employee: row.employee_name || 'Funcionário' }); setTimelineOpen(true);
    } catch (error: any) { toast.error(error.message); }
  };

  const dossier = async (row: any) => {
    if (row.signature_status !== 'ASSINADO') return toast.error('O dossiê final exige assinatura concluída.');
    try {
      const urls = await apiCall('signed-urls', { document_id: row.document_id });
      if (!urls.holerite_url || !urls.certificate_url || !urls.receipt_url) throw new Error('Dossiê incompleto: holerite, certificado ou comprovante ausente.');
      await mergePdfUrls([{ url: urls.holerite_url, label: 'Holerite' }, { url: urls.certificate_url, label: 'Certificado' }, { url: urls.receipt_url, label: 'Comprovante' }], `DOSSIE_PAGAMENTO_${safeFile(row.employee_name || 'FUNCIONARIO')}_${competencia}.pdf`);
    } catch (error: any) { toast.error(error.message); }
  };

  const consolidated = async () => {
    const filtered = rows.filter(row => consolidatedFilter === 'todos' ? Boolean(row.document_id) : consolidatedFilter === 'assinados' ? row.signature_status === 'ASSINADO' : row.signature_status !== 'ASSINADO');
    if (!filtered.length) return toast.info('Nenhum holerite nesse filtro.');
    try {
      const sources: Array<{url:string;label:string}> = [];
      for (const row of filtered) {
        const urls = await apiCall('signed-urls', { document_id: row.document_id });
        if (urls.holerite_url) sources.push({ url: urls.holerite_url, label: row.employee_name || row.holerite_filename });
      }
      await mergePdfUrls(sources, `HOLERITES_${safeFile(company?.name || 'EMPRESA')}_${competencia}_${consolidatedFilter.toUpperCase()}.pdf`);
    } catch (error: any) { toast.error(error.message); }
  };

  const releasedCount = rows.filter(r => r.holerite_confirmed && r.payment_confirmed && r.signature_status !== 'ASSINADO').length;

  return <div className="mt-5 space-y-4 rounded-2xl border border-emerald-500/25 bg-card p-5">
    <input ref={holeriteInput} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={e=>void uploadHolerites(Array.from(e.target.files || []))}/>
    <input ref={receiptInput} type="file" accept="application/pdf,.pdf,.zip,application/zip" multiple className="hidden" onChange={e=>void uploadReceipts(Array.from(e.target.files || []))}/>

    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><p className="text-xs uppercase tracking-wide text-emerald-400">Fechamento → Pagamento</p><h2 className="mt-1 flex items-center gap-2 text-lg font-bold"><FileSignature className="h-5 w-5"/>Assinatura eletrônica de holerites</h2><p className="mt-1 text-xs text-muted-foreground">Reconhecimento automático por funcionário: bateu o nome/CPF, autoriza. Não reconheceu, não salva.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>holeriteInput.current?.click()} disabled={uploading}><FileUp className="mr-2 h-4 w-4"/>SUBIR HOLERITES</Button><Button variant="outline" onClick={()=>receiptInput.current?.click()} disabled={uploading}><ReceiptText className="mr-2 h-4 w-4"/>SUBIR COMPROVANTES</Button><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading?'animate-spin':''}`}/>Atualizar</Button></div></div>

    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold uppercase text-cyan-300"><ShieldCheck className="h-4 w-4"/>Portal único de holerite</p><p className="mt-2 break-all font-mono text-sm">{portalUrl}</p><p className="mt-2 text-xs text-muted-foreground">O mesmo link serve para todos. O funcionário se identifica com CPF + data de nascimento + últimos 4 números do celular cadastrado. Não usa WhatsApp API, SMS ou OTP.</p></div><div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" onClick={()=>void copyPortal()}><Copy className="mr-2 h-4 w-4"/>Copiar link</Button><Button variant="outline" onClick={()=>window.open(portalUrl,'_blank','noopener,noreferrer')}><ExternalLink className="mr-2 h-4 w-4"/>Abrir portal</Button></div></div></div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Kpi label="Holerites" value={rows.length}/><Kpi label="Pagamentos confirmados" value={rows.filter(r=>r.payment_confirmed).length}/><Kpi label="Liberados no portal" value={releasedCount}/><Kpi label="Assinados" value={rows.filter(r=>r.signature_status==='ASSINADO').length} success/><Kpi label="Não reconhecidos antigos" value={unmatchedReceipts.length} danger/></div>

    {unmatchedReceipts.length > 0 && <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold text-amber-300">ARQUIVOS ANTIGOS NÃO RECONHECIDOS</p><p className="mt-1 text-xs text-muted-foreground">Esses arquivos são de tentativas anteriores. Novos arquivos não reconhecidos não são mais salvos.</p></div><Button size="sm" variant="destructive" disabled={uploading} onClick={()=>void discardUnmatchedReceipts()}>DESCARTAR NÃO LIDOS</Button></div><div className="mt-2 space-y-1">{unmatchedReceipts.map(r=><div key={r.id} className="text-xs"><span>{r.original_filename} · {currency(r.amount)}</span></div>)}</div></div>}

    <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1250px] text-xs"><thead className="bg-muted/50"><tr>{['Funcionário','Holerite','Pagamento','Portal','Visualização','Assinatura','Status','Ações'].map(h=><th key={h} className="px-3 py-2 text-left uppercase text-muted-foreground">{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.document_id} className="border-t align-top">
      <td className="px-3 py-3"><b>{row.employee_name||'NÃO IDENTIFICADO'}</b><div className="text-muted-foreground">{row.employee_role||'—'}</div></td>
      <td className="px-3 py-3">{row.holerite_confirmed?<span className="text-emerald-400">CONFERIDO AUTOMATICAMENTE</span>:'Processando'}<div className="text-muted-foreground">V{row.document_version}</div></td>
      <td className="px-3 py-3">{row.payment_confirmed?<span className="text-emerald-400">CONFIRMADO · {currency(row.payment_amount)}</span>:row.payment_status?humanStatus(row.payment_status):'Aguardando comprovante'}</td>
      <td className="px-3 py-3">{row.holerite_confirmed&&row.payment_confirmed?(row.opened_at?<span className="text-cyan-300">Acessado<br/>{brDateTime(row.opened_at)}</span>:<span className="text-emerald-400">LIBERADO</span>):<span className="text-muted-foreground">Bloqueado</span>}</td>
      <td className="px-3 py-3">{brDateTime(row.viewed_at)}</td><td className="px-3 py-3">{brDateTime(row.signed_at)}</td>
      <td className="px-3 py-3"><Badge variant="outline" className={statusClass(displayStatus(row))}>{displayStatus(row)}</Badge></td>
      <td className="px-3 py-3"><div className="flex max-w-[480px] flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'holerite')}>Holerite</Button>{row.receipt_id&&<Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'receipt')}>Comprovante</Button>}{row.signature_status==='ASSINADO'&&<Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'certificate')}>Certificado</Button>}{row.signature_status==='ASSINADO'&&<Button size="sm" variant="outline" onClick={()=>void dossier(row)}><FileArchive className="mr-1 h-3 w-3"/>Dossiê</Button>}{row.request_id&&<Button size="sm" variant="ghost" onClick={()=>void openTimeline(row)}><Clock3 className="mr-1 h-3 w-3"/>Histórico</Button>}</div></td>
    </tr>)}{!rows.length&&<tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum holerite recebido nesta competência.</td></tr>}</tbody></table></div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3"><FileArchive className="h-4 w-4"/><b className="text-xs">GERAR PDF CONSOLIDADO</b><select value={consolidatedFilter} onChange={e=>setConsolidatedFilter(e.target.value as any)} className="rounded border bg-background px-2 py-1.5 text-xs"><option value="assinados">Somente assinados</option><option value="todos">Todos</option><option value="pendentes">Somente pendentes</option></select><Button size="sm" variant="outline" onClick={()=>void consolidated()}>Gerar consolidado</Button></div>

    {uploading&&<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60"><div className="rounded-xl border bg-background p-5 text-center"><Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin"/><b>Processando documentos reais...</b><p className="mt-1 text-xs text-muted-foreground">Leitura, separação, OCR, SHA-256, reconhecimento e autorização automática.</p></div></div>}

    <Dialog open={previewOpen} onOpenChange={open=>{ if (!uploading) setPreviewOpen(open); }}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Arquivo processado — prévia do lote</DialogTitle></DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label="Páginas" value={previewSummary.pages}/>
          <Kpi label="Documentos" value={previewSummary.documents}/>
          <Kpi label="Identificados" value={previewSummary.identified} success/>
          <Kpi label="Não reconhecidos" value={previewSummary.pending}/>
          <Kpi label="Erros" value={previewSummary.errors} danger/>
        </div>
        <p className="text-xs text-muted-foreground">Regra: bateu o funcionário, salva e confere automaticamente. Não reconheceu ou deu erro, não salva.</p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[980px] text-xs">
            <thead className="bg-muted/50"><tr>{['Arquivo / Página','Funcionário','Empresa','Competência','Tipo','Líquido','Status','Ação'].map(h=><th key={h} className="px-3 py-2 text-left uppercase text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {previewDocuments.map(({ analysis, document }) => <tr key={document.key} className="border-t align-top">
                <td className="px-3 py-3"><b>{analysis.filename}</b><div className="text-muted-foreground">Página física {document.pageNumber} · {document.duplicateCopiesDetected > 1 ? `${document.duplicateCopiesDetected} vias na mesma página` : '1 via'}</div></td>
                <td className="px-3 py-3"><b>{document.employeeName || document.employeeNameDetected || 'NÃO IDENTIFICADO'}</b><div className="text-muted-foreground">{document.jobTitleDetected || '—'}{document.cboDetected ? ` · CBO ${document.cboDetected}` : ''}</div></td>
                <td className="px-3 py-3">{document.companyNameDetected || company?.name || '—'}<div className="text-muted-foreground">{document.cnpjDetected || '—'}</div></td>
                <td className="px-3 py-3">{document.competenciaLabelDetected || document.competenciaDetected || competencia}</td>
                <td className="px-3 py-3">{documentTypeLabel(document)}</td>
                <td className="px-3 py-3">{currency(document.amountDetected)}</td>
                <td className="px-3 py-3"><Badge variant="outline" className={statusClass(document.status === 'PENDENTE' ? 'NÃO RECONHECIDO' : document.status)}>{document.status === 'PENDENTE' ? 'NÃO RECONHECIDO' : document.status}</Badge>{document.message&&<div className="mt-1 max-w-72 text-[11px] text-muted-foreground">{document.message}</div>}</td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" disabled={!document.bytes.byteLength} onClick={()=>openPreviewDocument(document)}><ExternalLink className="mr-1 h-3 w-3"/>VER DOCUMENTO</Button>{(!document.employeeId || document.status === 'PENDENTE' || document.status === 'ERRO')&&<Button size="sm" variant="destructive" onClick={()=>removePreviewDocument(document.key)}>REMOVER</Button>}</div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={uploading} onClick={()=>{setPreviewOpen(false); setPreviewAnalyses([]);}}>Cancelar</Button>
          <Button disabled={uploading || previewSummary.documents === 0} onClick={()=>void confirmHoleriteImport()}><FileCheck2 className="mr-2 h-4 w-4"/>IMPORTAR RECONHECIDOS</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}><DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>Histórico — {timeline.employee}</DialogTitle></DialogHeader><div className="space-y-2">{[...(timeline.events||[]).map((e:any)=>({...e,_kind:'evento'})),...(timeline.messages||[]).map((m:any)=>({...m,_kind:'mensagem'}))].sort((a:any,b:any)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).map((item:any,index:number)=><div key={`${item._kind}-${item.id}-${index}`} className="rounded-lg border p-3 text-xs"><div className="flex justify-between gap-3"><b>{item.event_type||item.message_kind}</b><span className="text-muted-foreground">{brDateTime(item.created_at)}</span></div><div className="mt-1 text-muted-foreground">{item._kind==='mensagem'?`${item.status} · ${item.channel}${item.error?` · ${item.error}`:''}`:JSON.stringify(item.payload||{})}</div></div>)}</div></DialogContent></Dialog>
  </div>;
};

const Kpi = ({ label, value, success=false, danger=false }: { label:string; value:number; success?:boolean; danger?:boolean }) => <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={`text-xl font-bold ${success?'text-emerald-400':''} ${danger?'text-red-400':''}`}>{value}</p></div>;

export default PayrollPortalAdminModule;
