import fs from 'node:fs';

const file = 'src/server/accountingCentralProcessor.ts';
let src = fs.readFileSync(file, 'utf8');

const marker = `export const processAccountingQueue = async (service: SupabaseClient, limit = 4, actorUserId?: string | null) => {`;

if (!src.includes('const processAdmissionPackageForMessage = async')) {
  const helper = `
const admissionDocumentType = (filename: string) => {
  const name = normalizeAccountingText(filename);
  if (name.includes('LGPD')) return 'TERMO LGPD';
  if (name.includes('RESPONSABILIDADE')) return 'TERMO DE RESPONSABILIDADE';
  if (name.includes('VALE TRANSPORTE')) return 'SOLICITACAO DE VALE TRANSPORTE';
  if (name.includes('FICHA') && name.includes('REGISTRO')) return 'FICHA DE REGISTRO DE EMPREGADO';
  if (name.includes('ENCARGOS') || name.includes('IMPOSTO DE RENDA')) return 'DECLARACAO DE ENCARGOS / IR';
  if (name.includes('COMPENSACAO') && name.includes('HORAS')) return 'ACORDO DE COMPENSACAO DE HORAS';
  if (name.includes('ASO')) return 'ASO';
  if (name.includes('CONTRATO')) return 'CONTRATO DE TRABALHO';
  return 'DOCUMENTACAO ADMISSIONAL';
};

const processAdmissionPackageForMessage = async (service: SupabaseClient, messageId: string, actorUserId?: string | null) => {
  // Regra operacional TOPAC: quando um contrato identifica com segurança o pré-cadastro,
  // TODOS os PDFs irmãos daquele mesmo e-mail passam a compor o pacote admissional.
  // Pagamento não usa esta regra: continua importando somente o recibo/holerite individual.
  const { data: contract, error: contractError } = await service.from('contabilidade_email_documentos')
    .select('id,parent_documento_id,pre_cadastro_id,empresa_id,destino_id,status')
    .eq('mensagem_id', messageId)
    .eq('tipo_identificado', 'CONTRATO_TRABALHO')
    .in('status', ['VINCULADO_AUTOMATICAMENTE', 'DUPLICADO'])
    .not('pre_cadastro_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (contractError) throw contractError;
  if (!contract?.pre_cadastro_id) return { attached: 0, skipped: 0, reason: 'no_confirmed_contract' };

  const preCadastroId = contract.pre_cadastro_id;
  const companyId = contract.empresa_id || null;

  const [{ data: originals, error: originalsError }, { data: linkedChildren, error: linkedError }, { data: existingDocs, error: existingError }] = await Promise.all([
    service.from('contabilidade_email_documentos')
      .select('*')
      .eq('mensagem_id', messageId)
      .is('parent_documento_id', null)
      .order('created_at', { ascending: true }),
    service.from('contabilidade_email_documentos')
      .select('parent_documento_id,destino_id')
      .eq('mensagem_id', messageId)
      .eq('pre_cadastro_id', preCadastroId)
      .eq('destino_tabela', 'pre_cadastro_documentos')
      .not('parent_documento_id', 'is', null),
    service.from('pre_cadastro_documentos')
      .select('id,nome_arquivo,dados_extraidos')
      .eq('pre_cadastro_id', preCadastroId),
  ]);
  if (originalsError) throw originalsError;
  if (linkedError) throw linkedError;
  if (existingError) throw existingError;

  const alreadyLinkedParents = new Set((linkedChildren || []).map((row: any) => row.parent_documento_id).filter(Boolean));
  const knownHashes = new Map<string, string>();
  for (const row of existingDocs || []) {
    const hash = String((row as any)?.dados_extraidos?.source_sha256 || (row as any)?.dados_extraidos?.document_sha256 || '');
    if (hash) knownHashes.set(hash, row.id);
  }

  let attached = 0;
  let skipped = 0;
  const attachedIds: string[] = [];

  for (const parent of originals || []) {
    if (!parent?.id || !parent?.storage_path) continue;

    // O contrato já foi salvo pelo fluxo específico e não deve ser duplicado.
    if (alreadyLinkedParents.has(parent.id)) {
      skipped += 1;
      continue;
    }

    const sourceHash = String(parent.source_sha256 || '');
    const existingId = sourceHash ? knownHashes.get(sourceHash) : '';
    if (existingId) {
      await service.from('contabilidade_email_documentos').update({
        status: 'DUPLICADO',
        empresa_id: companyId,
        pre_cadastro_id: preCadastroId,
        destino_tabela: 'pre_cadastro_documentos',
        destino_id: existingId,
        decisao: 'AUTOMATICA',
        motivo_decisao: 'Documento do pacote admissional já estava vinculado a este pré-cadastro.',
      }).eq('id', parent.id);
      skipped += 1;
      continue;
    }

    const { data: blob, error: downloadError } = await service.storage.from(parent.storage_bucket || INBOX_BUCKET).download(parent.storage_path);
    if (downloadError || !blob) throw downloadError || new Error('admission_package_pdf_not_found');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const actualHash = sha256(bytes);
    const fileName = safeFile(parent.arquivo_original || 'Documento_Admissional.pdf');
    const path = \`central-contabilidade/\${preCadastroId}/pacote-admissional/\${new Date().toISOString().slice(0, 10)}/\${randomUUID()}-\${fileName}\`;

    const { error: uploadError } = await service.storage.from(ADMISSION_BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw uploadError;
    const publicUrl = service.storage.from(ADMISSION_BUCKET).getPublicUrl(path).data.publicUrl;

    const { data: preDoc, error: insertError } = await service.from('pre_cadastro_documentos').insert({
      pre_cadastro_id: preCadastroId,
      tipo_documento: admissionDocumentType(parent.arquivo_original || ''),
      nome_arquivo: parent.arquivo_original || fileName,
      arquivo_url: publicUrl,
      status: 'recebido',
      dados_extraidos: {
        origem: 'CENTRAL_CONTABILIDADE_EMAIL',
        pacote_admissional: true,
        central_mensagem_id: messageId,
        central_documento_id: parent.id,
        source_sha256: sourceHash || actualHash,
        document_sha256: actualHash,
        empresa_id: companyId,
        recebido_em: new Date().toISOString(),
      },
    }).select('id').single();

    if (insertError) {
      await service.storage.from(ADMISSION_BUCKET).remove([path]);
      throw insertError;
    }

    knownHashes.set(sourceHash || actualHash, preDoc.id);
    attachedIds.push(preDoc.id);
    attached += 1;

    await service.from('contabilidade_email_documentos').update({
      status: 'VINCULADO_AUTOMATICAMENTE',
      tipo_identificado: parent.tipo_identificado || 'OUTRO',
      empresa_id: companyId,
      pre_cadastro_id: preCadastroId,
      confianca: 1,
      metodo_vinculo: 'PACOTE_ADMISSIONAL_POR_CONTRATO',
      decisao: 'AUTOMATICA',
      motivo_decisao: 'PDF pertencente ao mesmo e-mail do contrato confirmado; incluído integralmente no pacote admissional.',
      destino_tabela: 'pre_cadastro_documentos',
      destino_id: preDoc.id,
      document_sha256: actualHash,
    }).eq('id', parent.id);

    await event(service, {
      mensagemId: messageId,
      documentoId: parent.id,
      evento: 'DOCUMENTO_PACOTE_ADMISSIONAL_VINCULADO',
      actorUserId,
      payload: { pre_cadastro_id: preCadastroId, pre_cadastro_documento_id: preDoc.id, arquivo: parent.arquivo_original },
    });
  }

  if (attached > 0) {
    const { data: preRow } = await service.from('pre_cadastros_admissionais').select('dados_extraidos,historico').eq('id', preCadastroId).maybeSingle();
    const dados = mergeJsonObject((preRow as any)?.dados_extraidos);
    const historico = mergeJsonArray((preRow as any)?.historico);
    await service.from('pre_cadastros_admissionais').update({
      dados_extraidos: { ...dados, pacote_admissional_contabilidade: true, pacote_admissional_recebido_em: new Date().toISOString() },
      historico: [...historico, { tipo: 'PACOTE_ADMISSIONAL_CONTABILIDADE', em: new Date().toISOString(), documentos: attachedIds }],
    }).eq('id', preCadastroId);
  }

  const { data: messageDocs } = await service.from('contabilidade_email_documentos')
    .select('status')
    .eq('mensagem_id', messageId)
    .is('parent_documento_id', null);
  const statuses = (messageDocs || []).map((row: any) => row.status);
  if (statuses.length && !statuses.some((status: string) => ['RECEBIDO', 'ANALISANDO', 'ERRO_PROCESSAMENTO', 'AGUARDANDO_CONFERENCIA'].includes(status))) {
    await service.from('contabilidade_email_mensagens').update({ status: 'PROCESSADO', processado_em: new Date().toISOString(), erro: null }).eq('id', messageId);
  }

  return { attached, skipped, pre_cadastro_id: preCadastroId };
};

`;
  if (!src.includes(marker)) throw new Error('[accounting-admission-packet] marcador da fila não encontrado');
  src = src.replace(marker, helper + marker);
}

