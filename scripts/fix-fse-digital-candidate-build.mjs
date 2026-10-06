import fs from 'node:fs';

const patch=(file,transform,label)=>{if(!fs.existsSync(file))throw new Error(`[fse-digital] arquivo ausente: ${file}`);const before=fs.readFileSync(file,'utf8');const after=transform(before);if(after!==before)fs.writeFileSync(file,after);console.log(`[fse-digital] ${label}`);};

patch('src/App.tsx',(source)=>{
  let text=source;
  const docs='<Route path="/pre-cadastro/documentos/:token" element={<CandidatoDocumentosPage />} />';
  const ficha='<Route path="/pre-cadastro/ficha/:token" element={<CandidatoDocumentosPage />} />';
  if(!text.includes(ficha)&&text.includes(docs)) text=text.replaceAll(docs,`${ficha}\n      ${docs}`);
  return text;
},'rota pública FSE digital + documentos aplicada');

patch('src/pages/PreCadastroAdmissionalOcrPage.tsx',(source)=>{
  let text=source;
  text=text.replace('key={row.id} onClick={() => setSelectedId(row.id)} className={`w-full text-left rounded-xl', 'key={row.id} data-pre-cadastro-id={row.id} onClick={() => setSelectedId(row.id)} className={`w-full text-left rounded-xl');
  const marker='  const uploadToxicologico = async';
  const start=text.indexOf('  const uploadASO = async');
  const end=text.indexOf(marker,start);
  if(start>=0&&end>start&&!text.slice(start,end).includes('/api/pre-cadastro-contabilidade')){
    const replacement=`  const uploadASO = async (file?: File | null) => {
    if (!file || !form.id) return;
    const url = await uploadAdmissionFile(file, \`aso/\${form.id}\`);
    await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento: 'aso', nome_arquivo: file.name, arquivo_url: url });
    await (supabase as any).from('pre_cadastros_admissionais').update({ arquivo_aso_url: url }).eq('id', form.id);
    setForm(prev => ({ ...prev, arquivo_aso_url: url }));
    await carregarDocumentos({ ...form, arquivo_aso_url: url });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessão administrativa não encontrada.');
      const response = await fetch('/api/pre-cadastro-contabilidade', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${accessToken}\` }, body: JSON.stringify({ preCadastroId: form.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Falha ao enviar para contabilidade.');
      toast.success('ASO recebido. Documentação enviada automaticamente à contabilidade.');
      await carregar();
    } catch (error: any) {
      toast.error(\`ASO salvo, mas o envio automático à contabilidade falhou: \${error?.message || 'tente novamente'}\`);
    }
  };
`;
    text=text.slice(0,start)+replacement+text.slice(end);
  }

  if(!text.includes("const [asoExamDate, setAsoExamDate] = useState('');")){
    text=text.replace(
      "  const [lastAsoGuide, setLastAsoGuide] = useState<GeneratedAsoGuide | null>(null);",
      "  const [lastAsoGuide, setLastAsoGuide] = useState<GeneratedAsoGuide | null>(null);\n  const [asoExamDate, setAsoExamDate] = useState('');",
    );
  }

  if(!text.includes("setForm(selected); setAsoExamDate(''); setOcrResult")){
    text=text.replace('setForm(selected); setOcrResult', "setForm(selected); setAsoExamDate(''); setOcrResult");
  }

  text=text.replace(
    "const novo = () => { setSelectedId(''); setForm(initialForm); setOcrResult(null); setLastFichaFile(null); setLastAsoGuide(null); setDocumentos([]); };",
    "const novo = () => { setSelectedId(''); setForm(initialForm); setOcrResult(null); setLastFichaFile(null); setLastAsoGuide(null); setAsoExamDate(''); setDocumentos([]); };",
  );
  text=text.replace(
    "setSelectedId(''); setSearch(''); setOcrResult(null); setLastFichaFile(null); setLastAsoGuide(null); setDocumentos([]);",
    "setSelectedId(''); setSearch(''); setOcrResult(null); setLastFichaFile(null); setLastAsoGuide(null); setAsoExamDate(''); setDocumentos([]);",
  );

  if(!text.includes("toast.error('Selecione a data do exame antes de gerar a guia ASO.')")){
    text=text.replace(
      '  const buildGuiaAsoPdf = () => { if (!form.nome',
      "  const buildGuiaAsoPdf = () => { if (!asoExamDate) { toast.error('Selecione a data do exame antes de gerar a guia ASO.'); return null; } if (!form.nome",
    );
  }
  text=text.replace('dataExame: new Date().toISOString().slice(0, 10)', 'dataExame: asoExamDate');

  if(!text.includes('Data do exame / ASO')){
    const actionNeedle='<Button onClick={salvar} disabled={saving}><Save className="w-4 h-4 mr-2" />Salvar</Button><Button onClick={gerarGuiaAso} variant="outline">';
    const actionReplacement='<Button onClick={salvar} disabled={saving}><Save className="w-4 h-4 mr-2" />Salvar</Button><div className="min-w-[180px]"><label className="text-xs text-muted-foreground">Data do exame / ASO</label><Input type="date" value={asoExamDate} onChange={e => { setAsoExamDate(e.target.value); setLastAsoGuide(null); }} /></div><Button onClick={gerarGuiaAso} variant="outline">';
    text=text.replace(actionNeedle,actionReplacement);
  }

  return text;
},'pré-cadastro identifica ID, exige data escolhida para guia ASO e ASO retornado segue automaticamente para contabilidade');

patch('src/components/PreCadastroFseButtonPlacement.tsx',(source)=>{
  let text=source;
  if(!text.includes("findControlByLabel('Data do exame / ASO')")){
    text=text.replace(
      "      const salaryControl = findControlByLabel('Salario') as HTMLInputElement | null;\n      const companyId = clean(companyControl?.value);\n      const role = clean(roleControl?.value);\n      const salary = Number(salaryControl?.value || 0);",
      "      const salaryControl = findControlByLabel('Salario') as HTMLInputElement | null;\n      const examDateControl = findControlByLabel('Data do exame / ASO') as HTMLInputElement | null;\n      const companyId = clean(companyControl?.value);\n      const role = clean(roleControl?.value);\n      const salary = Number(salaryControl?.value || 0);\n      const examDate = clean(examDateControl?.value);",
    );
    text=text.replace(
      "      if (!companyId || !role || !(salary > 0)) {\n        toast.error('Antes de confirmar, selecione EMPRESA + CARGO/VAGA e informe o SALÁRIO.');",
      "      if (!companyId || !role || !(salary > 0) || !examDate) {\n        toast.error('Antes de confirmar, selecione EMPRESA + CARGO/VAGA + DATA DO EXAME e informe o SALÁRIO.');",
    );
    text=text.replace(
      "            salario: salary,\n            beneficios: savedRow.beneficios || '',",
      "            salario: salary,\n            data_exame: examDate,\n            beneficios: savedRow.beneficios || '',",
    );
    text=text.replace(
      "        dados: { empresa_id: companyId, funcao: role, salario: salary, beneficios: savedRow.beneficios || '', insalubridade: savedRow.insalubridade || '' },",
      "        dados: { empresa_id: companyId, funcao: role, salario: salary, data_exame: examDate, beneficios: savedRow.beneficios || '', insalubridade: savedRow.insalubridade || '' },",
    );
  }
  return text;
},'confirmação do pré-cadastro também exige a data escolhida para a guia ASO');

await import('./fix-platform-visual-consistency-build.mjs');
await import('./fix-abastecimento-auto-liberacao-build.mjs');
await import('./fix-contabilidade-ferias-documentos-build.mjs');