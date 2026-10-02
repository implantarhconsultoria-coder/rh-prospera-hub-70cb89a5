import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bell, Building2, CheckCircle2, ChevronRight, CircleDollarSign,
  ClipboardList, Fuel, HardHat, Stethoscope, UserPlus, WalletCards, Wrench, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';

type NotificationTone = 'attention' | 'info' | 'success';
type NotificationIcon = 'accounting' | 'epi' | 'aso' | 'admission' | 'fuel' | 'finance' | 'operation' | 'company';

type PlatformNotification = {
  id: string;
  source: string;
  title: string;
  detail: string;
  createdAt?: string | null;
  path: string;
  tone: NotificationTone;
  icon: NotificationIcon;
};

const RECENT_HOURS = 12;

const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : 'Agora';

const money = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

const iconFor = (kind: NotificationIcon) => {
  if (kind === 'accounting') return ClipboardList;
  if (kind === 'epi') return HardHat;
  if (kind === 'aso') return Stethoscope;
  if (kind === 'admission') return UserPlus;
  if (kind === 'fuel') return Fuel;
  if (kind === 'finance') return CircleDollarSign;
  if (kind === 'operation') return Wrench;
  return Building2;
};

const toneClasses = (tone: NotificationTone) => tone === 'attention'
  ? 'border-amber-400/25 bg-amber-400/[.07] text-amber-300'
  : tone === 'success'
    ? 'border-emerald-400/25 bg-emerald-400/[.06] text-emerald-300'
    : 'border-cyan-400/20 bg-cyan-400/[.05] text-cyan-300';

