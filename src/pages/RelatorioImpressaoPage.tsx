import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { calcTotalFuncionario, calcHE50, calcHE100, calcFalta, calcAtraso, formatCurrency } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import { useSearchParams } from 'react-router-dom';

const RelatorioImpressaoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, getFechamento, dataLoading, isAuthenticated, loading } = useApp();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get('empresa') || '';
  const competencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);

  const company = companies.find(c => c.id === companyId);
  const diasUteis = getWorkingDays(competencia);

  useEffect(() => {
    if (companyId && competencia) getOrCreateEntries(companyId, competencia);
  }, [companyId, competencia]);

  const compEmps = employees.filter(e => e.companyId === companyId && e.status === 'ativo' && e.categoria === 'operacional');
  const compEntries = entries.filter(e => e.companyId === companyId && e.competencia === competencia);
  const fechamento = getFechamento(companyId, competencia);

  const { rows, totals } = useMemo(() => {
    let tProv = 0, tDesc = 0, tLiq = 0, tBen = 0, tIns = 0, tHE = 0, tFaltaDias = 0, tFaltaVal = 0, tSalarios = 0, tAdiant = 0;
    const r = compEmps.map(emp => {
      const entry = compEntries.find(e => e.employeeId === emp.id);
      if (!entry) return null;
      const calc = calcTotalFuncionario(emp, entry, diasUteis);
      const he50Val = calcHE50(emp.salarioBase, entry.he50);
      const he100Val = calcHE100(emp.salarioBase, entry.he100);
      const faltaVal = calcFalta(emp.salarioBase, entry.faltasDias);
      const insVal = entry.insalubridadeAplicada && emp.insalubridadeAtiva ? emp.insalubridadeValor : 0;

      tProv += calc.proventos; tDesc += calc.descontos; tLiq += calc.liquido;
      tBen += calc.beneficios; tIns += insVal; tHE += he50Val + he100Val;
      tFaltaDias += entry.faltasDias; tFaltaVal += faltaVal;
      tSalarios += emp.salarioBase; tAdiant += entry.adiantamento;

      return { emp, entry, calc, he50Val, he100Val, faltaVal, insVal };
    }).filter(Boolean) as any[];

    return {
      rows: r,
      totals: { proventos: tProv, descontos: tDesc, liquido: tLiq, beneficios: tBen, insalubridade: tIns, he: tHE, faltaDias: tFaltaDias, faltaVal: tFaltaVal, salarios: tSalarios, adiantamentos: tAdiant },
    };
  }, [compEmps, compEntries, diasUteis]);

  const competenciaLabel = (() => {
    const [y, m] = competencia.split('-');
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return `${meses[Number(m) - 1]} / ${y}`;
  })();

  // Wait for auth + data hydration before declaring not-found (avoids race when opening in new tab)
  if (loading || dataLoading || (isAuthenticated && companies.length === 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando relatório…</p>
      </div>
    );
  }
  if (!company) return <div className="p-10 text-center text-lg">Empresa não encontrada. Acesse via relatório.</div>;

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          #fech-print-area, #fech-print-area * { visibility: visible !important; }
          #fech-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .no-print, .no-print *, iframe, nav, aside,
          [role="dialog"], [aria-modal="true"],
          [class*="lovable"], [id*="lovable"] { display: none !important; }
        }
      `}</style>
      <div className="bg-white text-black min-h-screen print:bg-white" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div className="no-print flex items-center gap-3 px-8 py-3 bg-gray-100 border-b">
          <button onClick={() => window.history.length > 1 ? window.history.back() : window.location.href = '/relatorio'}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            ← Voltar
          </button>
          <button onClick={() => window.print()}
            className="px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
            🖨 Imprimir / PDF
          </button>
        </div>
        <div id="fech-print-area" className="max-w-[297mm] mx-auto px-6 py-5 print:px-4 print:py-3" style={{ fontSize: '11px' }}>
        {/* Header */}
        <div className="border-b-2 border-black pb-3 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{company.name}</h1>
              <p className="text-xs text-gray-600">CNPJ: {company.cnpj}</p>
            </div>
            <div className="text-right">
              <p className="text-base font-bold">RELATÓRIO DE FECHAMENTO</p>
              <p className="text-xs">Competência: {competenciaLabel}</p>
              <p className="text-xs">Dias úteis: {diasUteis}</p>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { l: 'Funcionários', v: String(compEmps.length) },
            { l: 'Total Proventos', v: formatCurrency(totals.proventos) },
            { l: 'Total Descontos', v: formatCurrency(totals.descontos) },
            { l: 'Líquido', v: formatCurrency(totals.liquido) },
            { l: 'Benefícios', v: formatCurrency(totals.beneficios) },
            { l: 'Insalubridade', v: formatCurrency(totals.insalubridade) },
            { l: 'Faltas (dias)', v: `${totals.faltaDias} dias` },
            { l: 'Desc. Faltas', v: formatCurrency(totals.faltaVal) },
          ].map((c, i) => (
            <div key={i} className="border border-gray-400 rounded px-2 py-1 text-center">
              <p className="text-[9px] text-gray-500 uppercase">{c.l}</p>
              <p className="text-xs font-bold">{c.v}</p>
            </div>
          ))}
        </div>

        {/* Employee table */}
        <table className="w-full border-collapse" style={{ fontSize: '9.5px' }}>
          <thead>
            <tr className="bg-gray-200">
              {['Nome','Cargo','Salário','HE 50%','HE 100%','Adic.','Insal.','VR','VT','Faltas','Adiant.','Desc.','Líquido'].map(h => (
                <th key={h} className="border border-gray-400 px-1 py-1 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.emp.id} className="even:bg-gray-50">
                <td className="border border-gray-300 px-1 py-0.5 whitespace-nowrap font-medium">{r.emp.name}</td>
                <td className="border border-gray-300 px-1 py-0.5 whitespace-nowrap">{r.emp.cargo}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatCurrency(r.emp.salarioBase)}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatCurrency(r.he50Val)}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatCurrency(r.he100Val)}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatCurrency(r.entry.adicionais)}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatCurrency(r.insVal)}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatCurrency(r.calc.vrVal)}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatCurrency(r.calc.vtVal)}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right">{r.entry.faltasDias > 0 ? `${r.entry.faltasDias}d — ${formatCurrency(r.faltaVal)}` : '—'}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatCurrency(r.entry.adiantamento)}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatCurrency(r.entry.descontosDiversos)}</td>
                <td className="border border-gray-300 px-1 py-0.5 text-right font-bold">{formatCurrency(r.calc.liquido)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-200 font-bold">
              <td colSpan={2} className="border border-gray-400 px-1 py-1">TOTAIS</td>
              <td className="border border-gray-400 px-1 py-1 text-right">{formatCurrency(totals.salarios)}</td>
              <td colSpan={4} className="border border-gray-400 px-1 py-1 text-right">{formatCurrency(totals.he + totals.insalubridade)}</td>
              <td colSpan={2} className="border border-gray-400 px-1 py-1 text-right">{formatCurrency(totals.beneficios)}</td>
              <td className="border border-gray-400 px-1 py-1 text-right">{formatCurrency(totals.faltaVal)}</td>
              <td className="border border-gray-400 px-1 py-1 text-right">{formatCurrency(totals.adiantamentos)}</td>
              <td className="border border-gray-400 px-1 py-1 text-right">{formatCurrency(totals.descontos)}</td>
              <td className="border border-gray-400 px-1 py-1 text-right">{formatCurrency(totals.liquido)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Observations */}
        {fechamento.observacoes && (
          <div className="mt-4 border border-gray-400 rounded p-2">
            <p className="text-[9px] text-gray-500 uppercase mb-1">Observações</p>
            <p className="text-xs">{fechamento.observacoes}</p>
          </div>
        )}

        </div>
      </div>
    </>
  );
};

export default RelatorioImpressaoPage;
