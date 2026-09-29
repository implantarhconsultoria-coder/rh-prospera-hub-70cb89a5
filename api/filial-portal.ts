import { buildAccountingProcessThreadKey, fetchResendMessageId, prepareAccountingThread, saveAccountingThread } from '../src/server/accountingEmailThread.js';
import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';

const clean = (v:any) => String(v ?? '').trim();
const digits = (v:any) => clean(v).replace(/\D/g,'');
const safe = (v:any) => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_.-]+/g,'_').slice(0,140) || 'arquivo';
const getHeader = (req:any,name:string) => typeof req?.headers?.get === 'function' ? req.headers.get(name) : req?.headers?.[name] || req?.headers?.[name.toLowerCase()] || '';
const bearer = (req:any) => clean(getHeader(req,'authorization')).match(/^Bearer\s+(.+)$/i)?.[1] || '';

const getCompanyFromAccess = async (service:any, access:any) => {
  if (access?.funcionario_id) {
    const { data: f } = await service.from('funcionarios').select('company_id,empresa_id').eq('id',access.funcionario_id).maybeSingle();
    const id = clean((f as any)?.company_id || (f as any)?.empresa_id);
    if (id) return id;
  }
  const name = clean(access?.empresa);
  if (name) {
    const { data: cs } = await service.from('empresas').select('id,nome,razao_social').or(`nome.ilike.%${name.replace(/[%_,]/g,'')}%,razao_social.ilike.%${name.replace(/[%_,]/g,'')}%`).limit(1);
    if (cs?.[0]?.id) return cs[0].id;
  }
  return '';
};

const resolveScope = async (req:any, body:any, service:any) => {
  const accessId = clean(body.accessId);
  const cpfClean = digits(body.cpfClean);
  if (accessId && cpfClean) {
    const { data: access, error } = await service.from('acessos_externos')
      .select('id,nome,cpf_clean,email,email_corporativo,empresa,filial,funcao,modulo,status,acesso_liberado,ativo,funcionario_id')
      .eq('id',accessId).eq('modulo','filial').maybeSingle();
    if (error || !access || access.status !== 'ativo' || access.acesso_liberado !== true || access.ativo === false || digits(access.cpf_clean) !== cpfClean) {
      throw Object.assign(new Error('acesso_filial_invalido'),{status:403});
    }
    const companyId = await getCompanyFromAccess(service,access);
    if (!companyId) throw Object.assign(new Error('empresa_filial_nao_localizada'),{status:403});
    const { data: company } = await service.from('empresas').select('id,nome,razao_social,cnpj').eq('id',companyId).maybeSingle();
    return {
      external:true, accessId, companyId, company,
      actorName: clean(access.nome) || 'Filial',
      actorEmail: clean(access.email_corporativo || access.email),
      filial: clean(access.filial),
    };
  }

  const token = bearer(req);
  if (!token) throw Object.assign(new Error('unauthorized'),{status:401});
  const { data:{ user }, error } = await service.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('unauthorized'),{status:401});
  const { data: roles } = await service.from('user_roles').select('role').eq('user_id',user.id);
  const allowed = (roles || []).some((r:any)=>['admin','diretor_geral','rh','filial','filial_praia','filial_matriz','filial_goiania'].includes(clean(r.role)));
  if (!allowed) throw Object.assign(new Error('forbidden'),{status:403});
  const companyId = clean(body.companyId);
  if (!companyId) throw Object.assign(new Error('company_required'),{status:400});
  const { data: company } = await service.from('empresas').select('id,nome,razao_social,cnpj').eq('id',companyId).maybeSingle();
  if (!company) throw Object.assign(new Error('company_not_found'),{status:404});
  return { external:false, accessId:null, companyId, company, actorName:clean(user.user_metadata?.nome_completo || user.email), actorEmail:clean(user.email), filial:clean(company.nome) };
};

const assertEmployee = async (service:any, scope:any, employeeId:string) => {
  const { data, error } = await service.from('funcionarios').select('id,nome,company_id,empresa_id,status').eq('id',employeeId).maybeSingle();
  if (error || !data || clean((data as any).company_id || (data as any).empresa_id) !== scope.companyId) throw Object.assign(new Error('funcionario_fora_da_filial'),{status:403});
  return data;
};

