import fs from 'node:fs';

const path = 'src/app-mecanico/MechanicFaceCapture.tsx';
if (!fs.existsSync(path)) {
  console.log('[mechanic-face-capture] componente ainda não existe; nada a aplicar');
  process.exit(0);
}

let source = fs.readFileSync(path, 'utf8');
const before = `          submittingRef.current = true;\n          stop();\n          const response = await fetch("/api/mechanic-face", {`;
const after = `          const snapshot = captureJpeg(currentVideo);\n          submittingRef.current = true;\n          stop();\n          const response = await fetch("/api/mechanic-face", {`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('[mechanic-face-capture] trecho de captura não encontrado');
  source = source.replace(before, after);
}
source = source.replace('              snapshot: captureJpeg(currentVideo),', '              snapshot,');
fs.writeFileSync(path, source, 'utf8');
console.log('[mechanic-face-capture] frame capturado antes de encerrar a camera');
