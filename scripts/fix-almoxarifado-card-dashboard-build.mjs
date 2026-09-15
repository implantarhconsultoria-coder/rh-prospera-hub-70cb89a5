import fs from 'node:fs';

const file = 'src/components/AlmoxarifadoDesktopV2.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
let changed = false;

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) {
    console.log(`[almox-cards] trecho não encontrado: ${label}`);
    return;
  }
  source = source.replace(from, to);
  changed = true;
};

replaceOnce(
  'FileSignature, FileText, History, Loader2, Package, Plus, Search, Settings, ShoppingCart,',
  'FileSignature, FileText, History, Loader2, Package, Plus, Search, Settings, ShoppingCart, Sparkles,',
  'ícone Sparkles',
);

replaceOnce(
  "import AlmoxarifadoExcelImporter from '@/components/AlmoxarifadoExcelImporter';",
  "import AlmoxarifadoExcelImporter from '@/components/AlmoxarifadoExcelImporter';\nimport AlmoxarifadoCargaTab from '@/components/AlmoxarifadoCargaTab';",
  'import leitura de texto',
);

replaceOnce(
  "type Mode = 'home'|'entrada'|'saida'|'carro'|'mecanico'|'estoque'|'relatorios'|'assinatura'|'config';",
  "type Mode = 'home'|'leitura'|'entrada'|'saida'|'carro'|'mecanico'|'estoque'|'relatorios'|'assinatura'|'config';",
  'modo leitura',
);

const oldPrimaryCards = `<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><ActionCard icon={FileText} title="Entrada por Nota" subtitle="Importar ou registrar nota fiscal" tone="green" onClick={()=>setMode('entrada')}/><ActionCard icon={ArrowDownToLine} title="Saída / Retirada" subtitle="Material para consumo" tone="blue" onClick={()=>setMode('saida')}/><ActionCard icon={Car} title="Carga para Carro" subtitle="Motoristas do aplicativo" tone="orange" onClick={()=>setMode('carro')}/><ActionCard icon={Wrench} title="Carga para Mecânicos" subtitle="Matriz, filiais e empresas do grupo" tone="purple" onClick={()=>setMode('mecanico')}/></div>`;
const newPrimaryCards = `<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><ActionCard icon={Sparkles} title="Leitura de Texto" subtitle="Cole a solicitação e monte a carga provisória" tone="primary" onClick={()=>setMode('leitura')}/><ActionCard icon={FileText} title="Entrada por Nota" subtitle="Importar ou registrar nota fiscal" tone="primary" onClick={()=>setMode('entrada')}/><ActionCard icon={ArrowDownToLine} title="Saída / Retirada" subtitle="Material para consumo" tone="primary" onClick={()=>setMode('saida')}/><ActionCard icon={Car} title="Carga para Carro" subtitle="Motoristas do aplicativo" tone="accent" onClick={()=>setMode('carro')}/><ActionCard icon={Wrench} title="Carga para Mecânicos" subtitle="Matriz, filiais e empresas do grupo" tone="primary" onClick={()=>setMode('mecanico')}/></div>`;
replaceOnce(oldPrimaryCards, newPrimaryCards, 'cards principais');

const oldSecondaryCards = `<div className="mt-4 grid gap-3 md:grid-cols-4"><button onClick={()=>setMode('estoque')} className="rounded-xl border bg-white p-4 text-left"><Package className="mb-2 h-5 w-5 text-violet-700"/><b>Estoque / Códigos</b><div className="text-xs text-slate-500">Base completa</div></button><button onClick={()=>setMode('relatorios')} className="rounded-xl border bg-white p-4 text-left"><History className="mb-2 h-5 w-5 text-blue-600"/><b>Relatórios</b><div className="text-xs text-slate-500">Entradas e saídas</div></button><button onClick={()=>setMode('assinatura')} className="rounded-xl border bg-white p-4 text-left"><FileSignature className="mb-2 h-5 w-5 text-violet-700"/><b>Assinatura Digital</b><div className="text-xs text-slate-500">Protocolos</div></button><button onClick={()=>setMode('config')} className="rounded-xl border bg-white p-4 text-left"><Settings className="mb-2 h-5 w-5 text-slate-600"/><b>Configurações</b><div className="text-xs text-slate-500">Importação da planilha</div></button></div>`;
const newSecondaryCards = `<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><ActionCard icon={Package} title="Estoque / Códigos" subtitle="Base completa e saldos" tone="primary" onClick={()=>setMode('estoque')}/><ActionCard icon={History} title="Relatórios" subtitle="Entradas, saídas e histórico" tone="primary" onClick={()=>setMode('relatorios')}/><ActionCard icon={FileSignature} title="Assinatura Digital" subtitle="Protocolos do Almoxarifado" tone="primary" onClick={()=>setMode('assinatura')}/><ActionCard icon={Settings} title="Configurações" subtitle="Importação e base oficial" tone="accent" onClick={()=>setMode('config')}/></div>`;
replaceOnce(oldSecondaryCards, newSecondaryCards, 'cards secundários');

