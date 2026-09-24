import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Building2, ChevronDown, ChevronUp, Wallet } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/calculations';

type EmployeeSummary = { id: string; companyId: string; name: string; status: string; salarioBase: number };
type CompanySummary = { id: string; name: string };
type Close = { company_id: string; competencia: string; total_liquido: number | string | null; status: string };
const colors = ['#fbbf24', '#a78bfa', '#22d3ee', '#34d399', '#fb7185'];
const monthPt = (value: string) => {
  const [year, month] = value.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
};
const MONEY = (value: number) => formatCurrency(Number(value) || 0);

const FuncionariosMoneyOverview: React.FC<{
  employees: EmployeeSummary[];
  companies: CompanySummary[];
  filterCompany?: string;
}> = ({ employees, companies, filterCompany }) => {
  const [expanded, setExpanded] = useState(false);
  const [closed, setClosed] = useState<Close[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [detailCompany, setDetailCompany] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await (supabase as any).from('fechamentos_filial')
        .select('company_id,competencia,total_liquido,status')
        .eq('status', 'fechado').order('competencia', { ascending: false }).limit(120);
      if (!alive) return;
      setHistoryError(error?.message || '');
      setClosed((data || []) as Close[]);
      setHistoryLoaded(true);
    };
    void load();
    return () => { alive = false; };
  }, []);

  const visibleCompanies = useMemo(
    () => companies.filter((item) => !filterCompany || item.id === filterCompany),
    [companies, filterCompany],
  );
  const active = useMemo(
    () => employees.filter((emp) => emp.status === 'ativo' && (!filterCompany || emp.companyId === filterCompany)),
    [employees, filterCompany],
  );
  const total = active.reduce((sum, emp) => sum + (Number(emp.salarioBase) || 0), 0);
  const grouped = visibleCompanies.map((company, index) => {
    const members = active.filter((emp) => emp.companyId === company.id);
    return {
      ...company, count: members.length,
      total: members.reduce((sum, emp) => sum + (Number(emp.salarioBase) || 0), 0),
      color: colors[index % colors.length],
    };
  });
  const maxMonth = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(maxMonth.getFullYear(), maxMonth.getMonth() - (5 - index), 1);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0')].join('-');
  });
  const chartRows = months.map((month) => {
    const matches = closed.filter((row) => row.competencia === month &&
      (!filterCompany || row.company_id === filterCompany));
    const values = new Map(matches.map((row) => [row.company_id, Number(row.total_liquido) || 0]));
    const byCompany = grouped.reduce<Record<string, number | null>>((acc, co) => {
      acc[co.id] = values.has(co.id) ? values.get(co.id)! : null;
      return acc;
    }, {});
    return { competencia: monthPt(month), ...byCompany,
      total: matches.length ? matches.reduce((s, row) => s + Number(row.total_liquido || 0), 0) : null };
  });
  const availableMonths = chartRows.filter(row => row.total !== null).length;

  return (
    <section className="space-y-3" aria-label="Resumo financeiro dos funcionários">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-amber-400/50 bg-gradient-to-br from-amber-400/20 via-violet-500/10 to-zinc-950 p-5 shadow-[0_12px_35px_rgba(245,158,11,.10)]">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-300"><Wallet size={17}/> Salários-base atuais</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">{MONEY(total)}</p>
          <p className="mt-1 text-xs text-zinc-300">Soma cadastrada de {active.length} funcionários ativos{filterCompany ? ' na empresa selecionada' : ' nas empresas'}.</p>
        </div>
        <div className="rounded-2xl border border-fuchsia-400/50 bg-gradient-to-br from-fuchsia-500/20 via-indigo-600/10 to-zinc-950 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-fuchsia-300"><Building2 size={17}/> Empresas em consulta</p>
          <p className="mt-3 text-3xl font-black text-white">{grouped.filter(co => co.count).length}</p>
          <p className="mt-1 text-xs text-zinc-300">Valores separados por CNPJ abaixo.</p>
        </div>
        <div className="rounded-2xl border border-cyan-400/50 bg-gradient-to-br from-cyan-400/15 via-blue-600/10 to-zinc-950 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-cyan-300"><Activity size={17}/> Funcionários ativos</p>
          <p className="mt-3 text-3xl font-black text-white">{active.length}</p>
          <p className="mt-1 text-xs text-zinc-300">Base de funcionários, sem desligados.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {grouped.map(co => (
          <div key={co.id} className="rounded-xl border bg-zinc-950/80 p-4" style={{ borderColor: co.color + '80', boxShadow: 'inset 0 1px 0 ' + co.color + '33' }}>
            <p className="truncate text-xs font-semibold" style={{ color: co.color }} title={co.name}>{co.name}</p>
            <p className="mt-2 text-xl font-black text-white">{MONEY(co.total)}</p>
            <p className="mt-1 text-xs text-zinc-300">{co.count} ativo(s) • salário-base</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-amber-300/90">
        Valores acima são a referência nominal dos salários-base atuais; não representam folha líquida, encargos, VR ou VT.
      </p>
      <div className="rounded-2xl border border-violet-400/40 bg-gradient-to-br from-[#201033] via-[#100b20] to-[#06121d] shadow-[0_10px_40px_rgba(126,34,206,.12)]">
        <button type="button" className="flex w-full items-center justify-between gap-3 p-5 text-left"
          onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
          <span><strong className="flex items-center gap-2 text-base text-white"><BarChart3 className="text-fuchsia-300"/> Evolução mês a mês — folha líquida fechada</strong>
            <span className="mt-1 block text-xs text-zinc-300">Somente valores efetivamente registrados em fechamentos; meses sem dados não são inventados.</span></span>
          {expanded ? <ChevronUp className="shrink-0 text-amber-300"/> : <ChevronDown className="shrink-0 text-amber-300"/>}
        </button>
        {expanded && (
          <div className="space-y-3 border-t border-violet-400/20 px-4 pb-5 pt-3">
            <select className="max-w-full rounded-lg border border-fuchsia-500/50 bg-[#1a1230] px-3 py-2 text-sm text-white"
              value={detailCompany} onChange={event => setDetailCompany(event.target.value)}>
              <option value="">Todas as empresas selecionadas</option>
              {grouped.map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
            </select>
            {historyError ? <p className="text-sm text-amber-300">Não foi possível ler os fechamentos: {historyError}</p>
              : !historyLoaded ? <p className="text-sm text-zinc-200">Buscando histórico...</p>
              : availableMonths === 0 ? <p className="text-sm text-amber-200">Ainda não há fechamentos para comparar neste período.</p>
              : <>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows}>
                      <CartesianGrid stroke="#51406a" strokeDasharray="3 3"/>
                      <XAxis dataKey="competencia" stroke="#d4d4d8" tick={{ fontSize: 11 }}/>
                      <YAxis stroke="#d4d4d8" tick={{ fontSize: 10 }} tickFormatter={n => 'R$ ' + (Number(n)/1000).toFixed(0) + ' mil'}/>
                      <Tooltip contentStyle={{ background: '#191126', border: '1px solid #8b5cf6', color: 'white' }}
                        formatter={value => MONEY(Number(value))}/>
                      {detailCompany
                        ? <Bar dataKey={detailCompany} name={grouped.find(co => co.id === detailCompany)?.name || 'Empresa'} fill="#22d3ee" radius={[5,5,0,0]}/>
                        : <Bar dataKey="total" name="Líquido fechado" fill="#e879f9" radius={[5,5,0,0]}/>}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {availableMonths < 2 && <p className="text-sm text-amber-200">Existe apenas um mês com fechamento nesta janela; a comparação aparecerá quando houver outro mês fechado.</p>}
              </>}
          </div>
        )}
      </div>
    </section>
  );
};

export default FuncionariosMoneyOverview;
