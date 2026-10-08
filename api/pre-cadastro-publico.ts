import { randomUUID } from 'node:crypto';
import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';

const BUCKET = 'pre-cadastro-publico';
const EDITABLE_STATUS = new Set(['cadastro_em_preenchimento', 'correcao_solicitada']);
const clean = (value: unknown) => String(value ?? '').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const safeFileName = (value: unknown) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 120) || 'arquivo';
const safeDocType = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 60) || 'documento';
const jsonObject = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const jsonArray = (value: unknown) => Array.isArray(value) ? value : [];

const queryValue = (req: any, key: string) => {
  const value = req?.query?.[key];
  return Array.isArray(value) ? clean(value[0]) : clean(value);
};

const headerValue = (req: any, key: string) => clean(req?.headers?.[key] || req?.headers?.get?.(key));

const tokenFromReferer = (req: any) => {
  const referer = headerValue(req, 'referer');
  if (!referer) return '';
  try {
    return clean(new URL(referer).searchParams.get('token'));
  } catch {
    return '';
  }
};

const requestOrigin = (req: any) => {
  const proto = clean(req?.headers?.['x-forwarded-proto'] || req?.headers?.get?.('x-forwarded-proto') || 'https').split(',')[0];
  const host = clean(req?.headers?.['x-forwarded-host'] || req?.headers?.host || req?.headers?.get?.('host'));
  return host ? `${proto}://${host}` : 'https://topacrh.pro';
};

const findByToken = async (service: any, token: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data, error } = await service.from('pre_cadastros_admissionais').select('*').eq('public_token', token).maybeSingle();
  if (error) throw error;
  return data;
};

const candidatePayload = (pre: any, docs: any[]) => ({
  id: pre.id,
  token: pre.public_token,
  status: pre.status,
  etapa: Number(pre.candidato_etapa || 1),
  candidato: jsonObject(pre.candidato_dados),
  banco: jsonObject(pre.dados_bancarios),
  transporte: jsonObject(pre.transporte),
  ctpsTipo: clean(pre.ctps_tipo),
  pendencias: jsonArray(pre.pendencias_documentais),
  correcao: pre.correcao_solicitada || null,
  finalizadoEm: pre.public_completed_at || null,
  documentos: (docs || []).map((doc: any) => ({
    id: doc.id,
    tipo: doc.tipo_documento,
    nome: doc.nome_arquivo,
    mimeType: doc.mime_type,
    obrigatorio: !!doc.obrigatorio,
    entregarDepois: !!doc.entregar_depois,
    createdAt: doc.created_at,
    url: doc.arquivo_url,
  })),
});

const loadCandidate = async (service: any, token: string) => {
  const pre = await findByToken(service, token);
  if (!pre) return null;
  const { data: docs, error } = await service.from('pre_cadastro_documentos')
    .select('id,tipo_documento,nome_arquivo,mime_type,obrigatorio,entregar_depois,created_at,arquivo_url')
    .eq('pre_cadastro_id', pre.id)
    .eq('origem', 'candidato')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return candidatePayload(pre, docs || []);
};

