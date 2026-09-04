import fs from 'node:fs';

const file = 'src/pages/PreCadastroAdmissionalOcrPage.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
let changed = false;

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`[pre-cadastro-unified] trecho nao encontrado: ${label}`);
  source = source.replace(from, to);
  changed = true;
};

replaceOnce(
  "import { CC_OBRIGATORIO, sendEmailWithPdfAttachment } from '@/lib/emailUtils';",
  "import { CC_OBRIGATORIO } from '@/lib/emailUtils';",
  'import emailUtils',
);

replaceOnce(
  "  if (normalizado.includes('ASO') || normalizado.includes('EXAME')) return 'ASO';\n  if (normalizado.includes('FICHA') || normalizado.includes('DADOS CADASTRAIS') || normalizado.includes('DOCUMENTACAO ADMISSIONAL')) return 'FICHA/DOCUMENTACAO';",
  "  if (normalizado.includes('ASO') || normalizado.includes('EXAME')) return 'ASO';\n  if (/DOCUMENTACAO[_ ]UNIFICADA|DOCUMENTOS[_ ]UNIFICADOS|ARQUIVO[_ ]UNICO/.test(normalizado)) return 'DOCUMENTACAO UNIFICADA';\n  if (normalizado.includes('FICHA') || normalizado.includes('DADOS CADASTRAIS') || normalizado.includes('DOCUMENTACAO ADMISSIONAL')) return 'FICHA/DOCUMENTACAO';",
  'categoria unificada',
);

const oldMissing = `  const missingDocs = useMemo(() => {\n    const categorias = new Set(documentos.map(d => d.categoria));\n    const missing: string[] = [];\n    if (!categorias.has('FICHA/DOCUMENTACAO')) missing.push('Ficha/documentação admissional');\n    if (!categorias.has('ASO')) missing.push('ASO');\n    if ((form.exige_toxicologico || isGuincheiro(form.funcao)) && !categorias.has('TOXICOLOGICO')) missing.push('Toxicológico');\n    return missing;\n  }, [documentos, form.exige_toxicologico, form.funcao]);`;
const newMissing = `  const missingDocs = useMemo(() => {\n    const categorias = new Set(documentos.map(d => d.categoria));\n    const unificado = categorias.has('DOCUMENTACAO UNIFICADA');\n    const missing: string[] = [];\n    if (!unificado && !categorias.has('FICHA/DOCUMENTACAO')) missing.push('Ficha/documentação admissional');\n    if (!unificado && !categorias.has('ASO')) missing.push('ASO');\n    if (!unificado && (form.exige_toxicologico || isGuincheiro(form.funcao)) && !categorias.has('TOXICOLOGICO')) missing.push('Toxicológico');\n    return missing;\n  }, [documentos, form.exige_toxicologico, form.funcao]);`;
replaceOnce(oldMissing, newMissing, 'pendencias com PDF unificado');

const uploadMarker = `  const uploadASO = async (file?: File | null) => {`;
const uploadUnified = `  const uploadUnificado = async (file?: File | null) => {\n    if (!file || !form.id) return toast.error('Salve o pré-cadastro antes de anexar documentos.');\n    if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) return toast.error('Para documentação unificada, envie um arquivo PDF.');\n    try {\n      setUploadProgress('Enviando PDF único com a documentação...');\n      await uploadDocumento('documentacao_unificada', file);\n      setUploadProgress('');\n      toast.success('PDF único anexado. Ele pode conter documentos admissionais e ASO e não bloqueia a finalização.');\n      await carregarDocumentos();\n    } catch (error: any) {\n      setUploadProgress('');\n      toast.error(error?.message || 'Não foi possível anexar o PDF único.');\n    }\n  };\n\n`;
if (!source.includes('const uploadUnificado = async')) {
  if (!source.includes(uploadMarker)) throw new Error('[pre-cadastro-unified] marcador uploadASO nao encontrado');
  source = source.replace(uploadMarker, uploadUnified + uploadMarker);
  changed = true;
}

