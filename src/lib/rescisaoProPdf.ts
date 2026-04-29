/**
 * Layout PROFISSIONAL da plataforma para rescisão.
 * Continua usando os valores TRCT (calculados em src/lib/trctCalc.ts) como base,
 * mas exibe agrupado e amigável — não o layout seco do TRCT oficial.
 */
import { formatCurrency } from './calculations';
import type { TrctResultado } from './trctCalc';
import { causaLabel, type CausaAfastamento } from './trctCalc';

export interface RescisaoProPdfData {
  empresaNome: string;
  empresaCnpj?: string;
  funcionarioNome: string;
  cpf: string;
  cargo: string;
  ctps?: string;
  pis?: string;
  dataAdmissao: string;
  dataAfastamento: string;
  dataAviso?: string;
  causa: CausaAfastamento;
  avisoTrabalhado: boolean;
  remuneracaoMesAnterior: number;
  observacoes?: string;
  resultado: TrctResultado;
  // valores brutos digitados (apenas informativos)
  vt?: number;
  vr?: number;
  adiantamento?: number;
  arredondamento?: number;
}

const css = `
  @page { size: A4; margin: 16mm; }
  body { font-family: 'Helvetica', Arial, sans-serif; font-size: 10.5px; color: #1a1a1a; }
  .header { display: flex; align-items: center; justify-content: space-between;
            border-bottom: 3px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
  .brand h1 { margin: 0; font-size: 17px; color: #0f172a; letter-spacing: .3px; }
  .brand p  { margin: 2px 0 0; font-size: 10px; color: #475569; }
  .meta { text-align: right; font-size: 10px; color: #475569; }
  .section-title { background: #0f172a; color: #fff; padding: 6px 10px; font-size: 11px;
                   font-weight: 600; letter-spacing: .4px; margin: 14px 0 0; border-radius: 4px 4px 0 0; }
  .card { border: 1px solid #cbd5e1; border-top: none; padding: 10px; border-radius: 0 0 6px 6px;
          margin-bottom: 10px; background: #f8fafc; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 14px; }
  .grid .full { grid-column: 1 / -1; }
  .label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .4px; }
  .value { font-size: 11px; font-weight: 600; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10.5px; }
  thead th { background: #e2e8f0; color: #0f172a; padding: 5px 8px; text-align: left; font-weight: 600; }
  tbody td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; background: #f1f5f9; padding: 6px 8px; }
  .totais { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 12px; }
  .totais .box { border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px;
                 text-align: right; background: #f8fafc; }
  .totais .liquido { background: #0f172a; color: #fff; border-color: #0f172a; }
  .totais .label { color: inherit; opacity: .8; }
  .totais .value { font-size: 16px; }
  .obs { margin-top: 12px; padding: 10px; border: 1px dashed #94a3b8;
         background: #fffbea; font-size: 10.5px; border-radius: 6px; }
  .ass { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
  .ass .line { border-top: 1px solid #0f172a; padding-top: 4px; text-align: center; font-size: 10px; }
  .footer { margin-top: 16px; font-size: 9px; color: #64748b; text-align: center;
            border-top: 1px solid #e2e8f0; padding-top: 6px; }
`;

const fmtDate = (d?: string) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d; }
};

const row = (label: string, val: number) =>
  val > 0 ? `<tr><td>${label}</td><td class="num">${formatCurrency(val)}</td></tr>` : '';