const validateFinal = async (service: any, pre: any) => {
  const c = jsonObject(pre.candidato_dados);
  const b = jsonObject(pre.dados_bancarios);
  const t = jsonObject(pre.transporte);
  const missing: string[] = [];
  const requiredFields: Array<[string, unknown]> = [
    ['Nome completo', c.nome], ['CPF', c.cpf], ['RG', c.rg], ['Data de nascimento', c.data_nascimento],
    ['Estado civil', c.estado_civil], ['Celular/WhatsApp', c.celular], ['E-mail', c.email],
    ['Nome da mãe', c.nome_mae], ['CEP', c.cep], ['Rua', c.rua], ['Número', c.numero], ['Bairro', c.bairro], ['Cidade', c.cidade], ['Estado', c.estado],
    ['Banco', b.banco], ['Agência', b.agencia], ['Conta', b.conta], ['Tipo de conta', b.tipo_conta], ['Titular da conta', b.titular], ['CPF do titular', b.cpf_titular], ['Chave PIX', b.pix], ['Tipo da chave PIX', b.tipo_pix],
    ['Tipo de CTPS', pre.ctps_tipo],
  ];
  for (const [label, value] of requiredFields) if (!clean(value)) missing.push(label);
  if (digits(c.cpf).length !== 11) missing.push('CPF válido');
  if (digits(b.cpf_titular).length !== 11) missing.push('CPF do titular válido');

  const { data: docs, error } = await service.from('pre_cadastro_documentos')
    .select('tipo_documento,entregar_depois')
    .eq('pre_cadastro_id', pre.id)
    .eq('origem', 'candidato');
  if (error) throw error;
  const types = new Set((docs || []).filter((d: any) => !d.entregar_depois).map((d: any) => clean(d.tipo_documento)));
  if (!types.has('documento_identificacao')) missing.push('Documento de identificação');
  if (!types.has('comprovante_residencia')) missing.push('Comprovante de residência');
  if (!types.has('ctps')) missing.push('Carteira de Trabalho');
  if (!c.cpf_no_documento && !types.has('cpf')) missing.push('Documento/Comprovante de CPF');
  if (c.tem_dependentes && !types.has('dependentes')) missing.push('Documentos dos dependentes');

  const usaVt = t.usa_vt !== false;
  if (usaVt) {
    const ida = jsonObject(t.ida); const volta = jsonObject(t.volta);
    const sum = (obj: Record<string, any>) => ['onibus','metro','trem','intermunicipal'].reduce((acc, key) => acc + Math.max(0, Number(obj[key] || 0)), 0);
    if (sum(ida) <= 0) missing.push('Condução de ida');
    if (sum(volta) <= 0) missing.push('Condução de volta');
  }
  return [...new Set(missing)];
};

const handleDownload = async (req: any, res: any, service: any) => {
  const token = queryValue(req, 'token');
  const documentId = queryValue(req, 'download');
  const pre = await findByToken(service, token);
  if (!pre || !documentId) return sendJson(res, { ok: false, error: 'arquivo_nao_encontrado' }, 404);
  const { data: doc, error } = await service.from('pre_cadastro_documentos')
    .select('id,pre_cadastro_id,nome_arquivo,storage_bucket,storage_path,mime_type')
    .eq('id', documentId).eq('pre_cadastro_id', pre.id).maybeSingle();
  if (error) throw error;
  if (!doc?.storage_path) return sendJson(res, { ok: false, error: 'arquivo_nao_encontrado' }, 404);
  const { data, error: downloadError } = await service.storage.from(doc.storage_bucket || BUCKET).download(doc.storage_path);
  if (downloadError || !data) throw downloadError || new Error('falha_download');
  const buffer = Buffer.from(await data.arrayBuffer());
  if (typeof res?.setHeader === 'function') {
    res.setHeader('Content-Type', doc.mime_type || data.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName(doc.nome_arquivo)}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  }
  if (typeof res?.status === 'function') return res.status(200).send(buffer);
  return new Response(buffer, { status: 200, headers: { 'Content-Type': doc.mime_type || data.type || 'application/octet-stream', 'Cache-Control': 'private, no-store' } });
};

