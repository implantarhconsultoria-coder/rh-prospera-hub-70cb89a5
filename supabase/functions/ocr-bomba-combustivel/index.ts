// Edge function: ocr-bomba-combustivel
// Reads fuel-pump displays and vehicle odometers for the mechanic app.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function collectApiKeys(value: unknown, keys: string[]): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) keys.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectApiKeys(item, keys));
    return;
  }
  if (value && typeof value === "object") Object.values(value).forEach((item) => collectApiKeys(item, keys));
}

function configuredApiKeys(): string[] {
  const keys: string[] = [];
  collectApiKeys(Deno.env.get("SUPABASE_PUBLISHABLE_KEY"), keys);
  collectApiKeys(Deno.env.get("SUPABASE_ANON_KEY"), keys);
  const configured = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (configured) {
    try { collectApiKeys(JSON.parse(configured), keys); }
    catch { configured.split(",").forEach((value) => collectApiKeys(value, keys)); }
  }
  return [...new Set(keys)];
}

function hasAllowedApiKey(req: Request): boolean {
  const apiKey = req.headers.get("apikey")?.trim() || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const supplied = [apiKey, bearer].filter(Boolean);
  const configured = configuredApiKeys();
  if (configured.length > 0 && supplied.some((value) => configured.includes(value))) return true;
  return supplied.some((value) => value.startsWith("sb_publishable_") || value.split(".").length === 3);
}

const PUMP_PROMPT = `Analise UMA FOTO REAL do visor de uma bomba de combustivel em posto brasileiro.
Leia os tres displays principais e devolva SOMENTE JSON valido, sem markdown:
{"ok":boolean,"valor":numero,"litros":numero,"valor_por_litro":numero,"combustivel":"Gasolina"|"Etanol"|"Diesel"|"Diesel S10"|"GNV"|"","confianca":numero,"motivo":"texto curto"}
REGRAS:
- VALOR = TOTAL A PAGAR em reais; LITROS = quantidade abastecida; VALOR_POR_LITRO = PRECO POR LITRO.
- Em bombas brasileiras os displays costumam estar empilhados: em cima TOTAL A PAGAR, no meio LITROS, embaixo PRECO POR LITRO.
- Preserve casas decimais. Ex.: 277,95 = 277.95; 40,995 = 40.995; 6,780 = 6.780.
- Se a pontuacao decimal estiver pouco visivel, confirme usando TOTAL = LITROS x PRECO/L.
- Ignore hora, CNPJ, numero da bomba, placa, KM, telefone e textos pequenos.
- Se dois numeros estiverem claros, pode calcular o terceiro. Nao invente digitos.
Apenas JSON puro.`;

const PUMP_RETRY = `RELEIA A FOTO COM FOCO SOMENTE NOS TRES DISPLAYS GRANDES: TOTAL A PAGAR, LITROS e PRECO POR LITRO. Confira TOTAL = LITROS x PRECO/L e corrija virgula/ponto decimal quando necessario. Retorne o mesmo JSON puro.`;

const PANEL_PROMPT = `Analise UMA FOTO REAL do painel de um veiculo. Extraia SOMENTE a quilometragem TOTAL atual do hodometro/ODO e devolva SOMENTE JSON valido:
{"ok":boolean,"km":numero,"confianca":numero,"motivo":"texto curto"}
- Leia ODO/KM total/hodometro. Ignore velocidade, hora, temperatura, autonomia, consumo, Trip A e Trip B.
- Ex.: 58.775 km = 58775. Nao invente digitos. Apenas JSON puro.`;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}

function parseJsonContent(content: string): Record<string, unknown> {
  const cleaned = String(content || "").replace(/```json|```/gi, "").trim();
  try { return JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) { try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return {}; } }
    return {};
  }
}

function normalizeFuel(value: unknown): string {
  const raw = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!raw) return "";
  if (raw.includes("s10")) return "Diesel S10";
  if (raw.includes("diesel")) return "Diesel";
  if (raw.includes("etanol") || raw.includes("alcool") || raw.includes("alcohol")) return "Etanol";
  if (raw.includes("gnv")) return "GNV";
  if (raw.includes("gasolina") || raw === "gas") return "Gasolina";
  return "";
}

