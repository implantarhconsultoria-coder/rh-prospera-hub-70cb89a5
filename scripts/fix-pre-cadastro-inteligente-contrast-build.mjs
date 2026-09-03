import fs from 'node:fs';

const file = 'src/components/PreCadastroInteligente.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
const before = 'max-h-[92vh] overflow-y-auto border-violet-500/30 bg-background shadow-2xl sm:max-w-3xl';
const after = 'max-h-[92vh] overflow-y-auto border-violet-500/40 bg-zinc-950 text-zinc-100 shadow-2xl sm:max-w-3xl [&_input]:bg-zinc-900 [&_input]:text-zinc-100 [&_input]:border-zinc-700 [&_input]:placeholder:text-zinc-500 [&_textarea]:bg-zinc-900 [&_textarea]:text-zinc-100 [&_textarea]:border-zinc-700 [&_textarea]:placeholder:text-zinc-500 [&_select]:bg-zinc-900 [&_select]:text-zinc-100 [&_select]:border-zinc-700 [&_option]:bg-zinc-900 [&_option]:text-zinc-100 [&_label]:text-zinc-200 [&_.text-muted-foreground]:text-zinc-300';

if (!source.includes(after)) {
  if (!source.includes(before)) {
    console.error('[pre-cadastro-inteligente] alvo de contraste nao encontrado');
    process.exit(1);
  }
  source = source.replace(before, after);
  fs.writeFileSync(file, source, 'utf8');
}

console.log('[pre-cadastro-inteligente] contraste escuro e legivel aplicado ao modal');
await import('./fix-topac-ux-block1-build.mjs');
