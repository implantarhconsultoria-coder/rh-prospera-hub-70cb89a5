import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { getWorkingDays, getFirstBusinessDayOfNextMonth } from '@/lib/workingDays';
import { formatCurrency } from '@/lib/calculations';
import { buildVRReportRows, buildVTReportRows, type BenefitReportRow } from '@/lib/benefitReports';
import { useRecibosCorrecoes } from '@/hooks/useRecibosCorrecoes';

type Formato = 'vr' | 'vt' | 'ambos';

const competenciaPt = (competencia: string) => {
  const [y, m] = competencia.split('-');
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[Number(m) - 1]} / ${y}`;
};

const applyCorrecao = (r: BenefitReportRow, c: any | undefined): BenefitReportRow => {
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
};

const RecibosBeneficioImpressaoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, dataLoading, loading } = useApp();
  const [searchParams] = useSearchParams();
  // Aceita 'formato' OU 'tipo' (legado). Se vier 'tipo=vr|vt', usa direto; 'ambos' só via formato.
  const rawTipo = (searchParams.get('tipo') || '').toLowerCase();
  const rawFormato = (searchParams.get('formato') || '').toLowerCase();
  const formato = ((rawFormato || rawTipo || 'vr') as Formato);
  const competencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);
  const empresasParam = searchParams.get('empresas') || '';
  const funcionariosParam = searchParams.get('funcionarios') || '';

  const empresaIds = empresasParam.split(',').map(s => s.trim()).filter(Boolean);
  const funcionarioIds = funcionariosParam ? funcionariosParam.split(',').map(s => s.trim()).filter(Boolean) : null;

  const diasUteis = getWorkingDays(competencia);
  const dataPagamento = getFirstBusinessDayOfNextMonth(competencia);

  useEffect(() => {
    if (!dataLoading) empresaIds.forEach((cid) => getOrCreateEntries(cid, competencia));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresasParam, competencia, dataLoading]);

  const correcoesVR = useRecibosCorrecoes({ tipo: 'vr', competencia });
  const correcoesVT = useRecibosCorrecoes({ tipo: 'vt', competencia });

  type ReciboItem = { company: any; emp: any; vr?: BenefitReportRow; vt?: BenefitReportRow };

  const recibos: ReciboItem[] = useMemo(() => {
    if (dataLoading || loading) return [];
    const out: ReciboItem[] = [];
    for (const cid of empresaIds) {
      const company = companies.find((c) => c.id === cid);
      if (!company) continue;
      const baseEmps = employees.filter(
        (e) => e.companyId === cid && e.status === 'ativo' && e.categoria === 'operacional',
      );
      const compEntries = entries.filter((e) => e.companyId === cid && e.competencia === competencia);

      const vrEmps = baseEmps.filter((e: any) => e.vrAtivo);
      const vtEmps = baseEmps.filter((e: any) => e.vtAtivo);

      const vrRowsAll = buildVRReportRows(vrEmps, compEntries, diasUteis).map((r) =>
        applyCorrecao(r, correcoesVR.findFor('vr', cid, r.emp.id, competencia)),
      );
      const vtRowsAll = buildVTReportRows(vtEmps, compEntries, diasUteis).map((r) =>
        applyCorrecao(r, correcoesVT.findFor('vt', cid, r.emp.id, competencia)),
      );

      const empSet = new Set<string>();
      if (formato === 'vr' || formato === 'ambos') vrRowsAll.forEach((r) => empSet.add(r.emp.id));
      if (formato === 'vt' || formato === 'ambos') vtRowsAll.forEach((r) => empSet.add(r.emp.id));

      const ids = funcionarioIds ? Array.from(empSet).filter((id) => funcionarioIds.includes(id)) : Array.from(empSet);

      ids.forEach((id) => {
        const emp = baseEmps.find((e) => e.id === id);
        if (!emp) return;
        const vr = vrRowsAll.find((r) => r.emp.id === id);
        const vt = vtRowsAll.find((r) => r.emp.id === id);
        if (formato === 'vr' && !vr) return;
        if (formato === 'vt' && !vt) return;
        if (formato === 'ambos' && !vr && !vt) return;
        out.push({ company, emp, vr, vt });
      });
    }
    return out;
  }, [empresaIds, companies, employees, entries, competencia, diasUteis, formato, funcionariosParam, correcoesVR, correcoesVT, dataLoading, loading]);

  const competenciaLabel = competenciaPt(competencia);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando recibos…</p>
      </div>
    );
  }

  if (recibos.length === 0) {
    const empresasNomes = empresaIds.map(id => companies.find(c => c.id === id)?.name || `(id ${id.slice(0,8)}…)`).join(', ') || '— nenhuma —';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-base font-medium">Nenhum recibo encontrado para esta competência/empresa.</p>
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Formato:</strong> {formato}</p>
          <p><strong>Competência:</strong> {competencia}</p>
          <p><strong>Empresas:</strong> {empresasNomes}</p>
          {funcionarioIds && <p><strong>Funcionários:</strong> {funcionarioIds.length}</p>}
          {empresaIds.length === 0 && <p className="text-amber-600">Nenhum ID de empresa foi recebido na URL.</p>}
        </div>
        <button onClick={() => window.history.back()} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg">← Voltar</button>
      </div>
    );
  }

  const formatoLabel = formato === 'vr' ? 'VR' : formato === 'vt' ? 'VT' : 'VR + VT';

  const renderBenefitTable = (label: string, row: BenefitReportRow) => (
    <div className="mb-4">
      <h3 className="text-[11px] font-bold mb-1 bg-gray-200 px-2 py-1">{label}</h3>
      <table className="w-full border-collapse" style={{ fontSize: '10px' }}>
        <tbody>
          <tr><td className="border border-gray-300 px-2 py-1 font-medium w-1/2">Valor Diário</td><td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(row.valorDiario)}</td></tr>
          <tr><td className="border border-gray-300 px-2 py-1 font-medium">Dias Previstos</td><td className="border border-gray-300 px-2 py-1 text-right">{row.diasPrevistos}</td></tr>
          <tr><td className="border border-gray-300 px-2 py-1 font-medium">Dias Descontados</td><td className="border border-gray-300 px-2 py-1 text-right">{row.diasDescontados}</td></tr>
          <tr><td className="border border-gray-300 px-2 py-1 font-medium">Dias Finais</td><td className="border border-gray-300 px-2 py-1 text-right">{row.diasFinais}</td></tr>
          <tr><td className="border border-gray-300 px-2 py-1 font-medium">Motivo Desconto</td><td className="border border-gray-300 px-2 py-1 text-right">{row.motivo || '—'}</td></tr>
          <tr className="bg-gray-100 font-bold"><td className="border border-gray-400 px-2 py-1">Valor Total</td><td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(row.valorTotal)}</td></tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <style>{`
        @page { size: A4; margin: 15mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          #recibos-print, #recibos-print * { visibility: visible !important; }
          #recibos-print { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .no-print, .no-print * { display: none !important; }
          .recibo-page { page-break-after: always; }
          .recibo-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="bg-white text-black min-h-screen" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div className="no-print flex flex-wrap items-center gap-3 px-8 py-3 bg-gray-100 border-b sticky top-0 z-10">
          <button onClick={() => window.history.back()} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">← Voltar</button>
          <button onClick={() => window.print()} className="px-4 py-2 text-sm font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-800">🖨 Imprimir / PDF</button>
          <div className="text-sm text-gray-700 ml-2">
            <strong>Pré-visualização:</strong> {recibos.length} recibo(s) — {recibos.length} página(s) ({formatoLabel})
          </div>
        </div>

        <div id="recibos-print" className="max-w-[210mm] mx-auto">
          {recibos.map(({ company, emp, vr, vt }, idx) => {
            const isAmbos = formato === 'ambos';
            const titulo = isAmbos
              ? 'RECIBO INDIVIDUAL DE BENEFÍCIOS (VR + VT)'
              : formato === 'vr' ? 'RECIBO INDIVIDUAL DE VALE REFEIÇÃO' : 'RECIBO INDIVIDUAL DE VALE TRANSPORTE';
            const corrigido = vr?.corrigido || vt?.corrigido;
            return (
              <div key={`${company.id}-${emp.id}-${idx}`} className="recibo-page px-8 py-6" style={{ fontSize: '11px' }}>
                {/* Header */}
                <div className="border-b-2 border-black pb-3 mb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-lg font-bold">{company.name}</h1>
                      <p className="text-xs text-gray-600">CNPJ: {company.cnpj}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{titulo}</p>
                      <p className="text-xs">Competência: {competenciaLabel}</p>
                      <p className="text-xs">Emissão: {dataPagamento}</p>
                    </div>
                  </div>
                </div>

                {corrigido && (
                  <p className="text-center text-[10px] text-amber-700 border border-amber-400 bg-amber-50 rounded px-2 py-1 mb-3">
                    Recibo ajustado conforme correção administrativa registrada.
                  </p>
                )}

                {/* Employee data */}
                <div className="border border-gray-400 rounded p-3 mb-4" style={{ fontSize: '10px' }}>
                  <div className="grid grid-cols-2 gap-1">
                    <p><strong>Nome:</strong> {emp.name}</p>
                    <p><strong>Cargo:</strong> {emp.cargo}</p>
                    <p><strong>CPF:</strong> {emp.cpf}</p>
                    <p><strong>Registro:</strong> {emp.registro || '—'}</p>
                    <p><strong>Admissão:</strong> {emp.dataAdmissao ? new Date(emp.dataAdmissao).toLocaleDateString('pt-BR') : '—'}</p>
                    <p><strong>Dias úteis:</strong> {diasUteis}</p>
                  </div>
                </div>

                {(formato === 'vr' || isAmbos) && vr && renderBenefitTable('VALE REFEIÇÃO (VR)', vr)}
                {(formato === 'vt' || isAmbos) && vt && renderBenefitTable('VALE TRANSPORTE (VT)', vt)}

                {/* Signature */}
                <div className="mt-16">
                  <div className="border-t border-black w-2/3 mx-auto pt-1 text-center text-[10px]">
                    Assinatura do colaborador
                  </div>
                  <p className="text-center text-[10px] mt-1">{emp.name}</p>
                  <p className="text-center text-[10px] mt-1">Data: ____/____/________</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default RecibosBeneficioImpressaoPage;