export default function AdminRequestNotifications() {
  const navigate = useNavigate();
  const { companies, employees } = useApp();
  const [rows, setRows] = useState<PlatformNotification[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const companyName = useCallback((id?: string | null) =>
    companies.find((item:any) => item.id === id)?.name || 'Empresa',
  [companies]);

  const employeeName = useCallback((id?: string | null) =>
    employees.find((item:any) => item.id === id)?.name || 'Funcionário',
  [employees]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - RECENT_HOURS * 60 * 60 * 1000).toISOString();
      const upcomingVacationLimit = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0,10);

      const [
        fuelResult,
        cyclesResult,
        reviewsResult,
        epiResult,
        asoResult,
        salaryResult,
        preResult,
        callsResult,
        complementsResult,
        vacationResult,
      ] = await Promise.all([
        (supabase as any).from('abastecimento_autorizacoes')
          .select('id,funcionario_nome,empresa_nome,placa,combustivel,posto_nome,solicitado_em,autorizado_em,status,autorizado_por_nome')
          .eq('status','autorizado')
          .eq('autorizado_por_nome','Sistema TOPAC')
          .gte('solicitado_em', since)
          .order('autorizado_em',{ascending:false})
          .limit(20),
        (supabase as any).from('contabilidade_folha_ciclos')
          .select('id,empresa_id,competencia,tipo,status,observacao,updated_at,ativo,email_envio_status,email_retorno_status')
          .eq('ativo',true)
          .in('status',['aguardando_apontamento','aguardando_envio','recebido','liberado'])
          .order('updated_at',{ascending:false})
          .limit(30),
        (supabase as any).from('contabilidade_portal_revisoes')
          .select('id,empresa_id,status,observacao,updated_at')
          .in('status',['pendencia','retificacao','aguardando_analise'])
          .order('updated_at',{ascending:false})
          .limit(30),
        (supabase as any).from('epi_solicitacoes')
          .select('id,status,observacoes,criado_por_nome,created_at,updated_at')
          .eq('status','para_aprovacao')
          .order('updated_at',{ascending:false})
          .limit(20),
        (supabase as any).from('aso_agendamentos')
          .select('id,funcionario_nome,empresa,data_exame,status,updated_at')
          .eq('status','pendente')
          .order('updated_at',{ascending:false})
          .limit(30),
        (supabase as any).from('alteracoes_salariais')
          .select('id,funcionario_id,empresa_id,competencia,status,updated_at')
          .in('status',['aguardando_folha','pendente','aguardando_envio'])
          .order('updated_at',{ascending:false})
          .limit(20),
        (supabase as any).from('pre_cadastros_admissionais')
          .select('id,nome,empresa_nome,status,updated_at')
          .neq('status','cadastro_oficial')
          .order('updated_at',{ascending:false})
          .limit(20),
        (supabase as any).from('chamados')
          .select('id,numero,cliente,status,notificacao_pendente,updated_at')
          .eq('notificacao_pendente',true)
          .order('updated_at',{ascending:false})
          .limit(20),
        (supabase as any).from('payroll_documents')
          .select('id,employee_id,company_id,competencia,document_type,net_amount,payment_reason,payment_kind,is_current,extracted_data,updated_at')
          .eq('payment_kind','COMPLEMENTAR')
          .eq('is_current',true)
          .order('updated_at',{ascending:false})
          .limit(40),
        (supabase as any).from('ferias_avisos')
          .select('id,funcionario_id,empresa_id,prazo_pagamento,status,status_pagamento,updated_at')
          .eq('status','marcada')
          .lte('prazo_pagamento',upcomingVacationLimit)
          .order('prazo_pagamento',{ascending:true})
          .limit(20),
      ]);

      const next: PlatformNotification[] = [];

      for (const cycle of cyclesResult.data || []) {
        const typeLabel = cycle.tipo === 'adiantamento' ? 'adiantamento' : 'pagamento';
        const statusLabel = cycle.status === 'aguardando_apontamento'
          ? 'aguardando apontamento'
          : cycle.status === 'aguardando_envio'
            ? 'aguardando envio da Contabilidade'
            : cycle.status === 'recebido'
              ? 'recebido e aguardando conferência'
              : 'liberado para a Contabilidade';
        next.push({
          id:`accounting-cycle:${cycle.id}`,
          source:'Contabilidade',
          title:`${companyName(cycle.empresa_id)} · ${typeLabel}`,
          detail:`${cycle.competencia} · ${statusLabel}${cycle.observacao ? ` · ${cycle.observacao}` : ''}`,
          createdAt:cycle.updated_at,
          path:'/admin/central-contabilidade',
          tone:'attention',
          icon:'accounting',
        });
      }

      for (const review of reviewsResult.data || []) {
        next.push({
          id:`accounting-review:${review.id}`,
          source:'Contabilidade',
          title:`Pendência / retificação · ${companyName(review.empresa_id)}`,
          detail:review.observacao || 'Existe uma revisão da Contabilidade aguardando tratamento.',
          createdAt:review.updated_at,
          path:'/admin/central-contabilidade',
          tone:'attention',
          icon:'accounting',
        });
      }

      for (const epi of epiResult.data || []) {
        next.push({
          id:`epi:${epi.id}`,
          source:'EPI',
          title:'Solicitação de EPI aguardando aprovação',
          detail:epi.observacoes || (epi.criado_por_nome ? `Solicitado por ${epi.criado_por_nome}` : 'Existe uma solicitação pendente de aprovação.'),
          createdAt:epi.updated_at || epi.created_at,
          path:'/admin/epi',
          tone:'attention',
          icon:'epi',
        });
      }

      for (const aso of asoResult.data || []) {
        next.push({
          id:`aso:${aso.id}`,
          source:'ASO',
          title:`${aso.funcionario_nome || 'Funcionário'} · ASO pendente`,
          detail:`${aso.empresa || 'Empresa'}${aso.data_exame ? ` · exame em ${new Date(aso.data_exame + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}`,
          createdAt:aso.updated_at,
          path:'/admin/aso',
          tone:'attention',
          icon:'aso',
        });
      }

      for (const salary of salaryResult.data || []) {
        next.push({
          id:`salary:${salary.id}`,
          source:'Alteração salarial',
          title:`${employeeName(salary.funcionario_id)} · alteração salarial`,
          detail:`${companyName(salary.empresa_id)} · competência ${salary.competencia || 'pendente'} · ${String(salary.status || '').replaceAll('_',' ')}`,
          createdAt:salary.updated_at,
          path:'/admin/central-contabilidade',
          tone:'attention',
          icon:'finance',
        });
      }

      for (const pre of preResult.data || []) {
        next.push({
          id:`admission:${pre.id}`,
          source:'Admissão',
          title:`${pre.nome || 'Candidato'} · pré-cadastro pendente`,
          detail:`${pre.empresa_nome || 'Empresa'} · ${String(pre.status || 'em andamento').replaceAll('_',' ')}`,
          createdAt:pre.updated_at,
          path:'/admin/pre-cadastro-admissional',
          tone:'attention',
          icon:'admission',
        });
      }

      for (const call of callsResult.data || []) {
        next.push({
          id:`call:${call.id}`,
          source:'Operacional',
          title:`Chamado #${call.numero || '—'} requer atenção`,
          detail:`${call.cliente || 'Cliente'} · ${String(call.status || '').replaceAll('_',' ')}`,
          createdAt:call.updated_at,
          path:'/admin/operacional',
          tone:'attention',
          icon:'operation',
        });
      }

      for (const doc of complementsResult.data || []) {
        const financeStatus = String(doc.extracted_data?.financeiro_formalizacao_status || '').toUpperCase();
        if (financeStatus === 'ENVIADO') continue;
        next.push({
          id:`benefit-finance:${doc.id}`,
          source:'Financeiro',
          title:`${employeeName(doc.employee_id)} · diferença de benefício`,
          detail:`${companyName(doc.company_id)} · ${doc.document_type === 'BENEFICIO_VT' ? 'VT' : 'VR'} · ${money(doc.net_amount)} pendente de formalização`,
          createdAt:doc.updated_at,
          path:`/admin/funcionarios/${doc.employee_id}`,
          tone:'attention',
          icon:'finance',
        });
      }

      for (const vacation of vacationResult.data || []) {
        const paymentStatus = String(vacation.status_pagamento || '').toLowerCase();
        if (['pago','paga','concluido','concluida'].includes(paymentStatus)) continue;
        next.push({
          id:`vacation:${vacation.id}`,
          source:'Férias',
          title:`${employeeName(vacation.funcionario_id)} · pagamento de férias`,
          detail:`${companyName(vacation.empresa_id)} · prazo ${vacation.prazo_pagamento ? new Date(vacation.prazo_pagamento + 'T12:00:00').toLocaleDateString('pt-BR') : 'a conferir'}`,
          createdAt:vacation.updated_at,
          path:'/admin/aviso-ferias',
          tone:'attention',
          icon:'finance',
        });
      }

      for (const fuel of fuelResult.data || []) {
        next.push({
          id:`fuel:${fuel.id}`,
          source:'Abastecimento',
          title:`${fuel.funcionario_nome || 'Funcionário'} · abastecimento liberado`,
          detail:`${fuel.placa || 'Sem placa'} · ${fuel.combustivel || 'Combustível'} · ${fuel.posto_nome || 'Posto'}`,
          createdAt:fuel.autorizado_em || fuel.solicitado_em,
          path:'/admin/app-mecanico',
          tone:'success',
          icon:'fuel',
        });
      }

      next.sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setRows(next);
    } finally {
      setLoading(false);
    }
  }, [companyName, employeeName]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    const channel = (supabase as any)
      .channel('admin-platform-notifications')
      .on('postgres_changes',{event:'*',schema:'public',table:'abastecimento_autorizacoes'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'contabilidade_folha_ciclos'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'contabilidade_portal_revisoes'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'epi_solicitacoes'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'aso_agendamentos'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'alteracoes_salariais'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'pre_cadastros_admissionais'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'chamados'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'payroll_documents'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'ferias_avisos'},()=>void load())
      .subscribe();

    return () => {
      window.clearInterval(timer);
      void (supabase as any).removeChannel(channel);
    };
  }, [load]);

  const attention = useMemo(() => rows.filter(row => row.tone === 'attention'), [rows]);
  const recent = useMemo(() => rows.filter(row => row.tone !== 'attention'), [rows]);

  const openNotification = (row:PlatformNotification) => {
    setDrawerOpen(false);
    navigate(row.path);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-zinc-300 transition hover:bg-white/[.04] active:bg-white/[.06]"
        aria-label="Central de notificações"
        title="Central de notificações"
      >
        <Bell className="h-5 w-5" />
        {attention.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#ffb400] px-1 text-[9px] font-black text-black shadow-[0_0_14px_rgba(255,180,0,.35)]">
            {attention.length > 99 ? '99+' : attention.length}
          </span>
        )}
      </button>

      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <section className="fixed inset-x-0 bottom-0 z-[90] max-h-[86vh] animate-in slide-in-from-bottom duration-300 overflow-hidden rounded-t-[28px] border-t border-fuchsia-500/30 bg-[#07070d] shadow-[0_-28px_90px_rgba(0,0,0,.72)] md:left-auto md:right-5 md:top-[68px] md:bottom-auto md:w-[470px] md:max-h-[calc(100vh-88px)] md:rounded-2xl md:border">
            <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-white"><Bell className="h-4 w-4 text-fuchsia-400" /> Central de notificações</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">
                  {loading ? 'Atualizando dados reais...' : `${attention.length} pendência(s) que exigem atenção · ${recent.length} movimentação(ões) recente(s)`}
                </div>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 hover:bg-white/[.05]" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>

            <div className="max-h-[calc(86vh-70px)] overflow-y-auto p-3 md:max-h-[calc(100vh-158px)]">
              {attention.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-[.12em] text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" /> Atenção agora
                  </div>
                  <div className="space-y-2">
                    {attention.map(row => {
                      const Icon = iconFor(row.icon);
                      return (
                        <button key={row.id} type="button" onClick={() => openNotification(row)} className="flex w-full items-center gap-3 rounded-xl border border-white/[.07] bg-[#0a0a11] p-3 text-left transition hover:border-amber-500/25 hover:bg-amber-500/[.04]">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${toneClasses(row.tone)}`}><Icon className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[9px] font-black uppercase tracking-wide text-zinc-600">{row.source}</span>
                            <span className="mt-0.5 block text-xs font-black text-white">{row.title}</span>
                            <span className="mt-1 block text-[10px] leading-relaxed text-zinc-500">{row.detail}</span>
                            <span className="mt-1 block text-[9px] text-zinc-700">{dateTime(row.createdAt)}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-700" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {recent.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-[.12em] text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Movimentações recentes
                  </div>
                  <div className="space-y-2">
                    {recent.map(row => {
                      const Icon = iconFor(row.icon);
                      return (
                        <button key={row.id} type="button" onClick={() => openNotification(row)} className="flex w-full items-center gap-3 rounded-xl border border-white/[.07] bg-[#0a0a11] p-3 text-left transition hover:border-emerald-500/20 hover:bg-emerald-500/[.03]">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${toneClasses(row.tone)}`}><Icon className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[9px] font-black uppercase tracking-wide text-zinc-600">{row.source}</span>
                            <span className="mt-0.5 block text-xs font-black text-white">{row.title}</span>
                            <span className="mt-1 block text-[10px] text-zinc-500">{row.detail}</span>
                            <span className="mt-1 block text-[9px] text-zinc-700">{dateTime(row.createdAt)}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-700" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!loading && rows.length === 0 && (
                <div className="py-12 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                  <div className="mt-3 text-sm font-black text-white">Tudo em dia</div>
                  <div className="mt-1 text-xs text-zinc-600">Não há pendências reais nos módulos monitorados.</div>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-fuchsia-500/15 bg-fuchsia-500/[.04] p-3 text-[10px] leading-relaxed text-zinc-500">
                Esta central lê os estados reais de Contabilidade, benefícios, Financeiro, EPI, ASO, admissões, férias, Operacional e abastecimento. Os itens somem quando o próprio processo é concluído no módulo de origem.
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
