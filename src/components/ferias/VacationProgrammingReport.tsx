import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, Database, Printer } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
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
const br = (value?: string | null) => value ? parse(value).toLocaleDateString('pt-BR') : '—';
const fmtDays = (value: number) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c] || c));

type VacationNotice = {
  id: string;
  funcionario_id: string | null;
  periodo_aquisitivo_inicio: string | null;
  periodo_aquisitivo_fim: string | null;
  periodo_gozo_inicio: string;
  periodo_gozo_fim: string | null;
  data_retorno: string | null;
  dias_ferias: number;
  dias_abono: number | null;
  status: string;
};

type OfficialPeriod = {
  id: string;
  company_id: string;
  funcionario_id: string | null;
  funcionario_codigo: string | null;
  funcionario_nome: string;
  data_admissao: string | null;
  periodo_aquisitivo_inicio: string;
  periodo_aquisitivo_fim: string;
  data_limite: string;
  dias_direito: number;
  inicio_previsto: string | null;
  referencia: string;
  fonte_arquivo: string | null;
};

type StatusCode = 'VENCIDA' | 'CRITICA' | 'A_VENCER' | 'EM_AQUISICAO';

type Row = {
  companyId: string;
  companyName: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  admission: string;
  acquisitionStart: string;
  acquisitionEnd: string;
  limitDate: string;
  entitledDays: number;
  status: StatusCode;
  basis: 'oficial' | 'estimada';
  reference: string;
  sourceFile: string;
  scheduledStart: string;
  scheduledEnd: string;
  scheduledDays: number;
};

type StatusFilter = 'TODAS' | StatusCode;

type EstimatedPeriod = {
  start: string;
  end: string;
  limit: string;
  used: number;
};

const statusLabel: Record<StatusCode, string> = {
  VENCIDA: 'VENCIDA',
  CRITICA: 'PRAZO CRÍTICO',
  A_VENCER: 'A VENCER',
  EM_AQUISICAO: 'EM AQUISIÇÃO',
};

const statusOrder: Record<StatusCode, number> = {
  VENCIDA: 0,
  CRITICA: 1,
  A_VENCER: 2,
  EM_AQUISICAO: 3,
};

const classifyOfficial = (end: string, limit: string, now: string): StatusCode => {
  if (end >= now) return 'EM_AQUISICAO';
  if (limit < now) return 'VENCIDA';
  if (diffDays(now, limit) <= 30) return 'CRITICA';
  return 'A_VENCER';
};

const statusClass = (status: StatusCode) => {
  if (status === 'VENCIDA') return 'border-red-500/40 bg-red-500/10 text-red-500';
  if (status === 'CRITICA') return 'border-amber-500/40 bg-amber-500/10 text-amber-500';
  if (status === 'EM_AQUISICAO') return 'border-sky-500/40 bg-sky-500/10 text-sky-500';
  return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500';
};

const buildEstimatedPeriods = (admission: string, maxDate: string): EstimatedPeriod[] => {
  const periods: EstimatedPeriod[] = [];
  if (!admission) return periods;
  for (let i = 0; i < 40; i += 1) {
    const start = addYears(admission, i);
    const next = addYears(admission, i + 1);
    const end = addDays(next, -1);
    if (end > maxDate) break;
    const concessiveEnd = addDays(addYears(next, 1), -1);
    periods.push({ start, end, limit: addDays(concessiveEnd, -31), used: 0 });
  }
  return periods;
};

const applyNoticeToEstimated = (periods: EstimatedPeriod[], notice: VacationNotice) => {
  let remaining = Math.max(0, Number(notice.dias_ferias || 0)) + Math.max(0, Number(notice.dias_abono || 0));
  const exact = periods.find(period =>
    notice.periodo_aquisitivo_inicio && notice.periodo_aquisitivo_fim &&
    period.start === notice.periodo_aquisitivo_inicio && period.end === notice.periodo_aquisitivo_fim,
  );
  if (exact) {
    exact.used = Math.min(30, exact.used + remaining);
    return;
  }
  for (const period of periods) {
    if (remaining <= 0) break;
    if (period.end >= notice.periodo_gozo_inicio) continue;
    const room = Math.max(0, 30 - period.used);
    const applied = Math.min(room, remaining);
    period.used += applied;
    remaining -= applied;
  }
};

