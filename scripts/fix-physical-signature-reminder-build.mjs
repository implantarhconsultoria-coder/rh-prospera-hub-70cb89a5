import fs from 'node:fs';

const path='src/components/payroll/PayrollPortalAdminModule.tsx';
let source=fs.readFileSync(path,'utf8');
const importLine="import PhysicalSignatureControl from '@/components/payroll/PhysicalSignatureControl';";
if(!source.includes(importLine)){
  const marker="import { Button } from '@/components/ui/button';";
  if(!source.includes(marker)) throw new Error('[physical-signature] marcador de import não encontrado');
  source=source.replace(marker,`${marker}\n${importLine}`);
}
const panel='<PhysicalSignatureControl companyId={companyId}/>';
if(!source.includes(panel)){
  const marker='    <div className="overflow-x-auto rounded-xl border"><table';
  if(!source.includes(marker)) throw new Error('[physical-signature] marcador da tabela não encontrado');
  source=source.replace(marker,`    ${panel}\n\n${marker}`);
}
fs.writeFileSync(path,source,'utf8');
console.log('[physical-signature] painel de avisos e baixa física aplicado');
