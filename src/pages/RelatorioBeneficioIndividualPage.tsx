import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { getFirstBusinessDayOfNextMonth, getWorkingDays } from '@/lib/workingDays';
import { formatCurrency } from '@/lib/calculations';

const RelatorioBeneficioIndividualPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, getFechamento } = useApp();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get('empresa') || '';
  const competencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);
  const funcionarioId = searchParams.get('funcionario') || '';

  const company = companies.find(c => c.id === companyId);
  const emp = employees.find(e => e.id === funcionarioId);
  const diasUteis = getWorkingDays(competencia);
  const fechamento = getFechamento(companyId, competencia);
  const dataFechamento = fechamento.dataFechamento || '';

  useEffect(() => {
    if (companyId && competencia) getOrCreateEntries(companyId, competencia);
  }, [companyId, competencia]);

  const entry = entries.find(e => e.employeeId === funcionarioId && e.competencia === competencia);
  const faltasDias = entry?.faltasDias || 0;

  const competenciaLabel = (() => {
    const [y, m] = competencia.split('-');
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${meses[Number(m) - 1]} / ${y}`;
  })();

  const emissaoDate = getFirstBusinessDayOfNextMonth(competencia);

  // VR calculation
  const vrData = useMemo(() => {
    if (!emp?.vrAtivo) return null;
    const diasPrevistos = entry?.vrDias ?? diasUteis;
    const diasDescontados = Math.min(faltasDias, diasPrevistos);
    const diasFinais = Math.max(0, diasPrevistos - diasDescontados);
    const valorDiario = emp.vrDiario;
    const valorTotal = valorDiario * diasFinais;
    return { valorDiario, diasPrevistos, diasDescontados, diasFinais, valorTotal, motivo: diasDescontados > 0 ? `${faltasDias} falta(s)` : '' };
  }, [emp, entry, diasUteis, faltasDias]);

  // VT calculation
  const vtData = useMemo(() => {
    if (!emp?.vtAtivo) return null;
    const diasPrevistos = diasUteis;
    const diasDescontados = Math.min(faltasDias, diasPrevistos);
    const diasFinais = Math.max(0, diasPrevistos - diasDescontados);
    const valorDiario = diasUteis > 0 ? emp.vtValor / diasUteis : 0;
    const valorTotal = valorDiario * diasFinais;
    return { valorDiario, diasPrevistos, diasDescontados, diasFinais, valorTotal, motivo: diasDescontados > 0 ? `${faltasDias} falta(s)` : '' };
  }, [emp, entry, diasUteis, faltasDias]);

  if (!company || !emp) return <div className="p-10 text-center">Dados não encontrados.</div>;

  const renderBenefitTable = (label: string, data: typeof vrData) => {
    if (!data) return null;
    return (
      <div className="mb-6">
        <h3 className="text-sm font-bold mb-2 bg-gray-200 px-2 py-1">{label}</h3>
        <table className="w-full border-collapse" style={{ fontSize: '10px' }}>
          <tbody>
            <tr><td className="border border-gray-300 px-2 py-1 font-medium w-1/2">Valor Diário</td><td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(data.valorDiario)}</td></tr>
            <tr><td className="border border-gray-300 px-2 py-1 font-medium">Dias Previstos</td><td className="border border-gray-300 px-2 py-1 text-right">{data.diasPrevistos}</td></tr>
            <tr><td className="border border-gray-300 px-2 py-1 font-medium">Dias Descontados</td><td className="border border-gray-300 px-2 py-1 text-right">{data.diasDescontados}</td></tr>
            <tr><td className="border border-gray-300 px-2 py-1 font-medium">Dias Finais</td><td className="border border-gray-300 px-2 py-1 text-right">{data.diasFinais}</td></tr>
            <tr><td className="border border-gray-300 px-2 py-1 font-medium">Motivo Desconto</td><td className="border border-gray-300 px-2 py-1 text-right">{data.motivo || '—'}</td></tr>
            <tr className="bg-gray-100 font-bold"><td className="border border-gray-400 px-2 py-1">Valor Total</td><td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(data.valorTotal)}</td></tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <style>{`
        @page { size: A4; margin: 15mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          #benefit-individual-print, #benefit-individual-print * { visibility: visible !important; }
          #benefit-individual-print { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .no-print, .no-print *, iframe, nav, aside,
          [role="dialog"], [aria-modal="true"],
          [class*="lovable"], [id*="lovable"] { display: none !important; }
        }
      `}</style>

      <div className="bg-white text-black min-h-screen" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div className="no-print flex items-center gap-3 px-8 py-3 bg-gray-100 border-b">
          <button onClick={() => window.history.back()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            ← Voltar
          </button>
          <button onClick={() => window.print()}
            className="px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
            🖨 Imprimir / PDF
          </button>
        </div>

        <div id="benefit-individual-print" className="max-w-[210mm] mx-auto px-8 py-6 print:px-6 print:py-4" style={{ fontSize: '11px' }}>
          {/* Header */}
          <div className="border-b-2 border-black pb-3 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-bold">{company.name}</h1>
                <p className="text-xs text-gray-600">CNPJ: {company.cnpj}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">FICHA INDIVIDUAL DE BENEFÍCIOS</p>
                <p className="text-xs">Competência: {competenciaLabel}</p>
                <p className="text-xs">Emissão: {emissaoDate}</p>
                {dataFechamento && <p className="text-xs">Fechamento: {new Date(dataFechamento).toLocaleDateString('pt-BR')}</p>}
              </div>
            </div>
          </div>

          {/* Employee data */}
          <div className="border border-gray-400 rounded p-3 mb-4" style={{ fontSize: '10px' }}>
            <div className="grid grid-cols-2 gap-1">
              <p><strong>Nome:</strong> {emp.name}</p>
              <p><strong>Cargo:</strong> {emp.cargo}</p>
              <p><strong>CPF:</strong> {emp.cpf}</p>
              <p><strong>Registro:</strong> {emp.registro}</p>
              <p><strong>Admissão:</strong> {emp.dataAdmissao ? new Date(emp.dataAdmissao).toLocaleDateString('pt-BR') : '—'}</p>
              <p><strong>Dias úteis:</strong> {diasUteis}</p>
            </div>
          </div>

          {/* VR section */}
          {renderBenefitTable('VALE REFEIÇÃO (VR)', vrData)}

          {/* VT section */}
          {renderBenefitTable('VALE TRANSPORTE (VT)', vtData)}

          {/* Footer */}
          <div className="mt-8 pt-3 border-t border-gray-400 text-center text-[9px] text-gray-500">
            ImplantaRH ConsultoriaPRO — Topac RH Multiempresa PRO — Ficha gerada em {emissaoDate}
          </div>
        </div>
      </div>
    </>
  );
};

export default RelatorioBeneficioIndividualPage;
