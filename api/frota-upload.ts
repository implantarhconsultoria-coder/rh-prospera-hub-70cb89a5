import { createClient } from '@supabase/supabase-js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const FALLBACK_SUPABASE_URL = 'https://djfjnxmbvjgweqzjvqtr.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DHu9U7RSOV8uPwW2XXtH8A_ek7QfU_Z';
const MAX_VERCEL_MULTIPART_FILE_BYTES = 4_000_000;
const BUCKET = 'documentos-ativos';

const env = (name: string) => String(process.env[name] || '').trim();

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

const normalizeYear = (value: unknown) => {
  const year = String(value || '').match(/(?:19|20)\d{2}/)?.[0] || '';
  return year;
};

const normalizePatrimonio = (value: unknown) =>
  normalizeText(value).replace(/[^A-Z0-9./-]/g, '').replace(/^[-./]+|[-./]+$/g, '');

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

const bearer = (request: Request) =>
  String(request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';

const extractPdfText = async (bytes: Uint8Array) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
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

const first = (...values: unknown[]) => values.map((value) => String(value || '').trim()).find(Boolean) || '';

const findYearFields = (all: string) => {
  const pair = all.match(/\b((?:19|20)\d{2})\s*[/\-]\s*((?:19|20)\d{2})\b/);
  const fabrication =
    all.match(/\b(?:ANO\s*(?:DE\s*)?FABRICACAO|ANO\s*FAB|FABRICACAO)\b[^0-9]{0,20}((?:19|20)\d{2})/i)?.[1] ||
    pair?.[1] || '';
  const model =
    all.match(/\b(?:ANO\s*(?:DO\s*)?MODELO|ANO\s*MOD)\b[^0-9]{0,20}((?:19|20)\d{2})/i)?.[1] ||
    pair?.[2] || '';
  const single = all.match(/\bANO\b[^0-9]{0,20}((?:19|20)\d{2})\b/i)?.[1] || '';
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
    normalizePlate(all.match(/\bPLACA\b[^A-Z0-9]{0,18}([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/i)?.[1] || '') ||
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

  // Dados determinísticos do PDF têm prioridade. O parsing do navegador/visão cobre PDFs escaneados.
  const placa = validPlate(localData?.placa, clientData?.placa, aiData?.placa);
  const renavam = validRenavam(localData?.renavam, clientData?.renavam, aiData?.renavam);
  const chassi = validChassi(localData?.chassi, clientData?.chassi, aiData?.chassi);
  const anoFabricacao = validYear(localData?.ano_fabricacao, clientData?.ano_fabricacao, aiData?.ano_fabricacao, clientData?.ano, aiData?.ano);
  const anoModelo = validYear(localData?.ano_modelo, clientData?.ano_modelo, aiData?.ano_modelo, clientData?.ano, aiData?.ano, anoFabricacao);
  const patrimonio = validPatrimonio(localData?.patrimonio, clientData?.patrimonio, aiData?.patrimonio);

  const descricao = first(
    clientData?.descricao,
    aiData?.descricao,
    localData?.descricao,
    clientData?.modelo,
    aiData?.modelo,
    'ATIVO',
  );

  const context = normalizeText(`${descricao} ${clientData?.tipo_veiculo || ''} ${aiData?.tipo_veiculo || ''} ${localData?.tipo_veiculo || ''}`);
  const inferredEquipment = /\b(COMPRESSOR|GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE|MOTOCOMPRESSOR)\b/.test(context);
  const tipo = inferredEquipment || localData?.tipo === 'equipamento' ? 'equipamento' : 'veiculo';

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
  if (error) console.warn('[frota-upload] não foi possível remover objeto auxiliar/antigo:', path, error.message);
};

const uploadWithRetry = async (
  supabase: ReturnType<typeof getSupabase>,
  storagePath: string,
  bytes: Uint8Array,
) => {
  let lastError: any = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    });
    if (!error) return;
    lastError = error;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('Falha desconhecida no Supabase Storage.');
};

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const token = bearer(request);
  if (!token) return json({ error: 'Sessão não informada.' }, 401);

  const supabase = getSupabase(token);
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  const user = auth?.user;
  if (authError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Envie o PDF como multipart/form-data.' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'PDF não recebido.' }, 400);
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return json({ error: 'Somente arquivos PDF são aceitos.' }, 415);
  }
  if (!file.size) return json({ error: 'O PDF recebido está vazio.' }, 400);
  if (file.size > MAX_VERCEL_MULTIPART_FILE_BYTES) {
    return json({
      error: 'Arquivo deve seguir pelo upload direto ao Supabase Storage.',
      code: 'direct_storage_required',
      maxBytes: MAX_VERCEL_MULTIPART_FILE_BYTES,
    }, 413);
  }

  let clientData: any = {};
  try {
    clientData = JSON.parse(String(form.get('extracted') || '{}'));
  } catch {
    clientData = {};
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let extractedText = '';
  try {
    extractedText = await extractPdfText(bytes);
  } catch (error) {
    console.warn('[frota-upload] PDF sem camada textual legível; usando dados extraídos no navegador/visão.', error);
  }

  const localData = parseVehiclePdfText(extractedText, file.name);
  let aiData: any = {};
  if (extractedText) {
    try {
      const { data, error } = await supabase.functions.invoke('parse-text', {
        body: {
          type: 'documento_veiculo',
          text: `Arquivo: ${file.name}\n\n${extractedText}`.slice(0, 80_000),
        },
      });
      if (!error) aiData = data?.data || {};
    } catch (error) {
      console.warn('[frota-upload] parse-text indisponível; extração determinística mantida.', error);
    }
  }

  const extracted = mergeExtraction(localData, aiData, clientData);
  const storagePath = `${user.id}/frota/${Date.now()}-${crypto.randomUUID()}-${cleanFileName(file.name)}`;

  try {
    await uploadWithRetry(supabase, storagePath, bytes);
  } catch (uploadError: any) {
    return json({ error: `Falha ao armazenar o PDF no Supabase: ${uploadError?.message || uploadError}` }, 502);
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const pdfUrl = urlData.publicUrl;
  const now = new Date().toISOString();

  const record: any = {
    user_id: user.id,
    tipo: extracted.tipo,
    descricao: extracted.descricao || extracted.identificacao_ativo || file.name.replace(/\.pdf$/i, ''),
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
    documento_nome: file.name,
    documento_atualizado_em: now,
  };

  let existing: any = null;
  if (record.placa) {
    const { data } = await supabase.from('ativos').select('*').eq('placa', record.placa).limit(1).maybeSingle();
    existing = data;
  }
  if (!existing && record.patrimonio) {
    const { data } = await supabase.from('ativos').select('*').eq('patrimonio', record.patrimonio).limit(1).maybeSingle();
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
      return json({ error: `O PDF foi recebido, mas o cadastro não pôde ser atualizado: ${error.message}` }, 500);
    }

    if (oldPath && oldPath !== storagePath) await removeStoragePath(supabase, oldPath);
    return json({ ok: true, action: 'updated', asset: data, extracted, storagePath });
  }

  const { data, error } = await supabase.from('ativos').insert(record as any).select('*').single();
  if (error) {
    await removeStoragePath(supabase, storagePath);
    return json({ error: `O PDF foi recebido, mas o ativo não pôde ser cadastrado: ${error.message}` }, 500);
  }

  return json({ ok: true, action: 'created', asset: data, extracted, storagePath });
}
