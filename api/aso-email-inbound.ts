import { createClient } from '@supabase/supabase-js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const DOCUMENT_BUCKET = 'documentos-funcionarios';

type SupabaseClient = ReturnType<typeof createClient>;

type IncomingAttachment = {
  filename: string;
  contentType: string;
  bytes: Buffer;
};

type FuncionarioRow = {
  id: string;
  nome: string;
  cpf: string;
  company_id: string;
  cargo?: string | null;
  status?: string | null;
};

type EmpresaRow = {
  id: string;
  nome: string;
};

const env = (name: string) => String(process.env[name] || '').trim();

const getSupabaseServer = () => {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('missing_supabase_service_env');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const sendJson = (res: any, body: unknown, status = 200) => {
  if (res) return res.status(status).json(body);
  return json(body, status);
};

const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

const safeFilePart = (value: string) =>
  (value || 'aso.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'aso.pdf';

const normalizePdfName = (value: unknown) => {
  const name = safeFilePart(String(value || 'ASO_RECEBIDO.pdf'));
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
};

const normalizeBase64 = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s/g, '');

const readRawBody = async (req: any) => {
  if (Buffer.isBuffer(req?.body)) return req.body;
  if (typeof req?.body === 'string') return Buffer.from(req.body, 'utf8');
  if (req?.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body), 'utf8');
  if (!req?.on) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', resolve);
    req.on('error', reject);
  });
  return Buffer.concat(chunks);
};

const parseBody = async (req: any) => {
  if (typeof req?.json === 'function') return req.json();
  if (typeof req?.formData === 'function') {
    const form = await req.formData();
    const values: Record<string, unknown> = {};
    const files: File[] = [];
    form.forEach((value: unknown, key: string) => {
      if (value instanceof File) files.push(value);
      else values[key] = value;
    });
    return { ...values, attachments: files };
  }
  if (req?.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;

  const raw = await readRawBody(req);
  if (!raw.length) return {};

  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return { raw: raw.toString('utf8') };
  }
};

const getAny = (body: any, paths: string[]) => {
  for (const path of paths) {
    const value = path.split('.').reduce((acc, key) => acc?.[key], body);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};

const collectAttachmentCandidates = (body: any) => {
  const direct = [
    body?.attachments,
    body?.attachment,
    body?.files,
    body?.documents,
    body?.email?.attachments,
    body?.data?.attachments,
    body?.message?.attachments,
  ].filter(Boolean);

  return direct.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') return Object.values(value);
    return [value];
  });
};

const bufferFromAttachment = async (attachment: any): Promise<IncomingAttachment | null> => {
  if (!attachment) return null;

  if (typeof File !== 'undefined' && attachment instanceof File) {
    const bytes = Buffer.from(await attachment.arrayBuffer());
    return {
      filename: normalizePdfName(attachment.name),
      contentType: attachment.type || 'application/pdf',
      bytes,
    };
  }

  const filename = normalizePdfName(
    attachment.filename ||
    attachment.fileName ||
    attachment.name ||
    attachment.originalname ||
    attachment.path ||
    'ASO_RECEBIDO.pdf',
  );
  const contentType = String(
    attachment.contentType ||
    attachment.content_type ||
    attachment.mimeType ||
    attachment.type ||
    'application/pdf',
  );

  if (attachment.url && /^https?:\/\//i.test(String(attachment.url))) {
    const response = await fetch(String(attachment.url));
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return { filename, contentType, bytes };
  }

  const rawContent =
    attachment.content ||
    attachment.content_base64 ||
    attachment.base64 ||
    attachment.data ||
    attachment.body;

  if (Buffer.isBuffer(rawContent)) return { filename, contentType, bytes: rawContent };
  if (Array.isArray(rawContent)) return { filename, contentType, bytes: Buffer.from(rawContent) };
  if (rawContent?.data && Array.isArray(rawContent.data)) {
    return { filename, contentType, bytes: Buffer.from(rawContent.data) };
  }
  if (typeof rawContent === 'string') {
    return { filename, contentType, bytes: Buffer.from(normalizeBase64(rawContent), 'base64') };
  }

  return null;
};

const isPdf = (attachment: IncomingAttachment) =>
  /\.pdf$/i.test(attachment.filename) ||
  /pdf/i.test(attachment.contentType) ||
  attachment.bytes.subarray(0, 4).toString('utf8') === '%PDF';