const marker = `    {mode==='entrada'&&<div className="space-y-5">`;
if (!source.includes("mode==='leitura'")) {
  if (source.includes(marker)) {
    const reader = `    {mode==='leitura'&&<div className="space-y-5"><Back/><div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-card p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black uppercase tracking-[.16em] text-primary">Modo provisório</div><h2 className="mt-1 text-2xl font-black text-foreground">Leitura de Texto para Criar Carga</h2><p className="mt-1 text-sm text-muted-foreground">Cole a solicitação recebida por WhatsApp ou e-mail, deixe o sistema ler e revise os dados antes de gerar.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent-foreground"><Sparkles className="h-4 w-4"/>Provisório até alinharmos o fluxo definitivo</span></div></div><div className="rounded-2xl border bg-card p-5 shadow-sm"><AlmoxarifadoCargaTab/></div></div>}\n`;
    source = source.replace(marker, reader + marker);
    changed = true;
  } else {
    console.log('[almox-cards] trecho não encontrado: tela entrada');
  }
}

// Padroniza todo o módulo nas cores institucionais da própria plataforma.
const themeReplacements = [
  ["const ROXO = '#6D28D9';", "const ROXO = 'hsl(var(--primary))';"],
  ["const ROXO_ESCURO = '#4C1D95';", "const ROXO_ESCURO = 'hsl(var(--primary))';"],
  ["green: 'border-emerald-200 bg-emerald-50/80 text-emerald-700',", "primary: 'border-primary/20 bg-primary/5 text-primary',"],
  ["blue: 'border-blue-200 bg-blue-50/80 text-blue-700',", "accent: 'border-accent/40 bg-accent/10 text-accent-foreground',"],
  ["orange: 'border-amber-200 bg-amber-50/80 text-amber-700',", "orange: 'border-accent/40 bg-accent/10 text-accent-foreground',"],
  ["purple: 'border-violet-200 bg-violet-50/80 text-violet-700',", "purple: 'border-primary/20 bg-primary/5 text-primary',"],
  ['bg-[#F7F8FC]', 'bg-background'],
  ['text-slate-950', 'text-foreground'],
  ['text-slate-900', 'text-foreground'],
  ['text-slate-500', 'text-muted-foreground'],
  ['text-slate-400', 'text-muted-foreground'],
  ['bg-white', 'bg-card'],
  ['text-violet-700', 'text-primary'],
  ['text-violet-600', 'text-primary'],
  ['bg-violet-100', 'bg-primary/10'],
  ['bg-violet-50/80', 'bg-primary/5'],
  ['bg-violet-50/60', 'bg-primary/5'],
  ['bg-violet-50/40', 'bg-primary/5'],
  ['bg-violet-50', 'bg-primary/5'],
  ['border-violet-200', 'border-primary/20'],
  ['hover:bg-violet-50/40', 'hover:bg-primary/5'],
  ['from-violet-50', 'from-primary/5'],
  ['text-blue-600', 'text-primary'],
  ['border-slate-200', 'border-border'],
  ['bg-slate-50', 'bg-muted/50'],
];

for (const [from, to] of themeReplacements) {
  if (source.includes(from)) {
    source = source.split(from).join(to);
    changed = true;
  }
}

// Se o componente ainda usa os tons antigos, converte para os dois tons institucionais.
source = source
  .replaceAll('tone="green"', 'tone="primary"')
  .replaceAll('tone="blue"', 'tone="primary"')
  .replaceAll('tone="orange"', 'tone="accent"')
  .replaceAll('tone="purple"', 'tone="primary"');

if (!source.includes("primary: 'border-primary/20 bg-primary/5 text-primary'")) {
  source = source.replace(
    '  const tones: any = {',
    "  const tones: any = {\n    primary: 'border-primary/20 bg-primary/5 text-primary',\n    accent: 'border-accent/40 bg-accent/10 text-accent-foreground',",
  );
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, source, 'utf8');
  console.log('[almox-cards] cards + leitura provisória padronizados nas cores da plataforma');
} else {
  console.log('[almox-cards] nenhuma alteração necessária');
}
