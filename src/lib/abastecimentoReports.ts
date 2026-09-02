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

export type KmReportRecord = {
  id: string;
  funcionario_id: string | null;
  funcionario_nome: string;
  empresa_id: string | null;
  empresa_nome: string;
  empresa: string | null;
  filial: string | null;
  placa: string;
  data: string;
  hora: string | null;
  km_inicial: number | null;
  km_final: number | null;
  total_rodado: number | null;
  motivo_rota: string;
  fonte_km: 'sequencia' | 'registrado' | 'sem_base' | 'inconsistente';
  status: string | null;
  created_at: string | null;
};

export type KmReportGroup = {
  groupKey: string;
  empresaId: string;
  empresaNome: string;
  funcionarioId: string;
  funcionarioNome: string;
  placa: string;
  records: KmReportRecord[];
  totalRodado: number;
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

const compareKmRecords = (a: KmReportRecord, b: KmReportRecord) => {
  const company = a.empresa_nome.localeCompare(b.empresa_nome, 'pt-BR');
  if (company !== 0) return company;
  const employee = a.funcionario_nome.localeCompare(b.funcionario_nome, 'pt-BR');
  if (employee !== 0) return employee;
  const plate = a.placa.localeCompare(b.placa, 'pt-BR');
  if (plate !== 0) return plate;
  const date = a.data.localeCompare(b.data);
  if (date !== 0) return date;
  const time = String(a.hora || '').localeCompare(String(b.hora || ''));
  if (time !== 0) return time;
  return String(a.created_at || a.id).localeCompare(String(b.created_at || b.id));
};

export const buildKmReportGroups = (records: KmReportRecord[]): KmReportGroup[] => {
  const groups = new Map<string, KmReportGroup>();

  [...records].sort(compareKmRecords).forEach((record) => {
    const companyKey = record.empresa_id || `empresa:${normalize(record.empresa_nome || record.empresa || record.filial)}`;
    const employeeKey = record.funcionario_id || `funcionario:${normalize(record.funcionario_nome)}`;
    const plateKey = normalize(record.placa);
    const groupKey = `${companyKey}|${employeeKey}|${plateKey}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        empresaId: companyKey,
        empresaNome: record.empresa_nome || record.empresa || record.filial || 'Empresa não identificada',
        funcionarioId: employeeKey,
        funcionarioNome: record.funcionario_nome || 'Colaborador não identificado',
        placa: record.placa || 'SEM PLACA',
        records: [],
        totalRodado: 0,
      });
    }

    const group = groups.get(groupKey)!;
    group.records.push(record);
    if (record.total_rodado != null && record.total_rodado >= 0) {
      group.totalRodado += Number(record.total_rodado);
    }
  });

  return Array.from(groups.values()).sort((a, b) => {
    const company = a.empresaNome.localeCompare(b.empresaNome, 'pt-BR');
    if (company !== 0) return company;
    const employee = a.funcionarioNome.localeCompare(b.funcionarioNome, 'pt-BR');
    if (employee !== 0) return employee;
    return a.placa.localeCompare(b.placa, 'pt-BR');
  });
};

const addKmGroupHeader = (doc: jsPDF, group: KmReportGroup, y: number) => {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(12, y, width - 24, 16, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(group.funcionarioNome, 16, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(group.empresaNome, 16, y + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`PLACA ${group.placa}`, width - 16, y + 6.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`${group.records.length} registro(s)`, width - 16, y + 12, { align: 'right' });
  return y + 19;
};

export const generateKmReportPdf = (
  groups: KmReportGroup[],
  periodLabel: string,
  fileSuffix: string,
) => {
  const title = 'RELATÓRIO CORPORATIVO DE QUILOMETRAGEM';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const columns = [
    { label: 'Data', x: 12, width: 27 },
    { label: 'Placa', x: 41, width: 22 },
    { label: 'KM Inicial', x: 65, width: 27, align: 'right' as const },
    { label: 'KM Final', x: 95, width: 27, align: 'right' as const },
    { label: 'Total rodado', x: 125, width: 29, align: 'right' as const },
    { label: 'Motivo / Rota', x: 158, width: 127 },
  ];
  const pageHeight = doc.internal.pageSize.getHeight();
  let page = 1;

  const startGroupPage = (group: KmReportGroup, addPage: boolean) => {
    if (addPage) {
      doc.addPage('a4', 'landscape');
      page += 1;
    }
    addPageHeader(doc, title, periodLabel, page);
    let nextY = addKmGroupHeader(doc, group, 32);
    nextY = drawTableHeader(doc, nextY, columns);
    return nextY;
  };

  if (!groups.length) {
    addPageHeader(doc, title, periodLabel, page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Nenhum registro de quilometragem localizado para o período.', 12, 40);
    return outputPdf(doc, `Relatorio_Quilometragem_${fileSuffix}.pdf`);
  }

  groups.forEach((group, groupIndex) => {
    let y = startGroupPage(group, groupIndex > 0);

    group.records.forEach((record) => {
      const route = String(record.motivo_rota || 'Não informado');
      const routeLines = doc.splitTextToSize(route, columns[5].width - 2) as string[];
      const rowHeight = Math.max(9, routeLines.length * 4 + 3);

      if (y + rowHeight > pageHeight - 16) {
        y = startGroupPage(group, true);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const dateLines = [formatDateBr(record.data), String(record.hora || '').slice(0, 5)].filter(Boolean);
      doc.text(dateLines, columns[0].x, y + 5);
      doc.text(record.placa || '-', columns[1].x, y + 5);
      doc.text(record.km_inicial == null ? '-' : formatNumber(record.km_inicial, 0), columns[2].x + columns[2].width, y + 5, { align: 'right' });
      doc.text(record.km_final == null ? '-' : formatNumber(record.km_final, 0), columns[3].x + columns[3].width, y + 5, { align: 'right' });
      doc.text(record.total_rodado == null ? '-' : formatNumber(record.total_rodado, 0), columns[4].x + columns[4].width, y + 5, { align: 'right' });
      doc.text(routeLines, columns[5].x, y + 5);
      doc.setDrawColor(218, 223, 230);
      doc.line(12, y + rowHeight, doc.internal.pageSize.getWidth() - 12, y + rowHeight);
      y += rowHeight;
    });

    if (y + 10 > pageHeight - 14) {
      y = startGroupPage(group, true);
    }
    doc.setFillColor(248, 250, 252);
    doc.rect(12, y, doc.internal.pageSize.getWidth() - 24, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`Total rodado no grupo: ${formatNumber(group.totalRodado, 0)} km`, doc.internal.pageSize.getWidth() - 16, y + 6, { align: 'right' });
  });

  return outputPdf(doc, `Relatorio_Quilometragem_${fileSuffix}.pdf`);
};
