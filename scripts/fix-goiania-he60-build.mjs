import fs from 'node:fs';

const files = {
  calculations: 'src/lib/calculations.ts',
  fechamento: 'src/pages/FechamentoPage.tsx',
  relatorio: 'src/pages/RelatorioPage.tsx',
  impressao: 'src/pages/RelatorioImpressaoPage.tsx',
};

const patch = (path, changes) => {
  let source = fs.readFileSync(path, 'utf8');
  let changed = false;

  for (const { oldText, newText, label, already } of changes) {
    if (already && source.includes(already)) continue;
    const count = source.split(oldText).length - 1;
    if (count !== 1) throw new Error(`[he60] ${path} / ${label}: esperado 1 trecho, encontrado ${count}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (changed) fs.writeFileSync(path, source, 'utf8');
  return changed;
};

patch(files.calculations, [
  {
    label: 'opcao percentual HE semanal',
    oldText: `type PayrollOptions = {\n  diasUteis: number;\n  comissaoPct: number;\n  domingosFeriados?: number;\n  dependentes?: number;\n};`,
    newText: `type PayrollOptions = {\n  diasUteis: number;\n  comissaoPct: number;\n  domingosFeriados?: number;\n  dependentes?: number;\n  horaExtraSemanalPct?: number;\n};`,
    already: 'horaExtraSemanalPct?: number;',
  },
  {
    label: 'calculo central HE semanal',
    oldText: `  const heSemanalPct = getHoraExtraSemanalPercentual(emp.companyId);`,
    newText: `  const heSemanalPct = opts.horaExtraSemanalPct ?? getHoraExtraSemanalPercentual(emp.companyId);`,
    already: 'opts.horaExtraSemanalPct ?? getHoraExtraSemanalPercentual(emp.companyId)',
  },
  {
    label: 'assinatura calcTotalFuncionario',
    oldText: `export const calcTotalFuncionario = (emp: Employee, entry: MonthlyEntry, diasUteis: number = 22) => {`,
    newText: `export const calcTotalFuncionario = (emp: Employee, entry: MonthlyEntry, diasUteis: number = 22, horaExtraSemanalPct?: number) => {`,
    already: 'diasUteis: number = 22, horaExtraSemanalPct?: number',
  },
  {
    label: 'calculo total funcionario HE semanal',
    oldText: `  const he50Val = calcHE50(baseHora, entry.he50, getHoraExtraSemanalPercentual(emp.companyId));`,
    newText: `  const he50Val = calcHE50(baseHora, entry.he50, horaExtraSemanalPct ?? getHoraExtraSemanalPercentual(emp.companyId));`,
    already: 'horaExtraSemanalPct ?? getHoraExtraSemanalPercentual(emp.companyId)',
  },
]);

patch(files.fechamento, [
  {
    label: 'fechamento usa percentual da empresa',
    oldText: `  const calcPayroll = (emp: typeof compEmps[number], entry: typeof compEntries[number]) => calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct });`,
    newText: `  const calcPayroll = (emp: typeof compEmps[number], entry: typeof compEntries[number]) => calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct, horaExtraSemanalPct: heSemanalPct });`,
    already: 'horaExtraSemanalPct: heSemanalPct',
  },
]);

patch(files.relatorio, [
  {
    label: 'import percentual semanal',
    oldText: `import { calcTotalFuncionario, calcFalta, calcAtraso, formatCurrency, formatDate } from '@/lib/calculations';`,
    newText: `import { calcTotalFuncionario, calcFalta, calcAtraso, formatCurrency, formatDate, getHoraExtraSemanalPercentual } from '@/lib/calculations';`,
    already: 'formatDate, getHoraExtraSemanalPercentual',
  },
  {
    label: 'percentual selecionado',
    oldText: `  const isAllCompanies = selectedCompany === ALL_COMPANIES;\n  const selectedCompanies = isAllCompanies ? companies : companies.filter(c => c.id === selectedCompany);`,
    newText: `  const isAllCompanies = selectedCompany === ALL_COMPANIES;\n  const selectedHePct = !isAllCompanies && selectedCompany ? getHoraExtraSemanalPercentual(selectedCompany) : null;\n  const selectedCompanies = isAllCompanies ? companies : companies.filter(c => c.id === selectedCompany);`,
    already: 'const selectedHePct = !isAllCompanies',
  },
  {
    label: 'calculo relatorio percentual explicito',
    oldText: `      const calc = calcTotalFuncionario(emp, entry, diasUteis);`,
    newText: `      const calc = calcTotalFuncionario(emp, entry, diasUteis, getHoraExtraSemanalPercentual(emp.companyId));`,
    already: 'calcTotalFuncionario(emp, entry, diasUteis, getHoraExtraSemanalPercentual(emp.companyId))',
  },
  {
    label: 'cabecalho HE dinamico',
    oldText: `(isAllCompanies ? ['Empresa'] : []).concat(['Nome','Cargo','Salário','HE 50%','HE 100%','Adic.','Insal.','Peric.','VR','VT','Faltas','Adiant.','Desc.','Líquido']).map(h => (`,
    newText: `(isAllCompanies ? ['Empresa'] : []).concat(['Nome','Cargo','Salário', isAllCompanies ? 'HE semanal' : \`HE ${selectedHePct}%\`, 'HE 100%','Adic.','Insal.','Peric.','VR','VT','Faltas','Adiant.','Desc.','Líquido']).map(h => (`,
    already: "isAllCompanies ? 'HE semanal'",
  },
  {
    label: 'celula multiempresa mostra percentual',
    oldText: `                    <td className="px-2 py-2">{formatCurrency(r.he50Val)}</td>`,
    newText: `                    <td className="px-2 py-2">{isAllCompanies ? \`HE ${getHoraExtraSemanalPercentual(r.emp.companyId)}% · ${formatCurrency(r.he50Val)}\` : formatCurrency(r.he50Val)}</td>`,
    already: 'getHoraExtraSemanalPercentual(r.emp.companyId)',
  },
]);

patch(files.impressao, [
  {
    label: 'import percentual no PDF',
    oldText: `import { calcPayrollBreakdown, formatCurrency, getComissaoPercentual } from '@/lib/calculations';`,
    newText: `import { calcPayrollBreakdown, formatCurrency, getComissaoPercentual, getHoraExtraSemanalPercentual } from '@/lib/calculations';`,
    already: 'getComissaoPercentual, getHoraExtraSemanalPercentual',
  },
  {
    label: 'percentual da empresa no PDF',
    oldText: `    const fechamento = getFechamento(company.id, competencia);\n    const comissaoPct = getComissaoPercentual(company);\n    const totals = emptyTotals();`,
    newText: `    const fechamento = getFechamento(company.id, competencia);\n    const comissaoPct = getComissaoPercentual(company);\n    const heSemanalPct = getHoraExtraSemanalPercentual(company.id);\n    const totals = emptyTotals();`,
    already: 'const heSemanalPct = getHoraExtraSemanalPercentual(company.id);',
  },
  {
    label: 'calculo PDF usa percentual explicito',
    oldText: `      const calc = calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct });`,
    newText: `      const calc = calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct, horaExtraSemanalPct: heSemanalPct });`,
    already: 'horaExtraSemanalPct: heSemanalPct',
  },
  {
    label: 'retorno percentual PDF',
    oldText: `    return { company, fechamento, rows, totals };`,
    newText: `    return { company, fechamento, rows, totals, heSemanalPct };`,
    already: 'rows, totals, heSemanalPct',
  },
  {
    label: 'desestrutura percentual PDF',
    oldText: `          {companyReports.map(({ company, fechamento, rows, totals }) => (`,
    newText: `          {companyReports.map(({ company, fechamento, rows, totals, heSemanalPct }) => (`,
    already: 'company, fechamento, rows, totals, heSemanalPct',
  },
  {
    label: 'rotulos dinamicos PDF',
    oldText: `                    {columns.map(column => (\n                      <th\n                        key={column.label}\n                        className={\`border border-gray-400 px-1 py-1 font-semibold ${column.numeric ? 'numeric' : 'text-left'}\`}\n                      >\n                        {column.label}\n                      </th>\n                    ))}`,
    newText: `                    {columns.map(column => {\n                      const displayLabel = column.label === 'HE50 qtd'\n                        ? \`HE${heSemanalPct} qtd\`\n                        : column.label === 'HE50 valor'\n                          ? \`HE${heSemanalPct} valor\`\n                          : column.label;\n                      return (\n                        <th\n                          key={column.label}\n                          className={\`border border-gray-400 px-1 py-1 font-semibold ${column.numeric ? 'numeric' : 'text-left'}\`}\n                        >\n                          {displayLabel}\n                        </th>\n                      );\n                    })}`,
    already: 'const displayLabel = column.label',
  },
]);

const calcSource = fs.readFileSync(files.calculations, 'utf8');
const reportSource = fs.readFileSync(files.relatorio, 'utf8');
const pdfSource = fs.readFileSync(files.impressao, 'utf8');
const fechamentoSource = fs.readFileSync(files.fechamento, 'utf8');

for (const [label, ok] of [
  ['regra GYN 60', calcSource.includes("companyId === TOPAC_GYN_COMPANY_ID ? 60 : 50")],
  ['calculo central explicito', calcSource.includes('opts.horaExtraSemanalPct ?? getHoraExtraSemanalPercentual(emp.companyId)')],
  ['relatorio dinamico', reportSource.includes("isAllCompanies ? 'HE semanal'")],
  ['PDF dinamico', pdfSource.includes('`HE${heSemanalPct} valor`')],
  ['fechamento explicito', fechamentoSource.includes('horaExtraSemanalPct: heSemanalPct')],
]) {
  if (!ok) throw new Error(`[he60] verificacao falhou: ${label}`);
}

console.log('[he60] Goiania fixada em 60% no calculo, tela e PDF; demais empresas permanecem 50%.');
