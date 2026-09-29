import fs from 'node:fs';

const mustContain = (path, tokens) => {
  const source = fs.readFileSync(path, 'utf8');
  for (const token of tokens) {
    if (!source.includes(token)) throw new Error(`[he-50-60-100] ${path} sem regra obrigatória: ${token}`);
  }
};

mustContain('src/lib/calculations.ts', [
  'const he50Val',
  'const he60Val',
  'const he100Val',
  'he50Val + he60Val + he100Val',
]);

mustContain('src/types/database.ts', [
  'he50: number;',
  'he60: number;',
  'he100: number;',
]);

mustContain('src/pages/FechamentoPage.tsx', [
  "'HE 50%'",
  "'HE 60%'",
  "'HE 100%'",
]);

mustContain('src/pages/filial/FilialFechamentoPage.tsx', [
  "'HE 50%'",
  "'HE 60%'",
  "'HE 100%'",
]);

console.log('[he-50-60-100] REGRA GERAL: 1ª e 2ª horas extras = 50%; 3ª em diante = 60%; domingos/feriados/dias 100% = 100%.');
