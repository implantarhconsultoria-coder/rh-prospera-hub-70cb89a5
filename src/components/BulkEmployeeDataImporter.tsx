import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { extractPdfTextByLines, renderPdfEmployeeRowCrops, renderPdfPagesToDataUrls } from '@/lib/pdf';
import type { Company, Employee } from '@/types/database';
import { toast } from 'sonner';

type ParsedPerson = { name: string; cpf: string; birthDate: string };
type ImportRow = {
  key: string;
  fileName: string;
  company?: Company;
  parsed: ParsedPerson;
  employee?: Employee;
  cpfAction: 'fill' | 'same' | 'missing-source';
  birthAction: 'fill' | 'same' | 'missing-source';
  matchStatus: 'matched' | 'unmatched' | 'ambiguous';
  message?: string;
};
type FileIssue = { fileName: string; message: string };
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  companies: Company[];
  companyId?: string;
  onSaved: () => Promise<void> | void;
};

type TesseractWorker = {
  recognize: (image: string) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const normalizeDate = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const formatDateBR = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '—';
};

const isValidCpf = (value: unknown) => {
  const cpf = digits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base: number) => {
    let sum = 0;
    for (let i = 0; i < base; i += 1) sum += Number(cpf[i]) * (base + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
};

const formatCpf = (value: unknown) => {
  const cpf = digits(value);
  if (!isValidCpf(cpf)) return '';
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

const extractCompanyCnpj = (text: string) => {
  const direct = text.match(/CNPJ\s*\/\s*CEI\s*:\s*([0-9.\/\-]{14,20})/i)?.[1];
  if (digits(direct).length === 14) return direct || '';
  const all = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
  return all.find((value) => digits(value).length === 14) || '';
};

const extractCompanyName = (text: string) => String(
  text.match(/Raz[aã]o\s+Social\s*:\s*(.+?)(?=\s+(?:CNPJ\s*\/\s*CEI|Endere[cç]o\s*:|Bairro\s*:|Cidade\s*:|Nome\s*:)|$)/i)?.[1] || '',
).replace(/\s+/g, ' ').trim();

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
    people.push({
      name: name.replace(/\s+/g, ' '),
      cpf: formatCpf(cpfRaw),
      birthDate: normalizeDate(birthRaw),
    });
  });

  return people;
};

const tokenSimilarity = (a: string, b: string) => {
  const aa = new Set(normalizeText(a).split(' ').filter((token) => token.length > 2));
  const bb = new Set(normalizeText(b).split(' ').filter((token) => token.length > 2));
  if (!aa.size || !bb.size) return 0;
  let hits = 0;
  aa.forEach((token) => { if (bb.has(token)) hits += 1; });
  return hits / Math.max(aa.size, bb.size);
};

const extractCpfFromBlock = (block: string) => {
  const candidates = block.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g) || [];
  for (const candidate of candidates) {
    const cpf = formatCpf(candidate);
    if (cpf) return cpf;
  }
  return '';
};

const extractBirthFromBlock = (block: string) => {
  const matches = block.match(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}\b/g) || [];
  for (const candidate of matches) {
    const date = normalizeDate(candidate);
    if (!date) continue;
    const year = Number(date.slice(0, 4));
    const age = new Date().getFullYear() - year;
    if (age >= 14 && age <= 100) return date;
  }
  return '';
};

const PLAUSIBLE_MIN_AGE = 14;
const PLAUSIBLE_MAX_AGE = 100;

const isPlausibleBirth = (isoDate: string) => {
  if (!isoDate) return false;
  const year = Number(isoDate.slice(0, 4));
  const age = new Date().getFullYear() - year;
  return age >= PLAUSIBLE_MIN_AGE && age <= PLAUSIBLE_MAX_AGE;
};

// Sequência visual: datas de nascimento plausíveis, na ordem em que aparecem na página.
const collectOrderedBirthDates = (text: string) => {
  const found: string[] = [];
  const matches = text.match(/\b\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{4}\b/g) || [];
  for (const raw of matches) {
    const iso = normalizeDate(raw.replace(/\s+/g, ''));
    if (isPlausibleBirth(iso)) found.push(iso);
  }
  return found;
};

