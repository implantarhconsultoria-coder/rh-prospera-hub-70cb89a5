import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';

const clean = (value: unknown) => String(value ?? '').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');

const getHeader = (req: any, name: string) => typeof req?.headers?.get === 'function'
  ? req.headers.get(name)
  : req?.headers?.[name] || req?.headers?.[name.toLowerCase()] || '';

const getBearer = (req: any) => clean(getHeader(req, 'authorization')).match(/^Bearer\s+(.+)$/i)?.[1] || '';

const validateAdmin = async (req: any, service: any) => {
  const token = getBearer(req);
  if (!token) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  const { data: { user }, error } = await service.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  const { data: roles, error: roleError } = await service.from('user_roles').select('role').eq('user_id', user.id);
  if (roleError) throw roleError;
  const allowed = (roles || []).some((row: any) => ['admin', 'diretor_geral'].includes(clean(row.role)));
  if (!allowed) throw Object.assign(new Error('sem_permissao'), { status: 403 });
  return user;
};

const normalizeBrazilPhone = (value: unknown) => {
  let number = digits(value);
  if ((number.length === 12 || number.length === 13) && number.startsWith('55')) number = number.slice(2);
  if (number.length !== 10 && number.length !== 11) return null;
  return { national: number, whatsapp: `55${number}` };
};

const phoneKey = (value: unknown) => normalizeBrazilPhone(value)?.national || '';

const originFor = (req: any) => {
  const proto = clean(getHeader(req, 'x-forwarded-proto')).split(',')[0] || 'https';
  const host = clean(getHeader(req, 'x-forwarded-host')).split(',')[0] || clean(getHeader(req, 'host')) || 'topacrh.pro';
  return `${proto}://${host}`;
};

const candidateUrl = (req: any, publicToken: string) => `${originFor(req)}/pre-cadastro?token=${encodeURIComponent(publicToken)}`;

const isCompleted = (row: any) => clean(row?.status) === 'cadastro_oficial';

