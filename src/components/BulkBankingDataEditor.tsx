import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, Landmark, Loader2, Mail, SearchCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseBankingText, type BankingData } from '@/lib/bankingParser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type EmployeeLike = {
  id: string;
  name: string;
  cpf?: string;
  companyId: string;
  status?: string;
};

type CompanyLike = {
  id: string;
  name: string;
};

type RowStatus = 'ready' | 'not_found' | 'ambiguous' | 'no_data' | 'no_change' | 'saved' | 'save_error';

type ChangeItem = {
  key: keyof BankingData;
  label: string;
  oldValue: string;
  newValue: string;
};

type BulkRow = {
  key: string;
  source: string;
  employee?: EmployeeLike;
  companyName?: string;
  matches?: EmployeeLike[];
  banking: BankingData;
  currentBanking: BankingData;
  finalBanking: BankingData;
  changes: ChangeItem[];
  identified: string[];
  warnings: string[];
  status: RowStatus;
  saveError?: string;
};

type PreparedEmail = { to: string; cc: string[]; subject: string; body: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeLike[];
  companies: CompanyLike[];
  companyId?: string;
  onSaved: () => Promise<void> | void;
};

const FINANCE_EMAIL = 'financeiro@topac.com.br';
const MANDATORY_EMAIL_CC = ['adm.matriz@topac.com.br', 'robson@topac.com.br'];

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const employeeMatchesLine = (line: string, employees: EmployeeLike[]) => {
  const cleaned = normalize(line)
    .replace(/^(?:nome|funcionario|funcionário|colaborador)\s*[:=\-]?\s*/i, '')
    .replace(/^[\-–—•*\d.)\s]+/, '')
    .trim();
  if (!cleaned) return [];
  return employees.filter((employee) => {
    const name = normalize(employee.name);
    return cleaned === name || cleaned.startsWith(`${name} `) || cleaned.startsWith(`${name}:`) || cleaned.startsWith(`${name} -`);
  });
};

const splitIntoBlocks = (raw: string, employees: EmployeeLike[]) => {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return [];
  const lines = text.split('\n');
  const detected: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const startsEmployee = employeeMatchesLine(line, employees).length > 0;
    if (startsEmployee && current.some((item) => item.trim())) {
      detected.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.some((item) => item.trim())) detected.push(current);
  if (detected.length > 1) return detected.map((block) => block.join('\n').trim()).filter(Boolean);
  const blankBlocks = text.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  return blankBlocks.length > 1 ? blankBlocks : [text];
};

const matchEmployee = (block: string, employees: EmployeeLike[]) => {
  const direct = new Map<string, EmployeeLike>();
  block.split('\n').forEach((line) => employeeMatchesLine(line, employees).forEach((employee) => direct.set(employee.id, employee)));
  if (direct.size) return [...direct.values()];

  const normalizedBlock = normalize(block);
  const found = employees
    .filter((employee) => normalizedBlock.includes(normalize(employee.name)))
    .sort((a, b) => b.name.length - a.name.length);
  if (!found.length) return [];
  const longest = normalize(found[0].name);
  return found.filter((employee, index) => index === 0 || !longest.includes(normalize(employee.name)));
};

const emptyBanking = (): BankingData => ({
  banco: '', bancoCodigo: '', agencia: '', conta: '', digito: '', tipoConta: '', titular: '', cpfTitular: '', chavePix: '', tipoChavePix: '', textoOriginal: '',
});

const legacyBankingFromObservacoes = (value: unknown) => {
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
};

