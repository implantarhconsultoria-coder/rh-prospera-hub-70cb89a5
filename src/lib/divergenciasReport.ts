/**
 * Gera PDF "Relatório de Divergências de Ponto e Atestados".
 * Lista por funcionário: faltas sem justificativa, atestados sem falta correspondente,
 * cartões com batidas inconsistentes e cartões ignorados pelas regras especiais.
 */
import { jsPDF } from 'jspdf';
import type { ResultadoCruzamento } from '@/lib/pontoFechamento';

interface ReportInput {
  empresaNome: string;
  competencia: string;
  resultados: ResultadoCruzamento[];
}

export const gerarRelatorioDivergencias = ({ empresaNome, competencia, resultados }: ReportInput) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // Cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Relatório de Divergências — Ponto x Atestado', margin, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Empresa: ${empresaNome || '—'}`, margin, y);
  doc.text(`Competência: ${competencia}`, pageW - margin, y, { align: 'right' });
  y += 5;
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y);
  y += 6;
  doc.setDrawColor(150);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Resumo
  const totFaltas = resultados.reduce((s, r) => s + r.faltasDias, 0);
  const totAtest = resultados.reduce((s, r) => s + r.diasAtestado, 0);
  const totDiverg = resultados.reduce((s, r) => s + r.divergencias.length, 0);
  const totIgnor = resultados.filter((r) => r.ignorado).length;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Resumo geral', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Faltas sem justificativa: ${totFaltas}`, margin, y); y += 4;
  doc.text(`Dias cobertos por atestado: ${totAtest}`, margin, y); y += 4;
  doc.text(`Total de divergências: ${totDiverg}`, margin, y); y += 4;
  doc.text(`Cartões ignorados (regras especiais): ${totIgnor}`, margin, y); y += 6;

  doc.line(margin, y, pageW - margin, y);
  y += 5;

  // Por funcionário
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Detalhamento por funcionário', margin, y);
  y += 6;

  resultados.forEach((r) => {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(r.funcionario_nome || '(sem nome)', margin, y);

    let statusLabel = 'Pendente';
    if (r.statusConferencia === 'divergente') statusLabel = 'DIVERGENTE';
    else if (r.statusConferencia === 'justificado') statusLabel = 'Justificado';
    else if (r.statusConferencia === 'ignorado') statusLabel = 'Ignorado';
    else if (r.statusConferencia === 'conferido') statusLabel = 'Conferido';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Status: ${statusLabel}`, pageW - margin, y, { align: 'right' });
    y += 4;

    if (r.ignorado) {
      doc.setTextColor(100);
      doc.text(`• Cartão ignorado: ${r.motivoIgnorado || 'regra especial'}`, margin + 3, y);
      doc.setTextColor(0);
      y += 5;
      return;
    }

    doc.text(
      `Faltas: ${r.faltasDias} • Atestado: ${r.diasAtestado} dias • Atraso: ${r.atrasosMinutos} min • HE50: ${r.he50Horas}h • HE100: ${r.he100Horas}h`,
      margin + 3,
      y,
    );
    y += 4;

    const faltas = r.dias.filter((d) => d.classificacao === 'falta_sem_justificativa');
    if (faltas.length) {
      ensureSpace(faltas.length * 4 + 4);
      doc.setFont('helvetica', 'bold');
      doc.text('Faltas sem justificativa:', margin + 3, y);
      doc.setFont('helvetica', 'normal');
      y += 4;
      faltas.forEach((d) => {
        doc.text(`  • ${d.data}`, margin + 3, y);
        y += 4;
      });
    }

    if (r.atestadosSemFalta.length) {
      ensureSpace(r.atestadosSemFalta.length * 4 + 4);
      doc.setFont('helvetica', 'bold');
      doc.text('Atestados sem falta correspondente:', margin + 3, y);
      doc.setFont('helvetica', 'normal');
      y += 4;
      r.atestadosSemFalta.forEach((a) => {
        doc.text(`  • ${a.data_inicio} → ${a.data_fim}`, margin + 3, y);
        y += 4;
      });
    }

    if (r.warnings.length) {
      ensureSpace(r.warnings.length * 4 + 4);
      doc.setFont('helvetica', 'bold');
      doc.text('Avisos:', margin + 3, y);
      doc.setFont('helvetica', 'normal');
      y += 4;
      r.warnings.forEach((w) => {
        const lines = doc.splitTextToSize(`  • ${w}`, pageW - margin * 2 - 6);
        ensureSpace(lines.length * 4);
        doc.text(lines, margin + 3, y);
        y += lines.length * 4;
      });
    }

    y += 3;
    doc.setDrawColor(220);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  });

  // Rodapé com numeração
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 8, { align: 'right' });
  }

  const fileName = `divergencias-${empresaNome.replace(/\s+/g, '_')}-${competencia}.pdf`;
  doc.save(fileName);
};
