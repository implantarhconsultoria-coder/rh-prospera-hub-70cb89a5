import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');

async function patch(file, replacements) {
  const path = join(dist, file);
  let html = await readFile(path, 'utf8');
  for (const [pattern, value] of replacements) html = html.replace(pattern, value);
  await writeFile(path, html);
}

await patch('index.html', [
  [/href="\/favicon-32\.png[^\"]*"/g, 'href="/icons/topac-platform-192.png?v=20260908-final-1"'],
  [/href="\/favicon-16\.png[^\"]*"/g, 'href="/icons/topac-platform-192.png?v=20260908-final-1"'],
  [/href="\/apple-touch-icon\.png[^\"]*"/g, 'href="/icons/topac-platform-180.png?v=20260908-final-1"'],
  [/href="\/manifest\.json[^\"]*"/g, 'href="/manifest.json?v=20260908-final-1"'],
]);

await patch('mecanicos.html', [
  [/href="\/icons\/topac-rh-pro\.svg[^\"]*"/g, 'href="/icons/topac-mecanicos-new.svg?v=20260908-final-1"'],
  [/href="\/apple-touch-icon\.png[^\"]*"/g, 'href="/icons/topac-mecanicos-180.png?v=20260908-final-1"'],
  [/href="\/manifest-mecanico\.json[^\"]*"/g, 'href="/manifest-mecanico.json?v=20260908-final-1"'],
]);

console.log('HTML final dos dois aplicativos atualizado.');