const emailRegex = /  const enviarContabilidade = async \(\) => \{[\s\S]*?\n\n  const migrarDocumentosPreCadastro/;
if (!source.includes("missingWarnings: missingDocs.length")) {
  if (!emailRegex.test(source)) throw new Error('[pre-cadastro-unified] enviarContabilidade nao encontrado');
  source = source.replace(emailRegex, `  const enviarContabilidade = async () => {\n    if (!selectedDocs.length) return toast.error('Selecione pelo menos um documento.');\n    try {\n      const attachments = await carregarAnexosSelecionados();\n      const { data: sessionData } = await supabase.auth.getSession();\n      const authUser = sessionData.session?.user;\n      setEmailPdfDraft({\n        to: CONTABILIDADE_DESTINATARIOS,\n        cc: Array.from(CC_OBRIGATORIO),\n        subject: \`Documentação admissional - \${form.nome || ''} - \${form.empresa_nome || ''}\`,\n        body: buildContabilidadeEmailBody(form),\n        attachments,\n        checklistItems: selectedDocs.map(doc => ({ label: doc.nome, found: true, detail: doc.categoria })),\n        missingWarnings: missingDocs.length ? [\`Pendências informativas: \${missingDocs.join(', ')}. Elas não bloqueiam este envio nem a finalização do pré-cadastro.\`] : [],\n        senderUserId: authUser?.id,\n        senderName: String(authUser?.user_metadata?.nome_completo || authUser?.email || ''),\n        senderEmail: authUser?.email,\n        moduleOrigin: 'pre-cadastro admissional',\n        documentName: \`Documentação admissional - \${form.nome || ''}\`,\n      });\n    } catch (error: any) {\n      console.error('Falha ao preparar e-mail para contabilidade:', error);\n      toast.error(error?.message || 'Não foi possível preparar o e-mail para a contabilidade.');\n    }\n  };\n\n  const migrarDocumentosPreCadastro`);
  changed = true;
}

replaceOnce(
  '<p className="text-xs text-muted-foreground">Confira faltantes, duplicados e escolha o que será enviado.</p>',
  '<p className="text-xs text-muted-foreground">Você pode anexar documentos separados ou um PDF único com tudo, inclusive ASO. Pendências são informativas e nunca bloqueiam Salvar, Aprovar ou enviar para a contabilidade.</p>',
  'texto conferencia',
);

replaceOnce(
  '<Summary label="Faltantes" value={missingDocs.length} danger={missingDocs.length > 0} />',
  '<Summary label="Pendências" value={missingDocs.length} attention={missingDocs.length > 0} />',
  'summary pendencias',
);

replaceOnce(
  '<div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><strong>Faltando:</strong> {missingDocs.join(\', \')}</div>',
  '<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300"><strong>Pendência informativa:</strong> {missingDocs.join(\', \')} <span className="font-normal">— isso não bloqueia a continuidade.</span></div>',
  'aviso pendencias',
);

const oldUploadUi = `<div className="flex flex-wrap gap-2 items-center"><label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer"><Upload className="w-4 h-4" />Selecionar vários documentos<input multiple type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadEmLote(e.target.files)} /></label>{uploadProgress && <span className="text-sm text-primary">{uploadProgress}</span>}<label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer">Subir ASO<input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadASO(e.target.files?.[0])} /></label>`;
const newUploadUi = `<div className="flex flex-wrap gap-2 items-center"><label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer"><Upload className="w-4 h-4" />Documentos separados<input multiple type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadEmLote(e.target.files)} /></label><label className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-4 py-2 text-sm cursor-pointer"><FileSearch className="w-4 h-4" />PDF único (documentos + ASO)<input type="file" accept=".pdf" className="hidden" onChange={e => uploadUnificado(e.target.files?.[0])} /></label>{uploadProgress && <span className="text-sm text-primary">{uploadProgress}</span>}<label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer">Subir ASO<input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadASO(e.target.files?.[0])} /></label>`;
replaceOnce(oldUploadUi, newUploadUi, 'botoes upload');

if (changed) fs.writeFileSync(file, source, 'utf8');
console.log('[pre-cadastro-unified] PDF unico + documentos separados liberados; pendencias informativas; email contabilidade abre modal com anexos');
