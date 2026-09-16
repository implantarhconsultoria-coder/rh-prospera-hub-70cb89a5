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
  return text;
},'pré-cadastro identifica ID e ASO retornado segue automaticamente para contabilidade');

await import('./fix-platform-visual-consistency-build.mjs');
await import('./fix-abastecimento-auto-liberacao-build.mjs');
await import('./fix-contabilidade-ferias-documentos-build.mjs');