const VacationProgrammingReport: React.FC = () => {
  const { companies, employees } = useApp();
  const { isFilial, filialCompanyId } = useFilialFilter();
  const [notices, setNotices] = useState<VacationNotice[]>([]);
  const [officialPeriods, setOfficialPeriods] = useState<OfficialPeriod[]>([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODAS');

  useEffect(() => {
    const run = async () => {
      const [officialResult, noticesResult] = await Promise.all([
        (supabase as any)
          .from('ferias_periodos_oficiais')
          .select('id,company_id,funcionario_id,funcionario_codigo,funcionario_nome,data_admissao,periodo_aquisitivo_inicio,periodo_aquisitivo_fim,data_limite,dias_direito,inicio_previsto,referencia,fonte_arquivo')
          .order('referencia', { ascending: false })
          .order('data_limite', { ascending: true }),
        (supabase as any)
          .from('ferias_avisos')
          .select('id,funcionario_id,periodo_aquisitivo_inicio,periodo_aquisitivo_fim,periodo_gozo_inicio,periodo_gozo_fim,data_retorno,dias_ferias,dias_abono,status')
          .neq('status', 'cancelado')
          .order('periodo_gozo_inicio', { ascending: true }),
      ]);

      if (officialResult.error) console.error('[vacation-official-periods]', officialResult.error);
      else setOfficialPeriods((officialResult.data || []) as OfficialPeriod[]);

      if (noticesResult.error) console.error('[vacation-programming-notices]', noticesResult.error);
      else setNotices((noticesResult.data || []) as VacationNotice[]);
    };
    void run();
  }, []);

  const latestOfficial = useMemo(() => {
    const latestByCompany = new Map<string, string>();
    officialPeriods.forEach(period => {
      const current = latestByCompany.get(period.company_id) || '';
      if (period.referencia > current) latestByCompany.set(period.company_id, period.referencia);
    });
    return officialPeriods.filter(period => period.referencia === latestByCompany.get(period.company_id));
  }, [officialPeriods]);

  const rows = useMemo<Row[]>(() => {
    const now = today();
    const result: Row[] = [];

    const activeEmployees = employees
      .filter((employee: any) => employee.status === 'ativo' && employee.categoria === 'operacional' && employee.dataAdmissao)
      .filter((employee: any) => !isFilial || employee.companyId === filialCompanyId);

    activeEmployees.forEach((employee: any) => {
      const company = companies.find(companyItem => companyItem.id === employee.companyId);
      if (!company) return;

      const employeeNotices = notices
        .filter(notice => notice.funcionario_id === employee.id)
        .sort((a, b) => String(a.periodo_gozo_inicio).localeCompare(String(b.periodo_gozo_inicio)));
      const scheduled = employeeNotices.find(notice => {
        const end = notice.periodo_gozo_fim || notice.data_retorno || notice.periodo_gozo_inicio;
        return end >= now;
      }) || null;

      const official = latestOfficial
        .filter(period => period.funcionario_id === employee.id)
        .sort((a, b) => a.periodo_aquisitivo_inicio.localeCompare(b.periodo_aquisitivo_inicio));

      if (official.length) {
        official.forEach(period => {
          result.push({
            companyId: company.id,
            companyName: company.name,
            employeeId: employee.id,
            employeeName: employee.name,
            employeeCode: period.funcionario_codigo || employee.registro || '',
            admission: period.data_admissao || employee.dataAdmissao,
            acquisitionStart: period.periodo_aquisitivo_inicio,
            acquisitionEnd: period.periodo_aquisitivo_fim,
            limitDate: period.data_limite,
            entitledDays: Number(period.dias_direito || 0),
            status: classifyOfficial(period.periodo_aquisitivo_fim, period.data_limite, now),
            basis: 'oficial',
            reference: period.referencia,
            sourceFile: period.fonte_arquivo || '',
            scheduledStart: scheduled?.periodo_gozo_inicio || '',
            scheduledEnd: scheduled?.periodo_gozo_fim || scheduled?.data_retorno || '',
            scheduledDays: Number(scheduled?.dias_ferias || 0),
          });
        });
        return;
      }

      const estimated = buildEstimatedPeriods(employee.dataAdmissao, now);
      employeeNotices.forEach(notice => applyNoticeToEstimated(estimated, notice));
      const pending = estimated.find(period => period.used < 30);
      if (!pending) return;

      result.push({
        companyId: company.id,
        companyName: company.name,
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.registro || '',
        admission: employee.dataAdmissao,
        acquisitionStart: pending.start,
        acquisitionEnd: pending.end,
        limitDate: pending.limit,
        entitledDays: Math.max(0, 30 - pending.used),
        status: classifyOfficial(pending.end, pending.limit, now),
        basis: 'estimada',
        reference: '',
        sourceFile: '',
        scheduledStart: scheduled?.periodo_gozo_inicio || '',
        scheduledEnd: scheduled?.periodo_gozo_fim || scheduled?.data_retorno || '',
        scheduledDays: Number(scheduled?.dias_ferias || 0),
      });
    });

    return result.sort((a, b) =>
      a.companyName.localeCompare(b.companyName, 'pt-BR') ||
      (statusOrder[a.status] - statusOrder[b.status]) ||
      a.limitDate.localeCompare(b.limitDate) ||
      a.employeeName.localeCompare(b.employeeName, 'pt-BR') ||
      a.acquisitionStart.localeCompare(b.acquisitionStart));
  }, [employees, companies, notices, latestOfficial, isFilial, filialCompanyId]);

  const visible = useMemo(() => rows.filter(row => {
    const effectiveCompany = isFilial ? filialCompanyId || '' : companyFilter;
    if (effectiveCompany && row.companyId !== effectiveCompany) return false;
    if (statusFilter !== 'TODAS' && row.status !== statusFilter) return false;
    return true;
  }), [rows, companyFilter, statusFilter, isFilial, filialCompanyId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    visible.forEach(row => map.set(row.companyName, [...(map.get(row.companyName) || []), row]));
    return [...map.entries()];
  }, [visible]);

  const vencidas = visible.filter(row => row.status === 'VENCIDA').length;
  const criticas = visible.filter(row => row.status === 'CRITICA').length;
  const aVencer = visible.filter(row => row.status === 'A_VENCER').length;
  const emAquisicao = visible.filter(row => row.status === 'EM_AQUISICAO').length;
  const officialCount = visible.filter(row => row.basis === 'oficial').length;
  const estimatedCount = visible.filter(row => row.basis === 'estimada').length;

  const print = () => {
    if (!visible.length) return;
    const sections = grouped.map(([companyName, list]) => {
      const ref = [...new Set(list.filter(row => row.reference).map(row => row.reference))].sort().reverse()[0] || 'estimada';
      return `
      <section class="company">
        <div class="head"><div><h1>CONTROLE DE FÉRIAS</h1><h2>${esc(companyName)}</h2></div><div><b>Base ${esc(ref)}</b><br/>${list.length} período(s)</div></div>
        <table><thead><tr><th>Funcionário</th><th>Situação</th><th>Data limite</th><th>Dias direito</th><th>Período aquisitivo</th><th>Admissão</th><th>Programado</th></tr></thead><tbody>
        ${list.map(row => `<tr class="${row.status === 'VENCIDA' ? 'overdue' : row.status === 'CRITICA' ? 'critical' : row.status === 'EM_AQUISICAO' ? 'forming' : ''}"><td><b>${esc(row.employeeName)}</b><small>Cód. ${esc(row.employeeCode || '—')}</small></td><td><b>${esc(statusLabel[row.status])}</b><small>${row.basis === 'oficial' ? 'Base oficial' : 'Base estimada'}</small></td><td><b>${br(row.limitDate)}</b></td><td><b>${fmtDays(row.entitledDays)} dias</b></td><td>${br(row.acquisitionStart)} a ${br(row.acquisitionEnd)}</td><td>${br(row.admission)}</td><td>${row.scheduledStart ? `${br(row.scheduledStart)} · ${fmtDays(row.scheduledDays)} dias` : '—'}</td></tr>`).join('')}
        </tbody></table>
      </section>`;
    }).join('');

    printDocumentInPage(`<!doctype html><html><head><meta charset="utf-8"><title>Controle de Férias</title><style>@page{size:A4 landscape;margin:9mm}body{font-family:Arial;color:#0f172a}.company{page-break-after:always}.company:last-child{page-break-after:auto}.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f2742;padding-bottom:7px;margin-bottom:8px}.head h1{font-size:18px;margin:0}.head h2{font-size:13px;margin:3px 0 0}.head>div:last-child{text-align:right;font-size:10px}table{width:100%;border-collapse:collapse;font-size:8.5px}th{background:#0f2742;color:white;padding:6px;text-align:left}td{border:1px solid #cbd5e1;padding:6px}td small{display:block;color:#64748b;margin-top:2px}.overdue td{background:#fee2e2}.critical td{background:#fef3c7}.forming td{background:#e0f2fe}</style></head><body>${sections}</body></html>`);
  };

  return (
    <div className="card-premium overflow-hidden">
      <div className="flex flex-col gap-3 border-b bg-muted/30 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarRange className="h-4 w-4 text-primary" />Controle oficial de férias por empresa</h2>
          <p className="mt-1 text-xs text-muted-foreground">A Relação de Escala de Férias passa a ser a fonte oficial de período aquisitivo, data-limite e dias de direito. Férias já lançadas continuam como movimentação/programação.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isFilial && (
            <select value={companyFilter} onChange={event => setCompanyFilter(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-xs">
              <option value="">Todas as empresas</option>
              {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          )}
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className="rounded-lg border bg-background px-3 py-2 text-xs">
            <option value="TODAS">Todas as situações</option>
            <option value="VENCIDA">Vencidas</option>
            <option value="CRITICA">Prazo crítico</option>
            <option value="A_VENCER">A vencer</option>
            <option value="EM_AQUISICAO">Em aquisição</option>
          </select>
          <Button onClick={print} disabled={!visible.length}><Printer className="mr-2 h-4 w-4" />Imprimir / Salvar PDF</Button>
        </div>
      </div>

      <div className="grid gap-3 border-b p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-red-500/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Vencidas</p><p className="text-2xl font-bold text-red-500">{vencidas}</p></div>
        <div className="rounded-xl border border-amber-500/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Prazo crítico · 30 dias</p><p className="text-2xl font-bold text-amber-500">{criticas}</p></div>
        <div className="rounded-xl border border-emerald-500/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">A vencer</p><p className="text-2xl font-bold text-emerald-500">{aVencer}</p></div>
        <div className="rounded-xl border border-sky-500/30 p-3"><p className="text-[10px] uppercase text-muted-foreground">Em aquisição</p><p className="text-2xl font-bold text-sky-500">{emAquisicao}</p></div>
      </div>

      <div className="mx-4 mt-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 p-3 text-xs">
        <Database className="h-4 w-4 text-primary" />
        <strong>{officialCount} período(s) com base oficial</strong>
        {estimatedCount > 0 && <span className="text-amber-600">· {estimatedCount} estimado(s) aguardando relação oficial</span>}
      </div>

      {estimatedCount > 0 && (
        <div className="mx-4 mt-3 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div><b>Base estimada:</b> só é usada para empresa/funcionário ainda sem Relação de Escala importada. Assim que a relação oficial entrar, ela substitui automaticamente a estimativa.</div>
        </div>
      )}

      <div className="space-y-5 p-4">
        {grouped.map(([companyName, list]) => {
          const reference = [...new Set(list.filter(row => row.reference).map(row => row.reference))].sort().reverse()[0] || '';
          return (
            <section key={companyName} className="overflow-hidden rounded-xl border">
              <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
                <div>
                  <h3 className="font-bold">{companyName}</h3>
                  <p className="text-xs text-muted-foreground">{list.length} período(s) · {reference ? `base oficial ${reference.replace('-', '/')}` : 'base estimada'}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-xs">
                  <thead>
                    <tr className="border-b">
                      {['Funcionário','Código','Admissão','Situação','Data limite','Dias de direito','Período aquisitivo','Férias programadas'].map(header => (
                        <th key={header} className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(row => (
                      <tr key={`${row.employeeId}-${row.acquisitionStart}`} className="border-b hover:bg-muted/20">
                        <td className="px-3 py-2"><b>{row.employeeName}</b><div className="text-[10px] text-muted-foreground">{row.basis === 'oficial' ? 'Base oficial' : 'Base estimada'}</div></td>
                        <td className="px-3 py-2 font-semibold">{row.employeeCode || '—'}</td>
                        <td className="px-3 py-2">{br(row.admission)}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className={statusClass(row.status)}>{statusLabel[row.status]}</Badge></td>
                        <td className="px-3 py-2"><b>{br(row.limitDate)}</b></td>
                        <td className="px-3 py-2"><b>{fmtDays(row.entitledDays)} dias</b></td>
                        <td className="px-3 py-2">{br(row.acquisitionStart)} a {br(row.acquisitionEnd)}</td>
                        <td className="px-3 py-2">
                          {row.scheduledStart ? (
                            <div><b>{br(row.scheduledStart)}</b><div className="text-[10px] text-muted-foreground">{fmtDays(row.scheduledDays)} dias{row.scheduledEnd ? ` · até ${br(row.scheduledEnd)}` : ''}</div></div>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {!grouped.length && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum período de férias encontrado para os filtros selecionados.</div>}
      </div>
    </div>
  );
};

export default VacationProgrammingReport;