// Sequência visual: CPFs válidos pelo algoritmo, na ordem em que aparecem na página.
const collectOrderedCpfs = (text: string) => {
  const found: string[] = [];
  const matches = text.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g) || [];
  for (const raw of matches) {
    const cpf = formatCpf(raw);
    if (cpf) found.push(cpf);
  }
  return found;
};

const mergeByName = (base: ParsedPerson[], ocrText: string): ParsedPerson[] => {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return base.map((person) => {
    if (person.cpf && person.birthDate) return person;
    const target = normalizeText(person.name);
    let bestIndex = -1;
    let bestScore = 0;

    lines.forEach((line, index) => {
      const normalizedLine = normalizeText(line);
      const score = normalizedLine.includes(target) || target.includes(normalizedLine)
        ? 1
        : tokenSimilarity(person.name, line);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex < 0 || bestScore < 0.55) return person;
    const block = lines.slice(Math.max(0, bestIndex - 1), Math.min(lines.length, bestIndex + 3)).join(' ');
    return {
      name: person.name,
      cpf: person.cpf || extractCpfFromBlock(block),
      birthDate: person.birthDate || extractBirthFromBlock(block),
    };
  });
};

/**
 * Leitura visual: o relatório é tabular e a ordem visual das linhas é a mesma
 * ordem dos nomes extraídos da camada textual. Quando a quantidade de datas
 * (ou de CPFs) encontrada bate com a quantidade de nomes, associa por ORDEM —
 * mais robusto que depender do OCR acertar o nome inteiro. Caso contrário,
 * cai no fallback por similaridade de nome/linha.
 */
const mergeLocalOcr = (base: ParsedPerson[], ocrText: string): ParsedPerson[] => {
  const byName = mergeByName(base, ocrText);
  const dates = collectOrderedBirthDates(ocrText);
  const cpfs = collectOrderedCpfs(ocrText);
  const datesAligned = dates.length === base.length;
  const cpfsAligned = cpfs.length === base.length;

  if (!datesAligned && !cpfsAligned) return byName;

  return byName.map((person, index) => ({
    name: person.name,
    cpf: person.cpf || (cpfsAligned ? cpfs[index] || '' : ''),
    birthDate: person.birthDate || (datesAligned ? dates[index] || '' : ''),
  }));
};


const actionForCpf = (current: string, source: string): ImportRow['cpfAction'] => current ? 'same' : source ? 'fill' : 'missing-source';
const actionForBirth = (current: string, source: string): ImportRow['birthAction'] => current ? 'same' : source ? 'fill' : 'missing-source';
const actionLabel = (action: ImportRow['cpfAction'] | ImportRow['birthAction']) => action === 'fill' ? 'PREENCHER' : action === 'same' ? 'JÁ PREENCHIDO' : 'NÃO ENCONTRADO';
const actionClass = (action: ImportRow['cpfAction'] | ImportRow['birthAction']) => action === 'fill'
  ? 'bg-primary/15 text-primary border-primary/30'
  : action === 'same'
    ? 'bg-success/15 text-success border-success/30'
    : 'bg-muted text-muted-foreground';

const BulkEmployeeDataImporter: React.FC<Props> = ({ open, onOpenChange, employees, companies, companyId, onSaved }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [issues, setIssues] = useState<FileIssue[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [progress, setProgress] = useState('');
  const [skippedComplete, setSkippedComplete] = useState(0);

  const selectedCompany = companyId ? companies.find((company) => company.id === companyId) : undefined;
  const pendingRows = useMemo(
    () => rows.filter((row) => row.matchStatus === 'matched' && (row.cpfAction === 'fill' || row.birthAction === 'fill')),
    [rows],
  );
  const problemRows = useMemo(
    () => rows.filter((row) => row.matchStatus !== 'matched'
      || (row.employee && !row.employee.cpf && row.cpfAction === 'missing-source')
      || (row.employee && !row.employee.dataNascimento && row.birthAction === 'missing-source')),
    [rows],
  );
  const totalRead = rows.length + skippedComplete;

  const reset = () => {
    setRows([]);
    setIssues([]);
    setFileNames([]);
    setProgress('');
    setSkippedComplete(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const resolveCompany = (text: string) => {
    const reportCnpj = extractCompanyCnpj(text);
    const reportName = extractCompanyName(text);

    if (selectedCompany) {
      if (reportCnpj && digits(selectedCompany.cnpj) && digits(reportCnpj) !== digits(selectedCompany.cnpj)) {
        return { error: `O PDF pertence ao CNPJ ${reportCnpj}, diferente da empresa selecionada (${selectedCompany.cnpj}).` };
      }
      return { company: selectedCompany };
    }

    if (reportCnpj) {
      const company = companies.find((item) => digits(item.cnpj) === digits(reportCnpj));
      if (company) return { company };
    }

    if (reportName) {
      const normalized = normalizeText(reportName);
      const company = companies.find((item) => normalizeText(item.name) === normalized
        || normalized.includes(normalizeText(item.name))
        || normalizeText(item.name).includes(normalized));
      if (company) return { company };
    }

    return { error: 'Não foi possível identificar a empresa/CNPJ deste PDF.' };
  };

  const resolveEmployee = (companyIdValue: string, parsed: ParsedPerson) => {
    const sameCompany = employees.filter((employee) => employee.companyId === companyIdValue);
    const normalizedName = normalizeText(parsed.name);
    const byName = sameCompany.filter((employee) => normalizeText(employee.name) === normalizedName);
    const byCpf = parsed.cpf
      ? sameCompany.filter((employee) => digits(employee.cpf) === digits(parsed.cpf) && digits(parsed.cpf).length === 11)
      : [];
    const candidates = [...new Map([...byName, ...byCpf].map((employee) => [employee.id, employee])).values()];
    return {
      employee: candidates.length === 1 ? candidates[0] : undefined,
      matchStatus: candidates.length === 1 ? 'matched' as const : candidates.length > 1 ? 'ambiguous' as const : 'unmatched' as const,
    };
  };

  const processFiles = async (files: File[]) => {
    if (!files.length) return;
    setProcessing(true);
    setRows([]);
    setIssues([]);
    setFileNames(files.map((file) => file.name));
    setSkippedComplete(0);

    const nextRows: ImportRow[] = [];
    const nextIssues: FileIssue[] = [];
    let completeCount = 0;
    let worker: TesseractWorker | null = null;

    const getWorker = async () => {
      if (worker) return worker;
      setProgress('Preparando leitura visual local...');
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('por', 1, {
        logger: (message: any) => {
          if (message?.status === 'recognizing text' && typeof message.progress === 'number') {
            setProgress(`Lendo CPF e nascimento — ${Math.round(message.progress * 100)}%`);
          }
        },
      }) as unknown as TesseractWorker;
      return worker;
    };

    try {
      for (const [fileIndex, file] of files.entries()) {
        try {
          setProgress(`Processando ${fileIndex + 1} de ${files.length} — ${file.name}`);
          if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            nextIssues.push({ fileName: file.name, message: 'Arquivo ignorado: envie somente PDF.' });
            continue;
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          const text = await extractPdfTextByLines(bytes);
          if (!text.trim()) {
            nextIssues.push({ fileName: file.name, message: 'PDF sem camada de texto suficiente para identificar os nomes.' });
            continue;
          }

          const companyResolution = resolveCompany(text);
          if (!companyResolution.company) {
            nextIssues.push({ fileName: file.name, message: companyResolution.error || 'Empresa não identificada.' });
            continue;
          }
          const company = companyResolution.company;

          let parsedPeople = parseEmployeesReport(text);
          if (!parsedPeople.length) {
            nextIssues.push({ fileName: file.name, message: 'Nenhum funcionário foi identificado no relatório.' });
            continue;
          }

          const needsVisual = parsedPeople.some((parsed) => {
            const resolved = resolveEmployee(company.id, parsed);
            if (!resolved.employee) return true;
            return !resolved.employee.cpf || !resolved.employee.dataNascimento;
          });

          if (needsVisual) {
            setProgress(`Lendo visualmente ${file.name}`);
            try {
              const rendered = await renderPdfPagesToDataUrls(bytes, 2.35, 5);
              const ocrWorker = await getWorker();
              let visualText = '';
              for (const [pageIndex, pageUrl] of rendered.pageUrls.entries()) {
                setProgress(`Leitura visual ${file.name} — página ${pageIndex + 1}/${rendered.pageUrls.length}`);
                const result = await ocrWorker.recognize(pageUrl);
                visualText += `\n${result.data.text || ''}`;
              }
              parsedPeople = mergeLocalOcr(parsedPeople, visualText);
            } catch (error: any) {
              nextIssues.push({
                fileName: file.name,
                message: `A leitura visual local não conseguiu concluir: ${error?.message || 'erro de OCR'}. Nenhum dado vazio será inventado.`,
              });
            }
          }

          for (const parsed of parsedPeople) {
            const normalizedName = normalizeText(parsed.name);
            const resolved = resolveEmployee(company.id, parsed);
            const employee = resolved.employee;

            if (employee?.cpf && employee?.dataNascimento) {
              completeCount += 1;
              continue;
            }

            const cpfAction = employee ? actionForCpf(employee.cpf, parsed.cpf) : 'missing-source';
            const birthAction = employee ? actionForBirth(employee.dataNascimento, parsed.birthDate) : 'missing-source';

            nextRows.push({
              key: `${file.name}-${company.id}-${normalizedName}-${nextRows.length}`,
              fileName: file.name,
              company,
              parsed,
              employee,
              cpfAction,
              birthAction,
              matchStatus: resolved.matchStatus,
              message: resolved.matchStatus === 'unmatched'
                ? 'Funcionário não localizado no cadastro desta empresa.'
                : resolved.matchStatus === 'ambiguous'
                  ? 'Mais de um cadastro pode corresponder a este funcionário.'
                  : undefined,
            });
          }
        } catch (error: any) {
          nextIssues.push({ fileName: file.name, message: error?.message || 'Falha ao processar o PDF.' });
        }
      }
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
    }

    setRows(nextRows);
    setIssues(nextIssues);
    setSkippedComplete(completeCount);
    setProcessing(false);
    setProgress('');

    const prontos = nextRows.filter((row) => row.matchStatus === 'matched' && (row.cpfAction === 'fill' || row.birthAction === 'fill')).length;

    if (prontos) {
      toast.success(`${prontos} cadastro(s) com dados prontos para preencher.`);
    } else if (nextRows.length || completeCount) {
      toast.success('Leitura concluída. Confira os dados encontrados.');
    }
  };

  const saveMissingFields = async () => {
    if (!pendingRows.length || saving) return;
    setSaving(true);
    let updated = 0;
    const failures: string[] = [];

    for (const row of pendingRows) {
      if (!row.employee) continue;
      const payload: Record<string, unknown> = {};

      if (!row.employee.cpf && row.cpfAction === 'fill' && row.parsed.cpf) {
        payload.cpf = row.parsed.cpf;
        payload.cpf_pendente_acesso = false;
      }
      if (!row.employee.dataNascimento && row.birthAction === 'fill' && row.parsed.birthDate) {
        payload.data_nascimento = row.parsed.birthDate;
      }
      if (!Object.keys(payload).length) continue;

      const { error } = await (supabase as any).from('funcionarios').update(payload).eq('id', row.employee.id);
      if (error) failures.push(`${row.employee.name}: ${error.message}`);
      else updated += 1;
    }

    setSaving(false);
    await onSaved();
    if (updated) toast.success(`${updated} cadastro(s) atualizado(s). Quem já possuía os dados foi desconsiderado.`);
    if (failures.length) toast.error(`${failures.length} cadastro(s) não puderam ser atualizados.`);
    if (!failures.length) reset();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value && !saving) reset(); }}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5" /> Atualização em massa de cadastros</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-semibold">Upload de relatório de funcionários</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Envie um ou vários PDFs. A plataforma identifica empresa e funcionário, lê CPF e data de nascimento diretamente da imagem do relatório e alimenta o cadastro individual somente onde o campo estiver vazio. Funcionários que já possuem CPF e nascimento são desconsiderados automaticamente.
            </p>
            {selectedCompany && <p className="mt-2 text-xs font-medium">Empresa selecionada: {selectedCompany.name} — {selectedCompany.cnpj}</p>}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(event) => void processFiles(Array.from(event.target.files || []))}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={processing || saving}>
              <Upload className="mr-2 h-4 w-4" /> {processing ? 'Lendo PDFs...' : 'Selecionar PDF(s)'}
            </Button>
            {(rows.length > 0 || issues.length > 0 || skippedComplete > 0) && (
              <Button type="button" variant="outline" onClick={reset} disabled={processing || saving}>Limpar análise</Button>
            )}
          </div>

          {processing && (
            <div className="flex items-center gap-2 rounded-lg border p-4 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{progress || 'Processando os relatórios em massa...'}</span>
            </div>
          )}

          {fileNames.length > 0 && !processing && (
            <div className="flex flex-wrap gap-2">
              {fileNames.map((name) => <Badge key={name} variant="outline"><FileText className="mr-1 h-3 w-3" /> {name}</Badge>)}
            </div>
          )}

          {!processing && (rows.length > 0 || skippedComplete > 0) && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Lidos</p><p className="text-xl font-bold">{totalRead}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Já completos / desconsiderados</p><p className="text-xl font-bold text-success">{skippedComplete}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Prontos para atualizar</p><p className="text-xl font-bold text-primary">{pendingRows.length}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Pendências</p><p className="text-xl font-bold text-destructive">{problemRows.length}</p></div>
              </div>

              {rows.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[950px] text-left text-xs">
                    <thead className="bg-muted/70">
                      <tr>
                        <th className="p-3">Funcionário</th>
                        <th className="p-3">Empresa</th>
                        <th className="p-3">CPF atual</th>
                        <th className="p-3">CPF no PDF</th>
                        <th className="p-3">Nascimento atual</th>
                        <th className="p-3">Nascimento no PDF</th>
                        <th className="p-3">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className="border-t align-top">
                          <td className="p-3">
                            <p className="font-semibold">{row.employee?.name || row.parsed.name}</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">{row.fileName}</p>
                            {row.message && <p className="mt-1 text-[10px] text-destructive">{row.message}</p>}
                          </td>
                          <td className="p-3">{row.company?.name || '—'}</td>
                          <td className="p-3">{row.employee?.cpf || 'Vazio'}</td>
                          <td className="p-3">
                            <div>{row.parsed.cpf || 'Não encontrado'}</div>
                            {row.employee && <Badge variant="outline" className={`mt-1 text-[9px] ${actionClass(row.cpfAction)}`}>{actionLabel(row.cpfAction)}</Badge>}
                          </td>
                          <td className="p-3">{row.employee?.dataNascimento ? formatDateBR(normalizeDate(row.employee.dataNascimento)) : 'Vazio'}</td>
                          <td className="p-3">
                            <div>{row.parsed.birthDate ? formatDateBR(row.parsed.birthDate) : 'Não encontrado'}</div>
                            {row.employee && <Badge variant="outline" className={`mt-1 text-[9px] ${actionClass(row.birthAction)}`}>{actionLabel(row.birthAction)}</Badge>}
                          </td>
                          <td className="p-3">
                            {row.matchStatus !== 'matched' ? (
                              <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Não atualizar</span>
                            ) : row.cpfAction === 'fill' || row.birthAction === 'fill' ? (
                              <span className="inline-flex items-center gap-1 text-primary"><Upload className="h-3.5 w-3.5" /> Alimentar cadastro</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Dado não lido</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" /> Todos os funcionários encontrados já possuem CPF e data de nascimento. Nenhuma alteração necessária.
                </div>
              )}
            </>
          )}

          {issues.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="mb-2 text-sm font-semibold text-destructive">Pendências da leitura</p>
              {issues.map((issue, index) => <p key={`${issue.fileName}-${index}`} className="text-xs"><b>{issue.fileName}:</b> {issue.message}</p>)}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Fechar</Button>
          <Button onClick={() => void saveMissingFields()} disabled={!pendingRows.length || processing || saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Atualizando...</> : <>Alimentar {pendingRows.length} cadastro(s)</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkEmployeeDataImporter;
