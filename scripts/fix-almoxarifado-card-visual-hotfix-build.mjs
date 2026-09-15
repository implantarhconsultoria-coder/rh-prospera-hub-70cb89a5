import fs from 'node:fs';

const file = 'src/components/AlmoxarifadoDesktopV2.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');

const actionCardPattern = /function ActionCard\(\{ icon: Icon, title, subtitle, tone, onClick \}: any\) \{[\s\S]*?\n\}\n\nfunction Stat/;
const actionCardReplacement = `function ActionCard({ icon: Icon, title, subtitle, onClick }: any) {
  return <button
    onClick={onClick}
    className="group relative min-h-[118px] overflow-hidden rounded-xl border border-border bg-card p-4 text-left text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
  >
    <span className="absolute inset-x-0 top-0 h-[2px] bg-primary/70 opacity-60 transition group-hover:opacity-100" />
    <div className="flex items-start justify-between gap-4">
      <span className="grid h-10 w-10 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
        <Icon className="h-5 w-5"/>
      </span>
      <span className="text-lg text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary">›</span>
    </div>
    <div className="mt-3 text-sm font-extrabold text-foreground">{title}</div>
    <div className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</div>
  </button>;
}

function Stat`;

if (!actionCardPattern.test(source)) {
  console.warn('[almox-card-hotfix] ActionCard não encontrado');
  process.exit(0);
}

source = source.replace(actionCardPattern, actionCardReplacement);

// Remove fundos chamativos remanescentes do cabeçalho da leitura provisória.
source = source
  .replaceAll('bg-gradient-to-r from-primary/5 to-card', 'bg-card')
  .replaceAll('bg-accent/10', 'bg-muted/40')
  .replaceAll('text-accent-foreground', 'text-foreground')
  .replaceAll('border-accent/40', 'border-border');

fs.writeFileSync(file, source, 'utf8');
console.log('[almox-card-hotfix] cards escuros institucionais aplicados; sem fundos amarelos/roxos');
