import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, Building2, CalendarDays, Car, ChevronRight, ClipboardCheck, FileText,
  Fuel, HardHat, Package, ReceiptText, Stethoscope, Users, WalletCards, Wrench,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';

type MobileCounts = {
  documents: number;
  signatures: number;
  holerites: number;
  holeritesSigned: number;
  pendingFuel: number;
  vacationsThisMonth: number;
};

const initialCounts: MobileCounts = {
  documents: 0,
  signatures: 0,
  holerites: 0,
  holeritesSigned: 0,
  pendingFuel: 0,
  vacationsThisMonth: 0,
};

const br = (value: number) => new Intl.NumberFormat('pt-BR').format(value || 0);
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const companyAccent = (name: string) => {
  const n = normalize(name);
  if (n.includes('praia')) return 'text-sky-400 border-sky-500/25 bg-sky-500/[.06]';
  if (n.includes('goian')) return 'text-cyan-300 border-cyan-400/25 bg-cyan-400/[.06]';
  if (n.includes('alqui')) return 'text-orange-300 border-orange-400/25 bg-orange-400/[.06]';
  if (n.includes('lmt')) return 'text-pink-400 border-pink-500/25 bg-pink-500/[.06]';
  return 'text-fuchsia-300 border-fuchsia-500/25 bg-fuchsia-500/[.06]';
};

