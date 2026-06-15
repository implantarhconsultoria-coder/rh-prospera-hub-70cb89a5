import { readFile, writeFile } from 'node:fs/promises';

const files = ['src/pages/RecibosBeneficioImpressaoPage.tsx'];
const decoder = new TextDecoder('utf-8', { fatal: false });

for (const file of files) {
  const source = await readFile(file);
  await writeFile(file, decoder.decode(source), 'utf8');
}