const loadEvents = async (service: any, ids: string[]) => {
  if (!ids.length) return [];
  const { data, error } = await service.from('pre_cadastro_eventos')
    .select('pre_cadastro_id,tipo,created_at,dados')
    .in('pre_cadastro_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

const loadDocumentCounts = async (service: any, ids: string[]) => {
  if (!ids.length) return new Map<string, number>();
  const { data, error } = await service.from('pre_cadastro_documentos')
    .select('pre_cadastro_id,id')
    .in('pre_cadastro_id', ids)
    .eq('origem', 'candidato');
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data || []) counts.set(row.pre_cadastro_id, (counts.get(row.pre_cadastro_id) || 0) + 1);
  return counts;
};

const deriveInviteStatus = (row: any, events: any[], documentCount: number) => {
  if (isCompleted(row)) return 'CONCLUÍDO';
  if (row.public_completed_at) return 'EM ANÁLISE';
  if (documentCount > 0) return 'DOCUMENTOS ENVIADOS';
  if (Number(row.candidato_etapa || 1) > 1 && row.public_last_saved_at) return 'AGUARDANDO FINALIZAÇÃO';
  if (row.public_last_saved_at) return 'PREENCHIMENTO INICIADO';
  if (row.public_seen_at || row.public_started_at) return 'LINK ACESSADO';
  if (events.some(event => event.tipo === 'link_enviado')) return 'LINK ENVIADO';
  return 'LINK GERADO';
};

const decorateRows = async (service: any, req: any, rows: any[]) => {
  const ids = rows.map(row => row.id);
  const [events, docCounts] = await Promise.all([loadEvents(service, ids), loadDocumentCounts(service, ids)]);
  return rows.map(row => {
    const rowEvents = events.filter(event => event.pre_cadastro_id === row.id);
    const phone = normalizeBrazilPhone(row.celular);
    return {
      id: row.id,
      nome: row.nome || '',
      celular: phone?.national || digits(row.celular),
      whatsapp: phone?.whatsapp || '',
      public_token: row.public_token,
      url: candidateUrl(req, row.public_token),
      status: deriveInviteStatus(row, rowEvents, docCounts.get(row.id) || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
      public_seen_at: row.public_seen_at,
      public_started_at: row.public_started_at,
      public_last_saved_at: row.public_last_saved_at,
      public_completed_at: row.public_completed_at,
    };
  });
};

const findOpenByPhone = async (service: any, phone: string) => {
  const { data, error } = await service.from('pre_cadastros_admissionais')
    .select('id,nome,celular,status,public_token,created_at,updated_at,public_seen_at,public_started_at,public_last_saved_at,public_completed_at,candidato_etapa')
    .order('created_at', { ascending: false })
    .limit(250);
  if (error) throw error;
  return (data || []).find((row: any) => !isCompleted(row) && phoneKey(row.celular) === phone) || null;
};

const logEvent = async (service: any, preCadastroId: string, tipo: string, descricao: string, userId: string, dados: Record<string, unknown> = {}) => {
  const { error } = await service.from('pre_cadastro_eventos').insert({
    pre_cadastro_id: preCadastroId,
    tipo,
    descricao,
    dados,
    created_by: userId,
  });
  if (error) throw error;
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'POST').toUpperCase() !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);

  try {
    const service = getServiceClient();
    const user = await validateAdmin(req, service);
    const body = readBody(req) || {};
    const action = clean(body.action).toLowerCase();

    if (action === 'list') {
      const { data, error } = await service.from('pre_cadastros_admissionais')
        .select('id,nome,celular,status,public_token,created_at,updated_at,public_seen_at,public_started_at,public_last_saved_at,public_completed_at,candidato_etapa,dados_extraidos')
        .not('public_token', 'is', null)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      const invites = (data || []).filter((row: any) => {
        const extra = row.dados_extraidos && typeof row.dados_extraidos === 'object' ? row.dados_extraidos : {};
        return extra?.origem === 'convite_rh' || extra?.convite_rh;
      });
      return sendJson(res, { ok: true, rows: await decorateRows(service, req, invites) });
    }

    if (action === 'invite') {
      const nome = clean(body.nome).replace(/\s+/g, ' ').slice(0, 180);
      const phone = normalizeBrazilPhone(body.celular);
      if (nome.length < 2) return sendJson(res, { ok: false, error: 'nome_candidato_obrigatorio' }, 400);
      if (!phone) return sendJson(res, { ok: false, error: 'celular_invalido' }, 400);

      const existing = await findOpenByPhone(service, phone.national);
      if (existing) {
        const [decorated] = await decorateRows(service, req, [existing]);
        return sendJson(res, { ok: true, duplicate: true, existing: decorated });
      }

      const now = new Date().toISOString();
      const { data: created, error } = await service.from('pre_cadastros_admissionais').insert({
        status: 'cadastro_em_preenchimento',
        nome,
        celular: phone.national,
        criado_por: user.id,
        origem_cadastro: 'link_publico',
        candidato_etapa: 1,
        candidato_dados: { nome, celular: phone.national },
        dados_extraidos: { origem: 'convite_rh', convite_rh: { criado_em: now, criado_por: user.id } },
        historico: [{ em: now, acao: 'convite_rh_criado', nome, celular: phone.national }],
      }).select('id,nome,celular,status,public_token,created_at,updated_at,public_seen_at,public_started_at,public_last_saved_at,public_completed_at,candidato_etapa').single();
      if (error) throw error;

      await logEvent(service, created.id, 'link_gerado', 'Link individual de pré-cadastro gerado pelo RH.', user.id, { canal: 'whatsapp' });
      const [decorated] = await decorateRows(service, req, [created]);
      return sendJson(res, { ok: true, duplicate: false, candidate: decorated });
    }

    if (action === 'mark-sent') {
      const id = clean(body.id);
      if (!id) return sendJson(res, { ok: false, error: 'pre_cadastro_invalido' }, 400);
      const { data: row, error } = await service.from('pre_cadastros_admissionais')
        .select('id,nome,celular,status,public_token,created_at,updated_at,public_seen_at,public_started_at,public_last_saved_at,public_completed_at,candidato_etapa')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return sendJson(res, { ok: false, error: 'pre_cadastro_nao_encontrado' }, 404);
      await logEvent(service, id, 'link_enviado', 'WhatsApp aberto pelo RH com o link individual preparado para envio.', user.id, { canal: 'whatsapp', confirmacao_provedor: false });
      const [decorated] = await decorateRows(service, req, [row]);
      return sendJson(res, { ok: true, candidate: decorated });
    }

    return sendJson(res, { ok: false, error: 'acao_invalida' }, 400);
  } catch (error: any) {
    console.error('[pre-cadastro-convite]', error);
    return sendJson(res, { ok: false, error: clean(error?.message || 'erro_interno') }, Number(error?.status) || 500);
  }
}
