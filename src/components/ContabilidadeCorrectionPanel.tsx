import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type PortalKind = 'principal' | 'goiania';
type Mode = 'admin' | 'portal';
type Cycle = {
  id:string;
  empresa_id:string;
  competencia:string;
  tipo:'adiantamento'|'pagamento';
  status:string;
  enviado_em?:string|null;
};
type Company = { id:string; nome:string };

type Props = {
  mode: Mode;
  portal?: PortalKind;
  compact?: boolean;
};

const sessionKey = (portal: PortalKind) => `topac_contabilidade_${portal}_session`;
const monthLabel = (value:string) => {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : value;
};
const processLabel = (type:string) => type === 'pagamento' ? 'Pagamento' : 'Adiantamento';
const eligible = (cycle:Cycle) => Boolean(cycle.enviado_em) || ['processando','aguardando_conferencia','conferido','pendencia'].includes(cycle.status);
const errorMessage = (error:any) => {
  const value = String(error?.message || error || '');
  if (value.includes('documento_ja_assinado_ou_vinculado')) return 'Não é possível corrigir automaticamente porque um dos documentos já foi assinado ou possui vínculo de assinatura.';
  if (value.includes('nenhum_envio_para_corrigir')) return 'Não há envio da Contabilidade para corrigir neste processo.';
  if (value.includes('justificativa_obrigatoria')) return 'Informe a justificativa da correção.';
  return value || 'Não foi possível corrigir o envio.';
};

function readPortalToken(portal: PortalKind) {
  try { return JSON.parse(localStorage.getItem(sessionKey(portal)) || 'null')?.token || ''; }
  catch { return ''; }
}

export default function ContabilidadeCorrectionPanel({ mode, portal = 'principal', compact = false }: Props) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (mode === 'admin') {
        const { data:sessionData } = await supabase.auth.getSession();
        const jwt = sessionData.session?.access_token;
        if (!jwt) return;
        const response = await fetch('/api/accounting-payroll-flow', {
          method:'POST',
          headers:{ 'content-type':'application/json', authorization:`Bearer ${jwt}` },
          body:JSON.stringify({ action:'admin_state' }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || 'Falha ao carregar correções.');
        setCycles((result.cycles || []).filter((cycle:Cycle) => eligible(cycle)));
        setCompanies(result.companies || []);
      } else {
        const token = readPortalToken(portal);
        if (!token) return;
        const response = await fetch('/api/accounting-payroll-flow', {
          method:'POST',
          headers:{ 'content-type':'application/json' },
          body:JSON.stringify({ action:'state', portal, token }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || 'Falha ao carregar correções.');
        setCycles((result.cycles || []).filter((cycle:Cycle) => eligible(cycle)));
        setCompanies(result.companies || []);
      }
    } catch (error:any) {
      if (!silent) toast.error(errorMessage(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [mode, portal]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const companyMap = useMemo(() => new Map(companies.map(company => [company.id, company.nome])), [companies]);

  const correct = async (cycle:Cycle) => {
    const companyName = companyMap.get(cycle.empresa_id) || 'Empresa';
    const reason = window.prompt(
      `CORRIGIR ENVIO — ${processLabel(cycle.tipo)}\n${companyName} · ${monthLabel(cycle.competencia)}\n\nInforme obrigatoriamente o motivo da correção:`,
      '',
    );
    if (reason === null) return;
    if (reason.trim().length < 3) return toast.error('Informe a justificativa da correção.');
    const confirmed = window.confirm(
      `Confirmar a correção deste envio?\n\n${companyName}\n${processLabel(cycle.tipo)} · ${monthLabel(cycle.competencia)}\n\nO lote enviado será retirado da plataforma e será enviado um e-mail de RETIFICAÇÃO pedindo para desconsiderar o e-mail anterior.`,
    );
    if (!confirmed) return;

    setBusy(cycle.id);
    try {
      const token = mode === 'portal' ? readPortalToken(portal) : '';
      const { data, error } = await supabase.rpc('contabilidade_corrigir_envio' as any, {
        p_ciclo_id: cycle.id,
        p_justificativa: reason.trim(),
        p_mode: mode === 'admin' ? 'ADMIN' : 'CONTABILIDADE',
        p_portal: mode === 'portal' ? portal : null,
        p_token: mode === 'portal' ? token : null,
      });
      if (error) throw error;
      const result:any = data || {};
      if (!result?.retificacao_id) throw new Error('A correção foi registrada, mas não retornou o protocolo de retificação.');

      const { data:emailData, error:emailError } = await supabase.functions.invoke('accounting-correction-email', {
        body: {
          retificacao_id: result.retificacao_id,
          mode: mode === 'admin' ? 'ADMIN' : 'CONTABILIDADE',
          ...(mode === 'portal' ? { portal, token } : {}),
        },
      });

      if (emailError || !emailData?.ok) {
        toast.warning('O envio errado foi retirado da plataforma, mas o e-mail de retificação ficou pendente. Avise o RH para reenviar a retificação.');
      } else {
        toast.success('Envio corrigido. Lote retirado da plataforma e e-mail de retificação enviado pedindo para desconsiderar o anterior.');
      }
      await load(true);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error:any) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (!loading && cycles.length === 0) return null;

  return (
    <section className={`${compact ? 'mt-3' : 'mb-5'} overflow-hidden rounded-xl border border-rose-500/20 bg-[#08090d]`}>
      <div className="flex items-center justify-between gap-3 border-b border-rose-500/15 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-white"><RotateCcw className="h-4 w-4 text-rose-300" />Correção de envio</div>
          <div className="mt-1 text-[10px] text-zinc-500">Use somente quando PDFs forem enviados na empresa errada ou o lote precisar ser desconsiderado.</div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-md border border-[#3b303d] p-2 text-zinc-400 hover:text-white"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {loading ? (
        <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-rose-300" /></div>
      ) : (
        <div className="grid gap-2 p-3 md:grid-cols-2">
          {cycles.map(cycle => (
            <div key={cycle.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#2d2931] bg-[#06080b] p-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-black text-zinc-100">{companyMap.get(cycle.empresa_id) || 'Empresa'}</div>
                <div className="mt-1 text-[10px] text-zinc-500">{processLabel(cycle.tipo)} · {monthLabel(cycle.competencia)} · {cycle.status.replace(/_/g,' ')}</div>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={busy === cycle.id} onClick={() => void correct(cycle)} className="shrink-0 border-rose-500/35 bg-rose-500/[.05] text-rose-200 hover:bg-rose-500/10 hover:text-rose-100">
                {busy === cycle.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="mr-2 h-3.5 w-3.5" />}Corrigir envio
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
