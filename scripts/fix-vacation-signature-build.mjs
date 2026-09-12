import fs from 'node:fs';

const patch = (path, before, after, alreadyNeedle) => {
  let text = fs.readFileSync(path, 'utf8');
  if (alreadyNeedle && text.includes(alreadyNeedle)) return false;
  if (!text.includes(before)) {
    throw new Error(`[vacation-signature] trecho não encontrado em ${path}: ${before.slice(0, 90)}`);
  }
  text = text.replace(before, after);
  fs.writeFileSync(path, text, 'utf8');
  return true;
};

let changed = false;

// API pública: Aviso de Férias é um documento assinável sem depender de pagamento.
changed = patch(
  'api/payroll-public.ts',
  "const ADIANTAMENTO = 'ADIANTAMENTO';\nconst BENEFIT_TYPES",
  "const ADIANTAMENTO = 'ADIANTAMENTO';\nconst AVISO_FERIAS = 'AVISO_FERIAS';\nconst BENEFIT_TYPES",
  "const AVISO_FERIAS = 'AVISO_FERIAS';",
) || changed;

changed = patch(
  'api/payroll-public.ts',
  "  if (type === ADIANTAMENTO) return 'Recibo de Adiantamento';\n  return 'Holerite';",
  "  if (type === AVISO_FERIAS) return 'Aviso de Férias';\n  if (type === ADIANTAMENTO) return 'Recibo de Adiantamento';\n  return 'Holerite';",
  "if (type === AVISO_FERIAS) return 'Aviso de Férias';",
) || changed;

changed = patch(
  'api/payroll-public.ts',
  "  } else if (!BENEFIT_TYPES.has(doc.document_type) && doc.document_type !== ADIANTAMENTO) {",
  "  } else if (!BENEFIT_TYPES.has(doc.document_type) && doc.document_type !== ADIANTAMENTO && doc.document_type !== AVISO_FERIAS) {",
  "doc.document_type !== ADIANTAMENTO && doc.document_type !== AVISO_FERIAS",
) || changed;

changed = patch(
  'api/payroll-public.ts',
  "        term_version: BENEFIT_TYPES.has(doc.document_type) ? 'benefit-signature-v1' : 'payroll-signature-v1',",
  "        term_version: doc.document_type === AVISO_FERIAS ? 'vacation-notice-signature-v1' : BENEFIT_TYPES.has(doc.document_type) ? 'benefit-signature-v1' : 'payroll-signature-v1',",
  "'vacation-notice-signature-v1'",
) || changed;

// Arquivo pessoal: mantém o aviso assinado disponível com o nome correto.
changed = patch(
  'api/payroll-archive.ts',
  "    const complement = doc.payment_kind === 'COMPLEMENTAR';\n    const baseLabel = doc.document_type === 'BENEFICIO_VR' ? 'Recibo VR' : doc.document_type === 'BENEFICIO_VT' ? 'Recibo VT' : doc.document_type === 'BENEFICIO_VR_VT' ? 'Recibo VR / VT' : doc.document_type === 'ADIANTAMENTO' ? 'Recibo de Adiantamento' : 'Holerite';\n    const label = complement && benefitTypes.length ? `${baseLabel} — Pagamento complementar` : baseLabel;\n    return {\n      id: `payroll:${doc.id}`,\n      source: 'payroll',\n      category: benefitTypes.length ? 'beneficio' : 'pagamento',",
  "    const complement = doc.payment_kind === 'COMPLEMENTAR';\n    const isVacation = doc.document_type === 'AVISO_FERIAS';\n    const baseLabel = isVacation ? 'Aviso de Férias' : doc.document_type === 'BENEFICIO_VR' ? 'Recibo VR' : doc.document_type === 'BENEFICIO_VT' ? 'Recibo VT' : doc.document_type === 'BENEFICIO_VR_VT' ? 'Recibo VR / VT' : doc.document_type === 'ADIANTAMENTO' ? 'Recibo de Adiantamento' : 'Holerite';\n    const label = complement && benefitTypes.length ? `${baseLabel} — Pagamento complementar` : baseLabel;\n    return {\n      id: `payroll:${doc.id}`,\n      source: 'payroll',\n      category: isVacation ? 'documento' : benefitTypes.length ? 'beneficio' : 'pagamento',",
  "const isVacation = doc.document_type === 'AVISO_FERIAS';",
) || changed;

// Painel de pendências: consulta todos os documentos assináveis, não só holerite.
changed = patch(
  'src/components/payroll/PendingPayrollSignatures.tsx',
  ".from('payroll_admin_status_v')",
  ".from('payroll_signature_status_v')",
  ".from('payroll_signature_status_v')",
) || changed;