const bankingPayload = (data: BankingData) => {
  const payload: Record<string, string> = {};
  if (data.banco.trim()) payload.banco = data.banco.trim();
  if (data.bancoCodigo.trim()) payload.banco_codigo = data.bancoCodigo.trim();
  if (data.agencia.trim()) payload.agencia = data.agencia.trim();
  if (data.conta.trim()) payload.conta = data.conta.trim();
  if (data.digito.trim()) payload.conta_digito = data.digito.trim();
  if (data.tipoConta.trim()) payload.tipo_conta = data.tipoConta.trim();
  if (data.titular.trim()) payload.titular_conta = data.titular.trim();
  if (data.cpfTitular.trim()) payload.cpf_titular = data.cpfTitular.trim();
  if (data.chavePix.trim()) payload.pix = data.chavePix.trim();
  if (data.tipoChavePix.trim()) payload.tipo_chave_pix = data.tipoChavePix.trim();
  if (data.textoOriginal.trim()) payload.dados_bancarios_origem = data.textoOriginal.trim();
  payload.dados_bancarios_atualizado_em = new Date().toISOString();
  return payload;
};

const BANK_FIELDS: Array<{ key: keyof BankingData; label: string }> = [
  { key: 'banco', label: 'Banco' },
  { key: 'bancoCodigo', label: 'Código do banco' },
  { key: 'agencia', label: 'Agência' },
  { key: 'conta', label: 'Conta' },
  { key: 'digito', label: 'Dígito' },
  { key: 'tipoConta', label: 'Tipo de conta' },
  { key: 'titular', label: 'Titular' },
  { key: 'cpfTitular', label: 'CPF do titular' },
  { key: 'chavePix', label: 'PIX' },
  { key: 'tipoChavePix', label: 'Tipo de PIX' },
];

const mergeBanking = (current: BankingData, incoming: BankingData): BankingData => {
  const result = { ...current };
  BANK_FIELDS.forEach(({ key }) => {
    const value = String(incoming[key] || '').trim();
    if (value) result[key] = value;
  });
  if (incoming.textoOriginal?.trim()) result.textoOriginal = incoming.textoOriginal.trim();
  return result;
};

const getChanges = (current: BankingData, incoming: BankingData): ChangeItem[] => BANK_FIELDS.flatMap(({ key, label }) => {
  const next = String(incoming[key] || '').trim();
  if (!next) return [];
  const previous = String(current[key] || '').trim();
  if (normalize(previous) === normalize(next)) return [];
  return [{ key, label, oldValue: previous || 'Não informado', newValue: next }];
});

const fieldSummary = (data: BankingData) => [
  data.banco && `Banco: ${data.banco}`,
  data.agencia && `Agência: ${data.agencia}`,
  data.conta && `Conta: ${data.conta}${data.digito ? `-${data.digito}` : ''}`,
  data.tipoConta && `Tipo: ${data.tipoConta}`,
  data.chavePix && `PIX: ${data.chavePix}`,
].filter(Boolean).join(' • ');

const buildEmailForRow = (row: BulkRow): PreparedEmail => {
  const employee = row.employee!;
  const company = row.companyName || 'Empresa não identificada';
  const oldLines = row.changes.map((item) => `${item.label}: ${item.oldValue}`).join('\n');
  const newLines = row.changes.map((item) => `${item.label}: ${item.newValue}`).join('\n');
  return {
    to: FINANCE_EMAIL,
    cc: MANDATORY_EMAIL_CC,
    subject: `ALTERAÇÃO DE CONTA BANCÁRIA - ${employee.name} - ${company}`,
    body: `Prezados Robson e Paula,\n\nSolicito a alteração dos dados bancários do funcionário abaixo para os próximos pagamentos.\n\nFuncionário: ${employee.name}\nCPF: ${employee.cpf || 'Não informado'}\nEmpresa: ${company}\n\nDADOS ANTERIORES\n${oldLines}\n\nNOVOS DADOS\n${newLines}\n\nA alteração foi registrada no TOPAC RH PRO.\n\nPeço, por gentileza, que considerem os novos dados bancários para os próximos pagamentos e confirmem a atualização.\n\nAtenciosamente,\nTOPAC RH PRO`,
  };
};

