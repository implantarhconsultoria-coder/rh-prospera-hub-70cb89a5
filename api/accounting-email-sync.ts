import { getServiceClient, requireAdmin, sendJson, sha256 } from '../src/server/payrollServer.js';
import { accountingEmailProviderStatus, readAccountingMailbox } from '../src/server/accountingEmailProviders.js';
import {
  extractCnpj,
  extractCompetence,
  extractCpf,
  matchCompanySafely,
  matchPersonSafely,
  normalizeAccountingText,
} from '../src/server/accountingCentralRules.js';

const INBOX_BUCKET = 'contabilidade-inbox';

const authorize = async (req: any) => {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authorization = String(req?.headers?.authorization || '');
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return { service: getServiceClient(), user: null as any, mode: 'CRON' };
  const admin = await requireAdmin(req);
  return { ...admin, mode: 'ADMIN' };
};

const safeFile = (value: string) => String(value || 'anexo.pdf')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 140);

const isPdf = (name: string, contentType: string) => /\.pdf$/i.test(name) || /application\/pdf/i.test(contentType);

const logEvent = async (service: any, mensagemId: string, documentoId: string | null, evento: string, payload: Record<string, unknown> = {}) => {
  const { error } = await service.from('contabilidade_email_eventos').insert({
    mensagem_id: mensagemId, documento_id: documentoId, evento, ator_tipo: 'SISTEMA', payload,
  });
  if (error) console.warn('[accounting-email-sync][event]', error.message);
};

type EmailCategory = 'FOLHA' | 'RESCISAO' | 'ADMISSAO' | 'FERIAS' | 'PONTO_HE' | 'ATESTADO' | 'BENEFICIOS' | 'CONTABILIDADE' | 'GUIAS_ENCARGOS' | 'OUTRO';

const classifyEmail = (value: string): { category: EmailCategory; relevant: boolean; confidence: number } => {
  const text = normalizeAccountingText(value);
  const has = (...terms: string[]) => terms.some((term) => text.includes(normalizeAccountingText(term)));

  if (has('GUIA FGTS','GUIA DO FGTS','DARF','DCTFWEB','GRRF','GPS PREVIDENCIA','ENCARGOS SOCIAIS','GUIA DE RECOLHIMENTO')) {
    return { category:'GUIAS_ENCARGOS', relevant:false, confidence:0.99 };
  }
  if (has('RESCISAO','DESLIGAMENTO','DEMISSAO','AVISO PREVIO','TRCT')) return { category:'RESCISAO', relevant:true, confidence:0.97 };
  if (has('ADMISSAO','CONTRATACAO','CONTRATO DE TRABALHO','FICHA DE REGISTRO','REGISTRO DE EMPREGADO')) return { category:'ADMISSAO', relevant:true, confidence:0.96 };
  if (has('FERIAS','AVISO DE FERIAS','RECIBO DE FERIAS')) return { category:'FERIAS', relevant:true, confidence:0.96 };
  if (has('ATESTADO','AFASTAMENTO','ATESTADO MEDICO','INSS','CID')) return { category:'ATESTADO', relevant:true, confidence:0.94 };
  if (has('HORAS EXTRAS','HORA EXTRA','BANCO DE HORAS','REGISTRO DE PONTO','ESPELHO DE PONTO','JORNADA')) return { category:'PONTO_HE', relevant:true, confidence:0.93 };
  if (has('VALE TRANSPORTE','VALE REFEICAO','VALE ALIMENTACAO','VR','VT','BENEFICIO')) return { category:'BENEFICIOS', relevant:true, confidence:0.90 };
  if (has('FOLHA DE PAGAMENTO','FECHAMENTO DA FOLHA','FOLHA PROCESSADA','HOLERITE','CONTRACHEQUE','RECIBO DE PAGAMENTO','DEMONSTRATIVO DE PAGAMENTO')) {
    return { category:'FOLHA', relevant:true, confidence:0.98 };
  }
  if (has('CONTABILIDADE','ESOCIAL','DEPARTAMENTO PESSOAL','DP ')) return { category:'CONTABILIDADE', relevant:true, confidence:0.76 };
  return { category:'OUTRO', relevant:false, confidence:0.25 };
};

