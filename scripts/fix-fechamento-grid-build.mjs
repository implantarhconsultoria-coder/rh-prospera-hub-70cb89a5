import fs from 'node:fs';

const path = 'src/pages/FechamentoPage.tsx';
let source = fs.readFileSync(path, 'utf8');

const replaceIfPresent = (oldText, newText) => {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`[fechamento-grid] trecho não encontrado: ${oldText.slice(0, 70)}`);
  source = source.replace(oldText, newText);
};

replaceIfPresent(
  `  const inputClass = 'h-8 min-w-[72px] border-violet-400/20 bg-black/20 text-xs focus:border-violet-400/60';`,
  `  const inputClass = 'h-7 min-w-[52px] border-violet-400/20 bg-black/20 px-1.5 text-[11px] focus:border-violet-400/60';`,
);

replaceIfPresent(
  `        <div className="overflow-x-auto">\n          <table className="w-full min-w-[1680px] text-sm">`,
  `        <div className="max-h-[calc(100vh-315px)] overflow-auto overscroll-contain [scrollbar-gutter:stable]">\n          <table className="w-full min-w-[1180px] table-fixed text-[11px]">`,
);

replaceIfPresent(
  `<thead className="bg-violet-500/[0.055]"><tr className="border-b border-violet-400/20">{['Funcionário','Empresa','Faltas','Datas','Horas desc.','Horas doc.',heSemanalLabel,'HE 100%','Comissão','Adicional','Desc. extra','Adiantamento','Líquido','Observações'].map((header) => <th key={header} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{header}</th>)}</tr></thead>`,
  `<thead className="sticky top-0 z-30 bg-[#070a0f]/[.98] shadow-[0_8px_22px_rgba(0,0,0,.45)] backdrop-blur"><tr className="border-b border-violet-400/30">{['Funcionário','Empresa','Faltas','Datas','Horas desc.','Horas doc.',heSemanalLabel,'HE 100%','Comissão','Adicional','Desc. extra','Adiantamento','Líquido','Observações'].map((header, index) => <th key={header} className={\`px-1.5 py-2 text-left text-[9px] font-extrabold uppercase leading-tight tracking-[.02em] text-violet-100 whitespace-normal ${'${index === 0 ? \'w-[170px]\' : index === 1 ? \'w-[105px]\' : index === 13 ? \'w-[150px]\' : \'w-[72px]\'}'}\`}>{header}</th>)}</tr></thead>`,
);

const compact = [
  [`className={\`${'${inputClass}'} w-20\`}`, `className={\`${'${inputClass}'} w-14\`}`],
  [`className={\`${'${inputClass}'} w-28\`}`, `className={\`${'${inputClass}'} w-20\`}`],
  [`className={\`${'${inputClass}'} w-28 text-right\`}`, `className={\`${'${inputClass}'} w-20 text-right\`}`],
  [`className="px-2 py-2 min-w-28"`, `className="px-1.5 py-1.5"`],
  [`className="px-2 py-2 min-w-36"`, `className="px-1.5 py-1.5"`],
  [`className="px-2 py-2 min-w-64"`, `className="px-1.5 py-1.5"`],
  [`className={\`${'${inputClass}'} w-64\`}`, `className={\`${'${inputClass}'} w-full min-w-[138px]\`}`],
  [`className="px-3 py-3 font-semibold whitespace-nowrap"`, `className="px-1.5 py-2 text-[10px] font-semibold leading-tight"`],
  [`className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap"`, `className="px-1.5 py-2 text-[9px] leading-tight text-muted-foreground"`],
  [`className="px-3 py-3 font-extrabold text-violet-200 whitespace-nowrap"`, `className="px-1.5 py-2 text-[10px] font-extrabold text-violet-200 whitespace-nowrap"`],
];
for (const [oldText, newText] of compact) source = source.split(oldText).join(newText);

fs.writeFileSync(path, source, 'utf8');
console.log('[fechamento-grid] cabeçalho fixo e grade compacta aplicada.');
