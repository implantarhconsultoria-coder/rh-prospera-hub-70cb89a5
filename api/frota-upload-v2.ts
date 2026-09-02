import { createClient } from '@supabase/supabase-js';

const FALLBACK_SUPABASE_URL = 'https://djfjnxmbvjgweqzjvqtr.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DHu9U7RSOV8uPwW2XXtH8A_ek7QfU_Z';
const BUCKET = 'documentos-ativos';
const MAX_FILE_BYTES = 4_000_000;
const MAX_REQUEST_BYTES = 4_400_000;

const env = (name: string) => String(process.env[name] || '').trim();
const TOPAC_SUPABASE_URL = env('VITE_SUPABASE_URL') || env('VITE_SUPABASE_UR') || FALLBACK_SUPABASE_URL;
const TOPAC_SUPABASE_KEY = env('VITE_SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_ANON_KEY') || FALLBACK_SUPABASE_PUBLISHABLE_KEY;

const sendJson = (res: any, status: number, body: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
};

const bearer = (req: any) =>
  String(req?.headers?.authorization || req?.headers?.Authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';

const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const normalizePlate = (value: unknown) =>
  normalizeText(value).replace(/[^A-Z0-9]/g, '').match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/)?.[0] || '';
const normalizeRenavam = (value: unknown) => String(value || '').replace(/\D/g, '').match(/\d{9,11}/)?.[0] || '';
const normalizeChassi = (value: unknown) =>
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

type MultipartPart = { name: string; filename?: string; contentType?: string; data: Buffer };

export const parseMultipartBody = (body: Buffer, contentTypeHeader: string): MultipartPart[] => {
  const boundaryMatch = contentTypeHeader.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = String(boundaryMatch?.[1] || boundaryMatch?.[2] || '').trim();
  if (!boundary) throw new Error('Boundary multipart não encontrado.');

  const marker = Buffer.from(`--${boundary}`);
  const separator = Buffer.from('\r\n\r\n');
  const parts: MultipartPart[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const start = body.indexOf(marker, cursor);
    if (start < 0) break;
    let partStart = start + marker.length;
    if (body.slice(partStart, partStart + 2).toString() === '--') break;
    if (body.slice(partStart, partStart + 2).toString() === '\r\n') partStart += 2;
    const headerEnd = body.indexOf(separator, partStart);
    if (headerEnd < 0) break;
    const nextBoundary = body.indexOf(marker, headerEnd + separator.length);
    if (nextBoundary < 0) break;

    const headerText = body.slice(partStart, headerEnd).toString('utf8');
    let dataEnd = nextBoundary;
    if (body.slice(dataEnd - 2, dataEnd).toString() === '\r\n') dataEnd -= 2;
    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || '';
    const name = disposition.match(/name="([^"]+)"/i)?.[1] || '';
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || undefined;
    const contentType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim();
    if (name) parts.push({ name, filename, contentType, data: body.slice(headerEnd + separator.length, dataEnd) });
    cursor = nextBoundary + marker.length;
  }
  return parts;
};

const readRawBody = async (req: any) => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_REQUEST_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

const extractPdfText = async (bytes: Buffer) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
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

