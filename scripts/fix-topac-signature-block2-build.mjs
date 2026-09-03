import fs from 'node:fs';

const patchFile = (path, transform) => {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next, 'utf8');
};
const replaceOnce = (source, oldText, newText, label) => {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) { console.warn(`[assinatura2] trecho não encontrado: ${label}`); return source; }
  return source.replace(oldText, newText);
};

patchFile('src/pages/FolhaPagamentoPage.tsx', input => {
  let source = input;
  source = replaceOnce(source,
    "import BenefitSignatureGenerator from '@/components/payroll/BenefitSignatureGenerator';",
    "import BenefitSignatureGenerator from '@/components/payroll/BenefitSignatureGenerator';\nimport GarageReceiptAdminModule from '@/components/payroll/GarageReceiptAdminModule';",
    'import garagem');
  source = source.replace('Holerites, comprovantes, VR e VT para conferência e assinatura.', 'Holerites, recibos de garagem, comprovantes opcionais, VR e VT para conferência e assinatura.');
  source = replaceOnce(source,
    '          <PayrollSignatureModule companyId={selectedCompany} competencia={competencia} />\n          <BenefitSignatureGenerator companyId={selectedCompany} competencia={competencia} />',
    '          <PayrollSignatureModule companyId={selectedCompany} competencia={competencia} />\n          <GarageReceiptAdminModule companyId={selectedCompany} competencia={competencia} />\n          <BenefitSignatureGenerator companyId={selectedCompany} competencia={competencia} />',
    'render garagem');
  return source;
});

patchFile('api/payroll-public.ts', input => {
  let source = input;
  source = replaceOnce(source,
    "const ADIANTAMENTO = 'ADIANTAMENTO';",
    "const ADIANTAMENTO = 'ADIANTAMENTO';\nconst RECIBO_GARAGEM = 'RECIBO_GARAGEM';",
    'const garagem');
  source = replaceOnce(source,
    "  if (type === ADIANTAMENTO) return 'Recibo de Adiantamento';\n  return 'Holerite';",
    "  if (type === ADIANTAMENTO) return 'Recibo de Adiantamento';\n  if (type === RECIBO_GARAGEM) return 'Recibo de Garagem';\n  return 'Holerite';",
    'label garagem');
  source = replaceOnce(source,
    "  return docs\n    .filter((doc: any) => doc.document_type !== HOLERITE || receiptByDoc.has(doc.id))\n    .map((doc: any) => {",
    "  return docs\n    .map((doc: any) => {",
    'comprovante nao bloqueia lista');
  source = replaceOnce(source,
    "    if (result.error || !result.data) throw Object.assign(new Error('payment_not_confirmed'), { status: 409 });\n    receipt = result.data;\n  } else if (!BENEFIT_TYPES.has(doc.document_type) && doc.document_type !== ADIANTAMENTO) {",
    "    if (result.error) throw result.error;\n    receipt = result.data || null;\n  } else if (!BENEFIT_TYPES.has(doc.document_type) && doc.document_type !== ADIANTAMENTO && doc.document_type !== RECIBO_GARAGEM) {",
    'comprovante opcional + garagem permitida');
  return source;
});

patchFile('api/payroll-archive.ts', input => {
  let source = input;
  source = replaceOnce(source,
    "  const signedPayroll = (payrollDocs || []).filter((doc: any) => {\n    if (!signatureByDocument.has(doc.id)) return false;\n    if (doc.document_type === 'HOLERITE' && !paidDocuments.has(doc.id)) return false;\n    return true;\n  });",
    "  const signedPayroll = (payrollDocs || []).filter((doc: any) => {\n    if (!signatureByDocument.has(doc.id)) return false;\n    return true;\n  });",
    'arquivo sem bloqueio comprovante');
  source = replaceOnce(source,
    "    const baseLabel = doc.document_type === 'BENEFICIO_VR' ? 'Recibo VR' : doc.document_type === 'BENEFICIO_VT' ? 'Recibo VT' : doc.document_type === 'BENEFICIO_VR_VT' ? 'Recibo VR / VT' : doc.document_type === 'ADIANTAMENTO' ? 'Recibo de Adiantamento' : 'Holerite';",
    "    const baseLabel = doc.document_type === 'BENEFICIO_VR' ? 'Recibo VR' : doc.document_type === 'BENEFICIO_VT' ? 'Recibo VT' : doc.document_type === 'BENEFICIO_VR_VT' ? 'Recibo VR / VT' : doc.document_type === 'ADIANTAMENTO' ? 'Recibo de Adiantamento' : doc.document_type === 'RECIBO_GARAGEM' ? 'Recibo de Garagem' : 'Holerite';",
    'archive label garagem');
  source = replaceOnce(source,
    "      category: benefitTypes.length ? 'beneficio' : 'pagamento',",
    "      category: doc.document_type === 'RECIBO_GARAGEM' ? 'garagem' : benefitTypes.length ? 'beneficio' : 'pagamento',",
    'archive categoria garagem');
  return source;
});

