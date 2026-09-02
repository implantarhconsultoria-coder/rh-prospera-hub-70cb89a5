import fs from 'node:fs';

const calcPath = 'src/lib/calculations.ts';
const fechamentoPath = 'src/pages/FechamentoPage.tsx';
const impressaoPath = 'src/pages/RelatorioImpressaoPage.tsx';
const relatorioPath = 'src/pages/RelatorioPage.tsx';

const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, source) => fs.writeFileSync(path, source, 'utf8');

const GYN_ID = 'c7a040f2-34b3-42a6-8a3a-f4bb64140ec6';
const GYN_CNPJ = '07291648000375';

let calc = read(calcPath);
calc = calc.replace(/export const TOPAC_GYN_COMPANY_ID = '[^']+';/, `export const TOPAC_GYN_COMPANY_ID = '${GYN_ID}';`);
if (/export const TOPAC_GYN_CNPJ = '[^']+';/.test(calc)) {
  calc = calc.replace(/export const TOPAC_GYN_CNPJ = '[^']+';/, `export const TOPAC_GYN_CNPJ = '${GYN_CNPJ}';`);
} else {
  calc = calc.replace(`export const TOPAC_GYN_COMPANY_ID = '${GYN_ID}';`, `export const TOPAC_GYN_COMPANY_ID = '${GYN_ID}';\nexport const TOPAC_GYN_CNPJ = '${GYN_CNPJ}';`);
}
if (!calc.includes("text.includes('topac-gyn')")) throw new Error('[he60] detector topac-gyn ausente');
if (!calc.includes("isTopacGoiania(company) ? 60 : 50")) throw new Error('[he60] regra central 60/50 ausente');
write(calcPath, calc);

let fechamento = read(fechamentoPath);
fechamento = fechamento.replace(
  `const heSemanalPct = getHoraExtraSemanalPercentual(selectedCompany);`,
  `const heSemanalPct = getHoraExtraSemanalPercentual(selectedCompanyData || selectedCompany);`,
);
fechamento = fechamento.replace(
  `const calcPayroll = (emp: typeof compEmps[number], entry: typeof compEntries[number]) => calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct });`,
  `const calcPayroll = (emp: typeof compEmps[number], entry: typeof compEntries[number]) => calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct, horaExtraSemanalPct: heSemanalPct });`,
);
if (!fechamento.includes('getHoraExtraSemanalPercentual(selectedCompanyData || selectedCompany)')) throw new Error('[he60] Fechamento não usa os dados reais da empresa');
if (!fechamento.includes('horaExtraSemanalPct: heSemanalPct')) throw new Error('[he60] Fechamento não passa percentual ao cálculo');
write(fechamentoPath, fechamento);

const impressao = read(impressaoPath);
if (!impressao.includes('const heSemanalPct = getHoraExtraSemanalPercentual(company);')) throw new Error('[he60] PDF não usa empresa real');
if (!impressao.includes('horaExtraSemanalPct: heSemanalPct')) throw new Error('[he60] PDF não passa percentual ao cálculo');
if (!impressao.includes('HE${heSemanalPct} qtd') || !impressao.includes('HE${heSemanalPct} valor')) throw new Error('[he60] PDF sem rótulo dinâmico');

const relatorio = read(relatorioPath);
if (!relatorio.includes('getHoraExtraSemanalPercentual')) throw new Error('[he60] Relatório sem regra HE semanal');

console.log(`[he60] REGRA TRAVADA: TOPAC FILIAL GOIANIA (${GYN_ID} / ${GYN_CNPJ}) = HE 60%. Demais = HE 50%.`);
