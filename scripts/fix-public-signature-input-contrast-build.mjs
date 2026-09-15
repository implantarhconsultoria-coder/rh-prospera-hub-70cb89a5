import fs from 'node:fs';

const file = 'src/pages/PayrollSignaturePublicPage.tsx';
let source = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    'placeholder="000.000.000-00" className="h-12"',
    'placeholder="000.000.000-00" className="h-12 bg-white text-slate-950 placeholder:text-slate-500 caret-slate-950 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-500"',
  ],
  [
    'type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="h-12"',
    'type="text" inputMode="numeric" autoComplete="bday" maxLength={10} value={birthDate} onChange={(e) => setBirthDate(formatBirthDateInput(e.target.value))} placeholder="DD/MM/AAAA" className="h-12 bg-white text-base text-slate-950 placeholder:text-slate-500 caret-slate-950 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-500"',
  ],
  [
    'placeholder="0000" className="h-12 text-lg tracking-[.25em]"',
    'placeholder="0000" className="h-12 bg-white text-lg tracking-[.25em] text-slate-950 placeholder:text-slate-500 caret-slate-950 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-500"',
  ],
];

let changed = false;
for (const [from, to] of replacements) {
  if (source.includes(to)) continue;
  if (!source.includes(from)) {
    throw new Error(`[public-signature-contrast] trecho esperado não encontrado: ${from}`);
  }
  source = source.replace(from, to);
  changed = true;
}

if (changed) fs.writeFileSync(file, source);
console.log('[public-signature-contrast] CPF, nascimento e celular com texto escuro em campos claros');

await import('./fix-payroll-face-build.mjs');
await import('./fix-facial-access-guard-build.mjs');
