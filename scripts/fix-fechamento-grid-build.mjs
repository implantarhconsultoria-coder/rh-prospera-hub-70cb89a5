import './fix-goiania-he60-build.mjs';
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
  `  const inputClass = 'h-7 w-full min-w-0 border-violet-400/20 bg-black/20 px-1 text-[10px] focus:border-violet-400/60';`,
);

replaceIfPresent(
  `        <div className="overflow-x-auto">\n          <table className="w-full min-w-[1680px] text-sm">`,
  `        <div className="max-h-[calc(100vh-315px)] w-full overflow-auto overscroll-contain [scrollbar-gutter:stable]">\n          <table className="w-full table-fixed text-[10px]">`,
);

replaceIfPresent(
  `<thead className="bg-violet-500/[0.055]"><tr className="border-b border-violet-400/20">{['Funcionário','Empresa','Faltas','Datas','Horas desc.','Horas doc.',heSemanalLabel,'HE 100%','Comissão','Adicional','Desc. extra','Adiantamento','Líquido','Observações'].map((header) => <th key={header} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{header}</th>)}</tr></thead>`,
  `<thead className="sticky top-0 z-30 bg-[#070a0f]/[.98] shadow-[0_8px_22px_rgba(0,0,0,.45)] backdrop-blur"><tr className="border-b border-violet-400/30">{['Funcionário','Empresa','Faltas','Datas','Horas desc.','Horas doc.',heSemanalLabel,'HE 100%','Comissão','Adicional','Desc. extra','Adiantamento','Líquido','Observações'].map((header, index) => <th key={header} style={{ width: ['13%','8%','4%','6%','5%','5%','5%','5%','7%','6%','6%','7%','7%','16%'][index] }} className="px-1 py-2 text-left text-[8px] font-extrabold uppercase leading-tight tracking-[-.01em] text-violet-100 whitespace-normal">{header}</th>)}</tr></thead>`,
);

const compact = [
  [`className={\`${'${inputClass}'} w-20\`}`, `className={inputClass}`],
  [`className={\`${'${inputClass}'} w-28\`}`, `className={inputClass}`],
  [`className={\`${'${inputClass}'} w-28 text-right\`}`, `className={\`${'${inputClass}'} text-right\`}`],
  [`className="px-2 py-2 min-w-28"`, `className="px-1 py-1.5 min-w-0"`],
  [`className="px-2 py-2 min-w-36"`, `className="px-1 py-1.5 min-w-0"`],
  [`className="px-2 py-2 min-w-64"`, `className="px-1 py-1.5 min-w-0"`],
  [`className={\`${'${inputClass}'} w-64\`}`, `className={inputClass}`],
  [`className="px-2 py-2"`, `className="px-1 py-1.5 min-w-0"`],
  [`className="px-3 py-3 font-semibold whitespace-nowrap"`, `className="px-1 py-2 text-[9px] font-semibold leading-tight break-words"`],
  [`className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap"`, `className="px-1 py-2 text-[8px] leading-tight text-muted-foreground break-words"`],
  [`className="px-3 py-3 font-extrabold text-violet-200 whitespace-nowrap"`, `className="px-1 py-2 text-[9px] font-extrabold text-violet-200 whitespace-nowrap"`],
];
for (const [oldText, newText] of compact) source = source.split(oldText).join(newText);

fs.writeFileSync(path, source, 'utf8');
console.log('[fechamento-grid] cabeçalho fixo e grade responsiva aplicada.');
