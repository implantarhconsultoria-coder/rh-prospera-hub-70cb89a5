import type { Company, Employee, MonthlyEntry } from '@/types/database';
import { asoStatus, calcTotalFuncionario, feriasStatus, formatCurrency } from '@/lib/calculations';
import {
  daysUntilOperationalClosing,
  greetingForNow,
  type CalendarEvent,
  type IntelligenceAlert,
  type SupabaseIntelligenceCounts,
  type WeatherSnapshot,
} from '@/lib/inteligenciaOperacional';

export type CorporateFinanceSnapshot = {
  aReceber?: number;
  aPagar?: number;
  vencidoReceber?: number;
  vencidoPagar?: number;
  recebidoPeriodo?: number;
  pagoPeriodo?: number;
  saldoProjetado?: number;
};

export type CorporateFleetSnapshot = {
  veiculosAtivos?: number;
  abastecimentos?: number;
  litros?: number;
  valorAbastecido?: number;
  kmMedio?: number;
};

export type CompanyHealthSnapshot = {
  companyId: string;
  companyName: string;
  ativos: number;
  folhaLiquida: number;
  asoAlertas: number;
  feriasAlertas: number;
};

export type CorporateSnapshot = {
  competencia: string;
  companies: number;
  activeEmployees: number;
  operationalEmployees: number;
  folhaBruta: number;
  folhaLiquida: number;
  inss: number;
  fgts: number;
  asoAlertas: number;
  asoVencidos: number;
  feriasAlertas: number;
  lancamentosPendentes: number;
  documentosPendentes: number;
  solicitacoesPendentes: number;
  solicitacoesDiretor: number;
  veiculosDocumentosVencendo: number;
  faturamentoAberto: number;
  contasPagarAberto: number;
  finance?: CorporateFinanceSnapshot;
  fleet?: CorporateFleetSnapshot;
  companyHealth: CompanyHealthSnapshot[];
};

