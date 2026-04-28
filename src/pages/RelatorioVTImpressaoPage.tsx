import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { getWorkingDays, getNextCompetencia, formatCompetencia } from '@/lib/workingDays';
import { formatCurrency } from '@/lib/calculations';
import { buildVTReportRows, sumBenefitRows } from '@/lib/benefitReports';

const RelatorioVTImpressaoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, getFechamento, dataLoading, isAuthenticated, loading } = useApp();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get('empresa') || '';
  const competencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);

  const company = companies.find(c => c.id === companyId);
  const diasUteis = getWorkingDays(competencia);
  const fechamento = getFechamento(companyId, competencia);
  const dataFechamento = fechamento.dataFechamento || '';

  useEffect(() => {
    if (companyId && competencia) getOrCreateEntries(companyId, competencia);
  }, [companyId, competencia]);

  const compEmps = employees.filter(e => e.companyId === companyId && e.status === 'ativo' && e.categoria === 'operacional' && e.vtAtivo);
  const compEntries = entries.filter(e => e.companyId === companyId && e.competencia === competencia);

  const rows = useMemo(() => buildVTReportRows(compEmps, compEntries, diasUteis), [compEmps, compEntries, diasUteis]);

  const totalFinal = useMemo(() => sumBenefitRows(rows), [rows]);

  const competenciaLabel = formatCompetencia(competencia);
  const competenciaPagamentoLabel = formatCompetencia(getNextCompetencia(competencia));

  if (loading || dataLoading || (isAuthenticated && companies.length === 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando relatório de VT…</p>
      </div>
    );
  }
  if (!company) return <div className="p-10 text-center">Empresa não encontrada.</div>;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          #vt-print-area, #vt-print-area * { visibility: visible !important; }
          #vt-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .no-print, .no-print *, iframe, nav, aside,
          [role="dialog"], [aria-modal="true"],
          [class*="lovable"], [id*="lovable"] { display: none !important; }
        }
      `}</style>

      <div className="bg-white text-black min-h-screen print:bg-white" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div className="no-print flex items-center gap-3 px-8 py-3 bg-gray-100 border-b">
          <button onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/admin/relatorio-vt')}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            ← Voltar
          </button>
          <button onClick={() => window.print()}
            className="px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
            🖨 Imprimir / PDF
          </button>
        </div>

        <div id="vt-print-area" className="max-w-[210mm] mx-auto px-8 py-6 print:px-6 print:py-4" style={{ fontSize: '11px' }}>
          <div className="border-b-2 border-black pb-3 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-bold">{company.name}</h1>
                <p className="text-xs text-gray-600">CNPJ: {company.cnpj}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">RELATÓRIO DE VALE TRANSPORTE</p>
                <p className="text-xs">Apuração: {competenciaLabel}</p>
                <p className="text-xs font-bold">Pagamento referente a: {competenciaPagamentoLabel}</p>
                <p className="text-xs">Dias úteis: {diasUteis}</p>
                {dataFechamento && <p className="text-xs">Fechamento: {new Date(dataFechamento).toLocaleDateString('pt-BR')}</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 mb-4">
            <div className="border border-gray-400 rounded px-2 py-1 text-center">
              <p className="text-[9px] text-gray-500 uppercase">Total Final</p>
              <p className="text-xs font-bold">{formatCurrency(totalFinal)}</p>
            </div>
          </div>

          <table className="w-full border-collapse" style={{ fontSize: '10px' }}>
            <thead>
              <tr className="bg-gray-200">
                {['Nome', 'Função', 'VT/Dia', 'Dias Prev.', 'Desc.', 'Dias Finais', 'Valor Total', 'Motivo'].map(header => (
                  <th key={header} className="border border-gray-400 px-2 py-1 text-left font-semibold">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.emp.id} className="even:bg-gray-50">
                  <td className="border border-gray-300 px-2 py-1 font-medium">{row.emp.name}</td>
                  <td className="border border-gray-300 px-2 py-1">{row.emp.cargo}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(row.valorDiario)}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{row.diasPrevistos}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{row.diasDescontados > 0 ? row.diasDescontados : '—'}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{row.diasFinais}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right font-bold">{formatCurrency(row.valorTotal)}</td>
                  <td className="border border-gray-300 px-2 py-1">{row.motivo || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-200 font-bold">
                <td colSpan={6} className="border border-gray-400 px-2 py-1">TOTAL</td>
                <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(totalFinal)}</td>
                <td className="border border-gray-400 px-2 py-1"></td>
              </tr>
            </tfoot>
          </table>

        </div>
      </div>
    </>
  );
};

export default RelatorioVTImpressaoPage;
