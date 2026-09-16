import fs from 'node:fs';

const pagePath = 'src/app-mecanico/pages/AbastecimentoPageV4.tsx';
const pdfPath = 'src/app-mecanico/lib/abastecimentoPdf.ts';

const replaceOrThrow = (text, from, to, label) => {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`[abastecimento-ocr] trecho não encontrado: ${label}`);
  return text.replace(from, to);
};

let page = fs.readFileSync(pagePath, 'utf8');

page = replaceOrThrow(
  page,
  'import { gerarCupomAbastecimentoPdf } from "../lib/abastecimentoPdf";',
  'import { gerarCupomAbastecimentoPdf } from "../lib/abastecimentoPdf";\nimport { normalizeKmOcrField, normalizePumpOcrFields } from "../lib/abastecimentoOcr";',
  'import OCR',
);

page = replaceOrThrow(
  page,
  '  combustivel: string;\n  fotoBombaUrl: string;',
  '  combustivel: string;\n  valor: number;\n  litros: number;\n  valorPorLitro: number;\n  kmAtual: number;\n  fotoBombaUrl: string;',
  'campos ReceiptInfo',
);

page = replaceOrThrow(
  page,
  'type StatusResult = { ok?: boolean; error?: string; authorization?: Authorization | null; posto?: Posto | null };',
  'type StatusResult = { ok?: boolean; error?: string; authorization?: Authorization | null; posto?: Posto | null };\ntype PumpOcrResult = { ok?: boolean; valor?: string | number; litros?: string | number; valor_por_litro?: string | number; confianca?: number; motivo?: string; error?: string };\ntype PanelOcrResult = { ok?: boolean; km?: string | number; km_atual?: string | number; confianca?: number; motivo?: string; error?: string };\ntype FuelReading = { valor: number; litros: number; precoLitro: number };',
  'tipos OCR',
);

page = replaceOrThrow(
  page,
  '  const [pdfCache, setPdfCache] = useState<{ blob: Blob; fileName: string } | null>(null);',
  '  const [pdfCache, setPdfCache] = useState<{ blob: Blob; fileName: string } | null>(null);\n  const [ocrBomba, setOcrBomba] = useState<FuelReading | null>(null);\n  const [ocrKm, setOcrKm] = useState<number | null>(null);\n  const [ocrLoading, setOcrLoading] = useState(false);',
  'states OCR',
);

const helpersAnchor = '  const publicStorageUrl = (path?: string | null) =>\n    path ? supabase.storage.from("abastecimento-fotos").getPublicUrl(path).data.publicUrl || "" : "";';
const helpersInjected = `${helpersAnchor}\n\n  const lerBombaAutomaticamente = useCallback(async (url: string): Promise<FuelReading | null> => {\n    setOcrLoading(true);\n    try {\n      const { data, error } = await supabase.functions.invoke("ocr-bomba-combustivel", { body: { fileUrl: url, tipo: "bomba" } });\n      const result = data as PumpOcrResult | null;\n      if (error || !result?.ok) return null;\n      const fields = normalizePumpOcrFields(result);\n      if (!fields.valor || !fields.litros) return null;\n      const leitura = { valor: fields.valor, litros: fields.litros, precoLitro: fields.precoLitro || Number((fields.valor / fields.litros).toFixed(3)) };\n      setOcrBomba(leitura);\n      return leitura;\n    } catch (error) {\n      console.warn("OCR da bomba indisponível:", error);\n      return null;\n    } finally { setOcrLoading(false); }\n  }, []);\n\n  const lerPainelAutomaticamente = useCallback(async (url: string): Promise<number | null> => {\n    setOcrLoading(true);\n    try {\n      const { data, error } = await supabase.functions.invoke("ocr-bomba-combustivel", { body: { fileUrl: url, tipo: "painel_km" } });\n      const result = data as PanelOcrResult | null;\n      if (error || !result?.ok) return null;\n      const km = normalizeKmOcrField(result);\n      if (!km) return null;\n      setOcrKm(km);\n      return km;\n    } catch (error) {\n      console.warn("OCR do painel indisponível:", error);\n      return null;\n    } finally { setOcrLoading(false); }\n  }, []);`;
page = replaceOrThrow(page, helpersAnchor, helpersInjected, 'helpers OCR');

