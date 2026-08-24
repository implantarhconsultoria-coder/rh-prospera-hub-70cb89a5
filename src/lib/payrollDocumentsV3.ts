import {
  extractLikelyAmount,
  extractPayrollDocumentMetadata,
  extractPdfPages,
  parsePayrollPdf as parsePayrollPdfV2,
  type ParsedPayrollPdf,
  type PayrollEmployeeMatch,
} from './payrollDocumentsV2';

export * from './payrollDocumentsV2';

type StructuredPage = Awaited<ReturnType<typeof extractPdfPages>>[number];

type BatchGroup = {
  employee: PayrollEmployeeMatch;
  pageNumbers: number[];
  lines: string[];
  usedOcr: boolean;
};

const stripAccents = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const normalize = (value: unknown) => stripAccents(value)
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const moneyNumber = (raw: string) => {
  const cleaned = String(raw || '')
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
};

const batchNetAmount = (text: string) => {
  const values: number[] = [];
  const pattern = /\bL[IÍ]QUIDO\s*:\s*(?:R\$\s*)?([\d.]+,\d{2})/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const value = moneyNumber(match[1]);
    if (value != null) values.push(value);
  }
  return values.length ? values[values.length - 1] : extractLikelyAmount(text);
};

const employeeInLine = (line: string, employees: PayrollEmployeeMatch[]) => {
  const compact = normalize(line);
  const matches = employees
    .filter(employee => {
      const name = normalize(employee.name);
      return name.length >= 7 && compact.includes(name);
    })
    .sort((a, b) => normalize(b.name).length - normalize(a.name).length);
  return matches[0] || null;
};

const isEmployeeHeaderWithoutName = (line: string, employees: PayrollEmployeeMatch[]) => {
  const compact = normalize(line);
  if (employeeInLine(line, employees)) return false;
  return compact.includes('COD') && compact.includes('NOME') && (compact.includes('FUNCAO') || compact.includes('DEP IR'));
};

const isRepeatedPageHeader = (line: string) => {
  const compact = normalize(line);
  return compact.includes('FOLHA DE PAGAMENTO')
    || compact.includes('CNPJ CEI')
    || compact.includes('INSCRICAO')
    || compact.includes('PERIODO DE')
    || compact.includes('ENDERECO')
    || compact.includes('RAZAO SOCIAL')
    || /^PAG\s*\d+/.test(compact);
};

const employeeIdsOnPage = (page: StructuredPage, employees: PayrollEmployeeMatch[]) => {
  const ids = new Set<string>();
  page.lines.forEach(line => {
    const employee = employeeInLine(line, employees);
    if (employee) ids.add(employee.id);
  });
  return ids;
};

const isMultiEmployeePageDocument = (pages: StructuredPage[], employees: PayrollEmployeeMatch[]) =>
  pages.some(page => employeeIdsOnPage(page, employees).size >= 2);

const latin1 = (value: string) => Array.from(value)
  .map(char => char.charCodeAt(0) <= 255 ? char : '?')
  .join('');

const pdfEscape = (value: string) => latin1(value)
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

const binaryBytes = (value: string) => {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
};

const wrapText = (value: string, max = 94) => {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const output: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= max) current += ` ${word}`;
    else {
      output.push(current);
      current = word;
    }
  }
  if (current) output.push(current);
  return output;
};

