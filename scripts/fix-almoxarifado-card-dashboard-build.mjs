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
const newPrimaryCards = `<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><ActionCard icon={Sparkles} title="Leitura de Texto" subtitle="Cole a solicitação e monte a carga provisória" tone="purple" onClick={()=>setMode('leitura')}/><ActionCard icon={FileText} title="Entrada por Nota" subtitle="Importar ou registrar nota fiscal" tone="green" onClick={()=>setMode('entrada')}/><ActionCard icon={ArrowDownToLine} title="Saída / Retirada" subtitle="Material para consumo" tone="blue" onClick={()=>setMode('saida')}/><ActionCard icon={Car} title="Carga para Carro" subtitle="Motoristas do aplicativo" tone="orange" onClick={()=>setMode('carro')}/><ActionCard icon={Wrench} title="Carga para Mecânicos" subtitle="Matriz, filiais e empresas do grupo" tone="purple" onClick={()=>setMode('mecanico')}/></div>`;
replaceOnce(oldPrimaryCards, newPrimaryCards, 'cards principais');

const oldSecondaryCards = `<div className="mt-4 grid gap-3 md:grid-cols-4"><button onClick={()=>setMode('estoque')} className="rounded-xl border bg-white p-4 text-left"><Package className="mb-2 h-5 w-5 text-violet-700"/><b>Estoque / Códigos</b><div className="text-xs text-slate-500">Base completa</div></button><button onClick={()=>setMode('relatorios')} className="rounded-xl border bg-white p-4 text-left"><History className="mb-2 h-5 w-5 text-blue-600"/><b>Relatórios</b><div className="text-xs text-slate-500">Entradas e saídas</div></button><button onClick={()=>setMode('assinatura')} className="rounded-xl border bg-white p-4 text-left"><FileSignature className="mb-2 h-5 w-5 text-violet-700"/><b>Assinatura Digital</b><div className="text-xs text-slate-500">Protocolos</div></button><button onClick={()=>setMode('config')} className="rounded-xl border bg-white p-4 text-left"><Settings className="mb-2 h-5 w-5 text-slate-600"/><b>Configurações</b><div className="text-xs text-slate-500">Importação da planilha</div></button></div>`;
const newSecondaryCards = `<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><ActionCard icon={Package} title="Estoque / Códigos" subtitle="Base completa e saldos" tone="purple" onClick={()=>setMode('estoque')}/><ActionCard icon={History} title="Relatórios" subtitle="Entradas, saídas e histórico" tone="blue" onClick={()=>setMode('relatorios')}/><ActionCard icon={FileSignature} title="Assinatura Digital" subtitle="Protocolos do Almoxarifado" tone="purple" onClick={()=>setMode('assinatura')}/><ActionCard icon={Settings} title="Configurações" subtitle="Importação e base oficial" tone="orange" onClick={()=>setMode('config')}/></div>`;
replaceOnce(oldSecondaryCards, newSecondaryCards, 'cards secundários');

const marker = `    {mode==='entrada'&&<div className="space-y-5">`;
if (!source.includes("mode==='leitura'")) {
  if (source.includes(marker)) {
    const reader = `    {mode==='leitura'&&<div className="space-y-5"><Back/><div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black uppercase tracking-[.16em] text-violet-700">Modo provisório</div><h2 className="mt-1 text-2xl font-black text-slate-950">Leitura de Texto para Criar Carga</h2><p className="mt-1 text-sm text-slate-500">Cole a solicitação recebida por WhatsApp ou e-mail, deixe o sistema ler e revise os dados antes de gerar.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700"><Sparkles className="h-4 w-4"/>Provisório até alinharmos o fluxo definitivo</span></div></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><AlmoxarifadoCargaTab/></div></div>}\n`;
    source = source.replace(marker, reader + marker);
    changed = true;
  } else {
    console.log('[almox-cards] trecho não encontrado: tela entrada');
  }
}

if (changed) {
  fs.writeFileSync(file, source, 'utf8');
  console.log('[almox-cards] leitura de texto restaurada e navegação em cards aplicada');
} else {
  console.log('[almox-cards] nenhuma alteração necessária');
}
