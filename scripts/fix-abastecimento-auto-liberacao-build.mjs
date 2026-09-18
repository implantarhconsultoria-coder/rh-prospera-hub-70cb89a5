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

console.log('[abastecimento-auto] fluxo pronto: solicitação criada -> liberação automática no banco; WhatsApp permanece com a mensagem original');
