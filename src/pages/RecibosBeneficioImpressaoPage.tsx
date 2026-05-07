import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { getWorkingDays, getFirstBusinessDayOfNextMonth } from '@/lib/workingDays';
import { formatCurrency } from '@/lib/calculations';
import { buildVRReportRows, buildVTReportRows, type BenefitReportRow } from '@/lib/benefitReports';

const RecibosBeneficioImpressaoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, dataLoading, isAuthenticated, loading } = useApp();
  const [searchParams] = useSearchParams();
  const tipo = (searchParams.get('tipo') || 'vr') as 'vr' | 'vt';
  const competencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);
  const empresasParam = searchParams.get('empresas') || '';
  const funcionariosParam = searchParams.get('funcionarios') || '';

  const empresaIds = empresasParam.split(',').filter(Boolean);
  const funcionarioIds = funcionariosParam ? funcionariosParam.split(',').filter(Boolean) : null;

  const diasUteis = getWorkingDays(competencia);
  const dataPagamento = getFirstBusinessDayOfNextMonth(competencia);

  useEffect(() => {
    empresaIds.forEach((cid) => getOrCreateEntries(cid, competencia));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresasParam, competencia]);

  const grupos = useMemo(() => {
    return empresaIds.map((cid) => {
      const company = companies.find((c) => c.id === cid);
      if (!company) return null;
      const ativoFlag = tipo === 'vr' ? 'vrAtivo' : 'vtAtivo';
      let compEmps = employees.filter(
        (e) => e.companyId === cid && e.status === 'ativo' && e.categoria === 'operacional' && (e as any)[ativoFlag],
      );
      if (funcionarioIds) compEmps = compEmps.filter((e) => funcionarioIds.includes(e.id));
      const compEntries = entries.filter((e) => e.companyId === cid && e.competencia === competencia);
      const rows = tipo === 'vr'
        ? buildVRReportRows(compEmps, compEntries, diasUteis)
        : buildVTReportRows(compEmps, compEntries, diasUteis);
      return { company, rows };
    }).filter(Boolean) as { company: any; rows: BenefitReportRow[] }[];
  }, [empresaIds, companies, employees, entries, competencia, diasUteis, tipo, funcionariosParam]);

  const competenciaLabel = (() => {
    const [y, m] = competencia.split('-');
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${meses[Number(m) - 1]} / ${y}`;
  })();

  const titulo = tipo === 'vr' ? 'RECIBO DE VALE-REFEIÇÃO' : 'RECIBO DE VALE-TRANSPORTE';
  const beneficioNome = tipo === 'vr' ? 'Vale-Refeição' : 'Vale-Transporte';
  const declaracao = `Declaro ter recebido da empresa acima identificada o valor referente ao ${beneficioNome} da competência informada.`;

  const recibos = grupos.flatMap((g) => g.rows.map((r) => ({ company: g.company, row: r })));

  if (loading || dataLoading || (isAuthenticated && companies.length === 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando recibos…</p>
      </div>
    );
  }

  if (recibos.length === 0) {
    return <div className="p-10 text-center">Nenhum funcionário encontrado para os parâmetros informados.</div>;
  }

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          #recibos-print, #recibos-print * { visibility: visible !important; }
          #recibos-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .recibo-page { page-break-after: always; }
          .recibo-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="bg-white text-black min-h-screen" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div className="no-print flex items-center gap-3 px-8 py-3 bg-gray-100 border-b">
          <button onClick={() => window.history.back()} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            ← Voltar
          </button>
          <button onClick={() => window.print()} className="px-4 py-2 text-sm font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-800">
            🖨 Imprimir / PDF
          </button>
          <span className="text-sm text-gray-600">{recibos.length} recibo(s)</span>
        </div>

        <div id="recibos-print" className="max-w-[210mm] mx-auto">
          {recibos.map(({ company, row }, idx) => (
            <div key={`${company.id}-${row.emp.id}-${idx}`} className="recibo-page px-10 py-8" style={{ minHeight: '270mm' }}>
              <div className="border-2 border-black p-6">
                <div className="border-b-2 border-black pb-3 mb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-base font-bold uppercase">{company.name}</h1>
                      <p className="text-xs">CNPJ: {company.cnpj}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs">Competência: <strong>{competenciaLabel}</strong></p>
                      <p className="text-xs">Pagamento: <strong>{dataPagamento}</strong></p>
                    </div>
                  </div>
                </div>

                <h2 className="text-center text-lg font-bold mb-6 tracking-wide">{titulo}</h2>

                <table className="w-full text-sm mb-6">
                  <tbody>
                    <tr>
                      <td className="py-1 pr-4 font-semibold w-1/3">Funcionário:</td>
                      <td className="py-1">{row.emp.name}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-4 font-semibold">Função:</td>
                      <td className="py-1">{row.emp.cargo}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-4 font-semibold">Competência:</td>
                      <td className="py-1">{competenciaLabel}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-4 font-semibold">Dias previstos:</td>
                      <td className="py-1">{row.diasPrevistos}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-4 font-semibold">Descontos / faltas:</td>
                      <td className="py-1">{row.diasDescontados > 0 ? `${row.diasDescontados} dia(s) — ${row.motivo}` : '—'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-4 font-semibold">Dias considerados:</td>
                      <td className="py-1">{row.diasFinais}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-4 font-semibold">Valor diário ({tipo.toUpperCase()}):</td>
                      <td className="py-1">{formatCurrency(row.valorDiario)}</td>
                    </tr>
                    <tr className="border-t-2 border-black">
                      <td className="py-2 pr-4 font-bold text-base">VALOR TOTAL RECEBIDO:</td>
                      <td className="py-2 font-bold text-base">{formatCurrency(row.valorTotal)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-4 font-semibold">Data do pagamento:</td>
                      <td className="py-1">{dataPagamento}</td>
                    </tr>
                  </tbody>
                </table>

                <p className="text-sm text-justify mb-12 leading-relaxed">{declaracao}</p>

                <div className="mt-16">
                  <div className="border-t border-black w-3/4 mx-auto pt-1 text-center text-xs">
                    Assinatura do colaborador
                  </div>
                  <p className="text-center text-xs mt-1">{row.emp.name}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default RecibosBeneficioImpressaoPage;
