import { jsPDF } from 'jspdf';
import { buildTopacRhPdfFileName } from './savePdf';
import { tipoRescisaoLabel, type RescisaoResultado, type TipoRescisao, type AvisoPrevio } from './rescisaoCalc';

export interface RescisaoPdfData {
  empresa: string;
  empresaCnpj?: string;
  funcionario: string;
  cargo: string;
  cpf: string;
  admissao: string;
  desligamento: string;
  tipo: TipoRescisao;
  aviso: AvisoPrevio;
  motivo?: string;
  observacoes?: string;
  resultado: RescisaoResultado;
}

const money = (value: unknown) => (Number(value) || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateBr = (value?: string | null) => {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value);
};

export const buildRescisaoPdfName = (empresa?: string, funcionario?: string, competencia?: string) =>
  buildTopacRhPdfFileName({
    tipo: 'MemoriaRescisao',
    nome: funcionario || empresa || 'Funcionario',
    competencia,
  });

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const buildRescisaoHtml = (data: RescisaoPdfData) => {
  const result = data.resultado;
  const periodRows = result.periodosFerias.map((period) => `
    <tr>
      <td>${escapeHtml(dateBr(period.periodoAquisitivoInicio))} a ${escapeHtml(dateBr(period.periodoAquisitivoFim))}</td>
      <td>${escapeHtml(period.situacao)}${period.revisaoNecessaria ? '<br><small>Revisar</small>' : ''}</td>
      <td class="n">${period.diasDireito}</td>
      <td class="n">${period.diasJaUtilizados}</td>
      <td class="n">${period.diasAbono}</td>
      <td class="n">${period.saldoDias}</td>
      <td class="n">${period.avos == null ? '-' : `${period.avos}/12`}</td>
      <td class="n">${money(period.valorFerias)}</td>
      <td class="n">${money(period.tercoConstitucional)}</td>
      <td class="n">${money(period.totalPeriodo)}</td>
    </tr>`).join('');

  const discounts = result.descontosDetalhados.map((item) => `
    <tr><td>${escapeHtml(item.descricao)}</td><td>${escapeHtml(item.observacao || '-')}</td><td class="n">${money(item.valor)}</td></tr>`).join('');

  const manualChanges = result.alteracoesManuais.map((item) => `
    <tr><td>${escapeHtml(item.campo)}</td><td class="n">${money(item.valorAutomatico)}</td><td class="n">${money(item.valorManual)}</td><td>${escapeHtml(item.motivo)}</td></tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Memória de Cálculo da Rescisão</title><style>
    @page{size:A4 portrait;margin:10mm}body{font-family:Arial,sans-serif;color:#111;font-size:10px;margin:0}h1{font-size:16px;text-align:center;margin:0 0 4px}h2{font-size:12px;margin:14px 0 5px;border-bottom:1px solid #444;padding-bottom:3px}.meta{text-align:center;margin-bottom:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}.box{border:1px solid #aaa;padding:6px;margin-bottom:8px;break-inside:avoid}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #aaa;padding:4px;vertical-align:top}th{background:#eee;text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}.total{font-weight:bold;background:#eee}.warn{border-left:4px solid #d97706;background:#fff7ed;padding:6px;margin:8px 0}.small{font-size:8px;color:#555}tr{break-inside:avoid}
  </style></head><body>
    <h1>MEMÓRIA DE CÁLCULO DA RESCISÃO</h1>
    <div class="meta"><b>${escapeHtml(data.empresa)}</b>${data.empresaCnpj ? ` · CNPJ ${escapeHtml(data.empresaCnpj)}` : ''}</div>
    <div class="box grid">
      <div><b>Funcionário:</b> ${escapeHtml(data.funcionario)}</div><div><b>CPF:</b> ${escapeHtml(data.cpf)}</div>
      <div><b>Cargo:</b> ${escapeHtml(data.cargo)}</div><div><b>Salário-base:</b> ${money(result.auditoria.salarioBaseUtilizado)}</div>
      <div><b>Admissão:</b> ${dateBr(data.admissao)}</div><div><b>Desligamento:</b> ${dateBr(data.desligamento)}</div>
      <div><b>Tipo:</b> ${escapeHtml(tipoRescisaoLabel(data.tipo))}</div><div><b>Aviso:</b> ${escapeHtml(data.aviso)} · ${result.diasAviso} dias</div>
      <div><b>Remuneração de cálculo:</b> ${money(result.baseRemuneracao)}</div><div><b>Projeção do contrato:</b> ${dateBr(result.dataProjetadaContrato)}</div>
    </div>
    <div class="warn"><b>PRÉVIA ESTIMATIVA:</b> esta memória é apenas referência interna. O cálculo rescisório oficial, valores finais, encargos e validações são de responsabilidade da contabilidade.</div>
    ${result.revisaoFeriasNecessaria ? '<div class="warn"><b>Observação:</b> há períodos de férias inferidos ou sem histórico completo. Esta condição não impede o envio para conferência contábil.</div>' : ''}

    <h2>Férias por período aquisitivo</h2>
    <table><thead><tr><th>Período aquisitivo</th><th>Situação</th><th>Direito</th><th>Usados</th><th>Abono</th><th>Saldo</th><th>Avos</th><th>Férias</th><th>1/3</th><th>Total</th></tr></thead><tbody>${periodRows || '<tr><td colspan="10">Sem períodos calculados.</td></tr>'}</tbody></table>

    <h2>Verbas</h2>
    <table><tbody>
      <tr><td>Saldo de salário (${result.diasSaldoSalario} dias / divisor ${result.divisorSaldoSalario})</td><td class="n">${money(result.saldoSalario)}</td></tr>
      <tr><td>Aviso-prévio (${result.diasAviso} dias)</td><td class="n">${money(result.avisoPrevioValor)}</td></tr>
      <tr><td>Férias vencidas</td><td class="n">${money(result.feriasVencidas)}</td></tr>
      <tr><td>Férias adquiridas em aberto</td><td class="n">${money(result.feriasEmAberto)}</td></tr>
      <tr><td>Férias proporcionais</td><td class="n">${money(result.feriasProporcionais)}</td></tr>
      <tr><td>1/3 férias vencidas</td><td class="n">${money(result.tercoFeriasVencidas)}</td></tr>
      <tr><td>1/3 férias em aberto</td><td class="n">${money(result.tercoFeriasEmAberto)}</td></tr>
      <tr><td>1/3 férias proporcionais</td><td class="n">${money(result.tercoFeriasProporcionais)}</td></tr>
      <tr><td>13º proporcional (${result.decimoTerceiroAvos}/12)</td><td class="n">${money(result.decimoTerceiroBruto)}</td></tr>
      <tr class="total"><td>TOTAL DE PROVENTOS</td><td class="n">${money(result.totalProventos)}</td></tr>
    </tbody></table>

    <h2>Descontos</h2>
    <table><thead><tr><th>Descrição</th><th>Observação</th><th>Valor</th></tr></thead><tbody>
      <tr><td>INSS</td><td>Saldo de salário + 13º em bases separadas</td><td class="n">${money(result.inss)}</td></tr>
      <tr><td>IRRF</td><td>Estimativa conforme tabela 2026</td><td class="n">${money(result.irrf)}</td></tr>
      ${discounts}
      <tr class="total"><td colspan="2">TOTAL DE DESCONTOS</td><td class="n">${money(result.totalDescontos)}</td></tr>
      <tr class="total"><td colspan="2">LÍQUIDO ESTIMADO</td><td class="n">${money(result.liquido)}</td></tr>
    </tbody></table>

    <h2>FGTS — valores extra-rescisão</h2>
    <table><tbody>
      <tr><td>Saldo FGTS informado/importado</td><td class="n">${money(result.saldoFgtsConsiderado)}</td></tr>
      <tr><td>FGTS das verbas calculadas (informativo)</td><td class="n">${money(result.fgtsMes)}</td></tr>
      <tr><td>Multa rescisória</td><td class="n">${money(result.multaFgts)}</td></tr>
    </tbody></table>

    ${manualChanges ? `<h2>Alterações manuais</h2><table><thead><tr><th>Campo</th><th>Automático</th><th>Manual</th><th>Motivo</th></tr></thead><tbody>${manualChanges}</tbody></table>` : ''}

    <h2>Auditoria</h2>
    <div class="box grid small">
      <div>Calculado em: ${escapeHtml(new Date(result.auditoria.calculadoEm).toLocaleString('pt-BR'))}</div>
      <div>Usuário: ${escapeHtml(result.auditoria.usuario)}</div>
      <div>Salário-base: ${money(result.auditoria.salarioBaseUtilizado)}</div>
      <div>Remuneração-base: ${money(result.auditoria.remuneracaoBaseUtilizada)}</div>
      <div>Avos de férias proporcionais: ${result.auditoria.avosFeriasProporcionais}/12</div>
      <div>Avos de 13º: ${result.auditoria.avosDecimoTerceiro}/12</div>
    </div>
    ${data.motivo ? `<div class="box"><b>Motivo:</b> ${escapeHtml(data.motivo)}</div>` : ''}
    ${data.observacoes ? `<div class="box"><b>Observações:</b> ${escapeHtml(data.observacoes)}</div>` : ''}
    <p class="small"><b>PRÉVIA ESTIMATIVA.</b> Documento de apoio gerado pelo TOPAC RH PRO. O cálculo rescisório oficial, valores finais, encargos, convenção coletiva e particularidades do vínculo devem ser apurados e validados pela contabilidade antes da quitação.</p>
  </body></html>`;
};

export const gerarRescisaoPdf = (data: RescisaoPdfData) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 10;
  const width = 190;
  let y = 12;
  const result = data.resultado;

  const ensureSpace = (height = 8) => {
    if (y + height <= 285) return;
    doc.addPage();
    y = 12;
  };
  const line = (label: string, value = '', bold = false) => {
    ensureSpace(7);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.text(label, margin, y);
    if (value) doc.text(value, margin + width, y, { align: 'right' });
    y += 5;
  };
  const title = (text: string) => {
    ensureSpace(10);
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(text, margin, y);
    doc.line(margin, y + 1.5, margin + width, y + 1.5);
    y += 6;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('MEMORIA DE CALCULO DA RESCISAO', 105, y, { align: 'center' });
  y += 6;
  doc.setFontSize(9);
  doc.text(data.empresa, 105, y, { align: 'center' });
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const estimateNotice = doc.splitTextToSize('PREVIA ESTIMATIVA - memoria de apoio interno. O calculo rescisorio oficial, valores finais e encargos devem ser apurados e validados pela contabilidade.', width);
  doc.text(estimateNotice, margin, y);
  y += estimateNotice.length * 4 + 4;

  line('Funcionario', data.funcionario);
  line('CPF', data.cpf);
  line('Cargo', data.cargo);
  line('Admissao / Desligamento', `${dateBr(data.admissao)} / ${dateBr(data.desligamento)}`);
  line('Tipo', tipoRescisaoLabel(data.tipo));
  line('Salario-base', money(result.auditoria.salarioBaseUtilizado));
  line('Remuneracao de calculo', money(result.baseRemuneracao));
  line('Aviso / Projecao', `${data.aviso} - ${result.diasAviso} dias - ${dateBr(result.dataProjetadaContrato)}`);

  title('FERIAS POR PERIODO AQUISITIVO');
  result.periodosFerias.forEach((period) => {
    ensureSpace(16);
    line(`${dateBr(period.periodoAquisitivoInicio)} a ${dateBr(period.periodoAquisitivoFim)} - ${period.situacao}`, money(period.totalPeriodo), true);
    line(`Direito ${period.diasDireito}d | usados ${period.diasJaUtilizados}d | abono ${period.diasAbono}d | saldo ${period.saldoDias}d | avos ${period.avos ?? '-'}/12`);
    if (period.observacao) {
      const chunks = doc.splitTextToSize(period.observacao, width);
      ensureSpace(chunks.length * 4 + 2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(chunks, margin, y);
      y += chunks.length * 4 + 2;
    }
  });

  title('PROVENTOS');
  line(`Saldo de salario - ${result.diasSaldoSalario} dias`, money(result.saldoSalario));
  line(`Aviso previo - ${result.diasAviso} dias`, money(result.avisoPrevioValor));
  line('Ferias vencidas', money(result.feriasVencidas));
  line('Ferias adquiridas em aberto', money(result.feriasEmAberto));
  line('Ferias proporcionais', money(result.feriasProporcionais));
  line('1/3 constitucional', money(result.tercoFerias));
  line(`13o proporcional - ${result.decimoTerceiroAvos}/12`, money(result.decimoTerceiroBruto));
  line('TOTAL PROVENTOS', money(result.totalProventos), true);

  title('DESCONTOS');
  line('INSS', money(result.inss));
  line('IRRF', money(result.irrf));
  result.descontosDetalhados.forEach((item) => line(item.descricao, money(item.valor)));
  line('TOTAL DESCONTOS', money(result.totalDescontos), true);
  line('LIQUIDO ESTIMADO', money(result.liquido), true);

  title('FGTS - EXTRA RESCISAO');
  line('Saldo FGTS informado/importado', money(result.saldoFgtsConsiderado));
  line('FGTS das verbas calculadas', money(result.fgtsMes));
  line('Multa rescisoria', money(result.multaFgts));

  if (result.alteracoesManuais.length) {
    title('ALTERACOES MANUAIS');
    result.alteracoesManuais.forEach((item) => {
      line(`${item.campo}: ${money(item.valorAutomatico)} -> ${money(item.valorManual)}`, item.motivo, true);
    });
  }

  title('AUDITORIA');
  line('Calculado em', new Date(result.auditoria.calculadoEm).toLocaleString('pt-BR'));
  line('Usuario', result.auditoria.usuario);
  line('Avos ferias / 13o', `${result.auditoria.avosFeriasProporcionais}/12 | ${result.auditoria.avosDecimoTerceiro}/12`);
  if (result.revisaoFeriasNecessaria) line('ATENCAO', 'Ha periodos de ferias que exigem conferencia historica.', true);

  const fileName = buildRescisaoPdfName(data.empresa, data.funcionario, data.desligamento?.slice(0, 7));
  const blob = doc.output('blob');
  return { blob, fileName, html: buildRescisaoHtml(data) };
};
