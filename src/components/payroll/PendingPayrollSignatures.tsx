import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RefreshCw, Users } from 'lucide-react';
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
  const [year, month] = competencia.split('-').map(Number);
  if (!year || !month) return competencia;
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));
};

type PendingRow = {
  employee_id?: string | null;
  employee_name?: string | null;
  document_id?: string | null;
  holerite_confirmed?: boolean | null;
  signature_status?: string | null;
  signed_at?: string | null;
};

type PendingEmployee = PendingRow & {
  name: string;
  phoneRaw: string;
  whatsappPhone: string;
};

const PendingPayrollSignatures: React.FC<{ companyId: string; competencia: string }> = ({ companyId, competencia }) => {
  const { companies, employees } = useApp();
  const company = companies.find(item => item.id === companyId);
  const portalSlug = String((company as any)?.codigo || '').trim().toLowerCase();
  const portalPath = portalSlug ? `/holerite/${encodeURIComponent(portalSlug)}` : '/holerite';
  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}${portalPath}` : portalPath;

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !competencia) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('payroll_admin_status_v')
        .select('*')
        .eq('company_id', companyId)
        .eq('competencia', competencia)
        .order('employee_name', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setRows(data || []);
    } catch (error) {
      console.error('[pending-payroll-signatures]', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, competencia]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleRefresh = () => void load();
    window.addEventListener('topac:refresh-current', handleRefresh);
    return () => window.removeEventListener('topac:refresh-current', handleRefresh);
  }, [load]);

  const pending = useMemo<PendingEmployee[]>(() => rows
    .filter(row => Boolean(row.document_id) && Boolean(row.holerite_confirmed) && row.signature_status !== 'ASSINADO')
    .map(row => {
      const employee = employees.find(item => item.id === row.employee_id) as any;
      const phoneRaw = String(employee?.celular || employee?.telefone || '');
      return {
        ...row,
        name: employee?.name || row.employee_name || 'Funcionário',
        phoneRaw,
        whatsappPhone: normalizeWhatsappPhone(phoneRaw),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [rows, employees]);

  const sendWhatsApp = (employee: PendingEmployee) => {
    if (!employee.whatsappPhone) return;
    const text = `Olá, ${employee.name}! Seu documento de ${competenceLabel(competencia)} está disponível no Portal TOPAC RH PRO da ${company?.name || 'empresa'} e ainda consta como pendente de assinatura.\n\nAcesse pelo link abaixo e entre com seu CPF, data de nascimento e os 4 últimos números do celular cadastrado:\n\n${portalUrl}`;
    window.open(`https://wa.me/${employee.whatsappPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const withoutPhone = pending.filter(item => !item.whatsappPhone).length;

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
                <p className={`text-xs font-bold uppercase ${pending.length ? 'text-amber-300' : 'text-emerald-300'}`}>Pendentes de assinatura</p>
                {!loading && <Badge variant="outline" className={pending.length ? 'border-amber-500/40 text-amber-200' : 'border-emerald-500/40 text-emerald-200'}>{pending.length}</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading ? 'Atualizando assinaturas...' : pending.length ? `${pending.length} funcionário(s) ainda não assinaram em ${competenceLabel(competencia)}.` : `Todos os documentos liberados de ${competenceLabel(competencia)} já foram assinados.`}
              </p>
              {!loading && withoutPhone > 0 && <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="h-3 w-3" />{withoutPhone} pendente(s) sem telefone válido cadastrado.</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
            <Button size="sm" onClick={() => setOpen(true)} disabled={loading || pending.length === 0}>
              <Users className="mr-2 h-4 w-4" />
              Ver quem não assinou
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[82vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pendentes de assinatura — {competenceLabel(competencia)}</DialogTitle>
          </DialogHeader>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
            <span><strong>{company?.name || 'Empresa'}</strong> · {pending.length} pendente(s)</span>
            <span className="text-muted-foreground">Clique no funcionário para abrir o WhatsApp já com a mensagem e o link.</span>
          </div>

          <div className="space-y-2">
            {pending.map(employee => (
              <div key={`${employee.employee_id}-${employee.document_id}`} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-300">Pendente</Badge>
                  </div>
                  <p className={`mt-1 text-xs ${employee.whatsappPhone ? 'text-muted-foreground' : 'text-red-400'}`}>{formatPhone(employee.phoneRaw)}</p>
                </div>

                <Button
                  size="sm"
                  onClick={() => sendWhatsApp(employee)}
                  disabled={!employee.whatsappPhone}
                  className="shrink-0"
                  title={employee.whatsappPhone ? `Enviar lembrete para ${employee.name}` : 'Funcionário sem telefone válido cadastrado'}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  {employee.whatsappPhone ? 'Mandar no WhatsApp' : 'Sem telefone'}
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PendingPayrollSignatures;