const oldLoop = `  const results: any[] = [];
  for (const row of data || []) {
    try { results.push(await processAccountingDocument(service, row.id, actorUserId)); }
    catch (error: any) { results.push({ ok: false, document_id: row.id, error: String(error?.message || error) }); }
  }
  return results;`;

const newLoop = `  const results: any[] = [];
  for (const row of data || []) {
    try {
      const processed = await processAccountingDocument(service, row.id, actorUserId);
      const { data: original } = await service.from('contabilidade_email_documentos').select('mensagem_id').eq('id', row.id).maybeSingle();
      const admissionPackage = original?.mensagem_id
        ? await processAdmissionPackageForMessage(service, original.mensagem_id, actorUserId)
        : { attached: 0, skipped: 0 };
      results.push({ ...processed, admission_package: admissionPackage });
    } catch (error: any) {
      results.push({ ok: false, document_id: row.id, error: String(error?.message || error) });
    }
  }
  return results;`;

if (src.includes(oldLoop)) src = src.replace(oldLoop, newLoop);
else if (!src.includes('admission_package: admissionPackage')) throw new Error('[accounting-admission-packet] loop da fila não encontrado');

fs.writeFileSync(file, src);
console.log('[accounting-admission-packet] admissão = todos os PDFs do e-mail; pagamento = somente recibo/holerite');
