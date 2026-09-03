import fs from 'node:fs';

const file = 'src/pages/admin/AppMecanicoAdminPage.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
const oldBlock = `export default function AppMecanicoAdminPage() {
  return (
    <div className="space-y-3">
      <AuthorizationCenter />
      <OperationalClosingReport />
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 no-print">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wrench className="h-5 w-5" /></div>
          <div>
            <h1 className="font-semibold">App Operacional</h1>
            <p className="text-xs text-muted-foreground">Campo integrado ao controle de autorização, viagem e fechamento do RH.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden items-center gap-1 lg:flex"><Route className="h-4 w-4" /> Viagem</span>
          <span className="hidden items-center gap-1 lg:flex"><Timer className="h-4 w-4" /> Hora Extra</span>
          <span className="hidden items-center gap-1 lg:flex"><Users className="h-4 w-4" /> Acompanhantes</span>
          <Button variant="outline" size="sm" asChild><a href={APP_OPERACIONAL_URL} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir em nova aba</a></Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-background no-print" style={{ height: 'calc(100vh - 185px)' }}>
        <iframe src={APP_OPERACIONAL_URL} title="TOPAC Operacional" className="h-full w-full border-0" allow="camera; geolocation; microphone; clipboard-read; clipboard-write" />
      </div>
    </div>
  );
}`;

const newBlock = `export default function AppMecanicoAdminPage() {
  const [view, setView] = useState<'controle' | 'app'>('controle');
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-br from-[#080a10] via-[#07080d] to-[#13091f] shadow-[0_16px_55px_rgba(0,0,0,.28)] no-print">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-violet-500/35 bg-violet-500/10 text-violet-300 shadow-[0_0_24px_rgba(139,92,246,.16)]"><Wrench className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-400">TOPAC RH PRO · APP MECÂNICO</p>
              <h1 className="mt-1 text-xl font-black text-white">Central Integrada do App Mecânico</h1>
              <p className="mt-1 text-xs text-zinc-400">Seu acesso administrativo fica aqui dentro. O app de campo dos mecânicos continua operando normalmente.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setView('controle')} className={\`rounded-lg border px-4 py-2 text-xs font-bold transition \${view === 'controle' ? 'border-amber-400 bg-amber-400 text-black shadow-[0_0_18px_rgba(251,191,36,.18)]' : 'border-zinc-700 bg-black/20 text-zinc-300 hover:border-violet-500'}\`}>CENTRAL ADMINISTRATIVA</button>
            <button type="button" onClick={() => setView('app')} className={\`rounded-lg border px-4 py-2 text-xs font-bold transition \${view === 'app' ? 'border-violet-400 bg-violet-600 text-white shadow-[0_0_18px_rgba(139,92,246,.22)]' : 'border-zinc-700 bg-black/20 text-zinc-300 hover:border-violet-500'}\`}>VISUALIZAR APP MECÂNICO</button>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-violet-500/15 bg-black/20 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          <div className="flex items-center justify-center gap-1.5 border-r border-zinc-800 px-2 py-2"><Route className="h-3.5 w-3.5 text-violet-400" />Viagem</div>
          <div className="flex items-center justify-center gap-1.5 border-r border-zinc-800 px-2 py-2"><Timer className="h-3.5 w-3.5 text-violet-400" />Hora Extra</div>
          <div className="flex items-center justify-center gap-1.5 px-2 py-2"><Users className="h-3.5 w-3.5 text-violet-400" />Acompanhantes</div>
        </div>
      </section>

      {view === 'controle' ? (
        <div className="space-y-4">
          <AuthorizationCenter />
          <OperationalClosingReport />
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-violet-500/25 bg-[#020509] no-print">
          <div className="flex items-center justify-between gap-3 border-b border-violet-500/20 bg-[#070a0f] px-4 py-3">
            <div>
              <p className="text-xs font-bold text-white">App Mecânico · Visualização integrada</p>
              <p className="text-[11px] text-zinc-500">Você permanece dentro do TOPAC RH PRO. Esta visualização não altera o acesso usado pelos mecânicos.</p>
            </div>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-300">INTEGRADO</Badge>
          </div>
          <div className="bg-black" style={{ height: 'calc(100vh - 235px)', minHeight: '620px' }}>
            <iframe src={APP_OPERACIONAL_URL} title="TOPAC App Mecânico" className="h-full w-full border-0" allow="camera; geolocation; microphone; clipboard-read; clipboard-write" />
          </div>
        </section>
      )}
    </div>
  );
}`;

if (!source.includes(newBlock)) {
  if (!source.includes(oldBlock)) {
    console.warn('[app3] bloco final do AppMecanicoAdminPage não encontrado; nenhuma alteração aplicada');
  } else {
    source = source.replace(oldBlock, newBlock);
    fs.writeFileSync(file, source, 'utf8');
  }
}

console.log('[app3] App Mecânico administrativo integrado em duas telas internas; app de campo preservado');