export default function AdminMobileDashboard({ onSearch }: { onSearch?: () => void }) {
  const navigate = useNavigate();
  const { companies, employees, session } = useApp();
  const [counts, setCounts] = useState<MobileCounts>(initialCounts);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const competencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthStart = `${competencia}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
  const dbFrom = (table: string) => (supabase.from as any)(table);

  const load = useCallback(async () => {
    const countRows = async (table: string, mutate?: (query: any) => any) => {
      let query = dbFrom(table).select('*', { count: 'exact', head: true });
      if (mutate) query = mutate(query);
      const { count, error } = await query;
      if (error) return 0;
      return Number(count || 0);
    };

    const [documents, signatures, holerites, holeritesSigned, pendingFuel, vacationsThisMonth] = await Promise.all([
      countRows('payroll_documents', q => q.eq('is_current', true)),
      countRows('payroll_signatures'),
      countRows('payroll_documents', q => q.eq('is_current', true).eq('competencia', competencia).eq('document_type', 'HOLERITE')),
      countRows('payroll_signatures', q => q.eq('competencia', competencia).eq('document_type', 'HOLERITE')),
      countRows('abastecimento_autorizacoes', q => q.eq('status', 'pendente')),
      countRows('ferias_avisos', q => q.gte('periodo_gozo_inicio', monthStart).lt('periodo_gozo_inicio', nextMonthKey)),
    ]);

    setCounts({ documents, signatures, holerites, holeritesSigned, pendingFuel, vacationsThisMonth });
    setLoading(false);
  }, [competencia, monthStart, nextMonthKey]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const activeEmployees = useMemo(() => employees.filter(employee => employee.status === 'ativo'), [employees]);
  const totalFuncionarios = activeEmployees.length;
  const signed = Math.min(counts.documents, counts.signatures);
  const pending = Math.max(0, counts.documents - signed);
  const signaturePct = counts.documents > 0 ? Math.round((signed / counts.documents) * 100) : 0;

  const displayName = String(
    session?.user?.user_metadata?.nome_completo
      || session?.user?.user_metadata?.full_name
      || session?.user?.user_metadata?.name
      || session?.user?.email?.split('@')[0]
      || 'Rodrigo',
  ).trim();
  const firstName = displayName.split(/\s+/)[0] || displayName;

  const companyCards = useMemo(() => companies.map(company => {
    const total = activeEmployees.filter(employee => employee.companyId === company.id).length;
    return { ...company, total };
  }), [companies, activeEmployees]);

  const summary = [
    { label: 'Funcionários', value: totalFuncionarios, icon: Users, accent: 'text-fuchsia-300', detail: 'ativos' },
    { label: 'Pendências', value: pending + counts.pendingFuel, icon: ClipboardCheck, accent: 'text-pink-400', detail: 'para conferir' },
    { label: 'Férias (mês)', value: counts.vacationsThisMonth, icon: CalendarDays, accent: 'text-violet-300', detail: 'programadas' },
    { label: 'Assinaturas', value: `${signaturePct}%`, icon: ReceiptText, accent: 'text-blue-400', detail: 'concluídas' },
  ];

  const accesses = [
    { label: 'Funcionários', icon: Users, path: '/admin/funcionarios', accent: 'text-fuchsia-300' },
    { label: 'Fechamento', icon: ClipboardCheck, path: '/admin/fechamento', accent: 'text-fuchsia-300' },
    { label: 'Ponto', icon: BarChart3, path: '/admin/fechamento-ponto', accent: 'text-fuchsia-300' },
    { label: 'VR / VT', icon: WalletCards, path: '/admin/relatorio-vr', accent: 'text-blue-400' },
    { label: 'Holerites', icon: FileText, path: '/admin/folha-pagamento', accent: 'text-fuchsia-300' },
    { label: 'Férias', icon: CalendarDays, path: '/admin/aviso-ferias', accent: 'text-fuchsia-300' },
    { label: 'EPI', icon: HardHat, path: '/admin/epi', accent: 'text-orange-300' },
    { label: 'Almoxarifado', icon: Package, path: '/admin/almoxarifado', accent: 'text-fuchsia-300' },
    { label: 'Frota', icon: Car, path: '/admin/documentos-ativos', accent: 'text-violet-300' },
    { label: 'Abastecimento', icon: Fuel, path: '/admin/abastecimento-qrcode', accent: 'text-fuchsia-300' },
    { label: 'Operacional', icon: Wrench, path: '/admin/operacional', accent: 'text-sky-400' },
    { label: 'Relatórios', icon: BarChart3, path: '/admin/relatorio', accent: 'text-fuchsia-300' },
    { label: 'ASO', icon: Stethoscope, path: '/admin/aso', accent: 'text-emerald-300' },
    { label: 'App Mecânicos', icon: Wrench, path: '/admin/app-mecanico', accent: 'text-fuchsia-300' },
  ];

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-3 pt-[calc(18px+env(safe-area-inset-top))] text-white">
      <section className="pr-36">
        <div className="text-[28px] font-black tracking-[-.03em] leading-none">Bom dia, <span className="text-fuchsia-400">{firstName}</span></div>
        <div className="mt-2 text-[12px] font-semibold tracking-[.12em] text-zinc-400">TOPAC RH PRO</div>
        <div className="mt-1 text-[12px] text-zinc-600">Pessoas, processos e resultados em um só lugar.</div>
      </section>

      <button
        type="button"
        onClick={() => navigate('/admin/relatorio')}
        className="relative w-full overflow-hidden rounded-[22px] border border-fuchsia-500/30 bg-[radial-gradient(circle_at_92%_10%,rgba(84,54,255,.38),transparent_30%),linear-gradient(120deg,#120719,#090510_62%,#0c0617)] p-5 text-left shadow-[0_22px_55px_rgba(0,0,0,.38),0_0_35px_rgba(168,85,247,.09)] active:scale-[.99]"
      >
        <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full border border-violet-500/20 shadow-[0_0_70px_rgba(124,58,237,.32)]" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-black tracking-[.25em] text-fuchsia-300">TOPAC</div>
            <div className="mt-1 text-2xl font-black tracking-tight">RH PRO</div>
            <div className="mt-3 text-[10px] font-semibold uppercase tracking-[.22em] text-zinc-500">Pessoas • Processos • Resultados</div>
          </div>
          <div className="max-w-[47%] border-l border-fuchsia-500/25 pl-4">
            <div className="text-[15px] font-black leading-tight">Gestão de pessoas que move o seu negócio.</div>
            <div className="mt-2 text-[11px] leading-4 text-zinc-500">Mais controle. Mais agilidade. Mais resultado.</div>
          </div>
        </div>
      </button>

      <section className="rounded-[22px] border border-fuchsia-500/20 bg-[#0a0611]/88 p-3 shadow-[0_14px_35px_rgba(0,0,0,.30)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[.04em]"><BarChart3 className="h-4 w-4 text-fuchsia-400" />Resumo Geral</div>
          <div className="text-[10px] text-zinc-600">Dados de hoje</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {summary.map(card => (
            <div key={card.label} className="rounded-2xl border border-white/[.08] bg-[linear-gradient(145deg,rgba(255,255,255,.035),rgba(6,3,10,.96))] p-3">
              <card.icon className={`h-5 w-5 ${card.accent}`} />
              <div className="mt-2 text-[10px] text-zinc-500">{card.label}</div>
              <div className="mt-1 text-2xl font-black leading-none text-white">{loading ? '—' : typeof card.value === 'number' ? br(card.value) : card.value}</div>
              <div className="mt-2 text-[9px] text-zinc-600">{card.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[22px] border border-fuchsia-500/20 bg-[#0a0611]/88 p-3 shadow-[0_14px_35px_rgba(0,0,0,.28)]">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[.04em]"><Building2 className="h-4 w-4 text-fuchsia-400" />Totais por Empresa</div>
          <button onClick={() => navigate('/admin/empresas')} className="text-[10px] font-semibold text-fuchsia-400">Ver todas</button>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {companyCards.map(company => (
            <button
              key={company.id}
              type="button"
              onClick={() => navigate(`/admin/empresas?empresa=${company.id}`)}
              className={`min-w-[138px] rounded-2xl border p-3 text-left active:scale-[.98] ${companyAccent(company.name)}`}
            >
              <Building2 className="h-5 w-5" />
              <div className="mt-2 line-clamp-2 min-h-[32px] text-[11px] font-bold leading-4 text-zinc-200">{company.name}</div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div><div className="text-2xl font-black leading-none text-white">{br(company.total)}</div><div className="mt-1 text-[9px] text-zinc-600">funcionários</div></div>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[22px] border border-fuchsia-500/20 bg-[#0a0611]/88 p-3 shadow-[0_14px_35px_rgba(0,0,0,.28)]">
        <div className="mb-3 flex items-center gap-2 px-1 text-sm font-black uppercase tracking-[.04em]"><Package className="h-4 w-4 text-fuchsia-400" />Principais Acessos</div>
        <div className="grid grid-cols-2 gap-2">
          {accesses.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => navigate(item.path)}
              className="group min-h-[92px] rounded-2xl border border-white/[.08] bg-[linear-gradient(145deg,rgba(255,255,255,.032),rgba(6,3,10,.98))] p-3 text-left transition active:scale-[.98] active:border-fuchsia-500/35"
            >
              <div className="flex items-start justify-between gap-2">
                <item.icon className={`h-6 w-6 ${item.accent} drop-shadow-[0_0_8px_rgba(232,121,249,.18)]`} />
                <ChevronRight className="h-4 w-4 text-zinc-700 transition group-active:text-fuchsia-400" />
              </div>
              <div className="mt-4 text-[12px] font-bold text-zinc-100">{item.label}</div>
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={onSearch}
        className="w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/[.055] px-4 py-3 text-center text-xs font-bold text-fuchsia-200 active:scale-[.99]"
      >
        Procurar outro módulo ou funcionário
      </button>
    </div>
  );
}
