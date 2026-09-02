import fs from 'node:fs';

const patchFile = (path, transform) => {
  let source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next, 'utf8');
};

const replaceOnce = (source, oldText, newText, label) => {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) throw new Error(`[email-cc] trecho não encontrado (${label})`);
  return source.replace(oldText, newText);
};

const replaceAll = (source, oldText, newText) => source.includes(newText) ? source : source.split(oldText).join(newText);

patchFile('api/send-email-pdf.ts', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    "const DEFAULT_EMAIL_REPLY_TO = 'adm.matriz@topac.com.br';",
    "const DEFAULT_EMAIL_REPLY_TO = 'adm.matriz@topac.com.br';\nconst MANDATORY_EMAIL_CC = ['adm.matriz@topac.com.br', 'robson@topac.com.br'];",
    'constante global',
  );
  source = replaceOnce(
    source,
    "      cc: cleanList(body.cc),",
    "      cc: cleanList([body.cc, ...MANDATORY_EMAIL_CC]),",
    'cc do payload',
  );
  source = replaceOnce(
    source,
    "    };\n    if (!payload.to.length || !payload.subject || !payload.body || !payload.attachments.length)",
    "    };\n    payload.cc = payload.cc.filter((email: string) => !payload.to.includes(email));\n    if (!payload.to.length || !payload.subject || !payload.body || !payload.attachments.length)",
    'deduplicação de destinatários',
  );
  return source;
});

patchFile('src/components/BulkBankingDataEditor.tsx', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    "type PreparedEmail = { to: string; subject: string; body: string };",
    "type PreparedEmail = { to: string; cc: string[]; subject: string; body: string };",
    'tipo PreparedEmail',
  );
  source = replaceOnce(
    source,
    "const FINANCE_EMAIL = 'financeiro@topac.com.br';",
    "const FINANCE_EMAIL = 'financeiro@topac.com.br';\nconst MANDATORY_EMAIL_CC = ['adm.matriz@topac.com.br', 'robson@topac.com.br'];",
    'cc bancário',
  );
  source = replaceAll(
    source,
    "    to: FINANCE_EMAIL,\n    subject:",
    "    to: FINANCE_EMAIL,\n    cc: MANDATORY_EMAIL_CC,\n    subject:",
  );
  source = replaceOnce(
    source,
    "  window.location.href = `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;",
    "  window.location.href = `mailto:${encodeURIComponent(email.to)}?cc=${encodeURIComponent(email.cc.join(','))}&subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;",
    'mailto bancário',
  );
  source = replaceOnce(
    source,
    "        email_to: email.to,\n        email_subject:",
    "        email_to: email.to,\n        email_cc: email.cc.join('; '),\n        email_subject:",
    'histórico cc',
  );
  source = replaceOnce(
    source,
    "    await navigator.clipboard.writeText(`Para: ${preparedEmail.to}\\nAssunto: ${preparedEmail.subject}\\n\\n${preparedEmail.body}`);",
    "    await navigator.clipboard.writeText(`Para: ${preparedEmail.to}\\nCc: ${preparedEmail.cc.join('; ')}\\nAssunto: ${preparedEmail.subject}\\n\\n${preparedEmail.body}`);",
    'copiar email bancário',
  );
  source = replaceOnce(
    source,
    "<p className=\"text-xs text-muted-foreground\">Para Robson e Paula · {preparedEmail.to}</p>",
    "<p className=\"text-xs text-muted-foreground\">Para Robson e Paula · {preparedEmail.to} · CC: {preparedEmail.cc.join(', ')}</p>",
    'visual cc bancário',
  );
  return source;
});

patchFile('src/pages/HistoricoPage.tsx', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    "  email_to: string;\n  email_subject?: string | null;",
    "  email_to: string;\n  email_cc?: string | null;\n  email_subject?: string | null;",
    'tipo histórico',
  );
  source = replaceOnce(
    source,
    ".select('id,employee_id,company_id,changed_at,fields_changed,email_to,email_subject,email_body,email_status')",
    ".select('id,employee_id,company_id,changed_at,fields_changed,email_to,email_cc,email_subject,email_body,email_status')",
    'select histórico',
  );
  source = replaceOnce(
    source,
    "      emailTo?: string;\n      emailSubject?: string;",
    "      emailTo?: string;\n      emailCc?: string;\n      emailSubject?: string;",
    'item histórico',
  );
  source = replaceOnce(
    source,
    "        emailTo: change.email_to,\n        emailSubject:",
    "        emailTo: change.email_to,\n        emailCc: change.email_cc || '',\n        emailSubject:",
    'dados cc histórico',
  );
  source = replaceOnce(
    source,
    "    await navigator.clipboard.writeText(`Para: ${record.emailTo}\\nAssunto: ${record.emailSubject}\\n\\n${record.emailBody}`);",
    "    await navigator.clipboard.writeText(`Para: ${record.emailTo}\\nCc: ${record.emailCc || 'adm.matriz@topac.com.br; robson@topac.com.br'}\\nAssunto: ${record.emailSubject}\\n\\n${record.emailBody}`);",
    'copiar histórico',
  );
  source = replaceOnce(
    source,
    "    window.location.href = `mailto:${encodeURIComponent(record.emailTo)}?subject=${encodeURIComponent(record.emailSubject || '')}&body=${encodeURIComponent(record.emailBody || '')}`;",
    "    window.location.href = `mailto:${encodeURIComponent(record.emailTo)}?cc=${encodeURIComponent(record.emailCc || 'adm.matriz@topac.com.br,robson@topac.com.br')}&subject=${encodeURIComponent(record.emailSubject || '')}&body=${encodeURIComponent(record.emailBody || '')}`;",
    'abrir histórico',
  );
  return source;
});

console.log('[email-cc] CC obrigatório aplicado: adm.matriz@topac.com.br + robson@topac.com.br');
