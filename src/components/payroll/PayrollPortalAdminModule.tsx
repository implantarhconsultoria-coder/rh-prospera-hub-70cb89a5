import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Copy, ExternalLink, FileArchive, FileSignature, FileUp, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
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
  type PayrollFileAnalysis,
  type PayrollPageDocument,
} from '@/lib/payrollPageDocuments';

const BUCKET = 'payroll-private';
const ALLOWED_CODES = new Set(['topac-matriz', 'topac-pg', 'topac-gyn', 'alqui', 'lmt']);
const ALLOWED_CNPJS = new Set(['07291648000103','07291648000294','07291648000375','14464586000150','21967711000100']);
const AUTO_OVERRIDE_REASON = 'AUTORIZACAO_AUTOMATICA_NOME_E_VALOR';
const AMOUNT_TOLERANCE = 0.05;

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const safeFile = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 100);
const brDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const currency = (value?: number | null) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const humanStatus = (value: unknown) => String(value || '').replace(/_/g, ' ');
const amountMatches = (left: unknown, right: unknown) => {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= AMOUNT_TOLERANCE;
};

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

  // REGRA ABSOLUTA: toda leitura/matching usa somente funcionários ativos da empresa selecionada.
  const scopedEmployees = useMemo<PayrollEmployeeMatch[]>(() => employees
    .filter(e => e.companyId === companyId && e.status === 'ativo')
    .map(e => ({ id: e.id, name: e.name, cpf: e.cpf, cargo: e.cargo, companyId: e.companyId }))
    .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, companyId]);

  const [rows, setRows] = useState<any[]>([]);
  const [reviewReceipts, setReviewReceipts] = useState<any[]>([]);
  const [reviewDocuments, setReviewDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assignReceipt, setAssignReceipt] = useState<Record<string,string>>({});
  const [assignDoc, setAssignDoc] = useState<Record<string,string>>({});
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timeline, setTimeline] = useState<any>({ events: [], messages: [], employee: '' });
  const [consolidatedFilter, setConsolidatedFilter] = useState<'assinados'|'todos'|'pendentes'>('assinados');
  const unifiedInput = useRef<HTMLInputElement>(null);
  const reconcilingRef = useRef(false);

  const fetchSnapshot = async () => {
    const [statusResult, receiptResult, documentResult] = await Promise.all([
      (supabase as any).from('payroll_admin_status_v').select('*').eq('company_id', companyId).eq('competencia', competencia).order('employee_name', { ascending: true, nullsFirst: false }),
      (supabase as any).from('payroll_payment_receipts').select('*').eq('company_id', companyId).eq('competencia', competencia).eq('confirmed', false).order('created_at', { ascending: false }),
      (supabase as any).from('payroll_documents').select('*').eq('company_id', companyId).eq('competencia', competencia).is('employee_id', null).order('created_at', { ascending: false }),
    ]);
    if (statusResult.error) throw statusResult.error;
    if (receiptResult.error) throw receiptResult.error;
    if (documentResult.error) throw documentResult.error;
    return {
      statusRows: statusResult.data || [],
      pendingReceipts: receiptResult.data || [],
      pendingDocuments: documentResult.data || [],
    };
  };

  const reconcilePayments = async (statusRows: any[], receipts: any[]) => {
    if (reconcilingRef.current) return false;
    reconcilingRef.current = true;
    let changed = false;
    try {
      const docsByEmployee = new Map<string, any>(
        statusRows.filter(row => row.employee_id && row.document_id).map(row => [row.employee_id, row]),
      );

      for (const receipt of receipts) {
        try {
          let employeeId: string | null = receipt.employee_id || null;
          let matchMethod = String(receipt.extracted_data?.metodo_vinculo || 'NAO_IDENTIFICADO');
          let confidence = Number(receipt.match_confidence || 0);
          let receiptAmount = receipt.amount == null ? null : Number(receipt.amount);

          // Se ainda não houver funcionário, releia o PDF preservado usando SOMENTE a empresa selecionada.
          if (!employeeId && receipt.storage_path) {
            const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(receipt.storage_path);
            if (downloadError || !blob) throw downloadError || new Error('Comprovante sem arquivo no storage.');
            const file = new File([blob], receipt.original_filename || 'comprovante.pdf', { type: 'application/pdf' });
            const parsed = await parsePayrollPdf({ file, employees: scopedEmployees, kind: 'COMPROVANTE' });
            if (parsed.length === 1) {
              const item = parsed[0];
              employeeId = item.employeeId || null;
              matchMethod = item.matchMethod;
              confidence = Number(item.confidence || 0);
              const metadata = extractReceiptMetadata(item.text);
              receiptAmount = metadata.amount ?? item.amountDetected ?? receiptAmount;
            }
          }

          const doc = employeeId ? docsByEmployee.get(employeeId) : null;
          const nameAndAmountMatch = Boolean(employeeId && doc?.document_id && amountMatches(receiptAmount, doc.net_amount));

          if (nameAndAmountMatch) {
            const { error: updateError } = await (supabase as any).from('payroll_payment_receipts').update({
              employee_id: employeeId,
              document_id: doc.document_id,
              amount: receiptAmount,
              status: 'PAGAMENTO_IDENTIFICADO',
              match_confidence: Math.max(100, confidence),
              extracted_data: {
                ...(receipt.extracted_data || {}),
                metodo_vinculo: 'NOME_VALOR',
                reconhecimento_automatico: true,
                nome_e_valor_conferidos: true,
                aguardando_associacao_manual: false,
              },
            }).eq('id', receipt.id);
            if (updateError) throw updateError;
            if (!doc.holerite_confirmed) await apiCall('confirm-document', { document_id: doc.document_id });
            await apiCall('confirm-payment', { receipt_id: receipt.id, override_reason: AUTO_OVERRIDE_REASON });
            changed = true;
            continue;
          }

          // Nome reconhecido sem par financeiro: preserva o candidato, mas NÃO confirma.
          if (employeeId && (employeeId !== receipt.employee_id || receiptAmount !== receipt.amount)) {
            const { error: updateError } = await (supabase as any).from('payroll_payment_receipts').update({
              employee_id: employeeId,
              document_id: null,
              amount: receiptAmount,
              status: 'PAGAMENTO_IDENTIFICADO',
              match_confidence: confidence,
              extracted_data: {
                ...(receipt.extracted_data || {}),
                metodo_vinculo: matchMethod,
                reconhecimento_automatico: true,
                nome_e_valor_conferidos: false,
                aguardando_associacao_manual: true,
                motivo_revisao: doc?.document_id ? 'VALOR_NAO_CORRESPONDE_AO_LIQUIDO' : 'HOLERITE_AINDA_NAO_ENCONTRADO',
              },
            }).eq('id', receipt.id);
            if (updateError) throw updateError;
            changed = true;
          }
        } catch (error: any) {
          console.warn('[payroll-reconcile]', { receiptId: receipt.id, error: error?.message || error });
        }
      }
    } finally {
      reconcilingRef.current = false;
    }
    return changed;
  };

  const load = async () => {
    if (!enabled || !companyId || !competencia) return;
    setLoading(true);
    try {
      let snapshot = await fetchSnapshot();
      const changed = await reconcilePayments(snapshot.statusRows, snapshot.pendingReceipts);
      if (changed) snapshot = await fetchSnapshot();
      setRows(snapshot.statusRows);
      setReviewReceipts(snapshot.pendingReceipts);
      setReviewDocuments(snapshot.pendingDocuments);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar o fechamento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [companyId, competencia, enabled]);
  if (!enabled) return null;

  const documentByEmployee = new Map<string, any>(rows.filter(r => r.employee_id).map(r => [r.employee_id, r]));

  const copyPortal = async () => {
    try { await navigator.clipboard.writeText(portalUrl); toast.success('Link único do Portal de Holerite copiado.'); }
    catch { window.prompt('Copie o link do Portal de Holerite:', portalUrl); }
  };

  const enforceCompanyScope = (analysis: PayrollFileAnalysis) => {
    const expectedCnpj = digits(company?.cnpj);
    for (const doc of analysis.documents) {
      const detectedCnpj = digits(doc.cnpjDetected);
      if (detectedCnpj && expectedCnpj && detectedCnpj !== expectedCnpj) {
        doc.employeeId = null;
        doc.employeeName = null;
        doc.status = 'PENDENTE';
        doc.matchMethod = 'NAO_IDENTIFICADO';
        doc.confidence = 0;
        doc.message = `Documento pertence a outro CNPJ (${doc.cnpjDetected}). Mantido para revisão; nunca será cruzado com ${company?.name}.`;
      }
    }
    return analysis;
  };

  const persistPayrollAnalysis = async (analysis: PayrollFileAnalysis) => {
    let created = 0;
    let review = 0;
    let duplicates = 0;
    for (const item of analysis.documents) {
      // Se houve falha real de geração de bytes, não há PDF válido para armazenar.
      if (!item.bytes.byteLength || !item.sha256) continue;

      const { data: duplicate, error: duplicateError } = await (supabase as any).from('payroll_documents')
        .select('id').eq('company_id', companyId).eq('competencia', competencia).eq('document_sha256', item.sha256).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) { duplicates += 1; continue; }

      const path = `${companyId}/${competencia}/holerites/${safeUuid()}-${safeFile(item.filename)}`;
      const blob = new Blob([item.bytes as any], { type: 'application/pdf' });
      const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
      if (storageError) throw storageError;

      const employeeId = item.status === 'IDENTIFICADO' ? item.employeeId : null;
      const { data: inserted, error: insertError } = await (supabase as any).from('payroll_documents').insert({
        company_id: companyId,
        employee_id: employeeId,
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
          nome_detectado: item.employeeNameDetected,
          metodo_vinculo: item.matchMethod,
          status_analise: employeeId ? 'IDENTIFICADO' : 'AGUARDANDO_ASSOCIACAO_MANUAL',
          empresa_detectada: item.companyNameDetected,
          cnpj_detectado: item.cnpjDetected,
          competencia_detectada: item.competenciaDetected,
          tipo_documento_detectado: item.documentType,
          subtipo_documento_detectado: item.documentSubtype,
          valor_liquido_detectado: item.amountDetected,
          vias_na_mesma_pagina: item.duplicateCopiesDetected,
          usou_ocr: item.usedOcr,
          regra_importacao: 'ZERO_DESCARTE_1_PAGINA_1_DOCUMENTO',
        },
        status: 'HOLERITE_PENDENTE',
      }).select('id').single();
      if (insertError) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insertError;
      }
      created += 1;
      if (employeeId) await apiCall('confirm-document', { document_id: inserted.id });
      else review += 1;
    }
    return { created, review, duplicates };
  };

  const persistBankFile = async (file: File) => {
    const parsed = await parsePayrollPdf({ file, employees: scopedEmployees, kind: 'COMPROVANTE' });
    const sourceHash = await sha256Browser(file);
    let created = 0;
    let review = 0;
    let duplicates = 0;

    for (const item of parsed) {
      if (!item.bytes.byteLength) continue;
      const hash = await sha256Browser(item.bytes);
      const metadata = extractReceiptMetadata(item.text);
      const { data: duplicate, error: duplicateError } = await (supabase as any).from('payroll_payment_receipts')
        .select('id').eq('company_id', companyId).eq('competencia', competencia).eq('receipt_sha256', hash).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) { duplicates += 1; continue; }

      const employeeId = item.employeeId || null;
      const amount = metadata.amount ?? item.amountDetected;
      const doc = employeeId ? documentByEmployee.get(employeeId) : null;
      const exactPair = Boolean(employeeId && doc?.document_id && amountMatches(amount, doc.net_amount));
      const path = `${companyId}/${competencia}/comprovantes/${safeUuid()}-${safeFile(item.filename)}`;
      const blob = new Blob([item.bytes as any], { type: 'application/pdf' });
      const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
      if (storageError) throw storageError;

      const { data: inserted, error: insertError } = await (supabase as any).from('payroll_payment_receipts').insert({
        company_id: companyId,
        employee_id: employeeId,
        document_id: exactPair ? doc.document_id : null,
        competencia,
        storage_path: path,
        original_filename: item.filename,
        mime_type: 'application/pdf',
        file_size: item.bytes.byteLength,
        receipt_sha256: hash,
        source_sha256: sourceHash,
        source_page_start: item.pageNumbers[0] || null,
        source_page_end: item.pageNumbers[item.pageNumbers.length - 1] || null,
        amount,
        paid_at: metadata.paidAt,
        bank_name: metadata.bankName,
        transaction_id: metadata.transactionId,
        bank_authentication: metadata.bankAuthentication,
        payer_name: metadata.payerName,
        match_confidence: item.confidence,
        extracted_data: {
          cpf_detectado: item.cpfDetected,
          nome_detectado: item.employeeName || null,
          metodo_vinculo: exactPair ? 'NOME_VALOR' : item.matchMethod,
          paginas: item.pageNumbers,
          reconhecimento_automatico: Boolean(employeeId),
          nome_e_valor_conferidos: exactPair,
          aguardando_associacao_manual: !exactPair,
          motivo_revisao: !employeeId ? 'NOME_NAO_RECONHECIDO' : !doc?.document_id ? 'HOLERITE_AINDA_NAO_ENCONTRADO' : !amountMatches(amount, doc.net_amount) ? 'VALOR_NAO_CORRESPONDE_AO_LIQUIDO' : null,
        },
        status: employeeId ? 'PAGAMENTO_IDENTIFICADO' : 'PAGAMENTO_NAO_IDENTIFICADO',
        idempotency_key: `receipt:${companyId}:${competencia}:${hash}`,
      }).select('id').single();
      if (insertError) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insertError;
      }
      created += 1;

      if (exactPair) {
        if (!doc.holerite_confirmed) await apiCall('confirm-document', { document_id: doc.document_id });
        await apiCall('confirm-payment', { receipt_id: inserted.id, override_reason: AUTO_OVERRIDE_REASON });
      } else {
        review += 1;
      }
    }
    return { created, review, duplicates };
  };

  const uploadUnified = async (incoming: File[]) => {
    if (!incoming.length) return;
    setUploading(true);
    try {
      const pdfFiles: File[] = [];
      for (const file of incoming) {
        if (/\.zip$/i.test(file.name)) pdfFiles.push(...await extractPdfFilesFromZip(file));
        else if (/\.pdf$/i.test(file.name)) pdfFiles.push(file);
      }
      if (!pdfFiles.length) throw new Error('Selecione PDF ou ZIP contendo os documentos.');

      let payrollCreated = 0;
      let receiptCreated = 0;
      let review = 0;
      let duplicates = 0;

      // Cada arquivo é classificado isoladamente. Pode selecionar holerites e comprovantes juntos.
      for (const file of pdfFiles) {
        const analyses = await analyzePayrollFiles({ files: [file], employees: scopedEmployees });
        const analysis = analyses[0] ? enforceCompanyScope(analyses[0]) : null;
        const payrollLike = Boolean(analysis?.documents.some(doc => doc.documentType === 'PAYSLIP' || doc.documentType === 'SALARY_ADVANCE'));

        if (payrollLike && analysis) {
          const result = await persistPayrollAnalysis(analysis);
          payrollCreated += result.created;
          review += result.review;
          duplicates += result.duplicates;
        } else {
          const result = await persistBankFile(file);
          receiptCreated += result.created;
          review += result.review;
          duplicates += result.duplicates;
        }
      }

      // Atualiza o estado e executa o cruzamento final em lote, independentemente da ordem dos arquivos.
      await load();
      toast.success(`${payrollCreated} recibo/holerite(s) salvo(s), ${receiptCreated} comprovante(s) bancário(s) salvo(s). Cruzamento automático por nome + valor executado.${review ? ` ${review} item(ns) ficaram para revisão, sem descarte.` : ''}${duplicates ? ` ${duplicates} duplicado(s) ignorado(s).` : ''}`);
    } catch (error: any) {
      console.error('[payroll-unified-upload]', error);
      toast.error(`Falha no processamento: ${error?.message || error}`);
    } finally {
      setUploading(false);
      if (unifiedInput.current) unifiedInput.current.value = '';
    }
  };

  const openStoredFile = async (path: string) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
      if (error || !data?.signedUrl) throw error || new Error('Arquivo indisponível.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) { toast.error(error?.message || 'Não foi possível abrir o PDF.'); }
  };

  const assignUnmatchedDocument = async (document: any) => {
    const employeeId = assignDoc[document.id];
    if (!employeeId) return toast.error('Selecione o funcionário.');
    try {
      const { error } = await (supabase as any).from('payroll_documents').update({
        employee_id: employeeId,
        match_confidence: 100,
        extracted_data: { ...(document.extracted_data || {}), metodo_vinculo: 'RH_MANUAL', status_analise: 'IDENTIFICADO_MANUALMENTE' },
      }).eq('id', document.id);
      if (error) throw error;
      await apiCall('confirm-document', { document_id: document.id });
      toast.success('Recibo/holerite associado ao funcionário. O cruzamento com comprovantes será refeito automaticamente.');
      await load();
    } catch (error: any) { toast.error(error.message); }
  };

  const assignUnmatchedReceipt = async (receipt: any) => {
    const employeeId = assignReceipt[receipt.id] || receipt.employee_id;
    if (!employeeId) return toast.error('Selecione o funcionário.');
    const doc = documentByEmployee.get(employeeId);
    try {
      const { error } = await (supabase as any).from('payroll_payment_receipts').update({
        employee_id: employeeId,
        document_id: doc?.document_id || null,
        status: 'PAGAMENTO_IDENTIFICADO',
        match_confidence: 100,
        extracted_data: { ...(receipt.extracted_data || {}), metodo_vinculo: 'RH_MANUAL', reconhecimento_automatico: false, aguardando_associacao_manual: false },
      }).eq('id', receipt.id);
      if (error) throw error;
      if (doc?.document_id) {
        if (!doc.holerite_confirmed) await apiCall('confirm-document', { document_id: doc.document_id });
        await apiCall('confirm-payment', { receipt_id: receipt.id, override_reason: 'ASSOCIACAO_MANUAL_RH' });
        toast.success('Comprovante associado e pagamento confirmado manualmente.');
      } else {
        toast.success('Comprovante associado. Aguardando o recibo/holerite correspondente.');
      }
      await load();
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
      setTimeline({ ...data, employee: row.employee_name || 'Funcionário' });
      setTimelineOpen(true);
    } catch (error: any) { toast.error(error.message); }
  };

  const dossier = async (row: any) => {
    if (row.signature_status !== 'ASSINADO') return toast.error('O dossiê final exige assinatura concluída.');
    try {
      const urls = await apiCall('signed-urls', { document_id: row.document_id });
      if (!urls.holerite_url || !urls.certificate_url || !urls.receipt_url) throw new Error('Dossiê incompleto: holerite, certificado ou comprovante ausente.');
      await mergePdfUrls([
        { url: urls.holerite_url, label: 'Holerite' },
        { url: urls.certificate_url, label: 'Certificado' },
        { url: urls.receipt_url, label: 'Comprovante' },
      ], `DOSSIE_PAGAMENTO_${safeFile(row.employee_name || 'FUNCIONARIO')}_${competencia}.pdf`);
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
    <input ref={unifiedInput} type="file" accept="application/pdf,.pdf,.zip,application/zip" multiple className="hidden" onChange={e=>void uploadUnified(Array.from(e.target.files || []))}/>

    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-emerald-400">Fechamento → Pagamento</p>
        <h2 className="mt-1 flex items-center gap-2 text-lg font-bold"><FileSignature className="h-5 w-5"/>Recibos, comprovantes e assinatura eletrônica</h2>
        <p className="mt-1 text-xs text-muted-foreground">Empresa isolada: {company?.name}. Envie recibos/holerites e comprovantes bancários juntos ou em etapas. O sistema cruza nome + valor líquido e confirma o lote automaticamente.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={()=>unifiedInput.current?.click()} disabled={uploading}><FileUp className="mr-2 h-4 w-4"/>SUBIR RECIBOS + COMPROVANTES</Button>
        <Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading?'animate-spin':''}`}/>CRUZAR / ATUALIZAR</Button>
      </div>
    </div>

    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="flex items-center gap-2 text-xs font-bold uppercase text-cyan-300"><ShieldCheck className="h-4 w-4"/>Portal único de holerite</p><p className="mt-2 break-all font-mono text-sm">{portalUrl}</p><p className="mt-2 text-xs text-muted-foreground">Login, portal do funcionário, links e assinatura permanecem intactos.</p></div>
        <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" onClick={()=>void copyPortal()}><Copy className="mr-2 h-4 w-4"/>Copiar link</Button><Button variant="outline" onClick={()=>window.open(portalUrl,'_blank','noopener,noreferrer')}><ExternalLink className="mr-2 h-4 w-4"/>Abrir portal</Button></div>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Kpi label="Recibos/Holerites" value={rows.length}/>
      <Kpi label="Pagamentos confirmados" value={rows.filter(r=>r.payment_confirmed).length}/>
      <Kpi label="Liberados no portal" value={releasedCount}/>
      <Kpi label="Assinados" value={rows.filter(r=>r.signature_status==='ASSINADO').length} success/>
      <Kpi label="Revisão manual" value={reviewReceipts.length + reviewDocuments.length} danger/>
    </div>

    {(reviewDocuments.length > 0 || reviewReceipts.length > 0) && <div className="space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
      <div><p className="text-xs font-bold text-amber-300">EXCEÇÕES PARA REVISÃO MANUAL</p><p className="mt-1 text-xs text-muted-foreground">Somente itens sem par automático nome + valor aparecem aqui. Todos os PDFs permanecem armazenados.</p></div>

      {reviewDocuments.map(doc => <div key={`doc-${doc.id}`} className="flex flex-col gap-2 rounded-lg border border-amber-500/20 p-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1 text-xs"><b className="break-all">RECIBO/HOLERITE · {doc.original_filename}</b><div className="text-muted-foreground">Líquido {currency(doc.net_amount)} · página {doc.source_page_start || '—'}</div></div>
        <Button size="sm" variant="outline" onClick={()=>void openStoredFile(doc.storage_path)}><ExternalLink className="mr-1 h-3 w-3"/>VER PDF</Button>
        <select value={assignDoc[doc.id] || ''} onChange={e=>setAssignDoc(current=>({ ...current, [doc.id]: e.target.value }))} className="min-w-[240px] rounded border bg-background px-2 py-2 text-xs"><option value="">Selecionar funcionário...</option>{scopedEmployees.map(employee=><option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
        <Button size="sm" onClick={()=>void assignUnmatchedDocument(doc)}>ASSOCIAR</Button>
      </div>)}

      {reviewReceipts.map(receipt => <div key={`receipt-${receipt.id}`} className="flex flex-col gap-2 rounded-lg border border-amber-500/20 p-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1 text-xs"><b className="break-all">COMPROVANTE · {receipt.original_filename}</b><div className="text-muted-foreground">Valor {currency(receipt.amount)} · {receipt.extracted_data?.motivo_revisao ? humanStatus(receipt.extracted_data.motivo_revisao) : 'aguardando par'}</div></div>
        <Button size="sm" variant="outline" onClick={()=>void openStoredFile(receipt.storage_path)}><ExternalLink className="mr-1 h-3 w-3"/>VER PDF</Button>
        <select value={assignReceipt[receipt.id] || receipt.employee_id || ''} onChange={e=>setAssignReceipt(current=>({ ...current, [receipt.id]: e.target.value }))} className="min-w-[240px] rounded border bg-background px-2 py-2 text-xs"><option value="">Selecionar funcionário...</option>{scopedEmployees.map(employee=><option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
        <Button size="sm" onClick={()=>void assignUnmatchedReceipt(receipt)}>ASSOCIAR</Button>
      </div>)}
    </div>}

    <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1250px] text-xs"><thead className="bg-muted/50"><tr>{['Funcionário','Recibo/Holerite','Pagamento','Portal','Visualização','Assinatura','Status','Ações'].map(h=><th key={h} className="px-3 py-2 text-left uppercase text-muted-foreground">{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.document_id} className="border-t align-top">
      <td className="px-3 py-3"><b>{row.employee_name||'NÃO IDENTIFICADO'}</b><div className="text-muted-foreground">{row.employee_role||'—'}</div></td>
      <td className="px-3 py-3">{row.holerite_confirmed?<span className="text-emerald-400">CONFERIDO</span>:'Aguardando'}<div className="text-muted-foreground">{currency(row.net_amount)}</div></td>
      <td className="px-3 py-3">{row.payment_confirmed?<span className="text-emerald-400">CONFIRMADO · {currency(row.payment_amount)}</span>:row.payment_status?humanStatus(row.payment_status):'Aguardando comprovante'}</td>
      <td className="px-3 py-3">{row.holerite_confirmed&&row.payment_confirmed?(row.opened_at?<span className="text-cyan-300">Acessado<br/>{brDateTime(row.opened_at)}</span>:<span className="text-emerald-400">LIBERADO</span>):<span className="text-muted-foreground">Bloqueado</span>}</td>
      <td className="px-3 py-3">{brDateTime(row.viewed_at)}</td><td className="px-3 py-3">{brDateTime(row.signed_at)}</td>
      <td className="px-3 py-3"><Badge variant="outline" className={statusClass(displayStatus(row))}>{displayStatus(row)}</Badge></td>
      <td className="px-3 py-3"><div className="flex max-w-[480px] flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'holerite')}>Holerite</Button>{row.receipt_id&&<Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'receipt')}>Comprovante</Button>}{row.signature_status==='ASSINADO'&&<Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'certificate')}>Certificado</Button>}{row.signature_status==='ASSINADO'&&<Button size="sm" variant="outline" onClick={()=>void dossier(row)}><FileArchive className="mr-1 h-3 w-3"/>Dossiê</Button>}{row.request_id&&<Button size="sm" variant="ghost" onClick={()=>void openTimeline(row)}><Clock3 className="mr-1 h-3 w-3"/>Histórico</Button>}</div></td>
    </tr>)}{!rows.length&&<tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum recibo/holerite recebido nesta competência.</td></tr>}</tbody></table></div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3"><FileArchive className="h-4 w-4"/><b className="text-xs">GERAR PDF CONSOLIDADO</b><select value={consolidatedFilter} onChange={e=>setConsolidatedFilter(e.target.value as any)} className="rounded border bg-background px-2 py-1.5 text-xs"><option value="assinados">Somente assinados</option><option value="todos">Todos</option><option value="pendentes">Somente pendentes</option></select><Button size="sm" variant="outline" onClick={()=>void consolidated()}>Gerar consolidado</Button></div>

    {uploading&&<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60"><div className="rounded-xl border bg-background p-5 text-center"><Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin"/><b>Processando lote...</b><p className="mt-1 text-xs text-muted-foreground">Fatiando PDFs, preservando arquivos e cruzando nome + valor dentro de {company?.name}.</p></div></div>}

    <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}><DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>Histórico — {timeline.employee}</DialogTitle></DialogHeader><div className="space-y-2">{[...(timeline.events||[]).map((e:any)=>({...e,_kind:'evento'})),...(timeline.messages||[]).map((m:any)=>({...m,_kind:'mensagem'}))].sort((a:any,b:any)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).map((item:any,index:number)=><div key={`${item._kind}-${item.id}-${index}`} className="rounded-lg border p-3 text-xs"><div className="flex justify-between gap-3"><b>{item.event_type||item.message_kind}</b><span className="text-muted-foreground">{brDateTime(item.created_at)}</span></div><div className="mt-1 text-muted-foreground">{item._kind==='mensagem'?`${item.status} · ${item.channel}${item.error?` · ${item.error}`:''}`:JSON.stringify(item.payload||{})}</div></div>)}</div></DialogContent></Dialog>
  </div>;
};

const Kpi = ({ label, value, success=false, danger=false }: { label:string; value:number; success?:boolean; danger?:boolean }) => <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={`text-xl font-bold ${success?'text-emerald-400':''} ${danger?'text-red-400':''}`}>{value}</p></div>;

export default PayrollPortalAdminModule;
