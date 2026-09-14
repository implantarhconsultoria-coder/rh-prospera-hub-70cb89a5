import fs from 'node:fs';

const path = 'src/pages/PayrollSignaturePublicPage.tsx';
let source = fs.readFileSync(path, 'utf8');

const replaceOnce = (before, after, label) => {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`[birthdate-input] trecho não encontrado: ${label}`);
  source = source.replace(before, after);
};

if (!source.includes('const formatBirthDateInput =')) {
  replaceOnce(
    'const competenceLabel = (value: string) => {',
    `const formatBirthDateInput = (value: string) => {\n  const d = value.replace(/\\D/g, '').slice(0, 8);\n  if (d.length <= 2) return d;\n  if (d.length <= 4) return \`${'${d.slice(0, 2)}/${d.slice(2)}'}\`;\n  return \`${'${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}'}\`;\n};\n\nconst birthDateToIso = (value: string) => {\n  const match = value.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/);\n  return match ? \`${'${match[3]}-${match[2]}-${match[1]}'}\` : value;\n};\n\nconst competenceLabel = (value: string) => {`,
    'helpers data',
  );
}

replaceOnce(
  '        birth_date: birthDate,',
  '        birth_date: birthDateToIso(birthDate),',
  'envio data ISO',
);

const dateVariants = [
  '<Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="h-12 bg-white text-slate-950 caret-slate-950 [color-scheme:light] dark:bg-white dark:text-slate-950" />',
  '<Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="h-12" />',
];
const newDateInput = '<Input type="text" inputMode="numeric" autoComplete="bday" maxLength={10} value={birthDate} onChange={(e) => setBirthDate(formatBirthDateInput(e.target.value))} placeholder="DD/MM/AAAA" className="h-12 bg-white text-base text-slate-950 placeholder:text-slate-500 caret-slate-950 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-500" />';
if (!source.includes(newDateInput)) {
  const current = dateVariants.find((variant) => source.includes(variant));
  if (!current) throw new Error('[birthdate-input] campo de data não encontrado');
  source = source.replace(current, newDateInput);
}

source = source.replace(
  "const canAuthenticate = cpf.replace(/\\D/g, '').length === 11 && Boolean(birthDate) && phoneLast4.length === 4;",
  "const canAuthenticate = cpf.replace(/\\D/g, '').length === 11 && /^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(birthDate) && phoneLast4.length === 4;",
);

fs.writeFileSync(path, source, 'utf8');
console.log('[birthdate-input] data padronizada com CPF/celular no mobile');