const buildIndividualBatchPdf = ({
  sourceName,
  employee,
  pageNumbers,
  lines,
  companyName,
  cnpj,
  competencia,
}: {
  sourceName: string;
  employee: PayrollEmployeeMatch;
  pageNumbers: number[];
  lines: string[];
  companyName: string | null;
  cnpj: string | null;
  competencia: string | null;
}) => {
  const body = lines.flatMap(line => wrapText(line));
  const chunks: string[][] = [];
  for (let i = 0; i < body.length; i += 40) chunks.push(body.slice(i, i + 40));
  if (!chunks.length) chunks.push(['Conteúdo individual identificado no documento de origem.']);

  const objects: string[] = [];
  const pageObjectStart = 4;
  const pageRefs = chunks.map((_, index) => pageObjectStart + index * 2);

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  chunks.forEach((chunk, index) => {
    const pageObject = pageObjectStart + index * 2;
    const contentObject = pageObject + 1;
    const heading = index === 0
      ? 'DOCUMENTO INDIVIDUAL — FOLHA DE PAGAMENTO / ADIANTAMENTO'
      : 'DOCUMENTO INDIVIDUAL — CONTINUAÇÃO';
    const visibleLines = [
      heading,
      companyName ? `Empresa: ${companyName}` : '',
      cnpj ? `CNPJ: ${cnpj}` : '',
      `Funcionário: ${employee.name}`,
      employee.cargo ? `Função: ${employee.cargo}` : '',
      competencia ? `Competência: ${competencia}` : '',
      `Arquivo de origem: ${sourceName}`,
      `Página(s) de origem: ${pageNumbers.join(', ')}`,
      '',
      ...chunk,
      '',
      'Documento individual extraído automaticamente do PDF original recebido pelo RH.',
      'O arquivo-fonte permanece vinculado por SHA-256 no registro administrativo da plataforma.',
    ];

    const commands = ['BT', '/F1 10 Tf', '42 800 Td'];
    visibleLines.forEach((line, lineIndex) => {
      if (lineIndex === 0) commands.push('/F1 13 Tf');
      else if (lineIndex === 1) commands.push('/F1 10 Tf');
      commands.push(`(${pdfEscape(line)}) Tj`, lineIndex === 0 ? '0 -24 Td' : '0 -14 Td');
    });
    commands.push('ET');
    const stream = latin1(commands.join('\n'));
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let pdf = '%PDF-1.4\n%TOPAC\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return binaryBytes(latin1(pdf));
};

export const splitMultiEmployeePayrollPages = ({
  pages,
  employees,
  sourceName,
}: {
  pages: StructuredPage[];
  employees: PayrollEmployeeMatch[];
  sourceName: string;
}): ParsedPayrollPdf[] => {
  const groups = new Map<string, BatchGroup>();
  let carryEmployee: PayrollEmployeeMatch | null = null;

  const append = (employee: PayrollEmployeeMatch, page: StructuredPage, lines: string[]) => {
    const clean = lines
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter(line => !isRepeatedPageHeader(line));
    if (!clean.length) return;
    const group = groups.get(employee.id) || { employee, pageNumbers: [], lines: [], usedOcr: false };
    if (!group.pageNumbers.includes(page.page)) group.pageNumbers.push(page.page);
    group.lines.push(...clean);
    group.usedOcr = group.usedOcr || page.usedOcr;
    groups.set(employee.id, group);
  };

  for (const page of pages) {
    const pageCompact = normalize(page.text);
    const summaryPage = pageCompact.includes('RESUMO')
      && (pageCompact.includes('TOTAL DE FUNCIONARIOS') || pageCompact.includes('LANCAMENTOS'));
    const markers: Array<{ index: number; employee: PayrollEmployeeMatch }> = [];

    page.lines.forEach((line, index) => {
      const employee = employeeInLine(line, employees);
      if (!employee) return;
      let start = index;
      if (index > 0 && isEmployeeHeaderWithoutName(page.lines[index - 1], employees)) start = index - 1;
      if (!markers.some(marker => marker.employee.id === employee.id)) markers.push({ index: start, employee });
    });
    markers.sort((a, b) => a.index - b.index);

    if (!markers.length) {
      if (carryEmployee && !summaryPage) append(carryEmployee, page, page.lines);
      if (summaryPage) carryEmployee = null;
      continue;
    }

    if (carryEmployee && markers[0].index > 0) {
      append(carryEmployee, page, page.lines.slice(0, markers[0].index));
    }

    markers.forEach((marker, markerIndex) => {
      const next = markers[markerIndex + 1];
      append(marker.employee, page, page.lines.slice(marker.index, next ? next.index : page.lines.length));
    });

    carryEmployee = markers[markers.length - 1].employee;
  }

  const sharedMetadata = pages.length
    ? extractPayrollDocumentMetadata(pages[0].text, pages[0].lines)
    : null;

  const outputs: ParsedPayrollPdf[] = [];
  for (const group of groups.values()) {
    const text = group.lines.join('\n');
    const amount = batchNetAmount(text);
    const codeMatch = text.match(/\bC[oó]d\s*:\s*(\d{1,6})/i);
    const isAdvance = normalize(text).includes('ADIANTAMENTO CREDITO') || normalize(pages.map(page => page.text).join(' ')).includes('ADIANTAMENTO');
    const bytes = buildIndividualBatchPdf({
      sourceName,
      employee: group.employee,
      pageNumbers: group.pageNumbers,
      lines: group.lines,
      companyName: sharedMetadata?.companyNameDetected || null,
      cnpj: sharedMetadata?.cnpjDetected || null,
      competencia: sharedMetadata?.competenciaDetected || null,
    });

    outputs.push({
      bytes,
      filename: `${sourceName.replace(/\.pdf$/i, '')}_${normalize(group.employee.name).replace(/\s+/g, '_')}.pdf`,
      text,
      employeeId: group.employee.id,
      employeeName: group.employee.name,
      matchMethod: 'NOME_UNICO',
      confidence: 96,
      cpfDetected: null,
      amountDetected: amount,
      pageNumbers: group.pageNumbers,
      documentType: isAdvance ? 'SALARY_ADVANCE' : 'PAYSLIP',
      documentSubtype: isAdvance ? 'ADIANTAMENTO' : null,
      employeeCodeDetected: codeMatch?.[1] || null,
      jobTitleDetected: group.employee.cargo || null,
      cboDetected: null,
      companyNameDetected: sharedMetadata?.companyNameDetected || null,
      cnpjDetected: sharedMetadata?.cnpjDetected || null,
      competenciaDetected: sharedMetadata?.competenciaDetected || null,
      competenciaLabelDetected: sharedMetadata?.competenciaLabelDetected || null,
      duplicateCopiesDetected: 1,
      usedOcr: group.usedOcr,
    });
  }

  return outputs.sort((a, b) => String(a.employeeName || '').localeCompare(String(b.employeeName || ''), 'pt-BR'));
};

export const parsePayrollPdf = async (args: {
  file: File;
  employees: PayrollEmployeeMatch[];
  kind: 'HOLERITE' | 'COMPROVANTE';
  netAmountByEmployee?: Map<string, number>;
}): Promise<ParsedPayrollPdf[]> => {
  if (args.kind !== 'HOLERITE') return parsePayrollPdfV2(args);

  // Faz apenas a leitura estrutural primeiro. Se houver 2+ funcionários na mesma página,
  // o V2 não pode rasterizar a página inteira para uma pessoa, pois isso expõe terceiros
  // e é justamente o caminho que falhava no Safari/iPhone para a folha consolidada.
  const probeBytes = new Uint8Array(await args.file.arrayBuffer());
  const pages = await extractPdfPages(probeBytes);
  if (!isMultiEmployeePageDocument(pages, args.employees)) return parsePayrollPdfV2(args);

  const parsed = splitMultiEmployeePayrollPages({
    pages,
    employees: args.employees,
    sourceName: args.file.name,
  });

  const expectedIds = new Set<string>();
  pages.forEach(page => employeeIdsOnPage(page, args.employees).forEach(id => expectedIds.add(id)));
  const parsedIds = new Set(parsed.map(item => item.employeeId).filter(Boolean));
  if (parsed.length < 2 || parsedIds.size !== expectedIds.size) {
    throw new Error(`Folha em lote reconhecida, mas a separação ficou incompleta (${parsedIds.size}/${expectedIds.size}). Nenhum documento foi enviado. Atualize a página e tente novamente.`);
  }

  return parsed;
};