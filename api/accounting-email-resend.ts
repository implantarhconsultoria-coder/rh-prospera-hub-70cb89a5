import { getServiceClient, sendJson, sha256 } from '../src/server/payrollServer.js';
import {
  extractCnpj,
  extractCompetence,
  extractCpf,
  matchCompanySafely,
  matchPersonSafely,
  normalizeAccountingText,
} from '../src/server/accountingCentralRules.js';

const TARGET_MAILBOX = String(process.env.ACCOUNTING_RESEND_MAILBOX || 'centralrh@topacrh.pro').trim().toLowerCase();
const INBOX_BUCKET = 'contabilidade-inbox';

const safeFile = (value: string) => String(value || 'anexo.pdf')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 140);

const isPdf = (name: string, contentType: string) => /\.pdf$/i.test(name) || /application\/pdf/i.test(contentType);

const parseBody = (req: any) => {
  if (!req?.body) return {} as any;
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
};

const resendGet = async (path: string) => {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) throw new Error('missing_resend_api_key');
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`resend_${response.status}:${text.slice(0,300)}`);
  try { return JSON.parse(text); } catch { throw new Error('invalid_resend_response'); }
};

const stripHtml = (value: string) => String(value || '')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ')
  .trim();

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
  if (has('VALE TRANSPORTE','VALE REFEICAO','VALE ALIMENTACAO',' VR ',' VT ','BENEFICIO')) return { category:'BENEFICIOS', relevant:true, confidence:0.90 };
  if (has('FOLHA DE PAGAMENTO','FECHAMENTO DA FOLHA','FOLHA PROCESSADA','HOLERITE','CONTRACHEQUE','RECIBO DE PAGAMENTO','DEMONSTRATIVO DE PAGAMENTO')) {
    return { category:'FOLHA', relevant:true, confidence:0.98 };
  }
  if (has('CONTABILIDADE','ESOCIAL','DEPARTAMENTO PESSOAL')) return { category:'CONTABILIDADE', relevant:true, confidence:0.76 };
  return { category:'OUTRO', relevant:false, confidence:0.25 };
};

