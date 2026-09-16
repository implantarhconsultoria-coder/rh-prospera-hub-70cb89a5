import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';

const BUCKET = 'contabilidade-inbox';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['ferias_aviso', 'ferias_recibo']);

const safeFile = (value: unknown) =>
  String(value || 'documento.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 140) || 'documento.pdf';

const validateSession = async (service: any, portal: string, token: string, companyId?: string) => {
  if (!['principal', 'goiania'].includes(portal) || !token) {
    throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  }

  const { data: userId, error: sessionError } = await service.rpc('contabilidade_portal_usuario_sessao', {
    p_token: token,
    p_portal: portal,
  });
  if (sessionError || !userId) throw Object.assign(new Error('sessao_invalida'), { status: 401 });

  const { data: user, error: userError } = await service
    .from('contabilidade_portal_usuarios')
    .select('id,nome,email,portal,ativo')
    .eq('id', userId)
    .eq('ativo', true)
    .maybeSingle();
  if (userError || !user) throw Object.assign(new Error('sessao_invalida'), { status: 401 });

  if (companyId) {
    const { data: allowed, error: allowedError } = await service
      .from('contabilidade_portal_acesso_empresas')
      .select('empresa_id')
      .eq('portal_user_id', userId)
      .eq('empresa_id', companyId)
      .maybeSingle();
    if (allowedError || !allowed) throw Object.assign(new Error('empresa_nao_autorizada'), { status: 403 });
  }

  return user;
};

const validateVacation = async (service: any, vacationId: string, companyId: string) => {
  const { data: vacation, error } = await service
    .from('ferias_avisos')
    .select('id,company_id,funcionario_id,funcionario_nome,periodo_gozo_inicio,periodo_gozo_fim,status')
    .eq('id', vacationId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error || !vacation) throw Object.assign(new Error('ferias_nao_encontradas'), { status: 404 });
  return vacation;
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const body = readBody(req);
    const action = String(body.action || '').trim();
    const portal = String(body.portal || '').trim().toLowerCase();
    const token = String(body.token || '').trim();
    const service = getServiceClient();

    if (action === 'prepare') {
      const companyId = String(body.empresa_id || '').trim();
      const vacationId = String(body.origem_id || '').trim();
      const type = String(body.tipo_documento || '').trim();
      const fileName = safeFile(body.arquivo_nome);
      const fileSize = Number(body.tamanho_bytes || 0);

      if (!companyId || !vacationId || !ALLOWED_TYPES.has(type) || !/\.pdf$/i.test(fileName)) {
        return sendJson(res, { ok: false, error: 'pdf_ferias_invalido' }, 400);
      }
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
        return sendJson(res, { ok: false, error: 'tamanho_invalido', max_bytes: MAX_FILE_BYTES }, 400);
      }

      await validateSession(service, portal, token, companyId);
      await validateVacation(service, vacationId, companyId);

      const date = new Date().toISOString().slice(0, 10);
      const storagePath = `portal/${portal}/${companyId}/ferias/${vacationId}/${type}/${date}/${crypto.randomUUID()}-${fileName}`;
      const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(storagePath);
      if (error || !data?.token) throw error || new Error('signed_upload_failed');

      return sendJson(res, {
        ok: true,
        bucket: BUCKET,
        path: storagePath,
        upload_token: data.token,
        max_bytes: MAX_FILE_BYTES,
      });
    }

    if (action === 'finalize') {
      const companyId = String(body.empresa_id || '').trim();
      const vacationId = String(body.origem_id || '').trim();
      const type = String(body.tipo_documento || '').trim();
      const storagePath = String(body.storage_path || '').trim();
      const fileName = safeFile(body.arquivo_nome);
      const fileSize = Number(body.tamanho_bytes || 0) || null;
      const competence = String(body.competencia || '').trim().slice(0, 20) || null;

      if (!companyId || !vacationId || !ALLOWED_TYPES.has(type) || !storagePath || !/\.pdf$/i.test(fileName)) {
        return sendJson(res, { ok: false, error: 'dados_invalidos' }, 400);
      }

      const user = await validateSession(service, portal, token, companyId);
      const vacation = await validateVacation(service, vacationId, companyId);
      const expectedPrefix = `portal/${portal}/${companyId}/ferias/${vacationId}/${type}/`;
      if (!storagePath.startsWith(expectedPrefix)) {
        return sendJson(res, { ok: false, error: 'caminho_invalido' }, 400);
      }

      const prefix = storagePath.split('/').slice(0, -1).join('/');
      const base = storagePath.split('/').pop() || '';
      const { data: objects, error: listError } = await service.storage.from(BUCKET).list(prefix, { search: base, limit: 20 });
      if (listError) throw listError;
      if (!(objects || []).some((item: any) => item.name === base)) {
        return sendJson(res, { ok: false, error: 'arquivo_nao_encontrado' }, 400);
      }

      const now = new Date().toISOString();
      await service
        .from('contabilidade_portal_uploads')
        .update({ status: 'substituido', updated_at: now })
        .eq('origem_tipo', 'ferias')
        .eq('origem_id', vacationId)
        .eq('tipo_documento', type)
        .eq('status', 'recebido');

      const { data: upload, error: uploadError } = await service
        .from('contabilidade_portal_uploads')
        .insert({
          portal_user_id: user.id,
          empresa_id: companyId,
          tipo_documento: type,
          competencia: competence || String(vacation.periodo_gozo_inicio || '').slice(0, 7) || null,
          funcionario_nome: vacation.funcionario_nome || null,
          observacao: type === 'ferias_aviso' ? 'Aviso de férias devolvido pela contabilidade' : 'Recibo de férias devolvido pela contabilidade',
          arquivo_nome: fileName,
          tamanho_bytes: fileSize,
          storage_bucket: BUCKET,
          storage_path: storagePath,
          status: 'recebido',
          formalizacao_email_status: 'nao_aplicavel',
          origem_tipo: 'ferias',
          origem_id: vacationId,
          processo_tipo: 'ferias_retorno_contabilidade',
          processamento_status: 'concluido',
          processamento_detalhes: { documento: type, origem: 'central_contabilidade', portal },
          created_at: now,
          updated_at: now,
        })
        .select('id,tipo_documento,arquivo_nome,created_at')
        .single();
      if (uploadError) throw uploadError;

      return sendJson(res, { ok: true, documento: upload });
    }

    if (action === 'list') {
      const companyId = String(body.empresa_id || '').trim();
      const vacationId = String(body.origem_id || '').trim();
      if (!companyId || !vacationId) return sendJson(res, { ok: false, error: 'dados_invalidos' }, 400);

      await validateSession(service, portal, token, companyId);
      await validateVacation(service, vacationId, companyId);

      const { data, error } = await service
        .from('contabilidade_portal_uploads')
        .select('id,tipo_documento,arquivo_nome,tamanho_bytes,created_at,updated_at,status')
        .eq('empresa_id', companyId)
        .eq('origem_tipo', 'ferias')
        .eq('origem_id', vacationId)
        .in('tipo_documento', ['ferias_aviso', 'ferias_recibo'])
        .eq('status', 'recebido')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const latest: Record<string, any> = {};
      for (const item of data || []) {
        if (!latest[item.tipo_documento]) latest[item.tipo_documento] = item;
      }
      return sendJson(res, { ok: true, documentos: latest });
    }

    if (action === 'view') {
      const uploadId = String(body.upload_id || '').trim();
      if (!uploadId) return sendJson(res, { ok: false, error: 'upload_id_obrigatorio' }, 400);

      const user = await validateSession(service, portal, token);
      const { data: upload, error } = await service
        .from('contabilidade_portal_uploads')
        .select('id,empresa_id,tipo_documento,origem_tipo,origem_id,storage_bucket,storage_path,arquivo_nome,status')
        .eq('id', uploadId)
        .eq('origem_tipo', 'ferias')
        .in('tipo_documento', ['ferias_aviso', 'ferias_recibo'])
        .eq('status', 'recebido')
        .maybeSingle();
      if (error || !upload) return sendJson(res, { ok: false, error: 'documento_nao_encontrado' }, 404);

      const { data: allowed } = await service
        .from('contabilidade_portal_acesso_empresas')
        .select('empresa_id')
        .eq('portal_user_id', user.id)
        .eq('empresa_id', upload.empresa_id)
        .maybeSingle();
      if (!allowed) return sendJson(res, { ok: false, error: 'empresa_nao_autorizada' }, 403);

      const { data: signed, error: signedError } = await service.storage.from(upload.storage_bucket).createSignedUrl(upload.storage_path, 600);
      if (signedError || !signed?.signedUrl) throw signedError || new Error('signed_url_failed');
      return sendJson(res, { ok: true, url: signed.signedUrl, arquivo_nome: upload.arquivo_nome, expires_in: 600 });
    }

    return sendJson(res, { ok: false, error: 'action_invalid' }, 400);
  } catch (error: any) {
    console.error('[accounting-vacation-documents]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
