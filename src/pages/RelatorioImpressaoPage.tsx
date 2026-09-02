import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { calcPayrollBreakdown, formatCurrency, getComissaoPercentual, getHoraExtraSemanalPercentual } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import type { Employee, MonthlyEntry } from '@/types/database';
import { employeeHasInsalubridade } from '@/lib/employeeRoleRules';
import { buildTopacRhPdfFileName, printDocumentAsPdf } from '@/lib/savePdf';

const ALL_COMPANIES = 'todas';
const money = (value: unknown) => formatCurrency(Number(value) || 0);
const hours = (value: unknown) =>
  `${(Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}h`;

const columns = [
  { label: 'Nome', width: '12%', numeric: false },
  { label: 'Cargo', width: '10%', numeric: false },
  { label: 'Salário/Base', width: '8%', numeric: true },
  { label: 'HE50 qtd', width: '5%', numeric: true },
  { label: 'HE50 valor', width: '7%', numeric: true },
  { label: 'HE100 qtd', width: '5%', numeric: true },
  { label: 'HE100 valor', width: '7%', numeric: true },
  { label: 'Insal.', width: '6%', numeric: true },
  { label: 'Peric.', width: '6%', numeric: true },
  { label: 'Adiant.', width: '7%', numeric: true },
  { label: 'Faltas/Desc.', width: '8%', numeric: true },
  { label: 'Desc. extra', width: '6%', numeric: true },
  { label: 'FGTS info', width: '6%', numeric: true },
  { label: 'Líquido', width: '7%', numeric: true },
] as const;

