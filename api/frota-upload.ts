import { createClient } from '@supabase/supabase-js';

const FALLBACK_SUPABASE_URL = 'https://djfjnxmbvjgweqzjvqtr.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DHu9U7RSOV8uPwW2XXtH8A_ek7QfU_Z';
const MAX_VERCEL_MULTIPART_FILE_BYTES = 4_000_000;
const MAX_RAW_BODY_BYTES = 4_350_000;
const BUCKET = 'documentos-ativos';

export const config = {
  api: {
    bodyParser: false,
  },
};

const sendJson = (res: any, status: number, body: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
};

const env = (name: string) => String(process.env[name] || '').trim();
const bearer = (req: any) =>
  String(req?.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';

const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

export const normalizePlate = (value: unknown) =>
  normalizeText(value).replace(/[^A-Z0-9]/g, '').match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/)?.[0] || '';

export const normalizeRenavam = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.match(/\d{9,11}/)?.[0] || '';
};

export const normalizeChassi = (value: unknown) =>
  normalizeText(value).replace(/[^A-Z0-9]/g, '').match(/[A-HJ-NPR-Z0-9]{17}/)?.[0] || '';

const normalizeYear = (value: unknown) => String(value || '').match(/(?:19|20)\d{2}/)?.[0] || '';
const normalizePatrimonio = (value: unknown) =>
  normalizeText(value).replace(/[^A-Z0-9./-]/g, '').replace(/^[-./]+|[-./]+$/g, '');
const first = (...values: unknown[]) => values.map((value) => String(value || '').trim()).find(Boolean) || '';

const cleanFileName = (value: unknown) =>
  String(value || 'documento.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\-() ]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 120) || 'documento.pdf';

const getSupabase = (accessToken: string) => {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || FALLBACK_SUPABASE_URL;
  const key = env('SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_ANON_KEY') || FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
};

const readRawBody = (req: any): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let finished = false;

    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      reject(error);
    };

    req.on('data', (chunk: Buffer | string) => {
      if (finished) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_RAW_BODY_BYTES) {
        fail(new Error('PAYLOAD_TOO_LARGE'));
        try { req.destroy(); } catch (destroyError) { console.warn('[frota-upload] falha ao encerrar request grande:', destroyError); }
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => {
      if (finished) return;
      finished = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (error: Error) => fail(error));
  });

type MultipartFile = { name: string; filename: string; contentType: string; data: Buffer };
type MultipartData = { fields: Record<string, string>; files: MultipartFile[] };

export const parseMultipartFormData = (raw: Buffer, contentType: string): MultipartData => {
  const boundaryMatch = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = String(boundaryMatch?.[1] || boundaryMatch?.[2] || '').trim();
  if (!boundary) throw new Error('BOUNDARY_NOT_FOUND');

  const marker = `--${boundary}`;
  const body = raw.toString('latin1');
  const parts = body.split(marker);
  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];

  for (let part of parts) {
    if (!part || part === '--\r\n' || part === '--') continue;
    if (part.startsWith('\r\n')) part = part.slice(2);
    if (part.endsWith('--\r\n')) part = part.slice(0, -4);
    else if (part.endsWith('--')) part = part.slice(0, -2);
    if (part.endsWith('\r\n')) part = part.slice(0, -2);

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;
    const headerText = part.slice(0, headerEnd);
    const contentBinary = part.slice(headerEnd + 4);
    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || '';
    const name = disposition.match(/name="([^"]+)"/i)?.[1] || '';
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || '';
    if (!name) continue;

    const content = Buffer.from(contentBinary, 'latin1');
    if (filename) {
      const partType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream';
      files.push({ name, filename, contentType: partType, data: content });
    } else {
      fields[name] = content.toString('utf8');
    }
  }

  return { fields, files };
};

const extractPdfText = async (bytes: Uint8Array) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  }).promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => ('str' in item ? String(item.str || '') : ''))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) pages.push(text);
  }
  return pages.join('\n').trim();
};

