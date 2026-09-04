import fs from 'node:fs';

const path = 'src/components/payroll/PayrollPortalAdminModule.tsx';
const source = fs.readFileSync(path, 'utf8');

const oldFunctions = `  const copyPortal = async () => {
    try { await navigator.clipboard.writeText(portalUrl); toast.success(\`Link do portal da \${company?.name || 'empresa'} copiado.\`); }
    catch { window.prompt('Copie o link do Portal de Holerite desta empresa:', portalUrl); }
  };

  const sharePortalWhatsApp = () => {
    const text = \`Pessoal, os documentos para conferência e assinatura estão disponíveis no Portal TOPAC RH PRO da \${company?.name || 'empresa'}. Acesse pelo link abaixo e entre com CPF, data de nascimento e os 4 últimos números do celular cadastrado:\n\n\${portalUrl}\`;
    window.open(\`https://wa.me/?text=\${encodeURIComponent(text)}\`, '_blank', 'noopener,noreferrer');
  };
`;

const newFunctions = `  const copyPortal = async () => {
    try { await navigator.clipboard.writeText(portalUrl); toast.success(\`Link do portal da \${company?.name || 'empresa'} copiado.\`); }
    catch { window.prompt('Copie o link do Portal de Holerite desta empresa:', portalUrl); }
  };

  const formatMessageCompetencia = (value: unknown) => {
    const [year, month] = String(value || '').split('-');
    return year && month ? \`\${month}/\${year}\` : String(value || '');
  };

  const buildPortalShareMessage = async () => {
    const now = new Date();
    const hourPart = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      hour12: false,
      hourCycle: 'h23',
      timeZone: 'America/Sao_Paulo',
    }).formatToParts(now).find(part => part.type === 'hour')?.value;
    const hour = Number(hourPart || '12');
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

    const items: Array<{ order: number; label: string; competencia: string }> = [];
    if (rows.some((row: any) => row.holerite_confirmed)) {
      items.push({ order: 10, label: 'Pagamento', competencia });
    }

    try {
      const { data, error } = await (supabase as any)
        .from('payroll_documents')
        .select('document_type,competencia,confirmed,is_current,status,created_at')
        .eq('company_id', companyId)
        .eq('is_current', true)
        .in('document_type', ['ADIANTAMENTO', 'BENEFICIO_VR', 'BENEFICIO_VT', 'BENEFICIO_VR_VT', 'RECIBO_GARAGEM'])
        .order('competencia', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;

      const docs = ((data as any[]) || []).filter(row => row?.confirmed !== false && String(row?.status || '').toUpperCase() !== 'SUBSTITUIDO');
      const currentDocs = docs.filter(row => String(row.competencia || '') === competencia);
      if (currentDocs.some(row => row.document_type === 'ADIANTAMENTO')) items.push({ order: 20, label: 'Adiantamento salarial', competencia });
      if (currentDocs.some(row => row.document_type === 'RECIBO_GARAGEM')) items.push({ order: 50, label: 'Recibo de Garagem', competencia });

      const latestByType = (types: string[]) => docs.find(row => types.includes(String(row.document_type || '')));
      const vrDoc = latestByType(['BENEFICIO_VR', 'BENEFICIO_VR_VT']);
      const vtDoc = latestByType(['BENEFICIO_VT', 'BENEFICIO_VR_VT']);
      if (vrDoc) items.push({ order: 30, label: 'Vale-Refeição (VR)', competencia: String(vrDoc.competencia || competencia) });
      if (vtDoc) items.push({ order: 40, label: 'Vale-Transporte (VT)', competencia: String(vtDoc.competencia || competencia) });
    } catch (error) {
      console.warn('[signature-share-message]', error);
    }

    const unique = Array.from(new Map(items.map(item => [\`\${item.label}:\${item.competencia}\`, item])).values())
      .sort((a, b) => a.order - b.order);
    const companyName = company?.name || 'empresa';
    const documentBlock = unique.length
      ? unique.map(item => \`• \${item.label} — competência \${formatMessageCompetencia(item.competencia)}\`).join('\\n')
      : '• Documentos disponíveis para conferência e assinatura';

    return \`\${greeting}!\n\nSegue o link referente aos documentos abaixo para conferência e assinatura digital — \${companyName}:\n\n\${documentBlock}\n\nAcesse pelo link:\n\${portalUrl}\n\nPara entrar, utilize seu CPF, data de nascimento e os 4 últimos números do celular cadastrado.\n\nApós o acesso, confira os documentos e realize a assinatura digital. Em caso de dúvida, entre em contato no particular.\`;
  };

  const copyPortalMessage = async () => {
    try {
      const text = await buildPortalShareMessage();
      await navigator.clipboard.writeText(text);
      toast.success('Mensagem de assinatura copiada.');
    } catch {
      const text = await buildPortalShareMessage();
      window.prompt('Copie a mensagem de assinatura:', text);
    }
  };

  const sharePortalWhatsApp = async () => {
    const text = await buildPortalShareMessage();
    window.open(\`https://wa.me/?text=\${encodeURIComponent(text)}\`, '_blank', 'noopener,noreferrer');
  };
`;

const oldButtons = `<div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" onClick={()=>void copyPortal()}><Copy className="mr-2 h-4 w-4"/>Copiar link</Button><Button variant="outline" onClick={sharePortalWhatsApp}>Compartilhar no WhatsApp</Button><Button variant="outline" onClick={()=>window.open(portalUrl,'_blank','noopener,noreferrer')}><ExternalLink className="mr-2 h-4 w-4"/>Abrir portal</Button></div>`;
const newButtons = `<div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" onClick={()=>void copyPortal()}><Copy className="mr-2 h-4 w-4"/>Copiar link</Button><Button variant="outline" onClick={()=>void copyPortalMessage()}><Copy className="mr-2 h-4 w-4"/>Copiar mensagem</Button><Button variant="outline" onClick={()=>void sharePortalWhatsApp()}>Compartilhar no WhatsApp</Button><Button variant="outline" onClick={()=>window.open(portalUrl,'_blank','noopener,noreferrer')}><ExternalLink className="mr-2 h-4 w-4"/>Abrir portal</Button></div>`;

let next = source;
if (!next.includes('const buildPortalShareMessage = async () => {')) {
  if (!next.includes(oldFunctions)) throw new Error('Trecho de compartilhamento do portal não encontrado.');
  next = next.replace(oldFunctions, newFunctions);
}
if (!next.includes('Copiar mensagem</Button>')) {
  if (!next.includes(oldButtons)) throw new Error('Bloco de botões do portal não encontrado.');
  next = next.replace(oldButtons, newButtons);
}

if (next !== source) fs.writeFileSync(path, next, 'utf8');
console.log('[signature-share-message] mensagem inteligente aplicada');
