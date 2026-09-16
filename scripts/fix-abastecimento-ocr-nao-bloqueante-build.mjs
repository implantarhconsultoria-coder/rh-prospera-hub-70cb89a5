import fs from 'node:fs';

const file = 'src/app-mecanico/pages/AbastecimentoPageV4.tsx';
if (!fs.existsSync(file)) throw new Error(`[abastecimento-ocr-async] arquivo ausente: ${file}`);
let src = fs.readFileSync(file, 'utf8');

const replace = (from, to, label, marker = to) => {
  if (src.includes(marker)) {
    console.log(`[abastecimento-ocr-async] ${label}: já aplicado`);
    return;
  }
  if (!src.includes(from)) throw new Error(`[abastecimento-ocr-async] trecho não encontrado: ${label}`);
  src = src.replace(from, to);
  console.log(`[abastecimento-ocr-async] ${label}`);
};

const chooseAnchor = `  const chooseAuthorizedStep = useCallback((bomba = fotoBombaUrl, painel = fotoPainelUrl, recibo = fotoReciboUrl): Step => {`;
if (!src.includes('const persistirLeituraOcr = useCallback')) {
  if (!src.includes(chooseAnchor)) throw new Error('[abastecimento-ocr-async] ancora persistencia OCR nao encontrada');
  src = src.replace(chooseAnchor, `  const persistirLeituraOcr = useCallback(async (authorizationId: string, leitura?: FuelReading | null, km?: number | null) => {\n    if (!authorizationId || (!leitura && !km)) return;\n    try {\n      const { error } = await supabaseRpc.rpc("app_mecanico_registrar_ocr_abastecimento", {\n        p_acesso_id: mecanico.acesso_id,\n        p_autorizacao_id: authorizationId,\n        p_valor: leitura?.valor ?? null,\n        p_litros: leitura?.litros ?? null,\n        p_preco_litro: leitura?.precoLitro ?? null,\n        p_km: km ?? null,\n      });\n      if (error) console.warn("Falha ao persistir leitura OCR do abastecimento:", error);\n    } catch (error) {\n      console.warn("Falha ao persistir leitura OCR do abastecimento:", error);\n    }\n  }, [mecanico.acesso_id]);\n\n${chooseAnchor}`);
  console.log('[abastecimento-ocr-async] persistencia OCR adicionada');
}

replace(
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
`  const onCaptureBomba = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de abastecer.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, \`bomba-\${autorizacao.id}\`, blob);
      setFotoBombaUrl(url);
      toast.success("Foto da bomba salva. Os dados serão lidos automaticamente no sistema.");
      setStep(fotoPainelUrl ? (fotoReciboUrl ? "revisao" : "recibo") : "painel");
      void lerBombaAutomaticamente(url).then((leitura) => {
        if (leitura) void persistirLeituraOcr(autorizacao.id, leitura, null);
      }).catch((error) => console.warn("Leitura da bomba ficará pendente no sistema:", error));
    } finally {
      setLoading(false);
    }
  };`,
  'foto da bomba avanca sem esperar OCR',
  'Foto da bomba salva. Os dados serão lidos automaticamente no sistema.',
);

replace(
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
`  const onCapturePainel = async (blob: Blob) => {
    if (!autorizacao || autorizacao.status !== "autorizado") throw new Error("Aguarde a liberação antes de continuar.");
    if (!fotoBombaUrl) throw new Error("Envie primeiro a foto da bomba.");
    setLoading(true);
    try {
      const url = await uploadFoto("abastecimento-fotos", mecanico.acesso_id, \`painel-\${autorizacao.id}\`, blob);
      setFotoPainelUrl(url);
      toast.success("Foto do painel salva. O KM será lido automaticamente no sistema.");
      setStep(fotoReciboUrl ? "revisao" : "recibo");
      void lerPainelAutomaticamente(url).then((km) => {
        if (km) void persistirLeituraOcr(autorizacao.id, null, km);
      }).catch((error) => console.warn("Leitura do KM ficará pendente no sistema:", error));
    } finally {
      setLoading(false);
    }
  };`,
  'foto do painel avanca sem esperar OCR',
  'Foto do painel salva. O KM será lido automaticamente no sistema.',
);

