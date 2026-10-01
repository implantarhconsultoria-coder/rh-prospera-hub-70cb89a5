import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { calcPayrollBreakdown, formatCurrency, getComissaoPercentual, getHoraExtraSemanalPercentual } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import type { Employee, MonthlyEntry } from '@/types/database';
import { employeeHasInsalubridade } from '@/lib/employeeRoleRules';
import { buildTopacRhPdfFileName, printDocumentAsPdf } from '@/lib/savePdf';
import { horasLegiveis } from '@/lib/apontamentoInteligente';
import { supabase } from '@/integrations/supabase/client';

const ALL_COMPANIES = 'todas';
const money = (value: unknown) => formatCurrency(Number(value) || 0);
const hours = (value: unknown) => horasLegiveis(Number(value) || 0);

type AtestadoResumo = Record<string, number>;

const defaultEntry = (emp: Employee, competencia: string, diasUteis: number): MonthlyEntry => ({
  employeeId: emp.id,
  companyId: emp.companyId,
  competencia,
  faltasDias: 0,
  atrasos: 0,
  he50: 0,
  he60: 0,
  he100: 0,
  adicionais: 0,
  descontosDiversos: 0,
  adiantamento: Math.round((Number(emp.salarioBase) || 0) * 0.4 * 100) / 100,
  vrAplicado: true,
  vrDias: diasUteis,
  vaAplicado: false,
  vtAplicado: emp.vtAtivo,
  vtDesconto: 0,
  comissaoBase: 0,
  insalubridadeAplicada: employeeHasInsalubridade(emp),
  statusConferencia: 'pendente',
  observacoes: '',
});

const competenciaLabelFrom = (competencia: string) => {
  const [y, m] = competencia.split('-');
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[Number(m) - 1] || competencia}/${y || ''}`;
};

const pluralDias = (value: number) => `${value.toLocaleString('pt-BR')} ${value === 1 ? 'dia' : 'dias'}`;

const observacaoLinha = ({
  faltas,
  atestados,
  he50,
  he60,
  he100,
  comissaoPct,
}: {
  faltas: number;
  atestados: number;
  he50: number;
  he60: number;
  he100: number;
  comissaoPct: number;
}) => {
  const partes: string[] = [];
  if (faltas > 0) partes.push(`Desconto de ${pluralDias(faltas)}`);
  if (atestados > 0) partes.push(atestados === 1 ? 'Atestado' : `${atestados} dias de atestado`);
  if (he50 > 0 || he60 > 0 || he100 > 0) partes.push('Hora extra');
  if (comissaoPct > 0) partes.push(`Comissão ${comissaoPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
  return partes.length ? partes.join(' · ') : 'Sem movimento';
};

const RelatorioImpressaoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, dataLoading, isAuthenticated, loading } = useApp();
  const [searchParams] = useSearchParams();
  const [atestadosResumo, setAtestadosResumo] = useState<AtestadoResumo>({});

  const companyId = searchParams.get('empresa') || '';
  const competencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);
  const allCompanies = companyId === ALL_COMPANIES || companyId === 'all';

  const selectedCompanies = useMemo(() => {
    if (allCompanies) return companies;
    return companies.filter(c => c.id === companyId);
  }, [allCompanies, companies, companyId]);

  const manualDiasUteis = Number(searchParams.get('diasUteis'));
  const diasUteis = Number.isInteger(manualDiasUteis) && manualDiasUteis > 0 && manualDiasUteis <= 31
    ? manualDiasUteis
    : getWorkingDays(competencia);

  const [year, month] = competencia.split('-').map(Number);
  const manualDomingos = Number(searchParams.get('domingosFeriados'));
  const domingosFeriados = searchParams.has('domingosFeriados') &&
    Number.isInteger(manualDomingos) && manualDomingos >= 0 && manualDomingos <= 31
    ? manualDomingos
    : year && month
      ? Math.max(0, new Date(year, month, 0).getDate() - diasUteis)
      : 0;

  const competenciaLabel = competenciaLabelFrom(competencia);

  useEffect(() => {
    if (!competencia) return;
    selectedCompanies.forEach(company => getOrCreateEntries(company.id, competencia));
  }, [selectedCompanies.map(c => c.id).join('|'), competencia]);

  useEffect(() => {
    const ids = selectedCompanies.map(company => company.id);
    if (!ids.length || !competencia) {
      setAtestadosResumo({});
      return;
    }

    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from('atestados')
        .select('company_id,funcionario_id,dias_cobertos,status')
        .in('company_id', ids)
        .eq('competencia', competencia);

      if (!active) return;
      if (error) {
        console.warn('Não foi possível carregar atestados para o relatório:', error);
        setAtestadosResumo({});
        return;
      }

      const resumo: AtestadoResumo = {};
      for (const row of (data || []) as any[]) {
        if (!row?.funcionario_id) continue;
        const status = String(row.status || '').toLowerCase();
        if (['cancelado', 'rejeitado', 'excluido'].includes(status)) continue;
        const key = `${row.company_id}|${row.funcionario_id}`;
        resumo[key] = (resumo[key] || 0) + Math.max(0, Number(row.dias_cobertos || 0));
      }
      setAtestadosResumo(resumo);
    })();

    return () => { active = false; };
  }, [selectedCompanies.map(c => c.id).join('|'), competencia]);

  const companyReports = useMemo(() => selectedCompanies.map(company => {
    const companyEntries = entries.filter(e => e.companyId === company.id && e.competencia === competencia);
    const companyEmployees = employees
      .filter(e => e.companyId === company.id && e.status === 'ativo')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const comissaoPctPadrao = getComissaoPercentual(company);
    const heSemanalPct = getHoraExtraSemanalPercentual(company);

    const rows = companyEmployees.map(emp => {
      const entry = companyEntries.find(e => e.employeeId === emp.id) || defaultEntry(emp, competencia, diasUteis);
      const calc = calcPayrollBreakdown(emp, entry, {
        diasUteis,
        domingosFeriados,
        comissaoPct: comissaoPctPadrao,
        horaExtraSemanalPct: heSemanalPct,
      });
      const atestados = atestadosResumo[`${company.id}|${emp.id}`] || 0;
      const faltas = Math.max(0, Number(entry.faltasDias || 0));
      const he50 = Math.max(0, Number(entry.he50 || 0));
      const he60 = Math.max(0, Number(entry.he60 || 0));
      const he100 = Math.max(0, Number(entry.he100 || 0));
      const comissaoPct = Math.max(0, Number(calc.comissaoPct || 0) * 100);
      const adiantamentoPadrao = Math.round((Number(emp.salarioBase) || 0) * 0.4 * 100) / 100;
      const adiantamentoInformado = Math.max(0, Number(entry.adiantamento || 0));
      const adiantamentoExcepcional = Math.abs(adiantamentoInformado - adiantamentoPadrao) > 0.009
        ? adiantamentoInformado
        : 0;

      return {
        emp,
        entry,
        calc,
        atestados,
        faltas,
        he50,
        he60,
        he100,
        comissaoPct,
        adiantamentoExcepcional,
        observacao: observacaoLinha({ faltas, atestados, he50, he60, he100, comissaoPct }),
      };
    });

    const totals = rows.reduce((acc, row) => {
      acc.faltas += row.faltas;
      acc.atestados += row.atestados;
      acc.he50 += row.he50;
      acc.he60 += row.he60;
      acc.he100 += row.he100;
      acc.comissaoBase += Number(row.calc.comissaoBase || 0);
      acc.comissaoValor += Number(row.calc.comissaoVal || 0);
      acc.adiantamentos += row.adiantamentoExcepcional;
      return acc;
    }, {
      faltas: 0,
      atestados: 0,
      he50: 0,
      he60: 0,
      he100: 0,
      comissaoBase: 0,
      comissaoValor: 0,
      adiantamentos: 0,
    });

    return { company, rows, totals };
  }), [
    selectedCompanies,
    entries,
    employees,
    competencia,
    diasUteis,
    domingosFeriados,
    atestadosResumo,
  ]);

  const pdfFileName = useMemo(() => buildTopacRhPdfFileName({
    tipo: allCompanies ? 'Apontamento Multiempresas' : 'Apontamento',
    nome: allCompanies ? 'Multiempresas' : companyReports[0]?.company.name || 'TOPAC',
    competencia,
  }), [allCompanies, companyReports, competencia]);

  const handlePrintOrPdf = () => printDocumentAsPdf(pdfFileName);

  const lastDay = year && month ? new Date(year, month, 0).getDate() : 31;
  const periodStart = `01/${String(month || '').padStart(2, '0')}/${year || ''}`;
  const periodEnd = `${String(lastDay).padStart(2, '0')}/${String(month || '').padStart(2, '0')}/${year || ''}`;

  const hourVisual = (value: number) => value > 0 ? hours(value) : '—';
  const dayVisual = (value: number) => value > 0 ? pluralDias(value) : '—';
  const moneyVisual = (value: number) => value > 0 ? money(value) : '—';
  const percentVisual = (value: number) => value > 0
    ? `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
    : '—';

  if (loading || dataLoading || (isAuthenticated && companies.length === 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando relatório...</p>
      </div>
    );
  }

  if (!allCompanies && companyReports.length === 0) {
    return <div className="p-10 text-center text-lg">Empresa não encontrada. Acesse via fechamento.</div>;
  }

  if (allCompanies && companyReports.length === 0) {
    return <div className="p-10 text-center text-lg">Nenhuma empresa encontrada para impressão.</div>;
  }

  return (
    <>
      <style>{`
        :root {
          --report-navy: #173f73;
          --report-navy-dark: #102b55;
          --report-blue: #1f67b5;
          --report-red: #c53b45;
          --report-green: #168761;
          --report-purple: #6757b8;
          --report-line: #dbe4ef;
        }
        @page { size: A4 landscape; margin: 6mm; }
        .report-shell {
          color: #102241;
          background: #fff;
          font-family: 'Segoe UI', Arial, sans-serif;
        }
        .report-company {
          break-after: page;
          page-break-after: always;
        }
        .report-company:last-of-type {
          break-after: auto;
          page-break-after: auto;
        }
        .report-header {
          display: grid;
          grid-template-columns: minmax(220px, .85fr) minmax(460px, 1.85fr) minmax(245px, .85fr);
          gap: 18px;
          align-items: stretch;
          margin-bottom: 15px;
        }
        .report-brand {
          display: flex;
          align-items: center;
          padding-right: 18px;
          border-right: 1px solid #8ea7c5;
        }
        .report-brand-mark {
          display: flex;
          align-items: baseline;
          gap: 5px;
          white-space: nowrap;
          line-height: 1;
        }
        .report-brand-topac {
          font-size: 32px;
          font-weight: 950;
          font-style: italic;
          letter-spacing: -1.8px;
          color: #071b3d;
        }
        .report-brand-rh {
          font-size: 27px;
          font-weight: 500;
          font-style: italic;
          color: #244f82;
          letter-spacing: -1px;
        }
        .report-brand-line {
          height: 5px;
          width: 72px;
          margin-top: 5px;
          border-radius: 3px;
          background: linear-gradient(90deg, #f2bf22, #ffcf3e);
        }
        .report-brand-sub {
          margin-top: 4px;
          font-size: 11px;
          font-weight: 700;
          font-style: italic;
          color: #315681;
          text-align: right;
        }
        .report-title-block {
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .report-company-name {
          margin: 0;
          font-size: 27px;
          line-height: 1.02;
          font-weight: 950;
          color: #071633;
          letter-spacing: -.5px;
          text-transform: uppercase;
        }
        .report-title {
          margin-top: 3px;
          font-size: 18px;
          line-height: 1.1;
          font-weight: 850;
          color: #0f2450;
        }
        .report-meta {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          color: #38577e;
          font-size: 11px;
        }
        .report-meta span {
          padding: 0 12px;
          border-left: 1px solid #9bb0ca;
        }
        .report-meta span:first-child {
          padding-left: 0;
          border-left: 0;
        }
        .period-card {
          border-radius: 8px;
          background: linear-gradient(135deg, #eef6ff, #e5f0fc);
          padding: 12px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          color: #274e7e;
        }
        .period-icon {
          width: 38px;
          height: 38px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          background: #fff;
          border: 1px solid #d1dfef;
          font-size: 20px;
        }
        .period-label { font-size: 10px; font-weight: 650; }
        .period-range { margin-top: 2px; font-size: 14px; font-weight: 850; color: #17345c; }
        .period-days { margin-top: 3px; font-size: 11px; color: #335d8d; }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 9px;
          margin-bottom: 12px;
        }
        .summary-card {
          min-height: 72px;
          border: 1px solid #e1e7ef;
          border-radius: 7px;
          padding: 11px 13px;
          display: flex;
          align-items: center;
          gap: 11px;
        }
        .summary-card.staff { background: #eef4fa; }
        .summary-card.absence { background: #fff0f1; }
        .summary-card.he50 { background: #edf5ff; }
        .summary-card.he100 { background: #f2efff; }
        .summary-card.commission { background: #edf9f4; }
        .summary-icon {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          font-size: 18px;
          font-weight: 900;
          background: rgba(255,255,255,.72);
          border: 1px solid rgba(15,39,76,.07);
        }
        .summary-label {
          font-size: 10px;
          font-weight: 850;
          color: #244a78;
          text-transform: uppercase;
        }
        .summary-value {
          margin-top: 3px;
          font-size: 21px;
          line-height: 1;
          font-weight: 950;
          color: #0b2148;
          white-space: nowrap;
        }
        .summary-card.absence .summary-value { color: #b11f2d; }
        .summary-card.commission .summary-value { color: #087556; }
        .report-table-wrap { width: 100%; overflow-x: auto; }
        .apontamento-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
          font-size: 11.5px;
          color: #12284b;
        }
        .apontamento-table thead { display: table-header-group; }
        .apontamento-table tfoot { display: table-row-group; }
        .apontamento-table th,
        .apontamento-table td {
          vertical-align: middle;
          border-right: 1px solid var(--report-line);
          border-bottom: 1px solid var(--report-line);
          overflow-wrap: break-word;
        }
        .apontamento-table th:first-child,
        .apontamento-table td:first-child {
          border-left: 1px solid var(--report-line);
        }
        .group-row th {
          color: #fff;
          padding: 8px 6px;
          font-size: 11px;
          font-weight: 900;
          text-align: center;
          border-color: rgba(255,255,255,.18);
        }
        .group-row th:first-child { border-top-left-radius: 5px; }
        .group-row th:last-child { border-top-right-radius: 5px; }
        .group-blue { background: linear-gradient(180deg, #245b8e, #174676); }
        .group-red { background: linear-gradient(180deg, #cb4a53, #b52e38); }
        .group-green { background: linear-gradient(180deg, #259a70, #147451); }
        .subhead-row th {
          padding: 7px 5px;
          font-size: 10.5px;
          font-weight: 800;
          text-align: center;
          background: #edf3f8;
          color: #264b75;
        }
        .subhead-row th.text-left { text-align: left; padding-left: 11px; }
        .subhead-row th.deductions { background: #fbecee; color: #9b2831; }
        .subhead-row th.earnings { background: #eaf6f1; color: #166b51; }
        .employee-row { break-inside: avoid; page-break-inside: avoid; }
        .employee-row td { padding: 8px 6px; background: #fff; }
        .employee-row:nth-child(even) td { background: #f8fbfe; }
        .employee-name {
          font-size: 11.5px;
          line-height: 1.15;
          font-weight: 900;
          color: #0b234c;
        }
        .employee-role {
          font-size: 10.5px;
          line-height: 1.2;
          color: #304f74;
        }
        .center { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .numeric { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .attention { font-weight: 900; color: #b21f2d; }
        .hours-cell { font-weight: 850; color: #102b55; }
        .commission-cell { font-weight: 900; color: #0d6d51; }
        .observation-cell { color: #314f73; font-size: 10.5px; }
        .totals-row td {
          padding: 8px 6px;
          background: #e9f0f7;
          color: #10284c;
          font-size: 10.5px;
          font-weight: 900;
        }
        .totals-row .red-total { color: #b21f2d; }
        .totals-row .green-total { color: #0b7153; }
        .multi-summary {
          break-inside: avoid;
          page-break-inside: avoid;
          margin-top: 14px;
          border-top: 2px solid #17395f;
          padding-top: 12px;
        }
        @media (max-width: 1100px) {
          .report-header { grid-template-columns: 1fr; }
          .report-brand { border-right: 0; border-bottom: 1px solid #d6e1ee; padding: 0 0 10px; }
          .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .apontamento-table { min-width: 1180px; }
        }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          #fech-print-area, #fech-print-area * { visibility: visible !important; }
          #fech-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print, .no-print *, iframe, nav, aside,
          [role="dialog"], [aria-modal="true"], [class*="lovable"], [id*="lovable"] {
            display: none !important;
          }
          .report-company { break-after: page; page-break-after: always; }
          .report-company:last-of-type { break-after: auto; page-break-after: auto; }
          .report-header { grid-template-columns: 55mm 1fr 63mm; gap: 4mm; margin-bottom: 3mm; }
          .report-brand-topac { font-size: 21px; }
          .report-brand-rh { font-size: 18px; }
          .report-brand-sub { font-size: 7.5px; }
          .report-brand-line { height: 3px; width: 46px; margin-top: 3px; }
          .report-company-name { font-size: 18.5px; }
          .report-title { font-size: 12.5px; }
          .report-meta { margin-top: 4px; font-size: 7.8px; }
          .report-meta span { padding: 0 5px; }
          .period-card { padding: 6px 8px; gap: 7px; }
          .period-icon { width: 27px; height: 27px; font-size: 13px; }
          .period-label { font-size: 6.8px; }
          .period-range { font-size: 8.4px; }
          .period-days { font-size: 7.2px; }
          .summary-grid { gap: 2mm; margin-bottom: 2.5mm; }
          .summary-card { min-height: 14.5mm; padding: 2mm 2.5mm; gap: 2mm; }
          .summary-icon { width: 8.2mm; height: 8.2mm; border-radius: 2mm; font-size: 11px; }
          .summary-label { font-size: 6.7px; }
          .summary-value { font-size: 12px; }
          .report-table-wrap { overflow: visible !important; }
          .apontamento-table { min-width: 0 !important; font-size: 7.2px; }
          .group-row th { padding: 3.2px 2px; font-size: 6.9px; }
          .subhead-row th { padding: 3px 2px; font-size: 6.3px; }
          .employee-row td { padding: 3.5px 2.5px; }
          .employee-name { font-size: 7.2px; }
          .employee-role { font-size: 6.5px; }
          .observation-cell { font-size: 6.5px; }
          .totals-row td { padding: 3.5px 2.5px; font-size: 6.7px; }
        }
      `}</style>

      <div className="report-shell min-h-screen">
        <div className="no-print sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/95 px-6 py-3 shadow-sm backdrop-blur">
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : window.location.href = '/fechamento'}
            className="rounded-lg bg-[#17395f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#102b55]"
          >
            Voltar
          </button>
          <button
            onClick={handlePrintOrPdf}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-[#17395f] transition hover:bg-slate-50"
          >
            {allCompanies ? 'Imprimir todos' : 'Imprimir'}
          </button>
          <button
            onClick={handlePrintOrPdf}
            className="rounded-lg bg-[#e8ad19] px-4 py-2 text-sm font-bold text-[#17233a] transition hover:bg-[#dca415]"
          >
            Salvar PDF
          </button>
          <span className="text-xs text-slate-500">Nome sugerido: <strong>{pdfFileName}</strong></span>
        </div>

        <div id="fech-print-area" className="mx-auto max-w-[297mm] px-4 py-5 print:px-0 print:py-0">
          {companyReports.map(({ company, rows, totals }) => (
            <section key={company.id} className="report-company mb-6">
              <header className="report-header">
                <div className="report-brand">
                  <div>
                    <div className="report-brand-mark">
                      <span className="report-brand-topac">TOPAC</span>
                      <span className="report-brand-rh">RH PRO</span>
                    </div>
                    <div className="report-brand-line" />
                    <div className="report-brand-sub">Plataforma Multiempresas</div>
                  </div>
                </div>

                <div className="report-title-block">
                  <h1 className="report-company-name">{company.name}</h1>
                  <div className="report-title">Relatório de Apontamento – {competenciaLabel}</div>
                  <div className="report-meta">
                    <span>CNPJ: {company.cnpj || '-'}</span>
                    <span>Competência: {competenciaLabel}</span>
                    <span>Dias úteis: <strong>{diasUteis}</strong></span>
                  </div>
                </div>

                <div className="period-card">
                  <div className="period-icon">▣</div>
                  <div>
                    <div className="period-label">Período de apuração</div>
                    <div className="period-range">{periodStart} a {periodEnd}</div>
                    <div className="period-days">{diasUteis} dias úteis</div>
                  </div>
                </div>
              </header>

              <div className="summary-grid">
                <div className="summary-card staff">
                  <div className="summary-icon">👥</div>
                  <div>
                    <div className="summary-label">Funcionários</div>
                    <div className="summary-value">{rows.length}</div>
                  </div>
                </div>
                <div className="summary-card absence">
                  <div className="summary-icon">▣</div>
                  <div>
                    <div className="summary-label">Faltas</div>
                    <div className="summary-value">{pluralDias(totals.faltas)}</div>
                  </div>
                </div>
                <div className="summary-card he50">
                  <div className="summary-icon">◷</div>
                  <div>
                    <div className="summary-label">HE 50%</div>
                    <div className="summary-value">{hours(totals.he50)}</div>
                  </div>
                </div>
                <div className="summary-card he100">
                  <div className="summary-icon">▶▶</div>
                  <div>
                    <div className="summary-label">HE 100%</div>
                    <div className="summary-value">{hours(totals.he100)}</div>
                  </div>
                </div>
                <div className="summary-card commission">
                  <div className="summary-icon">▥</div>
                  <div>
                    <div className="summary-label">Comissão Total</div>
                    <div className="summary-value">{money(totals.comissaoValor)}</div>
                  </div>
                </div>
              </div>

              <div className="report-table-wrap">
                <table className="apontamento-table">
                  <colgroup>
                    <col style={{ width: '14.5%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '6.5%' }} />
                    <col style={{ width: '6.5%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '6.5%' }} />
                    <col style={{ width: '6.5%' }} />
                    <col style={{ width: '6.5%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '6.5%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '9.5%' }} />
                  </colgroup>
                  <thead>
                    <tr className="group-row">
                      <th colSpan={2} className="group-blue">COLABORADOR</th>
                      <th colSpan={3} className="group-red">DESCONTOS / APONTAMENTOS</th>
                      <th colSpan={3} className="group-blue">HORAS EXTRAS</th>
                      <th colSpan={3} className="group-green">COMISSÕES / CONFERÊNCIA</th>
                      <th colSpan={1} className="group-blue">OBSERVAÇÕES</th>
                    </tr>
                    <tr className="subhead-row">
                      <th className="text-left">Nome</th>
                      <th className="text-left">Cargo</th>
                      <th className="deductions">Faltas<br />(dias)</th>
                      <th className="deductions">Atestados<br />(dias)</th>
                      <th className="deductions">Adiantamento</th>
                      <th>HE 50%</th>
                      <th>HE 60%</th>
                      <th>HE 100%</th>
                      <th className="earnings">Base Comissão</th>
                      <th className="earnings">Comissão %</th>
                      <th className="earnings">Comissão (R$)</th>
                      <th>Observação</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.emp.id} className="employee-row">
                        <td><div className="employee-name">{row.emp.name || '-'}</div></td>
                        <td><div className="employee-role">{row.emp.cargo || '-'}</div></td>
                        <td className={`center ${row.faltas > 0 ? 'attention' : ''}`}>{dayVisual(row.faltas)}</td>
                        <td className={`center ${row.atestados > 0 ? 'attention' : ''}`}>{dayVisual(row.atestados)}</td>
                        <td className="numeric">{moneyVisual(row.adiantamentoExcepcional)}</td>
                        <td className="center hours-cell">{hourVisual(row.he50)}</td>
                        <td className="center hours-cell">{hourVisual(row.he60)}</td>
                        <td className="center hours-cell">{hourVisual(row.he100)}</td>
                        <td className="numeric commission-cell">{moneyVisual(Number(row.calc.comissaoBase || 0))}</td>
                        <td className="center commission-cell">{percentVisual(row.comissaoPct)}</td>
                        <td className="numeric commission-cell">{moneyVisual(Number(row.calc.comissaoVal || 0))}</td>
                        <td className="observation-cell">{row.observacao}</td>
                      </tr>
                    ))}

                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={12} className="px-3 py-6 text-center text-slate-500">
                          Sem funcionários ativos para esta competência.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  <tfoot>
                    <tr className="totals-row">
                      <td colSpan={2}>TOTAIS</td>
                      <td className="center red-total">{dayVisual(totals.faltas)}</td>
                      <td className="center red-total">{dayVisual(totals.atestados)}</td>
                      <td className="numeric">{moneyVisual(totals.adiantamentos)}</td>
                      <td className="center">{hours(totals.he50)}</td>
                      <td className="center">{hours(totals.he60)}</td>
                      <td className="center">{hours(totals.he100)}</td>
                      <td className="numeric green-total">{money(totals.comissaoBase)}</td>
                      <td className="center">—</td>
                      <td className="numeric green-total">{money(totals.comissaoValor)}</td>
                      <td className="center">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ))}

          {allCompanies && (
            <section className="multi-summary">
              <h2 className="text-center text-lg font-black text-[#102b55]">RESUMO GERAL MULTIEMPRESAS</h2>
              <p className="text-center text-xs text-slate-500">Competência: {competenciaLabel}</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
};

export default RelatorioImpressaoPage;