page = replaceOrThrow(
  page,
  '    setFotoReciboUrl("");\n    setReceipt(null);',
  '    setFotoReciboUrl("");\n    setOcrBomba(null);\n    setOcrKm(null);\n    setReceipt(null);',
  'reset OCR',
);

page = replaceOrThrow(
  page,
`  const onCaptureBomba = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de abastecer.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, \`bomba-\${autorizacao.id}\`, blob);
      setFotoBombaUrl(url);
      toast.success("Foto da bomba salva.");
      setStep(fotoPainelUrl ? (fotoReciboUrl ? "revisao" : "recibo") : "painel");
    } finally {
      setLoading(false);
    }
  };`,
`  const onCaptureBomba = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de abastecer.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, \`bomba-\${autorizacao.id}\`, blob);
      setFotoBombaUrl(url);
      const leitura = await lerBombaAutomaticamente(url);
      if (!leitura) {
        setOcrBomba(null);
        setStep("bomba");
        toast.error("Não consegui ler valor e litros com segurança. Tire outra foto da bomba com o visor inteiro e nítido.");
        return;
      }
      toast.success(\`Bomba lida: R$ \${leitura.valor.toFixed(2).replace('.', ',')} · \${leitura.litros.toFixed(3).replace('.', ',')} L\`);
      setStep(fotoPainelUrl ? (fotoReciboUrl ? "revisao" : "recibo") : "painel");
    } finally {
      setLoading(false);
    }
  };`,
  'capture bomba',
);

page = replaceOrThrow(
  page,
`  const onCapturePainel = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de continuar.");
    if (!fotoBombaUrl) throw new Error("Envie primeiro a foto da bomba.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, \`painel-\${autorizacao.id}\`, blob);
      setFotoPainelUrl(url);
      toast.success("Foto do painel salva.");
      setStep(fotoReciboUrl ? "revisao" : "recibo");
    } finally {
      setLoading(false);
    }
  };`,
`  const onCapturePainel = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de continuar.");
    if (!fotoBombaUrl) throw new Error("Envie primeiro a foto da bomba.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, \`painel-\${autorizacao.id}\`, blob);
      setFotoPainelUrl(url);
      const km = await lerPainelAutomaticamente(url);
      if (!km) {
        setOcrKm(null);
        setStep("painel");
        toast.error("Não consegui identificar o hodômetro total. Tire outra foto do painel com o KM bem visível.");
        return;
      }
      toast.success(\`KM lido automaticamente: \${km.toLocaleString('pt-BR')}\`);
      setStep(fotoReciboUrl ? "revisao" : "recibo");
    } finally {
      setLoading(false);
    }
  };`,
  'capture painel',
);

page = replaceOrThrow(
  page,
`      const location = await getBrowserLocation();
      if (location.latitude == null || location.longitude == null) return toast.error("Ative a localização do aparelho. O GPS é obrigatório.");

      const { data, error } = await supabaseRpc.rpc("app_mecanico_finalizar_abastecimento_fotografico_v2", {
        p_acesso_id: mecanico.acesso_id,
        p_autorizacao_id: current.id,
        p_foto_bomba_url: fotoBombaUrl,
        p_foto_painel_url: fotoPainelUrl,
        p_foto_recibo_url: fotoReciboUrl,
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_endereco: null,
      });
      const result = data as { ok?: boolean; error?: string; id?: string; duplicado?: boolean } | null;`,
`      const leituraBomba = ocrBomba || await lerBombaAutomaticamente(fotoBombaUrl);
      if (!leituraBomba) { setStep("bomba"); return toast.error("A leitura automática da bomba não ficou segura. Tire outra foto da bomba."); }
      const kmLido = ocrKm || await lerPainelAutomaticamente(fotoPainelUrl);
      if (!kmLido) { setStep("painel"); return toast.error("A leitura automática do KM não ficou segura. Tire outra foto do painel."); }

      const location = await getBrowserLocation();
      if (location.latitude == null || location.longitude == null) return toast.error("Ative a localização do aparelho. O GPS é obrigatório.");

      const { data, error } = await supabaseRpc.rpc("app_mecanico_finalizar_abastecimento_fotografico_v3", {
        p_acesso_id: mecanico.acesso_id,
        p_autorizacao_id: current.id,
        p_valor: leituraBomba.valor,
        p_litros: leituraBomba.litros,
        p_km: kmLido,
        p_foto_bomba_url: fotoBombaUrl,
        p_foto_painel_url: fotoPainelUrl,
        p_foto_recibo_url: fotoReciboUrl,
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_endereco: null,
      });
      const result = data as { ok?: boolean; error?: string; id?: string; duplicado?: boolean; valor?: number; litros?: number; valor_por_litro?: number; km_atual?: number } | null;`,
  'finalização v3',
);

