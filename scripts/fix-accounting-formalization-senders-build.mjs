import fs from 'node:fs';

const SP_FROM = 'TOPAC RH PRO | Contabilidade SP <contabilidade.sp@topacrh.pro>';
const GO_FROM = 'TOPAC RH PRO | Contabilidade Goiânia <contabilidade.goiania@topacrh.pro>';

function patchPayrollFlow() {
  const file = 'api/accounting-payroll-flow.ts';
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, 'utf8');

  if (!text.includes('FORMALIZATION_FROM_SP')) {
    text = text.replace(
      "const DEFAULT_EMAIL_FROM = 'TOPAC RH PRO <no-reply@topacrh.pro>';",
      "const DEFAULT_EMAIL_FROM = 'TOPAC RH PRO <no-reply@topacrh.pro>';\nconst FORMALIZATION_FROM_SP = '" + SP_FROM + "';\nconst FORMALIZATION_FROM_GO = '" + GO_FROM + "';"
    );
  }

  if (!text.includes('const formalizationFrom =')) {
    text = text.replace(
      "const verifiedFrom = () => {",
      "const formalizationFrom = (portal: unknown) => clean(portal).toLowerCase() === 'goiania' ? FORMALIZATION_FROM_GO : FORMALIZATION_FROM_SP;\nconst verifiedFrom = () => {"
    );
  }

  text = text.replace(
    "const sendResend = async (input: { to: string[]; cc?: string[]; replyTo?: string; subject: string; body: string; attachments?: Array<{ filename: string; content: string }> }) => {",
    "const sendResend = async (input: { from?: string; to: string[]; cc?: string[]; replyTo?: string; subject: string; body: string; attachments?: Array<{ filename: string; content: string }> }) => {"
  );
  text = text.replace('      from: verifiedFrom(),', '      from: clean(input.from) || verifiedFrom(),');
  text = text.replaceAll(
    '  const result = await sendResend({\n    to, cc,',
    '  const result = await sendResend({\n    from: formalizationFrom(cycle.portal),\n    to, cc,'
  );

  fs.writeFileSync(file, text);
  console.log('[accounting-formalization] remetentes SP/Goiânia aplicados ao fluxo de folha');
}

function patchClosingFlow() {
  const file = 'api/accounting-closing-flow.ts';
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, 'utf8');

  text = text.replace(
    'async function sendAccountingEmail(input: { emails: string[]; companyName: string; competencia: string; filename: string; bytes: Uint8Array }) {',
    'async function sendAccountingEmail(input: { portal: string; emails: string[]; companyName: string; competencia: string; filename: string; bytes: Uint8Array }) {'
  );

  text = text.replace(
    "  const configured = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM);\n  const from = configured && !/@resend\\.dev/i.test(configured) ? configured : 'TOPAC RH PRO <no-reply@topacrh.pro>';",
    "  const from = clean(input.portal).toLowerCase() === 'goiania'\n    ? '" + GO_FROM + "'\n    : '" + SP_FROM + "';"
  );

  text = text.replace(
    "      reply_to: 'adm.matriz@topac.com.br',",
    "      reply_to: clean(input.portal).toLowerCase() === 'goiania' ? 'adm.gyn@topac.com.br' : 'adm.matriz@topac.com.br',"
  );

  text = text.replace(
    'const email = await sendAccountingEmail({ emails, companyName: company.nome, competencia, filename, bytes });',
    'const email = await sendAccountingEmail({ portal, emails, companyName: company.nome, competencia, filename, bytes });'
  );

  fs.writeFileSync(file, text);
  console.log('[accounting-formalization] remetente correto aplicado ao fechamento/apontamento');
}

patchPayrollFlow();
patchClosingFlow();
