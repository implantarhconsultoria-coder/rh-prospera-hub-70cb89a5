import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Copy, ExternalLink, FileArchive, FileSignature, FileUp, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
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
  sha256Browser,
  type PayrollEmployeeMatch,
} from '@/lib/payrollDocuments';
import {
  analyzePayrollFiles,
  safeUuid,
  type PayrollFileAnalysis,
} from '@/lib/payrollPageDocuments';

const BUCKET = 'payroll-private';
const ALLOWED_CODES = new Set(['topac-matriz', 'topac-pg', 'topac-gyn', 'alqui', 'lmt']);
const ALLOWED_CNPJS = new Set(['07291648000103','07291648000294','07291648000375','14464586000150','21967711000100']);
const SEQUENTIAL_OVERRIDE_REASON = 'IMPORTACAO_SEQUENCIAL_RECIBO_COMPROVANTE_SEM_VALIDACAO';
const AUTO_REFRESH_MS = 6000;

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const safeFile = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 100);
const brDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const currency = (value?: number | null) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const humanStatus = (value: unknown) => String(value || '').replace(/_/g, ' ');

const SIGNATURE_EXCLUDED_EMPLOYEE_IDS = new Set([
  '2e736835-f228-49ec-80ee-e893172aeb44',
  'f2a7cbe6-ca51-4f39-a7b8-b7843599793e',
  '57abf7fb-8895-4881-8946-952a4d5e1a44',
]);
const normalizeSignatureText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const isSignatureExcluded = (employee: any) => {
  const id = String(employee?.id || employee?.employee_id || '');
  const cargo = normalizeSignatureText(employee?.cargo || employee?.employee_role || employee?.employee_cargo);
  const name = normalizeSignatureText(employee?.name || employee?.nome || employee?.employee_name);
  return SIGNATURE_EXCLUDED_EMPLOYEE_IDS.has(id)
    || cargo.includes('socio')
    || cargo.includes('pro labore')
    || name.includes('aitor urcelay')
    || name.includes('robson chafi');
};

const mergePairPdfBytes = async (pages: Uint8Array[]) => {
  const output = await PDFDocument.create();
  for (const bytes of pages) {
    const source = await PDFDocument.load(new Uint8Array(bytes), { ignoreEncryption: true, updateMetadata: false });
    const copied = await output.copyPages(source, source.getPageIndices());
    copied.forEach(page => output.addPage(page));
  }
  return new Uint8Array(await output.save({ addDefaultPage: false, useObjectStreams: false }));
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
  if (row.holerite_confirmed) return 'DOCUMENTO PRONTO';
  return humanStatus(row.holerite_status || 'DOCUMENTO PENDENTE');
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
  const portalSlug = String((company as any)?.codigo || '').trim().toLowerCase();
  const enabled = Boolean(company && ALLOWED_CODES.has(portalSlug) && ALLOWED_CNPJS.has(digits(company.cnpj)));
  const portalPath = portalSlug ? `/holerite/${encodeURIComponent(portalSlug)}` : '/holerite';
  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}${portalPath}` : portalPath;

  const scopedEmployees = useMemo<PayrollEmployeeMatch[]>(() => employees
    .filter(e => e.companyId === companyId && e.status === 'ativo' && !isSignatureExcluded(e))
    .map(e => ({ id: e.id, name: e.name, cpf: e.cpf, cargo: e.cargo, companyId: e.companyId }))
    .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, companyId]);

  const phoneIssues = useMemo(() => employees
    .filter(e => e.companyId === companyId && e.status === 'ativo' && !isSignatureExcluded(e))
    .filter(e => {
      const phone = digits((e as any).celular || (e as any).telefone);
      return phone.length < 10 || phone.length > 11;
    })
    .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, companyId]);

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timeline, setTimeline] = useState<any>({ events: [], messages: [], employee: '' });
  const [consolidatedFilter, setConsolidatedFilter] = useState<'assinados'|'todos'|'pendentes'>('assinados');
  const unifiedInput = useRef<HTMLInputElement>(null);
  const autoRefreshRunning = useRef(false);

  const load = async (silent = false) => {
    if (!enabled || !companyId || !competencia) return;
    if (silent && autoRefreshRunning.current) return;
    if (silent) autoRefreshRunning.current = true;
    else setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('payroll_admin_status_v')
        .select('*')
        .eq('company_id', companyId)
        .eq('competencia', competencia)
        .order('employee_name', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setRows((data || []).filter((row: any) => !isSignatureExcluded(
        employees.find((employee: any) => employee.id === row.employee_id) || { id: row.employee_id, name: row.employee_name, cargo: row.employee_role || row.employee_cargo || '' },
      )));
    } catch (error: any) {
      if (!silent) toast.error(error?.message || 'Não foi possível carregar o fechamento.');
      else console.warn('[payroll-auto-refresh]', error?.message || error);
    } finally {
      if (silent) autoRefreshRunning.current = false;
      else setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    if (!enabled || !companyId || !competencia) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !uploading) void load(true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [companyId, competencia, enabled, uploading]);
  if (!enabled) return null;

  const copyPortal = async () => {
    try { await navigator.clipboard.writeText(portalUrl); toast.success(`Link do portal da ${company?.name || 'empresa'} copiado.`); }
    catch { window.prompt('Copie o link do Portal de Holerite desta empresa:', portalUrl); }
  };

  const sharePortalWhatsApp = () => {
    const text = `Pessoal, os documentos para conferência e assinatura estão disponíveis no Portal TOPAC RH PRO da ${company?.name || 'empresa'}. Acesse pelo link abaixo e entre com CPF, data de nascimento e os 4 últimos números do celular cadastrado:

${portalUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const persistSequentialPayrollAnalysis = async (analysis: PayrollFileAnalysis) => {
    if (analysis.fatalError) throw new Error(analysis.fatalError);
    const ordered = [...analysis.documents].sort((a, b) => a.pageNumber - b.pageNumber);
    if (!ordered.length) throw new Error('O PDF não possui páginas processáveis.');

    let created = 0;
    let pending = 0;
    let duplicates = 0;

    // REGRA FIXA DO FECHAMENTO:
    // página 1 = recibo, 2 = comprovante; 3 = recibo, 4 = comprovante; e assim por diante.
    // A segunda página NUNCA é tratada como um novo funcionário/documento.
    for (let index = 0; index < ordered.length; index += 2) {
      const receiptPage = ordered[index];
      const bankPage = ordered[index + 1] || null;
      if (!receiptPage?.bytes?.byteLength) {
        pending += 1;
        continue;
      }

      const expectedCnpj = digits(company?.cnpj);
      const detectedCnpj = digits(receiptPage.cnpjDetected);
      const sameCompany = !detectedCnpj || !expectedCnpj || detectedCnpj === expectedCnpj;
      const employeeId = sameCompany && receiptPage.status === 'IDENTIFICADO' ? receiptPage.employeeId : null;
      const employeeName = receiptPage.employeeName || receiptPage.employeeNameDetected || `PENDENTE_P${receiptPage.pageNumber}`;
      const identifiedEmployee = employeeId ? employees.find((employee: any) => employee.id === employeeId) : null;
      if (isSignatureExcluded(identifiedEmployee || { id: employeeId, name: employeeName })) {
        console.info('[payroll-signature-excluded]', { employeeId, employeeName, reason: 'SOCIO_PRO_LABORE' });
        continue;
      }
      const pairBytes = await mergePairPdfBytes(bankPage?.bytes?.byteLength ? [receiptPage.bytes, bankPage.bytes] : [receiptPage.bytes]);
      const pairHash = await sha256Browser(pairBytes);
      const pairEndPage = bankPage?.pageNumber || receiptPage.pageNumber;

      const { data: existing, error: existingError } = await (supabase as any).from('payroll_documents')
        .select('id')
        .eq('company_id', companyId)
        .eq('competencia', competencia)
        .eq('source_sha256', analysis.sourceSha256)
        .eq('source_page_start', receiptPage.pageNumber)
        .eq('source_page_end', pairEndPage)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) { duplicates += 1; continue; }

      const filename = `${safeFile(employeeName)}_${competencia}_RECIBO_COMPROVANTE.pdf`;
      const documentPath = `${companyId}/${competencia}/holerites/${safeUuid()}-${filename}`;
      const { error: documentStorageError } = await supabase.storage.from(BUCKET).upload(
        documentPath,
        new Blob([pairBytes as any], { type: 'application/pdf' }),
        { contentType: 'application/pdf', upsert: false },
      );
      if (documentStorageError) throw documentStorageError;

      const { data: document, error: documentError } = await (supabase as any).from('payroll_documents').insert({
        company_id: companyId,
        employee_id: employeeId,
        competencia,
        storage_path: documentPath,
        original_filename: filename,
        mime_type: 'application/pdf',
        file_size: pairBytes.byteLength,
        document_sha256: pairHash,
        source_sha256: analysis.sourceSha256,
        source_page_start: receiptPage.pageNumber,
        source_page_end: pairEndPage,
        net_amount: receiptPage.amountDetected,
        match_confidence: employeeId ? 100 : 0,
        extracted_data: {
          ingestion_mode: 'SEQUENTIAL_RECEIPT_PROOF',
          includes_bank_proof: Boolean(bankPage),
          receipt_page: receiptPage.pageNumber,
          bank_proof_page: bankPage?.pageNumber || null,
          paginas: bankPage ? [receiptPage.pageNumber, bankPage.pageNumber] : [receiptPage.pageNumber],
          nome_detectado: receiptPage.employeeNameDetected,
          metodo_vinculo: receiptPage.matchMethod,
          status_analise: employeeId ? 'IDENTIFICADO_PELO_RECIBO' : 'REVISAO_MANUAL_SEM_DESCARTE',
          empresa_detectada: receiptPage.companyNameDetected,
          cnpj_detectado: receiptPage.cnpjDetected,
          competencia_detectada: receiptPage.competenciaDetected,
          tipo_documento_detectado: receiptPage.documentType,
          subtipo_documento_detectado: receiptPage.documentSubtype,
          valor_liquido_detectado: receiptPage.amountDetected,
          usou_ocr: receiptPage.usedOcr,
          regra_importacao: 'PARES_FIXOS_RECIBO_COMPROVANTE_SEM_VALIDACAO',
        },
        status: 'HOLERITE_PENDENTE',
      }).select('id').single();

      if (documentError) {
        await supabase.storage.from(BUCKET).remove([documentPath]);
        throw documentError;
      }
      created += 1;

      // Se o recibo não identifica com segurança uma pessoa da empresa, o PAR COMPLETO fica preservado.
      if (!employeeId) {
        pending += 1;
        continue;
      }

      await apiCall('confirm-document', { document_id: document.id });

      // A página seguinte é o comprovante do mesmo funcionário pela posição.
      // Não existe OCR de vínculo, score, comparação obrigatória de valor ou aprovação humana.
      if (bankPage?.bytes?.byteLength) {
        const bankMeta = extractReceiptMetadata(bankPage.text || '');
        const bankHash = bankPage.sha256 || await sha256Browser(bankPage.bytes);
        const bankFilename = `${safeFile(employeeName)}_${competencia}_COMPROVANTE.pdf`;
        const bankPath = `${companyId}/${competencia}/comprovantes/${safeUuid()}-${bankFilename}`;

        const { error: bankStorageError } = await supabase.storage.from(BUCKET).upload(
          bankPath,
          new Blob([bankPage.bytes as any], { type: 'application/pdf' }),
          { contentType: 'application/pdf', upsert: false },
        );
        if (bankStorageError) throw bankStorageError;

        const { data: payment, error: paymentError } = await (supabase as any).from('payroll_payment_receipts').insert({
          company_id: companyId,
          employee_id: employeeId,
          document_id: document.id,
          competencia,
          storage_path: bankPath,
          original_filename: bankFilename,
          mime_type: 'application/pdf',
          file_size: bankPage.bytes.byteLength,
          receipt_sha256: bankHash,
          source_sha256: analysis.sourceSha256,
          source_page_start: bankPage.pageNumber,
          source_page_end: bankPage.pageNumber,
          amount: bankMeta.amount,
          paid_at: bankMeta.paidAt,
          bank_name: bankMeta.bankName,
          transaction_id: bankMeta.transactionId,
          bank_authentication: bankMeta.bankAuthentication,
          payer_name: bankMeta.payerName,
          match_confidence: 100,
          extracted_data: {
            ingestion_mode: 'SEQUENTIAL_RECEIPT_PROOF',
            paired_by_position: true,
            receipt_page: receiptPage.pageNumber,
            bank_proof_page: bankPage.pageNumber,
            nome_funcionario: employeeName,
            regra_importacao: 'SEM_VALIDACAO_DE_COMPROVANTE',
          },
          status: 'PAGAMENTO_IDENTIFICADO',
          idempotency_key: `sequential:${companyId}:${competencia}:${analysis.sourceSha256}:${bankPage.pageNumber}`,
        }).select('id').single();

        if (paymentError) {
          await supabase.storage.from(BUCKET).remove([bankPath]);
          throw paymentError;
        }

        await apiCall('confirm-payment', {
          receipt_id: payment.id,
          override_reason: SEQUENTIAL_OVERRIDE_REASON,
        });
      }
    }

    return { created, pending, duplicates };
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
      if (!pdfFiles.length) throw new Error('Selecione um PDF válido.');

      let created = 0;
      let pending = 0;
      let duplicates = 0;

      for (const file of pdfFiles) {
        const analyses = await analyzePayrollFiles({ files: [file], employees: scopedEmployees });
        const analysis = analyses[0];
        if (!analysis) throw new Error(`Não foi possível ler ${file.name}.`);

        const result = await persistSequentialPayrollAnalysis(analysis);
        created += result.created;
        pending += result.pending;
        duplicates += result.duplicates;
      }

      await load();
      console.info('[payroll-sequential-upload]', { companyId, competencia, created, pending, duplicates, approvalSteps: 0 });
      toast.success(`${created} documento(s) RECIBO + COMPROVANTE processados e enviados ao fluxo de assinatura.${pending ? ` ${pending} par(es) foi(ram) preservado(s) para revisão por falta de identificação no RECIBO.` : ''}${duplicates ? ` ${duplicates} duplicado(s) ignorado(s).` : ''}`);
    } catch (error: any) {
      console.error('[payroll-sequential-upload]', error);
      toast.error(`Falha no processamento: ${error?.message || error}`);
    } finally {
      setUploading(false);
      if (unifiedInput.current) unifiedInput.current.value = '';
    }
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
    if (!row.request_id) return toast.info('O funcionário ainda não acessou esse documento pelo portal.');
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
      if (!urls.holerite_url || !urls.certificate_url) throw new Error('Dossiê incompleto: documento ou certificado ausente.');
      const sources: Array<{url:string;label:string}> = [
        { url: urls.holerite_url, label: 'Recibo + comprovante' },
        { url: urls.certificate_url, label: 'Certificado' },
      ];
      if (!urls.document_includes_bank_proof && urls.receipt_url) sources.push({ url: urls.receipt_url, label: 'Comprovante' });
      await mergePdfUrls(sources, `DOSSIE_PAGAMENTO_${safeFile(row.employee_name || 'FUNCIONARIO')}_${competencia}.pdf`);
    } catch (error: any) { toast.error(error.message); }
  };

  const consolidated = async () => {
    const filtered = rows.filter(row => consolidatedFilter === 'todos' ? Boolean(row.document_id) : consolidatedFilter === 'assinados' ? row.signature_status === 'ASSINADO' : row.signature_status !== 'ASSINADO');
    if (!filtered.length) return toast.info('Nenhum documento nesse filtro.');
    try {
      const sources: Array<{url:string;label:string}> = [];
      for (const row of filtered) {
        const urls = await apiCall('signed-urls', { document_id: row.document_id });
        if (urls.holerite_url) sources.push({ url: urls.holerite_url, label: row.employee_name || row.holerite_filename });
      }
      await mergePdfUrls(sources, `HOLERITES_${safeFile(company?.name || 'EMPRESA')}_${competencia}_${consolidatedFilter.toUpperCase()}.pdf`);
    } catch (error: any) { toast.error(error.message); }
  };

  const deleteEntry = async (row: any) => {
    if (!row.document_id) return;
    if (row.signature_status === 'ASSINADO') return toast.error('Documento já assinado não pode ser apagado pelo fechamento.');
    if (!window.confirm(`Excluir o documento de ${row.employee_name || 'funcionário'} desta competência?`)) return;
    try {
      await apiCall('delete-payroll-entry', { document_id: row.document_id });
      toast.success('Documento excluído.');
      await load();
    } catch (error: any) { toast.error(error?.message || 'Não foi possível excluir.'); }
  };

  const releasedCount = rows.filter(r => r.holerite_confirmed && r.payment_confirmed && r.signature_status !== 'ASSINADO').length;

  return <div className="mt-5 space-y-4 rounded-2xl border border-emerald-500/25 bg-card p-5">
    <input ref={unifiedInput} type="file" accept="application/pdf,.pdf,.zip,application/zip" multiple className="hidden" onChange={e=>void uploadUnified(Array.from(e.target.files || []))}/>

    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-emerald-400">Fechamento → Pagamento</p>
        <h2 className="mt-1 flex items-center gap-2 text-lg font-bold"><FileSignature className="h-5 w-5"/>Recibos, comprovantes e assinatura eletrônica</h2>
        <p className="mt-1 text-xs text-muted-foreground">Empresa isolada: {company?.name}. Envie o PDF já montado em sequência: RECIBO + COMPROVANTE de cada funcionário. O par segue direto para assinatura, sem etapa de validação do comprovante. VR e VT permanecem separados deste lote.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={()=>unifiedInput.current?.click()} disabled={uploading}><FileUp className="mr-2 h-4 w-4"/>SUBIR PDF SEQUENCIAL</Button>
        <Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading?'animate-spin':''}`}/>ATUALIZAR</Button>
      </div>
    </div>

    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="flex items-center gap-2 text-xs font-bold uppercase text-cyan-300"><ShieldCheck className="h-4 w-4"/>Portal de holerite desta empresa</p><p className="mt-2 break-all font-mono text-sm">{portalUrl}</p><p className="mt-2 text-xs text-muted-foreground">Este link aceita somente funcionários vinculados a {company?.name}. O documento completo do par segue para visualizar e assinar.</p></div>
        <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" onClick={()=>void copyPortal()}><Copy className="mr-2 h-4 w-4"/>Copiar link</Button><Button variant="outline" onClick={sharePortalWhatsApp}>Compartilhar no WhatsApp</Button><Button variant="outline" onClick={()=>window.open(portalUrl,'_blank','noopener,noreferrer')}><ExternalLink className="mr-2 h-4 w-4"/>Abrir portal</Button></div>
      </div>
    </div>

    {phoneIssues.length > 0 ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><div><b className="text-amber-300">ATENÇÃO: {phoneIssues.length} funcionário(s) sem telefone/celular válido para o acesso</b><p className="mt-1 text-xs text-muted-foreground">Corrija antes de compartilhar o link. O login usa os 4 últimos números do telefone cadastrado.</p><div className="mt-2 flex flex-wrap gap-1">{phoneIssues.map(e=><Badge key={e.id} variant="outline" className="border-amber-500/40 text-amber-200">{e.name}</Badge>)}</div></div><Button variant="outline" onClick={()=>navigator.clipboard.writeText(phoneIssues.map(e=>e.name).join('\n'))}>Copiar lista</Button></div></div> : <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">✓ Todos os funcionários ativos desta empresa possuem telefone/celular válido para o acesso.</div>}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Documentos" value={rows.length}/>
      <Kpi label="Pagamentos vinculados" value={rows.filter(r=>r.payment_confirmed).length}/>
      <Kpi label="Liberados no portal" value={releasedCount}/>
      <Kpi label="Assinados" value={rows.filter(r=>r.signature_status==='ASSINADO').length} success/>
    </div>

    <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1250px] text-xs"><thead className="bg-muted/50"><tr>{['Funcionário','Documento','Comprovante','Portal','Visualização','Assinatura','Status','Ações'].map(h=><th key={h} className="px-3 py-2 text-left uppercase text-muted-foreground">{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.document_id} className="border-t align-top">
      <td className="px-3 py-3"><b>{row.employee_name||'—'}</b><div className="text-muted-foreground">{row.employee_role||'—'}</div></td>
      <td className="px-3 py-3">{row.holerite_confirmed?<span className="text-emerald-400">PRONTO</span>:'Pendente'}<div className="text-muted-foreground">{currency(row.net_amount)}</div></td>
      <td className="px-3 py-3">{row.payment_confirmed?<span className="text-emerald-400">INCLUÍDO NO PAR</span>:<span className="text-muted-foreground">SEM COMPROVANTE NO PAR</span>}</td>
      <td className="px-3 py-3">{row.holerite_confirmed&&row.payment_confirmed?(row.opened_at?<span className="text-cyan-300">Acessado<br/>{brDateTime(row.opened_at)}</span>:<span className="text-emerald-400">LIBERADO</span>):<span className="text-muted-foreground">Aguardando par completo</span>}</td>
      <td className="px-3 py-3">{brDateTime(row.viewed_at)}</td><td className="px-3 py-3">{brDateTime(row.signed_at)}</td>
      <td className="px-3 py-3"><Badge variant="outline" className={statusClass(displayStatus(row))}>{displayStatus(row)}</Badge></td>
      <td className="px-3 py-3"><div className="flex max-w-[520px] flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'holerite')}>Documento</Button>{row.receipt_id&&<Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'receipt')}>Comprovante</Button>}{row.signature_status==='ASSINADO'&&<Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'certificate')}>Certificado</Button>}{row.signature_status==='ASSINADO'&&<Button size="sm" variant="outline" onClick={()=>void dossier(row)}><FileArchive className="mr-1 h-3 w-3"/>Dossiê</Button>}{row.request_id&&<Button size="sm" variant="ghost" onClick={()=>void openTimeline(row)}><Clock3 className="mr-1 h-3 w-3"/>Histórico</Button>}{row.signature_status!=='ASSINADO'&&<Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={()=>void deleteEntry(row)}><Trash2 className="mr-1 h-3 w-3"/>Excluir</Button>}</div></td>
    </tr>)}{!rows.length&&<tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum documento recebido nesta competência.</td></tr>}</tbody></table></div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3"><FileArchive className="h-4 w-4"/><b className="text-xs">SALVAR PDF CONSOLIDADO</b><select value={consolidatedFilter} onChange={e=>setConsolidatedFilter(e.target.value as any)} className="rounded border bg-background px-2 py-1.5 text-xs"><option value="assinados">Somente assinados</option><option value="todos">Todos</option><option value="pendentes">Somente pendentes</option></select><Button size="sm" variant="outline" onClick={()=>void consolidated()}>Salvar consolidado</Button></div>

    {uploading&&<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60"><div className="rounded-xl border bg-background p-5 text-center"><Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin"/><b>Processando lote...</b><p className="mt-1 text-xs text-muted-foreground">Registrando cada par RECIBO + COMPROVANTE de {company?.name}, sem aprovação de comprovante.</p></div></div>}

    <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}><DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>Histórico — {timeline.employee}</DialogTitle></DialogHeader><div className="space-y-2">{[...(timeline.events||[]).map((e:any)=>({...e,_kind:'evento'})),...(timeline.messages||[]).map((m:any)=>({...m,_kind:'mensagem'}))].sort((a:any,b:any)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).map((item:any,index:number)=><div key={`${item._kind}-${item.id}-${index}`} className="rounded-lg border p-3 text-xs"><div className="flex justify-between gap-3"><b>{item.event_type||item.message_kind}</b><span className="text-muted-foreground">{brDateTime(item.created_at)}</span></div><div className="mt-1 text-muted-foreground">{item._kind==='mensagem'?`${item.status} · ${item.channel}${item.error?` · ${item.error}`:''}`:JSON.stringify(item.payload||{})}</div></div>)}</div></DialogContent></Dialog>
  </div>;
};

const Kpi = ({ label, value, success=false }: { label:string; value:number; success?:boolean }) => <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={`text-xl font-bold ${success?'text-emerald-400':''}`}>{value}</p></div>;

export default PayrollPortalAdminModule;
