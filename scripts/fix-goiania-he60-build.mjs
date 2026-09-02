import fs from 'node:fs';

const files = {
  calculations: 'src/lib/calculations.ts',
  fechamento: 'src/pages/FechamentoPage.tsx',
  relatorio: 'src/pages/RelatorioPage.tsx',
  impressao: 'src/pages/RelatorioImpressaoPage.tsx',
};

const calcSource = fs.readFileSync(files.calculations, 'utf8');
const fechamentoSource = fs.readFileSync(files.fechamento, 'utf8');
const reportSource = fs.readFileSync(files.relatorio, 'utf8');
const pdfSource = fs.readFileSync(files.impressao, 'utf8');

const checks = [
  ['Goiânia identificada por ID', calcSource.includes("TOPAC_GYN_COMPANY_ID = 'c7a040f2-34b3-42a6-8a3a-f4bb64140ec6'")],
  ['Goiânia identificada por CNPJ', calcSource.includes("TOPAC_GYN_CNPJ = '50973087000208'")],
  ['regra central retorna 60 para Goiânia', calcSource.includes('isTopacGoiania(company) ? 60 : 50')],
  ['cálculo aceita percentual explícito', calcSource.includes('opts.horaExtraSemanalPct ?? getHoraExtraSemanalPercentual(emp.companyId)')],
  ['tela de fechamento usa rótulo dinâmico', fechamentoSource.includes('const heSemanalLabel = `HE ${heSemanalPct}%`')],
  ['relatório usa percentual dinâmico', reportSource.includes("isAllCompanies ? 'HE semanal' : `HE ${selectedHePct}%`")],
  ['relatório calcula por empresa', reportSource.includes('calcTotalFuncionario(emp, entry, diasUteis, getHoraExtraSemanalPercentual(emp.companyId))')],
  ['PDF calcula percentual pela empresa', pdfSource.includes('const heSemanalPct = getHoraExtraSemanalPercentual(company)')],
  ['PDF imprime cabeçalho HE dinâmico', pdfSource.includes('`HE${heSemanalPct} valor`')],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`[he60] validação falhou: ${label}`);
}

console.log('[he60] VALIDAÇÃO OK: TOPAC Goiânia = 60% no código-fonte, cálculo, tela, relatório e PDF. Nenhum arquivo foi reescrito no build.');