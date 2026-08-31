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

        // Quando o período aquisitivo estiver preenchido, ele prevalece como fonte oficial.
        for (const notice of employeeNotices.filter(n => n.periodo_aquisitivo_inicio && n.periodo_aquisitivo_fim)) {
          const target = balances.find(p => p.start === notice.periodo_aquisitivo_inicio && p.end === notice.periodo_aquisitivo_fim);
          if (target) {
            target.used += Math.max(0, Number(notice.dias_ferias || 0));
            target.official = true;
          }
        }

        // Registros antigos sem período aquisitivo são alocados FIFO como estimativa, sem alterar a base.
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
      if (a.status !== b.status) return a.status === 'VENCIDA' ? -1 : 1;
      return a.latestStart.localeCompare(b.latestStart) || a.employeeName.localeCompare(b.employeeName, 'pt-BR');
    });
  }, [employees, companies, notices]);

  const visible = companyFilter ? rows.filter(row => row.companyId === companyFilter) : rows;
  const vencidas = visible.filter(row => row.status === 'VENCIDA').length;
  const criticas = visible.filter(row => row.status === 'A VENCER' && row.critical).length;

  const print = () => {
    if (!visible.length) return;
    const groups = new Map<string, Row[]>();
    visible.forEach(row => groups.set(row.companyName, [...(groups.get(row.companyName) || []), row]));
    const sections = [...groups.entries()].map(([companyName, list]) => `
      <section class="company">
        <div class="head"><div><h1>PROGRAMAÇÃO DE FÉRIAS</h1><h2>${esc(companyName)}</h2></div><div class="summary"><b>${list.filter(r=>r.status==='VENCIDA').length} vencida(s)</b><span>${list.filter(r=>r.status==='A VENCER').length} a vencer</span></div></div>
        <p class="note">Relação para programação do encarregado. “Último início” considera o saldo de dias ainda devido dentro do período concessivo.</p>
        <table><thead><tr><th>Funcionário</th><th>Cargo</th><th>Admissão</th><th>Período aquisitivo</th><th>Saldo</th><th>Período concessivo</th><th>Último início</th><th>Limite legal</th><th>Status</th></tr></thead><tbody>
          ${list.map(row => `<tr class="${row.status==='VENCIDA'?'overdue':row.critical?'critical':''}"><td><b>${esc(row.employeeName)}</b><small>${row.basis==='oficial'?'Base oficial':'Base estimada'}</small></td><td>${esc(row.cargo)}</td><td>${br(row.admission)}</td><td>${br(row.acquisitionStart)} a ${br(row.acquisitionEnd)}</td><td>${row.balanceDays} dias</td><td>${br(row.concessiveStart)} a ${br(row.concessiveEnd)}</td><td><b>${br(row.latestStart)}</b></td><td>${br(row.concessiveEnd)}</td><td><b>${row.status}${row.critical?' — PRAZO CRÍTICO':''}</b></td></tr>`).join('')}
        </tbody></table>
        <div class="sign"><span>Programação do encarregado: __________________________________________</span><span>Data: ____/____/________</span></div>
      </section>`).join('');

    printDocumentInPage(`<!doctype html><html><head><meta charset="utf-8"><title>Programação de Férias</title><style>
      @page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#0f172a;margin:0}.company{page-break-after:always}.company:last-child{page-break-after:auto}.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f2742;padding-bottom:7px;margin-bottom:6px}.head h1{font-size:18px;margin:0;color:#0f2742}.head h2{font-size:13px;margin:3px 0 0}.summary{display:flex;gap:12px;font-size:11px}.summary b{color:#991b1b}.note{font-size:9px;margin:5px 0 8px;color:#475569}table{width:100%;border-collapse:collapse;font-size:8.2px}th{background:#0f2742;color:white;padding:5px 4px;text-align:left}td{border:1px solid #cbd5e1;padding:5px 4px;vertical-align:top}td small{display:block;color:#64748b;margin-top:2px}.overdue td{background:#fee2e2}.critical td{background:#fef3c7}.sign{display:flex;justify-content:space-between;margin-top:14px;font-size:9px}
    </style></head><body>${sections}</body></html>`);
  };

  return <div className="card-premium overflow-hidden">
    <div className="flex flex-col gap-3 border-b bg-muted/30 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarRange className="h-4 w-4 text-primary"/>Relatório consolidado — próximas férias</h2>
        <p className="mt-1 text-xs text-muted-foreground">Lista férias adquiridas ainda com saldo, separando A VENCER e VENCIDAS, com último início e limite legal.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-xs">
          <option value="">Todas as empresas</option>
          {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
        <Button onClick={print} disabled={!visible.length}><Printer className="mr-2 h-4 w-4"/>Imprimir programação</Button>
      </div>
    </div>

    <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
      <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">A vencer</p><p className="text-2xl font-bold">{visible.length - vencidas}</p></div>
      <div className="rounded-xl border border-amber-500/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Prazo crítico</p><p className="text-2xl font-bold text-amber-500">{criticas}</p></div>
      <div className="rounded-xl border border-red-500/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Vencidas</p><p className="text-2xl font-bold text-red-500">{vencidas}</p></div>
    </div>

    {visible.some(row => row.basis === 'estimada') && <div className="mx-4 mt-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"/><div><b>Base provisória:</b> existem férias antigas sem período aquisitivo identificado. Até a conferência dos relatórios oficiais, o sistema aloca esses dias pela ordem dos períodos adquiridos, sem alterar os registros originais.</div></div>}

    <div className="max-h-[430px] overflow-auto p-4">
      <table className="w-full min-w-[1150px] text-xs"><thead className="sticky top-0 bg-background"><tr className="border-b">{['Funcionário','Empresa','Período aquisitivo','Saldo','Período concessivo','Último início','Limite legal','Status'].map(h=><th key={h} className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground">{h}</th>)}</tr></thead><tbody>
        {visible.map(row => <tr key={`${row.employeeId}-${row.acquisitionStart}`} className="border-b"><td className="px-3 py-2"><b>{row.employeeName}</b><div className="text-muted-foreground">{row.cargo}</div></td><td className="px-3 py-2">{row.companyName}</td><td className="px-3 py-2">{br(row.acquisitionStart)} → {br(row.acquisitionEnd)}</td><td className="px-3 py-2 font-bold">{row.balanceDays} dias</td><td className="px-3 py-2">{br(row.concessiveStart)} → {br(row.concessiveEnd)}</td><td className="px-3 py-2 font-bold">{br(row.latestStart)}</td><td className="px-3 py-2">{br(row.concessiveEnd)}</td><td className="px-3 py-2"><Badge variant="outline" className={row.status==='VENCIDA'?'border-red-500/40 text-red-500':row.critical?'border-amber-500/40 text-amber-500':'border-sky-500/40 text-sky-500'}>{row.status}{row.critical?' · CRÍTICO':''}</Badge></td></tr>)}
        {!visible.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhuma férias adquirida com saldo pendente encontrada neste filtro.</td></tr>}
      </tbody></table>
    </div>
  </div>;
};

export default VacationProgrammingReport;