type BuildSnapshotArgs = {
  companies: Company[];
  employees: Employee[];
  entries: MonthlyEntry[];
  counts?: SupabaseIntelligenceCounts;
  finance?: CorporateFinanceSnapshot;
  fleet?: CorporateFleetSnapshot;
  now?: Date;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const buildCorporateSnapshot = ({
  companies,
  employees,
  entries,
  counts = {},
  finance,
  fleet,
  now = new Date(),
}: BuildSnapshotArgs): CorporateSnapshot => {
  const competencia = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const activeCompanies = companies.filter((c) => c.status !== 'inativa');
  const activeEmployees = employees.filter((e) => e.status === 'ativo');
  const currentEntries = entries.filter((entry) => entry.competencia === competencia);
  const entryByEmployee = new Map(currentEntries.map((entry) => [entry.employeeId, entry]));

  const totals = activeEmployees.reduce(
    (acc, employee) => {
      const entry = entryByEmployee.get(employee.id);
      if (entry) {
        const calc = calcTotalFuncionario(employee, entry);
        acc.folhaBruta += calc.proventos;
        acc.folhaLiquida += calc.liquido;
        acc.inss += calc.inss;
        acc.fgts += calc.fgts;
      } else {
        acc.folhaBruta += Number(employee.salarioBase) || 0;
        acc.folhaLiquida += Number(employee.salarioBase) || 0;
      }
      return acc;
    },
    { folhaBruta: 0, folhaLiquida: 0, inss: 0, fgts: 0 },
  );

  const asoAlertEmployees = activeEmployees.filter((e) => asoStatus(e.dataExameMedico).status !== 'ok');
  const feriasAlertEmployees = activeEmployees.filter((e) => feriasStatus(e.dataAdmissao).status !== 'em dia');

  const companyHealth = activeCompanies.map((company) => {
    const companyEmployees = activeEmployees.filter((employee) => employee.companyId === company.id);
    const folhaLiquida = companyEmployees.reduce((sum, employee) => {
      const entry = entryByEmployee.get(employee.id);
      return sum + (entry ? calcTotalFuncionario(employee, entry).liquido : Number(employee.salarioBase) || 0);
    }, 0);
    return {
      companyId: company.id,
      companyName: company.name,
      ativos: companyEmployees.length,
      folhaLiquida,
      asoAlertas: companyEmployees.filter((e) => asoStatus(e.dataExameMedico).status !== 'ok').length,
      feriasAlertas: companyEmployees.filter((e) => feriasStatus(e.dataAdmissao).status !== 'em dia').length,
    };
  });

  return {
    competencia,
    companies: activeCompanies.length,
    activeEmployees: activeEmployees.length,
    operationalEmployees: activeEmployees.filter((e) => e.categoria === 'operacional').length,
    folhaBruta: totals.folhaBruta,
    folhaLiquida: totals.folhaLiquida,
    inss: totals.inss,
    fgts: totals.fgts,
    asoAlertas: asoAlertEmployees.length,
    asoVencidos: asoAlertEmployees.filter((e) => asoStatus(e.dataExameMedico).status === 'vencido').length,
    feriasAlertas: feriasAlertEmployees.length,
    lancamentosPendentes: currentEntries.filter((entry) => entry.statusConferencia !== 'conferido').length,
    documentosPendentes: counts.documentosPendentes || 0,
    solicitacoesPendentes: counts.solicitacoesPendentes || 0,
    solicitacoesDiretor: counts.solicitacoesDiretor || 0,
    veiculosDocumentosVencendo: counts.veiculosDocumentosVencendo || 0,
    faturamentoAberto: counts.faturamentoAberto || 0,
    contasPagarAberto: counts.contasPagarAberto || 0,
    finance,
    fleet: {
      veiculosAtivos: fleet?.veiculosAtivos ?? counts.veiculosAtivos,
      abastecimentos: fleet?.abastecimentos,
      litros: fleet?.litros,
      valorAbastecido: fleet?.valorAbastecido,
      kmMedio: fleet?.kmMedio,
    },
    companyHealth,
  };
};

export const buildSmartGreeting = (
  displayName: string,
  snapshot: CorporateSnapshot,
  calendarEvents: CalendarEvent[] = [],
  weather: WeatherSnapshot[] = [],
  now = new Date(),
) => {
  const firstName = (displayName || 'Rodrigo').split(/\s+/)[0];
  const upcomingEvent = calendarEvents.find((event) => event.daysUntil <= 10);
  const rainy = weather.some((item) => (item.rainProbability || 0) >= 60);
  const hot = weather.some((item) => (item.maxTemperature || item.temperature || 0) >= 35);
  const cold = weather.some((item) => (item.minTemperature || item.temperature || 99) <= 12);
  const daysToClosing = daysUntilOperationalClosing(now);
  const weekday = now.getDay();

  const base: string[] = [];
  base.push(`${greetingForNow(now)}, ${firstName}.`);

  if (daysToClosing <= 7) {
    base.push('Entramos na semana de fechamento. Vale priorizar conferencias, documentos e pendencias antes de virar urgencia.');
  } else if (upcomingEvent) {
    base.push(`Faltam ${upcomingEvent.daysUntil || '0'} dia(s) para ${upcomingEvent.title}. ${upcomingEvent.message}`);
  } else {
    const rotating = [
      'Desejamos uma jornada produtiva, organizada e com boas decisoes.',
      'A leitura operacional esta pronta para ajudar a antecipar riscos do dia.',
      'A plataforma esta acompanhando RH, frota, documentos e fechamento com os dados disponiveis.',
      'Seguimos monitorando os pontos importantes para manter a operacao no eixo.',
    ];
    base.push(rotating[(now.getDate() + weekday) % rotating.length]);
  }

  if (rainy) base.push('Ha previsao de chuva relevante. Confira deslocamentos, equipe externa e equipamentos.');
  if (hot) base.push('Temperatura alta prevista. Reforce hidratacao das equipes de campo.');
  if (cold) base.push('Frio ou queda de temperatura no radar. Oriente as equipes externas.');

  if (snapshot.solicitacoesPendentes || snapshot.documentosPendentes || snapshot.asoAlertas) {
    base.push(`Hoje existem ${snapshot.solicitacoesPendentes} solicitacao(oes), ${snapshot.documentosPendentes} documento(s) e ${snapshot.asoAlertas} ASO(s) para acompanhamento.`);
  } else {
    base.push('Nenhuma pendencia critica foi identificada com os dados carregados agora.');
  }

  return base;
};

export const buildExecutiveSummary = (snapshot: CorporateSnapshot) => [
  `Competencia analisada: ${snapshot.competencia}.`,
  `Funcionarios ativos: ${snapshot.activeEmployees} em ${snapshot.companies} empresa(s).`,
  `Folha liquida estimada: ${formatCurrency(snapshot.folhaLiquida)}.`,
  snapshot.finance
    ? `Financeiro: ${formatCurrency(snapshot.finance.aReceber || 0)} a receber, ${formatCurrency(snapshot.finance.aPagar || 0)} a pagar e saldo projetado de ${formatCurrency(snapshot.finance.saldoProjetado || 0)}.`
    : `Financeiro: ${snapshot.faturamentoAberto} faturamento(s) em aberto e ${snapshot.contasPagarAberto} conta(s) a pagar em aberto.`,
  `Frota: ${snapshot.fleet?.veiculosAtivos ?? 0} veiculo(s) ativo(s), ${snapshot.veiculosDocumentosVencendo} documento(s) proximos do vencimento.`,
  `Pontos de atencao: ${snapshot.asoAlertas} ASO(s), ${snapshot.feriasAlertas} ferias, ${snapshot.lancamentosPendentes} lancamento(s) em conferencia e ${snapshot.solicitacoesPendentes} solicitacao(oes) operacional(is).`,
];

export const buildDetailedAnalysis = (snapshot: CorporateSnapshot) => [
  {
    title: 'RH e folha',
    lines: [
      `${snapshot.activeEmployees} colaborador(es) ativos; ${snapshot.operationalEmployees} operacional(is).`,
      `Folha bruta estimada: ${formatCurrency(snapshot.folhaBruta)}. Folha liquida estimada: ${formatCurrency(snapshot.folhaLiquida)}.`,
      `INSS estimado: ${formatCurrency(snapshot.inss)}. FGTS informativo: ${formatCurrency(snapshot.fgts)}.`,
      `${snapshot.asoAlertas} ASO(s) pedem acompanhamento e ${snapshot.feriasAlertas} colaborador(es) tem ferias em atencao.`,
    ],
  },
  {
    title: 'Financeiro e faturamento',
    lines: snapshot.finance
      ? [
          `A receber: ${formatCurrency(snapshot.finance.aReceber || 0)}; vencido: ${formatCurrency(snapshot.finance.vencidoReceber || 0)}.`,
          `A pagar: ${formatCurrency(snapshot.finance.aPagar || 0)}; vencido: ${formatCurrency(snapshot.finance.vencidoPagar || 0)}.`,
          `Recebido no periodo: ${formatCurrency(snapshot.finance.recebidoPeriodo || 0)}. Pago no periodo: ${formatCurrency(snapshot.finance.pagoPeriodo || 0)}.`,
        ]
      : [
          `${snapshot.faturamentoAberto} faturamento(s) em aberto.`,
          `${snapshot.contasPagarAberto} conta(s) a pagar em aberto.`,
          'Valores detalhados aparecem quando o relatorio executivo financeiro estiver carregado.',
        ],
  },
  {
    title: 'Operacional, frota e documentos',
    lines: [
      `${snapshot.solicitacoesPendentes} solicitacao(oes) pendente(s) e ${snapshot.solicitacoesDiretor} aguardando diretor.`,
      `${snapshot.fleet?.veiculosAtivos ?? 0} veiculo(s) ativo(s); ${snapshot.fleet?.abastecimentos ?? 0} abastecimento(s) no periodo carregado.`,
      `${snapshot.documentosPendentes} documento(s) aguardando acao e ${snapshot.veiculosDocumentosVencendo} documento(s) de frota proximos do vencimento.`,
    ],
  },
];

export const buildAitorReport = (snapshot: CorporateSnapshot) => {
  const topCompany = [...snapshot.companyHealth].sort((a, b) => b.folhaLiquida - a.folhaLiquida)[0];
  return [
    'Resumo executivo para o Sr. Aitor',
    ...buildExecutiveSummary(snapshot),
    topCompany ? `Maior concentracao de folha: ${topCompany.companyName}, com ${topCompany.ativos} funcionario(s) e ${formatCurrency(topCompany.folhaLiquida)} de folha liquida estimada.` : 'Sem empresa ativa carregada para ranking.',
    snapshot.solicitacoesDiretor ? `${snapshot.solicitacoesDiretor} item(ns) aguardam decisao da diretoria.` : 'Nao ha item aguardando decisao da diretoria nos dados carregados.',
    snapshot.asoVencidos ? `${snapshot.asoVencidos} ASO(s) vencido(s) precisam de acao prioritaria.` : 'Nao ha ASO vencido identificado na leitura atual.',
    'Recomendacao: revisar pendencias criticas antes de qualquer fechamento ou envio externo.',
  ];
};

export const answerCorporateQuestion = (question: string, snapshot: CorporateSnapshot) => {
  const q = normalize(question);
  if (!q.trim()) return 'Digite uma pergunta sobre pendencias, fechamento, RH, frota, financeiro ou documentos.';

  if (q.includes('fechamento') || q.includes('folha')) {
    return `Para o fechamento ${snapshot.competencia}, existem ${snapshot.lancamentosPendentes} lancamento(s) em conferencia. Folha liquida estimada: ${formatCurrency(snapshot.folhaLiquida)}.`;
  }

  if (q.includes('aso') || q.includes('exame')) {
    return `${snapshot.asoAlertas} ASO(s) precisam de acompanhamento; ${snapshot.asoVencidos} estao vencidos na leitura atual.`;
  }

  if (q.includes('feria')) {
    return `${snapshot.feriasAlertas} colaborador(es) aparecem com ferias vencidas, em atencao ou programadas conforme os dados carregados.`;
  }

  if (q.includes('goian') || q.includes('praia') || q.includes('matriz') || q.includes('lmt') || q.includes('alqui')) {
    const target = q.includes('goian') ? 'goian' : q.includes('praia') ? 'praia' : q.includes('lmt') ? 'lmt' : q.includes('alqui') ? 'alqui' : 'matriz';
    const rows = snapshot.companyHealth.filter((row) => normalize(row.companyName).includes(target));
    if (!rows.length) return 'Nao encontrei empresa correspondente nos dados carregados agora.';
    return rows.map((row) => `${row.companyName}: ${row.ativos} ativo(s), folha liquida ${formatCurrency(row.folhaLiquida)}, ${row.asoAlertas} ASO(s) em atencao e ${row.feriasAlertas} ferias em atencao.`).join(' ');
  }

  if (q.includes('frota') || q.includes('veiculo') || q.includes('manutenc')) {
    return `Frota: ${snapshot.fleet?.veiculosAtivos ?? 0} veiculo(s) ativo(s), ${snapshot.veiculosDocumentosVencendo} documento(s) de frota proximos do vencimento e ${snapshot.fleet?.abastecimentos ?? 0} abastecimento(s) no periodo carregado.`;
  }

  if (q.includes('finance') || q.includes('fatur') || q.includes('receber') || q.includes('pagar')) {
    if (snapshot.finance) {
      return `Financeiro: ${formatCurrency(snapshot.finance.aReceber || 0)} a receber, ${formatCurrency(snapshot.finance.aPagar || 0)} a pagar e saldo projetado de ${formatCurrency(snapshot.finance.saldoProjetado || 0)}.`;
    }
    return `Leitura financeira basica: ${snapshot.faturamentoAberto} faturamento(s) em aberto e ${snapshot.contasPagarAberto} conta(s) a pagar em aberto.`;
  }

  if (q.includes('document')) {
    return `${snapshot.documentosPendentes} documento(s) aguardam acao ou conferencia. PDFs gerados e uploads devem ser conferidos no Historico Documental.`;
  }

  if (q.includes('pend') || q.includes('atencao') || q.includes('critico')) {
    return `Pontos de atencao: ${snapshot.solicitacoesPendentes} solicitacao(oes), ${snapshot.documentosPendentes} documento(s), ${snapshot.asoAlertas} ASO(s), ${snapshot.feriasAlertas} ferias e ${snapshot.veiculosDocumentosVencendo} documento(s) de frota.`;
  }

  return 'Com os dados reais carregados, posso responder sobre pendencias, fechamento, RH, ASO, ferias, frota, financeiro, faturamento, documentos e empresas especificas.';
};

export const linesToText = (lines: string[]) => lines.join('\n');