patchFile('src/pages/PayrollSignaturePublicPage.tsx', input => {
  let source = input;
  source = replaceOnce(source, '  Bus,\n  CheckCircle2,', '  Bus,\n  CarFront,\n  CheckCircle2,', 'icone garagem');
  source = source.replace("useState<'todos' | 'pagamento' | 'vr' | 'vt'>('todos')", "useState<'todos' | 'pagamento' | 'vr' | 'vt' | 'garagem'>('todos')");
  source = replaceOnce(source,
    "    if (archiveFilter === 'vt') return Array.isArray(item.benefit_types) && item.benefit_types.includes('VT');\n    return true;",
    "    if (archiveFilter === 'vt') return Array.isArray(item.benefit_types) && item.benefit_types.includes('VT');\n    if (archiveFilter === 'garagem') return item.category === 'garagem';\n    return true;",
    'filtro garagem');
  source = replaceOnce(source,
    "                  ['vt', 'VT', Bus],",
    "                  ['vt', 'VT', Bus],\n                  ['garagem', 'Garagem', CarFront],",
    'botao garagem');
  source = source.replace('Holerites assinados e recibos ficam guardados aqui para consulta futura.', 'Holerites assinados, recibos de benefícios e recibos de garagem ficam guardados aqui para consulta futura.');
  return source;
});

