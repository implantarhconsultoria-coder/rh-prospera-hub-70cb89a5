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

for (const [svg, prefix] of [
  ['topac-platform-new.svg', 'topac-platform'],
  ['topac-mecanicos-new.svg', 'topac-mecanicos'],
]) {
  await render(svg, `${prefix}-180.png`, 180);
  await render(svg, `${prefix}-192.png`, 192);
  await render(svg, `${prefix}-512.png`, 512);
}

console.log('Ícones TOPAC gerados com sucesso.');
