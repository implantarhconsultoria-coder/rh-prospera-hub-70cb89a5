import accountingPayrollFlow from './accounting-payroll-flow.js';
import { getServiceClient, sendJson } from '../src/server/payrollServer.js';
import { validateAccountingPdfCompany } from '../src/server/accountingCompanyGuard.js';

const INBOX_BUCKET = 'contabilidade-inbox';
const clean = (value: unknown) => String(value || '').trim();

const parseBody = (req: any) => {
  if (typeof req?.body === 'object' && req.body !== null) return req.body;
  try { return JSON.parse(req?.body || '{}'); } catch { return {}; }
};

const validatePortalSession = async (service: any, portal: string, token: string, companyId: string) => {
  if (!['principal', 'goiania'].includes(portal) || !token || !companyId) {
    throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  }
  const { data: userId, error } = await service.rpc('contabilidade_portal_usuario_sessao', {
    p_token: token,
    p_portal: portal,
  });
  if (error || !userId) throw Object.assign(new Error('sessao_invalida'), { status: 401 });

  const { data: access, error: accessError } = await service.from('contabilidade_portal_acesso_empresas')
    .select('empresa_id')
    .eq('portal_user_id', userId)
    .eq('empresa_id', companyId)
    .maybeSingle();
  if (accessError || !access) throw Object.assign(new Error('empresa_nao_autorizada'), { status: 403 });
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  const body = parseBody(req);
  const action = clean(body.action);
  if (action !== 'finalize_original') return accountingPayrollFlow(req, res);

  const portal = clean(body.portal).toLowerCase();
  const token = clean(body.token);
  const companyId = clean(body.empresa_id);
  const path = clean(body.storage_path);

  try {
    const service = getServiceClient();
    await validatePortalSession(service, portal, token, companyId);

    const expectedPrefix = `folha/${portal}/`;
    if (!path.startsWith(expectedPrefix) || !path.split('/').includes(companyId)) {
      if (path) await service.storage.from(INBOX_BUCKET).remove([path]).catch(() => null);
      return sendJson(res, {
        ok: false,
        error: 'arquivo_fora_da_empresa',
        message: 'Arquivo bloqueado: o caminho do documento não corresponde à empresa selecionada.',
      }, 409);
    }

    const validation = await validateAccountingPdfCompany(service, INBOX_BUCKET, path, companyId);
    if (!validation.ok) {
      await service.storage.from(INBOX_BUCKET).remove([path]).catch(() => null);
      return sendJson(res, {
        ok: false,
        error: validation.code,
        message: validation.message,
      }, 409);
    }

    req.body = {
      ...body,
      validacao_empresa: {
        validada: true,
        metodo: validation.method,
        empresa_id: companyId,
      },
    };
    return accountingPayrollFlow(req, res);
  } catch (error: any) {
    if (path) {
      try {
        const service = getServiceClient();
        await service.storage.from(INBOX_BUCKET).remove([path]);
      } catch { /* noop */ }
    }
    return sendJson(res, {
      ok: false,
      error: String(error?.message || error),
      message: String(error?.message || 'Não foi possível validar a empresa do documento.'),
    }, Number(error?.status || 500));
  }
}