const findYearFields = (all: string) => {
  const pair = all.match(/\b((?:19|20)\d{2})\s*[/\-]\s*((?:19|20)\d{2})\b/);
  const fabrication =
    all.match(/\b(?:ANO\s*(?:DE\s*)?FABRICACAO|ANO\s*FAB|FABRICACAO)\b[^0-9]{0,24}((?:19|20)\d{2})/i)?.[1] ||
    pair?.[1] || '';
  const model =
    all.match(/\b(?:ANO\s*(?:DO\s*)?MODELO|ANO\s*MOD)\b[^0-9]{0,24}((?:19|20)\d{2})/i)?.[1] ||
    pair?.[2] || '';
  const single = all.match(/\bANO\b[^0-9]{0,24}((?:19|20)\d{2})\b/i)?.[1] || '';
  return {
    ano_fabricacao: normalizeYear(fabrication || single),
    ano_modelo: normalizeYear(model || single || fabrication),
  };
};

export const parseVehiclePdfText = (text: string, fileName = 'documento.pdf') => {
  const raw = `${fileName}\n${text || ''}`;
  const all = normalizeText(raw);
  const years = findYearFields(all);

  const placa =
    normalizePlate(all.match(/\bPLACA\b[^A-Z0-9]{0,20}([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})\b/i)?.[1] || '') ||
    normalizePlate(fileName) ||
    normalizePlate(all);

  const renavam =
    normalizeRenavam(all.match(/\bRENAVAM\b[^0-9]{0,30}(\d[\d.\s-]{7,16})/i)?.[1] || '') ||
    normalizeRenavam(all.match(/\b(\d{11})\b/)?.[1] || '');

  const chassi =
    normalizeChassi(all.match(/\b(?:CHASSI|VIN)\b[^A-Z0-9]{0,30}([A-HJ-NPR-Z0-9]{17})/i)?.[1] || '') ||
    normalizeChassi(all.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)?.[1] || '');

  const patrimonio = normalizePatrimonio(first(
    all.match(/\bPATRIMONIO\b\s*(?:N[Oº.]*)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9./-]{1,29})\b/i)?.[1],
    all.match(/\b([A-Z]\d{1,3}\.\d{1,5})\b/i)?.[1],
    fileName.match(/\b([A-Z]\d{1,3}\.\d{1,5})\b/i)?.[1],
  ));

  const model = first(
    all.match(/\bMARCA\s*\/?\s*MODELO\b\s*[:\-]?\s*([A-Z0-9][A-Z0-9 .\/-]{1,70}?)(?=\s+\b(?:PLACA|RENAVAM|CHASSI|ANO|COR|CATEGORIA|PATRIMONIO)\b|$)/i)?.[1],
    all.match(/\bMODELO\s*\/?\s*VERSAO\b\s*[:\-]?\s*([A-Z0-9][A-Z0-9 .\/-]{1,70}?)(?=\s+\b(?:PLACA|RENAVAM|CHASSI|ANO|COR|CATEGORIA|PATRIMONIO)\b|$)/i)?.[1],
  ).trim();

  const equipment = /\b(COMPRESSOR|GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE\s+DE\s+ILUMINACAO|MOTOCOMPRESSOR)\b/.test(all);
  const bodyType = /\b(SEMI\s*-?\s*REBOQUE|REBOQUE|CARRETA|DOLLY)\b/.test(all);
  const tipo = equipment ? 'equipamento' : 'veiculo';
  const prefix = equipment ? 'EQUIPAMENTO' : bodyType ? 'CARROCERIA' : 'CARRO';
  const descricao = model ? `${prefix} - ${model}` : prefix;

  return {
    placa,
    renavam,
    chassi,
    ano_fabricacao: years.ano_fabricacao,
    ano_modelo: years.ano_modelo,
    ano: first(years.ano_modelo, years.ano_fabricacao),
    patrimonio,
    identificacao_ativo: first(patrimonio, placa, model, fileName.replace(/\.pdf$/i, '')),
    descricao,
    empresa: 'TOPAC MATRIZ',
    marca: '',
    modelo: model,
    cor: '',
    categoria_veiculo: '',
    tipo_veiculo: equipment ? 'equipamento' : bodyType ? 'carroceria' : 'carro',
    observacao: '',
    tipo,
  };
};

