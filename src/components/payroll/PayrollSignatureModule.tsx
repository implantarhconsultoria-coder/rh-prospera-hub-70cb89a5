import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileArchive, FileCheck2, FileSignature, FileUp, Loader2, MessageSquareMore, ReceiptText, RefreshCw, Send, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  extractPdfFilesFromZip,
  extractReceiptMetadata,
  mergePdfUrls,
  parsePayrollPdf,
  sha256Browser,
  type PayrollEmployeeMatch,
} from '@/lib/payrollDocuments';

const BUCKET = 'payroll-private';
const ALLOWED_CODES = new Set(['topac-matriz', 'alqui', 'lmt']);
const ALLOWED_CNPJS = new Set(['07291648000103','14464586000150','21967711000100']);
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const safeFile = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 100);
const brDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const currency = (value?: number | null) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const statusClass = (status: string) => {
  if (status === 'ASSINADO' || status === 'PAGAMENTO_CONFIRMADO' || status === 'HOLERITE_CONFERIDO') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (status.includes('ERRO') || status.includes('INVALIDO') || status.includes('NÃO') || status.includes('NAO')) return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (status.includes('PENDENTE') || status.includes('AGUARDANDO')) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
};

const displayStatus = (row: any) => {
  if (row.signature_status) return String(row.signature_status).replaceAll('_', ' ');
  if (row.payment_status) return String(row.payment_status).replaceAll('_', ' ');
  return String(row.holerite_status || 'HOLERITE PENDENTE').replaceAll('_', ' ');
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

const PayrollSignatureModule: React.FC<{ companyId: string; competencia: string }> = ({ companyId, competencia }) => {
  const { companies, employees } = useApp();
  const company = companies.find(c => c.id === companyId);
  const enabled = Boolean(company && ALLOWED_CODES.has(String((company as any).codigo || '').toLowerCase()) && ALLOWED_CNPJS.has(digits(company.cnpj)));
  const scopedEmployees = useMemo<PayrollEmployeeMatch[]>(() => employees
    .filter(e => e.companyId === companyId && e.status === 'ativo')
    .map(e => ({ id: e.id, name: e.name, cpf: e.cpf, cargo: e.cargo, companyId: e.companyId }))
    .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, companyId]);

  const [rows, setRows] = useState<any[]>([]);
  const [unmatchedReceipts, setUnmatchedReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messageConfigured, setMessageConfigured] = useState<boolean | null>(null);
  const [pilot, setPilot] = useState<Set<string>>(new Set());
  const [assignDoc, setAssignDoc] = useState<Record<string,string>>({});
  const [assignReceipt, setAssignReceipt] = useState<Record<string,string>>({});
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timeline, setTimeline] = useState<any>({ events: [], messages: [], employee: '' });
  const [consolidatedFilter, setConsolidatedFilter] = useState<'assinados'|'todos'|'pendentes'>('assinados');
  const holeriteInput = useRef<HTMLInputElement>(null);
  const receiptInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!enabled || !companyId || !competencia) return;
    setLoading(true);
    try {
      const [{ data: statusRows, error: statusError }, { data: receiptRows, error: receiptError }] = await Promise.all([
        (supabase as any).from('payroll_admin_status_v').select('*').eq('company_id', companyId).eq('competencia', competencia).order('employee_name', { ascending: true, nullsFirst: false }),
        (supabase as any).from('payroll_payment_receipts').select('*').eq('company_id', companyId).eq('competencia', competencia).or('document_id.is.null,employee_id.is.null,status.eq.PAGAMENTO_NAO_IDENTIFICADO').order('created_at', { ascending: false }),
      ]);
      if (statusError) throw statusError;
      if (receiptError) throw receiptError;
      setRows(statusRows || []);
      setUnmatchedReceipts(receiptRows || []);
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/payroll-admin', { headers: { authorization: `Bearer ${sessionData.session?.access_token || ''}` }, cache: 'no-store' });
      if (response.ok) {
        const health = await response.json();
        setMessageConfigured(Boolean(health.message_channel_configured));
      }
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar assinatura eletrônica.');
    } finally { setLoading(false); }
  };

  useEffect(() => { setPilot(new Set()); void load(); }, [companyId, competencia, enabled]);
  if (!enabled) return null;

  const netByEmployee = new Map<string, number>(rows.filter(r => r.employee_id && r.net_amount != null).map(r => [r.employee_id, Number(r.net_amount)]));
  const documentByEmployee = new Map<string, any>(rows.filter(r => r.employee_id).map(r => [r.employee_id, r]));

  const uploadHolerites = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      let created = 0;
      let pending = 0;
      for (const file of files) {
        if (!/\.pdf$/i.test(file.name)) continue;
        const parsed = await parsePayrollPdf({ file, employees: scopedEmployees, kind: 'HOLERITE' });
        const sourceHash = await sha256Browser(file);
        for (const item of parsed) {
          const hash = await sha256Browser(item.bytes);
          const { data: duplicate } = await (supabase as any).from('payroll_documents').select('id').eq('company_id', companyId).eq('competencia', competencia).eq('document_sha256', hash).maybeSingle();
          if (duplicate) continue;
          const path = `${companyId}/${competencia}/holerites/${crypto.randomUUID()}-${safeFile(item.filename)}`;
          const blob = new Blob([item.bytes as any], { type: 'application/pdf' });
          const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
          if (storageError) throw storageError;
          const { error: insertError } = await (supabase as any).from('payroll_documents').insert({
            company_id: companyId,
            employee_id: item.employeeId,
            competencia,
            storage_path: path,
            original_filename: item.filename,
            mime_type: 'application/pdf',
            file_size: item.bytes.byteLength,
            document_sha256: hash,
            source_sha256: sourceHash,
            source_page_start: item.pageNumbers[0] || null,
            source_page_end: item.pageNumbers[item.pageNumbers.length - 1] || null,
            net_amount: item.amountDetected,
            match_confidence: item.confidence,
            extracted_data: { cpf_detectado: item.cpfDetected, metodo_vinculo: item.matchMethod, paginas: item.pageNumbers },
            status: 'HOLERITE_PENDENTE',
          });
          if (insertError) {
            await supabase.storage.from(BUCKET).remove([path]);
            throw insertError;
          }
          created += 1;
          if (!item.employeeId) pending += 1;
        }
      }
      toast.success(`${created} holerite(s) recebido(s).${pending ? ` ${pending} aguardando identificação manual.` : ''}`);
      await load();
    } catch (error: any) { toast.error(`Falha ao subir holerites: ${error?.message || error}`); }
    finally { setUploading(false); if (holeriteInput.current) holeriteInput.current.value = ''; }
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
      let created = 0;
      let pending = 0;
      for (const file of files) {
        const parsed = await parsePayrollPdf({ file, employees: scopedEmployees, kind: 'COMPROVANTE', netAmountByEmployee: netByEmployee });
        const sourceHash = await sha256Browser(file);
        for (const item of parsed) {
          const hash = await sha256Browser(item.bytes);
          const metadata = extractReceiptMetadata(item.text);
          const autoAllowed = item.matchMethod === 'CPF' || item.matchMethod === 'NOME_VALOR';
          const employeeId = autoAllowed ? item.employeeId : null;
          const doc = employeeId ? documentByEmployee.get(employeeId) : null;
          const idempotencyKey = `receipt:${companyId}:${competencia}:${hash}:${doc?.document_id || 'unmatched'}`;
          const { data: duplicate } = await (supabase as any).from('payroll_payment_receipts').select('id').eq('idempotency_key', idempotencyKey).maybeSingle();
          if (duplicate) continue;
          const path = `${companyId}/${competencia}/comprovantes/${crypto.randomUUID()}-${safeFile(item.filename)}`;
          const blob = new Blob([item.bytes as any], { type: 'application/pdf' });
          const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
          if (storageError) throw storageError;
          const { error: insertError } = await (supabase as any).from('payroll_payment_receipts').insert({
            company_id: companyId,
            employee_id: employeeId,
            document_id: doc?.document_id || null,
            competencia,
            storage_path: path,
            original_filename: item.filename,
            mime_type: 'application/pdf',
            file_size: item.bytes.byteLength,
            receipt_sha256: hash,
            source_sha256: sourceHash,
            source_page_start: item.pageNumbers[0] || null,
            source_page_end: item.pageNumbers[item.pageNumbers.length - 1] || null,
            amount: metadata.amount ?? item.amountDetected,
            paid_at: metadata.paidAt,
            bank_name: metadata.bankName,
            transaction_id: metadata.transactionId,
            bank_authentication: metadata.bankAuthentication,
            payer_name: metadata.payerName,
            match_confidence: autoAllowed ? item.confidence : 0,
            extracted_data: { cpf_detectado: item.cpfDetected, metodo_vinculo: autoAllowed ? item.matchMethod : 'REVISAO_MANUAL', paginas: item.pageNumbers },
            status: employeeId && doc ? 'PAGAMENTO_IDENTIFICADO' : 'PAGAMENTO_NAO_IDENTIFICADO',
            idempotency_key: idempotencyKey,
          });
          if (insertError) {
            await supabase.storage.from(BUCKET).remove([path]);
            throw insertError;
          }
          created += 1;
          if (!employeeId || !doc) pending += 1;
        }
      }
      toast.success(`${created} comprovante(s) recebido(s).${pending ? ` ${pending} para conferência do RH.` : ''}`);
      await load();
    } catch (error: any) { toast.error(`Falha ao subir comprovantes: ${error?.message || error}`); }
    finally { setUploading(false); if (receiptInput.current) receiptInput.current.value = ''; }
  };

  const confirmDocument = async (row: any) => {
    try { await apiCall('confirm-document', { document_id: row.document_id }); toast.success('Holerite conferido. Aguardando pagamento.'); await load(); }
    catch (error: any) { toast.error(error.message); }
  };

  const confirmPayment = async (row: any, overrideReason = '') => {
    try { await apiCall('confirm-payment', { receipt_id: row.receipt_id, override_reason: overrideReason }); toast.success('Pagamento confirmado. Documento liberável para assinatura.'); await load(); }
    catch (error: any) {
      if (error.payload?.error === 'payment_amount_mismatch') {
        const reason = window.prompt(`O valor do comprovante difere do líquido em ${currency(error.payload.difference)}. Se a conferência estiver correta, informe o motivo administrativo:`);
        if (reason?.trim()) return confirmPayment(row, reason.trim());
      }
      toast.error(error.message);
    }
  };

  const sendOne = async (row: any) => {
    try {
      const result = await apiCall(row.request_id ? 'resend-link' : 'release-send', row.request_id ? { request_id: row.request_id } : { document_id: row.document_id });
      if (result.status === 'ERRO_DE_ENVIO') toast.error('Link criado, mas o canal de mensagem não está configurado/operante.');
      else toast.success('Link individual enviado.');
      await load();
    } catch (error: any) { toast.error(error.message); }
  };

  const sendPending = async (employeeIds?: Set<string>) => {
    const ready = rows.filter(r => r.holerite_confirmed && r.payment_confirmed && r.signature_status !== 'ASSINADO' && (!employeeIds || (r.employee_id && employeeIds.has(r.employee_id))));
    if (!ready.length) return toast.info('Nenhum funcionário pronto para envio neste filtro.');
    let ok = 0;
    for (const row of ready) {
      try { const result = await apiCall(row.request_id ? 'resend-link' : 'release-send', row.request_id ? { request_id: row.request_id } : { document_id: row.document_id }); if (result.ok) ok += 1; }
      catch { /* status fica auditado pelo backend */ }
    }
    toast.success(`${ok}/${ready.length} envio(s) processado(s).`);
    await load();
  };

  const manualReminder = async (row: any) => {
    if (!row.request_id) return toast.error('Ainda não existe link para este funcionário.');
    try { await apiCall('manual-reminder', { request_id: row.request_id }); toast.success('Cobrança manual processada. A automática continua ativa.'); await load(); }
    catch (error: any) { toast.error(error.message); }
  };

  const togglePilot = (employeeId: string) => {
    setPilot(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else if (next.size >= 5) { toast.error('O piloto permite no máximo 5 funcionários.'); return prev; }
      else next.add(employeeId);
      return next;
    });
  };

  const assignDocument = async (row: any) => {
    const employeeId = assignDoc[row.document_id];
    if (!employeeId) return toast.error('Selecione o funcionário.');
    try {
      const { error } = await (supabase as any).from('payroll_documents').update({ employee_id: employeeId, match_confidence: 100, extracted_data: { ...(row.extracted_data || {}), metodo_vinculo: 'RH_MANUAL' } }).eq('id', row.document_id);
      if (error) throw error;
      toast.success('Holerite vinculado ao funcionário.'); await load();
    } catch (error: any) { toast.error(error.message); }
  };

  const assignUnmatchedReceipt = async (receipt: any) => {
    const employeeId = assignReceipt[receipt.id];
    const doc = employeeId ? documentByEmployee.get(employeeId) : null;
    if (!employeeId || !doc) return toast.error('Selecione um funcionário que já possua holerite nesta competência.');
    try {
      const { error } = await (supabase as any).from('payroll_payment_receipts').update({
        employee_id: employeeId,
        document_id: doc.document_id,
        status: 'PAGAMENTO_IDENTIFICADO',
        match_confidence: 100,
        extracted_data: { ...(receipt.extracted_data || {}), metodo_vinculo: 'RH_MANUAL' },
      }).eq('id', receipt.id);
      if (error) throw error;
      toast.success('Comprovante vinculado. Confirme o pagamento após conferir os dados.'); await load();
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
    if (!row.request_id) return toast.info('Ainda não existe link/timeline de assinatura.');
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
      await mergePdfUrls([
        { url: urls.holerite_url, label: 'Holerite' },
        { url: urls.certificate_url, label: 'Certificado' },
        { url: urls.receipt_url, label: 'Comprovante' },
      ], `DOSSIÊ_PAGAMENTO_${safeFile(row.employee_name || 'FUNCIONARIO')}_${competencia}.pdf`);
    } catch (error: any) { toast.error(error.message); }
  };

  const consolidated = async () => {
    const filtered = rows.filter(row => consolidatedFilter === 'todos' ? Boolean(row.document_id)
      : consolidatedFilter === 'assinados' ? row.signature_status === 'ASSINADO'
      : row.signature_status !== 'ASSINADO');
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

  return <div className="mt-5 space-y-4 rounded-2xl border border-emerald-500/25 bg-card p-5">
    <input ref={holeriteInput} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={e => void uploadHolerites(Array.from(e.target.files || []))}/>
    <input ref={receiptInput} type="file" accept="application/pdf,.pdf,.zip,application/zip" multiple className="hidden" onChange={e => void uploadReceipts(Array.from(e.target.files || []))}/>

    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div><p className="text-xs uppercase tracking-wide text-emerald-400">Fechamento → Pagamento</p><h2 className="mt-1 flex items-center gap-2 text-lg font-bold"><FileSignature className="h-5 w-5"/>Assinatura eletrônica de holerites</h2><p className="mt-1 text-xs text-muted-foreground">Link somente após HOLERITE CONFERIDO + PAGAMENTO CONFIRMADO. Documentos em storage privado e trilha de auditoria.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => holeriteInput.current?.click()} disabled={uploading}><FileUp className="mr-2 h-4 w-4"/>SUBIR HOLERITES</Button><Button variant="outline" onClick={() => receiptInput.current?.click()} disabled={uploading}><ReceiptText className="mr-2 h-4 w-4"/>SUBIR COMPROVANTES</Button><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Atualizar</Button></div>
    </div>

    {messageConfigured === false && <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"/><div><b>Canal de envio ainda não configurado na Vercel.</b> Upload, conferência, comprovantes e auditoria funcionam; envio de link/OTP ficará em ERRO DE ENVIO até existir credencial de WhatsApp/webhook.</div></div>}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Holerites</p><p className="text-xl font-bold">{rows.length}</p></div>
      <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Pagamentos confirmados</p><p className="text-xl font-bold">{rows.filter(r=>r.payment_confirmed).length}</p></div>
      <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Assinados</p><p className="text-xl font-bold text-emerald-400">{rows.filter(r=>r.signature_status==='ASSINADO').length}</p></div>
      <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Pendentes</p><p className="text-xl font-bold text-amber-300">{rows.filter(r=>r.signature_status!=='ASSINADO').length}</p></div>
      <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Não identificados</p><p className="text-xl font-bold text-red-400">{rows.filter(r=>!r.employee_id).length + unmatchedReceipts.length}</p></div>
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
      <Users className="h-4 w-4 text-primary"/><span className="text-xs font-semibold">PILOTO: selecione até 5 funcionários na tabela.</span><Badge variant="outline">{pilot.size}/5</Badge>
      <Button size="sm" disabled={!pilot.size} onClick={() => void sendPending(pilot)}><Send className="mr-2 h-3.5 w-3.5"/>Enviar piloto</Button>
      <Button size="sm" variant="outline" onClick={() => void sendPending()}><Send className="mr-2 h-3.5 w-3.5"/>ENVIAR PENDENTES</Button>
    </div>

    {unmatchedReceipts.length > 0 && <div className="rounded-xl border border-red-500/25 p-3"><p className="mb-2 text-xs font-bold text-red-300">PAGAMENTOS NÃO IDENTIFICADOS — conferência obrigatória do RH</p><div className="space-y-2">{unmatchedReceipts.map(r => <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs"><span className="min-w-48 flex-1">{r.original_filename} · {currency(r.amount)}</span><select className="rounded border bg-background px-2 py-1.5" value={assignReceipt[r.id] || ''} onChange={e=>setAssignReceipt(prev=>({...prev,[r.id]:e.target.value}))}><option value="">Selecionar funcionário</option>{scopedEmployees.filter(emp=>documentByEmployee.has(emp.id)).map(emp=><option key={emp.id} value={emp.id}>{emp.name}</option>)}</select><Button size="sm" variant="outline" onClick={()=>void assignUnmatchedReceipt(r)}>Vincular</Button></div>)}</div></div>}

    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[1450px] text-xs"><thead className="bg-muted/50"><tr>{['Piloto','Funcionário','Holerite','Pagamento','Envio','Visualização','Assinatura','Cobranças','Status','Ações'].map(h=><th key={h} className="px-3 py-2 text-left uppercase text-muted-foreground">{h}</th>)}</tr></thead><tbody>
        {rows.map(row => <tr key={row.document_id} className="border-t align-top">
          <td className="px-3 py-3">{row.employee_id && <Checkbox checked={pilot.has(row.employee_id)} onCheckedChange={()=>togglePilot(row.employee_id)}/>}</td>
          <td className="px-3 py-3"><b>{row.employee_name || 'NÃO IDENTIFICADO'}</b><div className="text-muted-foreground">{row.employee_role || '—'}</div>{!row.employee_id && <div className="mt-2 flex gap-1"><select className="max-w-56 rounded border bg-background px-2 py-1" value={assignDoc[row.document_id] || ''} onChange={e=>setAssignDoc(prev=>({...prev,[row.document_id]:e.target.value}))}><option value="">Selecionar funcionário</option>{scopedEmployees.map(emp=><option key={emp.id} value={emp.id}>{emp.name}</option>)}</select><Button size="sm" variant="outline" onClick={()=>void assignDocument(row)}>Vincular</Button></div>}</td>
          <td className="px-3 py-3">{row.holerite_confirmed ? <span className="text-emerald-400">OK</span> : 'Pendente'}<div className="text-muted-foreground">V{row.document_version}</div></td>
          <td className="px-3 py-3">{row.payment_confirmed ? <span className="text-emerald-400">OK · {currency(row.payment_amount)}</span> : row.payment_status ? String(row.payment_status).replaceAll('_',' ') : 'Pendente'}</td>
          <td className="px-3 py-3">{brDateTime(row.sent_at)}</td><td className="px-3 py-3">{brDateTime(row.viewed_at)}</td><td className="px-3 py-3">{brDateTime(row.signed_at)}</td><td className="px-3 py-3">{row.reminder_count || 0}</td>
          <td className="px-3 py-3"><Badge variant="outline" className={statusClass(displayStatus(row))}>{displayStatus(row)}</Badge>{row.send_error && <div className="mt-1 max-w-56 text-[10px] text-red-400">{row.send_error}</div>}</td>
          <td className="px-3 py-3"><div className="flex max-w-[440px] flex-wrap gap-1">
            {!row.holerite_confirmed && row.employee_id && <Button size="sm" variant="outline" onClick={()=>void confirmDocument(row)}><FileCheck2 className="mr-1 h-3 w-3"/>Confirmar holerite</Button>}
            {row.holerite_confirmed && row.receipt_id && !row.payment_confirmed && <Button size="sm" variant="outline" onClick={()=>void confirmPayment(row)}><CheckCircle2 className="mr-1 h-3 w-3"/>Confirmar pagamento</Button>}
            {row.holerite_confirmed && row.payment_confirmed && row.signature_status !== 'ASSINADO' && <Button size="sm" onClick={()=>void sendOne(row)}><Send className="mr-1 h-3 w-3"/>{row.request_id ? 'Reenviar link' : 'Enviar link'}</Button>}
            {row.request_id && row.signature_status !== 'ASSINADO' && <Button size="sm" variant="outline" onClick={()=>void manualReminder(row)}><MessageSquareMore className="mr-1 h-3 w-3"/>Cobrar</Button>}
            <Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'holerite')}>Holerite</Button>
            {row.receipt_id && <Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'receipt')}>Comprovante</Button>}
            {row.signature_status==='ASSINADO' && <Button size="sm" variant="ghost" onClick={()=>void openAdminFile(row,'certificate')}>Certificado</Button>}
            {row.signature_status==='ASSINADO' && <Button size="sm" variant="outline" onClick={()=>void dossier(row)}><FileArchive className="mr-1 h-3 w-3"/>Dossiê</Button>}
            {row.request_id && <Button size="sm" variant="ghost" onClick={()=>void openTimeline(row)}><Clock3 className="mr-1 h-3 w-3"/>Histórico</Button>}
          </div></td>
        </tr>)}
        {!rows.length && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Nenhum holerite recebido nesta competência.</td></tr>}
      </tbody></table>
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3"><FileArchive className="h-4 w-4"/><b className="text-xs">GERAR PDF CONSOLIDADO</b><select value={consolidatedFilter} onChange={e=>setConsolidatedFilter(e.target.value as any)} className="rounded border bg-background px-2 py-1.5 text-xs"><option value="assinados">Somente assinados</option><option value="todos">Todos</option><option value="pendentes">Somente pendentes</option></select><Button size="sm" variant="outline" onClick={()=>void consolidated()}>Gerar consolidado</Button></div>

    {uploading && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60"><div className="rounded-xl border bg-background p-5 text-center"><Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin"/><b>Processando documentos reais...</b><p className="mt-1 text-xs text-muted-foreground">Leitura, separação, SHA-256 e vínculo seguro.</p></div></div>}

    <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}><DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>Histórico — {timeline.employee}</DialogTitle></DialogHeader><div className="space-y-2">{[...(timeline.events || []).map((e:any)=>({...e,_kind:'evento'})), ...(timeline.messages || []).map((m:any)=>({...m,_kind:'mensagem'}))].sort((a:any,b:any)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).map((item:any,index:number)=><div key={`${item._kind}-${item.id}-${index}`} className="rounded-lg border p-3 text-xs"><div className="flex justify-between gap-3"><b>{item.event_type || item.message_kind}</b><span className="text-muted-foreground">{brDateTime(item.created_at)}</span></div><div className="mt-1 text-muted-foreground">{item._kind==='mensagem' ? `${item.status} · ${item.channel}${item.error ? ` · ${item.error}` : ''}` : JSON.stringify(item.payload || {})}</div></div>)}</div></DialogContent></Dialog>
  </div>;
};

export default PayrollSignatureModule;