const buildConsolidatedEmail = (rows: BulkRow[]): PreparedEmail => {
  if (rows.length === 1) return buildEmailForRow(rows[0]);
  const sections = rows.map((row, index) => {
    const email = buildEmailForRow(row);
    return `ALTERAÇÃO ${index + 1}\n${email.body.replace(/^Prezados Robson e Paula,\n\n/, '').replace(/\n\nAtenciosamente,\nTOPAC RH PRO$/, '')}`;
  }).join('\n\n----------------------------------------\n\n');
  return {
    to: FINANCE_EMAIL,
    cc: MANDATORY_EMAIL_CC,
    subject: `ALTERAÇÃO DE DADOS BANCÁRIOS - ${rows.length} FUNCIONÁRIOS`,
    body: `Prezados Robson e Paula,\n\nSeguem solicitações de alteração de dados bancários registradas no TOPAC RH PRO.\n\n${sections}\n\nAtenciosamente,\nTOPAC RH PRO`,
  };
};

const openEmail = (email: PreparedEmail) => {
  window.location.href = `mailto:${encodeURIComponent(email.to)}?cc=${encodeURIComponent(email.cc.join(','))}&subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
};

const BulkBankingDataEditor: React.FC<Props> = ({ open, onOpenChange, employees, companies, companyId, onSaved }) => {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [preparedEmail, setPreparedEmail] = useState<PreparedEmail | null>(null);
  const [loadingCurrentBanking, setLoadingCurrentBanking] = useState(false);

  const scopedEmployees = useMemo(() => companyId ? employees.filter((employee) => employee.companyId === companyId) : employees, [companyId, employees]);
  const scopeLabel = companyId ? companies.find((company) => company.id === companyId)?.name || 'empresa selecionada' : 'Todas as empresas';
  const companyName = (employee: EmployeeLike) => companies.find((company) => company.id === employee.companyId)?.name || 'Empresa não identificada';
  const readyCount = rows.filter((row) => row.status === 'ready' || row.status === 'save_error').length;
  const savedCount = rows.filter((row) => row.status === 'saved').length;
  const blockedCount = rows.filter((row) => ['not_found', 'ambiguous', 'no_data'].includes(row.status)).length;
  const noChangeCount = rows.filter((row) => row.status === 'no_change').length;

  const reset = () => {
    setText('');
    setRows([]);
    setSaving(false);
    setAnalyzing(false);
    setPreparedEmail(null);
    setLoadingCurrentBanking(false);
  };

  const close = () => {
    if (saving || analyzing) return;
    reset();
    onOpenChange(false);
  };

  const analyze = async () => {
    const blocks = splitIntoBlocks(text, scopedEmployees);
    if (!blocks.length) {
      setRows([]);
      toast.error('Cole a lista antes de analisar.');
      return;
    }
    setAnalyzing(true);
    setPreparedEmail(null);
    try {
      const prelim = blocks.map((block, index) => ({ block, index, matches: matchEmployee(block, scopedEmployees), parsed: parseBankingText(block) }));
      const ids = Array.from(new Set(prelim.filter((item) => item.matches.length === 1).map((item) => item.matches[0].id)));
      const currentMap = new Map<string, BankingData>();
      if (ids.length) {
        const { data, error } = await (supabase as any).from('funcionarios')
          .select('id,nome,cpf,banco,banco_codigo,agencia,conta,conta_digito,tipo_conta,titular_conta,cpf_titular,pix,tipo_chave_pix,dados_bancarios_origem,observacoes')
          .in('id', ids);
        if (error) throw error;
        ((data as any[]) || []).forEach((row) => currentMap.set(row.id, bankingFromRow(row)));
      }

      const nextRows = prelim.map(({ block, index, matches, parsed }): BulkRow => {
        if (!matches.length) return { key: `${index}-${block.slice(0, 24)}`, source: block, matches: [], banking: parsed.data, currentBanking: emptyBanking(), finalBanking: parsed.data, changes: [], identified: parsed.identified, warnings: parsed.warnings, status: 'not_found' };
        if (matches.length > 1) return { key: `${index}-${block.slice(0, 24)}`, source: block, matches, banking: parsed.data, currentBanking: emptyBanking(), finalBanking: parsed.data, changes: [], identified: parsed.identified, warnings: parsed.warnings, status: 'ambiguous' };
        const employee = matches[0];
        const currentBanking = currentMap.get(employee.id) || emptyBanking();
        const finalBanking = mergeBanking(currentBanking, parsed.data);
        const changes = getChanges(currentBanking, parsed.data);
        if (!parsed.identified.length) return { key: `${index}-${employee.id}`, source: block, employee, companyName: companyName(employee), banking: parsed.data, currentBanking, finalBanking, changes, identified: parsed.identified, warnings: parsed.warnings, status: 'no_data' };
        if (!changes.length) return { key: `${index}-${employee.id}`, source: block, employee, companyName: companyName(employee), banking: parsed.data, currentBanking, finalBanking, changes, identified: parsed.identified, warnings: parsed.warnings, status: 'no_change' };
        return { key: `${index}-${employee.id}`, source: block, employee, companyName: companyName(employee), banking: parsed.data, currentBanking, finalBanking, changes, identified: parsed.identified, warnings: parsed.warnings, status: 'ready' };
      });
      setRows(nextRows);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível analisar os dados atuais.');
    } finally {
      setAnalyzing(false);
    }
  };

  const saveAll = async () => {
    const targets = rows.filter((row) => (row.status === 'ready' || row.status === 'save_error') && row.employee && row.changes.length);
    if (!targets.length) return toast.error('Nenhuma alteração bancária pronta para salvar.');
    setSaving(true);

    const results: Array<{ key: string; error: string }> = [];
    const savedRows: BulkRow[] = [];
    for (const row of targets) {
      const email = buildEmailForRow(row);
      const { error: updateError } = await (supabase as any).from('funcionarios').update(bankingPayload(row.banking)).eq('id', row.employee!.id);
      if (updateError) {
        results.push({ key: row.key, error: updateError.message });
        continue;
      }
      const { error: historyError } = await (supabase as any).from('employee_banking_changes').insert({
        employee_id: row.employee!.id,
        company_id: row.employee!.companyId,
        previous_data: row.currentBanking,
        new_data: row.finalBanking,
        fields_changed: row.changes.map((item) => item.label),
        source_text: row.source,
        email_to: email.to,
        email_cc: email.cc.join('; '),
        email_subject: email.subject,
        email_body: email.body,
        email_status: 'PREPARADO',
      });
      results.push({ key: row.key, error: historyError ? `Dados atualizados, mas o histórico falhou: ${historyError.message}` : '' });
      if (!historyError) savedRows.push(row);
    }

    const resultMap = new Map(results.map((result) => [result.key, result]));
    const failed = results.filter((result) => result.error);
    setRows((current) => current.map((row) => {
      const result = resultMap.get(row.key);
      if (!result) return row;
      return result.error ? { ...row, status: 'save_error', saveError: result.error } : { ...row, status: 'saved', saveError: undefined };
    }));
    setSaving(false);
    await onSaved();

    if (savedRows.length) setPreparedEmail(buildConsolidatedEmail(savedRows));
    if (failed.length) {
      toast.error(`${savedRows.length} alteração(ões) registrada(s). ${failed.length} ficaram marcadas para revisão.`);
      return;
    }
    toast.success(`${savedRows.length} alteração(ões) bancária(s) registrada(s) no histórico. E-mail do Financeiro preparado.`);
  };

  const sendCurrentBanking = async () => {
    if (scopedEmployees.length !== 1 || loadingCurrentBanking) return;
    const employee = scopedEmployees[0];
    setLoadingCurrentBanking(true);
    try {
      const { data, error } = await (supabase as any)
        .from('funcionarios')
        .select('id,nome,cpf,banco,banco_codigo,agencia,conta,conta_digito,tipo_conta,titular_conta,cpf_titular,pix,tipo_chave_pix,dados_bancarios_origem,observacoes')
        .eq('id', employee.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Funcionário não encontrado no cadastro.');

      const current = bankingFromRow(data);
      const storedFields = [
        ['Banco', current.banco],
        ['Código do banco', current.bancoCodigo],
        ['Agência', current.agencia],
        ['Conta', current.conta],
        ['Dígito', current.digito],
        ['Tipo de conta', current.tipoConta],
        ['Titular', String(data.titular_conta || '').trim()],
        ['CPF do titular', String(data.cpf_titular || '').trim()],
        ['PIX', current.chavePix],
        ['Tipo de PIX', current.tipoChavePix],
      ].map(([label, raw]) => [String(label), String(raw || '').trim()] as const)
        .filter(([, value]) => Boolean(value));

      if (!storedFields.length) {
        toast.error('Nenhum dado bancário cadastrado para este funcionário.');
        return;
      }

      const company = companyName(employee);
      const lines = storedFields.map(([label, value]) => `${label}: ${value}`).join('\n');

      const email: PreparedEmail = {
        to: FINANCE_EMAIL,
        cc: MANDATORY_EMAIL_CC,
        subject: `DADOS BANCÁRIOS CADASTRADOS - ${employee.name} - ${company}`,
        body: `Prezados Robson e Paula,\n\nSeguem abaixo os dados bancários que constam atualmente cadastrados no TOPAC RH PRO para o funcionário indicado.\n\nFuncionário: ${employee.name}\nCPF: ${employee.cpf || 'Não informado'}\nEmpresa: ${company}\n\nDADOS BANCÁRIOS CADASTRADOS\n${lines}\n\nEste envio é apenas informativo e representa o cadastro atual. Nenhuma alteração bancária foi realizada nesta operação.\n\nPeço, por gentileza, a conferência e utilização destes dados nos próximos pagamentos.\n\nAtenciosamente,\nTOPAC RH PRO`,
      };

      setPreparedEmail(email);
      openEmail(email);
      toast.success('Dados bancários cadastrados preparados para o Financeiro.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar os dados bancários cadastrados.');
    } finally {
      setLoadingCurrentBanking(false);
    }
  };

  const copyPreparedEmail = async () => {
    if (!preparedEmail) return;
    await navigator.clipboard.writeText(`Para: ${preparedEmail.to}\nCc: ${preparedEmail.cc.join('; ')}\nAssunto: ${preparedEmail.subject}\n\n${preparedEmail.body}`);
    toast.success('E-mail copiado.');
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /> Alteração de conta bancária</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <b>Escopo: {scopeLabel}</b>
            <p className="mt-1 text-xs text-muted-foreground">Cole os dados recebidos. O sistema identifica o funcionário, compara com a ficha atual e mostra somente o que realmente mudou antes de salvar.</p>
          </div>

          {scopedEmployees.length === 1 && (
            <div className="flex flex-col gap-3 rounded-xl border border-violet-400/30 bg-violet-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold">Enviar cadastro bancário atual</p>
                <p className="mt-1 text-xs text-muted-foreground">Envia exatamente os dados bancários que já aparecem na ficha do funcionário, inclusive cadastros antigos. Não altera nada e não inclui salário.</p>
              </div>
              <Button type="button" onClick={() => void sendCurrentBanking()} disabled={loadingCurrentBanking || saving || analyzing} className="shrink-0">
                ${loadingCurrentBanking ? 'Carregando...' : 'Enviar dados cadastrados ao Financeiro'}
              </Button>
            </div>
          )}

          {scopedEmployees.length === 1 && (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-muted-foreground">
              <b className="text-amber-300">Alteração de conta:</b> use o campo abaixo somente quando houver mudança. Após salvar, o e-mail compara também com cadastros antigos e discrimina apenas os campos efetivamente alterados, mostrando valor anterior → novo valor.
            </div>
          )}

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-[210px] w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            placeholder={'FRANCINALDO GIL\nBanco: Nubank\nAgência: 0001\nConta: 123456-7\nPIX: CPF 000.000.000-00'}
            disabled={saving || analyzing}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void analyze()} disabled={saving || analyzing || !text.trim()}>{analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-2 h-4 w-4" />} Identificar e comparar</Button>
            {!!rows.length && <span className="text-xs text-muted-foreground">{readyCount} alteração(ões) • {noChangeCount} sem mudança • {savedCount} salva(s) • {blockedCount} para revisão</span>}
          </div>

          {!!rows.length && <div className="space-y-2">
            {rows.map((row, index) => {
              const ok = row.status === 'ready' || row.status === 'saved';
              const error = row.status === 'save_error';
              return <div key={row.key} className={`rounded-lg border p-3 ${row.status === 'saved' ? 'border-success/50 bg-success/5' : ok ? 'border-primary/30' : row.status === 'no_change' ? 'border-border bg-muted/20' : error ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5'}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{row.status === 'saved' ? <CheckCircle2 className="h-5 w-5 text-success" /> : row.status === 'ready' ? <CheckCircle2 className="h-5 w-5 text-primary" /> : row.status === 'save_error' ? <XCircle className="h-5 w-5 text-destructive" /> : row.status === 'no_change' ? <CheckCircle2 className="h-5 w-5 text-muted-foreground" /> : <AlertTriangle className="h-5 w-5 text-warning" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><b className="text-sm">{index + 1}. {row.employee?.name || 'Funcionário não identificado'}</b>{row.companyName && <span className="ml-2 text-xs text-muted-foreground">{row.companyName}</span>}</div>
                      <span className="text-[11px] font-semibold uppercase">{row.status === 'ready' ? 'Alteração encontrada' : row.status === 'saved' ? 'Salvo no histórico' : row.status === 'no_change' ? 'Sem alteração' : row.status === 'not_found' ? 'Nome não encontrado' : row.status === 'ambiguous' ? 'Nome ambíguo' : row.status === 'no_data' ? 'Sem dados bancários reconhecidos' : 'Falha ao salvar'}</span>
                    </div>
                    {row.status === 'ambiguous' && <p className="mt-1 text-xs text-warning">Encontrados: {(row.matches || []).map((employee) => `${employee.name} — ${companyName(employee)}`).join(' • ')}</p>}
                    {(row.status === 'ready' || row.status === 'saved' || row.status === 'save_error') && <div className="mt-2 space-y-1.5">
                      {row.changes.map((change) => <div key={String(change.key)} className="grid grid-cols-[110px_1fr_24px_1fr] items-center gap-2 rounded-md border border-violet-400/10 bg-black/10 px-2 py-1.5 text-xs">
                        <b className="text-muted-foreground">{change.label}</b>
                        <span className="truncate text-red-300/90" title={change.oldValue}>{change.oldValue}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-violet-300" />
                        <span className="truncate font-semibold text-emerald-300" title={change.newValue}>{change.newValue}</span>
                      </div>)}
                    </div>}
                    {row.status === 'no_change' && <p className="mt-1 text-xs text-muted-foreground">Os dados colados são iguais aos dados já cadastrados. Nada será gravado.</p>}
                    {row.status === 'ready' && <p className="mt-2 text-[11px] text-muted-foreground">Dados finais: {fieldSummary(row.finalBanking) || 'Dados bancários identificados.'}</p>}
                    {row.saveError && <p className="mt-1 text-xs text-destructive">{row.saveError}</p>}
                    {row.status === 'not_found' && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{row.source.split('\n')[0]}</p>}
                  </div>
                </div>
              </div>;
            })}
          </div>}

          {preparedEmail && <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-bold text-amber-300">E-mail do Financeiro pronto</p><p className="text-xs text-muted-foreground">Para Robson e Paula · {preparedEmail.to} · CC: {preparedEmail.cc.join(', ')}</p></div>
              <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void copyPreparedEmail()}><Copy className="mr-2 h-4 w-4" /> Copiar</Button><Button type="button" size="sm" onClick={() => openEmail(preparedEmail)}><Mail className="mr-2 h-4 w-4" /> Abrir no e-mail</Button></div>
            </div>
            <p className="mt-2 text-xs font-semibold">{preparedEmail.subject}</p>
          </div>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close} disabled={saving || analyzing}>Fechar</Button>
          <Button onClick={() => void saveAll()} disabled={saving || analyzing || !readyCount}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando alterações...</> : <>Salvar {readyCount} alteração(ões)</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkBankingDataEditor;