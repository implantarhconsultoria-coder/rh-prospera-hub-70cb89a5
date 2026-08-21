import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileCheck2, FileText, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { ingestPaymentHoleritesFromConsolidator } from '@/lib/payrollAutoIngest';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type ReportType = 'adiantamento' | 'pagamento';

type PdfLine = {
  text: string;
  y: number;
};

type PayrollRecord = {
  company: string;
  employee: string;
  role: string;
  amount: number;
  competence: string;
  source: string;
  page: number;
};

const MONTHS: Record<string, string> = {
  janeiro: 'Janeiro',
  fevereiro: 'Fevereiro',
  marco: 'Março',
  março: 'Março',
  abril: 'Abril',
  maio: 'Maio',
  junho: 'Junho',
  julho: 'Julho',
  agosto: 'Agosto',
  setembro: 'Setembro',
  outubro: 'Outubro',
  novembro: 'Novembro',
  dezembro: 'Dezembro',
};

const moneyRegex = /\b\d{1,3}(?:\.\d{3})*,\d{2}\b|\b\d+,\d{2}\b/g;

const normalize = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeUpper = (value: string) => normalize(value).toUpperCase();

const parseMoney = (value: string) => {
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const extractMoneyValues = (value: string) => (value.match(moneyRegex) || []).map(parseMoney);

const joinLine = (items: Array<{ str?: string; transform?: number[] }>) =>
  items
    .filter(item => String(item.str || '').trim())
    .sort((a, b) => Number(a.transform?.[4] || 0) - Number(b.transform?.[4] || 0))
    .map(item => String(item.str || '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractLines = async (page: any): Promise<PdfLine[]> => {
  const content = await page.getTextContent();
  const raw = (content.items as any[])
    .filter(item => 'str' in item && String(item.str || '').trim())
    .map(item => ({ item, y: Number(item.transform?.[5] || 0) }));

  const groups: Array<{ y: number; items: any[] }> = [];
  for (const entry of raw) {
    const found = groups.find(group => Math.abs(group.y - entry.y) <= 2.2);
    if (found) found.items.push(entry.item);
    else groups.push({ y: entry.y, items: [entry.item] });
  }

  return groups
    .sort((a, b) => b.y - a.y)
    .map(group => ({ y: group.y, text: joinLine(group.items) }))
    .filter(line => line.text);
};

const detectCompany = (text: string) => {
  const upper = normalizeUpper(text);

  if (upper.includes('14.464.586/0001-50') || upper.includes('ALQUI OBRAS')) {
    return 'ALQUI OBRAS LTDA';
  }
  if (upper.includes('21.967.711/0001-00') || upper.includes('LMT LOCACAO')) {
    return 'LMT LOCAÇÃO MANUTENÇÃO E TRANSPORTE';
  }
  if (upper.includes('07.291.648/0003-75')) {
    return 'TOPAC COMÉRCIO DE EQUIP. INDUSTRIAIS LTDA — FILIAL GOIÁS';
  }
  if (upper.includes('07.291.648/0002-94')) {
    return 'TOPAC COMÉRCIO DE EQUIP. INDUSTRIAIS LTDA — FILIAL PRAIA GRANDE';
  }
  if (upper.includes('07.291.648/0001-03')) {
    return 'TOPAC COMÉRCIO DE EQUIP. INDUSTRIAIS LTDA — MATRIZ';
  }
  if (upper.includes('TOPAC COMERCIO DE EQUIP')) {
    return 'TOPAC COMÉRCIO DE EQUIP. INDUSTRIAIS LTDA';
  }
  return 'EMPRESA NÃO IDENTIFICADA';
};

const detectCompetence = (text: string) => {
  const normalized = normalize(text).toLowerCase();
  const match = normalized.match(/(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de|\/|-)?\s*(20\d{2})/i);
  if (!match) return '';
  return `${MONTHS[match[1].toLowerCase()] || match[1]}/${match[2]}`;
};

const isNoiseLine = (value: string) => {
  const upper = normalizeUpper(value);
  return !upper || [
    'CODIGO', 'DESCRICAO', 'REFERENCIA', 'VENCIMENTOS', 'DESCONTOS', 'RECIBO DE PAGAMENTO',
    'SALARIO BASE', 'TOTAL VENCIMENTOS', 'TOTAL DESCONTOS', 'TOTAL LIQUIDO', 'VALOR LIQUIDO',
    'ASSINATURA', 'DATA', 'CNPJ', 'CPF', 'CTPS', 'PIS', 'ADMISSAO', 'FOLHA', 'MENSALISTA',
    'ADIANTAMENTO', 'ARREDONDAMENTO', 'BASE CALCULO', 'FGTS', 'IRRF', 'INSS', 'DECLARO TER RECEBIDO',
  ].some(word => upper.includes(word));
};

const cleanRole = (value: string) => {
  let role = normalize(value)
    .replace(/\bADMISS[AÃ]O\s*:?.*$/i, '')
    .replace(/\b(PIS|CTPS|CPF)\s*:?.*$/i, '')
    .replace(/\b\d{5,6}\b.*$/, '')
    .replace(/^\d+\s+/, '')
    .trim();
  if (!role || isNoiseLine(role)) return '';
  if (!/[A-Za-zÀ-ÿ]{3}/.test(role)) return '';
  return role.toUpperCase();
};

const extractEmployeeAndRole = (lines: PdfLine[]) => {
  const candidates = lines.map(line => line.text);

  for (let i = 0; i < candidates.length; i += 1) {
    const line = normalize(candidates[i]);
    const upper = normalizeUpper(line);
    if (isNoiseLine(line)) continue;

    const nameMatch =
      line.match(/^\s*\d{1,4}\s+([A-ZÀ-Ý][A-ZÀ-Ý' .-]{5,}?)(?=\s+\d{5,6}\b|\s*$)/) ||
      line.match(/^\s*\d{1,4}\s+([A-ZÀ-Ý][A-ZÀ-Ý' .-]{5,}?)(?=\s+\d{1,3}(?:\s+\d{1,3}){0,4}\s*$)/);
    if (!nameMatch) continue;

    const employee = nameMatch[1].replace(/\s+/g, ' ').trim();
    if (employee.split(' ').length < 2) continue;
    if (upper.includes('TOTAL') || upper.includes('SALARIO')) continue;

    const sameLineTail = line.slice((nameMatch.index || 0) + nameMatch[0].length);
    const roleCandidates = [sameLineTail, candidates[i + 1] || '', candidates[i + 2] || ''];
    const role = roleCandidates.map(cleanRole).find(Boolean) || '-';
    return { employee, role };
  }

  // Formato Goiás: alguns geradores posicionam nome e CBO em blocos separados.
  for (let i = 0; i < candidates.length; i += 1) {
    const line = normalize(candidates[i]);
    const upper = normalizeUpper(line);
    if (isNoiseLine(line)) continue;
    if (!/^[A-ZÀ-Ý][A-ZÀ-Ý' .-]{7,}$/.test(line)) continue;
    if (line.split(' ').length < 2) continue;
    if (upper.includes('TOPAC') || upper.includes('LMT') || upper.includes('ALQUI')) continue;

    const nearby = candidates.slice(Math.max(0, i - 2), i + 4).join(' ');
    if (!/\bCBO\b|\b\d{6}\b/i.test(nearby)) continue;
    const role = [candidates[i + 1] || '', candidates[i + 2] || '', candidates[i - 1] || '']
      .map(cleanRole)
      .find(Boolean) || '-';
    return { employee: line, role };
  }

  return { employee: '', role: '-' };
};

const amountFromKeyword = (lines: PdfLine[], keywords: RegExp[]) => {
  for (let i = 0; i < lines.length; i += 1) {
    if (!keywords.some(regex => regex.test(normalizeUpper(lines[i].text)))) continue;

    const currentValues = extractMoneyValues(lines[i].text);
    if (currentValues.length) {
      // A referência normalmente é 40,00; o valor monetário real fica por último.
      return currentValues[currentValues.length - 1];
    }

    // Dependendo do emissor, o valor pode estar visualmente antes ou depois do rótulo.
    for (const step of [-1, 1, -2, 2]) {
      const values = extractMoneyValues(lines[i + step]?.text || '');
      if (values.length) return values[values.length - 1];
    }
  }
  return 0;
};

const extractAmount = (lines: PdfLine[], type: ReportType) => {
  if (type === 'adiantamento') {
    return amountFromKeyword(lines, [
      /ADIANTAMENTO\s+CREDITO/,
      /ADIANTAMENTO\s+SALARIAL/,
    ]);
  }

  return amountFromKeyword(lines, [
    /TOTAL\s+LIQUIDO/,
    /VALOR\s+LIQUIDO/,
    /LIQUIDO\s*--?>/,
  ]);
};

const parseFile = async (file: File, type: ReportType): Promise<{ records: PayrollRecord[]; warnings: string[] }> => {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const records: PayrollRecord[] = [];
  const warnings: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const lines = await extractLines(page);
    const pageText = lines.map(line => line.text).join(' ');
    const company = detectCompany(pageText);
    const competence = detectCompetence(pageText);
    const { employee, role } = extractEmployeeAndRole(lines);
    const amount = extractAmount(lines, type);

    if (!employee || !amount) {
      warnings.push(`${file.name} — pág. ${pageNumber}: ${!employee ? 'funcionário não identificado' : 'valor não identificado'}.`);
      continue;
    }

    records.push({ company, employee, role, amount, competence, source: file.name, page: pageNumber });
  }

  await pdf.destroy();
  return { records, warnings };
};

const deduplicate = (records: PayrollRecord[]) => {
  const seen = new Set<string>();
  return records.filter(record => {
    const key = `${normalizeUpper(record.company)}|${normalizeUpper(record.employee)}|${record.amount.toFixed(2)}|${record.competence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const safeFilePart = (value: string) => normalize(value).replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '_').replace(/^_+|_+$/g, '');

const generatePdf = (records: PayrollRecord[], type: ReportType) => {
  const grouped = records.reduce<Record<string, PayrollRecord[]>>((acc, record) => {
    (acc[record.company] ||= []).push(record);
    return acc;
  }, {});

  const companyNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const title = type === 'adiantamento' ? 'RELATÓRIO DE ADIANTAMENTO' : 'RELATÓRIO DE PAGAMENTO';
  const columnLabel = type === 'adiantamento' ? 'ADIANTAMENTO' : 'PAGAMENTO';

  companyNames.forEach((company, companyIndex) => {
    if (companyIndex > 0) doc.addPage();
    const rows = grouped[company].sort((a, b) => a.employee.localeCompare(b.employee, 'pt-BR'));
    const competence = rows.find(row => row.competence)?.competence || '';

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('TOPAC RH PRO', 14, 11);
    doc.setFontSize(10);
    doc.text(title, 14, 19);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.text(company, 14, 38, { maxWidth: 182 });
    if (competence) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`Competência: ${competence}`, 14, 45);
    }

    let y = competence ? 52 : 47;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 9, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, y, 182, 9);
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('NOME COMPLETO', 17, y + 5.8);
    doc.text('FUNÇÃO', 93, y + 5.8);
    doc.text(columnLabel, 190, y + 5.8, { align: 'right' });
    y += 9;

    doc.setFont('helvetica', 'normal');
    rows.forEach((row, index) => {
      const rowHeight = 11;
      if (y + rowHeight > 282) {
        doc.addPage();
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${company} — continuação`, 14, 16, { maxWidth: 182 });
        y = 23;
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y, 182, rowHeight, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(14, y + rowHeight, 196, y + rowHeight);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(8.3);
      doc.setFont('helvetica', 'bold');
      doc.text(row.employee, 17, y + 6.8, { maxWidth: 72 });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(row.role || '-', 93, y + 6.8, { maxWidth: 64 });
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(formatMoney(row.amount), 190, y + 6.8, { align: 'right' });
      y += rowHeight;
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Gerado pela Plataforma TOPAC RH PRO • ${rows.length} funcionário(s)`, 14, 291);
  });

  const competence = records.find(record => record.competence)?.competence || new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }).replace('/', '-');
  doc.save(`Relatorio_${type === 'adiantamento' ? 'Adiantamento' : 'Pagamento'}_${safeFilePart(competence)}.pdf`);
};

const PayrollPdfConsolidator: React.FC = () => {
  const { companies, employees } = useApp();
  const [type, setType] = useState<ReportType>('adiantamento');
  const [files, setFiles] = useState<File[]>([]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const groupedCount = useMemo(() => new Set(records.map(record => record.company)).size, [records]);

  const chooseFiles = (selected: FileList | null) => {
    const next = Array.from(selected || []).filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (!next.length) return;
    setFiles(prev => {
      const known = new Set(prev.map(file => `${file.name}:${file.size}:${file.lastModified}`));
      return [...prev, ...next.filter(file => !known.has(`${file.name}:${file.size}:${file.lastModified}`))];
    });
    setRecords([]);
    setWarnings([]);
  };

  const process = async () => {
    if (!files.length) {
      toast.error('Selecione pelo menos um PDF.');
      return;
    }

    setProcessing(true);
    try {
      const allRecords: PayrollRecord[] = [];
      const allWarnings: string[] = [];
      for (const file of files) {
        const result = await parseFile(file, type);
        allRecords.push(...result.records);
        allWarnings.push(...result.warnings);
      }

      const clean = deduplicate(allRecords);
      setRecords(clean);
      setWarnings(allWarnings);

      if (!clean.length) {
        toast.error(type === 'pagamento'
          ? 'Não consegui identificar o valor líquido dos recibos. Verifique se os PDFs são recibos de pagamento.'
          : 'Não consegui identificar os adiantamentos nos PDFs selecionados.');
        return;
      }

      generatePdf(clean, type);
      toast.success(`Relatório gerado: ${clean.length} funcionário(s), ${new Set(clean.map(record => record.company)).size} empresa(s).`);

      if (type === 'pagamento') {
        const ingest = await ingestPaymentHoleritesFromConsolidator({
          files,
          records: allRecords,
          companies,
          employees,
        });

        if (ingest.created > 0) {
          toast.success(`${ingest.created} holerite(s) já lançado(s) em Pagamento. Não precisa subir de novo.`);
        } else if (ingest.duplicates > 0 && !ingest.skippedFiles) {
          toast.info('Esses holerites já estavam lançados em Pagamento. Nenhum duplicado foi criado.');
        }

        if (ingest.pending > 0) {
          toast.warning(`${ingest.pending} holerite(s) ficaram aguardando vínculo manual do funcionário em Pagamento.`);
        }
        if (ingest.advanceFiles > 0) {
          toast.warning('Recibo de ADIANTAMENTO detectado: ele não foi enviado para assinatura de holerite.');
        }
        if (ingest.errors.length > 0) {
          console.warn('Conferência do lançamento automático em Pagamento:', ingest.errors);
          toast.warning(`${ingest.errors.length} arquivo(s) precisam de conferência antes de entrar em Pagamento.`);
        }
      }
    } catch (error) {
      console.error('Erro ao consolidar PDFs da folha:', error);
      toast.error('Falha ao ler os PDFs. Verifique os arquivos e tente novamente.');
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setRecords([]);
    setWarnings([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border bg-muted/25 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Consolidar PDFs de Adiantamento / Pagamento</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Suba os recibos em PDF. A plataforma identifica empresa, funcionário, função e valor e gera um PDF consolidado, com uma empresa por folha.</p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => { setType('adiantamento'); setRecords([]); setWarnings([]); }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${type === 'adiantamento' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Adiantamento
          </button>
          <button
            type="button"
            onClick={() => { setType('pagamento'); setRecords([]); setWarnings([]); }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${type === 'pagamento' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Pagamento
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {type === 'pagamento' && (
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200">
            <strong>Pagamento integrado:</strong> ao gerar o relatório, os holerites de TOPAC Matriz, ALQUI e LMT também são lançados automaticamente no módulo Pagamento para conferência e assinatura. Não precisa subir o mesmo PDF duas vezes.
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={event => chooseFiles(event.target.files)}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/15 px-4 py-5 text-center transition hover:border-primary/50 hover:bg-primary/5"
        >
          <UploadCloud className="h-7 w-7 text-primary" />
          <span className="text-sm font-semibold text-foreground">Selecionar PDFs</span>
          <span className="text-xs text-muted-foreground">Pode selecionar vários arquivos e empresas de uma vez.</span>
        </button>

        {files.length > 0 && (
          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold text-foreground">{files.length} arquivo(s) selecionado(s)</span>
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline">
                <Trash2 className="h-3.5 w-3.5" /> Limpar
              </button>
            </div>
            <div className="max-h-36 overflow-y-auto divide-y divide-border">
              {files.map(file => (
                <div key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <FileCheck2 className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-foreground">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {records.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <FileCheck2 className="h-4 w-4" />
            <strong>{records.length} funcionário(s)</strong>
            <span>•</span>
            <strong>{groupedCount} empresa(s)</strong>
            <span>identificados no último processamento.</span>
          </div>
        )}

        {warnings.length > 0 && (
          <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <summary className="cursor-pointer font-semibold">{warnings.length} página(s) precisam de conferência</summary>
            <div className="mt-2 max-h-28 overflow-y-auto space-y-1">
              {warnings.map((warning, index) => <div key={`${warning}-${index}`}>{warning}</div>)}
            </div>
          </details>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {records.length > 0 && (
            <Button type="button" variant="outline" onClick={() => generatePdf(records, type)}>
              <Download className="mr-2 h-4 w-4" /> Gerar PDF novamente
            </Button>
          )}
          <Button type="button" onClick={process} disabled={processing || files.length === 0}>
            {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            {processing ? 'Lendo PDFs...' : type === 'pagamento' ? 'Gerar relatório de pagamento + lançar holerites' : 'Gerar relatório de adiantamento'}
          </Button>
        </div>
      </div>
    </section>
  );
};

const PayrollPdfConsolidatorMount: React.FC = () => {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let currentHost: HTMLElement | null = null;

    const syncHost = () => {
      const heading = Array.from(document.querySelectorAll('h1')).find(node => normalizeUpper(node.textContent || '') === 'FECHAMENTO');
      if (!heading) {
        if (currentHost && !currentHost.isConnected) currentHost = null;
        setHost(null);
        return;
      }

      const header = heading.parentElement;
      if (!header) return;

      let mountNode = header.parentElement?.querySelector<HTMLElement>('[data-payroll-pdf-consolidator="true"]') || null;
      if (!mountNode) {
        mountNode = document.createElement('div');
        mountNode.dataset.payrollPdfConsolidator = 'true';
        header.insertAdjacentElement('afterend', mountNode);
      }
      currentHost = mountNode;
      setHost(previous => previous === mountNode ? previous : mountNode);
    };

    syncHost();
    const root = document.getElementById('root') || document.body;
    const observer = new MutationObserver(syncHost);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener('popstate', syncHost);

    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', syncHost);
      if (currentHost?.isConnected) currentHost.remove();
    };
  }, []);

  return host ? createPortal(<PayrollPdfConsolidator />, host) : null;
};

export default PayrollPdfConsolidatorMount;
