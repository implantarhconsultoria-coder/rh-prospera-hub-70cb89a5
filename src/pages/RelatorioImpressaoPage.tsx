import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { calcPayrollBreakdown, formatCurrency, getComissaoPercentual } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import type { Employee, MonthlyEntry } from '@/types/database';
import { employeeHasInsalubridade } from '@/lib/employeeRoleRules';
import { buildPdfFileName, competenciaPdfPart, saveElementAsPdf } from '@/lib/savePdf';
import { toast } from 'sonner';

const money = (value: unknown) => formatCurrency(Number(value) || 0);
const hours = (value: unknown) =>
  `${(Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}h`;

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

const RelatorioImpressaoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, getFechamento, dataLoading, isAuthenticated, loading } = useApp();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get('empresa') || '';
  const competencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);

  const company = companies.find(c => c.id === companyId);
  const diasUteis = getWorkingDays(competencia);
  const comissaoPct = getComissaoPercentual(company);
  const [year, month] = competencia.split('-').map(Number);
  const domingosFeriados = year && month ? Math.max(0, new Date(year, month, 0).getDate() - diasUteis) : 0;

  useEffect(() => {
    if (companyId && competencia) getOrCreateEntries(companyId, competencia);
  }, [companyId, competencia]);

  const compEmps = employees.filter(e => e.companyId === companyId && e.status === 'ativo' && e.categoria === 'operacional');
  const compEntries = entries.filter(e => e.companyId === companyId && e.competencia === competencia);
  const fechamento = getFechamento(companyId, competencia);

  const { rows, totals } = useMemo(() => {
    const total = {
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
    };

    const mappedRows = compEmps.map(emp => {
      const entry = compEntries.find(e => e.employeeId === emp.id) || defaultEntry(emp, competencia, diasUteis);
      const calc = calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct });

      total.proventos += calc.proventos;
      total.descontos += calc.descontosLegais + calc.descontosOperacionais + calc.adiantamento + calc.descontosDiversos;
      total.liquido += calc.liquido;
      total.salarios += Number(emp.salarioBase || 0);
      total.insalubridade += calc.insVal;
      total.periculosidade += calc.periculosidadeVal;
      total.he50Horas += Number(entry.he50 || 0);
      total.he50Valor += calc.he50Val;
      total.he100Horas += Number(entry.he100 || 0);
      total.he100Valor += calc.he100Val;
      total.adiantamentos += calc.adiantamento;
      total.faltasDias += Number(entry.faltasDias || 0);
      total.faltasDescontos += calc.descontosOperacionais;
      total.descontosDiversos += calc.descontosDiversos;
      total.fgts += calc.fgtsInformativo;

      return { emp, entry, calc };
    });

    return { rows: mappedRows, totals: total };
  }, [compEmps, compEntries, competencia, diasUteis, domingosFeriados, comissaoPct]);

  const competenciaLabel = (() => {
    const [y, m] = competencia.split('-');
    const meses = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return `${meses[Number(m) - 1] || competencia} / ${y || ''}`;
  })();

  const handleSalvarPdf = async () => {
    try {
      await saveElementAsPdf({
        element: document.getElementById('fech-print-area'),
        fileName: buildPdfFileName(company?.name || 'empresa', 'relatorio fechamento', competenciaPdfPart(competencia)),
        orientation: 'landscape',
        margin: 6,
      });
      toast.success('PDF salvo com sucesso.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel salvar o PDF.');
    }
  };

  if (loading || dataLoading || (isAuthenticated && companies.length === 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando relatorio...</p>
      </div>
    );
  }

  if (!company) return <div className="p-10 text-center text-lg">Empresa nao encontrada. Acesse via relatorio.</div>;

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
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
            Voltar
          </button>
          <button onClick={() => window.print()}
            className="px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
            Imprimir / PDF
          </button>
          <button onClick={handleSalvarPdf}
            className="px-4 py-2 text-sm font-medium bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors">
            Salvar PDF
          </button>
        </div>

        <div id="fech-print-area" className="max-w-[297mm] mx-auto px-5 py-4 print:px-2 print:py-2" style={{ fontSize: '10px' }}>
          <div className="border-b-2 border-black pb-3 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold tracking-tight">{company.name}</h1>
                <p className="text-xs text-gray-600">CNPJ: {company.cnpj || '-'}</p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold">RELATORIO DE FECHAMENTO</p>
                <p className="text-xs">Competencia: {competenciaLabel}</p>
                <p className="text-xs">Dias uteis: {diasUteis}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 mb-4">
            {[
              { l: 'Funcionarios', v: String(compEmps.length) },
              { l: 'Salario base', v: money(totals.salarios) },
              { l: 'Insalubridade', v: money(totals.insalubridade) },
              { l: 'Periculosidade', v: money(totals.periculosidade) },
              { l: 'HE 50% qtd.', v: hours(totals.he50Horas) },
              { l: 'HE 100% qtd.', v: hours(totals.he100Horas) },
              { l: 'Adiantamentos', v: money(totals.adiantamentos) },
              { l: 'Faltas/Desc.', v: money(totals.faltasDescontos + totals.descontosDiversos) },
              { l: 'FGTS info', v: money(totals.fgts) },
              { l: 'Total descontos', v: money(totals.descontos) },
              { l: 'Liquido', v: money(totals.liquido) },
            ].map((c, i) => (
              <div key={i} className="border border-gray-400 rounded px-2 py-1 text-center">
                <p className="text-[8px] text-gray-500 uppercase">{c.l}</p>
                <p className="text-xs font-bold">{c.v}</p>
              </div>
            ))}
          </div>

          <table className="w-full border-collapse" style={{ fontSize: '8.3px', tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-gray-200">
                {['Nome','Cargo','Salario/Base','HE50 qtd','HE50 valor','HE100 qtd','HE100 valor','Insal.','Peric.','Adiant.','Faltas/Desc.','Desc. extra','FGTS info','Liquido'].map(h => (
                  <th key={h} className="border border-gray-400 px-1 py-1 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.emp.id} className="even:bg-gray-50">
                  <td className="border border-gray-300 px-1 py-0.5 font-medium">{r.emp.name || '-'}</td>
                  <td className="border border-gray-300 px-1 py-0.5">{r.emp.cargo || '-'}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{money(r.emp.salarioBase)}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{hours(r.entry.he50)}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{money(r.calc.he50Val)}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{hours(r.entry.he100)}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{money(r.calc.he100Val)}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{money(r.calc.insVal)}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{money(r.calc.periculosidadeVal)}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{money(r.calc.adiantamento)}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{`${Number(r.entry.faltasDias || 0).toLocaleString('pt-BR')}d / ${money(r.calc.descontosOperacionais)}`}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{money(r.calc.descontosDiversos)}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{money(r.calc.fgtsInformativo)}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right font-bold">{money(r.calc.liquido)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-200 font-bold">
                <td className="border border-gray-400 px-1 py-1" colSpan={2}>TOTAIS</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{money(totals.salarios)}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{hours(totals.he50Horas)}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{money(totals.he50Valor)}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{hours(totals.he100Horas)}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{money(totals.he100Valor)}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{money(totals.insalubridade)}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{money(totals.periculosidade)}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{money(totals.adiantamentos)}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{`${Number(totals.faltasDias || 0).toLocaleString('pt-BR')}d / ${money(totals.faltasDescontos)}`}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{money(totals.descontosDiversos)}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{money(totals.fgts)}</td>
                <td className="border border-gray-400 px-1 py-1 text-right">{money(totals.liquido)}</td>
              </tr>
            </tfoot>
          </table>

          {fechamento.observacoes && (
            <div className="mt-4 border border-gray-400 rounded p-2">
              <p className="text-[9px] text-gray-500 uppercase mb-1">Observacoes</p>
              <p className="text-xs">{fechamento.observacoes}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default RelatorioImpressaoPage;
