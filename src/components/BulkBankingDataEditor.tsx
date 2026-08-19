import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Landmark, Loader2, SearchCheck, XCircle } from 'lucide-react';
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

type RowStatus = 'ready' | 'not_found' | 'ambiguous' | 'no_data' | 'saved' | 'save_error';

type BulkRow = {
  key: string;
  source: string;
  employee?: EmployeeLike;
  companyName?: string;
  matches?: EmployeeLike[];
  banking: BankingData;
  identified: string[];
  warnings: string[];
  status: RowStatus;
  saveError?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeLike[];
  companies: CompanyLike[];
  companyId?: string;
  onSaved: () => Promise<void> | void;
};

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

const fieldSummary = (data: BankingData) => [
  data.banco && `Banco: ${data.banco}`,
  data.agencia && `Agência: ${data.agencia}`,
  data.conta && `Conta: ${data.conta}${data.digito ? `-${data.digito}` : ''}`,
  data.tipoConta && `Tipo: ${data.tipoConta}`,
  data.chavePix && `PIX: ${data.chavePix}`,
].filter(Boolean).join(' • ');

const BulkBankingDataEditor: React.FC<Props> = ({ open, onOpenChange, employees, companies, companyId, onSaved }) => {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [saving, setSaving] = useState(false);

  const scopedEmployees = useMemo(() => companyId ? employees.filter((employee) => employee.companyId === companyId) : employees, [companyId, employees]);
  const scopeLabel = companyId ? companies.find((company) => company.id === companyId)?.name || 'empresa selecionada' : 'Todas as empresas';
  const companyName = (employee: EmployeeLike) => companies.find((company) => company.id === employee.companyId)?.name || 'Empresa não identificada';
  const readyCount = rows.filter((row) => row.status === 'ready' || row.status === 'save_error').length;
  const savedCount = rows.filter((row) => row.status === 'saved').length;
  const blockedCount = rows.filter((row) => ['not_found', 'ambiguous', 'no_data'].includes(row.status)).length;

  const reset = () => {
    setText('');
    setRows([]);
    setSaving(false);
  };

  const close = () => {
    if (saving) return;
    reset();
    onOpenChange(false);
  };

  const analyze = () => {
    const blocks = splitIntoBlocks(text, scopedEmployees);
    if (!blocks.length) {
      setRows([]);
      toast.error('Cole a lista antes de analisar.');
      return;
    }

    const nextRows = blocks.map((block, index): BulkRow => {
      const matches = matchEmployee(block, scopedEmployees);
      const parsed = parseBankingText(block);
      if (!matches.length) return { key: `${index}-${block.slice(0, 24)}`, source: block, matches: [], banking: parsed.data, identified: parsed.identified, warnings: parsed.warnings, status: 'not_found' };
      if (matches.length > 1) return { key: `${index}-${block.slice(0, 24)}`, source: block, matches, banking: parsed.data, identified: parsed.identified, warnings: parsed.warnings, status: 'ambiguous' };
      const employee = matches[0];
      if (!parsed.identified.length) return { key: `${index}-${employee.id}`, source: block, employee, companyName: companyName(employee), banking: parsed.data, identified: parsed.identified, warnings: parsed.warnings, status: 'no_data' };
      return { key: `${index}-${employee.id}`, source: block, employee, companyName: companyName(employee), banking: parsed.data, identified: parsed.identified, warnings: parsed.warnings, status: 'ready' };
    });
    setRows(nextRows);
  };

  const saveAll = async () => {
    const targets = rows.filter((row) => (row.status === 'ready' || row.status === 'save_error') && row.employee);
    if (!targets.length) return toast.error('Nenhuma ficha pronta para atualizar.');
    setSaving(true);

    const results = await Promise.all(targets.map(async (row) => {
      const { error } = await (supabase as any).from('funcionarios').update(bankingPayload(row.banking)).eq('id', row.employee!.id);
      return { key: row.key, error: error?.message || '' };
    }));
    const resultMap = new Map(results.map((result) => [result.key, result]));
    const failed = results.filter((result) => result.error);
    setRows((current) => current.map((row) => {
      const result = resultMap.get(row.key);
      if (!result) return row;
      return result.error ? { ...row, status: 'save_error', saveError: result.error } : { ...row, status: 'saved', saveError: undefined };
    }));
    setSaving(false);
    await onSaved();

    if (failed.length) {
      toast.error(`${targets.length - failed.length} ficha(s) atualizada(s). ${failed.length} falharam e ficaram marcadas para revisão.`);
      return;
    }
    toast.success(`${targets.length} ficha(s) bancária(s) atualizada(s) com sucesso.`);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /> Dados bancários em massa</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <b>Escopo: {scopeLabel}</b>
            <p className="mt-1 text-xs text-muted-foreground">Cole um funcionário por bloco. O nome pode vir sozinho na primeira linha ou como “Nome: NOME COMPLETO”. Os dados reconhecidos são gravados diretamente na ficha encontrada; campos que não vierem na lista não são apagados.</p>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-[230px] w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            placeholder={'FRANCINALDO GIL\nBanco: Nubank\nAgência: 0001\nConta: 123456-7\nPIX: CPF 000.000.000-00\n\nIGOR ABREU\nBanco: Banco do Brasil\nAgência: 1234\nConta: 98765-4'}
            disabled={saving}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={analyze} disabled={saving || !text.trim()}><SearchCheck className="mr-2 h-4 w-4" /> Analisar lista</Button>
            {!!rows.length && <span className="text-xs text-muted-foreground">{readyCount} pronta(s) • {savedCount} salva(s) • {blockedCount} para revisão</span>}
          </div>

          {!!rows.length && <div className="space-y-2">
            {rows.map((row, index) => {
              const ok = row.status === 'ready' || row.status === 'saved';
              const error = row.status === 'save_error';
              return <div key={row.key} className={`rounded-lg border p-3 ${row.status === 'saved' ? 'border-success/50 bg-success/5' : ok ? 'border-primary/30' : error ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5'}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{row.status === 'saved' ? <CheckCircle2 className="h-5 w-5 text-success" /> : row.status === 'ready' ? <CheckCircle2 className="h-5 w-5 text-primary" /> : row.status === 'save_error' ? <XCircle className="h-5 w-5 text-destructive" /> : <AlertTriangle className="h-5 w-5 text-warning" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><b className="text-sm">{index + 1}. {row.employee?.name || 'Funcionário não identificado'}</b>{row.companyName && <span className="ml-2 text-xs text-muted-foreground">{row.companyName}</span>}</div>
                      <span className="text-[11px] font-semibold uppercase">{row.status === 'ready' ? 'Pronto para atualizar' : row.status === 'saved' ? 'Atualizado' : row.status === 'not_found' ? 'Nome não encontrado' : row.status === 'ambiguous' ? 'Nome ambíguo' : row.status === 'no_data' ? 'Sem dados bancários reconhecidos' : 'Falha ao salvar'}</span>
                    </div>
                    {row.status === 'ambiguous' && <p className="mt-1 text-xs text-warning">Encontrados: {(row.matches || []).map((employee) => `${employee.name} — ${companyName(employee)}`).join(' • ')}</p>}
                    {(row.status === 'ready' || row.status === 'saved' || row.status === 'save_error') && <p className="mt-1 text-xs text-muted-foreground">{fieldSummary(row.banking) || 'Dados bancários identificados.'}</p>}
                    {row.saveError && <p className="mt-1 text-xs text-destructive">{row.saveError}</p>}
                    {row.status === 'not_found' && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{row.source.split('\n')[0]}</p>}
                  </div>
                </div>
              </div>;
            })}
          </div>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close} disabled={saving}>Fechar</Button>
          <Button onClick={() => void saveAll()} disabled={saving || !readyCount}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Atualizando fichas...</> : <>Atualizar {readyCount} ficha(s)</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkBankingDataEditor;
