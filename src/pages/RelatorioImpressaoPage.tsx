import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { calcPayrollBreakdown, formatCurrency, getComissaoPercentual, getHoraExtraSemanalPercentual } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import type { Employee, MonthlyEntry } from '@/types/database';
import { employeeHasInsalubridade } from '@/lib/employeeRoleRules';
import { buildTopacRhPdfFileName, printDocumentAsPdf } from '@/lib/savePdf';
import { horasLegiveis } from '@/lib/apontamentoInteligente';

const ALL_COMPANIES = 'todas';
const money = (value: unknown) => formatCurrency(Number(value) || 0);
const hours = (value: unknown) => horasLegiveis(Number(value) || 0);

const columns = [
  { label: 'Nome', width: '11%', numeric: false },
  { label: 'Cargo', width: '7%', numeric: false },
  { label: 'Salário/Base', width: '7%', numeric: true },
  { label: 'HE50 qtd', width: '4%', numeric: true },
  { label: 'HE50 valor', width: '5%', numeric: true },
  { label: 'HE60 qtd', width: '4%', numeric: true },
  { label: 'HE60 valor', width: '5%', numeric: true },
  { label: 'HE100 qtd', width: '4%', numeric: true },
  { label: 'HE100 valor', width: '6%', numeric: true },
  { label: 'Base comissão', width: '7%', numeric: true },
  { label: 'Comissão', width: '7%', numeric: true },
  { label: 'Insal.', width: '5%', numeric: true },
  { label: 'Peric.', width: '5%', numeric: true },
  { label: 'Adiant.', width: '6%', numeric: true },
  { label: 'Faltas/Desc.', width: '7%', numeric: true },
  { label: 'Desc. extra', width: '5%', numeric: true },
  { label: 'FGTS info', width: '5%', numeric: true },
  { label: 'Líquido', width: '8%', numeric: true },
] as const;

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

const emptyTotals = () => ({
  proventos: 0,
  descontos: 0,
  liquido: 0,
  salarios: 0,
  insalubridade: 0,
  periculosidade: 0,
  he50Horas: 0,
  he50Valor: 0,
  he60Horas: 0,
  he60Valor: 0,
  he100Horas: 0,
  he100Valor: 0,
  comissaoBase: 0,
  comissaoVal: 0,
  dsrComissao: 0,
  dsrHE: 0,
  adicionais: 0,
  inss: 0,
  irrf: 0,
  adiantamentos: 0,
  faltasDias: 0,
  faltasDescontos: 0,
  descontosDiversos: 0,
  fgts: 0,
});

