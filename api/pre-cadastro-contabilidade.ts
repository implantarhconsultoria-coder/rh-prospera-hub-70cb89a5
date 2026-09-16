import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';

const clean = (value:unknown) => String(value ?? '').trim();
const getHeader = (req:any, name:string) => typeof req?.headers?.get === 'function' ? req.headers.get(name) : req?.headers?.[name] || req?.headers?.[name.toLowerCase()] || '';
const getBearer = (req:any) => String(getHeader(req,'authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1] || '';
const esc = (v:unknown) => clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c] || c));
const formatDate = (value:unknown) => { const s=clean(value); const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]}`:s; };
const formatMoney = (value:unknown) => Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const safeFileName = (value:unknown) => clean(value).replace(/[^a-zA-Z0-9À-ÿ_.() -]+/g,'_').slice(0,140) || 'documento';

const validateAdmin = async (req:any, service:any) => {
  const token=getBearer(req); if(!token) throw Object.assign(new Error('sessao_invalida'),{status:401});
  const {data:{user},error}=await service.auth.getUser(token); if(error||!user) throw Object.assign(new Error('sessao_invalida'),{status:401});
  const {data:roles,error:roleError}=await service.from('user_roles').select('role').eq('user_id',user.id); if(roleError) throw roleError;
  if(!(roles||[]).some((r:any)=>['admin','diretor_geral'].includes(String(r.role)))) throw Object.assign(new Error('sem_permissao'),{status:403});
  return user;
};

const fileToAttachment = async (doc:any) => {
  const url=clean(doc.arquivo_url); if(!url) return null;
  const response=await fetch(url); if(!response.ok) throw new Error(`falha_anexo_${clean(doc.tipo_documento)}`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>12*1024*1024) throw new Error(`anexo_muito_grande_${clean(doc.nome_arquivo)}`);
  let binary=''; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return { filename:safeFileName(doc.nome_arquivo||`${doc.tipo_documento}.pdf`), content:btoa(binary) };
};

export default async function handler(req:any,res?:any){
  if(String(req?.method||'POST').toUpperCase()!=='POST') return sendJson(res,{ok:false,error:'method_not_allowed'},405);
  try{
    const service=getServiceClient(); const user=await validateAdmin(req,service); const body=readBody(req); const id=clean(body.preCadastroId);
    if(!id) return sendJson(res,{ok:false,error:'pre_cadastro_obrigatorio'},400);
    const {data:pre,error:preError}=await service.from('pre_cadastros_admissionais').select('*').eq('id',id).maybeSingle(); if(preError) throw preError;
    if(!pre) return sendJson(res,{ok:false,error:'pre_cadastro_nao_encontrado'},404);
    const {data:docs,error:docsError}=await service.from('pre_cadastro_documentos').select('tipo_documento,nome_arquivo,arquivo_url,status,created_at').eq('pre_cadastro_id',id).order('created_at',{ascending:true}); if(docsError) throw docsError;
    const aso=(docs||[]).find((d:any)=>String(d.tipo_documento).toLowerCase()==='aso') || (pre.arquivo_aso_url?{tipo_documento:'aso',nome_arquivo:'ASO.pdf',arquivo_url:pre.arquivo_aso_url}:null);
    if(!aso?.arquivo_url) return sendJson(res,{ok:false,error:'aso_nao_encontrado'},400);

    const isGoiania=/GOIANIA|GOIÂNIA/i.test(clean(pre.empresa_nome)) || clean(pre.empresa_id)==='c7a040f2-34b3-42a6-8a3a-f4bb64140ec6';
    const to=isGoiania?['requisicao@incocontabilidade.com.br']:['dp@aatconsultoria.com.br','marisa@aatconsultoria.com.br'];
    const cc=isGoiania?['adm.gyn@topac.com.br']:['adm.matriz@topac.com.br','robson@topac.com.br'];
    const from=isGoiania?'TOPAC RH PRO | Contabilidade Goiânia <contabilidade.goiania@topacrh.pro>':'TOPAC RH PRO | Contabilidade SP <contabilidade.sp@topacrh.pro>';
    const replyTo=isGoiania?'adm.gyn@topac.com.br':'adm.matriz@topac.com.br';
    const subject=`Documentação admissional completa - ${clean(pre.nome)} - ${clean(pre.empresa_nome)}`;
    const documentLines=(docs||[]).filter((d:any)=>clean(d.arquivo_url)).map((d:any)=>`<li>${esc(d.nome_arquivo||d.tipo_documento)}</li>`).join('');
    const html=`<div style="font-family:Arial,sans-serif;color:#182033;line-height:1.55"><p>Prezados,</p><p>O processo admissional abaixo foi concluído no TOPAC RH PRO e o ASO retornou ao sistema. A documentação segue anexada para continuidade junto à contabilidade.</p><table style="border-collapse:collapse;width:100%;max-width:720px"><tr><td style="padding:6px;border-bottom:1px solid #ddd"><b>Nome</b></td><td style="padding:6px;border-bottom:1px solid #ddd">${esc(pre.nome)}</td></tr><tr><td style="padding:6px;border-bottom:1px solid #ddd"><b>CPF</b></td><td style="padding:6px;border-bottom:1px solid #ddd">${esc(pre.cpf)}</td></tr><tr><td style="padding:6px;border-bottom:1px solid #ddd"><b>Empresa</b></td><td style="padding:6px;border-bottom:1px solid #ddd">${esc(pre.empresa_nome)}</td></tr><tr><td style="padding:6px;border-bottom:1px solid #ddd"><b>Função</b></td><td style="padding:6px;border-bottom:1px solid #ddd">${esc(pre.funcao)}</td></tr><tr><td style="padding:6px;border-bottom:1px solid #ddd"><b>Admissão</b></td><td style="padding:6px;border-bottom:1px solid #ddd">${esc(formatDate(pre.data_admissao))}</td></tr><tr><td style="padding:6px;border-bottom:1px solid #ddd"><b>Salário</b></td><td style="padding:6px;border-bottom:1px solid #ddd">${esc(formatMoney(pre.salario))}</td></tr><tr><td style="padding:6px;border-bottom:1px solid #ddd"><b>Celular</b></td><td style="padding:6px;border-bottom:1px solid #ddd">${esc(pre.celular)}</td></tr><tr><td style="padding:6px;border-bottom:1px solid #ddd"><b>E-mail</b></td><td style="padding:6px;border-bottom:1px solid #ddd">${esc(pre.email)}</td></tr></table><p><b>Arquivos anexados:</b></p><ul>${documentLines}</ul><p>Atenciosamente,<br>TOPAC RH PRO</p></div>`;

    const uniqueDocs:any[]=[]; const seen=new Set<string>();
    for(const doc of [...(docs||[]),aso]){const url=clean(doc?.arquivo_url);if(!url||seen.has(url))continue;seen.add(url);uniqueDocs.push(doc);}
    const attachments:any[]=[]; let total=0;
    for(const doc of uniqueDocs){const att=await fileToAttachment(doc);if(!att)continue;total+=Math.ceil(att.content.length*0.75);if(total>35*1024*1024) throw new Error('anexos_excedem_limite_email');attachments.push(att);}

    const apiKey=clean(process.env.RESEND_API_KEY); if(!apiKey) throw new Error('resend_nao_configurado');
    const emailRes=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to,cc,reply_to:replyTo,subject,html,attachments})});
    const emailData=await emailRes.json().catch(()=>({})); if(!emailRes.ok) throw new Error(clean(emailData?.message||emailData?.error||'falha_envio_contabilidade'));
    const now=new Date().toISOString(); const history=Array.isArray(pre.historico)?pre.historico:[];
    const {error:updateError}=await service.from('pre_cadastros_admissionais').update({status:'documentacao_completa',email_contabilidade_preparado_em:now,historico:[...history,{em:now,acao:'documentacao_admissional_enviada_contabilidade_automaticamente',email_id:emailData?.id||null,por:user.id}],updated_at:now}).eq('id',id); if(updateError) throw updateError;
    return sendJson(res,{ok:true,email_id:emailData?.id||null,to,cc,status:'documentacao_completa'});
  }catch(error:any){console.error('[pre-cadastro-contabilidade]',error);return sendJson(res,{ok:false,error:clean(error?.message||'erro_interno')},Number(error?.status)||500);}
}
