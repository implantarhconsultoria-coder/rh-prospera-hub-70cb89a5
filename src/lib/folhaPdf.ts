import { formatCurrency } from './calculations';
import { cleanDocumentText } from './textClean';

export interface HoleriteLinha {
  descricao: string;
  referencia: string;
  proventos: number;
  descontos: number;
}

export interface HoleriteData {
  empresa: string;
  competencia: string;
  funcionario: string;
  cargo: string;
  registro: string;
  cpf: string;
  admissao: string;
  salarioBase: number;
  linhas: HoleriteLinha[];
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  baseINSS: number;
  baseFGTS: number;
  baseIRRF: number;
  fgtsValor: number;
}

const css = `
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }
  h1 { margin: 0 0 4px; font-size: 16px; }
  h2 { margin: 14px 0 6px; font-size: 12px; border-bottom: 1px solid #999; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
  th { background: #eee; font-weight: bold; }
  td.num { text-align: right; }
  .head { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .totals { margin-top: 8px; }
  .totals td { font-weight: bold; }
  .liq { background: #f4f4f4; font-size: 14px; padding: 8px; margin-top: 8px; text-align: right; border: 2px solid #000; }
  @media print { body { padding: 12px; } }
`;

export const buildHoleriteHtml = (h: HoleriteData) => {
  const linhasHtml = h.linhas.map(l => `
    <tr>
      <td>${l.descricao}</td>
      <td>${l.referencia || ''}</td>
      <td class="num">${l.proventos > 0 ? formatCurrency(l.proventos) : ''}</td>
      <td class="num">${l.descontos > 0 ? formatCurrency(l.descontos) : ''}</td>
    </tr>
  `).join('');

  return cleanDocumentText(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Holerite ${h.funcionario}</title><style>${css}</style></head><body>
    <h1>Recibo de Pagamento de Salário</h1>
    <div class="head">
      <div><strong>Empresa:</strong> ${h.empresa}</div>
      <div><strong>Competência:</strong> ${h.competencia}</div>
    </div>
    <table>
      <tr><th>Funcionário</th><td colspan="3">${h.funcionario}</td></tr>
      <tr>
        <th>Cargo</th><td>${h.cargo}</td>
        <th>Registro</th><td>${h.registro}</td>
      </tr>
      <tr>
        <th>CPF</th><td>${h.cpf}</td>
        <th>Admissão</th><td>${h.admissao}</td>
      </tr>
    </table>
    <h2>Eventos do mês</h2>
    <table>
      <thead><tr><th>Descrição</th><th>Referência</th><th>Proventos</th><th>Descontos</th></tr></thead>
      <tbody>${linhasHtml}</tbody>
      <tfoot class="totals">
        <tr><td colspan="2">Totais</td>
          <td class="num">${formatCurrency(h.totalProventos)}</td>
          <td class="num">${formatCurrency(h.totalDescontos)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="liq"><strong>Líquido a receber:</strong> ${formatCurrency(h.liquido)}</div>
    <table style="margin-top:10px">
      <tr>
        <th>Base INSS</th><td class="num">${formatCurrency(h.baseINSS)}</td>
        <th>Base FGTS</th><td class="num">${formatCurrency(h.baseFGTS)}</td>
        <th>FGTS do mês</th><td class="num">${formatCurrency(h.fgtsValor)}</td>
        <th>Base IRRF</th><td class="num">${formatCurrency(h.baseIRRF)}</td>
      </tr>
    </table>
    <p style="margin-top:24px; font-size:10px;">Declaro ter recebido a importância líquida acima discriminada.</p>
    <p style="margin-top:30px; font-size:10px;">_____________________________________<br>Assinatura do funcionário</p>
  </body></html>`);
};

export interface FolhaConsolidadaLinha {
  funcionario: string;
  cargo: string;
  bruto: number;
  inss: number;
  irrf: number;
  outros: number;
  liquido: number;
  fgts: number;
}

export const buildFolhaConsolidadaHtml = (
  empresa: string,
  competencia: string,
  linhas: FolhaConsolidadaLinha[],
) => {
  const totalBruto = linhas.reduce((s, l) => s + l.bruto, 0);
  const totalINSS = linhas.reduce((s, l) => s + l.inss, 0);
  const totalIRRF = linhas.reduce((s, l) => s + l.irrf, 0);
  const totalOutros = linhas.reduce((s, l) => s + l.outros, 0);
  const totalLiquido = linhas.reduce((s, l) => s + l.liquido, 0);
  const totalFGTS = linhas.reduce((s, l) => s + l.fgts, 0);

  const rows = linhas.map(l => `
    <tr>
      <td>${l.funcionario}</td>
      <td>${l.cargo}</td>
      <td class="num">${formatCurrency(l.bruto)}</td>
      <td class="num">${formatCurrency(l.inss)}</td>
      <td class="num">${formatCurrency(l.irrf)}</td>
      <td class="num">${formatCurrency(l.outros)}</td>
      <td class="num"><strong>${formatCurrency(l.liquido)}</strong></td>
      <td class="num">${formatCurrency(l.fgts)}</td>
    </tr>
  `).join('');

  return cleanDocumentText(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Folha ${empresa} ${competencia}</title><style>${css}</style></head><body>
    <h1>Folha de Pagamento</h1>
    <div class="head">
      <div><strong>Empresa:</strong> ${empresa}</div>
      <div><strong>Competência:</strong> ${competencia}</div>
    </div>
    <table>
      <thead><tr>
        <th>Funcionário</th><th>Cargo</th>
        <th>Bruto</th><th>INSS</th><th>IRRF</th><th>Outros desc.</th><th>Líquido</th><th>FGTS</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot class="totals"><tr>
        <td colspan="2">Totais</td>
        <td class="num">${formatCurrency(totalBruto)}</td>
        <td class="num">${formatCurrency(totalINSS)}</td>
        <td class="num">${formatCurrency(totalIRRF)}</td>
        <td class="num">${formatCurrency(totalOutros)}</td>
        <td class="num">${formatCurrency(totalLiquido)}</td>
        <td class="num">${formatCurrency(totalFGTS)}</td>
      </tr></tfoot>
    </table>
  </body></html>`);
};
