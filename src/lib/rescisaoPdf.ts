import { formatCurrency } from './calculations';
import { tipoRescisaoLabel, type RescisaoResultado, type TipoRescisao, type AvisoPrevio } from './rescisaoCalc';
import { jsPDF } from 'jspdf';

interface PdfData {
  empresa: string;
  funcionario: string;
  cargo: string;
  cpf: string;
  admissao: string;
  desligamento: string;
  tipo: TipoRescisao;
  aviso: AvisoPrevio;
  motivo: string;
  observacoes: string;
  resultado: RescisaoResultado;
}

const fmtBR = (value?: string) => {
  if (!value) return '-';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return value;
};

const filePart = (value?: string | number | null) =>
  String(value || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

export const buildRescisaoPdfName = (empresa?: string, funcionario?: string, competencia?: string) => {
  const ref = competencia ? `REF. ${competencia}` : new Date().toISOString().slice(0, 10);
  return `${filePart(empresa)} - FICHA DE RESCISAO - ${filePart(funcionario)} - ${ref}.pdf`;
};

const css = `
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }
  h1 { margin: 0 0 8px; font-size: 16px; }
  h2 { margin: 14px 0 6px; font-size: 12px; border-bottom: 1px solid #999; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
  th { background: #eee; }
  td.num { text-align: right; }
  .liq { background: #f4f4f4; padding: 8px; margin-top: 8px; text-align: right; border: 2px solid #000; font-size: 14px; }
`;

export const buildRescisaoHtml = (d: PdfData) => {
  const r = d.resultado;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rescisão ${d.funcionario}</title><style>${css}</style></head><body>
    <h1>Termo de Rescisão do Contrato de Trabalho (TRCT)</h1>
    <table>
      <tr><th>Empresa</th><td colspan="3">${d.empresa}</td></tr>
      <tr><th>Funcionário</th><td>${d.funcionario}</td><th>CPF</th><td>${d.cpf}</td></tr>
      <tr><th>Cargo</th><td>${d.cargo}</td><th>Admissão</th><td>${d.admissao}</td></tr>
      <tr><th>Desligamento</th><td>${d.desligamento}</td><th>Tipo</th><td>${tipoRescisaoLabel(d.tipo)}</td></tr>
      <tr><th>Aviso prévio</th><td>${d.aviso} (${r.diasAviso} dias)</td><th>Motivo</th><td>${d.motivo || '—'}</td></tr>
    </table>

    <h2>Verbas Rescisórias</h2>
    <table>
      <thead><tr><th>Descrição</th><th>Proventos</th><th>Descontos</th></tr></thead>
      <tbody>
        <tr><td>Saldo de salário</td><td class="num">${formatCurrency(r.saldoSalario)}</td><td></td></tr>
        ${r.avisoPrevioValor > 0 ? `<tr><td>Aviso prévio indenizado</td><td class="num">${formatCurrency(r.avisoPrevioValor)}</td><td></td></tr>` : ''}
        ${r.feriasVencidas > 0 ? `<tr><td>Férias vencidas</td><td class="num">${formatCurrency(r.feriasVencidas)}</td><td></td></tr>` : ''}
        ${r.feriasProporcionais > 0 ? `<tr><td>Férias proporcionais</td><td class="num">${formatCurrency(r.feriasProporcionais)}</td><td></td></tr>` : ''}
        ${r.tercoFerias > 0 ? `<tr><td>1/3 sobre férias</td><td class="num">${formatCurrency(r.tercoFerias)}</td><td></td></tr>` : ''}
        ${r.decimoTerceiro > 0 ? `<tr><td>13º proporcional</td><td class="num">${formatCurrency(r.decimoTerceiro)}</td><td></td></tr>` : ''}
        ${r.multaFgts > 0 ? `<tr><td>Multa FGTS</td><td class="num">${formatCurrency(r.multaFgts)}</td><td></td></tr>` : ''}
        <tr><td>INSS</td><td></td><td class="num">${formatCurrency(r.inss)}</td></tr>
        <tr><td>IRRF</td><td></td><td class="num">${formatCurrency(r.irrf)}</td></tr>
        ${r.outrosDescontos > 0 ? `<tr><td>Outros descontos</td><td></td><td class="num">${formatCurrency(r.outrosDescontos)}</td></tr>` : ''}
      </tbody>
      <tfoot><tr><th>Totais</th>
        <th class="num">${formatCurrency(r.totalProventos)}</th>
        <th class="num">${formatCurrency(r.totalDescontos)}</th>
      </tr></tfoot>
    </table>

    <table>
      <tr>
        <th>FGTS do mês a depositar</th><td class="num">${formatCurrency(r.fgtsMes)}</td>
      </tr>
    </table>

    <div class="liq"><strong>Líquido a receber:</strong> ${formatCurrency(r.liquido)}</div>

    ${d.observacoes ? `<h2>Observações</h2><p>${d.observacoes}</p>` : ''}

    <p style="margin-top:30px;">_____________________________________<br>Assinatura do funcionário</p>
    <p style="margin-top:20px;">_____________________________________<br>Assinatura do empregador</p>
  </body></html>`;
};

export const gerarRescisaoPdf = (d: PdfData) => {
  const r = d.resultado;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const fileName = buildRescisaoPdfName(d.empresa, d.funcionario, d.desligamento?.slice(0, 7));
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 14;

  const addText = (text: string, x: number, yy: number, options?: any) => doc.text(String(text || '-'), x, yy, options);
  const line = () => {
    doc.setDrawColor(60, 60, 60);
    doc.line(12, y, pageWidth - 12, y);
    y += 5;
  };
  const section = (title: string) => {
    y += 4;
    doc.setFillColor(232, 235, 239);
    doc.rect(12, y, pageWidth - 24, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    addText(title, 14, y + 5.5);
    y += 12;
  };
  const row = (label: string, value: string, label2?: string, value2?: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    addText(label, 14, y);
    doc.setFont('helvetica', 'normal');
    addText(value || '-', 48, y);
    if (label2) {
      doc.setFont('helvetica', 'bold');
      addText(label2, 112, y);
      doc.setFont('helvetica', 'normal');
      addText(value2 || '-', 150, y);
    }
    y += 6;
  };
  const moneyRow = (label: string, provento?: number, desconto?: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    addText(label, 14, y);
    addText(provento ? formatCurrency(provento) : '-', 120, y, { align: 'right' });
    addText(desconto ? formatCurrency(desconto) : '-', pageWidth - 14, y, { align: 'right' });
    y += 6;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  addText('FICHA DE RESCISAO DO CONTRATO DE TRABALHO', pageWidth / 2, y, { align: 'center' });
  y += 8;
  line();

  section('Dados do colaborador');
  row('Empresa', d.empresa, 'Funcionario', d.funcionario);
  row('CPF', d.cpf || '-', 'Cargo', d.cargo || '-');
  row('Admissao', fmtBR(d.admissao), 'Desligamento', fmtBR(d.desligamento));
  row('Tipo', tipoRescisaoLabel(d.tipo), 'Aviso previo', `${d.aviso || '-'} (${r.diasAviso || 0} dias)`);
  row('Motivo', d.motivo || '-', 'Observacoes', d.observacoes || '-');

  section('Verbas rescisorias');
  doc.setFont('helvetica', 'bold');
  addText('Descricao', 14, y);
  addText('Proventos', 120, y, { align: 'right' });
  addText('Descontos', pageWidth - 14, y, { align: 'right' });
  y += 3;
  line();
  moneyRow('Saldo de salario', r.saldoSalario, 0);
  if (r.avisoPrevioValor > 0) moneyRow('Aviso previo indenizado', r.avisoPrevioValor, 0);
  if (r.feriasVencidas > 0) moneyRow('Ferias vencidas', r.feriasVencidas, 0);
  if (r.feriasProporcionais > 0) moneyRow('Ferias proporcionais', r.feriasProporcionais, 0);
  if (r.tercoFerias > 0) moneyRow('1/3 sobre ferias', r.tercoFerias, 0);
  if (r.decimoTerceiro > 0) moneyRow('13o proporcional', r.decimoTerceiro, 0);
  if (r.multaFgts > 0) moneyRow('Multa FGTS', r.multaFgts, 0);
  moneyRow('INSS', 0, r.inss);
  moneyRow('IRRF', 0, r.irrf);
  if (r.outrosDescontos > 0) moneyRow('Outros descontos', 0, r.outrosDescontos);
  line();
  doc.setFont('helvetica', 'bold');
  addText('Totais', 14, y);
  addText(formatCurrency(r.totalProventos), 120, y, { align: 'right' });
  addText(formatCurrency(r.totalDescontos), pageWidth - 14, y, { align: 'right' });
  y += 8;
  addText('FGTS do mes a depositar', 14, y);
  addText(formatCurrency(r.fgtsMes), pageWidth - 14, y, { align: 'right' });
  y += 10;

  doc.setFillColor(245, 245, 245);
  doc.rect(12, y, pageWidth - 24, 12, 'F');
  doc.setFontSize(12);
  addText(`Liquido a receber: ${formatCurrency(r.liquido)}`, pageWidth - 16, y + 8, { align: 'right' });
  y += 28;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  addText('_____________________________________', 20, y);
  addText('_____________________________________', 112, y);
  y += 5;
  addText('Assinatura do funcionario', 34, y);
  addText('Assinatura do empregador', 126, y);

  return { blob: doc.output('blob'), fileName };
};
