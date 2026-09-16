import fs from 'node:fs';

const file = 'src/app-mecanico/pages/AbastecimentoPageV4.tsx';
if (!fs.existsSync(file)) process.exit(0);
let src = fs.readFileSync(file, 'utf8');

const replace = (from, to, label) => {
  if (src.includes(to)) return;
  if (!src.includes(from)) throw new Error(`[abastecimento-gateway] trecho não encontrado: ${label}`);
  src = src.replace(from, to);
};

replace(
`      const { data, error } = await supabase.functions.invoke("ocr-bomba-combustivel", { body: { fileUrl: url, tipo: "bomba" } });
      const result = data as PumpOcrResult | null;
      if (error || !result?.ok) return null;`,
`      const response = await fetch("/api/abastecimento-ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileUrl: url, tipo: "bomba" }) });
      const result = await response.json().catch(() => null) as PumpOcrResult | null;
      if (!response.ok || !result?.ok) return null;`,
'bomba via gateway');

replace(
`      const { data, error } = await supabase.functions.invoke("ocr-bomba-combustivel", { body: { fileUrl: url, tipo: "painel_km" } });
      const result = data as PanelOcrResult | null;
      if (error || !result?.ok) return null;`,
`      const response = await fetch("/api/abastecimento-ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileUrl: url, tipo: "painel_km" }) });
      const result = await response.json().catch(() => null) as PanelOcrResult | null;
      if (!response.ok || !result?.ok) return null;`,
'painel via gateway');

fs.writeFileSync(file, src);
console.log('[abastecimento-gateway] OCR ligado ao Vercel AI Gateway');

await import('./fix-abastecimento-ocr-nao-bloqueante-build.mjs');