const extractPdfText = async (bytes: Buffer) => {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: any) => item.str || '').join(' '));
    }

    await pdf.destroy();
    return pages.join('\n');
  } catch (error) {
    console.error('Erro ao ler texto do PDF ASO recebido por e-mail:', error);
    return '';
  }
};

const findCpf = (text: string) => {
  const match = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  return match ? onlyDigits(match[0]) : '';
};

const getFuncionarioMatch = (
  funcionarios: FuncionarioRow[],
  cpfDetectado: string,
  sourceText: string,
) => {
  if (cpfDetectado) {
    const byCpf = funcionarios.find((funcionario) => onlyDigits(funcionario.cpf) === cpfDetectado);
    if (byCpf) return { funcionario: byCpf, nomeDetectado: byCpf.nome, metodo: 'cpf' };
  }

  const normalizedSource = normalizeText(sourceText);
  const scored = funcionarios
    .map((funcionario) => {
      const nome = normalizeText(funcionario.nome);
      const tokens = nome.split(' ').filter((token) => token.length > 2);
      const hits = tokens.filter((token) => normalizedSource.includes(token)).length;
      const full = nome.length > 8 && normalizedSource.includes(nome);
      return { funcionario, hits, full, score: full ? 100 : hits, tokenCount: tokens.length };
    })
    .filter((item) => item.full || item.score >= Math.max(2, Math.ceil(item.tokenCount * 0.65)))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { funcionario: null, nomeDetectado: '', metodo: '' };
  if (scored.length > 1 && scored[0].score === scored[1].score && !scored[0].full) {
    return { funcionario: null, nomeDetectado: scored[0].funcionario.nome, metodo: 'nome_ambiguo' };
  }
  return { funcionario: scored[0].funcionario, nomeDetectado: scored[0].funcionario.nome, metodo: scored[0].full ? 'nome_completo' : 'nome_tokens' };
};

const insertDocumentoFuncionario = async (
  supabase: SupabaseClient,
  funcionario: FuncionarioRow,
  empresa: EmpresaRow | undefined,
  attachment: IncomingAttachment,
  storagePath: string,
  receivedAt: string,
  emailFrom: string,
  subject: string,
) => {
  const payload: Record<string, unknown> = {
    funcionario_id: funcionario.id,
    funcionario_nome: funcionario.nome || '',
    company_id: funcionario.company_id,
    empresa_nome: empresa?.nome || '',
    tipo_documento: 'ASO recebido por e-mail',
    competencia: '',
    descricao: `ASO recebido por e-mail da clinica/SOC - ${subject || attachment.filename}`,
    arquivo_url: storagePath,
    gerado_por_user_id: env('SYSTEM_USER_ID') || SYSTEM_USER_ID,
    gerado_por_nome: 'Integracao ASO por e-mail',
    unidade: empresa?.nome || '',
    status_envio: 'recebido',
    categoria: 'ASO',
    origem: 'email_clinica_soc',
    observacao: `Recebido de: ${emailFrom || '-'} | Assunto: ${subject || '-'}`,
    nome_arquivo: attachment.filename,
    data_documento: receivedAt,
    storage_bucket: DOCUMENT_BUCKET,
    storage_path: storagePath,
  };

  let result = await supabase.from('documentos_funcionario').insert(payload).select('id').single();

  if (result.error && /schema cache|could not find|column/i.test(result.error.message || '')) {
    delete payload.categoria;
    delete payload.origem;
    delete payload.observacao;
    delete payload.nome_arquivo;
    delete payload.data_documento;
    delete payload.storage_bucket;
    delete payload.storage_path;
    result = await supabase.from('documentos_funcionario').insert(payload).select('id').single();
  }

  if (result.error) throw result.error;
  return result.data;
};