page = replaceOrThrow(
  page,
  '        combustivel: current.combustivel,\n        fotoBombaUrl,',
  '        combustivel: current.combustivel,\n        valor: Number(result.valor ?? leituraBomba.valor),\n        litros: Number(result.litros ?? leituraBomba.litros),\n        valorPorLitro: Number(result.valor_por_litro ?? leituraBomba.precoLitro),\n        kmAtual: Number(result.km_atual ?? kmLido),\n        fotoBombaUrl,',
  'dados PDF',
);

page = replaceOrThrow(
  page,
  '      toast.success("Abastecimento concluído. As três fotos e o recibo foram salvos.");',
  '      toast.success(`Abastecimento concluído automaticamente: R$ ${info.valor.toFixed(2).replace(".", ",")} · ${info.litros.toFixed(3).replace(".", ",")} L · KM ${info.kmAtual.toLocaleString("pt-BR")}.`);',
  'toast final',
);

page = replaceOrThrow(
  page,
  '      <Button className="h-12 w-full" onClick={() => setCamBomba(true)} disabled={loading}>',
  '      <Button className="h-12 w-full" onClick={() => setCamBomba(true)} disabled={loading || ocrLoading}>',
  'botão bomba OCR',
);
page = replaceOrThrow(
  page,
  '      <Button className="h-12 w-full" onClick={() => setCamPainel(true)} disabled={loading || !fotoBombaUrl}>',
  '      <Button className="h-12 w-full" onClick={() => setCamPainel(true)} disabled={loading || ocrLoading || !fotoBombaUrl}>',
  'botão painel OCR',
);

fs.writeFileSync(pagePath, page);

let pdf = fs.readFileSync(pdfPath, 'utf8');
const pdfAnchor = `  if (data.latitude != null && data.longitude != null) {
    pdf.setTextColor(80);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.6);
    pdf.text(\`GPS: \${data.latitude.toFixed(6)}, \${data.longitude.toFixed(6)}\`, margin, y);
    y += 5;
  }

  pdf.setDrawColor(190);`;
const pdfInjected = `  if (data.latitude != null && data.longitude != null) {
    pdf.setTextColor(80);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.6);
    pdf.text(\`GPS: \${data.latitude.toFixed(6)}, \${data.longitude.toFixed(6)}\`, margin, y);
    y += 5;
  }

  if (data.valor && data.litros && data.kmAtual) {
    pdf.setDrawColor(150);
    pdf.setFillColor(249, 249, 249);
    pdf.roundedRect(margin, y, contentW, 18, 1.8, 1.8, "FD");
    pdf.setTextColor(20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.2);
    pdf.text("DADOS LIDOS AUTOMATICAMENTE DAS FOTOS", pageW / 2, y + 4.5, { align: "center" });
    pdf.setFontSize(9.2);
    const valor = data.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const litros = data.litros.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    const preco = (data.valorPorLitro || data.valor / data.litros).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    pdf.text(\`\${valor}  ·  \${litros} L  ·  R$ \${preco}/L  ·  KM \${Math.round(data.kmAtual).toLocaleString("pt-BR")}\`, pageW / 2, y + 11.5, { align: "center" });
    y += 23;
  }

  pdf.setDrawColor(190);`;
pdf = replaceOrThrow(pdf, pdfAnchor, pdfInjected, 'dados numéricos PDF');
fs.writeFileSync(pdfPath, pdf);

console.log('[abastecimento-ocr] leitura automática das fotos + PDF numérico aplicada');