replace(
`      const leituraBomba = ocrBomba || await lerBombaAutomaticamente(fotoBombaUrl);
      if (!leituraBomba) { setStep("bomba"); return toast.error("A leitura automática da bomba não ficou segura. Tire outra foto da bomba."); }
      const kmLido = ocrKm || await lerPainelAutomaticamente(fotoPainelUrl);
      if (!kmLido) { setStep("painel"); return toast.error("A leitura automática do KM não ficou segura. Tire outra foto do painel."); }

      const location = await getBrowserLocation();`,
`      const leituraBomba = ocrBomba;
      const kmLido = ocrKm;

      const location = await getBrowserLocation();`,
  'finalizacao nao espera OCR',
  'const leituraBomba = ocrBomba;\n      const kmLido = ocrKm;',
);

replace(
`        p_valor: leituraBomba.valor,
        p_litros: leituraBomba.litros,
        p_km: kmLido,`,
`        p_valor: leituraBomba?.valor ?? null,
        p_litros: leituraBomba?.litros ?? null,
        p_km: kmLido ?? null,`,
  'RPC aceita leitura pendente',
);

replace(
`        valor: Number(result.valor ?? leituraBomba.valor),
        litros: Number(result.litros ?? leituraBomba.litros),
        valorPorLitro: Number(result.valor_por_litro ?? leituraBomba.precoLitro),
        kmAtual: Number(result.km_atual ?? kmLido),`,
`        valor: Number(result.valor ?? leituraBomba?.valor ?? 0),
        litros: Number(result.litros ?? leituraBomba?.litros ?? 0),
        valorPorLitro: Number(result.valor_por_litro ?? leituraBomba?.precoLitro ?? 0),
        kmAtual: Number(result.km_atual ?? kmLido ?? 0),`,
  'recibo tolera OCR pendente',
);

if (!src.includes('const completarLeituraNoSistema = async () =>')) {
  const marker = '      setReceipt(info);';
  if (!src.includes(marker)) throw new Error('[abastecimento-ocr-async] ancora pós-finalização não encontrada');
  src = src.replace(marker, `      const completarLeituraNoSistema = async () => {\n        const [bombaProcessada, kmProcessado] = await Promise.all([\n          leituraBomba ? Promise.resolve(leituraBomba) : lerBombaAutomaticamente(fotoBombaUrl),\n          kmLido ? Promise.resolve(kmLido) : lerPainelAutomaticamente(fotoPainelUrl),\n        ]);\n        if (bombaProcessada || kmProcessado) await persistirLeituraOcr(current.id, bombaProcessada, kmProcessado);\n      };\n      void completarLeituraNoSistema().catch((ocrError) => console.warn("OCR continuará pendente para conferência na plataforma:", ocrError));\n\n${marker}`);
  console.log('[abastecimento-ocr-async] OCR continua no sistema depois da finalizacao');
}

replace(
  '      toast.success(`Abastecimento concluído automaticamente: R$ ${info.valor.toFixed(2).replace(".", ",")} · ${info.litros.toFixed(3).replace(".", ",")} L · KM ${info.kmAtual.toLocaleString("pt-BR")}.`);',
  '      toast.success("Abastecimento concluído. Fotos e GPS salvos; a leitura dos valores e do KM continua automaticamente no sistema.");',
  'mensagem final nao promete OCR instantaneo',
);

replace(
  '      <Button className="h-12 w-full" onClick={() => setCamBomba(true)} disabled={loading || ocrLoading}>',
  '      <Button className="h-12 w-full" onClick={() => setCamBomba(true)} disabled={loading}>',
  'botao bomba nao depende do OCR',
);

replace(
  '      <Button className="h-12 w-full" onClick={() => setCamPainel(true)} disabled={loading || ocrLoading || !fotoBombaUrl}>',
  '      <Button className="h-12 w-full" onClick={() => setCamPainel(true)} disabled={loading || !fotoBombaUrl}>',
  'botao painel nao depende do OCR',
);

src = src.replace(
  'Solicite, aguarde a liberação e depois tire 3 fotos.',
  'Solicite e tire 3 fotos. A leitura dos dados acontece automaticamente no sistema.',
);

fs.writeFileSync(file, src);
console.log('[abastecimento-ocr-async] mecanico nunca mais fica preso esperando leitura; plataforma recebe os dados em segundo plano');
