import fs from 'node:fs';

const asoPagePath = 'src/pages/ASOPage.tsx';
const pdfPath = 'src/lib/pdfGenerator.ts';

const replaceOnce = (source, from, to, label) => {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`[aso-demissional-date] trecho nao encontrado: ${label}`);
  return source.replace(from, to);
};

let asoPage = fs.readFileSync(asoPagePath, 'utf8');

asoPage = replaceOnce(
  asoPage,
  `<div><label className="text-xs text-muted-foreground block mb-1">Data do Exame</label>\n              <Input type="date" value={dataExame} onChange={e => setDataExame(e.target.value)} /></div>`,
  `<div><label className="text-xs text-muted-foreground block mb-1">{tipoExame === 'Demissional' ? 'Data prevista do exame demissional' : 'Data do Exame'}</label>\n              <Input type="date" value={dataExame} onChange={e => setDataExame(e.target.value)} /></div>`,
  'label da data do exame',
);

asoPage = replaceOnce(
  asoPage,
  `  const handlePrint = async () => {\n    if (!emp) { toast.error('Selecione um funcionário'); return; }\n    const pdf = gerarPdfAtual();`,
  `  const handlePrint = async () => {\n    if (!emp) { toast.error('Selecione um funcionário'); return; }\n    if (tipoExame === 'Demissional' && !dataExame) { toast.error('Informe a data prevista do exame demissional.'); return; }\n    const pdf = gerarPdfAtual();`,
  'validacao na impressao',
);

asoPage = replaceOnce(
  asoPage,
  `  const handleEnviarEmailAso = async () => {\n    if (!emp) { toast.error('Selecione um funcionario'); return; }\n    const pdf = gerarPdfAtual();`,
  `  const handleEnviarEmailAso = async () => {\n    if (!emp) { toast.error('Selecione um funcionario'); return; }\n    if (tipoExame === 'Demissional' && !dataExame) { toast.error('Informe a data prevista do exame demissional.'); return; }\n    const pdf = gerarPdfAtual();`,
  'validacao no e-mail',
);

asoPage = replaceOnce(
  asoPage,
  `      \`Data sugerida: \${dataExame ? new Date(dataExame).toLocaleDateString('pt-BR') : 'A definir'}\`,` ,
  `      \`\${tipoExame === 'Demissional' ? 'Data prevista do exame' : 'Data sugerida'}: \${dataExame ? new Date(dataExame).toLocaleDateString('pt-BR') : 'A definir'}\`,` ,
  'rotulo da data no e-mail',
);

fs.writeFileSync(asoPagePath, asoPage);

let pdf = fs.readFileSync(pdfPath, 'utf8');

pdf = replaceOnce(
  pdf,
  `const resolveAsoExamDate = (date?: string) => {\n  const value = String(date || '').trim();\n  const today = localIsoDate();\n  const tomorrow = localIsoDate(1);\n  return !value || value === today ? tomorrow : value;\n};`,
  `const resolveAsoExamDate = (date?: string) => {\n  const value = String(date || '').trim();\n  const tomorrow = localIsoDate(1);\n  return value || tomorrow;\n};`,
  'preservar data exata informada',
);

pdf = replaceOnce(
  pdf,
  `    ['Data do Exame', fmtBR(dataExame)], ['Tipo', d.tipoExame],`,
  `    [normalizePlain(d.tipoExame).includes('DEMISSIONAL') ? 'Data prevista do exame' : 'Data do Exame', fmtBR(dataExame)], ['Tipo', d.tipoExame],`,
  'ficha ASO - rotulo da data',
);

pdf = replaceOnce(
  pdf,
  `  write(\`DATA: \${fmtBR(dataExame)}\`, x + 91, topY + 5.4, { size: 10, bold: true });`,
  `  write(\`\${tipoNormalizado.includes('DEMISSIONAL') ? 'DATA PREVISTA DO EXAME' : 'DATA'}: \${fmtBR(dataExame)}\`, x + 91, topY + 5.4, { size: 10, bold: true });`,
  'guia Goiania - data prevista',
);

pdf = replaceOnce(
  pdf,
  `  write(\`DATA DO EXAME: \${fmtBR(dataExame)}\`, x + 93, y + 12, { size: 9.5, bold: true });`,
  `  write(\`\${normalizePlain(tipoExame).includes('DEMISSIONAL') ? 'DATA PREVISTA DO EXAME' : 'DATA DO EXAME'}: \${fmtBR(dataExame)}\`, x + 93, y + 12, { size: 9.5, bold: true });`,
  'guia padrao - data prevista',
);

fs.writeFileSync(pdfPath, pdf);
console.log('[aso-demissional-date] data prevista do demissional aplicada e preservada exatamente na guia');
