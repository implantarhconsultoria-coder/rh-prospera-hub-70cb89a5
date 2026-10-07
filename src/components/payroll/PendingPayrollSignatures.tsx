import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RefreshCw, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');

const formatPhone = (value: unknown) => {
  const phone = digits(value);
  const national = phone.startsWith('55') && phone.length > 11 ? phone.slice(2) : phone;
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  return phone || 'Sem telefone cadastrado';
};

const competenceLabel = (competencia: string) => {
  const [year, month] = String(competencia || '').split('-').map(Number);
  if (!year || !month) return competencia;
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};

const signatureDocumentLabel = (documentType: string) => {
  if (documentType === 'AVISO_FERIAS') return 'Aviso de Férias';
  if (documentType === 'BENEFICIO_VR') return 'Recibo VR';
  if (documentType === 'BENEFICIO_VT') return 'Recibo VT';
  if (documentType === 'BENEFICIO_VR_VT') return 'Recibo VR / VT';
  if (documentType === 'ADIANTAMENTO') return 'Recibo de Adiantamento';
  if (documentType === 'RECIBO_GARAGEM') return 'Recibo de Garagem';
  return 'Holerite';
};

const pendingDocumentLabel = (doc: { document_type: string; competencia: string }) => {
  const label = signatureDocumentLabel(doc.document_type);
  const competencia = competenceLabel(doc.competencia);
  return competencia ? `${label} (${competencia})` : label;
};

type PendingRow = {
  employee_id?: string | null;
  employee_name?: string | null;
  document_id?: string | null;
  competencia?: string | null;
  document_type?: string | null;
  holerite_confirmed?: boolean | null;
  payment_confirmed?: boolean | null;
  signature_status?: string | null;
  signed_at?: string | null;
};

type PendingDocument = { document_id: string; competencia: string; document_type: string };
type PendingEmployee = { employee_id: string; name: string; phoneRaw: string; documents: PendingDocument[] };
type PendingPayrollSignaturesProps = { companyId: string; competencia: string; autoOpen?: boolean };
type BulkResult = { total: number; sent: number; deduplicated: number; failed: number; results: Array<{ employee_id?: string; employee_name?: string; ok: boolean; status: string; error?: string }> };

const isActuallyPending = (row: PendingRow) => {
  if (!row.document_id || !row.holerite_confirmed || row.signature_status === 'ASSINADO' || row.signed_at) return false;
  if (row.document_type === 'HOLERITE' && row.payment_confirmed !== true) return false;
  return true;
};

const errorMessage = (code: unknown) => {
  const value = String(code || '');
  const messages: Record<string, string> = {
    invalid_phone: 'Funcionário sem telefone válido cadastrado.',
    document_already_signed: 'O documento já está assinado.',
    document_not_released: 'O documento ainda não está liberado para assinatura.',
    payment_not_confirmed: 'O pagamento ainda não foi confirmado.',
    no_pending_documents: 'Não existem documentos liberados e pendentes para este funcionário.',
    message_channel_not_configured: 'O canal de WhatsApp não está configurado no servidor.',
    employee_company_mismatch: 'O funcionário não pertence à empresa/filial selecionada.',
    forbidden: 'Seu usuário não possui permissão para realizar este envio.',
    unauthorized: 'Sua sessão administrativa expirou.',
  };
  return messages[value] || value || 'Falha ao enviar pelo WhatsApp.';
};