export const buildRescisaoProHtml = (d: RescisaoProPdfData) => {
  const r = d.resultado;
  const verbas = [
    ['Saldo de salário', r.v50_saldoDiasSalario],
    ['Comissões', r.v51_comissoes],
    ['Gratificação', r.v52_gratificacao],
    ['Insalubridade', r.v53_insalubridade],
    ['Periculosidade', r.v54_periculosidade],
    ['Adicional noturno', r.v55_adicNoturno],
    ['Horas extras', r.v56_horasExtras],
    ['Gorjetas', r.v57_gorjetas],
    ['DSR', r.v58_dsr],
    ['Reflexo DSR', r.v59_reflexoDsr],
    ['Multa Art. 477', r.v60_multa477],
    ['Multa Art. 479', r.v61_multa479],
    ['Salário-família', r.v62_salarioFamilia],
    ['13º proporcional', r.v63_13Proporcional],
    ['13º exercícios anteriores', r.v64_13Exercicio],
    ['Férias proporcionais', r.v65_feriasProporcionais],
    ['Férias vencidas', r.v66_feriasVencidas],
    ['1/3 sobre férias', r.v68_tercoFerias],
    ['Aviso prévio indenizado', r.v69_avisoIndenizado],
    ['13º sobre aviso', r.v70_13SobreAviso],
    ['Férias sobre aviso', r.v71_feriasSobreAviso],
  ] as const;
  const deducoes = [
    ['Pensão alimentícia', r.d100_pensao],
    ['Adiantamento salarial', r.d101_adiantamento],
    ['Adiantamento 13º', r.d102_adiant13],
    ['Aviso indenizado (desconto)', r.d103_avisoIndenizado],
    ['Indenização Art. 480', r.d104_indenizacao480],
    ['Empréstimo consignado', r.d105_emprestimoConsig],
    ['Vale-transporte', r.d106_valeTransporte],
    ['INSS', r.d112_1_inss],
    ['INSS sobre 13º', r.d112_2_inss13],
    ['IRRF', r.d114_1_irrf],
    ['IRRF sobre 13º', r.d114_2_irrf13],
    ['Arredondamento', r.d115_2_arredondamento],
    ['Vale-refeição', r.d115_3_valeRefeicao],
  ] as const;

  const verbasRows = verbas.map(([l, v]) => row(l, Number(v) || 0)).join('');
  const dedRows = deducoes.map(([l, v]) => row(l, Number(v) || 0)).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Rescisão - ${d.funcionarioNome}</title><style>${css}</style></head>
  <body>
    <div class="header">
      <div class="brand">
        <h1>Termo de Rescisão de Contrato de Trabalho</h1>
        <p>${d.empresaNome}${d.empresaCnpj ? ' — CNPJ ' + d.empresaCnpj : ''}</p>
      </div>
      <div class="meta">
        <div>Emitido em ${new Date().toLocaleDateString('pt-BR')}</div>
        <div>Cálculo conforme TRCT (MTE)</div>
      </div>
    </div>

    <div class="section-title">Dados do Funcionário</div>
    <div class="card">
      <div class="grid">
        <div><div class="label">Nome</div><div class="value">${d.funcionarioNome}</div></div>
        <div><div class="label">CPF</div><div class="value">${d.cpf || '—'}</div></div>
        <div><div class="label">Cargo</div><div class="value">${d.cargo || '—'}</div></div>
        <div><div class="label">Admissão</div><div class="value">${fmtDate(d.dataAdmissao)}</div></div>
        <div><div class="label">Aviso prévio</div><div class="value">${fmtDate(d.dataAviso)} — ${d.avisoTrabalhado ? 'Trabalhado' : 'Indenizado'} (${r.diasAviso} dias)</div></div>
        <div><div class="label">Afastamento</div><div class="value">${fmtDate(d.dataAfastamento)}</div></div>
        <div class="full"><div class="label">Causa</div><div class="value">${causaLabel(d.causa)}</div></div>
        <div><div class="label">Remuneração mês anterior</div><div class="value">${formatCurrency(d.remuneracaoMesAnterior)}</div></div>
        ${d.vt ? `<div><div class="label">Vale-transporte</div><div class="value">${formatCurrency(d.vt)}</div></div>` : ''}
        ${d.vr ? `<div><div class="label">Vale-refeição</div><div class="value">${formatCurrency(d.vr)}</div></div>` : ''}
      </div>
    </div>

    <div class="section-title">Verbas Rescisórias (Proventos)</div>
    <div class="card">
      <table>
        <thead><tr><th>Descrição</th><th class="num">Valor</th></tr></thead>
        <tbody>${verbasRows || '<tr><td colspan="2" style="text-align:center;color:#64748b">Sem proventos calculados</td></tr>'}</tbody>
        <tfoot><tr><td>Total Bruto</td><td class="num">${formatCurrency(r.totalBruto)}</td></tr></tfoot>
      </table>
    </div>

    <div class="section-title">Descontos Rescisórios</div>
    <div class="card">
      <table>
        <thead><tr><th>Descrição</th><th class="num">Valor</th></tr></thead>
        <tbody>${dedRows || '<tr><td colspan="2" style="text-align:center;color:#64748b">Sem descontos</td></tr>'}</tbody>
        <tfoot><tr><td>Total Deduções</td><td class="num">${formatCurrency(r.totalDedu)}</td></tr></tfoot>
      </table>
    </div>

    <div class="totais">
      <div class="box"><div class="label">Total Bruto</div><div class="value">${formatCurrency(r.totalBruto)}</div></div>
      <div class="box"><div class="label">Total Deduções</div><div class="value">${formatCurrency(r.totalDedu)}</div></div>
      <div class="box liquido"><div class="label">Líquido a Receber</div><div class="value">${formatCurrency(r.liquidoRescisorio)}</div></div>
    </div>

    ${d.observacoes ? `<div class="obs"><strong>Observações:</strong> ${d.observacoes}</div>` : ''}

    <div class="ass">
      <div class="line">Assinatura do Empregado</div>
      <div class="line">Assinatura do Empregador</div>
    </div>

    <div class="footer">
      Este documento é gerado eletronicamente pela plataforma de RH e segue como base os valores
      do TRCT oficial (MTE). Ajustes manuais de rubricas seguem registrados no histórico.
    </div>
  </body></html>`;
};