function plausible(value: number, kind: "valor" | "litros" | "preco" | "km"): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (kind === "valor") return value >= 5 && value <= 10000;
  if (kind === "litros") return value >= 0.5 && value <= 500;
  if (kind === "preco") return value >= 1.5 && value <= 30;
  return value >= 1000 && value <= 9999999;
}

function baseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? "").trim().replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!raw) return 0;
  const comma = raw.lastIndexOf(","), dot = raw.lastIndexOf(".");
  if (comma > dot) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (dot > comma) raw = raw.replace(/,/g, "");
  else raw = raw.replace(",", ".");
  const parsed = Number(raw); return Number.isFinite(parsed) ? parsed : 0;
}

function numberCandidates(value: unknown, kind: "valor" | "litros" | "preco"): number[] {
  const base = baseNumber(value); if (!base) return [];
  const rawDigits = Number(String(value ?? "").replace(/\D/g, "")) || 0;
  const divisors = kind === "valor" ? [1,10,100,1000] : [1,10,100,1000,10000];
  const out = new Set<number>();
  for (const seed of [base, rawDigits]) for (const divisor of divisors) {
    const candidate = seed / divisor;
    if (plausible(candidate, kind)) out.add(round(candidate, kind === "valor" ? 2 : 3));
  }
  return [...out];
}

function choosePump(valorRaw: unknown, litrosRaw: unknown, precoRaw: unknown) {
  let valores = numberCandidates(valorRaw, "valor");
  let litros = numberCandidates(litrosRaw, "litros");
  let precos = numberCandidates(precoRaw, "preco");
  if (!valores.length && litros.length && precos.length) valores = litros.flatMap(l => precos.map(p => round(l*p,2))).filter(v => plausible(v,"valor"));
  if (!litros.length && valores.length && precos.length) litros = valores.flatMap(v => precos.map(p => round(v/p,3))).filter(l => plausible(l,"litros"));
  if (!precos.length && valores.length && litros.length) precos = valores.flatMap(v => litros.map(l => round(v/l,3))).filter(p => plausible(p,"preco"));
  let best: {valor:number;litros:number;preco:number;score:number}|null = null;
  for (const valor of valores) for (const litro of litros) for (const preco of precos) {
    const rel = Math.abs(litro*preco-valor)/Math.max(valor,1);
    const score = rel + ((preco < 3 || preco > 12) ? 0.03 : 0);
    if (!best || score < best.score) best = {valor,litros:litro,preco,score};
  }
  if (!best) return {ok:false,valor:0,litros:0,preco:0};
  return {ok:best.score<=0.08,valor:round(best.valor,2),litros:round(best.litros,3),preco:round(best.preco,3)};
}

function parseKm(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (plausible(value,"km")) return Math.round(value);
    if (value > 1 && value < 1000) { const scaled=Math.round(value*1000); if (plausible(scaled,"km")) return scaled; }
  }
  const parsed = Number(String(value ?? "").replace(/\D/g, ""));
  return plausible(parsed,"km") ? Math.round(parsed) : 0;
}

async function requestOpenAI(imageUrl:string,isPanel:boolean,retry:boolean) {
  const key=Deno.env.get("OPENAI_API_KEY"); if(!key) return null;
  const model=Deno.env.get("OPENAI_MODEL")||"gpt-4o-mini";
  return fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:"system",content:isPanel?PANEL_PROMPT:PUMP_PROMPT},{role:"user",content:[{type:"text",text:isPanel?"Leia o ODO/hodometro total e retorne o KM atual.":(retry?PUMP_RETRY:"Leia valor total, litros e preco por litro dos displays da bomba.")},{type:"image_url",image_url:{url:imageUrl,detail:"high"}}]}],response_format:{type:"json_object"},temperature:0})});
}

async function requestLovable(imageUrl:string,isPanel:boolean,retry:boolean) {
  const key=Deno.env.get("LOVABLE_API_KEY"); if(!key) return null;
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:"google/gemini-2.5-flash",messages:[{role:"system",content:isPanel?PANEL_PROMPT:PUMP_PROMPT},{role:"user",content:[{type:"text",text:isPanel?"Leia o ODO/hodometro total e retorne o KM atual.":(retry?PUMP_RETRY:"Leia valor total, litros e preco por litro dos displays da bomba.")},{type:"image_url",image_url:{url:imageUrl}}]}],response_format:{type:"json_object"},temperature:0})});
}