export const parseVehiclePdfTextV2 = (text: string, fileName = 'documento.pdf') => {
  const all = normalizeText(`${fileName}\n${text || ''}`);
  const placa =
    normalizePlate(all.match(/\bPLACA\b[^A-Z0-9]{0,20}([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/i)?.[1] || '') ||
    normalizePlate(fileName) ||
    normalizePlate(all);
  const renavam =
    normalizeRenavam(all.match(/\bRENAVAM\b[^0-9]{0,30}(\d[\d.\s-]{7,16})/i)?.[1] || '') ||
    normalizeRenavam(all.match(/\b(\d{11})\b/)?.[1] || '');
  const chassi =
    normalizeChassi(all.match(/\b(?:CHASSI|VIN)\b[^A-Z0-9]{0,30}([A-HJ-NPR-Z0-9]{17})/i)?.[1] || '') ||
    normalizeChassi(all.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)?.[1] || '');
  const pair = all.match(/\b((?:19|20)\d{2})\s*[/\-]\s*((?:19|20)\d{2})\b/);
  const anoFabricacao = normalizeYear(
    all.match(/\b(?:ANO\s*(?:DE\s*)?FABRICACAO|ANO\s*FAB|FABRICACAO)\b[^0-9]{0,20}((?:19|20)\d{2})/i)?.[1] || pair?.[1] || '',
  );
  const anoModelo = normalizeYear(
    all.match(/\b(?:ANO\s*(?:DO\s*)?MODELO|ANO\s*MOD)\b[^0-9]{0,20}((?:19|20)\d{2})/i)?.[1] || pair?.[2] || anoFabricacao,
  );
  const patrimonio = normalizePatrimonio(
    first(
      all.match(/\bPATRIMONIO\b\s*(?:N[Oº.]*)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9./-]{1,29})\b/i)?.[1],
      all.match(/\b([A-Z]\d{1,3}\.\d{1,5})\b/i)?.[1],
      fileName.match(/\b([A-Z]\d{1,3}\.\d{1,5})\b/i)?.[1],
    ),
  );
  const modelo = first(
    all.match(/\bMARCA\s*\/?\s*MODELO\b\s*[:\-]?\s*([A-Z0-9][A-Z0-9 .\/-]{1,70}?)(?=\s+\b(?:PLACA|RENAVAM|CHASSI|ANO|COR|CATEGORIA|PATRIMONIO)\b|$)/i)?.[1],
    all.match(/\bMODELO\s*\/?\s*VERSAO\b\s*[:\-]?\s*([A-Z0-9][A-Z0-9 .\/-]{1,70}?)(?=\s+\b(?:PLACA|RENAVAM|CHASSI|ANO|COR|CATEGORIA|PATRIMONIO)\b|$)/i)?.[1],
  );
  const equipamento = /\b(COMPRESSOR|GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE\s+DE\s+ILUMINACAO|MOTOCOMPRESSOR)\b/.test(all);
  const tipo = equipamento ? 'equipamento' : 'veiculo';
  return {
    placa,
    renavam,
    chassi,
    ano_fabricacao: anoFabricacao,
    ano_modelo: anoModelo,
    patrimonio,
    identificacao_ativo: first(patrimonio, placa, modelo, fileName.replace(/\.pdf$/i, '')),
    descricao: modelo ? `${equipamento ? 'EQUIPAMENTO' : 'CARRO'} - ${modelo}` : equipamento ? 'EQUIPAMENTO' : 'CARRO',
    empresa: 'TOPAC MATRIZ',
    modelo,
    tipo_veiculo: equipamento ? 'equipamento' : 'carro',
    tipo,
  };
};

const validateUser = async (accessToken: string) => {
  const response = await fetch(`${TOPAC_SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: { apikey: TOPAC_SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) {
    const detail = String(payload?.msg || payload?.message || payload?.error_description || '').trim();
    throw new Error(detail ? `Sessão recusada pelo Supabase: ${detail}` : 'Sessão inválida ou expirada. Faça login novamente.');
  }
  return payload as { id: string; email?: string };
};

const createUserClient = (accessToken: string) =>
  createClient(TOPAC_SUPABASE_URL, TOPAC_SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}`, 'X-Client-Info': 'topac-rh-pro-serverless' } },
  });

const parseClientExtraction = (part?: MultipartPart) => {
  if (!part?.data?.length) return {};
  try {
    return JSON.parse(part.data.toString('utf8')) || {};
  } catch {
    return {};
  }
};

