import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RefreshCw, Send, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');

const normalizeWhatsappPhone = (value: unknown) => {
  const phone = digits(value);
  if (phone.length === 10 || phone.length === 11) return `55${phone}`;
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) return phone;
  return '';
};

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

type PendingDocument = {
  document_id: string;
  competencia: string;
  document_type: string;
};

type PendingEmployee = {
  employee_id: string;
  name: string;
  phoneRaw: string;
  whatsappPhone: string;
  documents: PendingDocument[];
};

type PendingPayrollSignaturesProps = {
  companyId: string;
  competencia: string;
  autoOpen?: boolean;
};

const isActuallyPending = (row: PendingRow) => {
  if (!row.document_id || !row.holerite_confirmed || row.signature_status === 'ASSINADO' || row.signed_at) return false;
  // Holerite só entra na cobrança quando o pagamento já foi confirmado e o documento está realmente disponível no portal.
  if (row.document_type === 'HOLERITE' && row.payment_confirmed !== true) return false;
  return true;
};

const PendingPayrollSignatures: React.FC<PendingPayrollSignaturesProps> = ({ companyId, autoOpen = false }) => {
  const { companies, employees } = useApp();
  const company = companies.find(item => item.id === companyId);
  const portalSlug = String((company as any)?.codigo || '').trim().toLowerCase();
  const portalPath = portalSlug ? `/holerite/${encodeURIComponent(portalSlug)}` : '/holerite';
  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}${portalPath}` : portalPath;

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);
  const autoOpenedRef = useRef(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('payroll_admin_status_v')
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
      const phoneRaw = String(employee?.celular || employee?.telefone || '');
      const current = grouped.get(employeeId) || {
        employee_id: employeeId,
        name: employee?.name || row.employee_name || 'Funcionário',
        phoneRaw,
        whatsappPhone: normalizeWhatsappPhone(phoneRaw),
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
      .map(item => ({
        ...item,
        documents: item.documents.sort((a, b) => b.competencia.localeCompare(a.competencia)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [rows, employees]);

  const sendWhatsApp = useCallback((employee: PendingEmployee) => {
    if (!employee.whatsappPhone) return;
    const months = [...new Set(employee.documents.map(doc => doc.competencia).filter(Boolean))];
    const pendingText = months.length
      ? months.map(competenceLabel).join(', ')
      : 'documento(s) já liberado(s)';
    const plural = employee.documents.length > 1;
    const text = `Olá, ${employee.name}! Você possui ${employee.documents.length} documento${plural ? 's' : ''} já liberado${plural ? 's' : ''} no Portal TOPAC RH PRO da ${company?.name || 'empresa'} que ainda ${plural ? 'constam' : 'consta'} como pendente${plural ? 's' : ''} de assinatura.\n\nPendência${plural ? 's' : ''}: ${pendingText}.\n\nAcesse pelo link abaixo e entre com seu CPF, data de nascimento e os 4 últimos números do celular cadastrado:\n\n${portalUrl}`;
    window.open(`https://wa.me/${employee.whatsappPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }, [company?.name, portalUrl]);

  const validPending = useMemo(() => pending.filter(item => Boolean(item.whatsappPhone)), [pending]);
  const withoutPhone = pending.length - validPending.length;
  const totalDocuments = useMemo(() => pending.reduce((sum, item) => sum + item.documents.length, 0), [pending]);
  const bulkDone = validPending.length > 0 && bulkIndex >= validPending.length;
  const currentBulk = bulkIndex < validPending.length ? validPending[bulkIndex] : null;

  const startBulk = useCallback(() => {
    setBulkIndex(0);
    setBulkOpen(true);
  }, []);

  const sendCurrentBulk = useCallback(() => {
    if (!currentBulk) return;
    sendWhatsApp(currentBulk);
    setBulkIndex(index => Math.min(index + 1, validPending.length));
  }, [currentBulk, sendWhatsApp, validPending.length]);

  useEffect(() => {
    if (!autoOpen || loading || autoOpenedRef.current || pending.length === 0) return;
    autoOpenedRef.current = true;
    setOpen(true);
  }, [autoOpen, loading, pending.length]);

  useEffect(() => {
    autoOpenedRef.current = false;
  }, [companyId]);

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
                {loading
                  ? 'Atualizando assinaturas...'
                  : pending.length
                    ? `${pending.length} funcionário(s) com ${totalDocuments} documento(s) realmente liberado(s) e ainda não assinado(s). O mês selecionado não interfere nesta cobrança.`
                    : 'Nenhum documento já liberado está pendente de assinatura.'}
              </p>
              {!loading && withoutPhone > 0 && <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="h-3 w-3" />{withoutPhone} pendente(s) sem telefone válido cadastrado.</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={loading || pending.length === 0}>
              <Users className="mr-2 h-4 w-4" />
              Ver pendentes
            </Button>
            <Button size="sm" onClick={startBulk} disabled={loading || validPending.length === 0} className="bg-emerald-600 text-white hover:bg-emerald-500">
              <Send className="mr-2 h-4 w-4" />
              Enviar em massa
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[82vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Pendentes reais de assinatura</DialogTitle></DialogHeader>

          <div className="mb-2 flex flex-col gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span><strong>{company?.name || 'Empresa'}</strong> · {pending.length} funcionário(s) · {totalDocuments} documento(s)</span>
              <p className="mt-1 text-muted-foreground">A lista considera somente documentos já liberados para assinatura. Mês ainda não fechado ou holerite sem pagamento confirmado não entra.</p>
            </div>
            <Button size="sm" onClick={startBulk} disabled={validPending.length === 0} className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500">
              <Send className="mr-2 h-4 w-4" />Enviar em massa ({validPending.length})
            </Button>
          </div>

          <div className="space-y-2">
            {pending.map(employee => (
              <div key={employee.employee_id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-300">{employee.documents.length} pendente(s)</Badge>
                  </div>
                  <p className={`mt-1 text-xs ${employee.whatsappPhone ? 'text-muted-foreground' : 'text-red-400'}`}>{formatPhone(employee.phoneRaw)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{[...new Set(employee.documents.map(doc => doc.competencia).filter(Boolean))].map(competenceLabel).join(' · ')}</p>
                </div>

                <Button size="sm" onClick={() => sendWhatsApp(employee)} disabled={!employee.whatsappPhone} className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500" title={employee.whatsappPhone ? `Enviar lembrete para ${employee.name}` : 'Funcionário sem telefone válido cadastrado'}>
                  <MessageCircle className="mr-2 h-4 w-4" />{employee.whatsappPhone ? 'Enviar WhatsApp' : 'Sem telefone'}
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Envio em massa — {company?.name || 'Empresa'}</DialogTitle></DialogHeader>

          {validPending.length === 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Nenhum pendente possui telefone válido para WhatsApp.</div>
          ) : bulkDone ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-400"><CheckCircle2 className="h-6 w-6" /></div>
              <div><p className="font-semibold text-foreground">Fila concluída</p><p className="mt-1 text-xs text-muted-foreground">Foram preparados {validPending.length} contatos com pendências reais para envio pelo WhatsApp.</p></div>
              <Button className="w-full" onClick={() => setBulkOpen(false)}>Concluir</Button>
            </div>
          ) : currentBulk ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">Contato {bulkIndex + 1} de {validPending.length}</p>
                    <p className="mt-1 truncate text-base font-bold text-foreground">{currentBulk.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatPhone(currentBulk.phoneRaw)} · {currentBulk.documents.length} documento(s)</p>
                  </div>
                  <MessageCircle className="h-8 w-8 shrink-0 text-emerald-400" />
                </div>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((bulkIndex / validPending.length) * 100)}%` }} /></div>
              <p className="text-xs leading-relaxed text-muted-foreground">O WhatsApp abre a conversa com a mensagem pronta. Envie e, ao voltar ao TOPAC RH PRO, continue para o próximo contato.</p>
              <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-500" onClick={sendCurrentBulk}><Send className="mr-2 h-4 w-4" />Abrir WhatsApp e avançar</Button>
              <Button variant="outline" className="w-full" onClick={() => setBulkIndex(index => Math.min(index + 1, validPending.length))}>Pular este contato</Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PendingPayrollSignatures;
