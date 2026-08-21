import {
  addEvent,
  createReminderJob,
  decryptSecret,
  getServiceClient,
  logMessage,
  requestBaseUrl,
  sendJson,
  sendPayrollMessage,
} from '../src/server/payrollServer';

const reminderText = (link: string) => `TOPAC — Assinatura pendente\n\nSeu holerite continua aguardando sua assinatura.\n\nPor favor, acesse o documento e finalize a confirmação:\n\n${link}\n\nABRIR E ASSINAR`;
const collectionText = (link: string) => `TOPAC — Pendência de assinatura\n\nIdentificamos que seu holerite continua pendente de assinatura eletrônica.\n\nPedimos que finalize a assinatura pelo link abaixo:\n\n${link}\n\nASSINAR AGORA`;

const cronAuthorized = (req: any) => {
  const secret = String(process.env.CRON_SECRET || '');
  if (!secret) return false;
  const auth = String(req?.headers?.authorization || '');
  return auth === `Bearer ${secret}`;
};

export default async function handler(req: any, res?: any) {
  if (!['GET','POST'].includes(req?.method || 'GET')) return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  if (!cronAuthorized(req)) return sendJson(res, { ok: false, error: process.env.CRON_SECRET ? 'unauthorized' : 'cron_secret_not_configured' }, process.env.CRON_SECRET ? 401 : 503);

  const service = getServiceClient();
  const now = new Date().toISOString();
  const { data: due, error: dueError } = await service.from('payroll_reminder_jobs')
    .select('*')
    .eq('status', 'PENDENTE')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(100);
  if (dueError) return sendJson(res, { ok: false, error: dueError.message }, 500);

  const results: any[] = [];
  for (const job of due || []) {
    try {
      const { data: claimed, error: claimError } = await service.from('payroll_reminder_jobs')
        .update({ status: 'PROCESSANDO', attempt: Number(job.attempt || 0) + 1 })
        .eq('id', job.id)
        .eq('status', 'PENDENTE')
        .select('*')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) continue;

      const { data: requestRow, error: requestError } = await service.from('payroll_signature_requests').select('*').eq('id', job.request_id).single();
      if (requestError || !requestRow) throw requestError || new Error('request_not_found');

      if (['ASSINADO','CANCELADO','EXPIRADO'].includes(requestRow.status)) {
        await service.from('payroll_reminder_jobs').update({ status: 'CANCELADO', processed_at: new Date().toISOString() }).eq('id', job.id);
        results.push({ id: job.id, status: 'CANCELADO', reason: requestRow.status });
        continue;
      }
      if (new Date(requestRow.expires_at).getTime() <= Date.now()) {
        await service.from('payroll_signature_requests').update({ status: 'EXPIRADO', next_reminder_at: null }).eq('id', requestRow.id);
        await service.from('payroll_reminder_jobs').update({ status: 'CANCELADO', processed_at: new Date().toISOString() }).eq('id', job.id);
        results.push({ id: job.id, status: 'CANCELADO', reason: 'EXPIRADO' });
        continue;
      }

      const { data: config, error: configError } = await service.from('payroll_module_company_config').select('*').eq('company_id', requestRow.company_id).eq('enabled', true).single();
      if (configError || !config) throw configError || new Error('company_not_enabled');
      const token = decryptSecret(requestRow.public_token_ciphertext, requestRow.public_token_nonce);
      const link = `${requestBaseUrl(req)}/holerite/${encodeURIComponent(token)}`;
      const nextCount = Number(requestRow.reminder_count || 0) + 1;
      const kind = nextCount === 1 ? 'LEMBRETE' : 'COBRANCA';
      const text = nextCount === 1 ? reminderText(link) : collectionText(link);

      try {
        const sent = await sendPayrollMessage({ phone: requestRow.phone_snapshot, text });
        const processedAt = new Date().toISOString();
        await service.from('payroll_reminder_jobs').update({ status: 'ENVIADO', processed_at: processedAt, error: null }).eq('id', job.id);
        const { data: updatedRequest, error: updateError } = await service.from('payroll_signature_requests').update({
          reminder_count: nextCount,
          send_error: null,
        }).eq('id', requestRow.id).select('*').single();
        if (updateError) throw updateError;
        await logMessage(service, {
          requestId: requestRow.id,
          companyId: requestRow.company_id,
          employeeId: requestRow.employee_id,
          kind,
          phone: requestRow.phone_snapshot,
          template: text.replace(link, '[LINK INDIVIDUAL PROTEGIDO]'),
          status: 'ENVIADO',
          attempt: Number(job.attempt || 0) + 1,
          providerId: sent.id,
          idempotencyKey: `CRON:${job.id}`,
        });
        await addEvent(service, {
          request_id: requestRow.id,
          company_id: requestRow.company_id,
          employee_id: requestRow.employee_id,
          event_type: kind === 'LEMBRETE' ? 'LEMBRETE_AUTOMATICO_ENVIADO' : 'COBRANCA_AUTOMATICA_ENVIADA',
          actor_type: 'SYSTEM',
          payload: { job_id: job.id, reminder_count: nextCount, provider: sent.provider },
        });

        const { data: refreshed } = await service.from('payroll_signature_requests').select('status').eq('id', requestRow.id).single();
        if (refreshed?.status !== 'ASSINADO') await createReminderJob(service, updatedRequest, config, new Date());
        results.push({ id: job.id, status: 'ENVIADO', kind });
      } catch (sendError: any) {
        const processedAt = new Date().toISOString();
        await service.from('payroll_reminder_jobs').update({ status: 'FALHOU', processed_at: processedAt, error: String(sendError?.message || sendError) }).eq('id', job.id);
        await service.from('payroll_signature_requests').update({ send_error: String(sendError?.message || sendError) }).eq('id', requestRow.id);
        await logMessage(service, {
          requestId: requestRow.id,
          companyId: requestRow.company_id,
          employeeId: requestRow.employee_id,
          kind,
          phone: requestRow.phone_snapshot,
          template: text.replace(link, '[LINK INDIVIDUAL PROTEGIDO]'),
          status: 'FALHOU',
          attempt: Number(job.attempt || 0) + 1,
          error: String(sendError?.message || sendError),
          idempotencyKey: `CRON:${job.id}`,
        });
        await addEvent(service, {
          request_id: requestRow.id,
          company_id: requestRow.company_id,
          employee_id: requestRow.employee_id,
          event_type: 'COBRANCA_AUTOMATICA_FALHOU',
          actor_type: 'SYSTEM',
          payload: { job_id: job.id, kind, error: String(sendError?.message || sendError) },
        });
        await createReminderJob(service, requestRow, config, new Date());
        results.push({ id: job.id, status: 'FALHOU', kind });
      }
    } catch (error: any) {
      await service.from('payroll_reminder_jobs').update({ status: 'FALHOU', processed_at: new Date().toISOString(), error: String(error?.message || error) }).eq('id', job.id);
      results.push({ id: job.id, status: 'FALHOU', error: String(error?.message || error) });
    }
  }

  return sendJson(res, { ok: true, processed: results.length, results });
}