const whatsappApi = async (action: string, payload: Record<string, unknown>) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('unauthorized');
  const response = await fetch('/api/payroll-whatsapp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    cache: 'no-store',
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

const PendingPayrollSignatures: React.FC<PendingPayrollSignaturesProps> = ({ companyId, autoOpen = false }) => {
  const { companies, employees } = useApp();
  const company = companies.find(item => item.id === companyId);
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [sendingEmployees, setSendingEmployees] = useState<Set<string>>(new Set());
  const autoOpenedRef = useRef(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('payroll_signature_status_v')
        .select('employee_id,employee_name,document_id,competencia,document_type,holerite_confirmed,payment_confirmed,signature_status,signed_at')
        .eq('company_id', companyId)
        .order('competencia', { ascending: false })
        .order('employee_name', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setRows(data || []);
    } catch (error) {
      console.error('[pending-payroll-signatures]', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const handleRefresh = () => void load();
    window.addEventListener('topac:refresh-current', handleRefresh);
    return () => window.removeEventListener('topac:refresh-current', handleRefresh);
  }, [load]);

  const pending = useMemo<PendingEmployee[]>(() => {
    const grouped = new Map<string, PendingEmployee>();
    rows.filter(isActuallyPending).forEach(row => {
      const employee = employees.find(item => item.id === row.employee_id) as any;
      const employeeId = String(row.employee_id || '');
      if (!employeeId) return;
      const current = grouped.get(employeeId) || {
        employee_id: employeeId,
        name: employee?.name || row.employee_name || 'Funcionário',
        phoneRaw: String(employee?.celular || employee?.telefone || ''),
        documents: [],
      };
      current.documents.push({
        document_id: String(row.document_id),
        competencia: String(row.competencia || ''),
        document_type: String(row.document_type || ''),
      });
      grouped.set(employeeId, current);
    });
    return [...grouped.values()]
      .map(item => ({ ...item, documents: item.documents.sort((a, b) => b.competencia.localeCompare(a.competencia)) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [rows, employees]);

  const totalDocuments = useMemo(() => pending.reduce((sum, item) => sum + item.documents.length, 0), [pending]);
  const visibleInvalidPhones = useMemo(() => pending.filter(item => {
    const phone = digits(item.phoneRaw);
    return ![10, 11, 12, 13].includes(phone.length);
  }).length, [pending]);

  const sendEmployee = useCallback(async (employee: PendingEmployee) => {
    if (sendingEmployees.has(employee.employee_id)) return;
    setSendingEmployees(current => new Set(current).add(employee.employee_id));
    try {
      const result = await whatsappApi('send-employee', { company_id: companyId, employee_id: employee.employee_id });
      if (result.deduplicated) toast.info(`O envio para ${employee.name} já estava em processamento ou foi realizado há pouco.`);
      else toast.success(`Documento enviado para o WhatsApp de ${employee.name}.`);
      await load();
    } catch (error: any) {
      toast.error(`${employee.name}: ${errorMessage(error?.payload?.error || error?.message)}`);
    } finally {
      setSendingEmployees(current => {
        const next = new Set(current);
        next.delete(employee.employee_id);
        return next;
      });
    }
  }, [companyId, load, sendingEmployees]);

  const startBulk = useCallback(async () => {
    if (bulkSending || pending.length === 0) return;
    setBulkOpen(true);
    setBulkResult(null);
    setBulkSending(true);
    try {
      const result = await whatsappApi('send-pending', { company_id: companyId });
      setBulkResult(result);
      if (result.failed > 0) toast.warning(`Envio concluído com ${result.failed} falha(s).`);
      else toast.success(`Envio concluído para ${result.sent} funcionário(s).`);
      await load();
    } catch (error: any) {
      toast.error(errorMessage(error?.payload?.error || error?.message));
    } finally {
      setBulkSending(false);
    }
  }, [bulkSending, companyId, load, pending.length]);

  useEffect(() => {
    if (!autoOpen || loading || autoOpenedRef.current || pending.length === 0) return;
    autoOpenedRef.current = true;
    setOpen(true);
  }, [autoOpen, loading, pending.length]);
  useEffect(() => { autoOpenedRef.current = false; }, [companyId]);

  return (
    <>
      <div className={`rounded-xl border p-4 ${pending.length ? 'border-amber-500/30 bg-amber-500/[0.08]' : 'border-emerald-500/30 bg-emerald-500/[0.08]'}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${pending.length ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
              {pending.length ? <Users className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-xs font-bold uppercase ${pending.length ? 'text-amber-300' : 'text-emerald-300'}`}>Pendentes reais de assinatura</p>
                {!loading && <Badge variant="outline" className={pending.length ? 'border-amber-500/40 text-amber-200' : 'border-emerald-500/40 text-emerald-200'}>{pending.length}</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading ? 'Atualizando assinaturas...' : pending.length ? `${pending.length} funcionário(s) com ${totalDocuments} documento(s) liberado(s) e ainda não assinado(s).` : 'Nenhum documento já liberado está pendente de assinatura.'}
              </p>
              {!loading && visibleInvalidPhones > 0 && <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="h-3 w-3" />{visibleInvalidPhones} cadastro(s) aparentam não possuir telefone válido; o servidor fará a validação definitiva.</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={loading || pending.length === 0}><Users className="mr-2 h-4 w-4" />Ver pendentes</Button>
            <Button size="sm" onClick={() => void startBulk()} disabled={loading || bulkSending || pending.length === 0} className="bg-emerald-600 text-white hover:bg-emerald-500">
              {bulkSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar em massa
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[82vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Pendentes reais de assinatura</DialogTitle></DialogHeader>
          <div className="mb-2 flex flex-col gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div><span><strong>{company?.name || 'Empresa'}</strong> · {pending.length} funcionário(s) · {totalDocuments} documento(s)</span><p className="mt-1 text-muted-foreground">Somente documentos já liberados e ainda não assinados. O servidor revalida documento, funcionário, empresa/filial, pagamento e telefone antes do disparo.</p></div>
            <Button size="sm" onClick={() => void startBulk()} disabled={bulkSending || pending.length === 0} className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500">{bulkSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar em massa ({pending.length})</Button>
          </div>
          <div className="space-y-2">
            {pending.map(employee => {
              const sending = sendingEmployees.has(employee.employee_id);
              return (
                <div key={employee.employee_id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-foreground">{employee.name}</p><Badge variant="outline" className="border-amber-500/40 text-amber-300">{employee.documents.length} pendente(s)</Badge></div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatPhone(employee.phoneRaw)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{[...new Set(employee.documents.map(pendingDocumentLabel))].join(' · ')}</p>
                  </div>
                  <Button size="sm" onClick={() => void sendEmployee(employee)} disabled={sending} className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500">
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}{sending ? 'Processando...' : 'Enviar WhatsApp'}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={(next) => !bulkSending && setBulkOpen(next)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Envio em massa — {company?.name || 'Empresa'}</DialogTitle></DialogHeader>
          {bulkSending ? (
            <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /><div><p className="font-semibold">Processando pendências reais...</p><p className="mt-1 text-xs text-muted-foreground">Cada funcionário é processado separadamente; uma falha não interrompe os demais.</p></div></div>
          ) : bulkResult ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg border p-3"><p className="text-xl font-bold text-emerald-400">{bulkResult.sent}</p><p className="text-[11px] text-muted-foreground">Enviados</p></div><div className="rounded-lg border p-3"><p className="text-xl font-bold text-sky-400">{bulkResult.deduplicated}</p><p className="text-[11px] text-muted-foreground">Já processados</p></div><div className="rounded-lg border p-3"><p className="text-xl font-bold text-red-400">{bulkResult.failed}</p><p className="text-[11px] text-muted-foreground">Falharam</p></div></div>
              {bulkResult.results.filter(item => !item.ok).length > 0 && <div className="max-h-56 space-y-2 overflow-y-auto">{bulkResult.results.filter(item => !item.ok).map((item, index) => <div key={`${item.employee_id || index}`} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs"><p className="font-semibold text-red-300">{item.employee_name || item.employee_id || 'Funcionário'}</p><p className="mt-1 text-muted-foreground">{errorMessage(item.error)}</p></div>)}</div>}
              <Button className="w-full" onClick={() => setBulkOpen(false)}>Concluir</Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PendingPayrollSignatures;
