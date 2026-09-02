import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, Printer } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { printDocumentInPage } from '@/lib/printInPage';

const pad = (n: number) => String(n).padStart(2, '0');
const parse = (value: string) => {
  const [y, m, d] = String(value || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
};
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (value: string, days: number) => { const d = parse(value); d.setDate(d.getDate() + days); return iso(d); };
const addYears = (value: string, years: number) => { const d = parse(value); d.setFullYear(d.getFullYear() + years); return iso(d); };
const diffDays = (a: string, b: string) => Math.floor((parse(b).getTime() - parse(a).getTime()) / 86400000);
const today = () => iso(new Date());
const br = (value: string) => value ? parse(value).toLocaleDateString('pt-BR') : '—';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c] || c));

type VacationNotice = {
  id: string;
  funcionario_id: string | null;
  periodo_aquisitivo_inicio: string | null;
  periodo_aquisitivo_fim: string | null;
  periodo_gozo_inicio: string;
  dias_ferias: number;
  dias_abono: number | null;
  status: string;
};

type Row = {
  companyId: string;
  companyName: string;
  employeeId: string;
  employeeName: string;
  cargo: string;
  acquisitionStart: string;
  acquisitionEnd: string;
  concessiveEnd: string;
  latestStart: string;
  vacationDays: number;
  abonoDays: number;
  balanceDays: number;
  status: 'VENCIDA' | 'A VENCER';
  critical: boolean;
  basis: 'oficial' | 'estimada';
};

type StatusFilter = 'TODAS' | 'VENCIDA' | 'A VENCER';

type PeriodBalance = {
  start: string;
  end: string;
  concessiveEnd: string;
  vacationDays: number;
  abonoDays: number;
  official: boolean;
};

const buildPeriods = (admission: string, maxDate: string) => {
  const periods: PeriodBalance[] = [];
  if (!admission) return periods;
  for (let i = 0; i < 40; i += 1) {
    const start = addYears(admission, i);
    const next = addYears(admission, i + 1);
    const end = addDays(next, -1);
    if (end > maxDate) break;
    periods.push({
      start,
      end,
      concessiveEnd: addDays(addYears(next, 1), -1),
      vacationDays: 0,
      abonoDays: 0,
      official: false,
    });
  }
  return periods;
};

const totalUsed = (period: PeriodBalance) => Math.min(30, Math.max(0, period.vacationDays) + Math.max(0, period.abonoDays));

const applyLegacy = (balances: PeriodBalance[], notice: VacationNotice) => {
  let vacationRemaining = Math.max(0, Number(notice.dias_ferias || 0));
  let abonoRemaining = Math.max(0, Number(notice.dias_abono || 0));
  for (const period of balances) {
    if (vacationRemaining <= 0 && abonoRemaining <= 0) break;
    if (period.end >= notice.periodo_gozo_inicio) continue;
    let room = Math.max(0, 30 - totalUsed(period));
    if (!room) continue;
    const vacationApplied = Math.min(room, vacationRemaining);
    period.vacationDays += vacationApplied;
    vacationRemaining -= vacationApplied;
    room -= vacationApplied;
    const abonoApplied = Math.min(room, abonoRemaining);
    period.abonoDays += abonoApplied;
    abonoRemaining -= abonoApplied;
  }
};

