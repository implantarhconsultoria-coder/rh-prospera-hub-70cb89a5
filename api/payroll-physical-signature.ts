import { addEvent, readBody, requireAdmin, sendJson } from '../src/server/payrollServer.js';

const clean = (value: unknown) => String(value ?? '').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const localDate = (value: string | Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const brDate = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00-03:00` : raw);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date);
};
const compLabel = (value: unknown) => {
  const m = clean(value).match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[2]}/${m[1]}` : clean(value);
};
const typeOrder: Record<string, number> = { BENEFICIO_VR: 20, BENEFICIO_VR_VT: 25, BENEFICIO_VT: 30, HOLERITE: 40 };
const activePhysicalTypes = new Set(['BENEFICIO_VR', 'BENEFICIO_VR_VT', 'BENEFICIO_VT', 'HOLERITE']);
const typeLabel = (type: unknown) => ({
  BENEFICIO_VR: 'Vale-Refeição (VR)',
  BENEFICIO_VT: 'Vale-Transporte (VT)',
  BENEFICIO_VR_VT: 'Vale-Refeição / Vale-Transporte (VR/VT)',
  HOLERITE: 'Holerite / Pagamento',
}[clean(type).toUpperCase()] || clean(type).replace(/_/g, ' '));
const maskedPhone = (phone: string) => phone.length >= 4 ? `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}` : '****';

const loadEmployee = async (service: any, companyId: string, employeeId: string) => {
  const { data, error } = await service.from('funcionarios')
    .select('id,nome,celular,telefone,status,ativo,data_demissao,company_id,empresa_id')
    .eq('id', employeeId).maybeSingle();
  if (error) throw error;
  if (!data || ![clean(data.company_id), clean(data.empresa_id)].includes(companyId)) throw Object.assign(new Error('employee_scope_mismatch'), { status: 403 });
  return data;
};

const loadPending = async (service: any, companyId: string, employeeId?: string) => {
  let query = service.from('payroll_documents')
    .select('id,company_id,employee_id,competencia,document_type,extracted_data,created_at,confirmed_at,physical_signed_at')
    .eq('company_id', companyId).eq('is_current', true).eq('confirmed', true).is('physical_signed_at', null)
    .order('competencia', { ascending: true }).order('created_at', { ascending: true });
  if (employeeId) query = query.eq('employee_id', employeeId);
  const { data: docs, error } = await query;
  if (error) throw error;
  if (!docs?.length) return [];

  const today = localDate();
  const currentCompetence = today.slice(0, 7);
  const supportedDocs = docs.filter((d:any) => d.employee_id && activePhysicalTypes.has(clean(d.document_type).toUpperCase()));
  if (!supportedDocs.length) return [];

  const employeeIds = Array.from(new Set(supportedDocs.map((d:any) => clean(d.employee_id)).filter(Boolean)));
  const { data: vacations, error: vacationError } = employeeIds.length
    ? await service.from('ferias_avisos')
      .select('funcionario_id,periodo_gozo_inicio,periodo_gozo_fim,data_retorno')
      .in('funcionario_id', employeeIds)
    : { data: [], error: null };
  if (vacationError) throw vacationError;

  const employeesOnVacation = new Set((vacations || []).filter((v:any) => {
    const start = clean(v.periodo_gozo_inicio);
    const end = clean(v.periodo_gozo_fim || v.data_retorno);
    return Boolean(start && end && start <= today && today <= end);
  }).map((v:any) => clean(v.funcionario_id)));

  const operationalDocs = supportedDocs.filter((d:any) => {
    const employee = clean(d.employee_id);
    const competence = clean(d.competencia);
    return competence >= currentCompetence || employeesOnVacation.has(employee);
  });
  if (!operationalDocs.length) return [];

  const documentIds = operationalDocs.map((d:any) => d.id);
  const [{ data: requests, error: requestError }, { data: receipts, error: receiptError }, { data: benefits, error: benefitError }] = await Promise.all([
    service.from('payroll_signature_requests').select('document_id,status,signed_at').in('document_id', documentIds),
    service.from('payroll_payment_receipts').select('document_id,paid_at,status,confirmed').in('document_id', documentIds).order('created_at', { ascending: false }),
    service.from('benefit_generations').select('tipo,competencia,data_pagamento,generated_at').eq('company_id', companyId).order('generated_at', { ascending: false }),
  ]);
  if (requestError) throw requestError;
  if (receiptError) throw receiptError;
  if (benefitError) throw benefitError;
  const signed = new Set((requests || []).filter((r:any) => r.signed_at || clean(r.status).toUpperCase() === 'ASSINADO').map((r:any) => r.document_id));
  const receiptByDoc = new Map<string, any>();
  for (const receipt of receipts || []) if (!receiptByDoc.has(receipt.document_id)) receiptByDoc.set(receipt.document_id, receipt);
  const benefitDate = (type:string, comp:string) => {
    const target = type === 'BENEFICIO_VR' ? 'vr' : type === 'BENEFICIO_VT' ? 'vt' : '';
    if (!target) return '';
    const hit = (benefits || []).find((b:any) => clean(b.tipo).toLowerCase() === target && clean(b.competencia) === comp && b.data_pagamento);
    return clean(hit?.data_pagamento);
  };
  return operationalDocs.filter((d:any) => !signed.has(d.id)).map((d:any) => {
    const type = clean(d.document_type).toUpperCase();
    const extra = d.extracted_data || {};
    const receipt = receiptByDoc.get(d.id);
    const date = clean(extra.data_pagamento || extra.payment_date || receipt?.paid_at || benefitDate(type, clean(d.competencia)) || '');
    return { id:d.id, employee_id:d.employee_id, competencia:clean(d.competencia), document_type:type, label:typeLabel(type), date, date_label:brDate(date), order:typeOrder[type] || 90 };
  });
};

