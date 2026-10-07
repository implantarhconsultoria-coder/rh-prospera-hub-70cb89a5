import fs from 'node:fs';

const path = 'src/components/payroll/PayrollPortalAdminModule.tsx';
const source = fs.readFileSync(path, 'utf8');

const unsafeShare = `  const sharePortalWhatsApp = async () => {
    const text = await buildPortalShareMessage();
    window.open(\`https://wa.me/?text=\${encodeURIComponent(text)}\`, '_blank', 'noopener,noreferrer');
  };
`;

const secureShare = `  const sharePortalWhatsApp = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão administrativa expirada. Entre novamente.');
      const response = await fetch('/api/payroll-whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: \`Bearer \${token}\` },
        cache: 'no-store',
        body: JSON.stringify({ action: 'send-pending', company_id: companyId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || \`Falha \${response.status}\`);
      if (result.failed > 0) toast.warning(\`Envio concluído: \${result.sent} enviado(s), \${result.failed} falha(s).\`);
      else toast.success(\`Pendências enviadas pelo WhatsApp para \${result.sent} funcionário(s).\`);
      await load(true);
    } catch (error: any) {
      const code = String(error?.message || error);
      const message = code === 'message_channel_not_configured'
        ? 'Canal de WhatsApp não configurado no servidor.'
        : code === 'unauthorized'
          ? 'Sessão administrativa expirada. Entre novamente.'
          : code;
      toast.error(message || 'Não foi possível enviar as pendências pelo WhatsApp.');
    }
  };
`;

let next = source;
if (next.includes(unsafeShare)) next = next.replace(unsafeShare, secureShare);
if (next.includes('window.open(`https://wa.me/?text=${encodeURIComponent(text)}`')) {
  throw new Error('Fluxo inseguro wa.me de assinatura ainda presente após o patch de build.');
}
next = next.replace('>Compartilhar no WhatsApp</Button>', '>Enviar pendentes WhatsApp</Button>');

if (next !== source) fs.writeFileSync(path, next, 'utf8');
console.log('[signature-share-message] envio de assinatura roteado pelo backend seguro');

await import('./fix-payroll-dossier-build.mjs');
await import('./fix-physical-signature-reminder-build.mjs');
