import fs from 'node:fs';

const file = 'src/components/EmailPdfModal.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
const oldLine = "    const baseBody = atestado ? buildAtestadoBody(draft.body || '') : admissional ? buildAdmissionalBody(draft.body || '') : draft.body || '';";
const newLine = "    const baseBody = atestado ? buildAtestadoBody(draft.body || '') : draft.body || '';";

if (source.includes(oldLine)) {
  source = source.replace(oldLine, newLine);
  fs.writeFileSync(file, source, 'utf8');
} else if (!source.includes(newLine)) {
  throw new Error('[admissional-email-template] linha de preparacao do corpo nao encontrada');
}

console.log('[admissional-email-template] corpo admissional completo preservado exatamente como gerado no pre-cadastro');