const buildMessage = (employeeName:string, pending:any[], followup:boolean) => {
  const sorted = [...pending].sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999') || a.order-b.order);
  const lines:string[] = [];
  for (const doc of sorted) {
    const suffix = doc.date_label ? doc.date_label : `competência ${compLabel(doc.competencia)}`;
    lines.push(`• ${doc.label} — ${suffix}`);
    if (doc.document_type === 'HOLERITE') lines.push(`• Cartão de Ponto — fechamento ${compLabel(doc.competencia)}${doc.date_label ? ` · pagamento ${doc.date_label}` : ''}`);
  }
  const intro = followup
    ? `Reforçando: ainda constam pendentes de assinatura no escritório:`
    : `Estão disponíveis para assinatura no escritório:`;
  const ending = followup
    ? 'Por favor, compareça ao escritório para regularizar as assinaturas.'
    : 'Por favor, venha até o escritório para assinar os seus documentos.';
  return `Olá, ${employeeName}.\nAqui é o RH da TOPAC.\n\n${intro}\n\n${lines.join('\n')}\n\n${ending}\n\nTOPAC RH`;
};

export default async function handler(req:any,res?:any){
  if (String(req?.method || 'POST').toUpperCase() !== 'POST') return sendJson(res,{ok:false,error:'method_not_allowed'},405);
  try {
    const { service, user } = await requireAdmin(req);
    const body = readBody(req);
    const action = clean(body.action);
    const companyId = clean(body.company_id);
    if (!companyId) return sendJson(res,{ok:false,error:'company_id_required'},400);

    if (action === 'list') {
      const pending = await loadPending(service, companyId);
      const employeeIds = Array.from(new Set(pending.map((d:any)=>d.employee_id)));
      if (!employeeIds.length) return sendJson(res,{ok:true,employees:[]});
      const [{data:employees,error:empError},{data:logs,error:logError}] = await Promise.all([
        service.from('funcionarios').select('id,nome,celular,telefone,status,ativo,data_demissao').in('id',employeeIds),
        service.from('payroll_message_logs').select('employee_id,message_kind,status,attempt,created_at,sent_at').eq('company_id',companyId).in('employee_id',employeeIds).in('message_kind',['ASSINATURA_FISICA_AVISO','ASSINATURA_FISICA_REAVISO']).order('created_at',{ascending:false}),
      ]);
      if(empError) throw empError; if(logError) throw logError;
      const grouped = new Map<string,any[]>(); pending.forEach((d:any)=>grouped.set(d.employee_id,[...(grouped.get(d.employee_id)||[]),d]));
      const items = (employees||[]).filter((e:any)=>clean(e.status||'ativo').toLowerCase()==='ativo' && e.ativo!==false && !e.data_demissao).map((e:any)=>{
        const employeeLogs=(logs||[]).filter((l:any)=>l.employee_id===e.id);
        const last=employeeLogs[0]||null;
        const lastAt=last?.sent_at||last?.created_at||null;
        return { id:e.id,name:e.nome,phone:digits(e.celular||e.telefone),pending:grouped.get(e.id)||[],reminder_count:employeeLogs.length,last_reminder_at:lastAt,can_remind_again:!lastAt||localDate(lastAt)<localDate() };
      }).filter((e:any)=>e.pending.length).sort((a:any,b:any)=>clean(a.name).localeCompare(clean(b.name),'pt-BR'));
      return sendJson(res,{ok:true,employees:items});
    }

    if (action === 'prepare-reminder') {
      const employeeId=clean(body.employee_id); if(!employeeId) return sendJson(res,{ok:false,error:'employee_id_required'},400);
      const employee=await loadEmployee(service,companyId,employeeId);
      const phone=digits(employee.celular||employee.telefone); if(phone.length<10) return sendJson(res,{ok:false,error:'employee_phone_invalid'},409);
      const pending=await loadPending(service,companyId,employeeId); if(!pending.length) return sendJson(res,{ok:false,error:'no_pending_documents'},409);
      const {data:logs,error:logError}=await service.from('payroll_message_logs').select('id,sent_at,created_at').eq('company_id',companyId).eq('employee_id',employeeId).in('message_kind',['ASSINATURA_FISICA_AVISO','ASSINATURA_FISICA_REAVISO']).order('created_at',{ascending:false});
      if(logError) throw logError;
      const previous=(logs||[]); const last=previous[0]; const lastAt=last?.sent_at||last?.created_at;
      if(lastAt && localDate(lastAt)===localDate() && body.force!==true) return sendJson(res,{ok:false,error:'reminder_already_prepared_today',last_reminder_at:lastAt},409);
      const attempt=previous.length+1; const message=buildMessage(clean(employee.nome)||'colaborador',pending,attempt>1); const now=new Date().toISOString();
      const {error:insertError}=await service.from('payroll_message_logs').insert({company_id:companyId,employee_id:employeeId,request_id:null,message_kind:attempt>1?'ASSINATURA_FISICA_REAVISO':'ASSINATURA_FISICA_AVISO',channel:'WHATSAPP',destination_masked:maskedPhone(phone),message_template:message,status:'WHATSAPP_ABERTO_PARA_ENVIO',attempt,sent_at:now,idempotency_key:`physical:${companyId}:${employeeId}:${localDate()}:${attempt}`});
      if(insertError) throw insertError;
      await addEvent(service,{company_id:companyId,employee_id:employeeId,event_type:'AVISO_ASSINATURA_FISICA',actor_type:'ADMIN',actor_user_id:user.id,payload:{attempt,documents:pending.map((d:any)=>({id:d.id,type:d.document_type,competencia:d.competencia,date:d.date||null}))}});
      const number=phone.startsWith('55')?phone:`55${phone}`;
      return sendJson(res,{ok:true,attempt,message,whatsapp_url:`https://wa.me/${number}?text=${encodeURIComponent(message)}`,pending});
    }

    if (action === 'physical-signoff') {
      const employeeId=clean(body.employee_id); const ids=Array.isArray(body.document_ids)?body.document_ids.map(clean).filter(Boolean):[];
      if(!employeeId||!ids.length) return sendJson(res,{ok:false,error:'employee_and_documents_required'},400);
      await loadEmployee(service,companyId,employeeId);
      const now=new Date().toISOString();
      const {data:docs,error:docError}=await service.from('payroll_documents').select('id,document_type,competencia,employee_id,company_id').in('id',ids).eq('company_id',companyId).eq('employee_id',employeeId).eq('is_current',true);
      if(docError) throw docError; if((docs||[]).length!==ids.length) return sendJson(res,{ok:false,error:'document_scope_mismatch'},409);
      const {error:updateError}=await service.from('payroll_documents').update({physical_signed_at:now,physical_signed_by:user.id,physical_signature_method:'PAPEL_ESCRITORIO',physical_signature_note:clean(body.note)||null,updated_at:now}).in('id',ids).eq('company_id',companyId).eq('employee_id',employeeId);
      if(updateError) throw updateError;
      for(const doc of docs||[]) await addEvent(service,{company_id:companyId,employee_id:employeeId,event_type:'ASSINATURA_FISICA_CONFIRMADA',actor_type:'ADMIN',actor_user_id:user.id,payload:{document_id:doc.id,document_type:doc.document_type,competencia:doc.competencia,confirmed_at:now}});
      return sendJson(res,{ok:true,document_ids:ids,signed_at:now});
    }
    return sendJson(res,{ok:false,error:'unknown_action'},400);
  }catch(error:any){return sendJson(res,{ok:false,error:clean(error?.message||error)},Number(error?.status)||500);}
}
