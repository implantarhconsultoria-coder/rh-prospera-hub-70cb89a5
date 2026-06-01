import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { getWorkingDays, getFirstBusinessDayOfNextMonth } from '@/lib/workingDays';
import { formatCurrency } from '@/lib/calculations';
import { buildVRReportRows, buildVTReportRows, type BenefitReportRow } from '@/lib/benefitReports';
import { useRecibosCorrecoes } from '@/hooks/useRecibosCorrecoes';
import { downloadEmailWithAttachment } from '@/lib/emailUtils';
import { arquivarDocumentoFuncionario } from '@/lib/documentoHistorico';
import { downloadPdfBlob } from '@/lib/savePdf';
import { toast } from 'sonner';

type Formato = 'vr' | 'vt' | 'ambos';

const competenciaPt = (competencia: string) => {
  const [y, m] = competencia.split('-');
  const meses = ['Janeiro', 'Fevereiro', 'Mar√ßo', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[Number(m) - 1]} / ${y}`;
};


const formatInputDateBr = (value: string) => {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
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

const sanitizeFileName = (value: string) =>
  (value || 'recibos')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeText = (value: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const getEmailDestinoRecibo = (companyName: string) => {
  const nome = normalizeText(companyName);
  if (nome.includes('PRAIA')) {
    return { key: 'praia', to: ['antonio.carlos@topac.com.br'], cc: ['robson@topac.com.br'] };
  }
  if (nome.includes('GOIANIA') || nome.includes('GOIANA') || nome.includes('GOIAN')) {
    return { key: 'goiania', to: ['gyn@topac.com.br'], cc: ['robson@topac.com.br'] };
  }
  return null;
};

const RecibosBeneficioImpressaoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, dataLoading, loading, session } = useApp();
  const [searchParams] = useSearchParams();
  const [sendingEmail, setSendingEmail] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const formato = (searchParams.get('formato') || searchParams.get('tipo') || 'vr') as Formato;
  const competencia = searchParams.get('competencia') || new Date().toISOString().slice(0, 7);
  const diasUteisManual = Number(searchParams.get('diasUteis') || 0);
  const dataPagamentoParam = searchParams.get('dataPagamento') || '';
  const empresasParam = searchParams.get('empresas') || '';
  const funcionariosParam = searchParams.get('funcionarios') || '';

  const empresaIds = empresasParam.split(',').filter(Boolean);
  const funcionarioIds = funcionariosParam ? funcionariosParam.split(',').filter(Boolean) : null;

  const diasUteis = diasUteisManual > 0 ? diasUteisManual : getWorkingDays(competencia);
  const dataEmissao = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const dataPagamento = formatInputDateBr(dataPagamentoParam) || getFirstBusinessDayOfNextMonth(competencia);

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
        <p className="text-sm text-muted-foreground">Carregando recibos‚Ä¶</p>
      </div>
    );
  }

  if (recibos.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-base font-medium">Nenhum recibo encontrado para a compet√™ncia selecionada.</p>
        <button onClick={() => window.history.back()} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg">‚Üê Voltar</button>
      </div>
    );
  }

  const formatoLabel = formato === 'vr' ? 'VR' : formato === 'vt' ? 'VT' : 'VR + VT';

  const recibosComEmail = recibos.filter((r) => getEmailDestinoRecibo(r.company?.name || ''));
  const podeEnviarEmail = recibosComEmail.length > 0;

  const gerarPdfRecibosBlob = (items: ReciboItem[]) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    items.forEach(({ company, emp, vr, vt }, index) => {
      if (index > 0) doc.addPage();
      const isAmbos = formato === 'ambos';
      const pageLeft = 18;
      const pageRight = 192;
      const contentWidth = pageRight - pageLeft;
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(0, 0, 0);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(String(company.name || '').toUpperCase(), pageLeft, 22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`CNPJ: ${company.cnpj || '-'}`, pageLeft, 28);
      doc.setFont('helvetica', 'bold');
      doc.text('FICHA INDIVIDUAL DE BENEFICIOS', pageRight, 22, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(`Competencia: ${competenciaLabel}`, pageRight, 28, { align: 'right' });
      doc.text(`Pagamento: ${dataPagamento}`, pageRight, 34, { align: 'right' });
      doc.text(`Emissao: ${dataEmissao}`, pageRight, 40, { align: 'right' });
      doc.setLineWidth(0.5);
      doc.line(pageLeft, 42, pageRight, 42);

      doc.setDrawColor(156, 163, 175);
      doc.roundedRect(pageLeft, 50, contentWidth, 22, 1, 1);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('Nome:', 22, 57);
      doc.text('Cargo:', 112, 57);
      doc.text('CPF:', 22, 64);
      doc.text('Registro:', 112, 64);
      doc.text('Admissao:', 22, 69);
      doc.text('Dias uteis:', 112, 69);
      doc.setFont('helvetica', 'normal');
      doc.text(String(emp.name || '-').slice(0, 47), 34, 57);
      doc.text(String(emp.cargo || '-').slice(0, 35), 124, 57);
      doc.text(String(emp.cpf || '-'), 31, 64);
      doc.text(String(emp.registro || '-'), 127, 64);
      doc.text(emp.dataAdmissao ? new Date(emp.dataAdmissao).toLocaleDateString('pt-BR') : '-', 37, 69);
      doc.text(String(diasUteis), 128, 69);

      let y = 82;
      const drawBenefit = (label: string, row: BenefitReportRow) => {
        doc.setFillColor(229, 231, 235);
        doc.rect(pageLeft, y, contentWidth, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(label.toUpperCase(), 20, y + 5);
        const lines = [
          ['Valor Diario', formatCurrency(row.valorDiario || 0)],
          ['Dias Previstos', String(row.diasPrevistos || 0)],
          ['Dias Descontados', String(row.diasDescontados || 0)],
          ['Dias Finais', String(row.diasFinais || 0)],
          ['Motivo Desconto', row.motivo || '-'],
          ['Valor Total', formatCurrency(row.valorTotal || 0)],
        ];
        doc.setDrawColor(209, 213, 219);
        lines.forEach(([labelLinha, valor], i) => {
          const top = y + 7 + i * 6;
          const rowY = top + 4;
          doc.line(pageLeft, top, pageRight, top);
          doc.line(pageLeft, top, pageLeft, top + 6);
          doc.line(pageLeft + contentWidth / 2, top, pageLeft + contentWidth / 2, top + 6);
          doc.line(pageRight, top, pageRight, top + 6);
          doc.setFont('helvetica', i === 5 ? 'bold' : 'normal');
          doc.setFontSize(7);
          doc.text(labelLinha, 20, rowY);
          doc.text(valor, 189, rowY, { align: 'right' });
        });
        doc.line(pageLeft, y + 43, pageRight, y + 43);
        y += 55;
      };

      if ((formato === 'vr' || isAmbos) && vr) drawBenefit('Vale-Refeicao', vr);
      if ((formato === 'vt' || isAmbos) && vt) drawBenefit('Vale-Transporte', vt);

      const assinaturaY = Math.max(y + 14, isAmbos ? 202 : 180);
      doc.setDrawColor(0, 0, 0);
      doc.line(52, assinaturaY, 158, assinaturaY);
      doc.setFontSize(8);
      doc.text('Assinatura do colaborador', 105, assinaturaY + 6, { align: 'center' });
      doc.text(`Nome: ${emp.name || '-'}`, 105, assinaturaY + 12, { align: 'center' });
      doc.text('Data: ____/____/________', 105, assinaturaY + 18, { align: 'center' });

      doc.setDrawColor(156, 163, 175);
      const footerY = Math.min(266, Math.max(assinaturaY + 28, isAmbos ? 252 : 236));
      doc.line(pageLeft, footerY, pageRight, footerY);
    });
    return doc.output('blob');
  };
  const getNomeUsuarioAtual = async () => session?.user?.email || 'Sistema TOPAC RH';

  const arquivarRecibosNoHistorico = async (items: ReciboItem[], origem: 'impressao' | 'email' | 'download') => {
    if (!session?.user) return;
    const nomeUsuario = await getNomeUsuarioAtual();
    for (const item of items) {
      const pdfBlob = gerarPdfRecibosBlob([item]);
      await arquivarDocumentoFuncionario({
        funcionarioId: item.emp.id,
        funcionarioNome: item.emp.name,
        companyId: item.company.id,
        empresaNome: item.company.name || '',
        tipoDocumento: `Recibo ${formatoLabel}`,
        competencia,
        descricao: `Recibo ${formatoLabel} - ${competenciaLabel} - ${origem} - Pagamento: ${dataPagamento}`,
        conteudo: pdfBlob,
        extensao: 'pdf',
        storageTipo: `recibo-${formatoLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        geradoPorUserId: session.user.id,
        geradoPorNome: nomeUsuario,
        unidade: item.company.name || '',
      });
    }
  };

  const handleImprimirPdf = async () => {
    await arquivarRecibosNoHistorico(recibos, 'impressao').catch((error) => {
      console.error('Erro ao arquivar recibos no historico:', error);
      toast.warning('PDF aberto, mas alguns recibos nao foram salvos no historico.');
    });
    window.print();
  };

  const handleSalvarPdf = async () => {
    setSavingPdf(true);
    try {
      const pdfBlob = gerarPdfRecibosBlob(recibos);
      const fileName = `${sanitizeFileName(`recibos_${formatoLabel}_${competencia}`)}.pdf`;
      downloadPdfBlob(pdfBlob, fileName);
      await arquivarRecibosNoHistorico(recibos, 'download').catch((error) => {
        console.error('Erro ao arquivar recibos no historico:', error);
        toast.warning('PDF salvo, mas alguns recibos nao foram salvos no historico.');
      });
      toast.success('PDF salvo com sucesso.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel salvar o PDF.');
    } finally {
      setSavingPdf(false);
    }
  };
  const handleEnviarEmail = async () => {
    if (!podeEnviarEmail) {
      toast.info('Envio por e-mail disponivel apenas para Praia Grande e Goiania. As demais empresas ficam somente para impressao.');
      return;
    }

    setSendingEmail(true);
    try {
      const grupos = new Map<string, { destino: NonNullable<ReturnType<typeof getEmailDestinoRecibo>>; items: ReciboItem[] }>();
      recibosComEmail.forEach((item) => {
        const destino = getEmailDestinoRecibo(item.company?.name || '');
        if (!destino) return;
        const atual = grupos.get(destino.key) || { destino, items: [] };
        atual.items.push(item);
        grupos.set(destino.key, atual);
      });

      for (const { destino, items } of Array.from(grupos.values())) {
        const empresaNome = items[0]?.company?.name || 'TOPAC';
        const pdfBlob = gerarPdfRecibosBlob(items);
        await arquivarRecibosNoHistorico(items, 'email').catch((error) => {
          console.error('Erro ao arquivar recibos no historico:', error);
          toast.warning('E-mail gerado, mas alguns recibos nao foram salvos no historico.');
        });
        const attachmentName = `${sanitizeFileName(`recibos_${formatoLabel}_${empresaNome}_${competencia}`)}.pdf`;
        await downloadEmailWithAttachment({
          to: destino.to,
          cc: destino.cc,
          subject: `Recibos ${formatoLabel} - ${empresaNome} - ${competenciaLabel}`,
          body: [
            'Prezados,',
            '',
            `Segue em anexo o PDF com os recibos de ${formatoLabel} referente a ${competenciaLabel} da empresa ${empresaNome}.`,
            '',
            `Quantidade de recibos: ${items.length}`,
            '',
            'Atenciosamente,',
            'Departamento Pessoal - TOPAC',
          ].join('\n'),
          attachmentBlob: pdfBlob,
          attachmentName,
          fileName: `email_recibos_${destino.key}_${competencia}`,
        });
      }
      toast.success('E-mail dos recibos gerado com PDF em anexo.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel gerar o e-mail dos recibos.');
    } finally {
      setSendingEmail(false);
    }
  };

  const renderBloco = (label: string, row: BenefitReportRow, sigla: 'VR' | 'VT') => (
    <table className="w-full text-sm mb-3 border border-black/40">
      <tbody>
        <tr className="bg-gray-100">
          <td colSpan={2} className="px-2 py-1 font-bold text-xs uppercase">{label}</td>
        </tr>
        <tr><td className="px-2 py-1 font-semibold w-1/2">Dias previstos</td><td className="px-2 py-1">{row.diasPrevistos}</td></tr>
        <tr><td className="px-2 py-1 font-semibold">Descontos / faltas</td><td className="px-2 py-1">{row.diasDescontados > 0 ? `${row.diasDescontados} ‚Äî ${row.motivo}` : '‚Äî'}</td></tr>
        <tr><td className="px-2 py-1 font-semibold">Dias considerados</td><td className="px-2 py-1">{row.diasFinais}</td></tr>
        <tr><td className="px-2 py-1 font-semibold">Valor di√°rio</td><td className="px-2 py-1">{formatCurrency(row.valorDiario)}</td></tr>
        <tr className="bg-gray-50"><td className="px-2 py-1 font-bold">TOTAL {sigla}</td><td className="px-2 py-1 font-bold">{formatCurrency(row.valorTotal)}</td></tr>
      </tbody>
    </table>
  );

  const renderFichaBloco = (label: string, row: BenefitReportRow) => (
    <div className="mb-6">
      <h3 className="text-sm font-bold mb-2 bg-gray-200 px-2 py-1">{label}</h3>
      <table className="w-full border-collapse" style={{ fontSize: '10px' }}>
        <tbody>
          <tr><td className="border border-gray-300 px-2 py-1 font-medium w-1/2">Valor Di√°rio</td><td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(row.valorDiario)}</td></tr>
          <tr><td className="border border-gray-300 px-2 py-1 font-medium">Dias Previstos</td><td className="border border-gray-300 px-2 py-1 text-right">{row.diasPrevistos}</td></tr>
          <tr><td className="border border-gray-300 px-2 py-1 font-medium">Dias Descontados</td><td className="border border-gray-300 px-2 py-1 text-right">{row.diasDescontados || 0}</td></tr>
          <tr><td className="border border-gray-300 px-2 py-1 font-medium">Dias Finais</td><td className="border border-gray-300 px-2 py-1 text-right">{row.diasFinais}</td></tr>
          <tr><td className="border border-gray-300 px-2 py-1 font-medium">Motivo Desconto</td><td className="border border-gray-300 px-2 py-1 text-right">{row.motivo || '‚Äî'}</td></tr>
          <tr className="bg-gray-100 font-bold"><td className="border border-gray-400 px-2 py-1">Valor Total</td><td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(row.valorTotal)}</td></tr>
        </tbody>
      </table>
    </div>
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
          <button onClick={() => window.history.back()} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">‚Üê Voltar</button>
          <button onClick={handleImprimirPdf} className="px-4 py-2 text-sm font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-800">üñ® Imprimir / PDF</button>
          <button
            onClick={handleSalvarPdf}
            disabled={savingPdf}
            className="px-4 py-2 text-sm font-medium bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {savingPdf ? 'Salvando...' : 'Salvar PDF'}
          </button>
          <button
            onClick={handleEnviarEmail}
            disabled={!podeEnviarEmail || sendingEmail}
            title={podeEnviarEmail ? 'Gerar e-mail com PDF em anexo para Praia Grande ou Goiania' : 'Disponivel apenas para Praia Grande e Goiania'}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Enviar por e-mail
          </button>
          <div className="text-sm text-gray-700 ml-2">
            <strong>Pr√©-visualiza√ß√£o:</strong> {recibos.length} recibo(s) ‚Äî {recibos.length} p√°gina(s) ({formatoLabel})
            {recibos.some((r) => r.vr?.corrigido || r.vt?.corrigido) && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-0.5 text-xs">
                ‚ö† Inclui recibo(s) com corre√ß√£o administrativa
              </span>
            )}
          </div>
        </div>

        <div id="recibos-print" className="max-w-[210mm] mx-auto px-8 py-6 print:px-6 print:py-4" style={{ fontSize: '11px' }}>
          {recibos.map(({ company, emp, vr, vt }, idx) => {
            const isAmbos = formato === 'ambos';
            return (
              <div key={`${company.id}-${emp.id}-${idx}`} className="recibo-page" style={{ minHeight: '270mm' }}>
                <div className="border-b-2 border-black pb-3 mb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-lg font-bold">{company.name}</h1>
                      <p className="text-xs text-gray-600">CNPJ: {company.cnpj}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">FICHA INDIVIDUAL DE BENEFÕCIOS</p>
                      <p className="text-xs">CompetÍncia: {competenciaLabel}</p>
                      <p className="text-xs">Pagamento: {dataPagamento}</p>
                      <p className="text-xs">Emiss„o: {dataEmissao}</p>
                    </div>
                  </div>
                </div>

                <div className="border border-gray-400 rounded p-3 mb-4" style={{ fontSize: '10px' }}>
                  <div className="grid grid-cols-2 gap-1">
                    <p><strong>Nome:</strong> {emp.name}</p>
                    <p><strong>Cargo:</strong> {emp.cargo}</p>
                    <p><strong>CPF:</strong> {emp.cpf || 'ó'}</p>
                    <p><strong>Registro:</strong> {emp.registro || 'ó'}</p>
                    <p><strong>Admiss„o:</strong> {emp.dataAdmissao ? new Date(emp.dataAdmissao).toLocaleDateString('pt-BR') : 'ó'}</p>
                    <p><strong>Dias ˙teis:</strong> {diasUteis}</p>
                  </div>
                </div>

                {(formato === 'vr' || isAmbos) && vr && renderFichaBloco('VALE REFEI«√O (VR)', vr)}
                {(formato === 'vt' || isAmbos) && vt && renderFichaBloco('VALE TRANSPORTE (VT)', vt)}

                {(vr?.corrigido || vt?.corrigido) && (
                  <p className="text-[10px] text-amber-700 border border-amber-300 bg-amber-50 rounded px-2 py-1 mb-4">
                    Ficha ajustada conforme correÁ„o administrativa registrada.
                  </p>
                )}

                <div className="mt-12">
                  <div className="border-t border-black w-3/4 mx-auto pt-1 text-center text-xs">Assinatura do colaborador</div>
                  <p className="text-center text-xs mt-1">Nome: {emp.name}</p>
                  <p className="text-center text-xs mt-1">Data: ____/____/________</p>
                </div>

                <div className="mt-8 pt-3 border-t border-gray-400 text-center text-[9px] text-gray-500">{' '}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default RecibosBeneficioImpressaoPage;