const signedReadUrl = async (service:any, row:any) => {
  const bucket = clean(row.storage_bucket);
  const path = clean(row.storage_path);
  if (/^https?:\/\//i.test(path)) return path;
  if (bucket && path) {
    const { data } = await service.storage.from(bucket).createSignedUrl(path,3600);
    if (data?.signedUrl) return data.signedUrl;
  }
  return /^https?:\/\//i.test(clean(row.arquivo_url)) ? clean(row.arquivo_url) : '';
};

const eligibleSource = (row:any) => {
  if (clean(row.origem).toLowerCase() === 'filial_assinado') return false;
  const t = `${row.tipo_documento || ''} ${row.categoria || ''} ${row.descricao || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  return /HOLERITE|RECIBO|PAGAMENTO|BENEFICIO|VALE-REFEICAO|VALE-TRANSPORTE|\bVR\b|\bVT\b|ADIANTAMENTO/.test(t);
};

const prepareUpload = async (service:any, scope:any, employeeId:string, fileName:string, folder:string) => {
  const emp = await assertEmployee(service,scope,employeeId);
  const bucket = 'documentos-funcionarios';
  const path = `${employeeId}/${folder}/${Date.now()}_${safe(fileName)}`;
  const { data, error } = await service.storage.from(bucket).createSignedUploadUrl(path,{upsert:false});
  if (error || !data?.token) throw error || new Error('signed_upload_failed');
  return { bucket, path, token:data.token, fileName:safe(fileName), employeeName:emp.nome };
};

const loadStoredBlob = async (service:any, doc:any) => {
  const meta = doc?.dados_extraidos && typeof doc.dados_extraidos === 'object' ? doc.dados_extraidos : {};
  const bucket = clean(meta.bucket);
  const path = clean(meta.path);
  if (bucket && path) {
    const { data, error } = await service.storage.from(bucket).download(path);
    if (error || !data) throw error || new Error('download_failed');
    return Buffer.from(await data.arrayBuffer());
  }
  const url = clean(doc?.arquivo_url);
  if (!url) throw new Error('arquivo_indisponivel');
  const response = await fetch(url);
  if (!response.ok) throw new Error('arquivo_indisponivel');
  return Buffer.from(await response.arrayBuffer());
};

export default async function handler(req:any,res?:any){
  if (String(req?.method || 'POST').toUpperCase() !== 'POST') return sendJson(res,{ok:false,error:'method_not_allowed'},405);
  try {
    const service = getServiceClient();
    const body = readBody(req);
    const action = clean(body.action);
    const scope = await resolveScope(req,body,service);

    if (action === 'employees') {
      const { data, error } = await service.from('funcionarios')
        .select('id,nome,cargo,status,company_id,empresa_id')
        .or(`company_id.eq.${scope.companyId},empresa_id.eq.${scope.companyId}`)
        .neq('status','excluido').order('nome');
      if (error) throw error;
      return sendJson(res,{ok:true,company:scope.company,employees:data || []});
    }

    if (action === 'documents') {
      const { data, error } = await service.from('documentos_funcionario').select('*').eq('company_id',scope.companyId).order('created_at',{ascending:false}).limit(1500);
      if (error) throw error;
      const docs = (data || []).filter(eligibleSource);
      const ids = docs.map((d:any)=>d.id);
      const { data: flow } = ids.length ? await service.from('filial_documentos_fluxo').select('*').in('source_documento_id',ids) : { data:[] as any[] };
      const byId = new Map((flow || []).map((f:any)=>[f.source_documento_id,f]));
      const enriched = [];
      for (const d of docs) enriched.push({ ...d, download_url: await signedReadUrl(service,d), fluxo: byId.get(d.id) || null });
      return sendJson(res,{ok:true,documents:enriched});
    }

    if (action === 'mark_printed') {
      const sourceId = clean(body.sourceDocumentoId);
      const { data: src } = await service.from('documentos_funcionario').select('id,company_id,funcionario_id,competencia,tipo_documento').eq('id',sourceId).maybeSingle();
      if (!src || clean(src.company_id) !== scope.companyId) throw Object.assign(new Error('documento_fora_da_filial'),{status:403});
      const now = new Date().toISOString();
      const { error } = await service.from('filial_documentos_fluxo').upsert({
        company_id:scope.companyId, funcionario_id:src.funcionario_id, source_documento_id:src.id,
        competencia:src.competencia || '', tipo:src.tipo_documento || 'documento', status:'impresso',
        acesso_externo_id:scope.accessId, impresso_em:now, updated_at:now,
      },{onConflict:'source_documento_id'});
      if (error) throw error;
      return sendJson(res,{ok:true});
    }

    if (action === 'request_again') {
      const sourceId = clean(body.sourceDocumentoId);
      const { data: src } = await service.from('documentos_funcionario').select('id,company_id,funcionario_id,competencia,tipo_documento').eq('id',sourceId).maybeSingle();
      if (!src || clean(src.company_id) !== scope.companyId) throw Object.assign(new Error('documento_fora_da_filial'),{status:403});
      const now = new Date().toISOString();
      const { error } = await service.from('filial_documentos_fluxo').upsert({
        company_id:scope.companyId, funcionario_id:src.funcionario_id, source_documento_id:src.id,
        competencia:src.competencia || '', tipo:src.tipo_documento || 'documento', status:'solicitado',
        acesso_externo_id:scope.accessId, solicitado_em:now, solicitado_por_nome:scope.actorName, updated_at:now,
      },{onConflict:'source_documento_id'});
      if (error) throw error;
      return sendJson(res,{ok:true});
    }

    if (action === 'prepare_document_upload') {
      const out = await prepareUpload(service,scope,clean(body.employeeId),clean(body.fileName),'filial-documentos');
      return sendJson(res,{ok:true,...out});
    }

    if (action === 'finalize_document_upload') {
      const employeeId = clean(body.employeeId);
      const emp = await assertEmployee(service,scope,employeeId);
      const path = clean(body.storagePath);
      const sourceId = clean(body.sourceDocumentoId);
      const tipo = clean(body.tipoDocumento) || 'OUTROS';
      const categoria = clean(body.categoria) || tipo;
      const now = new Date().toISOString();
      const { data: doc, error } = await service.from('documentos_funcionario').insert({
        funcionario_id:employeeId, funcionario_nome:emp.nome, company_id:scope.companyId,
        empresa_nome:clean(scope.company?.nome || scope.company?.razao_social), tipo_documento:tipo,
        competencia:clean(body.competencia), descricao:clean(body.descricao) || `${tipo} recebido da filial`,
        arquivo_url:path, gerado_por_user_id:null, gerado_por_nome:scope.actorName,
        status_envio:'gerado', unidade:scope.filial || clean(scope.company?.nome), categoria,
        origem:'filial_assinado', observacao:clean(body.observacao) || 'Documento recebido/assinado pela filial',
        nome_arquivo:clean(body.fileName), data_documento:now, storage_bucket:'documentos-funcionarios', storage_path:path,
      }).select().single();
      if (error) throw error;
      if (sourceId) {
        const { data: src } = await service.from('documentos_funcionario').select('id,company_id,funcionario_id,competencia,tipo_documento').eq('id',sourceId).maybeSingle();
        if (!src || clean(src.company_id) !== scope.companyId || clean(src.funcionario_id) !== employeeId) throw Object.assign(new Error('documento_origem_invalido'),{status:403});
        const { error:flowError } = await service.from('filial_documentos_fluxo').upsert({
          company_id:scope.companyId, funcionario_id:employeeId, source_documento_id:sourceId,
          devolvido_documento_id:(doc as any).id, competencia:src.competencia || clean(body.competencia),
          tipo:src.tipo_documento || tipo, status:'devolvido', acesso_externo_id:scope.accessId,
          devolvido_em:now, updated_at:now,
        },{onConflict:'source_documento_id'});
        if (flowError) throw flowError;
      }
      return sendJson(res,{ok:true,document:doc});
    }

    if (action === 'pre_list') {
      const { data, error } = await service.from('pre_cadastros_admissionais').select('*').eq('empresa_id',scope.companyId).order('created_at',{ascending:false}).limit(200);
      if (error) throw error;
      return sendJson(res,{ok:true,rows:data || []});
    }

    if (action === 'pre_save') {
      const id = clean(body.id);
      const payload:any = {
        empresa_id:scope.companyId,
        empresa_nome:clean(scope.company?.nome || scope.company?.razao_social),
        cnpj:clean(scope.company?.cnpj),
        nome:clean(body.nome), cpf:digits(body.cpf), rg:clean(body.rg),
        data_nascimento:clean(body.dataNascimento) || null, data_admissao:clean(body.dataAdmissao) || null,
        funcao:clean(body.funcao), salario:Number(body.salario || 0), tipo_admissao:'Admissional',
        email:clean(body.email), celular:clean(body.celular), vale_refeicao:!!body.valeRefeicao, vale_transporte:!!body.valeTransporte,
        status:clean(body.status) || 'aguardando_validacao',
        criado_por_acesso_externo_id:scope.accessId,
        filial_origem:scope.filial || clean(scope.company?.nome),
        email_filial_origem:scope.actorEmail || null,
        updated_at:new Date().toISOString(),
      };
      if (!payload.nome || payload.cpf.length !== 11 || !payload.funcao) return sendJson(res,{ok:false,error:'nome_cpf_funcao_obrigatorios'},400);
      let result:any;
      if (id) {
        const { data: current } = await service.from('pre_cadastros_admissionais').select('id,empresa_id').eq('id',id).maybeSingle();
        if (!current || clean(current.empresa_id)!==scope.companyId) throw Object.assign(new Error('pre_cadastro_fora_da_filial'),{status:403});
        result = await service.from('pre_cadastros_admissionais').update(payload).eq('id',id).select().single();
      } else {
        result = await service.from('pre_cadastros_admissionais').insert({...payload,created_at:new Date().toISOString()}).select().single();
      }
      if (result.error) throw result.error;
      return sendJson(res,{ok:true,row:result.data});
    }

    if (action === 'prepare_pre_upload') {
      const preId = clean(body.preCadastroId);
      const { data: pre } = await service.from('pre_cadastros_admissionais').select('id,empresa_id').eq('id',preId).maybeSingle();
      if (!pre || clean(pre.empresa_id)!==scope.companyId) throw Object.assign(new Error('pre_cadastro_fora_da_filial'),{status:403});
      const bucket='documentos-admissionais';
      const path=`filial/${scope.companyId}/${preId}/${Date.now()}_${safe(body.fileName)}`;
      const { data, error } = await service.storage.from(bucket).createSignedUploadUrl(path,{upsert:false});
      if (error || !data?.token) throw error || new Error('signed_upload_failed');
      return sendJson(res,{ok:true,bucket,path,token:data.token,fileName:safe(body.fileName)});
    }

    if (action === 'finalize_pre_upload') {
      const preId=clean(body.preCadastroId);
      const { data: pre } = await service.from('pre_cadastros_admissionais').select('id,empresa_id').eq('id',preId).maybeSingle();
      if (!pre || clean(pre.empresa_id)!==scope.companyId) throw Object.assign(new Error('pre_cadastro_fora_da_filial'),{status:403});
      const bucket='documentos-admissionais';
      const path=clean(body.storagePath);
      const tipo=clean(body.tipoDocumento) || 'ficha_solicitacao_emprego';
      const publicUrl=(service.storage.from(bucket).getPublicUrl(path).data as any)?.publicUrl || '';
      const { error } = await service.from('pre_cadastro_documentos').insert({
        pre_cadastro_id:preId,tipo_documento:tipo,nome_arquivo:clean(body.fileName),arquivo_url:publicUrl,status:'recebido',
        dados_extraidos:{bucket,path,origem:'filial',enviado_por:scope.actorName},
      });
      if (error) throw error;
      const patch:any = {updated_at:new Date().toISOString()};
      if (tipo.includes('ficha') || tipo.includes('documentacao')) patch.arquivo_ficha_url=publicUrl;
      if (tipo==='aso') patch.arquivo_aso_url=publicUrl;
      await service.from('pre_cadastros_admissionais').update(patch).eq('id',preId);
      return sendJson(res,{ok:true,url:publicUrl});
    }

    if (action === 'pre_send') {
      const preId=clean(body.preCadastroId);
      const { data: pre, error:preError } = await service.from('pre_cadastros_admissionais').select('*').eq('id',preId).maybeSingle();
      if (preError) throw preError;
      if (!pre || clean(pre.empresa_id)!==scope.companyId) throw Object.assign(new Error('pre_cadastro_fora_da_filial'),{status:403});
      const { data: docs, error:docsError } = await service.from('pre_cadastro_documentos').select('*').eq('pre_cadastro_id',preId).order('created_at',{ascending:true});
      if (docsError) throw docsError;
      if (!(docs || []).length) return sendJson(res,{ok:false,error:'anexe_a_ficha_ou_documentos'},400);

      const to=['dp@aatconsultoria.com.br','marisa@aatconsultoria.com.br'];
      const cc=Array.from(new Set(['adm.matriz@topac.com.br','robson@topac.com.br',scope.actorEmail].filter(Boolean)));
      const replyTo=Array.from(new Set(['adm.matriz@topac.com.br',scope.actorEmail].filter(Boolean)));
      const subject=`Pré-cadastro admissional - ${clean(pre.nome)} - ${clean(pre.empresa_nome)}`;
      const threadKey=buildAccountingProcessThreadKey({originType:'admissao',originId:preId,companyId:scope.companyId,reference:pre.data_admissao});
      const thread=await prepareAccountingThread(service,{threadKey,subject});
      const lines=(docs || []).map((d:any)=>`<li>${clean(d.nome_arquivo || d.tipo_documento)}</li>`).join('');
      const html=`<div style="font-family:Arial,sans-serif;color:#182033;line-height:1.55"><p>Prezados,</p><p>Segue pré-cadastro admissional enviado pela filial para continuidade do processo.</p><table style="border-collapse:collapse;width:100%;max-width:720px"><tr><td><b>Nome</b></td><td>${clean(pre.nome)}</td></tr><tr><td><b>CPF</b></td><td>${clean(pre.cpf)}</td></tr><tr><td><b>Empresa</b></td><td>${clean(pre.empresa_nome)}</td></tr><tr><td><b>Função</b></td><td>${clean(pre.funcao)}</td></tr><tr><td><b>Admissão</b></td><td>${clean(pre.data_admissao)}</td></tr><tr><td><b>Origem</b></td><td>${clean(scope.filial || scope.company?.nome)}</td></tr></table><p><b>Arquivos:</b></p><ul>${lines}</ul><p>O retorno deste pré-cadastro deve seguir para a Matriz, mantendo o responsável da filial em cópia.</p><p>Atenciosamente,<br>TOPAC RH PRO</p></div>`;

      const attachments:any[]=[];
      for (const d of docs || []) {
        const buf=await loadStoredBlob(service,d);
        if (buf.length>12*1024*1024) throw new Error(`anexo_muito_grande_${safe(d.nome_arquivo)}`);
        attachments.push({filename:safe(d.nome_arquivo || d.tipo_documento || 'documento.pdf'),content:buf.toString('base64')});
      }
      const apiKey=clean(process.env.RESEND_API_KEY);
      if (!apiKey) throw new Error('resend_nao_configurado');
      const payload:any={
        from:'TOPAC RH PRO | Pré-Cadastro Filial <contabilidade.sp@topacrh.pro>',
        to,cc,reply_to:replyTo,subject:thread.subject,html,attachments,
        ...(Object.keys(thread.headers).length?{headers:thread.headers}:{})
      };
      const emailRes=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const emailData=await emailRes.json().catch(()=>({}));
      if (!emailRes.ok) throw new Error(clean(emailData?.message || emailData?.error || 'falha_envio_contabilidade'));
      const messageId=await fetchResendMessageId(apiKey,emailData?.id || null);
      await saveAccountingThread(service,{threadKey,empresaId:scope.companyId,subject:thread.subject,providerEmailId:emailData?.id || null,messageId});
      const now=new Date().toISOString();
      const hist=Array.isArray(pre.historico)?pre.historico:[];
      await service.from('pre_cadastros_admissionais').update({
        status:'aguardando_aso',email_contabilidade_preparado_em:now,
        historico:[...hist,{em:now,acao:'pre_cadastro_filial_enviado_contabilidade',por:scope.actorName,email_id:emailData?.id || null}],
        updated_at:now,
      }).eq('id',preId);
      return sendJson(res,{ok:true,to,cc,reply_to:replyTo,email_id:emailData?.id || null});
    }

    return sendJson(res,{ok:false,error:'acao_invalida'},400);
  } catch (error:any) {
    console.error('[filial-portal]',error);
    return sendJson(res,{ok:false,error:clean(error?.message || 'erro_interno')},Number(error?.status)||500);
  }
}