async function readAi(imageUrl:string,isPanel:boolean,retry=false) {
  let provider="none"; let resp:Response|null=null;
  const openai=await requestOpenAI(imageUrl,isPanel,retry);
  if(openai?.ok){provider="openai";resp=openai;}
  else {
    const lovable=await requestLovable(imageUrl,isPanel,retry);
    if(lovable?.ok){provider="lovable";resp=lovable;}
    else if(openai){provider="openai";resp=openai;}
    else if(lovable){provider="lovable";resp=lovable;}
  }
  if(!resp) return {provider,parsed:{},error:"OCR_PROVIDER_ENV_AUSENTE"};
  if(!resp.ok) return {provider,parsed:{},error:`ai_error_${resp.status}`};
  const body=await resp.json();
  return {provider,parsed:parseJsonContent(body?.choices?.[0]?.message?.content||"{}"),error:""};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return new Response(JSON.stringify({ok:false,error:"method_not_allowed"}),{status:405,headers:{...corsHeaders,"Content-Type":"application/json"}});
  if(!hasAllowedApiKey(req)) return new Response(JSON.stringify({ok:false,error:"unauthorized"}),{status:401,headers:{...corsHeaders,"Content-Type":"application/json"}});
  try {
    const body=await req.json().catch(()=>({}));
    const imageUrl=(typeof body.dataUrl==="string"?body.dataUrl:"")||(typeof body.fileUrl==="string"?body.fileUrl:"");
    const isPanel=String(body.tipo||"bomba")==="painel_km";
    if(!imageUrl) return new Response(JSON.stringify({ok:false,error:"imagem_obrigatoria"}),{status:400,headers:{...corsHeaders,"Content-Type":"application/json"}});
    let read=await readAi(imageUrl,isPanel,false);
    if(read.error) read=await readAi(imageUrl,isPanel,true);
    if(read.error) return new Response(JSON.stringify({ok:false,error:read.error,provider:read.provider}),{status:502,headers:{...corsHeaders,"Content-Type":"application/json"}});
    if(isPanel){
      const p=read.parsed; const km=parseKm(p.km??p.km_atual??p.odometro??p.hodometro??p.odo); const ok=plausible(km,"km");
      return new Response(JSON.stringify({ok,km,km_atual:km,confianca:Number(p.confianca??p.confidence??(ok?.8:.3)),motivo:ok?"KM identificado automaticamente.":String(p.motivo||"Nao foi possivel confirmar o KM."),provider:read.provider}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
    }
    let p=read.parsed; let f=choosePump(p.valor??p.valor_total??p.total??p.total_pagar??p.valor_a_pagar,p.litros??p.quantidade_litros??p.volume??p.quantidade??p.qtd,p.valor_por_litro??p.preco_litro??p.preco_por_litro??p.preco_unitario??p.unitario??p.r_l);
    if(!f.ok){const second=await readAi(imageUrl,false,true);if(!second.error){read=second;p=second.parsed;f=choosePump(p.valor??p.valor_total??p.total??p.total_pagar??p.valor_a_pagar,p.litros??p.quantidade_litros??p.volume??p.quantidade??p.qtd,p.valor_por_litro??p.preco_litro??p.preco_por_litro??p.preco_unitario??p.unitario??p.r_l);}}
    return new Response(JSON.stringify({ok:f.ok,valor:f.valor,litros:f.litros,valor_por_litro:f.preco,combustivel:normalizeFuel(p.combustivel??p.tipo_combustivel??p.produto),confianca:Number(p.confianca??p.confidence??(f.ok?.8:.3)),motivo:f.ok?"Valor e litros identificados automaticamente.":String(p.motivo||"Nao foi possivel confirmar valor e litros."),provider:read.provider}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
  } catch(error){const detail=error instanceof Error?error.message:String(error);return new Response(JSON.stringify({ok:false,error:"erro_ocr",detail}),{status:500,headers:{...corsHeaders,"Content-Type":"application/json"}});}
});
