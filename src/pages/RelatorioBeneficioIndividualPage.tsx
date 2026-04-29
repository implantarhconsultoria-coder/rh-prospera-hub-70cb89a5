import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { getFirstBusinessDayOfNextMonth, getWorkingDays, getNextCompetencia, formatCompetencia } from '@/lib/workingDays';
import { formatCurrency } from '@/lib/calculations';
import { buildIndividualBenefitData } from '@/lib/benefitReports';

/**
 * Recibo individual de VR OU VT (NUNCA os dois juntos).
 * Use ?tipo=vr ou ?tipo=vt
 * Compatibilidade: sem tipo, redireciona mostrando VR como padrão e avisa.
 *
 * Competência:
 *  - Fechamento (folha) = competência informada na URL (mês trabalhado)
 *  - VR/VT pagos no mês seguinte (mês que vai entrar) — automaticamente +1 mês
 */
const RelatorioBeneficioIndividualPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, getFechamento, dataLoading, isAuthenticated, loading } = useApp();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get('empresa') || '';
  const competenciaFolha = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);
  const funcionarioId = searchParams.get('funcionario') || '';
  const tipoParam = (searchParams.get('tipo') || 'vr').toLowerCase() as 'vr' | 'vt';
  const tipo: 'vr' | 'vt' = tipoParam === 'vt' ? 'vt' : 'vr';

  // Competência do benefício (mês seguinte ao fechamento)
  const competenciaBeneficio = getNextCompetencia(competenciaFolha);

  const company = companies.find(c => c.id === companyId);
  const emp = employees.find(e => e.id === funcionarioId && e.companyId === companyId);
  const diasUteis = getWorkingDays(competenciaFolha);
  const fechamento = getFechamento(companyId, competenciaFolha);
  const dataFechamento = fechamento.dataFechamento || '';

  useEffect(() => {
    if (companyId && competenciaFolha) getOrCreateEntries(companyId, competenciaFolha);
  }, [companyId, competenciaFolha]);

  const entry = entries.find(e => e.employeeId === funcionarioId && e.companyId === companyId && e.competencia === competenciaFolha);

  const competenciaFolhaLabel = (() => {
    const [y, m] = competenciaFolha.split('-');
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${meses[Number(m) - 1]} / ${y}`;
  })();
  const competenciaBeneficioLabel = (() => {
    const [y, m] = competenciaBeneficio.split('-');
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${meses[Number(m) - 1]} / ${y}`;
  })();

  const emissaoDate = getFirstBusinessDayOfNextMonth(competenciaFolha);

  const data = useMemo(() => buildIndividualBenefitData({ emp, entry, diasUteis, type: tipo }), [emp, entry, diasUteis, tipo]);

  if (loading || dataLoading || (isAuthenticated && (companies.length === 0 || employees.length === 0))) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando recibo…</p>
      </div>
    );
  }

  if (!company || !emp) return <div className="p-10 text-center">Dados não encontrados.</div>;

  const titulo = tipo === 'vr' ? 'RECIBO INDIVIDUAL DE VALE REFEIÇÃO' : 'RECIBO INDIVIDUAL DE VALE TRANSPORTE';
  const sigla = tipo === 'vr' ? 'VR' : 'VT';
  const labelLinha = tipo === 'vr' ? 'VALE REFEIÇÃO (VR)' : 'VALE TRANSPORTE (VT)';

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
          <span className="text-xs text-gray-600 ml-auto">{sigla} · {competenciaBeneficioLabel}</span>
        </div>

        <div id="benefit-individual-print" className="max-w-[210mm] mx-auto px-8 py-6 print:px-6 print:py-4" style={{ fontSize: '11px' }}>
          <div className="border-b-2 border-black pb-3 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-bold">{company.name}</h1>
                <p className="text-xs text-gray-600">CNPJ: {company.cnpj}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{titulo}</p>
                <p className="text-xs">Fechamento Salarial: Competência {competenciaFolhaLabel}</p>
                <p className="text-xs font-semibold">{sigla === 'VR' ? 'Vale Refeição' : 'Vale Transporte'}: Competência {competenciaBeneficioLabel}</p>
                <p className="text-xs">Emissão: {emissaoDate}</p>
                {dataFechamento && <p className="text-xs">Fechamento: {new Date(dataFechamento).toLocaleDateString('pt-BR')}</p>}
              </div>
            </div>
          </div>

          <div className="border border-gray-400 rounded p-3 mb-4" style={{ fontSize: '10px' }}>
            <div className="grid grid-cols-2 gap-1">
              <p><strong>Nome:</strong> {emp.name}</p>
              <p><strong>Cargo:</strong> {emp.cargo}</p>
              <p><strong>CPF:</strong> {emp.cpf}</p>
              <p><strong>Registro:</strong> {emp.registro}</p>
              <p><strong>Admissão:</strong> {emp.dataAdmissao ? new Date(emp.dataAdmissao).toLocaleDateString('pt-BR') : '—'}</p>
              <p><strong>Dias úteis (folha):</strong> {diasUteis}</p>
            </div>
          </div>

          {data && (
            <div className="mb-6">
              <h3 className="text-sm font-bold mb-2 bg-gray-200 px-2 py-1">{labelLinha}</h3>
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
          )}

          <div className="mt-12 grid grid-cols-2 gap-12 text-center text-[10px]">
            <div>
              <div className="border-t border-black pt-1">Assinatura do Funcionário</div>
            </div>
            <div>
              <div className="border-t border-black pt-1">Empresa</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default RelatorioBeneficioIndividualPage;
