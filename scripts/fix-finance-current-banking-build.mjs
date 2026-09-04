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
const functionBlock = `  const sendCurrentBanking = async () => {\n    if (scopedEmployees.length !== 1 || loadingCurrentBanking) return;\n    const employee = scopedEmployees[0];\n    setLoadingCurrentBanking(true);\n    try {\n      const { data, error } = await (supabase as any)\n        .from('funcionarios')\n        .select('id,nome,cpf,banco,banco_codigo,agencia,conta,conta_digito,tipo_conta,titular_conta,cpf_titular,pix,tipo_chave_pix,dados_bancarios_origem')\n        .eq('id', employee.id)\n        .maybeSingle();\n      if (error) throw error;\n      if (!data) throw new Error('Funcionário não encontrado no cadastro.');\n\n      const storedFields = [\n        ['Banco', data.banco],\n        ['Código do banco', data.banco_codigo],\n        ['Agência', data.agencia],\n        ['Conta', data.conta],\n        ['Dígito', data.conta_digito],\n        ['Tipo de conta', data.tipo_conta],\n        ['Titular', data.titular_conta],\n        ['CPF do titular', data.cpf_titular],\n        ['PIX', data.pix],\n        ['Tipo de PIX', data.tipo_chave_pix],\n      ].map(([label, raw]) => [String(label), String(raw || '').trim()] as const)\n        .filter(([, value]) => Boolean(value));\n\n      if (!storedFields.length) {\n        toast.error('Nenhum dado bancário cadastrado para este funcionário.');\n        return;\n      }\n\n      const company = companyName(employee);\n      const lines = storedFields.map(([label, value]) => \`${'${label}'}: ${'${value}'}\`).join('\\n');\n\n      const email: PreparedEmail = {\n        to: FINANCE_EMAIL,\n        cc: MANDATORY_EMAIL_CC,\n        subject: \`DADOS BANCÁRIOS CADASTRADOS - ${'${employee.name}'} - ${'${company}'}\`,\n        body: \`Prezados Robson e Paula,\\n\\nSeguem abaixo os dados bancários que constam atualmente cadastrados no TOPAC RH PRO para o funcionário indicado.\\n\\nFuncionário: ${'${employee.name}'}\\nCPF: ${'${employee.cpf || \'Não informado\'}'}\\nEmpresa: ${'${company}'}\\n\\nDADOS BANCÁRIOS CADASTRADOS\\n${'${lines}'}\\n\\nEste envio é apenas informativo e representa o cadastro atual. Nenhuma alteração bancária foi realizada nesta operação.\\n\\nPeço, por gentileza, a conferência e utilização destes dados nos próximos pagamentos.\\n\\nAtenciosamente,\\nTOPAC RH PRO\`,\n      };\n\n      setPreparedEmail(email);\n      openEmail(email);\n      toast.success('Dados bancários cadastrados preparados para o Financeiro.');\n    } catch (error: any) {\n      toast.error(error?.message || 'Não foi possível carregar os dados bancários cadastrados.');\n    } finally {\n      setLoadingCurrentBanking(false);\n    }\n  };\n\n`;

if (!source.includes('const sendCurrentBanking = async () =>')) {
  if (!source.includes(functionMarker)) throw new Error('[finance-current-banking] marcador da funcao nao encontrado');
  source = source.replace(functionMarker, functionBlock + functionMarker);
  changed = true;
}

const uiMarker = `          <textarea\n            value={text}`;
const uiBlock = `          {scopedEmployees.length === 1 && (\n            <div className="flex flex-col gap-3 rounded-xl border border-violet-400/30 bg-violet-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">\n              <div>\n                <p className="text-sm font-bold">Enviar cadastro bancário atual</p>\n                <p className="mt-1 text-xs text-muted-foreground">Envia somente os dados bancários que já estão preenchidos no cadastro. Não altera nada e não inclui salário.</p>\n              </div>\n              <Button type="button" onClick={() => void sendCurrentBanking()} disabled={loadingCurrentBanking || saving || analyzing} className="shrink-0">\n                ${'${loadingCurrentBanking ? \'Carregando...\' : \'Enviar dados cadastrados ao Financeiro\'}'}\n              </Button>\n            </div>\n          )}\n\n          {scopedEmployees.length === 1 && (\n            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-muted-foreground">\n              <b className="text-amber-300">Alteração de conta:</b> use o campo abaixo somente quando houver mudança. Após salvar, o e-mail discrimina apenas os campos efetivamente alterados, mostrando valor anterior → novo valor.\n            </div>\n          )}\n\n`;

if (!source.includes('Enviar cadastro bancário atual')) {
  if (!source.includes(uiMarker)) throw new Error('[finance-current-banking] marcador visual nao encontrado');
  source = source.replace(uiMarker, uiBlock + uiMarker);
  changed = true;
}

if (changed) fs.writeFileSync(file, source, 'utf8');
console.log('[finance-current-banking] fluxos separados: cadastro atual envia somente campos preenchidos; alteracao discrimina apenas campos modificados');