const pendingHelper = `const signatureDocumentLabel = (documentType: string) => {\n  if (documentType === 'AVISO_FERIAS') return 'Aviso de Férias';\n  if (documentType === 'BENEFICIO_VR') return 'Recibo VR';\n  if (documentType === 'BENEFICIO_VT') return 'Recibo VT';\n  if (documentType === 'BENEFICIO_VR_VT') return 'Recibo VR / VT';\n  if (documentType === 'ADIANTAMENTO') return 'Recibo de Adiantamento';\n  if (documentType === 'RECIBO_GARAGEM') return 'Recibo de Garagem';\n  return 'Holerite';\n};\n\nconst pendingDocumentLabel = (doc: { document_type: string; competencia: string }) => {\n  const label = signatureDocumentLabel(doc.document_type);\n  const competencia = competenceLabel(doc.competencia);\n  return competencia ? \`${'${label}'} (${ '${competencia}' })\` : label;\n};\n\n`;

changed = patch(
  'src/components/payroll/PendingPayrollSignatures.tsx',
  'type PendingRow = {',
  `${pendingHelper}type PendingRow = {`,
  'const signatureDocumentLabel = (documentType: string)',
) || changed;

changed = patch(
  'src/components/payroll/PendingPayrollSignatures.tsx',
  "    const months = [...new Set(employee.documents.map(doc => doc.competencia).filter(Boolean))];\n    const pendingText = months.length\n      ? months.map(competenceLabel).join(', ')\n      : 'documento(s) já liberado(s)';",
  "    const pendingText = [...new Set(employee.documents.map(pendingDocumentLabel))].join(', ') || 'documento(s) já liberado(s)';",
  "employee.documents.map(pendingDocumentLabel)",
) || changed;

changed = patch(
  'src/components/payroll/PendingPayrollSignatures.tsx',
  "{[...new Set(employee.documents.map(doc => doc.competencia).filter(Boolean))].map(competenceLabel).join(' · ')}",
  "{[...new Set(employee.documents.map(pendingDocumentLabel))].join(' · ')}",
  "{[...new Set(employee.documents.map(pendingDocumentLabel))].join(' · ')}",
) || changed;

// Portal do funcionário: deixa claro que recebe documentos além de holerites e recibos.
const publicPath = 'src/pages/PayrollSignaturePublicPage.tsx';
let publicText = fs.readFileSync(publicPath, 'utf8');
const publicReplacements = [
  ['Portal de Holerites e Recibos', 'Portal de Documentos'],
  ['Nenhum holerite ou recibo é exibido antes da validação.', 'Nenhum documento é exibido antes da validação.'],
  ['Holerites assinados e recibos ficam guardados aqui para consulta futura.', 'Seus documentos assinados e recibos ficam guardados aqui para consulta futura.'],
];
for (const [from, to] of publicReplacements) {
  if (publicText.includes(from)) {
    publicText = publicText.replace(from, to);
    changed = true;
  }
}
fs.writeFileSync(publicPath, publicText, 'utf8');

// Tela de férias: adiciona o envio ao próprio funcionário para assinatura digital.
changed = patch(
  'src/pages/AvisoFeriasPage.tsx',
  "import VacationProgrammingReport from '@/components/ferias/VacationProgrammingReport';",
  "import VacationProgrammingReport from '@/components/ferias/VacationProgrammingReport';\nimport VacationSignatureButton from '@/components/ferias/VacationSignatureButton';",
  "import VacationSignatureButton from '@/components/ferias/VacationSignatureButton';",
) || changed;

changed = patch(
  'src/pages/AvisoFeriasPage.tsx',
  `            <Button onClick={handleEnviarEmailFerias} variant="outline" className="border-primary text-primary hover:bg-primary/10">\n              <Mail className="w-4 h-4 mr-2" /> Enviar por E-mail\n            </Button>`,
  `            <Button onClick={handleEnviarEmailFerias} variant="outline" className="border-primary text-primary hover:bg-primary/10">\n              <Mail className="w-4 h-4 mr-2" /> Enviar por E-mail\n            </Button>\n            <VacationSignatureButton\n              employee={emp}\n              company={company}\n              inicioFerias={inicioFerias}\n              fimFerias={fimFerias}\n              retorno={retorno}\n              diasFerias={diasFerias}\n              session={session}\n              onBeforePublish={() => salvarFeriasNoBanco({ silent: true })}\n            />`,
  '<VacationSignatureButton',
) || changed;

console.log(changed
  ? '[vacation-signature] Aviso de Férias integrado ao portal de assinatura.'
  : '[vacation-signature] Integração já aplicada; nenhuma alteração necessária.');
