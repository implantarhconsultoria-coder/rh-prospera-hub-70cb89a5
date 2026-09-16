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
