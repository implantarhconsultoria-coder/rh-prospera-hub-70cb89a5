import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { extractPdfTextByLines, renderPdfPagesToDataUrls } from '@/lib/pdf';
import type { Company, Employee } from '@/types/database';
import { toast } from 'sonner';

type ParsedPerson = { name: string; cpf: string; birthDate: string };
type ImportRow = {
  key: string;
  fileName: string;
  company?: Company;
  parsed: ParsedPerson;
  employee?: Employee;
  cpfAction: 'fill' | 'same' | 'conflict' | 'missing-source';
  birthAction: 'fill' | 'same' | 'conflict' | 'missing-source';
  matchStatus: 'matched' | 'unmatched' | 'ambiguous';
  message?: string;
};
type FileIssue = { fileName: string; message: string };
type Props = { open: boolean; onOpenChange: (open: boolean) => void; employees: Employee[]; companies: Company[]; companyId?: string; onSaved: () => Promise<void> | void };

type BatchOcrPerson = { nome?: string; cpf?: string; data_nascimento?: string; confianca?: number };
type BatchOcrResult = { empresa?: { razao_social?: string; cnpj?: string }; funcionarios?: BatchOcrPerson[]; observacoes?: string[] };

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeText = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
const normalizeDate = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
};
const formatDateBR = (value: string) => { const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '—'; };
const extractCompanyCnpj = (text: string) => {
  const direct = text.match(/CNPJ\s*\/\s*CEI\s*:\s*([0-9.\/\-]{14,20})/i)?.[1];
  if (digits(direct).length === 14) return direct || '';
  const all = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
  return all.find((value) => digits(value).length === 14) || '';
};
const extractCompanyName = (text: string) => String(text.match(/Raz[aã]o\s+Social\s*:\s*(.+?)(?=\s+(?:CNPJ\s*\/\s*CEI|Endere[cç]o\s*:|Bairro\s*:|Cidade\s*:|Nome\s*:)|$)/i)?.[1] || '').replace(/\s+/g, ' ').trim();

const parseEmployeesReport = (text: string): ParsedPerson[] => {
  const cleaned = text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  const starts = [...cleaned.matchAll(/\bNome\s*:/gi)].map((match) => match.index || 0);
  const people: ParsedPerson[] = [];
  starts.forEach((start, index) => {
    const block = cleaned.slice(start, index + 1 < starts.length ? starts[index + 1] : cleaned.length);
    const name = block.match(/Nome\s*:\s*(.+?)(?=\s+Data\s+de\s+Nascimento\s*:)/i)?.[1]?.trim() || '';
    if (!name || /TOTAL\s+DE\s+FUNCION/i.test(name)) return;
    const birthRaw = block.match(/Data\s+de\s+Nascimento\s*:\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i)?.[1] || '';
    const cpfRaw = block.match(/CPF\s*:\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i)?.[1] || '';
    people.push({ name: name.replace(/\s+/g, ' '), cpf: cpfRaw, birthDate: normalizeDate(birthRaw) });
  });
  return people;
};

const mergeVisualOcr = (base: ParsedPerson[], visual: BatchOcrResult): ParsedPerson[] => {
  const read = Array.isArray(visual.funcionarios) ? visual.funcionarios : [];
  return base.map((person) => {
    const normalized = normalizeText(person.name);
    const match = read.find((item) => normalizeText(item.nome) === normalized)
      || read.find((item) => normalizeText(item.nome).includes(normalized) || normalized.includes(normalizeText(item.nome)));
    return {
      name: person.name,
      cpf: person.cpf || String(match?.cpf || '').trim(),
      birthDate: person.birthDate || normalizeDate(match?.data_nascimento),
    };
  });
};

