import fs from 'node:fs';

const replaceOnce = (file, oldText, newText, label, marker = newText) => {
  if (!fs.existsSync(file)) throw new Error(`[abastecimento-auto] arquivo ausente: ${file}`);
  const before = fs.readFileSync(file, 'utf8');
  if (before.includes(marker)) {
    console.log(`[abastecimento-auto] ${label}: já aplicado`);
    return;
  }
  if (!before.includes(oldText)) throw new Error(`[abastecimento-auto] ancora não encontrada: ${label}`);
  const after = before.replace(oldText, newText);
  fs.writeFileSync(file, after);
  console.log(`[abastecimento-auto] ${label}`);
};

const mechanicFile = 'src/app-mecanico/pages/AbastecimentoPageV4.tsx';

replaceOnce(
  mechanicFile,
  `  const abrirWhatsApp = (phone: string, auth = autorizacao, station = postoAtual) => {\n    if (!auth) return;\n    window.open(\`https://wa.me/\${phone}?text=\${encodeURIComponent(buildWhatsAppText(auth, station))}\`, "_blank", "noopener,noreferrer");\n  };`,
  `  const liberarAposWhatsApp = async (auth: Authorization) => {\n    const { data, error } = await supabaseRpc.rpc("app_mecanico_liberar_abastecimento_apos_whatsapp", {\n      p_acesso_id: mecanico.acesso_id,\n      p_autorizacao_id: auth.id,\n    });\n    const result = data as StatusResult | null;\n    if (error || !result?.ok || !result.authorization) {\n      toast.error("Solicitação enviada, mas não foi possível confirmar a liberação. Tente novamente.");\n      return null;\n    }\n    const current = result.authorization;\n    setAutorizacao(current);\n    if (current.status === "autorizado") setStep(chooseAuthorizedStep());\n    return current;\n  };\n\n  const abrirWhatsApp = async (phone: string, auth = autorizacao, station = postoAtual) => {\n    if (!auth) return;\n    const popup = window.open(\`https://wa.me/\${phone}?text=\${encodeURIComponent(buildWhatsAppText(auth, station))}\`, "_blank", "noopener,noreferrer");\n    if (!popup) {\n      toast.error("Não foi possível abrir o WhatsApp. Tente novamente.");\n      return;\n    }\n    await liberarAposWhatsApp(auth);\n  };`,
  'WhatsApp passa a confirmar a liberação da própria solicitação',
  'app_mecanico_liberar_abastecimento_apos_whatsapp',
);

replaceOnce(
  mechanicFile,
  `      if (!result.existing) {\n        WHATSAPP_RECIPIENTS.forEach(r =>\n          window.open(\`https://wa.me/\${r.phone}?text=\${encodeURIComponent(buildWhatsAppText(auth, result.posto || null))}\`, "_blank", "noopener,noreferrer")\n        );\n      }`,
  `      if (!result.existing) {\n        let whatsappOpened = false;\n        WHATSAPP_RECIPIENTS.forEach(r => {\n          const popup = window.open(\`https://wa.me/\${r.phone}?text=\${encodeURIComponent(buildWhatsAppText(auth, result.posto || null))}\`, "_blank", "noopener,noreferrer");\n          if (popup) whatsappOpened = true;\n        });\n        if (whatsappOpened) await liberarAposWhatsApp(auth);\n      }`,
  'solicitação nova libera somente após o handoff ao WhatsApp',
  'if (whatsappOpened) await liberarAposWhatsApp(auth);',
);

replaceOnce(
  mechanicFile,
  `onClick={() => abrirWhatsApp(r.phone)}`,
  `onClick={() => void abrirWhatsApp(r.phone)}`,
  'botões de reenvio do WhatsApp também liberam a solicitação',
  'onClick={() => void abrirWhatsApp(r.phone)}',
);

const adminFile = 'src/pages/admin/AppMecanicoAdminPage.tsx';

replaceOnce(
  adminFile,
  `.from('abastecimento_autorizacoes').select('id,funcionario_nome,empresa_nome,filial,placa,combustivel,posto_nome,solicitado_em,status').eq('status', 'pendente').order('solicitado_em', { ascending: false })`,
  `.from('abastecimento_autorizacoes').select('id,funcionario_nome,empresa_nome,filial,placa,combustivel,posto_nome,solicitado_em,status').in('status', ['pendente', 'autorizado']).gte('solicitado_em', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()).order('solicitado_em', { ascending: false })`,
  'painel mantém solicitações recentes visíveis mesmo após liberação',
  `.in('status', ['pendente', 'autorizado'])`,
);

replaceOnce(
  adminFile,
  `Nenhuma autorização de abastecimento pendente.`,
  `Nenhuma solicitação de abastecimento recente.`,
  'texto vazio do painel atualizado',
);

replaceOnce(
  adminFile,
  `<h2 className="text-sm font-black text-white">Autorizações pendentes</h2><Badge variant="destructive">{rows.length}</Badge>`,
  `<h2 className="text-sm font-black text-white">Solicitações de abastecimento</h2><Badge variant="outline">{rows.length}</Badge>`,
  'título do painel passa a representar pendentes e liberadas',
);

replaceOnce(
  adminFile,
  `<div className="mt-3 flex gap-2"><Button size="sm" variant="destructive" disabled={acting === row.id} onClick={() => void decide(row, 'negar')}>Negar</Button><Button size="sm" disabled={acting === row.id} onClick={() => void decide(row, 'autorizar')}>Autorizar</Button></div>`,
  `<div className="mt-3 flex gap-2">{row.status === 'autorizado' ? <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/10">Liberado</Badge> : <><Button size="sm" variant="destructive" disabled={acting === row.id} onClick={() => void decide(row, 'negar')}>Negar</Button><Button size="sm" disabled={acting === row.id} onClick={() => void decide(row, 'autorizar')}>Autorizar</Button></>}</div>`,
  'solicitações já liberadas ficam visíveis sem exigir ação manual',
  `row.status === 'autorizado' ? <Badge`,
);

console.log('[abastecimento-auto] fluxo pronto: solicitação -> WhatsApp -> liberação automática, mantendo registro no painel');
