import fs from 'node:fs';

const file = 'src/pages/AlmoxarifadoPage.tsx';
if (!fs.existsSync(file)) process.exit(0);
let s = fs.readFileSync(file, 'utf8');
let changed = false;

const replaceOnce = (from, to, label) => {
  if (s.includes(to)) return;
  if (!s.includes(from)) {
    console.warn(`[almox-migracao] trecho não encontrado: ${label}`);
    return;
  }
  s = s.replace(from, to);
  changed = true;
};

replaceOnce(
  "import AlmoxarifadoCargaTab from '@/components/AlmoxarifadoCargaTab';",
  "import AlmoxarifadoCargaTab from '@/components/AlmoxarifadoCargaTab';\nimport AlmoxarifadoImportPreview from '@/components/AlmoxarifadoImportPreview';\nimport { horarioAlmoxarifadoFechado } from '@/lib/almoxarifadoImportPreview';",
  'imports',
);

replaceOnce(
  "type Tab = 'estoque' | 'entrada' | 'saida' | 'carregamento' | 'carga' | 'fechamento' | 'relatorio';",
  "type Tab = 'estoque' | 'entrada' | 'saida' | 'carregamento' | 'carga' | 'fechamento' | 'relatorio' | 'importar';",
  'tipo Tab',
);

replaceOnce(
  "if (now.getHours() >= 17 && now.getMinutes() >= 30 && !horaExtra) {\n        setFechamentoHoje(true);\n      }",
  "if (!horaExtra && horarioAlmoxarifadoFechado(now)) {\n        setFechamentoHoje(true);\n      } else {\n        setFechamentoHoje(false);\n      }",
  'fechamento 17:30',
);

replaceOnce(
  "<Button size=\"sm\" variant=\"outline\" onClick={() => setShowImport(!showImport)}>\n                    <Upload className=\"w-4 h-4 mr-1\" />Importar Planilha\n                  </Button>",
  "<Button size=\"sm\" variant=\"outline\" onClick={() => setTab('importar')}>\n                    <Upload className=\"w-4 h-4 mr-1\" />Pré-analisar Planilha\n                  </Button>",
  'botão importar',
);

// Remove da interface o importador CSV antigo que gravava diretamente no banco.
const oldImportBlock = `            {showImport && (\n              <div className=\"border rounded-lg p-4 bg-muted/20\">\n                <p className=\"text-xs text-muted-foreground mb-2\">Envie um CSV/TXT com colunas: Nome, Categoria, Unidade, Quantidade, Valor, Localização</p>\n                <input ref={fileRef} type=\"file\" accept=\".csv,.txt,.tsv\" onChange={handleImport} className=\"text-xs\" />\n              </div>\n            )}\n`;
if (s.includes(oldImportBlock)) {
  s = s.replace(oldImportBlock, '');
  changed = true;
}

replaceOnce(
  "        {/* ESTOQUE */}",
  "        {/* PRÉ-IMPORTAÇÃO — somente análise, nunca grava estoque nesta fase */}\n        {tab === 'importar' && isAdmin && (\n          <div className=\"mt-5\"><AlmoxarifadoImportPreview /></div>\n        )}\n\n        {/* ESTOQUE */}",
  'tela pré-importação',
);

if (changed) {
  fs.writeFileSync(file, s);
  console.log('[almox-migracao] preparação da Fase 1 aplicada ao build.');
} else {
  console.log('[almox-migracao] nenhuma alteração necessária.');
}