const mergeExtraction = (localData: any, aiData: any, clientData: any) => {
  const validPlate = (...values: unknown[]) => first(...values.map(normalizePlate));
  const validRenavam = (...values: unknown[]) => first(...values.map(normalizeRenavam));
  const validChassi = (...values: unknown[]) => first(...values.map(normalizeChassi));
  const validYear = (...values: unknown[]) => first(...values.map(normalizeYear));
  const validPatrimonio = (...values: unknown[]) => first(...values.map(normalizePatrimonio));

  const placa = validPlate(localData?.placa, clientData?.placa, aiData?.placa);
  const renavam = validRenavam(localData?.renavam, clientData?.renavam, aiData?.renavam);
  const chassi = validChassi(localData?.chassi, clientData?.chassi, aiData?.chassi);
  const anoFabricacao = validYear(localData?.ano_fabricacao, clientData?.ano_fabricacao, aiData?.ano_fabricacao, clientData?.ano, aiData?.ano);
  const anoModelo = validYear(localData?.ano_modelo, clientData?.ano_modelo, aiData?.ano_modelo, clientData?.ano, aiData?.ano, anoFabricacao);
  const patrimonio = validPatrimonio(localData?.patrimonio, clientData?.patrimonio, aiData?.patrimonio);

  const descricao = first(clientData?.descricao, aiData?.descricao, localData?.descricao, clientData?.modelo, aiData?.modelo, 'ATIVO');
  const context = normalizeText(`${descricao} ${clientData?.tipo_veiculo || ''} ${aiData?.tipo_veiculo || ''} ${localData?.tipo_veiculo || ''}`);
  const inferredEquipment = /\b(COMPRESSOR|GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE|MOTOCOMPRESSOR)\b/.test(context);
  const tipo = inferredEquipment || localData?.tipo === 'equipamento' || clientData?.tipo === 'equipamento' || aiData?.tipo === 'equipamento'
    ? 'equipamento'
    : 'veiculo';

  return {
    placa,
    renavam,
    chassi,
    ano_fabricacao: anoFabricacao,
    ano_modelo: anoModelo,
    ano: first(anoModelo, anoFabricacao),
    patrimonio,
    identificacao_ativo: first(patrimonio, placa, clientData?.identificacao_ativo, aiData?.identificacao_ativo, localData?.identificacao_ativo, descricao),
    descricao,
    empresa: first(clientData?.empresa, aiData?.empresa, localData?.empresa, 'TOPAC MATRIZ'),
    marca: first(clientData?.marca, aiData?.marca, localData?.marca),
    modelo: first(clientData?.modelo, clientData?.marca_modelo, aiData?.modelo, aiData?.marca_modelo, localData?.modelo),
    cor: first(clientData?.cor, aiData?.cor, localData?.cor),
    categoria_veiculo: first(clientData?.categoria_veiculo, aiData?.categoria_veiculo, localData?.categoria_veiculo),
    tipo_veiculo: first(clientData?.tipo_veiculo, aiData?.tipo_veiculo, localData?.tipo_veiculo, tipo === 'equipamento' ? 'equipamento' : 'carro'),
    observacao: first(clientData?.observacao, aiData?.observacao, localData?.observacao),
    tipo,
  };
};

const storagePathFromUrl = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const marker = `/${BUCKET}/`;
  const markerIndex = raw.indexOf(marker);
  if (markerIndex >= 0) return decodeURIComponent(raw.slice(markerIndex + marker.length));
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '');
  return '';
};

const removeStoragePath = async (supabase: ReturnType<typeof getSupabase>, path: string) => {
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn('[frota-upload] falha ao remover objeto:', path, error.message);
};

const uploadWithRetry = async (supabase: ReturnType<typeof getSupabase>, storagePath: string, bytes: Uint8Array) => {
  let lastError: any = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    });
    if (!error) return;
    lastError = error;
    console.warn(`[frota-upload] tentativa ${attempt} falhou:`, error.message);
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('Falha desconhecida no Supabase Storage.');
};

