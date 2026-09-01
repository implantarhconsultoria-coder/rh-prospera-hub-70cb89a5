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
  company_id: string | null;
  periodo_aquisitivo_inicio: string | null;
  periodo_aquisitivo_fim: string | null;
  periodo_gozo_inicio: string;
  dias_ferias: number;
  status: string;
};

type Row = {
  companyId: string;
  companyName: string;
  employeeId: string;
  employeeName: string;
  cargo: string;
  admission: string;
  acquisitionStart: string;
  acquisitionEnd: string;
  concessiveStart: string;
  concessiveEnd: string;
  latestStart: string;
  balanceDays: number;
  status: 'VENCIDA' | 'A VENCER';
  critical: boolean;
  daysToLatestStart: number;
  basis: 'oficial' | 'estimada';
};

type StatusFilter = 'TODAS' | 'VENCIDA' | 'A VENCER';

const buildPeriods = (admission: string, maxDate: string) => {
  if (!admission) return [] as Array<{ start:string; end:string; concessiveStart:string; concessiveEnd:string }>;
  const periods: Array<{ start:string; end:string; concessiveStart:string; concessiveEnd:string }> = [];
  for (let i = 0; i < 40; i += 1) {
    const start = addYears(admission, i);
    const next = addYears(admission, i + 1);
    const end = addDays(next, -1);
    if (end > maxDate) break;
    const concessiveStart = next;
    const concessiveEnd = addDays(addYears(next, 1), -1);
    periods.push({ start, end, concessiveStart, concessiveEnd });
  }
  return periods;
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
        .select('id,funcionario_id,company_id,periodo_aquisitivo_inicio,periodo_aquisitivo_fim,periodo_gozo_inicio,dias_ferias,status')
        .order('periodo_gozo_inicio', { ascending: true });
      if (!error) setNotices((data || []) as VacationNotice[]);
      else console.error('[vacation-programming-report]', error);
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
        const employeeNotices = notices
          .filter(n => n.funcionario_id === employee.id && n.status !== 'cancelado')
          .sort((a, b) => String(a.periodo_gozo_inicio).localeCompare(String(b.periodo_gozo_inicio)));
        const periods = buildPeriods(employee.dataAdmissao, now);
        if (!periods.length) return;

        const balances = periods.map(period => ({ ...period, used: 0, official: false }));

        for (const notice of employeeNotices.filter(n => n.periodo_aquisitivo_inicio && n.periodo_aquisitivo_fim)) {
          const target = balances.find(p => p.start === notice.periodo_aquisitivo_inicio && p.end === notice.periodo_aquisitivo_fim);
          if (target) {
            target.used += Math.max(0, Number(notice.dias_ferias || 0));
            target.official = true;
          }
        }

        for (const notice of employeeNotices.filter(n => !n.periodo_aquisitivo_inicio || !n.periodo_aquisitivo_fim)) {
          let remaining = Math.max(0, Number(notice.dias_ferias || 0));
          for (const period of balances) {
            if (remaining <= 0) break;
            if (period.end >= notice.periodo_gozo_inicio) continue;
            const room = Math.max(0, 30 - period.used);
            if (!room) continue;
            const applied = Math.min(room, remaining);
            period.used += applied;
            remaining -= applied;
          }
        }

        const pending = balances.find(period => period.used < 30);
        if (!pending) return;
        const balanceDays = Math.max(1, 30 - pending.used);
        const latestStart = addDays(pending.concessiveEnd, -(balanceDays - 1));
        const overdue = now > pending.concessiveEnd;
        const daysToLatestStart = diffDays(now, latestStart);

        result.push({
          companyId: company.id,
          companyName: company.name,
          employeeId: employee.id,
          employeeName: employee.name,
          cargo: employee.cargo,
          admission: employee.dataAdmissao,
          acquisitionStart: pending.start,
          acquisitionEnd: pending.end,
          concessiveStart: pending.concessiveStart,
          concessiveEnd: pending.concessiveEnd,
          latestStart,
          balanceDays,
          status: overdue ? 'VENCIDA' : 'A VENCER',
          critical: !overdue && daysToLatestStart <= 30,
          daysToLatestStart,
          basis: pending.official ? 'oficial' : 'estimada',
        });
      });

    return result.sort((a, b) => {
      const byCompany = a.companyName.localeCompare(b.companyName, 'pt-BR');
      if (byCompany) return byCompany;
      if (a.status !== b.status) return a.status === 'VENCIDA' ? -1 : 1;
      return a.latestStart.localeCompare(b.latestStart) || a.employeeName.localeCompare(b.employeeName, 'pt-BR');
    });
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
  const criticas = visible.filter(row => row.status === 'A VENCER' && row.critical).length;
  const aVencer = visible.filter(row => row.status === 'A VENCER').length;

  const print = () => {
    if (!visible.length) return;
    const sections = grouped.map(([companyName, list]) => `
      <section class="company">
        <div class="head">
          <div><h1>RELATÓRIO DE FÉRIAS</h1><h2>${esc(companyName)}</h2></div>
          <div class="summary"><b>${list.filter(r=>r.status==='VENCIDA').length} vencida(s)</b><span>${list.filter(r=>r.status==='A VENCER').length} a vencer</span></div>
        </div>
        <p class="note">Controle interno por empresa. A data limite para início considera o saldo de dias ainda devido para que as férias terminem dentro do período concessivo.</p>
        <table>
          <thead><tr><th>Funcionário</th><th>Cargo</th><th>Situação</th><th>Data limite para início</th><th>Prazo legal final</th><th>Saldo</th><th>Período aquisitivo</th></tr></thead>
          <tbody>
            ${list.map(row => `<tr class="${row.status==='VENCIDA'?'overdue':row.critical?'critical':''}">
              <td><b>${esc(row.employeeName)}</b><small>${row.basis==='oficial'?'Base oficial':'Base estimada'}</small></td>
              <td>${esc(row.cargo)}</td>
              <td><b>${row.status}${row.critical?' — PRAZO CRÍTICO':''}</b></td>
              <td><b>${br(row.latestStart)}</b></td>
              <td>${br(row.concessiveEnd)}</td>
              <td>${row.balanceDays} dias</td>
              <td>${br(row.acquisitionStart)} a ${br(row.acquisitionEnd)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="sign"><span>Responsável: __________________________________________</span><span>Data: ____/____/________</span></div>
      </section>`).join('');

    printDocumentInPage(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Férias por Empresa</title><style>
      @page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#0f172a;margin:0}.company{page-break-after:always}.company:last-child{page-break-after:auto}.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f2742;padding-bottom:7px;margin-bottom:6px}.head h1{font-size:18px;margin:0;color:#0f2742}.head h2{font-size:13px;margin:3px 0 0}.summary{display:flex;gap:12px;font-size:11px}.summary b{color:#991b1b}.note{font-size:9px;margin:5px 0 8px;color:#475569}table{width:100%;border-collapse:collapse;font-size:8.5px}th{background:#0f2742;color:white;padding:6px 4px;text-align:left}td{border:1px solid #cbd5e1;padding:6px 4px;vertical-align:top}td small{display:block;color:#64748b;margin-top:2px}.overdue td{background:#fee2e2}.critical td{background:#fef3c7}.sign{display:flex;justify-content:space-between;margin-top:14px;font-size:9px}
    </style></head><body>${sections}</body></html>`);
  };

  return <div className="card-premium overflow-hidden">
    <div className="flex flex-col gap-3 border-b bg-muted/30 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarRange className="h-4 w-4 text-primary"/>Relatório de férias por empresa</h2>
        <p className="mt-1 text-xs text-muted-foreground">Nomes, situação das férias e data limite para programação, agrupados por empresa.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-xs">
          <option value="">Todas as empresas</option>
          {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as StatusFilter)} className="rounded-lg border bg-background px-3 py-2 text-xs">
          <option value="TODAS">Todas as situações</option>
          <option value="VENCIDA">Somente vencidas</option>
          <option value="A VENCER">Somente a vencer</option>
        </select>
        <Button onClick={print} disabled={!visible.length}><Printer className="mr-2 h-4 w-4"/>Imprimir / Salvar PDF</Button>
      </div>
    </div>

    <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
      <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">A vencer</p><p className="text-2xl font-bold">{aVencer}</p></div>
      <div className="rounded-xl border border-amber-500/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Prazo crítico · até 30 dias</p><p className="text-2xl font-bold text-amber-500">{criticas}</p></div>
      <div className="rounded-xl border border-red-500/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Vencidas</p><p className="text-2xl font-bold text-red-500">{vencidas}</p></div>
    </div>

    {visible.some(row => row.basis === 'estimada') && <div className="mx-4 mt-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"/><div><b>Base provisória:</b> existem férias antigas sem período aquisitivo identificado. O sistema usa a ordem dos períodos adquiridos apenas para estimativa, sem alterar o histórico original.</div></div>}

    <div className="space-y-5 p-4">
      {grouped.map(([companyName, list]) => {
        const companyVencidas = list.filter(row => row.status === 'VENCIDA').length;
        const companyAVencer = list.filter(row => row.status === 'A VENCER').length;
        return <section key={companyName} className="overflow-hidden rounded-xl border">
          <div className="flex flex-col gap-2 border-b bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="font-bold">{companyName}</h3><p className="text-xs text-muted-foreground">{list.length} funcionário(s) com saldo de férias adquirido</p></div>
            <div className="flex gap-2 text-xs"><Badge variant="outline" className="border-red-500/40 text-red-500">{companyVencidas} vencida(s)</Badge><Badge variant="outline" className="border-sky-500/40 text-sky-500">{companyAVencer} a vencer</Badge></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead><tr className="border-b bg-background">{['Funcionário','Situação','Data limite para início','Prazo legal final','Saldo','Período aquisitivo'].map(h=><th key={h} className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground">{h}</th>)}</tr></thead>
              <tbody>{list.map(row => <tr key={`${row.employeeId}-${row.acquisitionStart}`} className={row.status === 'VENCIDA' ? 'border-b bg-red-500/5' : row.critical ? 'border-b bg-amber-500/5' : 'border-b'}>
                <td className="px-3 py-3"><b>{row.employeeName}</b><div className="text-muted-foreground">{row.cargo}</div></td>
                <td className="px-3 py-3"><Badge variant="outline" className={row.status==='VENCIDA'?'border-red-500/40 text-red-500':row.critical?'border-amber-500/40 text-amber-500':'border-sky-500/40 text-sky-500'}>{row.status}{row.critical?' · CRÍTICO':''}</Badge></td>
                <td className="px-3 py-3 text-sm font-bold">{br(row.latestStart)}</td>
                <td className="px-3 py-3">{br(row.concessiveEnd)}</td>
                <td className="px-3 py-3 font-bold">{row.balanceDays} dias</td>
                <td className="px-3 py-3">{br(row.acquisitionStart)} → {br(row.acquisitionEnd)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>;
      })}
      {!visible.length && <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma férias adquirida com saldo pendente encontrada neste filtro.</div>}
    </div>
  </div>;
};

export default VacationProgrammingReport;
