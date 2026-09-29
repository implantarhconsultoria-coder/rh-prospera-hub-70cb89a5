import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';

const ROBSON_EMAIL = 'robson@topac.com.br';
const ADM_EMAIL = 'adm.matriz@topac.com.br';

const clean = (value: unknown) => String(value || '').trim();
const html = (value: unknown) => String(value ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

const bearer = (req: any) => String(req?.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';

const requireOperationalUser = async (req: any, service: any) => {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  const { data: auth, error } = await service.auth.getUser(token);
  if (error || !auth?.user) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  const { data: roles, error: roleError } = await service.from('user_roles').select('role').eq('user_id', auth.user.id);
  if (roleError) throw roleError;
  const list = (roles || []).map((r: any) => String(r.role));
  if (!list.some((r: string) => ['admin','diretor_geral','operacional'].includes(r))) {
    throw Object.assign(new Error('sem_permissao'), { status: 403 });
  }
  return { user: auth.user, roles: list };
};

const formatDateTime = (value?: string | null) => {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const sendFormalization = async (service: any, input: {
  action: string;
  subject: string;
  lines: string[];
  user: any;
  entityType: 'protocolos' | 'chamado' | 'movimentacao';
  entityIds: string[];
}) => {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) throw Object.assign(new Error('RESEND_API_KEY nao configurada'), { status: 503 });

  const from = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM || 'TOPAC RH PRO <no-reply@topacrh.pro>');
  const replyTo = clean(process.env.EMAIL_REPLY_TO || ADM_EMAIL);
  const to = [ROBSON_EMAIL];
  const cc = [ADM_EMAIL];

  const text = [
    'Prezados,',
    '',
    `Fica formalizado o registro da operação: ${input.action}.`,
    '',
    ...input.lines,
    '',
    `Registrado na plataforma em: ${formatDateTime()}`,
    `Usuário da estação: ${input.user?.email || 'não informado'}`,
    '',
    'Este e-mail é parte do histórico formal da operação.',
    '',
    'TOPAC RH PRO',
  ].join('\n');

  const rows = input.lines.map((line) => {
    const [label, ...rest] = line.split(':');
    return `<tr><td style="padding:7px;border-bottom:1px solid #e5e7eb"><b>${html(label)}</b></td><td style="padding:7px;border-bottom:1px solid #e5e7eb">${html(rest.join(':').trim())}</td></tr>`;
  }).join('');

  const body = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.5;max-width:720px">
    <h2 style="margin-bottom:6px">${html(input.action)}</h2>
    <p>Fica formalizado o registro realizado no TOPAC RH PRO.</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin-top:18px"><b>Registro:</b> ${html(formatDateTime())}</p>
    <p style="color:#6b7280;font-size:12px">Este e-mail integra o histórico formal da operação.</p>
  </div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, cc, reply_to: replyTo, subject: input.subject, text, html: body }),
  });
  const detail = await response.text().catch(() => '');
  const ok = response.ok;
  const now = new Date().toISOString();

  if (input.entityType === 'protocolos' && input.entityIds.length) {
    await service.from('protocolos_documentos').update({
      email_formalizacao_status: ok ? 'enviado' : 'erro',
      email_formalizacao_em: ok ? now : null,
    }).in('id', input.entityIds);
  } else if (input.entityType === 'chamado' && input.entityIds[0]) {
    await service.from('chamados').update({
      email_formalizacao_status: ok ? 'enviado' : 'erro',
      email_formalizacao_em: ok ? now : null,
    }).eq('id', input.entityIds[0]);
  } else if (input.entityType === 'movimentacao' && input.entityIds[0]) {
    await service.from('operacional_movimentacoes').update({
      email_formalizacao_status: ok ? 'enviado' : 'erro',
      email_formalizacao_em: ok ? now : null,
    }).eq('id', input.entityIds[0]);
  }

  try {
    await service.from('email_envios_log').insert({
      user_id: input.user?.id || null,
      usuario_nome: input.user?.user_metadata?.nome_completo || input.user?.email || 'TOPAC RH PRO',
      email_corporativo_usado: input.user?.email || null,
      email_remetente: from,
      reply_to: replyTo,
      provider: 'resend',
      modulo_origem: 'operacional',
      documento_id: input.entityIds[0] || null,
      documento_nome: input.action,
      destinatarios: to.join(', '),
      cc: cc.join(', '),
      assunto: input.subject,
      status: ok ? 'enviado' : 'erro',
      erro: ok ? null : detail.slice(0, 1000),
      enviado_em: now,
    });
  } catch (logError) {
    console.warn('[operacional-formalizacao] log email falhou', logError);
  }

  if (!ok) throw Object.assign(new Error(`Falha no envio de formalizacao: ${detail.slice(0,300)}`), { status: 502 });
  return { ok: true, to, cc };
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const service = getServiceClient();
    const { user } = await requireOperationalUser(req, service);
    const body = readBody(req);
    const type = clean(body.type);
    const id = clean(body.id);
    const ids = Array.isArray(body.ids) ? body.ids.map(clean).filter(Boolean) : [];

    if (type === 'locacao') {
      if (!ids.length) return sendJson(res, { ok: false, error: 'protocolos_obrigatorios' }, 400);
      const { data, error } = await service
        .from('protocolos_documentos')
        .select('id,empresa_destinataria,local_canteiro,responsavel_recebimento,placa,patrimonio,descricao_ativo,operador_nome,created_at')
        .in('id', ids)
        .eq('registro_ativo', true);
      if (error || !data?.length) throw Object.assign(new Error('protocolos_nao_encontrados'), { status: 404 });

      const plates = Array.from(new Set(data.map((r: any) => r.placa).filter(Boolean)));
      const clients = Array.from(new Set(data.map((r: any) => [r.empresa_destinataria, r.local_canteiro].filter(Boolean).join(' / ')).filter(Boolean)));
      const operator = data.find((r: any) => r.operador_nome)?.operador_nome || 'não informado';
      return sendJson(res, await sendFormalization(service, {
        action: 'LOCAÇÃO / LIBERAÇÃO DE DOCUMENTO',
        subject: `[TOPAC OPERACIONAL] LOCAÇÃO – ${plates.join(', ') || 'ativo'} – ${clients[0] || 'cliente'}`,
        lines: [
          `Ação: Saída para locação`,
          `Cliente / local: ${clients.join(' | ')}`,
          `Placa(s): ${plates.join(', ') || '—'}`,
          `Patrimônio(s): ${Array.from(new Set(data.map((r:any)=>r.patrimonio).filter(Boolean))).join(', ') || '—'}`,
          `Operador: ${operator}`,
          `Responsável no cliente: ${Array.from(new Set(data.map((r:any)=>r.responsavel_recebimento).filter(Boolean))).join(', ') || '—'}`,
          `Protocolos: ${data.map((r:any)=>r.id).join(', ')}`,
        ],
        user,
        entityType: 'protocolos',
        entityIds: data.map((r: any) => r.id),
      }));
    }

    if (type === 'devolucao') {
      if (!id) return sendJson(res, { ok: false, error: 'protocolo_obrigatorio' }, 400);
      const { data, error } = await service.from('protocolos_documentos')
        .select('id,empresa_destinataria,local_canteiro,placa,patrimonio,descricao_ativo,operador_nome,status_locacao,ultima_alteracao_motivo')
        .eq('id', id).maybeSingle();
      if (error || !data) throw Object.assign(new Error('protocolo_nao_encontrado'), { status: 404 });

      return sendJson(res, await sendFormalization(service, {
        action: 'DEVOLUÇÃO / RETORNO DE LOCAÇÃO',
        subject: `[TOPAC OPERACIONAL] DEVOLUÇÃO – ${data.placa || data.patrimonio || 'ativo'} – ${data.empresa_destinataria || 'cliente'}`,
        lines: [
          'Ação: Devolução / retorno',
          `Cliente / local: ${[data.empresa_destinataria,data.local_canteiro].filter(Boolean).join(' / ')}`,
          `Placa: ${data.placa || '—'}`,
          `Patrimônio: ${data.patrimonio || '—'}`,
          `Situação registrada: ${data.status_locacao || '—'}`,
          `Motivo / observação: ${data.ultima_alteracao_motivo || '—'}`,
          `Operador: ${data.operador_nome || '—'}`,
          `Protocolo: ${data.id}`,
        ],
        user,
        entityType: 'protocolos',
        entityIds: [data.id],
      }));
    }

    if (type.startsWith('ocorrencia_')) {
      if (!id) return sendJson(res, { ok: false, error: 'ocorrencia_obrigatoria' }, 400);
      const { data, error } = await service.from('chamados')
        .select('id,numero,cliente,local_servico,tipo_servico,itens_previstos,observacoes,status,solicitante_nome,solicitante_contato,operador_abertura_nome,aceito_por_nome,descricao_conclusao,cancelamento_motivo,placa_snapshot,patrimonio_snapshot,created_at')
        .eq('id', id).maybeSingle();
      if (error || !data) throw Object.assign(new Error('ocorrencia_nao_encontrada'), { status: 404 });

      const label = type === 'ocorrencia_concluida' ? 'OCORRÊNCIA CONCLUÍDA'
        : type === 'ocorrencia_cancelada' ? 'OCORRÊNCIA CANCELADA'
        : type === 'ocorrencia_alterada' ? 'OCORRÊNCIA ALTERADA'
        : 'OCORRÊNCIA ABERTA';

      return sendJson(res, await sendFormalization(service, {
        action: label,
        subject: `[TOPAC OPERACIONAL] ${label} #${data.numero || data.id.slice(0,8)} – ${data.cliente}`,
        lines: [
          `Ação: ${label}`,
          `Cliente / local: ${[data.cliente,data.local_servico].filter(Boolean).join(' / ')}`,
          `Placa / patrimônio: ${[data.placa_snapshot,data.patrimonio_snapshot].filter(Boolean).join(' / ') || '—'}`,
          `Solicitado por: ${[data.solicitante_nome,data.solicitante_contato].filter(Boolean).join(' / ') || '—'}`,
          `Serviço / problema: ${data.tipo_servico || '—'}`,
          `Situação: ${data.status || '—'}`,
          `Registrado por: ${data.operador_abertura_nome || '—'}`,
          `Mecânico: ${data.aceito_por_nome || 'ainda não aceito'}`,
          `Conclusão: ${data.descricao_conclusao || '—'}`,
          `Cancelamento: ${data.cancelamento_motivo || '—'}`,
          `Ocorrência: ${data.numero || data.id}`,
        ],
        user,
        entityType: 'chamado',
        entityIds: [data.id],
      }));
    }

    if (type === 'movimentacao') {
      if (!id) return sendJson(res, { ok: false, error: 'movimentacao_obrigatoria' }, 400);
      const { data, error } = await service.from('operacional_movimentacoes').select('*').eq('id', id).maybeSingle();
      if (error || !data) throw Object.assign(new Error('movimentacao_nao_encontrada'), { status: 404 });

      const action = String(data.tipo || '').toLowerCase() === 'devolucao' ? 'DEVOLUÇÃO'
        : String(data.tipo || '').toLowerCase() === 'locacao' ? 'LOCAÇÃO'
        : 'MOVIMENTAÇÃO OPERACIONAL';

      return sendJson(res, await sendFormalization(service, {
        action,
        subject: `[TOPAC OPERACIONAL] ${action} – ${data.placa || data.patrimonio || 'ativo'}`,
        lines: [
          `Ação: ${action}`,
          `Placa: ${data.placa || '—'}`,
          `Patrimônio: ${data.patrimonio || '—'}`,
          `Cliente destino: ${data.cliente_destino_nome || '—'}`,
          `Local destino: ${data.local_destino_nome || '—'}`,
          `Motivo / observação: ${data.observacao || '—'}`,
          `Operador: ${data.operador_nome || '—'}`,
          `Registro: ${data.id}`,
        ],
        user,
        entityType: 'movimentacao',
        entityIds: [data.id],
      }));
    }

    return sendJson(res, { ok: false, error: 'tipo_invalido' }, 400);
  } catch (error: any) {
    console.error('[operacional-formalizacao]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