const logEvent = async (service: any, mensagemId: string, documentoId: string | null, evento: string, payload: Record<string, unknown> = {}) => {
  const { error } = await service.from('contabilidade_email_eventos').insert({
    mensagem_id: mensagemId,
    documento_id: documentoId,
    evento,
    ator_tipo: 'SISTEMA',
    payload,
  });
  if (error) console.warn('[accounting-email-resend][event]', error.message);
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const event = parseBody(req);
    if (event?.type !== 'email.received') {
      return sendJson(res, { ok: true, ignored: true, reason: 'event_not_supported' });
    }

    const emailId = String(event?.data?.email_id || '').trim();
    if (!emailId) return sendJson(res, { ok: false, error: 'email_id_required' }, 400);

    const email = await resendGet(`/emails/receiving/${encodeURIComponent(emailId)}`);
    const recipients = Array.isArray(email?.to)
      ? email.to.map((item: any) => String(item).trim().toLowerCase())
      : [];
    if (!recipients.includes(TARGET_MAILBOX)) {
      return sendJson(res, { ok: true, ignored: true, reason: 'different_mailbox' });
    }

    const service = getServiceClient();
    const { data: existing, error: existingError } = await service
      .from('contabilidade_email_mensagens')
      .select('id,status')
      .eq('provider', 'RESEND')
      .eq('provider_message_id', emailId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return sendJson(res, { ok: true, duplicate_event: true, message_id: existing.id });

    const [{ data: companies, error: companiesError }, { data: employees, error: employeesError }, attachmentList] = await Promise.all([
      service.from('empresas').select('id,nome,razao_social,cnpj'),
      service.from('funcionarios').select('id,nome,cpf,empresa_id,company_id,data_admissao,status,ativo'),
      resendGet(`/emails/receiving/${encodeURIComponent(emailId)}/attachments`),
    ]);
    if (companiesError) throw companiesError;
    if (employeesError) throw employeesError;

    const attachments = Array.isArray(attachmentList?.data) ? attachmentList.data : [];
    const pdfs = attachments.filter((a: any) => isPdf(String(a?.filename || ''), String(a?.content_type || '')));

    const rawBody = String(email?.text || '').trim() || stripHtml(String(email?.html || ''));
    const preview = rawBody.slice(0, 1800);
    const attachmentNames = attachments.map((a: any) => String(a?.filename || '')).join(' ');
    const intelligenceText = [email?.subject, preview, attachmentNames].filter(Boolean).join('\n');
    const classification = classifyEmail(intelligenceText);

    const companyMatch = matchCompanySafely(intelligenceText, String(email?.subject || ''), (companies || []) as any[]);
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

    const receivedAt = String(email?.created_at || event?.created_at || new Date().toISOString());
    const metadata = {
      integration_mode: 'RESEND_FORWARDING_WEBHOOK',
      read_only: true,
      message_id: email?.message_id || event?.data?.message_id || null,
      to: recipients,
      body_preview: preview,
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
      attachments: attachments.map((a: any) => ({
        id: a?.id || null,
        name: a?.filename || '',
        content_type: a?.content_type || '',
        size: a?.size || 0,
        pdf: isPdf(String(a?.filename || ''), String(a?.content_type || '')),
      })),
    };

    const { data: messageRow, error: messageError } = await service.from('contabilidade_email_mensagens').insert({
      provider: 'RESEND',
      provider_message_id: emailId,
      mailbox: TARGET_MAILBOX,
      remetente: String(email?.from || event?.data?.from || ''),
      assunto: String(email?.subject || event?.data?.subject || ''),
      recebido_em: receivedAt,
      status: pdfs.length ? 'ANALISANDO' : 'PROCESSADO',
      total_anexos: attachments.length,
      total_pdfs: pdfs.length,
      metadata,
      processado_em: pdfs.length ? null : new Date().toISOString(),
    }).select('*').single();
    if (messageError) throw messageError;

    await logEvent(service, messageRow.id, null, 'EMAIL_RECEBIDO_RESEND', {
      remetente: email?.from || null,
      assunto: email?.subject || null,
      categoria: classification.category,
      relevante: classification.relevant,
      empresa_id: companyId,
      funcionario_id: employee?.id || null,
      competencia: competence,
      anexos: attachments.length,
      pdfs: pdfs.length,
      mode: 'RESEND_FORWARDING_WEBHOOK',
    });

    let hadError = false;
    let created = 0;
    let duplicates = 0;

    for (const attachment of pdfs) {
      try {
        let downloadUrl = String(attachment?.download_url || '');
        if (!downloadUrl && attachment?.id) {
          const detail = await resendGet(`/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(String(attachment.id))}`);
          downloadUrl = String(detail?.download_url || '');
        }
        if (!downloadUrl) throw new Error('attachment_download_url_missing');

        const fileResponse = await fetch(downloadUrl);
        if (!fileResponse.ok) throw new Error(`attachment_download_${fileResponse.status}`);
        const bytes = new Uint8Array(await fileResponse.arrayBuffer());
        if (!bytes.byteLength) throw new Error('attachment_empty');

        const sourceHash = sha256(bytes);
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
        let status = 'RECEBIDO';
        let duplicateOf: string | null = null;
        let reason = `PDF recebido via ${TARGET_MAILBOX}; Central de E-mails em modo somente leitura.`;

        if (prior) {
          storageBucket = prior.storage_bucket;
          storagePath = prior.storage_path;
          duplicateOf = prior.id;
          status = 'DUPLICADO';
          reason = 'Anexo idêntico já recebido anteriormente (hash SHA-256).';
          duplicates += 1;
        } else {
          const date = receivedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
          storagePath = `resend/${date}/${emailId}/${crypto.randomUUID()}-${safeFile(String(attachment?.filename || 'anexo.pdf'))}`;
          const { error: uploadError } = await service.storage.from(INBOX_BUCKET).upload(storagePath, bytes, {
            contentType: 'application/pdf',
            upsert: false,
          });
          if (uploadError) throw uploadError;
        }

        const { data: doc, error: docError } = await service.from('contabilidade_email_documentos').insert({
          mensagem_id: messageRow.id,
          arquivo_original: String(attachment?.filename || 'anexo.pdf'),
          mime_type: 'application/pdf',
          storage_bucket: storageBucket,
          storage_path: storagePath,
          source_sha256: sourceHash,
          tamanho_bytes: bytes.byteLength,
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
        created += 1;

        await logEvent(service, messageRow.id, doc.id, status === 'DUPLICADO' ? 'ANEXO_DUPLICADO' : 'PDF_RECEBIDO_RESEND', {
          arquivo: attachment?.filename || null,
          sha256: sourceHash,
          duplicate_of: duplicateOf,
          empresa_id: companyId,
          funcionario_id: employee?.id || null,
        });
      } catch (error: any) {
        hadError = true;
        await logEvent(service, messageRow.id, null, 'ANEXO_PDF_ERRO', {
          arquivo: attachment?.filename || null,
          error: String(error?.message || error),
        });
      }
    }

    await service.from('contabilidade_email_mensagens').update({
      status: hadError ? 'ERRO_PROCESSAMENTO' : 'PROCESSADO',
      processado_em: new Date().toISOString(),
      erro: hadError ? 'Um ou mais PDFs não puderam ser recebidos.' : null,
      updated_at: new Date().toISOString(),
    }).eq('id', messageRow.id);

    return sendJson(res, {
      ok: true,
      mailbox: TARGET_MAILBOX,
      email_id: emailId,
      category: classification.category,
      relevant: classification.relevant,
      pdfs_received: created,
      duplicate_pdfs: duplicates,
      had_error: hadError,
    });
  } catch (error: any) {
    console.error('[accounting-email-resend]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
