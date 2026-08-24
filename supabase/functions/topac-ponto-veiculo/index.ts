import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
const INTERNAL_KEY_SHA256='300cca2649b7a1acacea8e4db40ce07f8ec0820cc7e8a95f25165a5137201bf1';
const BUCKET='ponto-veiculo';
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const only=(v:unknown)=>String(v||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
const safePart=(v:unknown)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'na';
const encodePath=(path:string)=>path.split('/').map(encodeURIComponent).join('/');
async function digest(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function media(value:any){const data=String(value?.data||'').replace(/^data:image\/[a-z0-9.+-]+;base64,/i,'').replace(/\s+/g,''),mimeType=String(value?.mimeType||'').split(';')[0].toLowerCase();if(!data||!['image/jpeg','image/png','image/webp'].includes(mimeType))throw new Error('Foto do painel inválida.');const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>6291456)throw new Error('Foto do painel vazia ou acima de 6 MB.');return{bytes,mimeType,ext:mimeType.includes('png')?'png':mimeType.includes('webp')?'webp':'jpg'}}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({message:'Método não permitido.'},405);
 const supplied=req.headers.get('x-topac-backend-key')||'';
 if(!supplied||await digest(supplied)!==INTERNAL_KEY_SHA256)return reply({message:'Origem não autorizada.'},403);
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'};
 const rest=async(path:string,init:RequestInit={})=>{const r=await fetch(`${url}/rest/v1/${path}`,{...init,headers:{...headers,...(init.headers||{})}}),t=await r.text();if(!r.ok)throw new Error(`REST_${r.status}`);return t?JSON.parse(t):[]};
 const upload=async(base:string,img:any)=>{const m=media(img),path=`${base}-${crypto.randomUUID()}.${m.ext}`,r=await fetch(`${url}/storage/v1/object/${BUCKET}/${encodePath(path)}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':m.mimeType,'x-upsert':'false'},body:m.bytes});if(!r.ok)throw new Error(`STORAGE_${r.status}`);return path};
 const remove=async(path:string)=>{if(!path)return;await fetch(`${url}/storage/v1/object/${BUCKET}/${encodePath(path)}`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`}}).catch(()=>{})};
 const signed=async(path:string)=>{const r=await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${encodePath(path)}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:900})}),t=await r.text();if(!r.ok)throw new Error(`SIGN_${r.status}`);const d=t?JSON.parse(t):{},s=String(d.signedURL||d.signedUrl||'');return s.startsWith('http')?s:`${url}/storage/v1${s}`};
 try{
  const body=await req.json(),action=String(body?.action||'');
  if(action==='start'){
   const employeeCode=String(body.employeeCode||'').trim(),employee=String(body.employee||'').trim(),company=String(body.company||''),branch=String(body.branch||''),plate=only(body.vehiclePlate),description=String(body.vehicleDescription||''),km=Number(body.km),kmOcr=body.kmOcr==null?null:Number(body.kmOcr),loc=body.loc||{};
   if(!employeeCode||!employee||!plate||!Number.isSafeInteger(km)||km<0)return reply({message:'Funcionário, veículo e KM inicial são obrigatórios.'},422);
   if(!Number.isFinite(Number(loc.lat))||!Number.isFinite(Number(loc.lng)))return reply({message:'Geolocalização obrigatória.'},422);
   const now=new Date(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),month=date.slice(0,7);
   const existing=await rest(`ponto_veiculo?employee_code=eq.${encodeURIComponent(employeeCode)}&data=eq.${date}&select=id,status,km_saida,km_chegada,km_total&limit=1`);if(existing[0])return reply({message:'O KM de saída de hoje já foi registrado.'},409);
   let funcionario:any=null;if(body.funcionarioId)funcionario=(await rest(`funcionarios?id=eq.${encodeURIComponent(String(body.funcionarioId))}&select=id,empresa_id,company_id,nome&limit=1`))[0]||null;
   if(!funcionario)funcionario=(await rest(`funcionarios?nome=eq.${encodeURIComponent(employee)}&select=id,empresa_id,company_id,nome&limit=1`))[0]||null;
   let empresaId=funcionario?.empresa_id||funcionario?.company_id||null;if(!empresaId&&company)empresaId=(await rest(`empresas?nome=eq.${encodeURIComponent(company)}&select=id&limit=1`))[0]?.id||null;
   const ativo=(await rest(`ativos?placa=eq.${encodeURIComponent(plate)}&select=id,descricao,marca,modelo,placa&limit=1`))[0]||null;
   let photoPath='';try{photoPath=await upload(`${month}/${safePart(employeeCode)}/${safePart(plate)}/saida`,body.photo);const rows=await rest('ponto_veiculo',{method:'POST',body:JSON.stringify({funcionario_id:funcionario?.id||null,empresa_id:empresaId,ativo_id:ativo?.id||null,employee_code:employeeCode,funcionario_nome:employee,empresa_nome:company,filial:branch,data:date,veiculo_placa:plate,veiculo_descricao:description||ativo?.descricao||[ativo?.marca,ativo?.modelo].filter(Boolean).join(' '),km_saida:km,km_saida_ocr:Number.isFinite(kmOcr)?kmOcr:null,saida_origem_km:Number.isFinite(kmOcr)&&km===kmOcr?'ocr_confirmado':'manual_corrigido',saida_em:now.toISOString(),saida_latitude:Number(loc.lat),saida_longitude:Number(loc.lng),saida_precisao_metros:Number(loc.acc||0)||null,saida_foto_path:photoPath,saida_device:String(body.device||''),status:'aberto'})});return reply({ok:true,record:rows[0]})}catch(error){await remove(photoPath);throw error}
  }
  if(action==='finish'){
   const employeeCode=String(body.employeeCode||'').trim(),km=Number(body.km),kmOcr=body.kmOcr==null?null:Number(body.kmOcr),loc=body.loc||{};if(!employeeCode||!Number.isSafeInteger(km)||km<0)return reply({message:'KM final inválido.'},422);if(!Number.isFinite(Number(loc.lat))||!Number.isFinite(Number(loc.lng)))return reply({message:'Geolocalização obrigatória.'},422);
   const open=(await rest(`ponto_veiculo?employee_code=eq.${encodeURIComponent(employeeCode)}&status=eq.aberto&select=*&order=saida_em.desc&limit=1`))[0];if(!open)return reply({message:'Não existe KM de saída em aberto para concluir.'},409);if(km<Number(open.km_saida))return reply({message:`O KM de chegada não pode ser menor que o KM de saída (${open.km_saida}).`},422);
   let photoPath='';try{photoPath=await upload(`${String(open.data).slice(0,7)}/${safePart(employeeCode)}/${safePart(open.veiculo_placa)}/chegada`,body.photo);const rows=await rest(`ponto_veiculo?id=eq.${encodeURIComponent(open.id)}`,{method:'PATCH',body:JSON.stringify({km_chegada:km,km_chegada_ocr:Number.isFinite(kmOcr)?kmOcr:null,chegada_origem_km:Number.isFinite(kmOcr)&&km===kmOcr?'ocr_confirmado':'manual_corrigido',chegada_em:new Date().toISOString(),chegada_latitude:Number(loc.lat),chegada_longitude:Number(loc.lng),chegada_precisao_metros:Number(loc.acc||0)||null,chegada_foto_path:photoPath,chegada_device:String(body.device||''),status:'concluido',updated_at:new Date().toISOString()})});return reply({ok:true,record:rows[0]})}catch(error){await remove(photoPath);throw error}
  }
  if(action==='report'){
   const month=String(body.month||'');if(!/^\d{4}-\d{2}$/.test(month))return reply({message:'Competência inválida.'},422);const [year,mon]=month.split('-').map(Number),next=mon===12?`${year+1}-01-01`:`${year}-${String(mon+1).padStart(2,'0')}-01`,employeeCode=String(body.employeeCode||'').trim(),filter=employeeCode?`&employee_code=eq.${encodeURIComponent(employeeCode)}`:'';const rows=await rest(`ponto_veiculo?data=gte.${month}-01&data=lt.${next}${filter}&select=*&order=data.asc,funcionario_nome.asc`);return reply({rows})
  }
  if(action==='photo-link'){
   const id=String(body.id||''),kind=body.kind==='chegada'?'chegada':'saida',row=(await rest(`ponto_veiculo?id=eq.${encodeURIComponent(id)}&select=saida_foto_path,chegada_foto_path&limit=1`))[0];if(!row)return reply({message:'Registro não encontrado.'},404);const path=kind==='chegada'?row.chegada_foto_path:row.saida_foto_path;if(!path)return reply({message:'Foto não disponível.'},404);return reply({url:await signed(path)})
  }
  return reply({message:'Ação inválida.'},400);
 }catch(error){console.error('topac-ponto-veiculo',{message:error instanceof Error?error.message:'erro'});return reply({message:'Não foi possível concluir o ponto do veículo agora.'},500)}
});