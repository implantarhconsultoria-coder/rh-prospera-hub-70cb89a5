import fs from 'node:fs';

const file = 'src/components/BulkBankingDataEditor.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
let changed = false;

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) {
    throw new Error(`[finance-current-banking] trecho nao encontrado: ${label}`);
  }
  source = source.replace(from, to);
  changed = true;
};

const oldBankingFromRow = `const bankingFromRow = (row: any): BankingData => ({
  banco: String(row?.banco || ''),
  bancoCodigo: String(row?.banco_codigo || ''),
  agencia: String(row?.agencia || ''),
  conta: String(row?.conta || ''),
  digito: String(row?.conta_digito || ''),
  tipoConta: String(row?.tipo_conta || ''),
  titular: String(row?.titular_conta || row?.nome || ''),
  cpfTitular: String(row?.cpf_titular || row?.cpf || ''),
  chavePix: String(row?.pix || ''),
  tipoChavePix: String(row?.tipo_chave_pix || ''),
  textoOriginal: String(row?.dados_bancarios_origem || ''),
});`;

const newBankingFromRow = `const legacyBankingFromObservacoes = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return { banco: '', agencia: '', conta: '', chavePix: '' };
  try {
    const parsed = JSON.parse(raw);
    const banking = parsed?.__topac_rh_meta === true ? (parsed?.dados_bancarios || {}) : {};
    return {
      banco: String(banking?.banco || '').trim(),
      agencia: String(banking?.agencia || '').trim(),
      conta: String(banking?.conta || '').trim(),
      chavePix: String(banking?.pix || '').trim(),
    };
  } catch {
    return { banco: '', agencia: '', conta: '', chavePix: '' };
  }
};

const bankingFromRow = (row: any): BankingData => {
  const legacy = legacyBankingFromObservacoes(row?.observacoes);
  return {
    banco: String(row?.banco || legacy.banco || ''),
    bancoCodigo: String(row?.banco_codigo || ''),
    agencia: String(row?.agencia || legacy.agencia || ''),
    conta: String(row?.conta || legacy.conta || ''),
    digito: String(row?.conta_digito || ''),
    tipoConta: String(row?.tipo_conta || ''),
    titular: String(row?.titular_conta || row?.nome || ''),
    cpfTitular: String(row?.cpf_titular || row?.cpf || ''),
    chavePix: String(row?.pix || legacy.chavePix || ''),
    tipoChavePix: String(row?.tipo_chave_pix || ''),
    textoOriginal: String(row?.dados_bancarios_origem || ''),
  };
};`;

if (!source.includes('legacyBankingFromObservacoes')) {
  if (!source.includes(oldBankingFromRow)) throw new Error('[finance-current-banking] bankingFromRow original nao encontrado');
  source = source.replace(oldBankingFromRow, newBankingFromRow);
  changed = true;
}

const selectWithoutLegacy = "id,nome,cpf,banco,banco_codigo,agencia,conta,conta_digito,tipo_conta,titular_conta,cpf_titular,pix,tipo_chave_pix,dados_bancarios_origem";
const selectWithLegacy = `${selectWithoutLegacy},observacoes`;
if (source.includes(selectWithoutLegacy) && !source.includes(selectWithLegacy)) {
  source = source.split(selectWithoutLegacy).join(selectWithLegacy);
  changed = true;
}

replaceOnce(
  "  const [preparedEmail, setPreparedEmail] = useState<PreparedEmail | null>(null);",
  "  const [preparedEmail, setPreparedEmail] = useState<PreparedEmail | null>(null);\n  const [loadingCurrentBanking, setLoadingCurrentBanking] = useState(false);",
  'estado loading',
);

replaceOnce(
  "    setPreparedEmail(null);\n  };",
  "    setPreparedEmail(null);\n    setLoadingCurrentBanking(false);\n  };",
  'reset loading',
);

