import { jsPDF } from 'jspdf';

export type FuelReportRecord = {
  id: string;
  funcionario_id: string | null;
  funcionario_nome: string;
  empresa_id: string | null;
  empresa_nome: string;
  empresa: string | null;
  filial: string | null;
  placa: string | null;
  data: string;
  hora: string | null;
  combustivel: string | null;
  valor: number;
  litros: number;
  valor_por_litro: number | null;
  km_atual: number | null;
  km_rodado: number | null;
  posto_nome: string | null;
  posto_cnpj: string | null;
  posto_endereco: string | null;
  posto_telefone: string | null;
  foto_bomba_url: string | null;
  foto_painel_url: string | null;
  recibo_pdf_url: string | null;
  observacao: string | null;
  status: string | null;
  created_at: string | null;
};

export type RegisteredCompany = {
  id: string;
  nome: string;
  razao_social?: string | null;
  cnpj?: string | null;
  status?: string | null;
};

export type ConsolidatedEmployee = {
  funcionarioId: string;
  nome: string;
  quantidade: number;
  valorTotal: number;
};

export type ConsolidatedCompany = {
  empresaId: string;
  nome: string;
  razaoSocial: string;
  cnpj: string;
  funcionarios: ConsolidatedEmployee[];
  quantidadeTotal: number;
  valorTotal: number;
};

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

export const formatMoney = (value: number) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

export const formatNumber = (value: number, digits = 2) => Number(value || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

export const formatDateBr = (value: string) => {
  const [year, month, day] = String(value || '').slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value || '');
};

export const resolveFuelPeriod = (input: {
  mode: 'month' | 'year' | 'range';
  month: string;
  year: string;
  startDate: string;
  endDate: string;
}) => {
  if (input.mode === 'year') {
    const year = /^\d{4}$/.test(input.year) ? input.year : new Date().getFullYear().toString();
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31`, label: `Ano ${year}` };
  }
  if (input.mode === 'range') {
    return {
      startDate: input.startDate,
      endDate: input.endDate,
      label: `${formatDateBr(input.startDate)} a ${formatDateBr(input.endDate)}`,
    };
  }
  const month = /^\d{4}-\d{2}$/.test(input.month) ? input.month : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
    label: new Date(year, monthNumber - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  };
};

const findCompany = (record: FuelReportRecord, companies: RegisteredCompany[]) => {
  if (record.empresa_id) {
    const direct = companies.find((company) => company.id === record.empresa_id);
    if (direct) return direct;
  }
  const candidates = [record.empresa_nome, record.empresa, record.filial].map(normalize).filter(Boolean);
  return companies.find((company) => {
    const companyNames = [company.nome, company.razao_social].map(normalize).filter(Boolean);
    return candidates.some((candidate) => companyNames.some((name) => candidate === name || candidate.includes(name) || name.includes(candidate)));
  }) || null;
};

export const buildConsolidatedFuelReport = (
  records: FuelReportRecord[],
  companies: RegisteredCompany[],
): ConsolidatedCompany[] => {
  const companyMap = new Map<string, ConsolidatedCompany & { employeeMap: Map<string, ConsolidatedEmployee> }>();

  records.forEach((record) => {
    const company = findCompany(record, companies);
    const companyId = company?.id || record.empresa_id || `legacy:${normalize(record.empresa_nome || record.empresa || record.filial || 'sem empresa')}`;
    const companyName = company?.nome || record.empresa_nome || record.empresa || record.filial || 'Empresa não identificada';
    if (!companyMap.has(companyId)) {
      companyMap.set(companyId, {
        empresaId: companyId,
        nome: companyName,
        razaoSocial: company?.razao_social || '',
        cnpj: company?.cnpj || '',
        funcionarios: [],
        quantidadeTotal: 0,
        valorTotal: 0,
        employeeMap: new Map(),
      });
    }

    const group = companyMap.get(companyId)!;
    const employeeKey = record.funcionario_id || `nome:${normalize(record.funcionario_nome)}`;
    if (!group.employeeMap.has(employeeKey)) {
      group.employeeMap.set(employeeKey, {
        funcionarioId: employeeKey,
        nome: record.funcionario_nome || 'Funcionário não identificado',
        quantidade: 0,
        valorTotal: 0,
      });
    }
    const employee = group.employeeMap.get(employeeKey)!;
    employee.quantidade += 1;
    employee.valorTotal += Number(record.valor || 0);
    group.quantidadeTotal += 1;
    group.valorTotal += Number(record.valor || 0);
  });

  return Array.from(companyMap.values())
    .map(({ employeeMap, ...company }) => ({
      ...company,
      funcionarios: Array.from(employeeMap.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

const addPageHeader = (doc: jsPDF, title: string, periodLabel: string, page: number) => {
  const width = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('TOPAC RH PRO MULTIEMPRESAS', 12, 12);
  doc.setFontSize(11);
  doc.text(title, 12, 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Período: ${periodLabel}`, 12, 25);
  doc.text(`Página ${page}`, width - 12, 12, { align: 'right' });
  doc.setDrawColor(80);
  doc.line(12, 28, width - 12, 28);
};

