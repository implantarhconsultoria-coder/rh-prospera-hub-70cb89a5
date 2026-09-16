import { digits, getServiceClient, randomToken, readBody, sendJson } from '../src/server/payrollServer.js';

const BUCKET = 'documentos-admissionais';
const DEFAULT_REQUIREMENTS = [
  { tipo: 'documento_identificacao', label: 'Documento de identificação com CPF (RG ou CNH)', obrigatorio: true },
  { tipo: 'comprovante_endereco', label: 'Comprovante de endereço', obrigatorio: true },
  { tipo: 'ctps', label: 'CTPS Digital', obrigatorio: true },
  { tipo: 'pis_nis', label: 'PIS / NIS', obrigatorio: true },
  { tipo: 'titulo_eleitoral', label: 'Título de eleitor', obrigatorio: true },
];

const getHeader = (req:any, name:string) => typeof req?.headers?.get === 'function'
  ? req.headers.get(name)
  : req?.headers?.[name] || req?.headers?.[name.toLowerCase()] || '';
const getBearer = (req:any) => String(getHeader(req, 'authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
const clean = (value:unknown) => String(value ?? '').trim();
const safeName = (value:unknown) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 120) || 'arquivo';
const isoDate = (value:unknown) => /^\d{4}-\d{2}-\d{2}$/.test(clean(value)) ? clean(value) : null;
const allowedCandidateFields = ['nome','cpf','rg','data_nascimento','endereco','email','celular','filiacao','escolaridade'] as const;

const validateAdmin = async (req:any, service:any) => {
  const token = getBearer(req);
  if (!token) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  const { data:{ user }, error } = await service.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  const { data: roles, error: roleError } = await service.from('user_roles').select('role').eq('user_id', user.id);
  if (roleError) throw roleError;
  if (!(roles || []).some((r:any) => ['admin','diretor_geral'].includes(String(r.role)))) {
    throw Object.assign(new Error('sem_permissao'), { status: 403 });
  }
  return user;
};

const originFor = (req:any) => {
  const forwardedProto = clean(getHeader(req, 'x-forwarded-proto')) || 'https';
  const forwardedHost = clean(getHeader(req, 'x-forwarded-host')) || clean(getHeader(req, 'host')) || 'topacrh.pro';
  return `${forwardedProto}://${forwardedHost}`;
};

const loadRequest = async (service:any, token:string) => {
  if (!token || token.length < 20) throw Object.assign(new Error('link_invalido'), { status: 404 });
  const { data: request, error } = await service.from('pre_cadastro_solicitacoes_documentos').select('*').eq('token', token).maybeSingle();
  if (error) throw error;
  if (!request || request.status === 'cancelado') throw Object.assign(new Error('link_invalido'), { status: 404 });
  if (new Date(request.expires_at).getTime() < Date.now() && request.status !== 'concluido') throw Object.assign(new Error('link_expirado'), { status: 410 });
  const { data: pre, error: preError } = await service.from('pre_cadastros_admissionais').select('*').eq('id', request.pre_cadastro_id).maybeSingle();
  if (preError) throw preError;
  if (!pre) throw Object.assign(new Error('pre_cadastro_nao_encontrado'), { status: 404 });
  return { request, pre };
};

const listDocs = async (service:any, preCadastroId:string) => {
  const { data, error } = await service.from('pre_cadastro_documentos')
    .select('id,tipo_documento,nome_arquivo,arquivo_url,status,created_at')
    .eq('pre_cadastro_id', preCadastroId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

const publicState = async (service:any, token:string) => {
  const { request, pre } = await loadRequest(service, token);
  const documentos = await listDocs(service, pre.id);
  if (!request.iniciado_em && request.status === 'pendente') {
    await service.from('pre_cadastro_solicitacoes_documentos').update({ iniciado_em: new Date().toISOString(), status: 'em_preenchimento', updated_at: new Date().toISOString() }).eq('id', request.id);
    request.status = 'em_preenchimento';
  }
  return {
    id: request.id,
    status: request.status,
    requisitos: Array.isArray(request.requisitos) ? request.requisitos : DEFAULT_REQUIREMENTS,
    concluido_em: request.concluido_em,
    aso_gerado_em: request.aso_gerado_em,
    candidato: {
      nome: pre.nome || '', cpf: pre.cpf || '', rg: pre.rg || '', data_nascimento: pre.data_nascimento || '',
      endereco: pre.endereco || '', email: pre.email || '', celular: pre.celular || request.telefone || '',
      filiacao: pre.filiacao || '', escolaridade: pre.escolaridade || '', empresa_nome: pre.empresa_nome || '', cnpj: pre.cnpj || '',
      funcao: pre.funcao || '', setor_ghe: pre.setor_ghe || '', obra_local: pre.obra_local || '', data_admissao: pre.data_admissao || '',
      tipo_admissao: pre.tipo_admissao || 'Admissional', exige_toxicologico: !!pre.exige_toxicologico,
    },
    documentos: documentos.map((d:any) => ({ tipo: d.tipo_documento, nome: d.nome_arquivo, url: d.arquivo_url, status: d.status, created_at: d.created_at })),
  };
};

const resolvePreCadastroForAdmin = async (service:any, body:any) => {
  if (clean(body.preCadastroId)) {
    const { data, error } = await service.from('pre_cadastros_admissionais').select('*').eq('id', clean(body.preCadastroId)).maybeSingle();
    if (error) throw error;
    return data;
  }
  const targetCpf = digits(body.cpf);
  if (!targetCpf) return null;
  const { data, error } = await service.from('pre_cadastros_admissionais').select('*').order('updated_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []).find((row:any) => digits(row.cpf) === targetCpf) || null;
};

export default async function handler(req:any, res?:any) {
  if (String(req?.method || 'POST').toUpperCase() !== 'POST') return sendJson(res, { ok:false, error:'method_not_allowed' }, 405);
  try {
    const service = getServiceClient();
    const body = readBody(req);
    const action = clean(body.action);

    if (action === 'admin_create') {
      await validateAdmin(req, service);
      const pre = await resolvePreCadastroForAdmin(service, body);
      if (!pre?.id) return sendJson(res, { ok:false, error:'pre_cadastro_nao_encontrado' }, 404);
      const telefone = digits(body.telefone || pre.celular);
      if (telefone.length < 10) return sendJson(res, { ok:false, error:'celular_candidato_obrigatorio' }, 400);
      const { data: existing, error: existingError } = await service.from('pre_cadastro_solicitacoes_documentos').select('*').eq('pre_cadastro_id', pre.id).maybeSingle();
      if (existingError) throw existingError;
      const now = new Date().toISOString();
      let request:any = existing;
      if (!request) {
        const { data, error } = await service.from('pre_cadastro_solicitacoes_documentos').insert({
          pre_cadastro_id: pre.id, token: randomToken(), telefone, status: 'pendente', requisitos: DEFAULT_REQUIREMENTS,
          enviado_em: now, expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), updated_at: now,
        }).select('*').single();
        if (error) throw error;
        request = data;
      } else {
        const patch:any = { telefone, enviado_em: now, updated_at: now };
        if (request.status === 'cancelado' || (new Date(request.expires_at).getTime() < Date.now() && request.status !== 'concluido')) {
          patch.token = randomToken(); patch.status = 'pendente'; patch.iniciado_em = null; patch.concluido_em = null; patch.aso_gerado_em = null;
          patch.expires_at = new Date(Date.now() + 30 * 86400000).toISOString();
        }
        const { data, error } = await service.from('pre_cadastro_solicitacoes_documentos').update(patch).eq('id', request.id).select('*').single();
        if (error) throw error;
        request = data;
      }
      if (telefone !== digits(pre.celular)) await service.from('pre_cadastros_admissionais').update({ celular: telefone, updated_at: now }).eq('id', pre.id);
      const url = `${originFor(req)}/pre-cadastro/documentos/${request.token}`;
      return sendJson(res, { ok:true, url, telefone, nome:pre.nome || '', status:request.status, expires_at:request.expires_at });
    }

    const token = clean(body.token);
    if (action === 'state') return sendJson(res, { ok:true, ...(await publicState(service, token)) });

    const { request, pre } = await loadRequest(service, token);
    if (request.status === 'concluido' && !['state','register_aso'].includes(action)) {
      return sendJson(res, { ok:false, error:'processo_ja_concluido' }, 409);
    }

    if (action === 'save_fields') {
      const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
      const patch:any = {};
      for (const key of allowedCandidateFields) {
        if (!(key in fields)) continue;
        if (key === 'data_nascimento') patch[key] = isoDate(fields[key]);
        else patch[key] = clean(fields[key]).slice(0, key === 'endereco' ? 300 : 180);
      }
      if (patch.cpf) patch.cpf = digits(patch.cpf).slice(0, 11);
      if (patch.celular) patch.celular = digits(patch.celular).slice(0, 13);
      patch.updated_at = new Date().toISOString();
      const { error } = await service.from('pre_cadastros_admissionais').update(patch).eq('id', pre.id);
      if (error) throw error;
      await service.from('pre_cadastro_solicitacoes_documentos').update({
        dados_candidato: { ...(request.dados_candidato || {}), ...patch }, status: 'em_preenchimento', iniciado_em: request.iniciado_em || new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', request.id);
      return sendJson(res, { ok:true });
    }

    if (action === 'create_upload') {
      const requisitos = Array.isArray(request.requisitos) ? request.requisitos : DEFAULT_REQUIREMENTS;
      const allowed = new Set([...requisitos.map((r:any) => clean(r.tipo)), 'guia_aso']);
      const tipo = clean(body.tipo);
      if (!allowed.has(tipo)) return sendJson(res, { ok:false, error:'tipo_documento_invalido' }, 400);
      const name = safeName(body.fileName);
      const path = `candidato/${request.id}/${tipo}/${Date.now()}-${name}`;
      const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data?.token) throw error || new Error('falha_upload_assinado');
      const publicUrl = service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      return sendJson(res, { ok:true, bucket:BUCKET, path, uploadToken:data.token, publicUrl });
    }

    if (action === 'register_upload') {
      const tipo = clean(body.tipo);
      const path = clean(body.path);
      const requisitos = Array.isArray(request.requisitos) ? request.requisitos : DEFAULT_REQUIREMENTS;
      const allowed = new Set([...requisitos.map((r:any) => clean(r.tipo)), 'guia_aso']);
      if (!allowed.has(tipo) || !path.startsWith(`candidato/${request.id}/${tipo}/`)) return sendJson(res, { ok:false, error:'upload_invalido' }, 400);
      const publicUrl = service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const nome = safeName(body.fileName || path.split('/').pop());
      const { error: deleteError } = await service.from('pre_cadastro_documentos').delete().eq('pre_cadastro_id', pre.id).eq('tipo_documento', tipo);
      if (deleteError) throw deleteError;
      const { error } = await service.from('pre_cadastro_documentos').insert({
        pre_cadastro_id: pre.id, tipo_documento: tipo, nome_arquivo: nome, arquivo_url: publicUrl,
        status: tipo === 'guia_aso' ? 'gerado_automaticamente' : 'recebido', dados_extraidos: { origem: 'link_candidato', solicitacao_id: request.id },
      });
      if (error) throw error;
      await service.from('pre_cadastro_solicitacoes_documentos').update({ status:'em_preenchimento', iniciado_em:request.iniciado_em || new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id',request.id);
      return sendJson(res, { ok:true, url:publicUrl });
    }

    if (action === 'finalize') {
      const latest = await publicState(service, token);
      const requisitos:any[] = Array.isArray(latest.requisitos) ? latest.requisitos : DEFAULT_REQUIREMENTS;
      const tipos = new Set((latest.documentos || []).map((d:any) => clean(d.tipo)));
      const faltando = requisitos.filter((r:any) => r.obrigatorio && !tipos.has(clean(r.tipo))).map((r:any) => r.label);
      const c:any = latest.candidato || {};
      const camposFaltando = [
        ['Nome completo', clean(c.nome)], ['CPF', digits(c.cpf).length === 11 ? c.cpf : ''], ['Data de nascimento', clean(c.data_nascimento)],
        ['Endereço', clean(c.endereco)], ['Celular', digits(c.celular).length >= 10 ? c.celular : ''],
      ].filter(([,value]) => !value).map(([label]) => label);
      if (faltando.length || camposFaltando.length) return sendJson(res, { ok:false, error:'pendencias_obrigatorias', documentos:faltando, campos:camposFaltando }, 400);
      const now = new Date().toISOString();
      const currentHistory = Array.isArray(pre.historico) ? pre.historico : [];
      const conference = { ...(pre.conferencia || {}), candidato_documentos: { status:'concluido', concluido_em:now, solicitacao_id:request.id } };
      const { error: preError } = await service.from('pre_cadastros_admissionais').update({
        status:'aguardando_aso', conferencia:conference, historico:[...currentHistory,{ em:now, acao:'documentacao_candidato_concluida_via_link' }], updated_at:now,
      }).eq('id',pre.id);
      if (preError) throw preError;
      const { error:reqError } = await service.from('pre_cadastro_solicitacoes_documentos').update({ status:'concluido', concluido_em:now, updated_at:now }).eq('id',request.id);
      if (reqError) throw reqError;
      return sendJson(res, { ok:true, concluido_em:now, candidato:latest.candidato, aso_ready:!!(clean(c.empresa_nome) && clean(c.funcao) && digits(c.cpf).length===11) });
    }

    if (action === 'register_aso') {
      const path = clean(body.path);
      if (!path.startsWith(`candidato/${request.id}/guia_aso/`)) return sendJson(res,{ok:false,error:'guia_aso_invalida'},400);
      const publicUrl = service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const now = new Date().toISOString();
      const { error:delError } = await service.from('pre_cadastro_documentos').delete().eq('pre_cadastro_id', pre.id).eq('tipo_documento','guia_aso');
      if (delError) throw delError;
      const { error:docError } = await service.from('pre_cadastro_documentos').insert({ pre_cadastro_id:pre.id,tipo_documento:'guia_aso',nome_arquivo:safeName(body.fileName || 'GUIA_ASO.pdf'),arquivo_url:publicUrl,status:'gerado_automaticamente',dados_extraidos:{origem:'finalizacao_candidato',solicitacao_id:request.id,gerado_em:now} });
      if (docError) throw docError;
      await service.from('pre_cadastro_solicitacoes_documentos').update({ aso_gerado_em:now, updated_at:now }).eq('id',request.id);
      const conference = { ...(pre.conferencia || {}), guia_aso: { gerada_automaticamente_em:now, arquivo_url:publicUrl } };
      await service.from('pre_cadastros_admissionais').update({ conferencia:conference, updated_at:now }).eq('id',pre.id);
      return sendJson(res,{ok:true,url:publicUrl,gerado_em:now});
    }

    return sendJson(res, { ok:false, error:'acao_invalida' }, 400);
  } catch (error:any) {
    const status = Number(error?.status) || 500;
    console.error('[pre-cadastro-candidato]', error);
    return sendJson(res, { ok:false, error:clean(error?.message || 'erro_interno') }, status);
  }
}
