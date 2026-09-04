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
const functionBlock = `  const sendCurrentBanking = async () => {\n    if (scopedEmployees.length !== 1 || loadingCurrentBanking) return;\n    const employee = scopedEmployees[0];\n    setLoadingCurrentBanking(true);\n    try {\n      const { data, error } = await (supabase as any)\n        .from('funcionarios')\n        .select('id,nome,cpf,banco,banco_codigo,agencia,conta,conta_digito,tipo_conta,titular_conta,cpf_titular,pix,tipo_chave_pix,dados_bancarios_origem')\n        .eq('id', employee.id)\n        .maybeSingle();\n      if (error) throw error;\n      if (!data) throw new Error('Funcionário não encontrado no cadastro.');\n\n      const current = bankingFromRow(data);\n      const hasBanking = BANK_FIELDS.some(({ key }) => String(current[key] || '').trim());\n      if (!hasBanking) {\n        toast.error('Nenhum dado bancário cadastrado para este funcionário.');\n        return;\n      }\n\n      const company = companyName(employee);\n      const lines = BANK_FIELDS.map(({ key, label }) => {\n        const value = String(current[key] || '').trim();\n        return \`${'${label}'}: ${'${value || \'Não informado\'}'}\`;\n      }).join('\\n');\n\n      const email: PreparedEmail = {\n        to: FINANCE_EMAIL,\n        cc: MANDATORY_EMAIL_CC,\n        subject: \`DADOS BANCÁRIOS - ${'${employee.name}'} - ${'${company}'}\`,\n        body: \`Prezados Robson e Paula,\\n\\nSeguem os dados bancários atualmente cadastrados no TOPAC RH PRO para conferência e utilização nos próximos pagamentos.\\n\\nFuncionário: ${'${employee.name}'}\\nCPF: ${'${employee.cpf || \'Não informado\'}'}\\nEmpresa: ${'${company}'}\\n\\nDADOS BANCÁRIOS ATUAIS\\n${'${lines}'}\\n\\nEstas informações foram extraídas diretamente do cadastro atual do funcionário no TOPAC RH PRO. Nenhuma alteração foi realizada neste envio.\\n\\nPeço, por gentileza, a conferência dos dados acima.\\n\\nAtenciosamente,\\nTOPAC RH PRO\`,\n      };\n\n      setPreparedEmail(email);\n      openEmail(email);\n      toast.success('Dados bancários atuais preparados para o Financeiro.');\n    } catch (error: any) {\n      toast.error(error?.message || 'Não foi possível carregar os dados bancários atuais.');\n    } finally {\n      setLoadingCurrentBanking(false);\n    }\n  };\n\n`;

if (!source.includes('const sendCurrentBanking = async () =>')) {
  if (!source.includes(functionMarker)) throw new Error('[finance-current-banking] marcador da funcao nao encontrado');
  source = source.replace(functionMarker, functionBlock + functionMarker);
  changed = true;
}

const uiMarker = `          <textarea\n            value={text}`;
const uiBlock = `          {scopedEmployees.length === 1 && (\n            <div className="flex flex-col gap-3 rounded-xl border border-violet-400/30 bg-violet-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">\n              <div>\n                <p className="text-sm font-bold">Dados bancários já cadastrados</p>\n                <p className="mt-1 text-xs text-muted-foreground">Envie ao Financeiro exatamente o que existe hoje no cadastro, sem precisar alterar a conta e sem incluir salário.</p>\n              </div>\n              <Button type="button" onClick={() => void sendCurrentBanking()} disabled={loadingCurrentBanking || saving || analyzing} className="shrink-0">\n                ${'${loadingCurrentBanking ? \'Carregando...\' : \'Enviar dados cadastrados ao Financeiro\'}'}\n              </Button>\n            </div>\n          )}\n\n`;

if (!source.includes('Enviar dados cadastrados ao Financeiro')) {
  if (!source.includes(uiMarker)) throw new Error('[finance-current-banking] marcador visual nao encontrado');
  source = source.replace(uiMarker, uiBlock + uiMarker);
  changed = true;
}

if (changed) fs.writeFileSync(file, source, 'utf8');
console.log('[finance-current-banking] envio dos dados bancarios atuais habilitado sem salario e sem alteracao cadastral');