const mergeExtraction = (serverData: any, clientData: any, fileName: string) => {
  const placa = normalizePlate(first(serverData?.placa, clientData?.placa, fileName));
  const renavam = normalizeRenavam(first(serverData?.renavam, clientData?.renavam));
  const chassi = normalizeChassi(first(serverData?.chassi, clientData?.chassi));
  const anoFabricacao = normalizeYear(first(serverData?.ano_fabricacao, clientData?.ano_fabricacao, clientData?.ano));
  const anoModelo = normalizeYear(first(serverData?.ano_modelo, clientData?.ano_modelo, clientData?.ano, anoFabricacao));
  const patrimonio = normalizePatrimonio(first(serverData?.patrimonio, clientData?.patrimonio));
  const descricao = first(clientData?.descricao, serverData?.descricao, clientData?.modelo, serverData?.modelo, patrimonio, placa, 'ATIVO');
  const context = normalizeText(`${descricao} ${serverData?.tipo || ''} ${clientData?.tipo || ''} ${clientData?.tipo_veiculo || ''}`);
  const equipamento = /\b(COMPRESSOR|GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE|MOTOCOMPRESSOR)\b/.test(context) || serverData?.tipo === 'equipamento';
  return {
    placa,
    renavam,
    chassi,
    ano_fabricacao: anoFabricacao,
    ano_modelo: anoModelo,
    patrimonio,
    descricao,
    empresa: first(clientData?.empresa, serverData?.empresa, 'TOPAC MATRIZ'),
    marca: first(clientData?.marca, serverData?.marca),
    modelo: first(clientData?.modelo, clientData?.marca_modelo, serverData?.modelo),
    cor: first(clientData?.cor, serverData?.cor),
    categoria_veiculo: first(clientData?.categoria_veiculo, serverData?.categoria_veiculo),
    tipo_veiculo: first(clientData?.tipo_veiculo, serverData?.tipo_veiculo, equipamento ? 'equipamento' : 'carro'),
    observacao: first(clientData?.observacao, serverData?.observacao),
    tipo: equipamento ? 'equipamento' : 'veiculo',
  };
};

