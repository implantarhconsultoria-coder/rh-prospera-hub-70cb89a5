import { readFile, writeFile } from 'node:fs/promises';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const files = ['src/pages/RecibosBeneficioImpressaoPage.tsx'];
const decoder = new TextDecoder('utf-8', { fatal: false });

for (const file of files) {
  const filePath = join(process.cwd(), file);
  if (existsSync(filePath)) {
    console.log(`Normalizando encoding: ${file}`);
    const source = await readFile(filePath);
    await writeFile(filePath, decoder.decode(source), 'utf8');
  } else {
    console.warn(`Aviso: Arquivo não encontrado para normalização: ${file}`);
  }
}
