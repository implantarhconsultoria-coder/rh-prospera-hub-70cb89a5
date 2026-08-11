import { createClient } from '@supabase/supabase-js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const FALLBACK_SUPABASE_URL = 'https://djfjnxmbvjgweqzjvqtr.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DHu9U7RSOV8uPwW2XXtH8A_ek7QfU_Z';
const MAX_VERCEL_MULTIPART_FILE_BYTES = 4_000_000;

const env = (name: string) => String(process.env[name] || '').trim();
const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
const normalizePlate = (value: unknown) =>
  normalizeText(value).replace(/[^A-Z0-9]/g, '').match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/)?.[0] || '';
const normalizeRenavam = (value: unknown) =>
  String(value || '').replace(/\D/g, '').match(/\d{9,11}/)?.[0] || '';
const normalizeChassi = (value: unknown) =>
  normalizeText(value).replace(/[^A-Z0-9]/g, '').match(/[A-HJ-NPR-Z0-9]{17}/)?.[0] || '';
const cleanFileName = (value: unknown) =>
  String(value || 'documento.pdf')
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

const parseLocal = (text: string, fileName: string) => {
  const all = normalizeText(`${fileName}\n${text}`);
  const plate = normalizePlate(all) || normalizePlate(fileName);
  const renavam =
    normalizeRenavam(all.match(/\bRENAVAM\b[^0-9]{0,24}(\d{9,11})/i)?.[1] || '') ||
    normalizeRenavam(all.match(/\b(\d{11})\b/)?.[1] || '');
  const chassi =
    normalizeChassi(all.match(/\b(?:CHASSI|VIN)\b[^A-Z0-9]{0,24}([A-HJ-NPR-Z0-9]{17})/i)?.[1] || '') ||
    normalizeChassi(all.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)?.[1] || '');
  const yearPair = all.match(/\b((?:19|20)\d{2})\s*\/\s*((?:19|20)\d{2})\b/);
  const patrimonio = String(
    all.match(/\bPATRIMONIO\b\s*(?:N[Oº.]*)?\s*[:\-]?\s*([A-Z0-9./-]{2,30})/i)?.[1] ||
    fileName.match(/\b([A-Z]\d{1,3}\.\d{1,4})\b/i)?.[1] ||
    '',
  ).trim();
  const model =
    all.match(/\b(?:MARCA\s*\/?\s*MODELO|MODELO\s*\/?\s*VERSAO)\b\s*[:\-]?\s*([A-Z0-9 .\/-]{2,80})/i)?.[1]?.trim() || '';
  const equipment = /\b(COMPRESSOR|GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE DE ILUMINACAO)\b/.test(all);
  const descricao = model ? `${equipment ? 'EQUIPAMENTO' : 'CARRO'} - ${model}` : (equipment ? 'EQUIPAMENTO' : 'CARRO');
  return {
    placa: plate,
    renavam,
    chassi,
    ano_fabricacao: yearPair?.[1] || '',
    ano_modelo: yearPair?.[2] || '',
    patrimonio,
    descricao,
    empresa: 'TOPAC MATRIZ',
    marca: '',
    modelo: model,
    cor: '',
    categoria_veiculo: '',
    tipo_veiculo: equipment ? 'equipamento' : 'carro',
    observacao: '',
  };
};

const mergeExtraction = (localData: any, aiData: any, clientData: any) => {
  const pick = (key: string) => clientData?.[key] ?? aiData?.[key] ?? localData?.[key] ?? '';
  const descricao = String(pick('descricao') || localData.descricao || 'ATIVO').trim();
  const inferredEquipment = /\b(COMPRESSOR|GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE)\b/i.test(
    `${descricao} ${pick('tipo_veiculo')} ${pick('categoria_veiculo')}`,
  );
  return {
    placa: normalizePlate(pick('placa')),
    renavam: normalizeRenavam(pick('renavam')),
    chassi: normalizeChassi(pick('chassi')),
    ano_fabricacao: String(pick('ano_fabricacao')).replace(/\D/g, '').slice(0, 4),
    ano_modelo: String(pick('ano_modelo')).replace(/\D/g, '').slice(0, 4),
    patrimonio: String(pick('patrimonio')).trim(),
    descricao,
    empresa: String(pick('empresa') || 'TOPAC MATRIZ').trim(),
    marca: String(pick('marca')).trim(),
    modelo: String(pick('modelo') || pick('marca_modelo')).trim(),
    cor: String(pick('cor')).trim(),
    categoria_veiculo: String(pick('categoria_veiculo')).trim(),
    tipo_veiculo: String(pick('tipo_veiculo') || (inferredEquipment ? 'equipamento' : 'carro')).trim(),
    observacao: String(pick('observacao')).trim(),
    tipo: inferredEquipment ? 'equipamento' : 'veiculo',
  };
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
  if (!file.size || file.size > MAX_VERCEL_MULTIPART_FILE_BYTES) {
    return json({
      error: 'Arquivo acima do limite seguro da função Vercel. Envie este PDF pelo fluxo direto para o Supabase Storage.',
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

  const rawBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(rawBuffer);
  const storageBytes = bytes.slice();
  let extractedText = '';
  try {
    extractedText = await extractPdfText(bytes);
  } catch (error) {
    console.warn('[frota-upload] PDF sem camada textual legível.', error);
  }

  const localData = parseLocal(extractedText, file.name);
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
  const { error: uploadError } = await supabase.storage
    .from('documentos-ativos')
    .upload(storagePath, storageBytes, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    });
  if (uploadError) return json({ error: `Falha ao armazenar o PDF no Supabase: ${uploadError.message}` }, 502);

  const { data: urlData } = supabase.storage.from('documentos-ativos').getPublicUrl(storagePath);
  const pdfUrl = urlData.publicUrl;
  const now = new Date().toISOString();
  const record: any = {
    user_id: user.id,
    tipo: extracted.tipo,
    descricao: extracted.descricao || file.name.replace(/\.pdf$/i, ''),
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
    const { data } = await supabase.from('ativos').select('*').eq('placa', record.placa).maybeSingle();
    existing = data;
  }
  if (!existing && record.patrimonio) {
    const { data } = await supabase.from('ativos').select('*').eq('patrimonio', record.patrimonio).maybeSingle();
    existing = data;
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('ativos')
      .update({ ...record, updated_at: now } as any)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return json({ error: `PDF armazenado, mas o cadastro não foi atualizado: ${error.message}` }, 500);
    return json({ ok: true, action: 'updated', asset: data, extracted, storagePath });
  }

  const { data, error } = await supabase.from('ativos').insert(record as any).select('*').single();
  if (error) return json({ error: `PDF armazenado, mas o ativo não foi cadastrado: ${error.message}` }, 500);
  return json({ ok: true, action: 'created', asset: data, extracted, storagePath });
}
