import fs from 'node:fs';
import path from 'node:path';

const blocked = 'lucilene@aatconsultoria.com.br';
const blockedExpression = "'lucilene' + '@aatconsultoria.com.br'";

const patch = (file, transform) => {
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
};

const walk = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx|js|jsx)$/i.test(entry.name) ? [full] : [];
  });
};

// Remove qualquer configuração antiga/hardcoded do endereço em todo o front e APIs.
for (const file of [...walk('src'), ...walk('api')]) {
  patch(file, (source) => source.replaceAll(blocked, ''));
}

// Proteção no cliente: mesmo que um rascunho antigo ainda carregue o endereço, ele é filtrado.
patch('src/lib/emailUtils.ts', (source) => {
  let next = source;
  if (!next.includes('const EMAILS_REMOVIDOS = new Set')) {
    next = next.replace(
      "const EMAIL_GOIANIA_ANTIGO = 'gyn@topac.com.br';",
      `const EMAIL_GOIANIA_ANTIGO = 'gyn@topac.com.br';\nconst EMAILS_REMOVIDOS = new Set([${blockedExpression}]);`,
    );
  }
  next = next.replace(
    ".filter(Boolean)\n      .map((email) => email === EMAIL_GOIANIA_ANTIGO ? EMAIL_GOIANIA : email),",
    ".filter(Boolean)\n      .filter((email) => !EMAILS_REMOVIDOS.has(email))\n      .map((email) => email === EMAIL_GOIANIA_ANTIGO ? EMAIL_GOIANIA : email),",
  );
  return next;
});

patch('src/lib/emailPolicy.ts', (source) => {
  let next = source;
  if (!next.includes('const EMAILS_REMOVIDOS = new Set')) {
    next = next.replace(
      "export const TOPAC_REPORT_SIGNATURE = 'Atenciosamente,\\nAdministrador Topac RH PRO Multiempresas';",
      `export const TOPAC_REPORT_SIGNATURE = 'Atenciosamente,\\nAdministrador Topac RH PRO Multiempresas';\nconst EMAILS_REMOVIDOS = new Set([${blockedExpression}]);`,
    );
  }
  next = next.replace(
    "values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean),",
    "values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).filter((email) => !EMAILS_REMOVIDOS.has(email)),",
  );
  return next;
});

// Proteção final no servidor: Lucilene não pode chegar nem em Para nem em CC,
// mesmo que algum navegador esteja com um rascunho antigo em cache.
patch('api/send-email-pdf.ts', (source) => {
  let next = source;
  if (!next.includes('const BLOCKED_EMAIL_RECIPIENTS = new Set')) {
    next = next.replace(
      "const parseBody = (req: any) => {",
      `const BLOCKED_EMAIL_RECIPIENTS = new Set([${blockedExpression}]);\n\nconst parseBody = (req: any) => {`,
    );
  }
  next = next.replace(
    "return Array.from(new Set(matches.map((email) => email.trim().toLowerCase())));",
    "return Array.from(new Set(matches.map((email) => email.trim().toLowerCase()).filter((email) => !BLOCKED_EMAIL_RECIPIENTS.has(email))));",
  );
  return next;
});

console.log(`[email-recipient-cleanup] ${blocked} removido de toda configuracao e bloqueado no cliente + servidor`);