export default async function handler(req: any, res?: any) {
  if (!['GET', 'POST'].includes(String(req?.method || 'GET').toUpperCase())) return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  try {
    const { service, mode } = await authorize(req);
    const providerStatus = accountingEmailProviderStatus();
    if (!providerStatus.configured) {
      return sendJson(res, { ok: false, error: 'accounting_email_not_configured', provider: providerStatus }, 409);
    }

    const [{ data: companies, error: companiesError }, { data: employees, error: employeesError }] = await Promise.all([
      service.from('empresas').select('id,nome,razao_social,cnpj'),
      service.from('funcionarios').select('id,nome,cpf,empresa_id,company_id,data_admissao,status,ativo'),
    ]);
    if (companiesError) throw companiesError;
    if (employeesError) throw employeesError;

    const messages = await readAccountingMailbox();
    const result = {
      scanned: messages.length,
      created_messages: 0,
      relevant_messages: 0,
      created_pdfs: 0,
      duplicate_pdfs: 0,
      ignored_attachments: 0,
      errors: [] as string[],
    };

    for (const email of messages) {
      try {
        const { data: existingMessage, error: existingError } = await service.from('contabilidade_email_mensagens')
          .select('id,status').eq('provider', email.provider).eq('provider_message_id', email.providerMessageId).maybeSingle();
        if (existingError) throw existingError;
        if (existingMessage) continue;

        const attachmentNames = email.attachments.map((attachment) => attachment.name).join(' ');
        const intelligenceText = [email.subject, email.bodyPreview, attachmentNames].filter(Boolean).join('\n');
        const classification = classifyEmail(intelligenceText);
        const companyMatch = matchCompanySafely(intelligenceText, email.subject, (companies || []) as any[]);
        const companyId = companyMatch.row && companyMatch.confidence >= 0.90 ? companyMatch.row.id : null;
        const employeeMatch = matchPersonSafely(intelligenceText, companyId, (employees || []) as any[]);
        const employeeAccepted = !!employeeMatch.row && (
          employeeMatch.method === 'CPF'
          || (companyId && employeeMatch.confidence >= 0.93)
        );
        const employee = employeeAccepted ? employeeMatch.row : null;
        const competence = extractCompetence(intelligenceText);
        const cpf = extractCpf(intelligenceText);
        const cnpj = extractCnpj(intelligenceText);
        const pdfParts = email.attachments.filter((attachment) => isPdf(attachment.name, attachment.contentType));

        const metadata = {
          ...(email.metadata || {}),
          integration_mode: mode,
          central_mode: 'INTELLIGENT_EMAIL_CENTER_V1',
          read_only: true,
          body_preview: String(email.bodyPreview || '').slice(0, 1500),
          categoria: classification.category,
          categoria_confianca: classification.confidence,
          relevante: classification.relevant,
          attention_status: classification.relevant ? 'PENDENTE' : 'IGNORADO',
          competencia: competence,
          empresa_id: companyId,
          empresa_nome: companyId ? (companyMatch.row as any)?.nome || (companyMatch.row as any)?.razao_social || null : null,
          empresa_match: { method: companyMatch.method, confidence: companyMatch.confidence, reason: companyMatch.reason },
          funcionario_id: employee?.id || null,
          funcionario_nome: employee?.nome || null,
          funcionario_match: { method: employeeMatch.method, confidence: employeeMatch.confidence, reason: employeeMatch.reason },
          cpf_detectado: cpf,
          cnpj_detectado: cnpj,
          automatic_context_linking: !!companyId || !!employee,
          automatic_downstream_import: false,
          attachments: email.attachments.map((attachment) => ({
            name: attachment.name,
            content_type: attachment.contentType,
            size: attachment.size,
            pdf: isPdf(attachment.name, attachment.contentType),
          })),
        };

        const { data: messageRow, error: messageError } = await service.from('contabilidade_email_mensagens').insert({
          provider: email.provider,
          provider_message_id: email.providerMessageId,
          mailbox: email.mailbox,
          remetente: email.sender,
          assunto: email.subject,
          recebido_em: email.receivedAt,
          status: 'RECEBIDO',
          total_anexos: email.attachments.length,
          total_pdfs: pdfParts.length,
          metadata,
          processado_em: null,
        }).select('*').single();
        if (messageError) throw messageError;

        result.created_messages += 1;
        if (classification.relevant) result.relevant_messages += 1;
        result.ignored_attachments += email.attachments.length - pdfParts.length;

        await logEvent(service, messageRow.id, null, 'EMAIL_RECEBIDO', {
          remetente: email.sender,
          assunto: email.subject,
          categoria: classification.category,
          relevante: classification.relevant,
          empresa_id: companyId,
          funcionario_id: employee?.id || null,
          competencia: competence,
          anexos: email.attachments.length,
          pdfs: pdfParts.length,
          mode: 'INTELLIGENT_EMAIL_CENTER_V1',
        });

        let emailHadError = false;

        for (const attachment of pdfParts) {
          if (!attachment.bytes?.byteLength) {
            emailHadError = true;
            result.errors.push(`${email.subject || email.providerMessageId} / ${attachment.name}: anexo PDF sem conteúdo.`);
            await logEvent(service, messageRow.id, null, 'ANEXO_PDF_ERRO', { arquivo: attachment.name, reason: 'pdf_without_bytes' });
            continue;
          }

          const sourceHash = sha256(attachment.bytes);
          const { data: prior, error: priorError } = await service.from('contabilidade_email_documentos')
            .select('id,storage_bucket,storage_path')
            .is('parent_documento_id', null)
            .eq('source_sha256', sourceHash)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (priorError) throw priorError;

          let storageBucket = INBOX_BUCKET;
          let storagePath = '';
          let duplicateOf: string | null = null;
          let status = 'PROCESSADO';
          let reason = 'PDF coletado do e-mail e armazenado na Central. Nenhum lançamento em módulos de RH foi realizado.';

          if (prior) {
            storageBucket = prior.storage_bucket;
            storagePath = prior.storage_path;
            duplicateOf = prior.id;
            status = 'DUPLICADO';
            reason = 'Anexo idêntico já recebido anteriormente (hash SHA-256).';
            result.duplicate_pdfs += 1;
          } else {
            const date = email.receivedAt.slice(0, 10);
            storagePath = `${email.provider.toLowerCase()}/${date}/${email.providerMessageId.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 90)}/${crypto.randomUUID()}-${safeFile(attachment.name)}`;
            const { error: uploadError } = await service.storage.from(INBOX_BUCKET).upload(storagePath, attachment.bytes, { contentType: 'application/pdf', upsert: false });
            if (uploadError) throw uploadError;
          }

          const { data: doc, error: docError } = await service.from('contabilidade_email_documentos').insert({
            mensagem_id: messageRow.id,
            arquivo_original: attachment.name,
            mime_type: 'application/pdf',
            storage_bucket: storageBucket,
            storage_path: storagePath,
            source_sha256: sourceHash,
            tamanho_bytes: attachment.bytes.byteLength,
            status,
            duplicado_de: duplicateOf,
            empresa_id: companyId,
            funcionario_id: employee?.id || null,
            cpf_detectado: cpf,
            nome_detectado: employee?.nome || null,
            cnpj_detectado: cnpj,
            competencia: competence,
            confianca: employee ? Math.max(companyMatch.confidence, employeeMatch.confidence) : companyMatch.confidence || classification.confidence,
            metodo_vinculo: employee ? employeeMatch.method : companyId ? companyMatch.method : 'NAO_IDENTIFICADO',
            motivo_decisao: reason,
            decisao: 'AUTOMATICA',
          }).select('*').single();
          if (docError) throw docError;
          result.created_pdfs += 1;
          await logEvent(service, messageRow.id, doc.id, status === 'DUPLICADO' ? 'ANEXO_DUPLICADO' : 'PDF_COLETADO', {
            arquivo: attachment.name,
            sha256: sourceHash,
            duplicate_of: duplicateOf,
            empresa_id: companyId,
            funcionario_id: employee?.id || null,
            mode: 'INTELLIGENT_EMAIL_CENTER_V1',
          });
        }

        await service.from('contabilidade_email_mensagens').update({
          status: emailHadError ? 'ERRO_PROCESSAMENTO' : 'PROCESSADO',
          processado_em: new Date().toISOString(),
          erro: emailHadError ? 'Um ou mais PDFs não puderam ser coletados.' : null,
        }).eq('id', messageRow.id);
      } catch (error: any) {
        result.errors.push(`${email.subject || email.providerMessageId}: ${String(error?.message || error)}`);
      }
    }

    return sendJson(res, { ok: true, provider: providerStatus, mode: 'INTELLIGENT_EMAIL_CENTER_V1', read_only: true, result });
  } catch (error: any) {
    console.error('[accounting-email-sync]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error), details: error?.details || null }, Number(error?.status || 500));
  }
}