const friendlyDbError = (error: any) => {
  const message = String(error?.message || error || 'Erro desconhecido');
  if (error?.code === '23514' || /renavam|chassi|identidade veicular/i.test(message)) {
    return 'O PDF foi recebido, mas não foi possível confirmar RENAVAM e Chassi. Confira se o documento é legível e tente novamente.';
  }
  return message;
};

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });

    const token = bearer(req);
    if (!token) return sendJson(res, 401, { ok: false, error: 'Sessão não informada. Faça login novamente.' });

    const contentType = String(req?.headers?.['content-type'] || '');
    if (!/^multipart\/form-data\b/i.test(contentType)) {
      return sendJson(res, 415, { ok: false, error: 'Envie o PDF como multipart/form-data.' });
    }

    let rawBody: Buffer;
    try {
      rawBody = await readRawBody(req);
    } catch (error: any) {
      if (error?.message === 'PAYLOAD_TOO_LARGE') {
        return sendJson(res, 413, {
          ok: false,
          code: 'direct_storage_required',
          error: 'Arquivo acima do limite seguro da Vercel Function. Use o fluxo direto ao Supabase Storage.',
          maxBytes: MAX_VERCEL_MULTIPART_FILE_BYTES,
        });
      }
      console.error('[frota-upload] erro ao ler multipart:', error?.stack || error?.message || error);
      return sendJson(res, 400, { ok: false, error: `Não foi possível ler o upload: ${error?.message || error}` });
    }

    let multipart: MultipartData;
    try {
      multipart = parseMultipartFormData(rawBody, contentType);
    } catch (error: any) {
      console.error('[frota-upload] multipart inválido:', error?.stack || error?.message || error);
      return sendJson(res, 400, { ok: false, error: 'O upload multipart está inválido. Selecione o PDF novamente e tente outra vez.' });
    }

    const file = multipart.files.find((candidate) => candidate.name === 'file') || multipart.files[0];
    if (!file) return sendJson(res, 400, { ok: false, error: 'PDF não recebido pela Vercel Function.' });
    if (!file.data.length) return sendJson(res, 400, { ok: false, error: 'O PDF recebido está vazio.' });
    if (file.data.length > MAX_VERCEL_MULTIPART_FILE_BYTES) {
      return sendJson(res, 413, {
        ok: false,
        code: 'direct_storage_required',
        error: 'Arquivo acima do limite seguro da Vercel Function. Use o fluxo direto ao Supabase Storage.',
        maxBytes: MAX_VERCEL_MULTIPART_FILE_BYTES,
      });
    }
    if (file.contentType !== 'application/pdf' && !file.filename.toLowerCase().endsWith('.pdf')) {
      return sendJson(res, 415, { ok: false, error: 'Somente arquivos PDF são aceitos.' });
    }

    let clientData: any = {};
    if (multipart.fields.extracted) {
      try {
        clientData = JSON.parse(multipart.fields.extracted);
      } catch (error: any) {
        console.warn('[frota-upload] campo extracted inválido:', error?.message || error);
      }
    }

    const supabase = getSupabase(token);
    let user: any = null;
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser(token);
      if (authError) throw authError;
      user = auth?.user;
    } catch (error: any) {
      console.error('[frota-upload] falha de autenticação:', error?.message || error);
      return sendJson(res, 401, { ok: false, error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
    if (!user?.id) return sendJson(res, 401, { ok: false, error: 'Usuário autenticado não identificado.' });

    const bytes = new Uint8Array(file.data);
    let extractedText = '';
    try {
      extractedText = await extractPdfText(bytes);
    } catch (error: any) {
      console.warn('[frota-upload] PDF sem camada textual legível; usando extração do navegador/visão:', error?.message || error);
    }

    const localData = parseVehiclePdfText(extractedText, file.filename);
    let aiData: any = {};
    if (extractedText) {
      try {
        const { data, error } = await supabase.functions.invoke('parse-text', {
          body: {
            type: 'documento_veiculo',
            text: `Arquivo: ${file.filename}\n\n${extractedText}`.slice(0, 80_000),
          },
        });
        if (error) throw error;
        aiData = data?.data || {};
      } catch (error: any) {
        console.warn('[frota-upload] parse-text indisponível; mantendo parser determinístico:', error?.message || error);
      }
    }

    const extracted = mergeExtraction(localData, aiData, clientData);
    if (!extracted.placa && !extracted.patrimonio) {
      return sendJson(res, 422, {
        ok: false,
        error: 'O PDF foi lido, mas não foi possível identificar Placa ou Patrimônio/Ativo. Confira a legibilidade do documento.',
        extracted,
      });
    }

    const storagePath = `${user.id}/frota/${Date.now()}-${crypto.randomUUID()}-${cleanFileName(file.filename)}`;
    try {
      await uploadWithRetry(supabase, storagePath, bytes);
    } catch (error: any) {
      console.error('[frota-upload] falha no Storage:', error?.stack || error?.message || error);
      return sendJson(res, 502, { ok: false, error: `Falha ao salvar o PDF no Supabase Storage: ${error?.message || error}` });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const pdfUrl = urlData.publicUrl;
    const now = new Date().toISOString();
    const record: any = {
      user_id: user.id,
      tipo: extracted.tipo,
      descricao: extracted.descricao || extracted.identificacao_ativo || file.filename.replace(/\.pdf$/i, ''),
      placa: extracted.placa || '',
      patrimonio: extracted.patrimonio || '',
      renavam: extracted.renavam || '',
      chassi: extracted.chassi || '',
      ano_fabricacao: extracted.ano_fabricacao || '',
      ano_modelo: extracted.ano_modelo || '',
      empresa: extracted.empresa || 'TOPAC MATRIZ',
      arquivo_url: pdfUrl,
      observacao: extracted.observacao || '',
      status: 'ativo',
      marca: extracted.marca || '',
      modelo: extracted.modelo || '',
      cor: extracted.cor || '',
      categoria_veiculo: extracted.categoria_veiculo || '',
      tipo_veiculo: extracted.tipo_veiculo || (extracted.tipo === 'equipamento' ? 'equipamento' : 'carro'),
      documento_url: pdfUrl,
      documento_nome: file.filename,
      documento_atualizado_em: now,
    };

    let existing: any = null;
    if (record.placa) {
      const { data, error } = await supabase.from('ativos').select('*').eq('placa', record.placa).limit(1).maybeSingle();
      if (error) console.warn('[frota-upload] busca por placa falhou:', error.message);
      existing = data;
    }
    if (!existing && record.patrimonio) {
      const { data, error } = await supabase.from('ativos').select('*').eq('patrimonio', record.patrimonio).limit(1).maybeSingle();
      if (error) console.warn('[frota-upload] busca por patrimônio falhou:', error.message);
      existing = data;
    }

    if (existing?.id) {
      const oldPath = storagePathFromUrl(existing.documento_url || existing.arquivo_url);
      const { data, error } = await supabase
        .from('ativos')
        .update({ ...record, updated_at: now } as any)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) {
        await removeStoragePath(supabase, storagePath);
        console.error('[frota-upload] falha ao atualizar ativo:', error.message);
        return sendJson(res, 500, { ok: false, error: friendlyDbError(error) });
      }

      if (oldPath && oldPath !== storagePath) await removeStoragePath(supabase, oldPath);
      console.log('[frota-upload] atualizado', JSON.stringify({ id: data.id, placa: data.placa, patrimonio: data.patrimonio }));
      return sendJson(res, 200, { ok: true, action: 'updated', asset: data, extracted, storagePath });
    }

    const { data, error } = await supabase.from('ativos').insert(record as any).select('*').single();
    if (error) {
      await removeStoragePath(supabase, storagePath);
      console.error('[frota-upload] falha ao cadastrar ativo:', error.message);
      return sendJson(res, 500, { ok: false, error: friendlyDbError(error) });
    }

    console.log('[frota-upload] cadastrado', JSON.stringify({ id: data.id, placa: data.placa, patrimonio: data.patrimonio }));
    return sendJson(res, 200, { ok: true, action: 'created', asset: data, extracted, storagePath });
  } catch (error: any) {
    console.error('[frota-upload] erro inesperado:', error?.stack || error?.message || error);
    return sendJson(res, 500, { ok: false, error: `Falha interna no upload do PDF: ${error?.message || 'erro desconhecido'}` });
  }
}
