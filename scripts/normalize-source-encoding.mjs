import { readFile, writeFile } from 'node:fs/promises';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const files = ['src/pages/RecibosBeneficioImpressaoPage.tsx'];
const serverlessTsNoCheckFiles = [
  'api/aso-email-inbound.ts',
  'api/send-email-pdf.ts',
  'api/signup-fallback.ts',
];
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

for (const file of serverlessTsNoCheckFiles) {
  const filePath = join(process.cwd(), file);
  if (!existsSync(filePath)) {
    console.warn(`Aviso: Handler serverless não encontrado para ts-nocheck: ${file}`);
    continue;
  }

  const source = await readFile(filePath, 'utf8');
  if (source.startsWith('// @ts-nocheck')) continue;

  console.log(`Aplicando ts-nocheck no handler serverless: ${file}`);
  await writeFile(filePath, `// @ts-nocheck\n${source}`, 'utf8');
}
