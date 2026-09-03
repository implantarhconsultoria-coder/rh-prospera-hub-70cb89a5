import fs from 'node:fs';

const patchFile = (path, transform) => {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next, 'utf8');
};

const replaceOnce = (source, oldText, newText, label) => {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) {
    console.warn(`[topac-ux1] trecho não encontrado: ${label}`);
    return source;
  }
  return source.replace(oldText, newText);
};

patchFile('src/components/EmployeeSmartEditOverlay.tsx', (input) => {
  const oldText = `      <Button type="button" onClick={() => setOpen(true)} className="fixed bottom-6 right-24 z-40 gap-2 shadow-xl no-print">\n        <Sparkles className="h-4 w-4" /> Edição inteligente\n      </Button>`;
  const newText = `      <div className="fixed bottom-6 right-24 z-40 flex flex-wrap justify-end gap-2 no-print">\n        <Button type="button" variant="outline" onClick={() => setBankingOpen(true)} className="gap-2 border-violet-400/40 bg-[#080b10]/95 text-white shadow-xl hover:bg-violet-500/15">\n          <Landmark className="h-4 w-4 text-violet-400" /> Enviar dados ao Financeiro\n        </Button>\n        <Button type="button" onClick={() => setOpen(true)} className="gap-2 shadow-xl">\n          <Sparkles className="h-4 w-4" /> Edição inteligente\n        </Button>\n      </div>`;
  return replaceOnce(input, oldText, newText, 'botão direto financeiro');
});

patchFile('src/components/AppSidebar.tsx', (input) => {
  let source = input.replace("  { label: 'Protocolo', icon: FileCheck, path: '/admin/operacional/protocolo' },\n", '');
  source = source.replace(
    '<div className="mb-3 rounded-[9px] border border-[#282b32] bg-[#06090d] px-4 py-4">',
    '<div role="button" tabIndex={0} onClick={() => window.dispatchEvent(new CustomEvent(\'topac:open-support\'))} onKeyDown={(event) => { if (event.key === \'Enter\' || event.key === \' \') window.dispatchEvent(new CustomEvent(\'topac:open-support\')); }} className="mb-3 cursor-pointer rounded-[9px] border border-[#282b32] bg-[#06090d] px-4 py-4 transition hover:border-violet-500/60 hover:bg-violet-500/5">',
  );
  return source;
});

patchFile('src/components/AdminMobileLayout.tsx', (input) => input.replace(
  "  { label: 'Protocolo', icon: FileCheck, path: '/admin/operacional/protocolo', group: 'Operacional' },\n",
  '',
));

patchFile('src/components/AppLayout.tsx', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    "import FechamentoEtiquetasAddon from '@/components/FechamentoEtiquetasAddon';",
    "import FechamentoEtiquetasAddon from '@/components/FechamentoEtiquetasAddon';\nimport CabinetLabelsAddon from '@/components/CabinetLabelsAddon';\nimport SupportCenter from '@/components/SupportCenter';",
    'imports AppLayout',
  );
  source = replaceOnce(
    source,
    '        <ErrorBoundary><AdminMobileLayout /></ErrorBoundary>\n      </div>',
    '        <ErrorBoundary><AdminMobileLayout /></ErrorBoundary>\n        <SupportCenter />\n      </div>',
    'suporte mobile',
  );
  source = replaceOnce(
    source,
    '      <FechamentoEtiquetasAddon />\n      <ArchiveCoverDialog',
    '      <FechamentoEtiquetasAddon />\n      <CabinetLabelsAddon />\n      <SupportCenter />\n      <ArchiveCoverDialog',
    'addons desktop',
  );
  return source;
});

patchFile('src/pages/FechamentoPage.tsx', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    "import { entryToRow, type MonthlyEntry } from '@/types/database';",
    "import { entryToRow, type MonthlyEntry } from '@/types/database';\nimport FechamentoLabelsPanel from '@/components/FechamentoLabelsPanel';",
    'import etiquetas',
  );
  source = replaceOnce(
    source,
    '      <section className="card-premium space-y-3 p-4">\n        <label className="text-xs font-semibold text-muted-foreground">Observação geral do fechamento</label>',
    '      <FechamentoLabelsPanel companyId={selectedCompany} competencia={competencia} />\n\n      <section className="card-premium space-y-3 p-4">\n        <label className="text-xs font-semibold text-muted-foreground">Observação geral do fechamento</label>',
    'painel etiquetas',
  );
  return source;
});

patchFile('src/components/FilialLayout.tsx', (input) => {
  let source = input;
  source = replaceOnce(source, "import FilialSidebar from '@/components/FilialSidebar';", "import FilialModernSidebar from '@/components/FilialModernSidebar';", 'sidebar filial');
  source = replaceOnce(source, "import { useFilialFilter } from '@/hooks/useFilialFilter';", "import { useFilialFilter } from '@/hooks/useFilialFilter';\nimport SupportCenter from '@/components/SupportCenter';", 'support filial import');
  source = source.replace('<FilialSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />', '<FilialModernSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />');
  const marker = `  const trocarUsuario = async () => {\n    await logout();\n    navigate('/login', { replace: true });\n  };`;
  const withTheme = `${marker}\n\n  const themeVars = {\n    '--background': '225 38% 3%',\n    '--foreground': '0 0% 96%',\n    '--card': '225 28% 5%',\n    '--card-foreground': '0 0% 96%',\n    '--popover': '225 28% 5%',\n    '--popover-foreground': '0 0% 96%',\n    '--primary': '43 100% 50%',\n    '--primary-foreground': '230 45% 4%',\n    '--secondary': '269 35% 12%',\n    '--secondary-foreground': '0 0% 95%',\n    '--muted': '225 20% 10%',\n    '--muted-foreground': '230 8% 58%',\n    '--accent': '271 91% 60%',\n    '--accent-foreground': '0 0% 100%',\n    '--border': '270 35% 22%',\n    '--input': '230 18% 16%',\n    '--ring': '270 91% 60%',\n  } as React.CSSProperties;`;
  source = replaceOnce(source, marker, withTheme, 'tema filial');
  source = source.replace('<div className="min-h-screen bg-background">', '<div style={themeVars} className="topac-neon-skin min-h-screen bg-[#020609] text-zinc-100">');
  source = source.replace("<main className={cn('transition-all duration-300 min-h-screen', collapsed ? 'ml-16' : 'ml-64')}>", "<main className={cn('min-h-screen transition-[margin] duration-300', collapsed ? 'ml-[72px]' : 'ml-[270px]')}>");
  source = source.replace('<div className="p-6 pt-20 max-w-[1600px] mx-auto"><ErrorBoundary><Outlet /></ErrorBoundary></div>', '<div className="mx-auto max-w-[1680px] p-[18px] pt-20"><ErrorBoundary><Outlet /></ErrorBoundary></div>');
  source = replaceOnce(source, '      <EmployeeSmartEditOverlay />\n    </div>', '      <EmployeeSmartEditOverlay />\n      <SupportCenter />\n    </div>', 'suporte filial render');
  return source;
});

console.log('[topac-ux1] restaurados: envio financeiro, etiquetas, filial moderna/correta, suporte e protocolo sem duplicidade');
