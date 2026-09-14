import fs from 'node:fs';

const replaceOrFail = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[employee-archive-cards] trecho não encontrado: ${label}`);
  return source.replace(before, after);
};

// 1) API do arquivo pessoal: classifica explicitamente cada documento e inclui Férias/Reembolso em Outros.
{
  const path = 'api/payroll-archive.ts';
  let source = fs.readFileSync(path, 'utf8');

  if (!source.includes('const personalOtherFlags =')) {
    const marker = `const benefitFlags = (value: string) => {\n  const text = normalizeText(value);\n  const vr = /(^|[^a-z])vr([^a-z]|$)/.test(text)\n    || text.includes('vale refeicao')\n    || text.includes('vale-refeicao')\n    || text.includes('vale alimentacao');\n  const vt = /(^|[^a-z])vt([^a-z]|$)/.test(text)\n    || text.includes('vale transporte')\n    || text.includes('vale-transporte');\n  return { vr, vt };\n};`;
    const addition = `${marker}\n\nconst personalOtherFlags = (value: string) => {\n  const text = normalizeText(value);\n  const ferias = text.includes('ferias') || text.includes('feria');\n  const reembolso = text.includes('reembolso') || text.includes('ressarcimento');\n  return { ferias, reembolso, allowed: ferias || reembolso };\n};`;
    source = replaceOrFail(source, marker, addition, 'helper outros');
  }

  if (!source.includes('const historicalOtherDocs =')) {
    const marker = `  const historicalBenefits = (benefitDocs || []).filter((doc: any) => {\n    if (importedSourceIds.has(doc.id)) return false;\n    const flags = benefitFlags([doc.tipo_documento, doc.categoria, doc.descricao, doc.nome_arquivo].filter(Boolean).join(' | '));\n    return flags.vr || flags.vt;\n  });`;
    const addition = `${marker}\n\n  const historicalOtherDocs = (benefitDocs || []).filter((doc: any) => {\n    if (importedSourceIds.has(doc.id)) return false;\n    const text = [doc.tipo_documento, doc.categoria, doc.descricao, doc.nome_arquivo].filter(Boolean).join(' | ');\n    const benefits = benefitFlags(text);\n    if (benefits.vr || benefits.vt) return false;\n    return personalOtherFlags(text).allowed;\n  });`;
    source = replaceOrFail(source, marker, addition, 'historico outros');
  }

  if (!source.includes("archive_kinds: doc.document_type === 'HOLERITE'")) {
    source = replaceOrFail(
      source,
      `      benefit_types: benefitTypes,\n      label,`,
      `      benefit_types: benefitTypes,\n      archive_kinds: doc.document_type === 'HOLERITE' ? ['holerite']\n        : doc.document_type === 'BENEFICIO_VR' ? ['vr']\n        : doc.document_type === 'BENEFICIO_VT' ? ['vt']\n        : doc.document_type === 'BENEFICIO_VR_VT' ? ['vr', 'vt']\n        : doc.document_type === 'RECIBO_GARAGEM' ? ['garagem']\n        : ['outros'],\n      document_type: doc.document_type,\n      label,`,
      'classificacao payroll',
    );
  }

  if (!source.includes("archive_kinds: [flags.vr ? 'vr'")) {
    source = replaceOrFail(
      source,
      `      benefit_types: [flags.vr ? 'VR' : null, flags.vt ? 'VT' : null].filter(Boolean),\n      label: flags.vr && flags.vt ? 'Recibo VR + VT' : flags.vr ? 'Recibo VR' : 'Recibo VT',`,
      `      benefit_types: [flags.vr ? 'VR' : null, flags.vt ? 'VT' : null].filter(Boolean),\n      archive_kinds: [flags.vr ? 'vr' : null, flags.vt ? 'vt' : null].filter(Boolean),\n      document_type: doc.tipo_documento || doc.categoria || 'BENEFICIO',\n      label: flags.vr && flags.vt ? 'Recibo VR + VT' : flags.vr ? 'Recibo VR' : 'Recibo VT',`,
      'classificacao beneficio historico',
    );
  }

  if (!source.includes('const otherItems = await Promise.all(historicalOtherDocs.map')) {
    const marker = `  return [...payrollItems, ...benefitItems]\n    .filter(Boolean)\n    .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());`;
    const replacement = `  const otherItems = await Promise.all(historicalOtherDocs.map(async (doc: any) => {\n    const text = [doc.tipo_documento, doc.categoria, doc.descricao, doc.nome_arquivo].filter(Boolean).join(' | ');\n    const flags = personalOtherFlags(text);\n    const path = doc.storage_path || (doc.arquivo_url && !/^https?:\\/\\//i.test(doc.arquivo_url) ? doc.arquivo_url : '');\n    const bucket = doc.storage_bucket || 'documentos-funcionarios';\n    const url = path\n      ? await createFileUrl(service, bucket, path)\n      : (/^https?:\\/\\//i.test(doc.arquivo_url || '') ? doc.arquivo_url : null);\n    if (!url) return null;\n    return {\n      id: \`other:\${doc.id}\`,\n      source: 'historico',\n      category: 'outros',\n      archive_kinds: ['outros'],\n      benefit_types: [],\n      document_type: doc.tipo_documento || doc.categoria || 'OUTROS',\n      label: flags.reembolso ? 'Reembolso' : flags.ferias ? 'Férias' : (doc.tipo_documento || 'Documento'),\n      competencia: doc.competencia || '',\n      filename: doc.nome_arquivo || '',\n      date: doc.data_documento || doc.created_at,\n      signed: false,\n      signed_at: null,\n      url,\n    };\n  }));\n\n  return [...payrollItems, ...benefitItems, ...otherItems]\n    .filter(Boolean)\n    .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());`;
    source = replaceOrFail(source, marker, replacement, 'itens outros + retorno');
  }

  fs.writeFileSync(path, source, 'utf8');
}

// 2) Portal: troca chips por cards/pastas dinâmicos. Card só aparece quando houver documento daquele tipo.
{
  const path = 'src/pages/PayrollSignaturePublicPage.tsx';
  let source = fs.readFileSync(path, 'utf8');

  source = source.replace(
    "useState<'todos' | 'pagamento' | 'vr' | 'vt' | 'garagem'>('todos')",
    "useState<'holerite' | 'vr' | 'vt' | 'garagem' | 'outros'>('holerite')",
  );

  const oldFilter = `  const filteredArchive = useMemo(() => archiveDocuments.filter((item) => {\n    if (archiveFilter === 'todos') return true;\n    if (archiveFilter === 'pagamento') return item.category === 'pagamento';\n    if (archiveFilter === 'vr') return Array.isArray(item.benefit_types) && item.benefit_types.includes('VR');\n    if (archiveFilter === 'vt') return Array.isArray(item.benefit_types) && item.benefit_types.includes('VT');\n    if (archiveFilter === 'garagem') return item.category === 'garagem';\n    return true;\n  }), [archiveDocuments, archiveFilter]);`;
  const newFilter = `  const archiveHasKind = (item: any, kind: 'holerite' | 'vr' | 'vt' | 'garagem' | 'outros') =>\n    Array.isArray(item?.archive_kinds) && item.archive_kinds.includes(kind);\n\n  const filteredArchive = useMemo(\n    () => archiveDocuments.filter((item) => archiveHasKind(item, archiveFilter)),\n    [archiveDocuments, archiveFilter],\n  );\n\n  const archiveCards = useMemo(() => ([\n    { key: 'holerite' as const, label: 'Holerites', helper: 'Pagamentos', Icon: FileCheck2 },\n    { key: 'vr' as const, label: 'VR', helper: 'Vale-refeição', Icon: Utensils },\n    { key: 'vt' as const, label: 'VT', helper: 'Vale-transporte', Icon: Bus },\n    { key: 'garagem' as const, label: 'Garagem', helper: 'Recibos de garagem', Icon: CarFront },\n    { key: 'outros' as const, label: 'Outros', helper: 'Férias e reembolsos', Icon: FileText },\n  ].map((card) => ({\n    ...card,\n    count: archiveDocuments.filter((item) => archiveHasKind(item, card.key)).length,\n  })).filter((card) => card.count > 0)), [archiveDocuments]);`;
  source = replaceOrFail(source, oldFilter, newFilter, 'filtro + cards');

  const oldLoad = `      const data = await archiveCall(activeSession);\n      setArchiveDocuments(data.documents || []);`;
  const newLoad = `      const data = await archiveCall(activeSession);\n      const nextArchive = data.documents || [];\n      setArchiveDocuments(nextArchive);\n      setArchiveFilter((current) => {\n        const currentExists = nextArchive.some((item: any) => Array.isArray(item?.archive_kinds) && item.archive_kinds.includes(current));\n        if (currentExists) return current;\n        const priority = ['holerite', 'vr', 'vt', 'garagem', 'outros'] as const;\n        return priority.find((kind) => nextArchive.some((item: any) => Array.isArray(item?.archive_kinds) && item.archive_kinds.includes(kind))) || 'holerite';\n      });`;
  source = replaceOrFail(source, oldLoad, newLoad, 'selecao automatica');

  const oldButtons = `              <div className="mt-4 flex flex-wrap gap-2">\n                {([\n                  ['todos', 'Todos', FileText],\n                  ['pagamento', 'Holerites', FileCheck2],\n                  ['vr', 'VR', Utensils],\n                  ['vt', 'VT', Bus],\n                  ['garagem', 'Garagem', CarFront],\n                ] as const).map(([value, label, Icon]) => (\n                  <button\n                    key={value}\n                    type="button"\n                    onClick={() => setArchiveFilter(value)}\n                    className={\`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold \${archiveFilter === value ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'}\`}\n                  >\n                    <Icon className="h-3.5 w-3.5" />{label}\n                  </button>\n                ))}\n              </div>`;

  const newCards = `              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">\n                {archiveCards.map(({ key, label, helper, Icon, count }) => {\n                  const active = archiveFilter === key;\n                  return (\n                    <button\n                      key={key}\n                      type="button"\n                      onClick={() => setArchiveFilter(key)}\n                      className={\`min-h-[112px] rounded-2xl border p-4 text-left transition \${active ? 'border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.18)]' : 'border-slate-700 bg-slate-950/35 hover:border-slate-500'}\`}\n                    >\n                      <div className="flex items-start justify-between gap-2">\n                        <div className={\`flex h-10 w-10 items-center justify-center rounded-xl \${active ? 'bg-cyan-300 text-slate-950' : 'bg-slate-800 text-cyan-300'}\`}>\n                          <Icon className="h-5 w-5" />\n                        </div>\n                        <span className={\`rounded-full border px-2 py-0.5 text-xs font-bold \${active ? 'border-cyan-300/50 text-cyan-100' : 'border-slate-600 text-slate-300'}\`}>{count}</span>\n                      </div>\n                      <p className="mt-3 text-sm font-bold text-slate-100">{label}</p>\n                      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{helper}</p>\n                    </button>\n                  );\n                })}\n              </div>`;
  source = replaceOrFail(source, oldButtons, newCards, 'cards arquivo pessoal');

  source = source.replace(
    'Seus documentos assinados, recibos de benefícios e recibos de garagem ficam guardados aqui para consulta futura.',
    'Seus documentos ficam organizados por categoria. Toque em um card para abrir o histórico.',
  );
  source = source.replace(
    'Holerites assinados, recibos de benefícios e recibos de garagem ficam guardados aqui para consulta futura.',
    'Seus documentos ficam organizados por categoria. Toque em um card para abrir o histórico.',
  );

  fs.writeFileSync(path, source, 'utf8');
}

console.log('[employee-archive-cards] arquivo pessoal em cards dinâmicos: Holerites, VR, VT, Garagem e Outros');
await import('./fix-public-portal-ux-polish-build.mjs');
