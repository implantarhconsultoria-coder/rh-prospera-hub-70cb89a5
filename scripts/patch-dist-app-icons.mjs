import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');

async function patch(file, replacements) {
  const path = join(dist, file);
  let html = await readFile(path, 'utf8');
  for (const [pattern, value] of replacements) html = html.replace(pattern, value);
  await writeFile(path, html);
}

// Plataforma principal: URL física nova para impedir o iOS de reaproveitar o ícone antigo.
await patch('index.html', [
  [/href="\/favicon-32\.png[^\"]*"/g, 'href="/icons/topac-rhpro-oficial-20260908-1050-192.png"'],
  [/href="\/favicon-16\.png[^\"]*"/g, 'href="/icons/topac-rhpro-oficial-20260908-1050-192.png"'],
  [/href="\/apple-touch-icon\.png[^\"]*"/g, 'href="/icons/topac-rhpro-oficial-20260908-1050-180.png"'],
  [/href="\/manifest\.json[^\"]*"/g, 'href="/manifest-rhpro-install-20260908.json"'],
]);

// App Mecânicos: identidade completamente distinta da plataforma.
await patch('mecanicos.html', [
  [/href="\/icons\/topac-mecanicos-new\.svg[^\"]*"/g, 'href="/icons/topac-mecanicos-oficial-20260908-1050-192.png"'],
  [/href="\/icons\/topac-rh-pro\.svg[^\"]*"/g, 'href="/icons/topac-mecanicos-oficial-20260908-1050-192.png"'],
  [/href="\/apple-touch-icon\.png[^\"]*"/g, 'href="/icons/topac-mecanicos-oficial-20260908-1050-180.png"'],
  [/href="\/manifest-mecanico\.json[^\"]*"/g, 'href="/manifest-mecanicos-install-20260908.json"'],
]);

console.log('HTML final: TOPAC RH PRO e TOPAC Mecânicos com identidades físicas separadas.');