const VacationProgrammingReport: React.FC = () => {
  const { companies, employees } = useApp();
  const [notices, setNotices] = useState<VacationNotice[]>([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODAS');

  useEffect(() => {
    const run = async () => {
      const { data, error } = await (supabase as any)
        .from('ferias_avisos')
        .select('id,funcionario_id,periodo_aquisitivo_inicio,periodo_aquisitivo_fim,periodo_gozo_inicio,dias_ferias,dias_abono,status')
        .order('periodo_gozo_inicio', { ascending: true });
      if (error) console.error('[vacation-programming-report]', error);
      else setNotices((data || []) as VacationNotice[]);
    };
    void run();
  }, []);

  const rows = useMemo<Row[]>(() => {
    const now = today();
    const result: Row[] = [];

    employees
      .filter((employee: any) => employee.status === 'ativo' && employee.categoria === 'operacional' && employee.dataAdmissao)
      .forEach((employee: any) => {
        const company = companies.find(c => c.id === employee.companyId);
        if (!company) return;

        const balances = buildPeriods(employee.dataAdmissao, now);
        if (!balances.length) return;

        const employeeNotices = notices
          .filter(n => n.funcionario_id === employee.id && n.status !== 'cancelado')
          .sort((a, b) => String(a.periodo_gozo_inicio).localeCompare(String(b.periodo_gozo_inicio)));

        for (const notice of employeeNotices.filter(n => n.periodo_aquisitivo_inicio && n.periodo_aquisitivo_fim)) {
          const target = balances.find(p => p.start === notice.periodo_aquisitivo_inicio && p.end === notice.periodo_aquisitivo_fim);
          if (!target) continue;
          target.vacationDays += Math.max(0, Number(notice.dias_ferias || 0));
          target.abonoDays += Math.max(0, Number(notice.dias_abono || 0));
          target.official = true;
        }

        for (const notice of employeeNotices.filter(n => !n.periodo_aquisitivo_inicio || !n.periodo_aquisitivo_fim)) {
          applyLegacy(balances, notice);
        }

        const pending = balances.find(period => totalUsed(period) < 30);
        if (!pending) return;

        const used = totalUsed(pending);
        const balanceDays = Math.max(1, 30 - used);
        const latestStart = addDays(pending.concessiveEnd, -(balanceDays - 1));
        const daysToLimit = diffDays(now, latestStart);
        const overdue = now > latestStart;

        result.push({
          companyId: company.id,
          companyName: company.name,
          employeeId: employee.id,
          employeeName: employee.name,
          cargo: employee.cargo,
          acquisitionStart: pending.start,
          acquisitionEnd: pending.end,
          concessiveEnd: pending.concessiveEnd,
          latestStart,
          vacationDays: Math.min(30, pending.vacationDays),
          abonoDays: Math.min(30, pending.abonoDays),
          balanceDays,
          status: overdue ? 'VENCIDA' : 'A VENCER',
          critical: !overdue && daysToLimit <= 30,
          basis: pending.official ? 'oficial' : 'estimada',
        });
      });

    return result.sort((a, b) =>
      a.companyName.localeCompare(b.companyName, 'pt-BR') ||
      (a.status === b.status ? 0 : a.status === 'VENCIDA' ? -1 : 1) ||
      a.latestStart.localeCompare(b.latestStart) ||
      a.employeeName.localeCompare(b.employeeName, 'pt-BR'));
  }, [employees, companies, notices]);

  const visible = useMemo(() => rows.filter(row => {
    if (companyFilter && row.companyId !== companyFilter) return false;
    if (statusFilter !== 'TODAS' && row.status !== statusFilter) return false;
    return true;
  }), [rows, companyFilter, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    visible.forEach(row => map.set(row.companyName, [...(map.get(row.companyName) || []), row]));
    return [...map.entries()];
  }, [visible]);

  const vencidas = visible.filter(row => row.status === 'VENCIDA').length;
  const aVencer = visible.filter(row => row.status === 'A VENCER').length;
  const criticas = visible.filter(row => row.status === 'A VENCER' && row.critical).length;

  const print = () => {
    if (!visible.length) return;
    const sections = grouped.map(([companyName, list]) => `
      <section class="company">
        <div class="head"><div><h1>RELATÓRIO DE FÉRIAS</h1><h2>${esc(companyName)}</h2></div><div><b>${list.filter(r=>r.status==='VENCIDA').length} vencida(s)</b> · ${list.filter(r=>r.status==='A VENCER').length} a vencer</div></div>
        <table><thead><tr><th>Funcionário</th><th>Situação</th><th>Data limite</th><th>Gozados</th><th>Abono</th><th>Saldo</th><th>Período aquisitivo</th><th>Prazo final</th></tr></thead><tbody>
        ${list.map(row => `<tr class="${row.status==='VENCIDA'?'overdue':row.critical?'critical':''}"><td><b>${esc(row.employeeName)}</b><small>${esc(row.cargo)}</small></td><td><b>${row.status}${row.critical?' — CRÍTICO':''}</b></td><td><b>${br(row.latestStart)}</b></td><td>${row.vacationDays} dias</td><td>${row.abonoDays} dias</td><td><b>${row.balanceDays} dias</b></td><td>${br(row.acquisitionStart)} a ${br(row.acquisitionEnd)}</td><td>${br(row.concessiveEnd)}</td></tr>`).join('')}
        </tbody></table>
      </section>`).join('');

    printDocumentInPage(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Férias</title><style>@page{size:A4 landscape;margin:9mm}body{font-family:Arial;color:#0f172a}.company{page-break-after:always}.company:last-child{page-break-after:auto}.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f2742;padding-bottom:7px;margin-bottom:8px}.head h1{font-size:18px;margin:0}.head h2{font-size:13px;margin:3px 0 0}table{width:100%;border-collapse:collapse;font-size:8.5px}th{background:#0f2742;color:white;padding:6px;text-align:left}td{border:1px solid #cbd5e1;padding:6px}td small{display:block;color:#64748b;margin-top:2px}.overdue td{background:#fee2e2}.critical td{background:#fef3c7}</style></head><body>${sections}</body></html>`);
  };

  return <div className="card-premium overflow-hidden">
    <div className="flex flex-col gap-3 border-b bg-muted/30 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarRange className="h-4 w-4 text-primary"/>Relatório de férias por empresa</h2>
        <p className="mt-1 text-xs text-muted-foreground">Regra: 30 dias do direito = dias gozados + abono + saldo pendente. Sem “em dia” genérico para período já adquirido.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-xs"><option value="">Todas as empresas</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as StatusFilter)} className="rounded-lg border bg-background px-3 py-2 text-xs"><option value="TODAS">Todas as situações</option><option value="VENCIDA">Vencidas</option><option value="A VENCER">A vencer</option></select>
        <Button onClick={print} disabled={!visible.length}><Printer className="mr-2 h-4 w-4"/>Imprimir / Salvar PDF</Button>
      </div>
    </div>

    <div className="grid gap-3 border-b p-4 sm:grid-cols-3"><div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">A vencer</p><p className="text-2xl font-bold">{aVencer}</p></div><div className="rounded-xl border border-amber-500/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Prazo crítico</p><p className="text-2xl font-bold text-amber-500">{criticas}</p></div><div className="rounded-xl border border-red-500/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Vencidas</p><p className="text-2xl font-bold text-red-500">{vencidas}</p></div></div>

    {visible.some(row => row.basis === 'estimada') && <div className="mx-4 mt-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"/><div><b>Base estimada:</b> alguns registros antigos não têm período aquisitivo vinculado; nesses casos os dias são abatidos do período mais antigo em aberto.</div></div>}

    <div className="space-y-5 p-4">{grouped.map(([companyName, list]) => <section key={companyName} className="overflow-hidden rounded-xl border"><div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3"><div><h3 className="font-bold">{companyName}</h3><p className="text-xs text-muted-foreground">{list.length} funcionário(s) com saldo adquirido</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-xs"><thead><tr className="border-b">{['Funcionário','Situação','Data limite','Gozados','Abono','Saldo','Período aquisitivo','Prazo final'].map(h=><th key={h} className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground">{h}</th>)}</tr></thead><tbody>{list.map(row=><tr key={`${row.employeeId}-${row.acquisitionStart}`} className="border-b"><td className="px-3 py-2"><b>{row.employeeName}</b><div className="text-muted-foreground">{row.cargo}</div></td><td className="px-3 py-2"><Badge variant="outline" className={row.status==='VENCIDA'?'border-red-500/40 text-red-500':row.critical?'border-amber-500/40 text-amber-500':'border-sky-500/40 text-sky-500'}>{row.status}{row.critical?' · CRÍTICO':''}</Badge></td><td className="px-3 py-2 font-bold">{br(row.latestStart)}</td><td className="px-3 py-2">{row.vacationDays} dias</td><td className="px-3 py-2">{row.abonoDays} dias</td><td className="px-3 py-2 font-bold">{row.balanceDays} dias</td><td className="px-3 py-2">{br(row.acquisitionStart)} → {br(row.acquisitionEnd)}</td><td className="px-3 py-2">{br(row.concessiveEnd)}</td></tr>)}</tbody></table></div></section>)}</div>
  </div>;
};

export default VacationProgrammingReport;