export default async function handler(req: any, res?: any) {
  const method = String(req?.method || 'POST').toUpperCase();
  try {
    const service = getServiceClient();
    if (method === 'GET' && queryValue(req, 'download')) return await handleDownload(req, res, service);
    if (method !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);

    const body = readBody(req) || {};
    const action = clean(body.action).toLowerCase();

    if (action === 'start') {
      const explicitToken = tokenFromReferer(req);
      if (explicitToken) return sendJson(res, { ok: false, error: 'link_invalido_ou_inexistente' }, 404);
      const now = new Date().toISOString();
      const { data, error } = await service.from('pre_cadastros_admissionais').insert({
        status: 'cadastro_em_preenchimento', origem_cadastro: 'link_publico', public_started_at: now, public_last_saved_at: now,
        dados_extraidos: { origem: 'link_publico', iniciado_em: now }, historico: [{ em: now, acao: 'cadastro_publico_iniciado' }],
      }).select('id,public_token').single();
      if (error) throw error;
      await service.from('pre_cadastro_eventos').insert({ pre_cadastro_id: data.id, tipo: 'cadastro_iniciado', descricao: 'Candidato iniciou o pré-cadastro pelo link público.' });
      return sendJson(res, { ok: true, token: data.public_token, id: data.id });
    }

    const token = clean(body.token);
    const pre = await findByToken(service, token);
    if (!pre) return sendJson(res, { ok: false, error: 'cadastro_nao_encontrado' }, 404);

    if (action === 'load') {
      const now = new Date().toISOString();
      const patch: Record<string, any> = {};
      if (!pre.public_seen_at) patch.public_seen_at = now;
      if (!pre.public_started_at) patch.public_started_at = now;
      if (Object.keys(patch).length) {
        patch.updated_at = now;
        const { error: patchError } = await service.from('pre_cadastros_admissionais').update(patch).eq('id', pre.id);
        if (patchError) throw patchError;
        if (!pre.public_seen_at) {
          await service.from('pre_cadastro_eventos').insert({
            pre_cadastro_id: pre.id,
            tipo: 'link_acessado',
            descricao: 'Candidato acessou o link individual de pré-cadastro.',
            dados: { canal: 'link_publico' },
          });
        }
      }
      const data = await loadCandidate(service, token);
      return sendJson(res, { ok: true, data });
    }

    if (!EDITABLE_STATUS.has(clean(pre.status))) return sendJson(res, { ok: false, error: 'cadastro_nao_editavel' }, 409);

    if (action === 'save') {
      const candidato = jsonObject(body.candidato);
      const banco = jsonObject(body.banco);
      const transporte = jsonObject(body.transporte);
      const etapa = Math.min(5, Math.max(1, Number(body.etapa || pre.candidato_etapa || 1)));
      const endereco = [candidato.rua, candidato.numero, candidato.complemento, candidato.bairro, candidato.cidade, candidato.estado, candidato.cep].map(clean).filter(Boolean).join(', ');
      const filiacao = [candidato.nome_mae ? `Mãe: ${clean(candidato.nome_mae)}` : '', candidato.nome_pai ? `Pai: ${clean(candidato.nome_pai)}` : ''].filter(Boolean).join(' | ');
      const now = new Date().toISOString();
      const update = {
        candidato_dados: candidato, dados_bancarios: banco, transporte, candidato_etapa: etapa,
        ctps_tipo: clean(body.ctpsTipo), nome: clean(candidato.nome), cpf: clean(candidato.cpf), rg: clean(candidato.rg),
        data_nascimento: clean(candidato.data_nascimento) || null, email: clean(candidato.email) || null, celular: clean(candidato.celular) || null,
        endereco, filiacao, vale_transporte: transporte.usa_vt !== false, public_started_at: pre.public_started_at || now,
        public_last_saved_at: now, updated_at: now,
      };
      const { error } = await service.from('pre_cadastros_admissionais').update(update).eq('id', pre.id);
      if (error) throw error;
      if (!pre.public_last_saved_at) {
        await service.from('pre_cadastro_eventos').insert({
          pre_cadastro_id: pre.id,
          tipo: 'preenchimento_iniciado',
          descricao: 'Candidato iniciou o preenchimento dos dados admissionais.',
          dados: { etapa },
        });
      }
      return sendJson(res, { ok: true });
    }

    if (action === 'upload-url') {
      const tipo = safeDocType(body.tipo);
      const original = safeFileName(body.fileName);
      const mimeType = clean(body.mimeType || 'application/octet-stream');
      if (!['application/pdf','image/jpeg','image/png','image/webp'].includes(mimeType)) return sendJson(res, { ok: false, error: 'tipo_arquivo_nao_permitido' }, 400);
      const path = `${token}/${tipo}/${randomUUID()}-${original}`;
      const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return sendJson(res, { ok: true, bucket: BUCKET, path, uploadToken: data.token, signedUrl: data.signedUrl });
    }

    if (action === 'attach') {
      const tipo = safeDocType(body.tipo);
      const path = clean(body.path);
      if (!path.startsWith(`${token}/${tipo}/`)) return sendJson(res, { ok: false, error: 'caminho_invalido' }, 400);
      const pendencias = jsonArray(pre.pendencias_documentais).filter((item: any) => clean(item?.tipo || item) !== tipo);
      const { data: doc, error } = await service.from('pre_cadastro_documentos').insert({
        pre_cadastro_id: pre.id, tipo_documento: tipo, nome_arquivo: safeFileName(body.fileName), arquivo_url: '', status: 'recebido',
        storage_bucket: BUCKET, storage_path: path, mime_type: clean(body.mimeType), tamanho_bytes: Number(body.size || 0) || null,
        obrigatorio: !!body.obrigatorio, entregar_depois: false, origem: 'candidato',
      }).select('id').single();
      if (error) throw error;
      const downloadUrl = `${requestOrigin(req)}/api/pre-cadastro-publico?download=${encodeURIComponent(doc.id)}&token=${encodeURIComponent(token)}`;
      await service.from('pre_cadastro_documentos').update({ arquivo_url: downloadUrl }).eq('id', doc.id);
      await service.from('pre_cadastros_admissionais').update({ pendencias_documentais: pendencias, public_last_saved_at: new Date().toISOString() }).eq('id', pre.id);
      await service.from('pre_cadastro_eventos').insert({
        pre_cadastro_id: pre.id,
        tipo: 'documentos_enviados',
        descricao: 'Candidato enviou documento pelo pré-cadastro público.',
        dados: { tipo_documento: tipo },
      });
      return sendJson(res, { ok: true, id: doc.id, url: downloadUrl });
    }

    if (action === 'remove-document') {
      const documentId = clean(body.documentId);
      const { data: doc, error } = await service.from('pre_cadastro_documentos').select('id,storage_bucket,storage_path').eq('id', documentId).eq('pre_cadastro_id', pre.id).eq('origem','candidato').maybeSingle();
      if (error) throw error;
      if (doc?.storage_path) await service.storage.from(doc.storage_bucket || BUCKET).remove([doc.storage_path]);
      if (doc?.id) await service.from('pre_cadastro_documentos').delete().eq('id', doc.id);
      return sendJson(res, { ok: true });
    }

    if (action === 'mark-pending') {
      const tipo = safeDocType(body.tipo);
      const label = clean(body.label || tipo);
      const current = jsonArray(pre.pendencias_documentais).filter((item: any) => clean(item?.tipo || item) !== tipo);
      current.push({ tipo, label, marcado_em: new Date().toISOString() });
      const { error } = await service.from('pre_cadastros_admissionais').update({ pendencias_documentais: current, public_last_saved_at: new Date().toISOString() }).eq('id', pre.id);
      if (error) throw error;
      return sendJson(res, { ok: true, pendencias: current });
    }

    if (action === 'finalize') {
      const fresh = await findByToken(service, token);
      const missing = await validateFinal(service, fresh);
      if (missing.length) return sendJson(res, { ok: false, error: 'campos_obrigatorios_pendentes', missing }, 422);
      const now = new Date().toISOString();
      const history = jsonArray(fresh.historico);
      const { error } = await service.from('pre_cadastros_admissionais').update({
        status: 'aguardando_validacao', public_completed_at: now, public_last_saved_at: now, candidato_etapa: 5,
        historico: [...history, { em: now, acao: 'pre_cadastro_publico_finalizado' }], updated_at: now,
      }).eq('id', pre.id);
      if (error) throw error;
      await service.from('pre_cadastro_eventos').insert({ pre_cadastro_id: pre.id, tipo: 'pre_cadastro_recebido', descricao: 'Novo pré-cadastro recebido do candidato.', dados: { nome: fresh.nome, cpf: fresh.cpf } });
      return sendJson(res, { ok: true, status: 'aguardando_validacao', completedAt: now });
    }

    return sendJson(res, { ok: false, error: 'acao_invalida' }, 400);
  } catch (error: any) {
    console.error('[pre-cadastro-publico]', error);
    return sendJson(res, { ok: false, error: clean(error?.message || 'erro_interno') }, Number(error?.status) || 500);
  }
}