const actionForCpf = (current: string, source: string): ImportRow['cpfAction'] => !source ? 'missing-source' : !current ? 'fill' : digits(current) === digits(source) ? 'same' : 'conflict';
const actionForBirth = (current: string, source: string): ImportRow['birthAction'] => !source ? 'missing-source' : !current ? 'fill' : normalizeDate(current) === normalizeDate(source) ? 'same' : 'conflict';
const actionLabel = (action: ImportRow['cpfAction'] | ImportRow['birthAction']) => action === 'fill' ? 'PREENCHER' : action === 'same' ? 'JÁ CONFERE' : action === 'conflict' ? 'CONFERIR' : 'NÃO ENCONTRADO';
const actionClass = (action: ImportRow['cpfAction'] | ImportRow['birthAction']) => action === 'fill' ? 'bg-primary/15 text-primary border-primary/30' : action === 'same' ? 'bg-success/15 text-success border-success/30' : action === 'conflict' ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-muted text-muted-foreground';

const BulkEmployeeDataImporter: React.FC<Props> = ({ open, onOpenChange, employees, companies, companyId, onSaved }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [issues, setIssues] = useState<FileIssue[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [progress, setProgress] = useState('');

  const selectedCompany = companyId ? companies.find((company) => company.id === companyId) : undefined;
  const pendingRows = useMemo(() => rows.filter((row) => row.matchStatus === 'matched' && (row.cpfAction === 'fill' || row.birthAction === 'fill')), [rows]);
  const conflictRows = useMemo(() => rows.filter((row) => row.matchStatus !== 'matched' || row.cpfAction === 'conflict' || row.birthAction === 'conflict'), [rows]);
  const matchedRows = rows.filter((row) => row.matchStatus === 'matched').length;

  const reset = () => { setRows([]); setIssues([]); setFileNames([]); setProgress(''); if (inputRef.current) inputRef.current.value = ''; };

  const resolveCompany = (text: string) => {
    const reportCnpj = extractCompanyCnpj(text);
    const reportName = extractCompanyName(text);
    if (selectedCompany) {
      if (reportCnpj && digits(selectedCompany.cnpj) && digits(reportCnpj) !== digits(selectedCompany.cnpj)) return { error: `O PDF pertence ao CNPJ ${reportCnpj}, diferente da empresa selecionada (${selectedCompany.cnpj}).` };
      return { company: selectedCompany };
    }
    if (reportCnpj) { const company = companies.find((item) => digits(item.cnpj) === digits(reportCnpj)); if (company) return { company }; }
    if (reportName) {
      const normalized = normalizeText(reportName);
      const company = companies.find((item) => normalizeText(item.name) === normalized || normalized.includes(normalizeText(item.name)) || normalizeText(item.name).includes(normalized));
      if (company) return { company };
    }
    return { error: 'Não foi possível identificar a empresa/CNPJ deste PDF.' };
  };

  const enrichWithVisualOcr = async (file: File, bytes: Uint8Array, text: string, parsedPeople: ParsedPerson[], nextIssues: FileIssue[]) => {
    if (!parsedPeople.some((person) => !person.cpf || !person.birthDate)) return parsedPeople;
    setProgress(`Lendo visualmente CPF e nascimento — ${file.name}`);
    try {
      const rendered = await renderPdfPagesToDataUrls(bytes, 1.8, 5);
      const { data, error } = await supabase.functions.invoke('ocr-funcionarios-em-massa', { body: { fileName: file.name, text, images: rendered.pageUrls } });
      if (error) throw error;
      const result: BatchOcrResult = data?.data || data || {};
      const merged = mergeVisualOcr(parsedPeople, result);
      const unread = merged.filter((person) => !person.cpf && !person.birthDate).length;
      if (unread) nextIssues.push({ fileName: file.name, message: `${unread} funcionário(s) ficaram sem CPF e nascimento legíveis e não serão alterados nesses campos.` });
      return merged;
    } catch (error: any) {
      nextIssues.push({ fileName: file.name, message: `A leitura visual não foi concluída: ${error?.message || 'erro de OCR'}. Os nomes ainda foram conferidos pela camada de texto.` });
      return parsedPeople;
    }
  };

  const processFiles = async (files: File[]) => {
    if (!files.length) return;
    setProcessing(true); setRows([]); setIssues([]); setFileNames(files.map((file) => file.name));
    const nextRows: ImportRow[] = []; const nextIssues: FileIssue[] = [];
    for (const [fileIndex, file] of files.entries()) {
      try {
        setProgress(`Processando ${fileIndex + 1} de ${files.length} — ${file.name}`);
        if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { nextIssues.push({ fileName: file.name, message: 'Arquivo ignorado: envie somente PDF.' }); continue; }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const text = await extractPdfTextByLines(bytes);
        if (!text.trim()) { nextIssues.push({ fileName: file.name, message: 'PDF sem camada de texto suficiente para identificar os nomes. Nenhum cadastro foi alterado.' }); continue; }
        const companyResolution = resolveCompany(text);
        if (!companyResolution.company) { nextIssues.push({ fileName: file.name, message: companyResolution.error || 'Empresa não identificada.' }); continue; }
        const company = companyResolution.company;
        let parsedPeople = parseEmployeesReport(text);
        if (!parsedPeople.length) { nextIssues.push({ fileName: file.name, message: 'Nenhum funcionário foi identificado no padrão Nome / Data de Nascimento / CPF.' }); continue; }
        parsedPeople = await enrichWithVisualOcr(file, bytes, text, parsedPeople, nextIssues);

        for (const parsed of parsedPeople) {
          const normalizedName = normalizeText(parsed.name);
          const sameCompany = employees.filter((employee) => employee.companyId === company.id);
          const byName = sameCompany.filter((employee) => normalizeText(employee.name) === normalizedName);
          const byCpf = parsed.cpf ? sameCompany.filter((employee) => digits(employee.cpf) === digits(parsed.cpf) && digits(parsed.cpf).length === 11) : [];
          const candidates = [...new Map([...byName, ...byCpf].map((employee) => [employee.id, employee])).values()];
          const employee = candidates.length === 1 ? candidates[0] : undefined;
          const matchStatus: ImportRow['matchStatus'] = candidates.length === 1 ? 'matched' : candidates.length > 1 ? 'ambiguous' : 'unmatched';
          nextRows.push({
            key: `${file.name}-${company.id}-${normalizedName}-${nextRows.length}`, fileName: file.name, company, parsed, employee,
            cpfAction: employee ? actionForCpf(employee.cpf, parsed.cpf) : 'missing-source',
            birthAction: employee ? actionForBirth(employee.dataNascimento, parsed.birthDate) : 'missing-source', matchStatus,
            message: matchStatus === 'unmatched' ? 'Funcionário não localizado no cadastro desta empresa.' : matchStatus === 'ambiguous' ? 'Mais de um cadastro pode corresponder a este funcionário.' : undefined,
          });
        }
      } catch (error: any) { nextIssues.push({ fileName: file.name, message: error?.message || 'Falha ao processar o PDF.' }); }
    }
    setRows(nextRows); setIssues(nextIssues); setProcessing(false); setProgress('');
    if (nextRows.length) toast.success(`${nextRows.length} funcionário(s) analisado(s). Confira antes de atualizar.`);
  };

  const saveMissingFields = async () => {
    if (!pendingRows.length || saving) return;
    setSaving(true); let updated = 0; const failures: string[] = [];
    for (const row of pendingRows) {
      if (!row.employee) continue;
      const payload: Record<string, unknown> = {};
      if (row.cpfAction === 'fill' && row.parsed.cpf) payload.cpf = row.parsed.cpf;
      if (row.birthAction === 'fill' && row.parsed.birthDate) payload.data_nascimento = row.parsed.birthDate;
      if (!Object.keys(payload).length) continue;
      const { error } = await (supabase as any).from('funcionarios').update(payload).eq('id', row.employee.id);
      if (error) failures.push(`${row.employee.name}: ${error.message}`); else updated += 1;
    }
    setSaving(false); await onSaved();
    if (updated) toast.success(`${updated} cadastro(s) atualizado(s). Nenhum dado existente foi sobrescrito.`);
    if (failures.length) toast.error(`${failures.length} cadastro(s) não puderam ser atualizados.`);
    if (!failures.length) reset();
  };

  return <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value && !saving) reset(); }}>
    <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5" /> Atualização em massa de cadastros</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-semibold">Upload de relatório de funcionários</p>
          <p className="mt-1 text-xs text-muted-foreground">Envie um ou vários PDFs. A plataforma lê a empresa, identifica todos os funcionários e usa leitura visual quando CPF ou data de nascimento não estiverem na camada de texto. Só campos vazios são preenchidos; divergências nunca são sobrescritas automaticamente.</p>
          {selectedCompany && <p className="mt-2 text-xs font-medium">Empresa selecionada: {selectedCompany.name} — {selectedCompany.cnpj}</p>}
        </div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(event) => void processFiles(Array.from(event.target.files || []))} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={processing || saving}><Upload className="mr-2 h-4 w-4" /> {processing ? 'Lendo PDFs...' : 'Selecionar PDF(s)'}</Button>
          {(rows.length > 0 || issues.length > 0) && <Button type="button" variant="outline" onClick={reset} disabled={processing || saving}>Limpar análise</Button>}
        </div>
        {processing && <div className="flex items-center gap-2 rounded-lg border p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin" /><span>{progress || 'Processando os relatórios em massa...'}</span></div>}
        {fileNames.length > 0 && !processing && <div className="flex flex-wrap gap-2">{fileNames.map((name) => <Badge key={name} variant="outline"><FileText className="mr-1 h-3 w-3" /> {name}</Badge>)}</div>}
        {rows.length > 0 && !processing && <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Lidos</p><p className="text-xl font-bold">{rows.length}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Vinculados</p><p className="text-xl font-bold text-success">{matchedRows}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Com dados a preencher</p><p className="text-xl font-bold text-primary">{pendingRows.length}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Pendências/conflitos</p><p className="text-xl font-bold text-destructive">{conflictRows.length}</p></div>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[950px] text-left text-xs">
              <thead className="bg-muted/70"><tr><th className="p-3">Funcionário</th><th className="p-3">Empresa</th><th className="p-3">CPF atual</th><th className="p-3">CPF no PDF</th><th className="p-3">Nascimento atual</th><th className="p-3">Nascimento no PDF</th><th className="p-3">Situação</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.key} className="border-t align-top">
                <td className="p-3"><p className="font-semibold">{row.employee?.name || row.parsed.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{row.fileName}</p>{row.message && <p className="mt-1 text-[10px] text-destructive">{row.message}</p>}</td>
                <td className="p-3">{row.company?.name || '—'}</td>
                <td className="p-3">{row.employee?.cpf || 'Vazio'}</td>
                <td className="p-3"><div>{row.parsed.cpf || 'Não encontrado'}</div>{row.employee && <Badge variant="outline" className={`mt-1 text-[9px] ${actionClass(row.cpfAction)}`}>{actionLabel(row.cpfAction)}</Badge>}</td>
                <td className="p-3">{row.employee?.dataNascimento ? formatDateBR(normalizeDate(row.employee.dataNascimento)) : 'Vazio'}</td>
                <td className="p-3"><div>{row.parsed.birthDate ? formatDateBR(row.parsed.birthDate) : 'Não encontrado'}</div>{row.employee && <Badge variant="outline" className={`mt-1 text-[9px] ${actionClass(row.birthAction)}`}>{actionLabel(row.birthAction)}</Badge>}</td>
                <td className="p-3">{row.matchStatus === 'matched' ? (row.cpfAction === 'conflict' || row.birthAction === 'conflict' ? <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Conferir divergência</span> : row.cpfAction === 'fill' || row.birthAction === 'fill' ? <span className="inline-flex items-center gap-1 text-primary"><Upload className="h-3.5 w-3.5" /> Pronto para preencher</span> : <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Cadastro já confere</span>) : <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Não atualizar</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
        {issues.length > 0 && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"><p className="mb-2 text-sm font-semibold text-destructive">Pendências da leitura</p>{issues.map((issue, index) => <p key={`${issue.fileName}-${index}`} className="text-xs"><b>{issue.fileName}:</b> {issue.message}</p>)}</div>}
      </div>
      <DialogFooter className="gap-2 sm:gap-0"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Fechar</Button><Button onClick={() => void saveMissingFields()} disabled={!pendingRows.length || processing || saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Atualizando...</> : <>Atualizar {pendingRows.length} cadastro(s)</>}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
};

export default BulkEmployeeDataImporter;