const functionMarker = "  const copyPreparedEmail = async () => {";
const functionBlock = `  const sendCurrentBanking = async () => {\n    if (scopedEmployees.length !== 1 || loadingCurrentBanking) return;\n    const employee = scopedEmployees[0];\n    setLoadingCurrentBanking(true);\n    try {\n      const { data, error } = await (supabase as any)\n        .from('funcionarios')\n        .select('id,nome,cpf,banco,banco_codigo,agencia,conta,conta_digito,tipo_conta,titular_conta,cpf_titular,pix,tipo_chave_pix,dados_bancarios_origem,observacoes')\n        .eq('id', employee.id)\n        .maybeSingle();\n      if (error) throw error;\n      if (!data) throw new Error('Funcionário não encontrado no cadastro.');\n\n      const current = bankingFromRow(data);\n      const storedFields = [\n        ['Banco', current.banco],\n        ['Código do banco', current.bancoCodigo],\n        ['Agência', current.agencia],\n        ['Conta', current.conta],\n        ['Dígito', current.digito],\n        ['Tipo de conta', current.tipoConta],\n        ['Titular', String(data.titular_conta || '').trim()],\n        ['CPF do titular', String(data.cpf_titular || '').trim()],\n        ['PIX', current.chavePix],\n        ['Tipo de PIX', current.tipoChavePix],\n      ].map(([label, raw]) => [String(label), String(raw || '').trim()] as const)\n        .filter(([, value]) => Boolean(value));\n\n      if (!storedFields.length) {\n        toast.error('Nenhum dado bancário cadastrado para este funcionário.');\n        return;\n      }\n\n      const company = companyName(employee);\n      const lines = storedFields.map(([label, value]) => \`${'${label}'}: ${'${value}'}\`).join('\\n');\n\n      const email: PreparedEmail = {\n        to: FINANCE_EMAIL,\n        cc: MANDATORY_EMAIL_CC,\n        subject: \`DADOS BANCÁRIOS CADASTRADOS - ${'${employee.name}'} - ${'${company}'}\`,\n        body: \`Prezados Robson e Paula,\\n\\nSeguem abaixo os dados bancários que constam atualmente cadastrados no TOPAC RH PRO para o funcionário indicado.\\n\\nFuncionário: ${'${employee.name}'}\\nCPF: ${'${employee.cpf || \'Não informado\'}'}\\nEmpresa: ${'${company}'}\\n\\nDADOS BANCÁRIOS CADASTRADOS\\n${'${lines}'}\\n\\nEste envio é apenas informativo e representa o cadastro atual. Nenhuma alteração bancária foi realizada nesta operação.\\n\\nPeço, por gentileza, a conferência e utilização destes dados nos próximos pagamentos.\\n\\nAtenciosamente,\\nTOPAC RH PRO\`,\n      };\n\n      setPreparedEmail(email);\n      openEmail(email);\n      toast.success('Dados bancários cadastrados preparados para o Financeiro.');\n    } catch (error: any) {\n      toast.error(error?.message || 'Não foi possível carregar os dados bancários cadastrados.');\n    } finally {\n      setLoadingCurrentBanking(false);\n    }\n  };\n\n`;

if (!source.includes('const sendCurrentBanking = async () =>')) {
  if (!source.includes(functionMarker)) throw new Error('[finance-current-banking] marcador da funcao nao encontrado');
  source = source.replace(functionMarker, functionBlock + functionMarker);
  changed = true;
}

const uiMarker = `          <textarea\n            value={text}`;
const uiBlock = `          {scopedEmployees.length === 1 && (\n            <div className="flex flex-col gap-3 rounded-xl border border-violet-400/30 bg-violet-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">\n              <div>\n                <p className="text-sm font-bold">Enviar cadastro bancário atual</p>\n                <p className="mt-1 text-xs text-muted-foreground">Envia exatamente os dados bancários que já aparecem na ficha do funcionário, inclusive cadastros antigos. Não altera nada e não inclui salário.</p>\n              </div>\n              <Button type="button" onClick={() => void sendCurrentBanking()} disabled={loadingCurrentBanking || saving || analyzing} className="shrink-0">\n                ${'${loadingCurrentBanking ? \'Carregando...\' : \'Enviar dados cadastrados ao Financeiro\'}'}\n              </Button>\n            </div>\n          )}\n\n          {scopedEmployees.length === 1 && (\n            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-muted-foreground">\n              <b className="text-amber-300">Alteração de conta:</b> use o campo abaixo somente quando houver mudança. Após salvar, o e-mail compara também com cadastros antigos e discrimina apenas os campos efetivamente alterados, mostrando valor anterior → novo valor.\n            </div>\n          )}\n\n`;

if (!source.includes('Enviar cadastro bancário atual')) {
  if (!source.includes(uiMarker)) throw new Error('[finance-current-banking] marcador visual nao encontrado');
  source = source.replace(uiMarker, uiBlock + uiMarker);
  changed = true;
}

if (changed) fs.writeFileSync(file, source, 'utf8');
console.log('[finance-current-banking] leitura unificada: colunas novas + observacoes.dados_bancarios legado; envio e comparacao alinhados com a ficha');
