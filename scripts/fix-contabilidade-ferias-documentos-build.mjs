import fs from 'node:fs';

const file = 'src/pages/contabilidade/ContabilidadeDashboardPageV3.tsx';
if (!fs.existsSync(file)) throw new Error(`[contabilidade-ferias-docs] arquivo ausente: ${file}`);
let src = fs.readFileSync(file, 'utf8');

const importLine = `import ContabilidadeVacationDocuments from './ContabilidadeVacationDocuments';`;
if (!src.includes(importLine)) {
  const anchor = `import { toast } from 'sonner';`;
  if (!src.includes(anchor)) throw new Error('[contabilidade-ferias-docs] ancora de import não encontrada');
  src = src.replace(anchor, `${anchor}\n${importLine}`);
  console.log('[contabilidade-ferias-docs] componente importado');
}

const renderMarker = `            {!isInformational(selecionado) && <div className="rounded-lg border border-[#302739] bg-[#080a0f] p-4">`;
const renderBlock = `            {selecionado.origem_tipo === 'ferias' && <ContabilidadeVacationDocuments\n              portal={portal}\n              token={sessao?.token || ''}\n              confirmed={selecionado.status === 'conferido'}\n              evento={{\n                origem_id: selecionado.origem_id,\n                empresa_id: selecionado.empresa_id,\n                funcionario_nome: selecionado.funcionario_nome,\n                inicio: selecionado.detalhes?.inicio,\n              }}\n            />}\n`;
if (!src.includes('<ContabilidadeVacationDocuments')) {
  if (!src.includes(renderMarker)) throw new Error('[contabilidade-ferias-docs] ancora da conferência não encontrada');
  src = src.replace(renderMarker, `${renderBlock}${renderMarker}`);
  console.log('[contabilidade-ferias-docs] upload de aviso e recibo inserido no detalhe das férias');
}

const closeAfterReview = `      await carregar(true);\n      setSelecionado(null);`;
const keepVacationOpen = `      await carregar(true);\n      if (evento.origem_tipo === 'ferias' && status === 'conferido') {\n        setSelecionado({\n          ...evento,\n          status: 'conferido',\n          observacao: null,\n          revisor_nome: res.revisor_nome || sessao?.usuario?.nome || null,\n          revisado_em: res.revisado_em || new Date().toISOString(),\n        });\n      } else {\n        setSelecionado(null);\n      }`;
if (!src.includes(keepVacationOpen)) {
  if (!src.includes(closeAfterReview)) throw new Error('[contabilidade-ferias-docs] ancora pós-confirmação não encontrada');
  src = src.replace(closeAfterReview, keepVacationOpen);
  console.log('[contabilidade-ferias-docs] férias permanece aberta após confirmar para receber os PDFs');
}

fs.writeFileSync(file, src);
console.log('[contabilidade-ferias-docs] fluxo pronto: confirmar férias -> anexar aviso + recibo PDF');
