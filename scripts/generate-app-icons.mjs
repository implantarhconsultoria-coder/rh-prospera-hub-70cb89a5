import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = process.cwd();
const iconsDir = join(root, 'public', 'icons');
await mkdir(iconsDir, { recursive: true });

async function render(svgFile, outputFile, size) {
  const svg = await readFile(join(iconsDir, svgFile));
  const image = await loadImage(svg);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, 0, 0, size, size);
  await writeFile(join(iconsDir, outputFile), canvas.toBuffer('image/png'));
}

const apps = [
  {
    svg: 'topac-platform-new.svg',
    legacy: 'topac-platform',
    install: 'topac-rhpro-oficial-20260908-1050',
  },
  {
    svg: 'topac-mecanicos-new.svg',
    legacy: 'topac-mecanicos',
    install: 'topac-mecanicos-oficial-20260908-1050',
  },
];

for (const { svg, legacy, install } of apps) {
  for (const size of [180, 192, 512]) {
    await render(svg, `${legacy}-${size}.png`, size);
    // Nome físico novo para quebrar o cache persistente de ícones do iOS/Android.
    await render(svg, `${install}-${size}.png`, size);
  }
}

console.log('Ícones TOPAC separados e versionados fisicamente com sucesso.');