const defaultEntry = (emp: Employee, competencia: string, diasUteis: number): MonthlyEntry => ({
  employeeId: emp.id,
  companyId: emp.companyId,
  competencia,
  faltasDias: 0,
  atrasos: 0,
  he50: 0,
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
  he100Horas: 0,
  he100Valor: 0,
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

  const diasUteis = getWorkingDays(competencia);
  const [year, month] = competencia.split('-').map(Number);
  const domingosFeriados = year && month ? Math.max(0, new Date(year, month, 0).getDate() - diasUteis) : 0;
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
      totals.he100Horas += Number(entry.he100 || 0);
      totals.he100Valor += calc.he100Val;
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
        @page { size: A4 landscape; margin: 7mm; }
        .fechamento-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8px; }
        .fechamento-table thead { display: table-header-group; }
        .fechamento-table tfoot { display: table-row-group; }
        .fechamento-table tr { break-inside: avoid; page-break-inside: avoid; }
        .fechamento-table th, .fechamento-table td { vertical-align: middle; overflow-wrap: break-word; }
        .fechamento-table .numeric { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .company-print-heading { text-align: center !important; background: #fff !important; padding: 0 0 7px 0 !important; border: 0 !important; }
        .company-print-heading .company-name { font-size: 16px; font-weight: 800; line-height: 1.15; }
        .company-print-heading .company-meta { font-size: 9px; font-weight: 500; margin-top: 2px; }
        .company-print-heading .report-title { font-size: 11px; font-weight: 800; margin-top: 4px; letter-spacing: .02em; }
        .totals-panel { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          #fech-print-area, #fech-print-area * { visibility: visible !important; }
          #fech-print-area { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .no-print, .no-print *, iframe, nav, aside,
          [role="dialog"], [aria-modal="true"],
          [class*="lovable"], [id*="lovable"] { display: none !important; }
          .company-report-page { break-after: page; page-break-after: always; }
          .company-report-page:last-of-type { break-after: auto; page-break-after: auto; }
          .fechamento-table thead { display: table-header-group !important; }
          .fechamento-table tfoot { display: table-row-group !important; }
          .fechamento-table tr { break-inside: avoid !important; page-break-inside: avoid !important; }
          .totals-panel { break-inside: avoid !important; page-break-inside: avoid !important; }
        }
      `}</style>
      <div className="bg-white text-black min-h-screen print:bg-white" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div className="no-print flex flex-wrap items-center gap-3 px-8 py-3 bg-gray-100 border-b">
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : window.location.href = '/admin/relatorio'}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={handlePrintOrPdf}
            className="px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            {allCompanies ? 'Imprimir todos' : 'Imprimir'}
          </button>
          <button
            onClick={handlePrintOrPdf}
            className="px-4 py-2 text-sm font-medium bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Salvar PDF
          </button>
          <span className="text-xs text-gray-600">Nome sugerido: <strong>{pdfFileName}</strong></span>
        </div>

        <div id="fech-print-area" className="max-w-[297mm] mx-auto px-5 py-4 print:px-0 print:py-0">
          {companyReports.map(({ company, fechamento, rows, totals, heSemanalPct }) => (
            <section key={company.id} className="company-report-page mb-5">
              <table className="fechamento-table">
                <colgroup>
                  {columns.map((column) => <col key={column.label} style={{ width: column.width }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th colSpan={14} className="company-print-heading">
                      <div className="company-name">{company.name}</div>
                      <div className="company-meta">CNPJ: {company.cnpj || '-'} · Competência: {competenciaLabel} · Dias úteis: {diasUteis}</div>
                      <div className="report-title">RELATÓRIO DE FECHAMENTO</div>
                    </th>
                  </tr>
                  <tr className="bg-gray-200">
                    {columns.map(column => {
                      const displayLabel = column.label === 'HE50 qtd'
                        ? `HE${heSemanalPct} qtd`
                        : column.label === 'HE50 valor'
                          ? `HE${heSemanalPct} valor`
                          : column.label;
                      return (
                        <th
                          key={column.label}
                          className={`border border-gray-400 px-1 py-1 font-semibold ${column.numeric ? 'numeric' : 'text-left'}`}
                        >
                          {displayLabel}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.emp.id} className="even:bg-gray-50">
                      <td className="border border-gray-300 px-1 py-1 font-medium">{r.emp.name || '-'}</td>
                      <td className="border border-gray-300 px-1 py-1">{r.emp.cargo || '-'}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{money(r.emp.salarioBase)}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{hours(r.entry.he50)}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{money(r.calc.he50Val)}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{hours(r.entry.he100)}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{money(r.calc.he100Val)}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{money(r.calc.insVal)}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{money(r.calc.periculosidadeVal)}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{money(r.calc.adiantamento)}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{`${Number(r.entry.faltasDias || 0).toLocaleString('pt-BR')}d / ${money(r.calc.descontosOperacionais)}`}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{money(r.calc.descontosDiversos)}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric">{money(r.calc.fgtsInformativo)}</td>
                      <td className="border border-gray-300 px-1 py-1 numeric font-bold">{money(r.calc.liquido)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={14} className="border border-gray-300 px-2 py-4 text-center text-gray-500">Sem funcionários ativos para esta competência.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-200 font-bold">
                    <td className="border border-gray-400 px-1 py-1" colSpan={2}>TOTAIS</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{money(totals.salarios)}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{hours(totals.he50Horas)}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{money(totals.he50Valor)}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{hours(totals.he100Horas)}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{money(totals.he100Valor)}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{money(totals.insalubridade)}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{money(totals.periculosidade)}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{money(totals.adiantamentos)}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{`${Number(totals.faltasDias || 0).toLocaleString('pt-BR')}d / ${money(totals.faltasDescontos)}`}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{money(totals.descontosDiversos)}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{money(totals.fgts)}</td>
                    <td className="border border-gray-400 px-1 py-1 numeric">{money(totals.liquido)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="totals-panel mt-3 grid grid-cols-5 gap-2">
                {[
                  { l: 'Funcionários', v: String(rows.length) },
                  { l: 'Salário base', v: money(totals.salarios) },
                  { l: 'Proventos', v: money(totals.proventos) },
                  { l: 'Descontos', v: money(totals.descontos) },
                  { l: 'Líquido', v: money(totals.liquido) },
                  { l: 'Insalubridade', v: money(totals.insalubridade) },
                  { l: 'Periculosidade', v: money(totals.periculosidade) },
                  { l: 'Adiantamentos', v: money(totals.adiantamentos) },
                  { l: 'FGTS informativo', v: money(totals.fgts) },
                  { l: 'Faltas / descontos', v: money(totals.faltasDescontos + totals.descontosDiversos) },
                ].map((card) => (
                  <div key={card.l} className="border border-gray-400 rounded px-2 py-1 text-center">
                    <p className="text-[8px] text-gray-500 uppercase">{card.l}</p>
                    <p className="text-xs font-bold">{card.v}</p>
                  </div>
                ))}
              </div>

              {fechamento.observacoes && (
                <div className="totals-panel mt-3 border border-gray-400 rounded p-2">
                  <p className="text-[9px] text-gray-500 uppercase mb-1">Observações</p>
                  <p className="text-xs">{fechamento.observacoes}</p>
                </div>
              )}
            </section>
          ))}

          {allCompanies && (
            <section className="totals-panel border-t-2 border-black pt-4 mt-3">
              <h2 className="text-lg font-bold text-center">RESUMO GERAL MULTIEMPRESAS</h2>
              <p className="text-xs text-center mb-3">Competência: {competenciaLabel}</p>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { l: 'Empresas', v: String(companyReports.length) },
                  { l: 'Funcionários', v: String(companyReports.reduce((s, r) => s + r.rows.length, 0)) },
                  { l: 'Proventos', v: money(grandTotals.proventos) },
                  { l: 'Descontos', v: money(grandTotals.descontos) },
                  { l: 'Líquido', v: money(grandTotals.liquido) },
                ].map((card) => (
                  <div key={card.l} className="border border-gray-400 rounded px-2 py-1 text-center">
                    <p className="text-[8px] text-gray-500 uppercase">{card.l}</p>
                    <p className="text-xs font-bold">{card.v}</p>
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