const drawTableHeader = (doc: jsPDF, y: number, columns: Array<{ label: string; x: number; width: number; align?: 'left' | 'right' }>) => {
  doc.setFillColor(235, 235, 235);
  doc.rect(12, y, doc.internal.pageSize.getWidth() - 24, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  columns.forEach((column) => doc.text(column.label, column.align === 'right' ? column.x + column.width : column.x, y + 4.8, { align: column.align || 'left' }));
  return y + 7;
};

const ensurePage = (doc: jsPDF, y: number, needed: number, title: string, periodLabel: string, page: number) => {
  const maxY = doc.internal.pageSize.getHeight() - 12;
  if (y + needed <= maxY) return { y, page, changed: false };
  doc.addPage('a4', 'landscape');
  const nextPage = page + 1;
  addPageHeader(doc, title, periodLabel, nextPage);
  return { y: 32, page: nextPage, changed: true };
};

const outputPdf = (doc: jsPDF, fileName: string) => ({
  blob: doc.output('blob'),
  fileName,
});

export const generateConsolidatedFuelPdf = (
  companies: ConsolidatedCompany[],
  periodLabel: string,
  fileSuffix: string,
) => {
  const title = 'RELATÓRIO CONSOLIDADO DE ABASTECIMENTOS';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  let page = 1;
  let y = 32;
  addPageHeader(doc, title, periodLabel, page);

  const columns = [
    { label: 'Funcionário', x: 15, width: 190 },
    { label: 'Quantidade de abastecimentos', x: 210, width: 35, align: 'right' as const },
    { label: 'Valor total abastecido', x: 250, width: 32, align: 'right' as const },
  ];

  companies.forEach((company) => {
    let check = ensurePage(doc, y, 20, title, periodLabel, page);
    y = check.y; page = check.page;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(company.nome, 12, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const identity = [company.razaoSocial, company.cnpj ? `CNPJ ${company.cnpj}` : ''].filter(Boolean).join(' — ');
    if (identity) doc.text(identity, 12, y + 9);
    y += identity ? 12 : 7;
    y = drawTableHeader(doc, y, columns);

    company.funcionarios.forEach((employee) => {
      check = ensurePage(doc, y, 7, title, periodLabel, page);
      y = check.y; page = check.page;
      if (check.changed) y = drawTableHeader(doc, y, columns);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(employee.nome.slice(0, 105), columns[0].x, y + 4.8);
      doc.text(String(employee.quantidade), columns[1].x + columns[1].width, y + 4.8, { align: 'right' });
      doc.text(formatMoney(employee.valorTotal), columns[2].x + columns[2].width, y + 4.8, { align: 'right' });
      doc.setDrawColor(220);
      doc.line(12, y + 7, doc.internal.pageSize.getWidth() - 12, y + 7);
      y += 7;
    });

    check = ensurePage(doc, y, 9, title, periodLabel, page);
    y = check.y; page = check.page;
    doc.setFillColor(245, 245, 245);
    doc.rect(12, y, doc.internal.pageSize.getWidth() - 24, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`Total da empresa: ${company.quantidadeTotal} abastecimento(s)`, 15, y + 5.3);
    doc.text(formatMoney(company.valorTotal), 282, y + 5.3, { align: 'right' });
    y += 13;
  });

  return outputPdf(doc, `Relatorio_Consolidado_Abastecimentos_${fileSuffix}.pdf`);
};

export const generateDetailedFuelPdf = (
  records: FuelReportRecord[],
  periodLabel: string,
  fileSuffix: string,
) => {
  const title = 'RELATÓRIO DETALHADO DE ABASTECIMENTOS';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  let page = 1;
  let y = 32;
  addPageHeader(doc, title, periodLabel, page);

  const columns = [
    { label: 'Data', x: 12, width: 18 },
    { label: 'Hora', x: 31, width: 14 },
    { label: 'Empresa', x: 46, width: 39 },
    { label: 'Funcionário', x: 86, width: 45 },
    { label: 'Placa', x: 132, width: 18 },
    { label: 'Posto', x: 151, width: 35 },
    { label: 'Combustível', x: 187, width: 22 },
    { label: 'Litros', x: 210, width: 18, align: 'right' as const },
    { label: 'Valor', x: 229, width: 23, align: 'right' as const },
    { label: 'KM', x: 253, width: 18, align: 'right' as const },
    { label: 'Status', x: 272, width: 13 },
  ];
  y = drawTableHeader(doc, y, columns);

  records.forEach((record) => {
    const check = ensurePage(doc, y, 7, title, periodLabel, page);
    y = check.y; page = check.page;
    if (check.changed) y = drawTableHeader(doc, y, columns);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const values = [
      formatDateBr(record.data),
      String(record.hora || '').slice(0, 5),
      record.empresa_nome || record.empresa || record.filial || '-',
      record.funcionario_nome || '-',
      record.placa || '-',
      record.posto_nome || '-',
      record.combustivel || '-',
      formatNumber(record.litros, 2),
      formatMoney(record.valor),
      record.km_atual == null ? '-' : formatNumber(record.km_atual, 0),
      record.status || '-',
    ];
    columns.forEach((column, index) => {
      const text = String(values[index] || '').slice(0, index === 3 ? 29 : index === 2 || index === 5 ? 24 : 18);
      doc.text(text, column.align === 'right' ? column.x + column.width : column.x, y + 4.6, { align: column.align || 'left' });
    });
    doc.setDrawColor(225);
    doc.line(12, y + 7, doc.internal.pageSize.getWidth() - 12, y + 7);
    y += 7;
  });

  const totalValue = records.reduce((sum, record) => sum + Number(record.valor || 0), 0);
  const check = ensurePage(doc, y, 10, title, periodLabel, page);
  y = check.y; page = check.page;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`Total: ${records.length} abastecimento(s)`, 12, y + 6);
  doc.text(formatMoney(totalValue), 285, y + 6, { align: 'right' });

  return outputPdf(doc, `Relatorio_Detalhado_Abastecimentos_${fileSuffix}.pdf`);
};
