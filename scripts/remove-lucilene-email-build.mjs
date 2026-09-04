import fs from 'node:fs';

const blocked = 'lucilene@aatconsultoria.com.br';

const patch = (file, transform) => {
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
};

patch('src/lib/emailUtils.ts', (source) => {
  let next = source;

  if (!next.includes("const EMAILS_REMOVIDOS = new Set(['lucilene@aatconsultoria.com.br'])")) {
    next = next.replace(
      "const EMAIL_GOIANIA_ANTIGO = 'gyn@topac.com.br';",
      "const EMAIL_GOIANIA_ANTIGO = 'gyn@topac.com.br';\nconst EMAILS_REMOVIDOS = new Set(['lucilene@aatconsultoria.com.br']);",
    );
  }

  next = next.replace(
    ".filter(Boolean)\n      .map((email) => email === EMAIL_GOIANIA_ANTIGO ? EMAIL_GOIANIA : email),",
    ".filter(Boolean)\n      .filter((email) => !EMAILS_REMOVIDOS.has(email))\n      .map((email) => email === EMAIL_GOIANIA_ANTIGO ? EMAIL_GOIANIA : email),",
  );

  next = next.replaceAll("'marisa@aatconsultoria.com.br', 'lucilene@aatconsultoria.com.br', 'dp@aatconsultoria.com.br'", "'marisa@aatconsultoria.com.br', 'dp@aatconsultoria.com.br'");
  next = next.replaceAll('"marisa@aatconsultoria.com.br", "lucilene@aatconsultoria.com.br", "dp@aatconsultoria.com.br"', '"marisa@aatconsultoria.com.br", "dp@aatconsultoria.com.br"');
  return next;
});

patch('src/lib/emailPolicy.ts', (source) => {
  let next = source;
  if (!next.includes("const EMAILS_REMOVIDOS = new Set(['lucilene@aatconsultoria.com.br'])")) {
    next = next.replace(
      "export const TOPAC_REPORT_SIGNATURE = 'Atenciosamente,\\nAdministrador Topac RH PRO Multiempresas';",
      "export const TOPAC_REPORT_SIGNATURE = 'Atenciosamente,\\nAdministrador Topac RH PRO Multiempresas';\nconst EMAILS_REMOVIDOS = new Set(['lucilene@aatconsultoria.com.br']);",
    );
  }
  next = next.replace(
    "values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean),",
    "values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).filter((email) => !EMAILS_REMOVIDOS.has(email)),",
  );
  return next;
});

for (const file of ['src/components/EmailPdfModal.tsx', 'src/pages/PreCadastroAdmissionalOcrPage.tsx']) {
  patch(file, (source) => source
    .replaceAll("'marisa@aatconsultoria.com.br', 'lucilene@aatconsultoria.com.br', 'dp@aatconsultoria.com.br'", "'marisa@aatconsultoria.com.br', 'dp@aatconsultoria.com.br'")
    .replaceAll('"marisa@aatconsultoria.com.br", "lucilene@aatconsultoria.com.br", "dp@aatconsultoria.com.br"', '"marisa@aatconsultoria.com.br", "dp@aatconsultoria.com.br"'));
}

console.log(`[email-recipient-cleanup] ${blocked} removido de Para/CC e bloqueado globalmente`);