const insertPendente = async (
  supabase: SupabaseClient,
  attachment: IncomingAttachment,
  storagePath: string,
  emailFrom: string,
  subject: string,
  receivedAt: string,
  cpfDetectado: string,
  nomeDetectado: string,
  textoDetectado: string,
  motivo: string,
) => {
  const { data, error } = await supabase
    .from('aso_documentos_pendentes')
    .insert({
      status: 'pendente',
      email_from: emailFrom,
      email_subject: subject,
      received_at: receivedAt,
      nome_arquivo: attachment.filename,
      storage_bucket: DOCUMENT_BUCKET,
      storage_path: storagePath,
      arquivo_url: storagePath,
      cpf_detectado: cpfDetectado,
      nome_detectado: nomeDetectado,
      texto_detectado: textoDetectado.slice(0, 12000),
      motivo,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
};

export default async function handler(req: any, res?: any) {
  const method = req?.method || 'POST';
  if (method !== 'POST') {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  const secret = env('ASO_INBOUND_SECRET');
  const sentSecret =
    String(req?.headers?.['x-aso-inbound-secret'] || req?.headers?.get?.('x-aso-inbound-secret') || '') ||
    String(req?.query?.secret || '');
  if (secret && sentSecret !== secret) {
    return sendJson(res, { ok: false, error: 'unauthorized' }, 401);
  }

  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseServer();
  } catch {
    return sendJson(res, {
      ok: false,
      error: 'missing_supabase_service_env',
      message: 'Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para receber ASOs por e-mail.',
    }, 500);
  }

  try {
    const body = await parseBody(req);
    const emailFrom = String(getAny(body, ['from', 'sender', 'from.email', 'email.from', 'message.from']) || '').trim();
    const subject = String(getAny(body, ['subject', 'email.subject', 'message.subject']) || '').trim();
    const text = String(getAny(body, ['text', 'text_body', 'plain', 'email.text', 'message.text']) || '').trim();
    const html = String(getAny(body, ['html', 'html_body', 'email.html', 'message.html']) || '').replace(/<[^>]+>/g, ' ');
    const receivedAt = String(getAny(body, ['received_at', 'receivedAt', 'date', 'email.date', 'created_at']) || new Date().toISOString());

    const attachments = (await Promise.all(collectAttachmentCandidates(body).map(bufferFromAttachment)))
      .filter((item): item is IncomingAttachment => Boolean(item))
      .filter(isPdf);

    if (!attachments.length) {
      return sendJson(res, {
        ok: false,
        error: 'sem_pdf',
        message: 'E-mail recebido sem PDF anexo de ASO.',
      }, 400);
    }

    const [{ data: funcionariosData, error: funcionariosError }, { data: empresasData, error: empresasError }] = await Promise.all([
      supabase.from('funcionarios').select('id,nome,cpf,company_id,cargo,status').neq('status', 'excluido'),
      supabase.from('empresas').select('id,nome'),
    ]);

    if (funcionariosError) throw funcionariosError;
    if (empresasError) throw empresasError;

    const funcionarios = (funcionariosData || []) as FuncionarioRow[];
    const empresas = (empresasData || []) as EmpresaRow[];
    const processed = [];

    for (const attachment of attachments) {
      const pdfText = await extractPdfText(attachment.bytes);
      const sourceText = [subject, text, html, pdfText].join('\n');
      const cpfDetectado = findCpf(sourceText);
      const match = getFuncionarioMatch(funcionarios, cpfDetectado, sourceText);
      const funcionario = match.funcionario;
      const storagePath = `${funcionario?.id || 'pendentes-aso'}/aso/email_${Date.now()}_${safeFilePart(attachment.filename)}`;

      const { error: uploadError } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(storagePath, attachment.bytes, {
          contentType: 'application/pdf',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      if (funcionario) {
        const empresa = empresas.find((item) => item.id === funcionario.company_id);
        const documento = await insertDocumentoFuncionario(
          supabase,
          funcionario,
          empresa,
          attachment,
          storagePath,
          receivedAt,
          emailFrom,
          subject,
        );
        processed.push({
          arquivo: attachment.filename,
          status: 'vinculado',
          funcionario_id: funcionario.id,
          funcionario_nome: funcionario.nome,
          documento_id: documento?.id,
          metodo: match.metodo,
        });
      } else {
        const pending = await insertPendente(
          supabase,
          attachment,
          storagePath,
          emailFrom,
          subject,
          receivedAt,
          cpfDetectado,
          match.nomeDetectado,
          sourceText,
          match.metodo === 'nome_ambiguo' ? 'Nome detectado ambiguo. Vincule manualmente.' : 'Funcionario nao identificado automaticamente.',
        );
        processed.push({
          arquivo: attachment.filename,
          status: 'pendente_vinculo',
          pendente_id: pending?.id,
          cpf_detectado: cpfDetectado,
          nome_detectado: match.nomeDetectado,
        });
      }
    }

    return sendJson(res, { ok: true, processed });
  } catch (error: any) {
    console.error('Erro ao processar ASO recebido por e-mail:', error);
    return sendJson(res, {
      ok: false,
      error: 'aso_inbound_failed',
      message: error?.message || 'Falha ao processar ASO recebido por e-mail.',
    }, 500);
  }
}