const competenciaLabelFrom = (competencia: string) => {
  const [y, m] = competencia.split('-');
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[Number(m) - 1] || competencia} / ${y || ''}`;
};

const RelatorioImpressaoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, getFechamento, dataLoading, isAuthenticated, loading } = useApp();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get('empresa') || '';
  const competencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);
  const allCompanies = companyId === ALL_COMPANIES || companyId === 'all';

  const selectedCompanies = useMemo(() => {
    if (allCompanies) return companies;
    return companies.filter(c => c.id === companyId);
  }, [allCompanies, companies, companyId]);

  const manualDiasUteis = Number(searchParams.get('diasUteis'));
  const diasUteis = Number.isInteger(manualDiasUteis) && manualDiasUteis > 0 && manualDiasUteis <= 31
    ? manualDiasUteis : getWorkingDays(competencia);
  const [year, month] = competencia.split('-').map(Number);
  const manualDomingos = Number(searchParams.get('domingosFeriados'));
  const domingosFeriados = searchParams.has('domingosFeriados') &&
    Number.isInteger(manualDomingos) && manualDomingos >= 0 && manualDomingos <= 31
    ? manualDomingos : year && month ? Math.max(0, new Date(year, month, 0).getDate() - diasUteis) : 0;
  const competenciaLabel = competenciaLabelFrom(competencia);

  useEffect(() => {
    if (!competencia) return;
    selectedCompanies.forEach(company => getOrCreateEntries(company.id, competencia));
  }, [selectedCompanies.map(c => c.id).join('|'), competencia]);

  const companyReports = useMemo(() => selectedCompanies.map(company => {
    const companyEntries = entries.filter(e => e.companyId === company.id && e.competencia === competencia);
    const companyEmployees = employees
      .filter(e => e.companyId === company.id && e.status === 'ativo')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const fechamento = getFechamento(company.id, competencia);
    const comissaoPct = getComissaoPercentual(company);
    const heSemanalPct = getHoraExtraSemanalPercentual(company);
    const totals = emptyTotals();

    const rows = companyEmployees.map(emp => {
      const entry = companyEntries.find(e => e.employeeId === emp.id) || defaultEntry(emp, competencia, diasUteis);
      const calc = calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct, horaExtraSemanalPct: heSemanalPct });

      totals.proventos += calc.proventos;
      totals.descontos += calc.descontosLegais + calc.descontosOperacionais + calc.adiantamento + calc.descontosDiversos;
      totals.liquido += calc.liquido;
      totals.salarios += Number(emp.salarioBase || 0);
      totals.insalubridade += calc.insVal;
      totals.periculosidade += calc.periculosidadeVal;
      totals.he50Horas += Number(entry.he50 || 0);
      totals.he50Valor += calc.he50Val;
      totals.he60Horas += Number(entry.he60 || 0);
      totals.he60Valor += calc.he60Val;
      totals.he100Horas += Number(entry.he100 || 0);
      totals.he100Valor += calc.he100Val;
      totals.comissaoBase += calc.comissaoBase;
      totals.comissaoVal += calc.comissaoVal;
      totals.dsrComissao += calc.dsrComissao;
      totals.dsrHE += calc.dsrHE;
      totals.adicionais += calc.adicionais;
      totals.inss += calc.inss;
      totals.irrf += calc.irrf;
      totals.adiantamentos += calc.adiantamento;
      totals.faltasDias += Number(entry.faltasDias || 0);
      totals.faltasDescontos += calc.descontosOperacionais;
      totals.descontosDiversos += calc.descontosDiversos;
      totals.fgts += calc.fgtsInformativo;

      return { emp, entry, calc };
    });

    return { company, fechamento, rows, totals, heSemanalPct };
  }), [selectedCompanies, entries, employees, competencia, diasUteis, domingosFeriados, getFechamento]);

  const grandTotals = useMemo(() => companyReports.reduce((acc, report) => {
    Object.entries(report.totals).forEach(([key, value]) => {
      (acc as any)[key] += Number(value || 0);
    });
    return acc;
  }, emptyTotals()), [companyReports]);

  const pdfFileName = useMemo(() => buildTopacRhPdfFileName({
    tipo: allCompanies ? 'Relatorio' : 'Fechamento',
    nome: allCompanies ? 'Multiempresas' : companyReports[0]?.company.name || 'TOPAC',
    competencia,
  }), [allCompanies, companyReports, competencia]);

  const handlePrintOrPdf = () => printDocumentAsPdf(pdfFileName);

  const lastDay = year && month ? new Date(year, month, 0).getDate() : 31;
  const periodStart = `01/${String(month || '').padStart(2, '0')}/${year || ''}`;
  const periodEnd = `${String(lastDay).padStart(2, '0')}/${String(month || '').padStart(2, '0')}/${year || ''}`;
  const moneyVisual = (value: unknown) => {
    const numeric = Number(value) || 0;
    return numeric === 0 ? '—' : money(numeric);
  };
  const hoursVisual = (value: unknown) => {
    const numeric = Number(value) || 0;
    return numeric === 0 ? '—' : hours(numeric);
  };
  const faltasVisual = (dias: unknown, valor: unknown) => {
    const d = Number(dias) || 0;
    const v = Number(valor) || 0;
    return d === 0 && v === 0 ? '—' : `${d.toLocaleString('pt-BR')}d / ${money(v)}`;
  };

  if (loading || dataLoading || (isAuthenticated && companies.length === 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando relatório...</p>
      </div>
    );
  }

  if (!allCompanies && companyReports.length === 0) return <div className="p-10 text-center text-lg">Empresa não encontrada. Acesse via relatório.</div>;
  if (allCompanies && companyReports.length === 0) return <div className="p-10 text-center text-lg">Nenhuma empresa encontrada para impressão.</div>;

  return (
    <>
      <style>{`
        :root {
          --report-navy: #102b55;
          --report-navy-2: #173f73;
          --report-blue: #1f67b5;
          --report-green: #168761;
          --report-red: #b92d2d;
          --report-gold: #e8ad19;
          --report-line: #d9e2ee;
          --report-soft: #f5f8fc;
          --report-detail: #eef3f8;
        }
        @page { size: A4 landscape; margin: 6mm; }
        .report-shell { color: #102241; background: #fff; font-family: 'Segoe UI', Arial, sans-serif; }
        .report-company { break-after: page; page-break-after: always; }
        .report-company:last-of-type { break-after: auto; page-break-after: auto; }
        .report-header {
          display: grid;
          grid-template-columns: minmax(220px, 0.9fr) minmax(420px, 1.65fr) minmax(235px, .8fr);
          gap: 18px;
          align-items: stretch;
          margin-bottom: 14px;
        }
        .report-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-right: 16px;
          border-right: 1px solid #8ea7c5;
          min-width: 0;
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
        .report-brand-sub {
          margin-top: 4px;
          font-size: 11px;
          font-weight: 700;
          font-style: italic;
          color: #315681;
          text-align: right;
        }
        .report-brand-line {
          height: 5px;
          width: 72px;
          margin-top: 5px;
          border-radius: 3px;
          background: linear-gradient(90deg, #f2bf22, #ffcf3e);
        }
        .report-title-block { min-width: 0; display: flex; flex-direction: column; justify-content: center; }
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
          margin-top: 2px;
          font-size: 18px;
          line-height: 1.1;
          font-weight: 800;
          color: #0f2450;
        }
        .report-meta {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 0;
          color: #38577e;
          font-size: 11px;
        }
        .report-meta span { padding: 0 12px; border-left: 1px solid #9bb0ca; }
        .report-meta span:first-child { padding-left: 0; border-left: 0; }
        .period-card {
          border-radius: 7px;
          background: linear-gradient(135deg, #eef6ff, #e6f1fd);
          padding: 11px 14px;
          display: flex;
          align-items: center;
          gap: 11px;
          color: #274e7e;
        }
        .period-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          background: #fff;
          border: 1px solid #d1dfef;
          font-size: 19px;
        }
        .period-label { font-size: 10px; font-weight: 600; }
        .period-range { margin-top: 2px; font-size: 13px; font-weight: 800; color: #17345c; }
        .period-days { margin-top: 3px; font-size: 11px; color: #335d8d; }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 11px;
        }
        .summary-card {
          min-height: 68px;
          border: 1px solid #e1e7ef;
          border-radius: 6px;
          padding: 11px 13px;
          display: flex;
          align-items: center;
          gap: 11px;
        }
        .summary-card.staff { background: #eef4fa; }
        .summary-card.salary { background: #edf5ff; }
        .summary-card.earnings { background: #edf9f4; }
        .summary-card.deductions { background: #fff0f0; }
        .summary-card.net { background: #fff8e3; }
        .summary-icon {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          font-size: 18px;
          font-weight: 900;
          background: rgba(255,255,255,.75);
          border: 1px solid rgba(15,39,76,.08);
        }
        .summary-label { font-size: 10px; font-weight: 800; color: #244a78; text-transform: uppercase; }
        .summary-value { margin-top: 3px; font-size: 20px; line-height: 1; font-weight: 950; color: #0b2148; white-space: nowrap; }
        .summary-card.earnings .summary-value { color: #0a7154; }
        .summary-card.deductions .summary-value { color: #a81818; }
        .summary-card.net .summary-value { color: #10254c; }
        .report-table-wrap { width: 100%; overflow-x: auto; }
        .fechamento-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
          font-size: 11px;
          color: #12284b;
        }
        .fechamento-table thead { display: table-header-group; }
        .fechamento-table tfoot { display: table-row-group; }
        .fechamento-table th, .fechamento-table td {
          vertical-align: middle;
          border-right: 1px solid var(--report-line);
          border-bottom: 1px solid var(--report-line);
          overflow-wrap: break-word;
        }
        .fechamento-table th:first-child, .fechamento-table td:first-child { border-left: 1px solid var(--report-line); }
        .group-row th {
          color: #fff;
          padding: 7px 5px;
          font-size: 11px;
          font-weight: 850;
          text-align: center;
          border-color: rgba(255,255,255,.18);
        }
        .group-row th:first-child { border-top-left-radius: 5px; }
        .group-row th:last-child { border-top-right-radius: 5px; }
        .group-blue { background: linear-gradient(180deg, #254f7e, #17395f); }
        .group-green { background: linear-gradient(180deg, #1f9b74, #127253); }
        .group-red { background: linear-gradient(180deg, #c23b3b, #a32222); }
        .group-fgts { background: linear-gradient(180deg, #2780c4, #17639e); }
        .group-gold { background: linear-gradient(180deg, #f7c53d, #e9ab19); color: #12213a !important; }
        .subhead-row th {
          padding: 6px 4px;
          background: #edf3f8;
          color: #264b75;
          font-size: 10px;
          font-weight: 750;
          text-align: center;
        }
        .subhead-row th.text-left { text-align: left; padding-left: 10px; }
        .subhead-row th.earnings { background: #eaf6f1; color: #166b51; }
        .subhead-row th.deductions { background: #fae9e9; color: #9c2727; }
        .subhead-row th.fgts { background: #e8f3fc; color: #1b5d91; }
        .subhead-row th.net { background: #fff5d7; color: #513800; font-weight: 900; }
        .employee-block { break-inside: avoid; page-break-inside: avoid; }
        .employee-row td { padding: 7px 5px; background: #fff; }
        .employee-row:nth-of-type(even) td { background: #fbfcfe; }
        .employee-name {
          font-size: 11px;
          line-height: 1.15;
          font-weight: 900;
          color: #0b234c;
        }
        .employee-role { font-size: 10px; line-height: 1.15; color: #304f74; }
        .numeric { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .hours-cell { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .commission-cell { font-weight: 900; }
        .net-cell { font-weight: 950; background: #fff7df !important; color: #0c244b; }
        .detail-row td {
          padding: 5px 12px;
          background: var(--report-detail);
          color: #496483;
          font-size: 9.5px;
          line-height: 1.35;
        }
        .detail-row strong { color: #294c74; }
        .detail-row .detail-net { color: #17365e; font-weight: 950; }
        .totals-row td {
          padding: 7px 5px;
          background: #e4edf6;
          color: #10284c;
          font-size: 10px;
          font-weight: 900;
        }
        .totals-row .net-total { background: #fff0b9; font-size: 11px; }
        .observations {
          margin-top: 10px;
          border: 1px solid #d7e1ec;
          border-radius: 6px;
          padding: 9px 11px;
          background: #f8fafc;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .observations-label { font-size: 9px; text-transform: uppercase; color: #60758d; font-weight: 800; }
        .observations-text { margin-top: 3px; font-size: 10px; color: #223d61; }
        .multi-summary { break-inside: avoid; page-break-inside: avoid; margin-top: 14px; border-top: 2px solid #17395f; padding-top: 12px; }
        @media (max-width: 1100px) {
          .report-header { grid-template-columns: 1fr; }
          .report-brand { border-right: 0; border-bottom: 1px solid #d6e1ee; padding: 0 0 10px; }
          .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .fechamento-table { min-width: 1450px; }
        }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          #fech-print-area, #fech-print-area * { visibility: visible !important; }
          #fech-print-area { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .no-print, .no-print *, iframe, nav, aside,
          [role="dialog"], [aria-modal="true"], [class*="lovable"], [id*="lovable"] { display: none !important; }
          .report-company { break-after: page; page-break-after: always; }
          .report-company:last-of-type { break-after: auto; page-break-after: auto; }
          .report-header { grid-template-columns: 54mm 1fr 61mm; gap: 4mm; margin-bottom: 3mm; }
          .report-brand-topac { font-size: 20px; }
          .report-brand-rh { font-size: 17px; }
          .report-brand-sub { font-size: 7px; }
          .report-brand-line { height: 3px; width: 46px; margin-top: 3px; }
          .report-company-name { font-size: 18px; }
          .report-title { font-size: 12px; }
          .report-meta { margin-top: 4px; font-size: 7.5px; }
          .report-meta span { padding: 0 5px; }
          .period-card { padding: 6px 8px; gap: 7px; }
          .period-icon { width: 26px; height: 26px; font-size: 13px; }
          .period-label { font-size: 6.5px; }
          .period-range { font-size: 8px; }
          .period-days { font-size: 7px; }
          .summary-grid { gap: 2mm; margin-bottom: 2.5mm; }
          .summary-card { min-height: 14mm; padding: 2mm 2.5mm; gap: 2mm; }
          .summary-icon { width: 8mm; height: 8mm; border-radius: 2mm; font-size: 11px; }
          .summary-label { font-size: 6.5px; }
          .summary-value { font-size: 11.5px; }
          .report-table-wrap { overflow: visible !important; }
          .fechamento-table { min-width: 0 !important; font-size: 6.8px; }
          .fechamento-table thead { display: table-header-group !important; }
          .fechamento-table tfoot { display: table-row-group !important; }
          .employee-block { break-inside: avoid !important; page-break-inside: avoid !important; }
          .group-row th { padding: 3px 2px; font-size: 6.6px; }
          .subhead-row th { padding: 2.5px 2px; font-size: 5.8px; }
          .employee-row td { padding: 3px 2px; }
          .employee-name { font-size: 6.7px; }
          .employee-role { font-size: 6px; }
          .detail-row td { padding: 2px 5px; font-size: 5.7px; line-height: 1.25; }
          .totals-row td { padding: 3px 2px; font-size: 6px; }
          .totals-row .net-total { font-size: 6.5px; }
          .observations { margin-top: 2mm; padding: 2mm 2.5mm; }
          .observations-label { font-size: 6px; }
          .observations-text { font-size: 6.5px; }
        }
      `}</style>

      <div className="report-shell min-h-screen">
        <div className="no-print sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/95 px-6 py-3 shadow-sm backdrop-blur">
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : window.location.href = '/admin/relatorio'}
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
          {companyReports.map(({ company, fechamento, rows, totals }) => (
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
                  <div className="report-title">Relatório de Fechamento – {competenciaLabel}</div>
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
                  <div><div className="summary-label">Funcionários</div><div className="summary-value">{rows.length}</div></div>
                </div>
                <div className="summary-card salary">
                  <div className="summary-icon">▤</div>
                  <div><div className="summary-label">Salário Base</div><div className="summary-value">{money(totals.salarios)}</div></div>
                </div>
                <div className="summary-card earnings">
                  <div className="summary-icon">↗</div>
                  <div><div className="summary-label">Proventos</div><div className="summary-value">{money(totals.proventos)}</div></div>
                </div>
                <div className="summary-card deductions">
                  <div className="summary-icon">↓</div>
                  <div><div className="summary-label">Descontos</div><div className="summary-value">{money(totals.descontos)}</div></div>
                </div>
                <div className="summary-card net">
                  <div className="summary-icon">▣</div>
                  <div><div className="summary-label">Líquido a Receber</div><div className="summary-value">{money(totals.liquido)}</div></div>
                </div>
              </div>

              <div className="report-table-wrap">
                <table className="fechamento-table">
                  <colgroup>
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '6.5%' }} />
                    <col style={{ width: '3.7%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '3.7%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '3.7%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '6.5%' }} />
                    <col style={{ width: '5.5%' }} />
                    <col style={{ width: '4.2%' }} />
                    <col style={{ width: '4.2%' }} />
                    <col style={{ width: '5.6%' }} />
                    <col style={{ width: '6.3%' }} />
                    <col style={{ width: '5.6%' }} />
                    <col style={{ width: '5.6%' }} />
                    <col style={{ width: '7%' }} />
                  </colgroup>
                  <thead>
                    <tr className="group-row">
                      <th colSpan={2} className="group-blue">COLABORADOR</th>
                      <th colSpan={1} className="group-blue">SALÁRIO</th>
                      <th colSpan={6} className="group-blue">HORAS EXTRAS</th>
                      <th colSpan={4} className="group-green">PROVENTOS</th>
                      <th colSpan={3} className="group-red">DESCONTOS</th>
                      <th colSpan={1} className="group-fgts">FGTS</th>
                      <th colSpan={1} className="group-gold">LÍQUIDO</th>
                    </tr>
                    <tr className="subhead-row">
                      <th className="text-left">Nome</th>
                      <th className="text-left">Cargo</th>
                      <th>Salário Base</th>
                      <th>50%</th>
                      <th>Valor</th>
                      <th>60%</th>
                      <th>Valor</th>
                      <th>100%</th>
                      <th>Valor</th>
                      <th className="earnings">Base Comissão</th>
                      <th className="earnings">Comissão</th>
                      <th className="earnings">Insal.</th>
                      <th className="earnings">Peric.</th>
                      <th className="deductions">Adiant.</th>
                      <th className="deductions">Faltas/Desc.</th>
                      <th className="deductions">Desc. extra</th>
                      <th className="fgts">Valor</th>
                      <th className="net">A Receber</th>
                    </tr>
                  </thead>

                  {rows.map((r) => (
                    <tbody key={r.emp.id} className="employee-block">
                      <tr className="employee-row">
                        <td><div className="employee-name">{r.emp.name || '-'}</div></td>
                        <td><div className="employee-role">{r.emp.cargo || '-'}</div></td>
                        <td className="numeric">{money(r.emp.salarioBase)}</td>
                        <td className="hours-cell">{hoursVisual(r.entry.he50)}</td>
                        <td className="numeric">{moneyVisual(r.calc.he50Val)}</td>
                        <td className="hours-cell">{hoursVisual(r.entry.he60)}</td>
                        <td className="numeric">{moneyVisual(r.calc.he60Val)}</td>
                        <td className="hours-cell">{hoursVisual(r.entry.he100)}</td>
                        <td className="numeric">{moneyVisual(r.calc.he100Val)}</td>
                        <td className="numeric">{moneyVisual(r.calc.comissaoBase)}</td>
                        <td className="numeric commission-cell">{moneyVisual(r.calc.comissaoVal)}</td>
                        <td className="numeric">{moneyVisual(r.calc.insVal)}</td>
                        <td className="numeric">{moneyVisual(r.calc.periculosidadeVal)}</td>
                        <td className="numeric">{moneyVisual(r.calc.adiantamento)}</td>
                        <td className="numeric">{faltasVisual(r.entry.faltasDias, r.calc.descontosOperacionais)}</td>
                        <td className="numeric">{moneyVisual(r.calc.descontosDiversos)}</td>
                        <td className="numeric">{moneyVisual(r.calc.fgtsInformativo)}</td>
                        <td className="numeric net-cell">{money(r.calc.liquido)}</td>
                      </tr>
                      <tr className="detail-row">
                        <td colSpan={18}>
                          <strong>Detalhamento:</strong> DSR HE: {money(r.calc.dsrHE)}
                          {' · '}DSR Comissão: {money(r.calc.dsrComissao)}
                          {' · '}Comissão: {(r.calc.comissaoPct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                          {' · '}Adicionais: {money(r.calc.adicionais)}
                          {' · '}INSS: {money(r.calc.inss)}
                          {' · '}IRRF: {money(r.calc.irrf)}
                          {' · '}Bruto: {money(r.calc.bruto)}
                          {' · '}Proventos: {money(r.calc.proventos)}
                          {' · '}<span className="detail-net">Líquido: {money(r.calc.liquido)}</span>
                        </td>
                      </tr>
                    </tbody>
                  ))}

                  {rows.length === 0 && (
                    <tbody>
                      <tr><td colSpan={18} className="px-3 py-6 text-center text-slate-500">Sem funcionários ativos para esta competência.</td></tr>
                    </tbody>
                  )}

                  <tfoot>
                    <tr className="totals-row">
                      <td colSpan={2}>TOTAIS</td>
                      <td className="numeric">{money(totals.salarios)}</td>
                      <td className="hours-cell">{hours(totals.he50Horas)}</td>
                      <td className="numeric">{money(totals.he50Valor)}</td>
                      <td className="hours-cell">{hours(totals.he60Horas)}</td>
                      <td className="numeric">{money(totals.he60Valor)}</td>
                      <td className="hours-cell">{hours(totals.he100Horas)}</td>
                      <td className="numeric">{money(totals.he100Valor)}</td>
                      <td className="numeric">{money(totals.comissaoBase)}</td>
                      <td className="numeric commission-cell">{money(totals.comissaoVal)}</td>
                      <td className="numeric">{money(totals.insalubridade)}</td>
                      <td className="numeric">{money(totals.periculosidade)}</td>
                      <td className="numeric">{money(totals.adiantamentos)}</td>
                      <td className="numeric">{`${Number(totals.faltasDias || 0).toLocaleString('pt-BR')}d / ${money(totals.faltasDescontos)}`}</td>
                      <td className="numeric">{money(totals.descontosDiversos)}</td>
                      <td className="numeric">{money(totals.fgts)}</td>
                      <td className="numeric net-total">{money(totals.liquido)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {fechamento.observacoes && (
                <div className="observations">
                  <div className="observations-label">Observações</div>
                  <div className="observations-text">{fechamento.observacoes}</div>
                </div>
              )}
            </section>
          ))}

          {allCompanies && (
            <section className="multi-summary">
              <h2 className="text-center text-lg font-black text-[#102b55]">RESUMO GERAL MULTIEMPRESAS</h2>
              <p className="mb-3 text-center text-xs text-slate-500">Competência: {competenciaLabel}</p>
              <div className="summary-grid">
                {[
                  { l: 'Empresas', v: String(companyReports.length), cls: 'staff' },
                  { l: 'Funcionários', v: String(companyReports.reduce((s, r) => s + r.rows.length, 0)), cls: 'salary' },
                  { l: 'Proventos', v: money(grandTotals.proventos), cls: 'earnings' },
                  { l: 'Descontos', v: money(grandTotals.descontos), cls: 'deductions' },
                  { l: 'Líquido', v: money(grandTotals.liquido), cls: 'net' },
                ].map((card) => (
                  <div key={card.l} className={`summary-card ${card.cls}`}>
                    <div>
                      <div className="summary-label">{card.l}</div>
                      <div className="summary-value">{card.v}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
};

export default RelatorioImpressaoPage;