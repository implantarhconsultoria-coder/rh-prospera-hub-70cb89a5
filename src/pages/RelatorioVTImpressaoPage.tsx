import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { getWorkingDays } from '@/lib/workingDays';
import { formatCurrency } from '@/lib/calculations';
import { buildVTReportRows, sumBenefitRows, type BenefitReportRow } from '@/lib/benefitReports';
import { useFeriados } from '@/hooks/useFeriados';
import { useRecibosCorrecoes } from '@/hooks/useRecibosCorrecoes';

const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const competenciaLabel = (competencia: string) => {
  const [y, m] = competencia.split('-');
  return `${meses[Number(m) - 1]} / ${y}`;
};

type EmpresaBlock = {
  company: { id: string; name: string; cnpj: string };
  diasUteis: number;
  dataFechamento: string;
  rows: BenefitReportRow[];
  total: number;
};

const EmpresaPagina: React.FC<{ block: EmpresaBlock; competencia: string; consolidado: boolean }> = ({ block, competencia, consolidado }) => (
  <div className="recibo-page" style={{ pageBreakAfter: 'always' }}>
    <div className="border-b-2 border-black pb-3 mb-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-lg font-bold">{block.company.name}</h1>
          <p className="text-xs text-gray-600">CNPJ: {block.company.cnpj}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">{consolidado ? 'RELATÓRIO CONSOLIDADO DE VALE TRANSPORTE' : 'RELATÓRIO DE VALE TRANSPORTE'}</p>
          <p className="text-xs">Competência: {competenciaLabel(competencia)}</p>
          <p className="text-xs">Dias úteis: {block.diasUteis}</p>
          {block.dataFechamento && <p className="text-xs">Fechamento: {new Date(block.dataFechamento).toLocaleDateString('pt-BR')}</p>}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-2 mb-4">
      <div className="border border-gray-400 rounded px-2 py-1 text-center">
        <p className="text-[9px] text-gray-500 uppercase">Total Final</p>
        <p className="text-xs font-bold">{formatCurrency(block.total)}</p>
      </div>
    </div>

    <table className="w-full border-collapse" style={{ fontSize: '10px' }}>
      <thead>
        <tr className="bg-gray-200">
          {['Nome', 'Função', 'VT/Dia', 'Dias Prev.', 'Desc.', 'Dias Finais', 'Valor Total', 'Motivo'].map(h => (
            <th key={h} className="border border-gray-400 px-2 py-1 text-left font-semibold">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map(r => (
          <tr key={r.emp.id} className="even:bg-gray-50">
            <td className="border border-gray-300 px-2 py-1 font-medium">{r.emp.name}{r.corrigido ? ' *' : ''}</td>
            <td className="border border-gray-300 px-2 py-1">{r.emp.cargo}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(r.valorDiario)}</td>
            <td className="border border-gray-300 px-2 py-1 text-center">{r.diasPrevistos}</td>
            <td className="border border-gray-300 px-2 py-1 text-center">{r.diasDescontados > 0 ? r.diasDescontados : '—'}</td>
            <td className="border border-gray-300 px-2 py-1 text-center">{r.diasFinais}</td>
            <td className="border border-gray-300 px-2 py-1 text-right font-bold">{formatCurrency(r.valorTotal)}</td>
            <td className="border border-gray-300 px-2 py-1">{r.correcaoMotivo || r.motivo || '—'}</td>
          </tr>
        ))}
        {block.rows.length === 0 && (
          <tr><td colSpan={8} className="border border-gray-300 px-2 py-3 text-center text-gray-500">Nenhum funcionário com VT ativo nesta competência.</td></tr>
        )}
      </tbody>
      <tfoot>
        <tr className="bg-gray-200 font-bold">
          <td colSpan={6} className="border border-gray-400 px-2 py-1">TOTAL</td>
          <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(block.total)}</td>
          <td className="border border-gray-400 px-2 py-1"></td>
        </tr>
      </tfoot>
    </table>
  </div>
);

const RelatorioVTImpressaoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, getFechamento, dataLoading, isAuthenticated, loading } = useApp();
  const [searchParams] = useSearchParams();
  const competencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);
  const empresasParam = searchParams.get('empresas') || '';
  const empresaSingle = searchParams.get('empresa') || '';

  const empresaIds = useMemo(() => {
    const list = empresasParam
      ? empresasParam.split(',').map(s => s.trim()).filter(Boolean)
      : (empresaSingle ? [empresaSingle] : []);
    return list;
  }, [empresasParam, empresaSingle]);

  const consolidado = empresaIds.length > 1;

  const { datas: feriadosDatas } = useFeriados(competencia);
  const correcoes = useRecibosCorrecoes({ tipo: 'vt', competencia });

  useEffect(() => {
    empresaIds.forEach(id => getOrCreateEntries(id, competencia));
  }, [empresaIds.join(','), competencia]);

  const blocks: EmpresaBlock[] = useMemo(() => {
    const diasUteis = getWorkingDays(competencia, feriadosDatas);
    return empresaIds
      .map(id => companies.find(c => c.id === id))
      .filter(Boolean)
      .map((company: any) => {
        const fech = getFechamento(company.id, competencia);
        const compEmps = employees.filter(e => e.companyId === company.id && e.status === 'ativo' && e.categoria === 'operacional' && e.vtAtivo);
        const compEntries = entries.filter(e => e.companyId === company.id && e.competencia === competencia);
        const rawRows = buildVTReportRows(compEmps, compEntries, diasUteis);
        const rows: BenefitReportRow[] = rawRows.map(r => {
          const c = correcoes.findFor('vt', company.id, r.emp.id, competencia);
          if (!c) return r;
          return {
            ...r,
            valorDiario: Number(c.valor_diario_corrigido ?? r.valorDiario),
            diasFinais: Number(c.dias_finais_corrigido ?? r.diasFinais),
            valorTotal: Number(c.valor_total_corrigido ?? r.valorTotal),
            corrigido: true,
            correcaoMotivo: c.motivo,
            correcaoObservacao: c.observacao,
          };
        });
        const total = sumBenefitRows(rows);
        return { company, diasUteis, dataFechamento: fech.dataFechamento || '', rows, total };
      });
  }, [empresaIds, companies, employees, entries, competencia, feriadosDatas, correcoes]);

  const totalGeral = useMemo(() => blocks.reduce((s, b) => s + b.total, 0), [blocks]);

  if (loading || dataLoading || (isAuthenticated && companies.length === 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando relatório de VT…</p>
      </div>
    );
  }
  if (blocks.length === 0) return <div className="p-10 text-center">Empresa não encontrada.</div>;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          #vt-print-area, #vt-print-area * { visibility: visible !important; }
          #vt-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .recibo-page { page-break-after: always; }
          .recibo-page:last-child { page-break-after: auto; }
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
          {consolidado && (
            <span className="text-xs text-gray-700 ml-2">
              Consolidado · {blocks.length} empresas · Total geral <strong>{formatCurrency(totalGeral)}</strong>
            </span>
          )}
        </div>

        <div id="vt-print-area" className="max-w-[210mm] mx-auto px-8 py-6 print:px-6 print:py-4" style={{ fontSize: '11px' }}>
          {blocks.map(b => (
            <EmpresaPagina key={b.company.id} block={b} competencia={competencia} consolidado={consolidado} />
          ))}

          {consolidado && (
            <div className="recibo-page">
              <div className="border-b-2 border-black pb-3 mb-4">
                <h1 className="text-lg font-bold text-center">RESUMO GERAL CONSOLIDADO</h1>
                <p className="text-xs text-center text-gray-600">Vale Transporte — Competência: {competenciaLabel(competencia)}</p>
              </div>
              <table className="w-full border-collapse" style={{ fontSize: '11px' }}>
                <thead>
                  <tr className="bg-gray-200">
                    <th className="border border-gray-400 px-2 py-1 text-left font-semibold">Empresa</th>
                    <th className="border border-gray-400 px-2 py-1 text-left font-semibold">CNPJ</th>
                    <th className="border border-gray-400 px-2 py-1 text-center font-semibold">Funcionários</th>
                    <th className="border border-gray-400 px-2 py-1 text-right font-semibold">Total VT</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map(b => (
                    <tr key={b.company.id} className="even:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-1 font-medium">{b.company.name}</td>
                      <td className="border border-gray-300 px-2 py-1">{b.company.cnpj}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center">{b.rows.length}</td>
                      <td className="border border-gray-300 px-2 py-1 text-right font-bold">{formatCurrency(b.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-200 font-bold">
                    <td colSpan={3} className="border border-gray-400 px-2 py-1">TOTAL GERAL</td>
                    <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(totalGeral)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default RelatorioVTImpressaoPage;
