import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, ChevronRight, FileCheck2, FileText, Fuel, Users, Wrench,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';

type MobileCounts = {
  documents: number;
  signatures: number;
  holerites: number;
  holeritesSigned: number;
  pendingFuel: number;
};

const initialCounts: MobileCounts = {
  documents: 0,
  signatures: 0,
  holerites: 0,
  holeritesSigned: 0,
  pendingFuel: 0,
};

const br = (value: number) => new Intl.NumberFormat('pt-BR').format(value || 0);

export default function AdminMobileDashboard() {
  const navigate = useNavigate();
  const { companies, employees } = useApp();
  const [counts, setCounts] = useState<MobileCounts>(initialCounts);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const competencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dbFrom = (table: string) => (supabase.from as any)(table);

  const load = useCallback(async () => {
    const countRows = async (table: string, mutate?: (query: any) => any) => {
      let query = dbFrom(table).select('*', { count: 'exact', head: true });
      if (mutate) query = mutate(query);
      const { count, error } = await query;
      if (error) return 0;
      return Number(count || 0);
    };

    const [documents, signatures, holerites, holeritesSigned, pendingFuel] = await Promise.all([
      countRows('payroll_documents', q => q.eq('is_current', true)),
      countRows('payroll_signatures'),
      countRows('payroll_documents', q => q.eq('is_current', true).eq('competencia', competencia).eq('document_type', 'HOLERITE')),
      countRows('payroll_signatures', q => q.eq('competencia', competencia).eq('document_type', 'HOLERITE')),
      countRows('abastecimento_autorizacoes', q => q.eq('status', 'pendente')),
    ]);

    setCounts({ documents, signatures, holerites, holeritesSigned, pendingFuel });
    setLoading(false);
  }, [competencia]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const totalFuncionarios = useMemo(
    () => employees.filter(employee => employee.status === 'ativo' && employee.categoria === 'operacional').length,
    [employees],
  );

  const signed = Math.min(counts.documents, counts.signatures);
  const pending = Math.max(0, counts.documents - signed);
  const signaturePct = counts.documents > 0 ? Math.round((signed / counts.documents) * 100) : 0;
  const holeritesPending = Math.max(0, counts.holerites - counts.holeritesSigned);

  const cards = [
    {
      label: 'FUNCIONÁRIOS ATIVOS',
      value: br(totalFuncionarios),
      detail: 'Abrir cadastro e informações',
      path: '/admin/funcionarios',
      icon: Users,
    },
    {
      label: 'HOLERITES PENDENTES',
      value: br(holeritesPending),
      detail: `Referência ${competencia.split('-').reverse().join('/')}`,
      path: '/admin/folha-pagamento',
      icon: FileText,
    },
    {
      label: 'SOLICITAÇÕES PENDENTES',
      value: br(counts.pendingFuel),
      detail: counts.pendingFuel ? 'Toque para liberar agora' : 'Nenhuma aguardando',
      path: '/admin/app-mecanico',
      icon: Fuel,
      alert: counts.pendingFuel > 0,
    },
    {
      label: 'EMPRESAS ATIVAS',
      value: br(companies.length),
      detail: 'Abrir empresas e filiais',
      path: '/admin/empresas',
      icon: Building2,
    },
  ];

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => navigate('/admin/folha-pagamento')}
        className="w-full overflow-hidden rounded-2xl border border-fuchsia-500/25 bg-[#080810] text-left shadow-[0_14px_40px_rgba(0,0,0,.24)] active:scale-[.99] transition"
      >
        <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-400">
              <FileCheck2 className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[.08em] text-white">Assinatura Digital</div>
              <div className="text-[10px] text-zinc-500">Visão geral dos documentos</div>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-zinc-600" />
        </div>

        <div className="grid grid-cols-2 divide-x divide-white/[.06]">
          <div className="px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Assinados</div>
            <div className="mt-1 text-3xl font-black leading-none text-[#ffb400]">{loading ? '—' : br(signed)}</div>
            <div className="mt-2 text-[10px] text-emerald-400">{signaturePct}% concluído</div>
          </div>
          <div className="px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Pendentes</div>
            <div className="mt-1 text-3xl font-black leading-none text-[#ffb400]">{loading ? '—' : br(pending)}</div>
            <div className="mt-2 text-[10px] text-fuchsia-400">Toque para conferir</div>
          </div>
        </div>

        <div className="mx-4 mb-4 h-2 overflow-hidden rounded-full bg-white/[.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-500 to-[#ffb400] transition-all duration-500"
            style={{ width: `${signaturePct}%` }}
          />
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3">
        {cards.map(card => (
          <button
            key={card.label}
            type="button"
            onClick={() => navigate(card.path)}
            className={`relative min-h-[132px] overflow-hidden rounded-2xl border p-4 text-left transition active:scale-[.98] ${
              card.alert
                ? 'border-amber-400/40 bg-[linear-gradient(145deg,rgba(245,158,11,.11),rgba(10,8,14,.96))] shadow-[0_0_28px_rgba(245,158,11,.08)]'
                : 'border-fuchsia-500/20 bg-[linear-gradient(145deg,rgba(168,85,247,.07),rgba(6,6,12,.98))]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className={`grid h-10 w-10 place-items-center rounded-xl border ${card.alert ? 'border-amber-400/30 bg-amber-400/10 text-amber-400' : 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-400'}`}>
                <card.icon className="h-5 w-5" />
              </span>
              <ChevronRight className="h-4 w-4 text-zinc-700" />
            </div>
            <div className="mt-3 text-[10px] font-bold uppercase tracking-[.06em] text-zinc-500">{card.label}</div>
            <div className="mt-1 text-[28px] font-black leading-none text-[#ffb400]">{loading ? '—' : card.value}</div>
            <div className={`mt-2 text-[9px] leading-tight ${card.alert ? 'text-amber-300' : 'text-zinc-600'}`}>{card.detail}</div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate('/admin/app-mecanico')}
        className="flex w-full items-center gap-3 rounded-2xl border border-fuchsia-500/20 bg-[#080810] p-4 text-left transition active:scale-[.99]"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-400"><Wrench className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-white">Central do App Mecânico</span>
          <span className="mt-0.5 block text-[10px] text-zinc-500">Ponto, abastecimento, KM, liberações e fechamento.</span>
        </span>
        <ChevronRight className="h-5 w-5 text-zinc-600" />
      </button>
    </div>
  );
}
