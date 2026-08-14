import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
const BACKEND_KEY_SHA256='a7ce4883bfe9c951e0ec008450ae8f4a595a1fd002a2c02ce0fa3131b6995838';
const norm=(v:unknown)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
async function digest(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return reply({message:'Método não permitido.'},405);
  const supplied=req.headers.get('x-topac-backend-key')||'';
  if(!supplied||await digest(supplied)!==BACKEND_KEY_SHA256)return reply({message:'Origem não autorizada.'},403);
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  const rest=async(path:string,init:RequestInit={})=>{const r=await fetch(`${url}/rest/v1/${path}`,{...init,headers:{...headers,...(init.headers||{})}}),text=await r.text();if(!r.ok)throw new Error(`${path}:${r.status}:${text}`);return text?JSON.parse(text):null};
  const context=async(body:any)=>{
    const employees=await rest('funcionarios?ativo=eq.true&select=id,nome,cargo,empresa_id,company_id,ativo,status&limit=500');
    const companies=await rest('empresas?select=id,nome,status&limit=100');
    const companyMap=new Map(companies.map((x:any)=>[x.id,x]));
    const current=employees.find((x:any)=>norm(x.nome)===norm(body.employeeName));
    let companyId=current?.empresa_id||current?.company_id||'';
    if(!companyId)companyId=companies.find((x:any)=>norm(x.nome)===norm(body.companyName))?.id||'';
    const company:any=companyMap.get(companyId)||companies.find((x:any)=>x.id===companyId);
    const mechanics=employees.filter((x:any)=>{const id=x.empresa_id||x.company_id,cargo=norm(x.cargo),active=x.ativo!==false&&!String(x.status||'ativo').toLowerCase().startsWith('inativ');return active&&id===companyId&&cargo.includes('MECANIC')&&x.id!==current?.id}).sort((a:any,b:any)=>String(a.nome).localeCompare(String(b.nome),'pt-BR'));
    return{current,companyId,company,mechanics};
  };
  try{
    const body=await req.json(),action=String(body.action||'');
    if(action==='companions'){
      const ctx=await context(body);if(!ctx.companyId)return reply({message:'Não foi possível identificar a empresa do mecânico.'},422);
      return reply({companyId:ctx.companyId,companyName:ctx.company?.nome||body.companyName||'',rows:ctx.mechanics.map((x:any)=>({id:x.id,nome:x.nome,cargo:x.cargo||''}))});
    }
    if(action==='create'){
      if(!body.appRequestId)return reply({message:'Solicitação local inválida.'},400);
      const ctx=await context(body);if(!ctx.companyId)return reply({message:'Não foi possível vincular a solicitação à empresa no TOPAC.'},422);
      const allowed=new Map(ctx.mechanics.map((x:any)=>[x.id,x]));
      const ids=[...new Set((Array.isArray(body.companionIds)?body.companionIds:[]).map(String))];
      const invalid=ids.filter(id=>!allowed.has(id));if(invalid.length)return reply({message:'Um acompanhante selecionado não pertence à equipe de mecânicos desta empresa.'},422);
      const record={app_request_id:String(body.appRequestId),funcionario_id:ctx.current?.id||null,employee_code:String(body.employeeCode||''),funcionario_nome:String(body.employeeName||''),company_id:ctx.companyId,empresa_nome:ctx.company?.nome||String(body.companyName||''),filial:String(body.branch||''),placa:String(body.plate||''),combustivel:String(body.fuelType||''),posto_nome:String(body.stationName||''),solicitado_em:String(body.requestedAt||new Date().toISOString()),status:'pendente'};
      const authRows=await rest('abastecimento_autorizacoes?on_conflict=app_request_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(record)}),auth=authRows?.[0];
      await rest(`abastecimento_acompanhantes?app_request_id=eq.${encodeURIComponent(String(body.appRequestId))}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
      const companions=ids.map(id=>{const x:any=allowed.get(id);return{autorizacao_id:auth.id,app_request_id:String(body.appRequestId),funcionario_id:ctx.current?.id||null,acompanhante_id:id,acompanhante_nome:x.nome,company_id:ctx.companyId,empresa_nome:ctx.company?.nome||String(body.companyName||'')}});
      if(companions.length)await rest('abastecimento_acompanhantes',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(companions)});
      return reply({authorization:auth,companions:companions.map((x:any)=>({id:x.acompanhante_id,nome:x.acompanhante_nome}))});
    }
    if(action==='status'){
      if(!body.appRequestId)return reply({message:'Solicitação inválida.'},400);
      const rows=await rest(`abastecimento_autorizacoes?app_request_id=eq.${encodeURIComponent(String(body.appRequestId))}&select=*`),auth=rows?.[0]||null;
      if(!auth)return reply({authorization:null,companions:[]});
      const companions=await rest(`abastecimento_acompanhantes?app_request_id=eq.${encodeURIComponent(String(body.appRequestId))}&select=acompanhante_id,acompanhante_nome&order=acompanhante_nome`);
      return reply({authorization:auth,companions:(companions||[]).map((x:any)=>({id:x.acompanhante_id,nome:x.acompanhante_nome}))});
    }
    if(action==='complete'){
      if(!body.appRequestId||!body.appFuelId)return reply({message:'Fechamento operacional incompleto.'},400);
      const result=await rest('rpc/topac_concluir_abastecimento_operacional',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({p_app_request_id:String(body.appRequestId),p_app_fuel_id:String(body.appFuelId),p_payload:body.payload||{}})});
      const companions=await rest(`abastecimento_acompanhantes?app_request_id=eq.${encodeURIComponent(String(body.appRequestId))}&select=acompanhante_id,acompanhante_nome&order=acompanhante_nome`);
      return reply({authorization:Array.isArray(result)?result[0]:result,companions:(companions||[]).map((x:any)=>({id:x.acompanhante_id,nome:x.acompanhante_nome}))});
    }
    return reply({message:'Ação inválida.'},400);
  }catch(error){console.error('topac-abastecimento-operacional',error);return reply({message:'Não foi possível concluir a integração operacional com o TOPAC.'},500)}
});