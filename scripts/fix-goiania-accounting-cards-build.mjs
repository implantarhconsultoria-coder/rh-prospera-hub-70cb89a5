import fs from 'node:fs';

const file = 'src/pages/contabilidade/ContabilidadeFolhaFluxo.tsx';
if (!fs.existsSync(file)) process.exit(0);

const current = fs.readFileSync(file, 'utf8');
const blocked = "  if (portal !== 'principal') return null;\n";
if (!current.includes(blocked)) {
  console.log('[goiania-accounting-cards] cards já liberados para Goiânia');
  process.exit(0);
}

fs.writeFileSync(file, current.replace(blocked, ''));
console.log('[goiania-accounting-cards] Adiantamento e Pagamento liberados no portal Goiânia');