patchFile('src/components/payroll/PayrollPortalAdminModule.tsx', input => {
  let source = input;
  source = replaceOnce(source,
    "const humanStatus = (value: unknown) => String(value || '').replace(/_/g, ' ');",
    "const humanStatus = (value: unknown) => String(value || '').replace(/_/g, ' ');\nconst looksLikeBankProof = (page: any) => {\n  const text = normalizeSignatureText(page?.text);\n  if (!text) return false;\n  const payroll = text.includes('recibo de pagamento') || text.includes('demonstrativo de pagamento') || text.includes('total liquido') || text.includes('proventos') || text.includes('salario base');\n  const proof = text.includes('comprovante') || text.includes('pix') || text.includes('transferencia') || text.includes('pagamento realizado') || text.includes('pagamento efetuado') || text.includes('autenticacao bancaria');\n  return proof && !payroll;\n};",
    'detector comprovante');
  source = source.replace("if (status === 'ASSINADO' || status === 'LIBERADO NO PORTAL' || status === 'PAGAMENTO CONFIRMADO' || status === 'IDENTIFICADO')", "if (status === 'ASSINADO' || status.includes('LIBERADO') || status === 'PAGAMENTO CONFIRMADO' || status === 'IDENTIFICADO')");
  source = replaceOnce(source,
    "  if (row.holerite_confirmed && row.payment_confirmed) return 'LIBERADO NO PORTAL';\n  if (row.holerite_confirmed) return 'DOCUMENTO PRONTO';",
    "  if (row.holerite_confirmed) return row.receipt_id ? 'LIBERADO • COMPROVANTE ANEXADO' : 'LIBERADO • COMPROVANTE OPCIONAL';",
    'status nao bloqueante');
  source = replaceOnce(source,
    "  const unifiedInput = useRef<HTMLInputElement>(null);\n  const autoRefreshRunning = useRef(false);",
    "  const unifiedInput = useRef<HTMLInputElement>(null);\n  const lateProofInput = useRef<HTMLInputElement>(null);\n  const [lateProofTarget, setLateProofTarget] = useState<any>(null);\n  const autoRefreshRunning = useRef(false);",
    'estado comprovante tardio');

  source = replaceOnce(source,
    "    // REGRA FIXA DO FECHAMENTO:\n    // página 1 = recibo, 2 = comprovante; 3 = recibo, 4 = comprovante; e assim por diante.\n    // A segunda página NUNCA é tratada como um novo funcionário/documento.\n    for (let index = 0; index < ordered.length; index += 2) {\n      const receiptPage = ordered[index];\n      const bankPage = ordered[index + 1] || null;",
    "    // REGRA NÃO BLOQUEANTE:\n    // cada RECIBO gera um documento. Se a página seguinte for claramente um comprovante bancário, ela entra no par.\n    // Se o comprovante não veio, o recibo segue sozinho para assinatura e o comprovante pode ser anexado depois.\n    for (let index = 0; index < ordered.length;) {\n      const receiptPage = ordered[index];\n      const candidateProof = ordered[index + 1] || null;\n      const bankPage = looksLikeBankProof(candidateProof) ? candidateProof : null;\n      index += bankPage ? 2 : 1;",
    'loop comprovante opcional');
  source = source.replace("const filename = `${safeFile(employeeName)}_${competencia}_RECIBO_COMPROVANTE.pdf`;", "const filename = `${safeFile(employeeName)}_${competencia}_${bankPage ? 'RECIBO_COMPROVANTE' : 'RECIBO'}.pdf`;");
  source = source.replace("regra_importacao: 'PARES_FIXOS_RECIBO_COMPROVANTE_SEM_VALIDACAO',", "regra_importacao: bankPage ? 'RECIBO_COMPROVANTE_QUANDO_PRESENTE' : 'RECIBO_SEM_COMPROVANTE_NAO_BLOQUEANTE',");
  source = source.replace("toast.success(`${created} documento(s) RECIBO + COMPROVANTE processados e enviados ao fluxo de assinatura.${pending ?", "toast.success(`${created} documento(s) processado(s) e liberado(s) para assinatura. Comprovante é opcional e pode ser anexado depois.${pending ?");

  const insertionMarker = "  const openAdminFile = async (row: any, kind: 'holerite'|'receipt'|'certificate') => {";
  const lateProofFn = `  const uploadLateProof = async (row: any, file?: File) => {\n    if (!row?.document_id || !file) return;\n    setUploading(true);\n    try {\n      const bytes = new Uint8Array(await file.arrayBuffer());\n      const hash = await sha256Browser(bytes);\n      const filename = safeFile(file.name || \`COMPROVANTE_\${row.employee_name || 'FUNCIONARIO'}_\${competencia}.pdf\`);\n      const path = \`\${companyId}/\${competencia}/comprovantes-posteriores/\${safeUuid()}-\${filename}\`;\n      const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, new Blob([bytes as any], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false });\n      if (storageError) throw storageError;\n      const { error: insertError } = await (supabase as any).from('payroll_payment_receipts').insert({\n        company_id: companyId, employee_id: row.employee_id, document_id: row.document_id, competencia,\n        storage_bucket: BUCKET, storage_path: path, original_filename: filename, mime_type: 'application/pdf', file_size: bytes.byteLength,\n        receipt_sha256: hash, source_sha256: hash, extracted_data: { upload_posterior: true, opcional: true, nao_bloqueante: true },\n        match_confidence: 100, status: 'PAGAMENTO_IDENTIFICADO', confirmed: false,\n        idempotency_key: \`late-proof:\${row.document_id}:\${hash}\`,\n      });\n      if (insertError) { await supabase.storage.from(BUCKET).remove([path]); throw insertError; }\n      toast.success('Comprovante anexado. O documento já podia ser finalizado antes deste anexo.');\n      await load();\n    } catch (error: any) {\n      console.error('[late-proof-upload]', error);\n      toast.error(error?.message || 'Não foi possível anexar o comprovante.');\n    } finally {\n      setUploading(false); setLateProofTarget(null); if (lateProofInput.current) lateProofInput.current.value = '';\n    }\n  };\n\n`;
  if (!source.includes('const uploadLateProof = async')) source = source.replace(insertionMarker, lateProofFn + insertionMarker);

  source = source.replace("const releasedCount = rows.filter(r => r.holerite_confirmed && r.payment_confirmed && r.signature_status !== 'ASSINADO').length;", "const releasedCount = rows.filter(r => r.holerite_confirmed && r.signature_status !== 'ASSINADO').length;");
  source = replaceOnce(source,
    "    <input ref={unifiedInput} type=\"file\" accept=\"application/pdf,.pdf,.zip,application/zip\" multiple className=\"hidden\" onChange={e=>void uploadUnified(Array.from(e.target.files || []))}/>",
    "    <input ref={unifiedInput} type=\"file\" accept=\"application/pdf,.pdf,.zip,application/zip\" multiple className=\"hidden\" onChange={e=>void uploadUnified(Array.from(e.target.files || []))}/>\n    <input ref={lateProofInput} type=\"file\" accept=\"application/pdf,.pdf\" className=\"hidden\" onChange={e=>void uploadLateProof(lateProofTarget, e.target.files?.[0])}/>",
    'input comprovante posterior');
  source = source.replace('Recibos, comprovantes e assinatura eletrônica', 'Recibos e assinatura eletrônica · comprovante opcional');
  source = source.replace('Envie o PDF já montado em sequência: RECIBO + COMPROVANTE de cada funcionário. O par segue direto para assinatura, sem etapa de validação do comprovante. VR e VT permanecem separados deste lote.', 'Envie os RECIBOS. Se o comprovante vier logo depois do recibo, ele entra no mesmo par. Se não vier, o recibo é liberado normalmente: o comprovante é OPCIONAL, não bloqueia a finalização e pode ser anexado posteriormente. VR e VT permanecem separados deste lote.');
  source = source.replace('<Kpi label="Pagamentos vinculados" value={rows.filter(r=>r.payment_confirmed).length}/>', '<Kpi label="Comprovantes anexados" value={rows.filter(r=>r.receipt_id).length}/>');
  source = source.replace("{row.payment_confirmed?<span className=\"text-emerald-400\">INCLUÍDO NO PAR</span>:<span className=\"text-muted-foreground\">SEM COMPROVANTE NO PAR</span>}", "{row.receipt_id?<span className=\"text-emerald-400\">ANEXADO</span>:<span className=\"text-amber-300\">OPCIONAL · PODE ANEXAR DEPOIS</span>}");
  source = source.replace("{row.holerite_confirmed&&row.payment_confirmed?(row.opened_at?<span className=\"text-cyan-300\">Acessado<br/>{brDateTime(row.opened_at)}</span>:<span className=\"text-emerald-400\">LIBERADO</span>):<span className=\"text-muted-foreground\">Aguardando par completo</span>}", "{row.holerite_confirmed?(row.opened_at?<span className=\"text-cyan-300\">Acessado<br/>{brDateTime(row.opened_at)}</span>:<span className=\"text-emerald-400\">LIBERADO</span>):<span className=\"text-muted-foreground\">Aguardando documento</span>}");
  const actionNeedle = "{row.receipt_id&&<Button size=\"sm\" variant=\"ghost\" onClick={()=>void openAdminFile(row,'receipt')}>Comprovante</Button>}";
  const actionReplacement = actionNeedle + "{!row.receipt_id&&<Button size=\"sm\" variant=\"outline\" onClick={()=>{setLateProofTarget(row);lateProofInput.current?.click();}}><FileUp className=\"mr-1 h-3 w-3\"/>Anexar comprovante</Button>}";
  source = source.replace(actionNeedle, actionReplacement);
  source = source.replace('Registrando cada par RECIBO + COMPROVANTE', 'Registrando recibos; comprovantes presentes entram no par, os ausentes ficam opcionais');
  return source;
});

console.log('[assinatura2] garagem habilitada; comprovante opcional; holerite libera sem comprovante; anexo posterior ativado');
