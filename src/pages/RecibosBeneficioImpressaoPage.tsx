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

  const renderBloco = (label: string, row: BenefitReportRow, sigla: 'VR' | 'VT') => (
    <table className="w-full text-sm mb-3 border border-black/40">
      <tbody>
        <tr className="bg-gray-100">
          <td colSpan={2} className="px-2 py-1 font-bold text-xs uppercase">{label}</td>
        </tr>
        <tr><td className="px-2 py-1 font-semibold w-1/2">Dias previstos</td><td className="px-2 py-1">{row.diasPrevistos}</td></tr>
        <tr><td className="px-2 py-1 font-semibold">Descontos / faltas</td><td className="px-2 py-1">{row.diasDescontados > 0 ? `${row.diasDescontados} — ${row.motivo}` : '—'}</td></tr>
        <tr><td className="px-2 py-1 font-semibold">Dias considerados</td><td className="px-2 py-1">{row.diasFinais}</td></tr>
        <tr><td className="px-2 py-1 font-semibold">Valor diário</td><td className="px-2 py-1">{formatCurrency(row.valorDiario)}</td></tr>
        <tr className="bg-gray-50"><td className="px-2 py-1 font-bold">TOTAL {sigla}</td><td className="px-2 py-1 font-bold">{formatCurrency(row.valorTotal)}</td></tr>
      </tbody>
    </table>
  );

  return (
    <>
      <style>{`
        @page { size: A4; margin: 12mm; }
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
        <div className="no-print flex flex-wrap items-center gap-3 px-8 py-3 bg-gray-100 border-b sticky top-0 z-10">
          <button onClick={() => window.history.back()} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">← Voltar</button>
          <button onClick={() => window.print()} className="px-4 py-2 text-sm font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-800">🖨 Imprimir / PDF</button>
          <div className="text-sm text-gray-700 ml-2">
            <strong>Pré-visualização:</strong> {recibos.length} recibo(s) — {recibos.length} página(s) ({formatoLabel})
            {recibos.some((r) => r.vr?.corrigido || r.vt?.corrigido) && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-0.5 text-xs">
                ⚠ Inclui recibo(s) com correção administrativa
              </span>
            )}
          </div>
        </div>

        <div id="recibos-print" className="max-w-[210mm] mx-auto">
          {recibos.map(({ company, emp, vr, vt }, idx) => {
            const isAmbos = formato === 'ambos';
            const titulo = isAmbos
              ? 'RECIBO DE BENEFÍCIOS — VR E VT'
              : formato === 'vr' ? 'RECIBO DE VALE-REFEIÇÃO' : 'RECIBO DE VALE-TRANSPORTE';
            const declaracao = isAmbos
              ? 'Declaro ter recebido da empresa acima identificada os valores referentes aos benefícios de Vale-Refeição e Vale-Transporte da competência informada.'
              : `Declaro ter recebido da empresa acima identificada o valor referente ao ${formato === 'vr' ? 'Vale-Refeição' : 'Vale-Transporte'} da competência informada.`;
            const totalGeral = (vr?.valorTotal || 0) + (vt?.valorTotal || 0);
            const corrigido = vr?.corrigido || vt?.corrigido;
            return (
              <div key={`${company.id}-${emp.id}-${idx}`} className="recibo-page px-8 py-6" style={{ minHeight: '270mm' }}>
                <div className="border-2 border-black p-5">
                  <div className="border-b-2 border-black pb-2 mb-3 flex justify-between items-start">
                    <div>
                      <h1 className="text-base font-bold uppercase">{company.name}</h1>
                      <p className="text-xs">CNPJ: {company.cnpj}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p>Competência: <strong>{competenciaLabel}</strong></p>
                      <p>Pagamento: <strong>{dataPagamento}</strong></p>
                    </div>
                  </div>

                  <h2 className="text-center text-base font-bold mb-2 tracking-wide">{titulo}</h2>
                  {corrigido && (
                    <p className="text-center text-[11px] text-amber-700 border border-amber-400 bg-amber-50 rounded px-2 py-1 mb-3">
                      Recibo ajustado conforme correção administrativa registrada.
                    </p>
                  )}

                  <table className="w-full text-sm mb-3">
                    <tbody>
                      <tr><td className="py-1 pr-4 font-semibold w-1/3">Funcionário:</td><td className="py-1">{emp.name}</td></tr>
                      <tr><td className="py-1 pr-4 font-semibold">Função:</td><td className="py-1">{emp.cargo}</td></tr>
                      <tr><td className="py-1 pr-4 font-semibold">Competência:</td><td className="py-1">{competenciaLabel}</td></tr>
                    </tbody>
                  </table>

                  {(formato === 'vr' || isAmbos) && vr && renderBloco('Vale-Refeição', vr, 'VR')}
                  {(formato === 'vt' || isAmbos) && vt && renderBloco('Vale-Transporte', vt, 'VT')}

                  {isAmbos && (
                    <div className="text-right text-base font-bold border-t-2 border-black pt-2 mb-3">
                      TOTAL GERAL: {formatCurrency(totalGeral)}
                    </div>
                  )}

                  <p className="text-sm text-justify mb-10 leading-relaxed">{declaracao}</p>

                  <div className="mt-12">
                    <div className="border-t border-black w-3/4 mx-auto pt-1 text-center text-xs">Assinatura do colaborador</div>
                    <p className="text-center text-xs mt-1">Nome: {emp.name}</p>
                    <p className="text-center text-xs mt-1">Data: ____/____/________</p>
                  </div>
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