const storagePathFromUrl = (value: unknown) => {
  const raw = String(value || '').trim();
  const marker = `/${BUCKET}/`;
  const index = raw.indexOf(marker);
  return index >= 0 ? decodeURIComponent(raw.slice(index + marker.length)) : '';
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  const accessToken = bearer(req);
  if (!accessToken) return sendJson(res, 401, { ok: false, error: 'Sessão não informada. Atualize a página e tente novamente.' });

  let user: { id: string; email?: string };
  try {
    user = await validateUser(accessToken);
  } catch (error: any) {
    console.error('[frota-upload-v2] autenticação:', error?.message || error);
    return sendJson(res, 401, { ok: false, error: error?.message || 'Sessão inválida ou expirada. Faça login novamente.' });
  }

  let body: Buffer;
  try {
    body = await readRawBody(req);
  } catch (error: any) {
    return sendJson(res, error?.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400, {
      ok: false,
      error: error?.message === 'PAYLOAD_TOO_LARGE' ? 'PDF acima do limite da Function.' : 'Não foi possível ler o multipart/form-data.',
    });
  }

  let parts: MultipartPart[];
  try {
    parts = parseMultipartBody(body, String(req?.headers?.['content-type'] || ''));
  } catch (error: any) {
    return sendJson(res, 400, { ok: false, error: `Upload multipart inválido: ${error?.message || error}` });
  }

  const filePart = parts.find((part) => part.name === 'file');
  const extractedPart = parts.find((part) => part.name === 'extracted');
  if (!filePart?.data?.length) return sendJson(res, 400, { ok: false, error: 'PDF não recebido.' });
  const fileName = cleanFileName(filePart.filename || 'documento.pdf');
  if (!fileName.toLowerCase().endsWith('.pdf') && !String(filePart.contentType || '').toLowerCase().includes('application/pdf')) {
    return sendJson(res, 415, { ok: false, error: 'Somente arquivos PDF são aceitos.' });
  }
  if (filePart.data.length > MAX_FILE_BYTES) return sendJson(res, 413, { ok: false, error: 'PDF acima de 4 MB. Use o envio direto ao Storage.' });

  const clientData = parseClientExtraction(extractedPart);
  let pdfText = '';
  let serverData: any = {};
  try {
    pdfText = await extractPdfText(filePart.data);
    serverData = parseVehiclePdfTextV2(pdfText, fileName);
  } catch (error: any) {
    console.warn('[frota-upload-v2] PDF sem texto estruturado:', error?.message || error);
    serverData = parseVehiclePdfTextV2('', fileName);
  }
  const extracted = mergeExtraction(serverData, clientData, fileName);
  if (!extracted.placa && !extracted.patrimonio) {
    return sendJson(res, 422, { ok: false, error: 'PDF recebido, mas Placa/Patrimônio não foram identificados. Confira se o documento está legível.' });
  }

  const supabase = createUserClient(accessToken);
  const storagePath = `${user.id}/frota/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${fileName}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, filePart.data, {
    contentType: 'application/pdf', cacheControl: '3600', upsert: false,
  });
  if (uploadError) return sendJson(res, 422, { ok: false, error: `Falha ao salvar PDF no Supabase Storage: ${uploadError.message}` });

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = String(publicData?.publicUrl || '').trim();
  let existing: any = null;
  if (extracted.placa) {
    const result = await supabase.from('ativos').select('id,arquivo_url,documento_url').eq('placa', extracted.placa).in('tipo', ['veiculo', 'equipamento']).maybeSingle();
    if (!result.error) existing = result.data;
  }
  if (!existing && extracted.patrimonio) {
    const result = await supabase.from('ativos').select('id,arquivo_url,documento_url').eq('patrimonio', extracted.patrimonio).in('tipo', ['veiculo', 'equipamento']).maybeSingle();
    if (!result.error) existing = result.data;
  }

  const record: any = {
    user_id: user.id,
    tipo: extracted.tipo,
    descricao: extracted.descricao,
    placa: extracted.placa || null,
    patrimonio: extracted.patrimonio || null,
    renavam: extracted.renavam || null,
    chassi: extracted.chassi || null,
    ano_fabricacao: extracted.ano_fabricacao || null,
    ano_modelo: extracted.ano_modelo || null,
    empresa: extracted.empresa || 'TOPAC MATRIZ',
    arquivo_url: publicUrl,
    documento_url: publicUrl,
    documento_nome: fileName,
    documento_atualizado_em: new Date().toISOString(),
    observacao: extracted.observacao || null,
    status: 'ativo',
    marca: extracted.marca || '',
    modelo: extracted.modelo || '',
    cor: extracted.cor || '',
    categoria_veiculo: extracted.categoria_veiculo || '',
    tipo_veiculo: extracted.tipo_veiculo || (extracted.tipo === 'equipamento' ? 'equipamento' : 'carro'),
  };

  const result = existing?.id
    ? await supabase.from('ativos').update(record).eq('id', existing.id).select('*').single()
    : await supabase.from('ativos').insert(record).select('*').single();

  if (result.error || !result.data) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return sendJson(res, 422, { ok: false, error: `PDF lido, mas o ativo não foi gravado: ${result.error?.message || 'erro desconhecido'}`, extracted });
  }

  if (existing?.id) {
    const oldPath = storagePathFromUrl(existing.documento_url || existing.arquivo_url);
    if (oldPath && oldPath !== storagePath) await supabase.storage.from(BUCKET).remove([oldPath]);
  }

  return sendJson(res, 200, {
    ok: true,
    action: existing?.id ? 'atualizado' : 'cadastrado',
    record: result.data,
    extracted,
    pdfTextFound: Boolean(pdfText),
  });
}

export const config = { api: { bodyParser: false } };
