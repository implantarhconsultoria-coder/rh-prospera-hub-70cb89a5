import { readBody, sendJson } from '../src/server/payrollServer.js';

/**
 * Contenção de segurança do App Mecânicos.
 *
 * O fluxo anterior executava identificação facial 1:N entre todos os mecânicos
 * e retornava diretamente o acesso associado ao melhor resultado. Até que o
 * fluxo seja refeito como verificação 1:1 vinculada a uma sessão autenticada,
 * nenhuma ação facial deste endpoint deve liberar ou cadastrar acessos.
 *
 * O acesso operacional permanece disponível exclusivamente pelo PIN e pela
 * sessão vinculada ao usuário criada após a escolha do cadastro correto.
 */
export default async function handler(req: any, res?: any) {
  if ((req?.method || 'GET') !== 'POST') {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  const body = readBody(req);
  const action = String(body?.action || '');

  if (['identify', 'enroll', 'status'].includes(action)) {
    return sendJson(res, {
      ok: false,
      error: 'mechanic_face_temporarily_disabled',
      access_method: 'pin',
    }, 503);
  }

  return sendJson(res, { ok: false, error: 'invalid_action' }, 400);
}
