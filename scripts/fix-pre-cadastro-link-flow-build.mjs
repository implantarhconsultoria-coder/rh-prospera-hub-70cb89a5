import fs from 'node:fs';

const patch = (file, transform, label) => {
  if (!fs.existsSync(file)) throw new Error(`[pre-cadastro-link] arquivo ausente: ${file}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(file, after);
  console.log(`[pre-cadastro-link] ${label}`);
};

const insertOnce = (text, anchor, value, label) => {
  if (text.includes(value.trim())) return text;
  if (!text.includes(anchor)) throw new Error(`[pre-cadastro-link] ancora ausente: ${label}`);
  return text.replace(anchor, `${anchor}${value}`);
};

patch('src/App.tsx', (source) => {
  let text = source;
  text = insertOnce(text,
    'import AcessoDiretoPage from "@/pages/AcessoDiretoPage";\n',
    'import CandidatoDocumentosPage from "@/pages/CandidatoDocumentosPage";\n',
    'import candidato');

  if (!text.includes('<Route path="/pre-cadastro/documentos/:token" element={<CandidatoDocumentosPage />} />')) {
    text = text.replace(
      '        <Route path="/cadastro" element={<CadastroPage />} />',
      '        <Route path="/pre-cadastro/documentos/:token" element={<CandidatoDocumentosPage />} />\n        <Route path="/cadastro" element={<CadastroPage />} />',
    );
    text = text.replace(
      '      <Route path="/index" element={<Navigate to="/" replace />} />',
      '      <Route path="/index" element={<Navigate to="/" replace />} />\n      <Route path="/pre-cadastro/documentos/:token" element={<CandidatoDocumentosPage />} />',
    );
  }
  return text;
}, 'rota pública da ficha/documentos pronta');

patch('src/main.tsx', (source) => {
  let text = source;
  if (!text.includes('PreCadastroCandidateActions')) {
    text = text.replace(
      'const PreCadastroFseButtonPlacement = lazy(() => import("@/components/PreCadastroFseButtonPlacement"));',
      'const PreCadastroFseButtonPlacement = lazy(() => import("@/components/PreCadastroFseButtonPlacement"));\nconst PreCadastroCandidateActions = lazy(() => import("@/components/PreCadastroCandidateActions"));',
    );
    text = text.replace(
      '      {isPreCadastro && <PreCadastroFseButtonPlacement />}',
      '      {isPreCadastro && <PreCadastroFseButtonPlacement />}\n      {isPreCadastro && <PreCadastroCandidateActions />}',
    );
  }
  return text;
}, 'ações do candidato montadas dentro do pré-cadastro');

patch('src/components/AdminMobileLayout.tsx', (source) => {
  let text = source.replace("  { label: 'Ponto', path: '/admin/fechamento-ponto' },\n", '');
  if (!text.includes('const isPreCadastro = location.pathname')) {
    text = text.replace(
      "  const isHome = location.pathname === '/admin';",
      "  const isHome = location.pathname === '/admin';\n  const isPreCadastro = location.pathname === '/admin/pre-cadastro-admissional' || (location.pathname === '/admin/central-contabilidade' && new URLSearchParams(location.search).get('modulo') === 'pre-cadastro');",
    );
  }
  text = text.replace('      {!isHome && (\n        <nav className=', '      {!isHome && !isPreCadastro && (\n        <nav className=');
  text = text.replace('      {!isHome && (\n        <>\n          <VoiceCommandFab />', '      {!isHome && !isPreCadastro && (\n        <>\n          <VoiceCommandFab />');
  return text;
}, 'mobile limpo no pré-cadastro e Ponto removido dos acessos');

patch('src/components/admin-mobile/AdminMobileDashboard.tsx', (source) =>
  source.replace("    { label: 'Ponto', icon: BarChart3, path: '/admin/fechamento-ponto', accent: 'text-fuchsia-300' },\n", ''),
'card Ponto removido do painel móvel');

patch('src/components/AppLayout.tsx', (source) => {
  let text = source;
  if (!text.includes('const isPreCadastroView =')) {
    text = text.replace(
      '  const navigate = useNavigate();',
      "  const navigate = useNavigate();\n  const isPreCadastroView = location.pathname === '/admin/pre-cadastro-admissional' || (location.pathname === '/admin/central-contabilidade' && new URLSearchParams(location.search).get('modulo') === 'pre-cadastro');",
    );
  }
  text = text.replace(/      <SupportCenter \/>/g, '      {!isPreCadastroView && <SupportCenter />}');
  text = text.replace('      <AssistenteFab />\n    </div>', '      {!isPreCadastroView && <AssistenteFab />}\n    </div>');
  return text;
}, 'botões flutuantes ocultados no pré-cadastro');

patch('src/pages/CandidatoDocumentosPage.tsx', (source) => {
  let text = source;
  text = text.replace(
    "const Field = ({ label, value, onChange, type = 'text', placeholder = '' }: { label:string; value:string; onChange:(value:string)=>void; type?:string; placeholder?:string }) => (",
    "const Field = ({ label, value, onChange, type = 'text', placeholder = '', inputMode }: { label:string; value:string; onChange:(value:string)=>void; type?:string; placeholder?:string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'] }) => (",
  );
  text = text.replace(
    '<input type={type} value={value || \'\'} onChange={e => onChange(e.target.value)} placeholder={placeholder}',
    '<input type={type} inputMode={inputMode} value={value || \'\'} onChange={e => onChange(e.target.value)} placeholder={placeholder}',
  );
  return text;
}, 'tipagem da ficha digital validada');

patch('api/pre-cadastro-candidato.ts', (source) => {
  let text = source;
  text = text.replace(
    "      if (!pre?.id) return sendJson(res, { ok:false, error:'pre_cadastro_nao_encontrado' }, 404);\n      const telefone = digits(body.telefone || pre.celular);",
    "      if (!pre?.id) return sendJson(res, { ok:false, error:'pre_cadastro_nao_encontrado' }, 404);\n      if (!clean(pre.empresa_nome) || !clean(pre.funcao)) return sendJson(res, { ok:false, error:'salve_empresa_funcao_antes_do_link' }, 400);\n      const telefone = digits(body.telefone || pre.celular);",
  );
  text = text.replace(
    "    if (request.status === 'concluido' && !['state','register_aso'].includes(action)) {\n      return sendJson(res, { ok:false, error:'processo_ja_concluido' }, 409);\n    }",
    "    const allowedAfterConclusion = action === 'state' || action === 'register_aso' || (action === 'create_upload' && clean(body.tipo) === 'guia_aso');\n    if (request.status === 'concluido' && !allowedAfterConclusion) {\n      return sendJson(res, { ok:false, error:'processo_ja_concluido' }, 409);\n    }",
  );
  return text;
}, 'ASO automático liberado após conclusão e link exige empresa/função salvas');

patch('src/components/PreCadastroCandidateActions.tsx', (source) => source.replace(
  "      if (!response.ok || !data?.ok) throw new Error(data?.error === 'celular_candidato_obrigatorio' ? 'Informe o celular do candidato.' : (data?.error || 'Não foi possível gerar o link.'));",
  "      if (!response.ok || !data?.ok) {\n        const message = data?.error === 'celular_candidato_obrigatorio' ? 'Informe o celular do candidato.' : data?.error === 'salve_empresa_funcao_antes_do_link' ? 'Salve a empresa e a função antes de enviar o link. Isso garante a geração automática da guia ASO.' : (data?.error || 'Não foi possível gerar o link.');\n        throw new Error(message);\n      }",
), 'validação administrativa do link aplicada');
