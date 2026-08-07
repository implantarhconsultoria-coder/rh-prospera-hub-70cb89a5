export type TipoRescisao =
  | 'sem_justa_causa'
  | 'pedido_demissao'
  | 'acordo_mutuo_484a'
  | 'justa_causa'
  | 'termino_contrato_experiencia'
  | 'rescisao_indireta';

export type AvisoPrevio = 'trabalhado' | 'indenizado' | 'descontado' | 'dispensado';

export type SituacaoFerias =
  | 'Quitado'
  | 'Em aberto'
  | 'Férias vencidas'
  | 'Férias proporcionais'
  | 'Parcialmente usufruído';

export type RescisaoDescontoTipo =
  | 'faltas'
  | 'adiantamento_salarial'
  | 'adiantamento_13'
  | 'vale_transporte'
  | 'vale_refeicao'
  | 'emprestimos'
  | 'pensao'
  | 'danos_autorizados'
  | 'aviso_previo_descontado'
  | 'outros';

export interface FeriasRegistroInput {
  id: string;
  periodoAquisitivoInicio?: string | null;
  periodoAquisitivoFim?: string | null;
  periodoGozoInicio?: string | null;
  periodoGozoFim?: string | null;
  diasFerias?: number | null;
  diasAbono?: number | null;
  status?: string | null;
  statusPagamento?: string | null;
}

export interface FaltaMensalInput {
  competencia: string;
  faltasDias: number;
}

export interface RescisaoDescontoInput {
  id: string;
  tipo: RescisaoDescontoTipo;
  descricao: string;
  valor: number;
  observacao?: string;
  automatico?: boolean;
}

export interface ManualOverrideInput {
  campo: 'saldoSalario' | 'avisoPrevioValor' | 'decimoTerceiroBruto' | 'fgtsSaldo';
  valorAutomatico: number;
  valorManual: number;
  motivo: string;
  alteradoPor?: string;
  alteradoEm?: string;
}

export interface FeriasPeriodoOverrideInput {
  periodoInicio: string;
  quitadoManualmente?: boolean;
  diasUtilizadosManual?: number;
  diasAbonoManual?: number;
  motivo: string;
  alteradoPor?: string;
  alteradoEm?: string;
}

export interface RescisaoInput {
  salarioBase: number;
  dependentes: number;
  dataAdmissao: string;
  dataDesligamento: string;
  tipo: TipoRescisao;
  aviso: AvisoPrevio;
  saldoFgtsDepositado: number;
  fgtsSaldoEditadoManual?: boolean;
  fgtsSaldoMotivo?: string;
  mediaHorasExtras?: number;
  mediaComissao?: number;
  adicionaisMedia?: number;
  feriasRegistros?: FeriasRegistroInput[];
  faltasMensais?: FaltaMensalInput[];
  descontos?: RescisaoDescontoInput[];
  overrides?: ManualOverrideInput[];
  feriasOverrides?: FeriasPeriodoOverrideInput[];
  usuarioCalculo?: string;
  calculadoEm?: string;
  /** Compatibilidade temporária com registros antigos; a tela nova usa descontos detalhados. */
  outrosDescontos?: number;
  /** Campo legado descontinuado. Mantido apenas para leitura/compilação de versões antigas. */
  feriasVencidasMeses?: number;
}

export interface FeriasPeriodoResultado {
  periodoAquisitivoInicio: string;
  periodoAquisitivoFim: string;
  dataLimiteConcessiva: string;
  situacao: SituacaoFerias;
  origemPeriodo: 'confirmado' | 'inferido' | 'calculado';
  diasDireito: number;
  diasJaUtilizados: number;
  diasAbono: number;
  saldoDias: number;
  avos: number | null;
  remuneracaoBase: number;
  valorBaseSemDobro: number;
  valorFerias: number;
  tercoConstitucional: number;
  adicionalDobro: number;
  totalPeriodo: number;
  faltasConsideradas: number;
  registrosFonte: string[];
  revisaoNecessaria: boolean;
  observacao: string;
  alteradoManualmente: boolean;
  motivoAlteracaoManual?: string;
}

export interface RescisaoResultado {
  dataProjetadaContrato: string;
  diasAviso: number;
  divisorSaldoSalario: number;
  diasSaldoSalario: number;
  saldoSalario: number;
  avisoPrevioValor: number;
  avisoPrevioDesconto: number;
  periodosFerias: FeriasPeriodoResultado[];
  feriasVencidas: number;
  feriasEmAberto: number;
  feriasProporcionais: number;
  feriasEmDobroAdicional: number;
  tercoFeriasVencidas: number;
  tercoFeriasEmAberto: number;
  tercoFeriasProporcionais: number;
  tercoFerias: number;
  totalFerias: number;
  decimoTerceiroAvos: number;
  decimoTerceiroBruto: number;
  decimoTerceiroAdiantado: number;
  decimoTerceiro: number;
  mediaHorasExtras: number;
  mediaComissao: number;
  adicionaisMedia: number;
  baseRemuneracao: number;
  inss: number;
  irrf: number;
  fgtsMes: number;
  saldoFgtsConsiderado: number;
  multaFgts: number;
  descontosDetalhados: RescisaoDescontoInput[];
  outrosDescontos: number;
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  alteracoesManuais: ManualOverrideInput[];
  revisaoFeriasNecessaria: boolean;
  detalhe: Record<string, number | string | boolean>;
  auditoria: {
    calculadoEm: string;
    usuario: string;
    salarioBaseUtilizado: number;
    remuneracaoBaseUtilizada: number;
    dataDesligamento: string;
    tipoRescisao: TipoRescisao;
    periodoIdsConsiderados: string[];
    avosFeriasProporcionais: number;
    avosDecimoTerceiro: number;
  };
}

const MS_DIA = 86_400_000;
const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseLocalDate = (value: string) => {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return new Date(1970, 0, 1, 12);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const toISO = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const addYears = (date: Date, years: number) => {
  const result = new Date(date);
  const month = result.getMonth();
  result.setFullYear(result.getFullYear() + years);
  if (result.getMonth() !== month) result.setDate(0);
  return result;
};

const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0, 12).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
};

const inclusiveDays = (start: Date, end: Date) => {
  if (end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / MS_DIA) + 1;
};

const completedYears = (start: Date, end: Date) => {
  let years = end.getFullYear() - start.getFullYear();
  if (end < addYears(start, years)) years -= 1;
  return Math.max(0, years);
};

export const getVacationEntitlementDays = (faltasInjustificadas: number) => {
  const faltas = Math.max(0, Math.floor(Number(faltasInjustificadas) || 0));
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
};

const monthlyEntryOverlaps = (competencia: string, periodStart: Date, periodEnd: Date) => {
  const [year, month] = String(competencia || '').split('-').map(Number);
  if (!year || !month) return false;
  const start = new Date(year, month - 1, 1, 12);
  const end = new Date(year, month, 0, 12);
  return start <= periodEnd && end >= periodStart;
};

const sumAbsences = (faltas: FaltaMensalInput[], periodStart: Date, periodEnd: Date) => round2(
  faltas
    .filter((item) => monthlyEntryOverlaps(item.competencia, periodStart, periodEnd))
    .reduce((sum, item) => sum + Math.max(0, Number(item.faltasDias) || 0), 0),
);

const countAcquisitionTwelfths = (periodStart: Date, reference: Date) => {
  let twelfths = 0;
  for (let index = 0; index < 12; index += 1) {
    const segmentStart = addMonths(periodStart, index);
    const segmentEnd = addDays(addMonths(periodStart, index + 1), -1);
    if (segmentStart > reference) break;
    const effectiveEnd = reference < segmentEnd ? reference : segmentEnd;
    if (inclusiveDays(segmentStart, effectiveEnd) >= 15) twelfths += 1;
  }
  return clamp(twelfths, 0, 12);
};

const countThirteenthTwelfths = (admission: Date, reference: Date) => {
  const year = reference.getFullYear();
  let twelfths = 0;
  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(year, month, 1, 12);
    const monthEnd = new Date(year, month + 1, 0, 12);
    const workedStart = admission > monthStart ? admission : monthStart;
    const workedEnd = reference < monthEnd ? reference : monthEnd;
    if (workedStart <= workedEnd && inclusiveDays(workedStart, workedEnd) >= 15) twelfths += 1;
  }
  return clamp(twelfths, 0, 12);
};

export const inferVacationAcquisitionPeriod = (dataAdmissao: string, periodoGozoInicio: string) => {
  const admission = parseLocalDate(dataAdmissao);
  const gozo = parseLocalDate(periodoGozoInicio);
  let start = new Date(admission);
  let completedStart: Date | null = null;
  for (let guard = 0; guard < 80; guard += 1) {
    const next = addYears(start, 1);
    if (next > gozo) break;
    completedStart = new Date(start);
    start = next;
  }
  const chosenStart = completedStart || admission;
  return {
    inicio: toISO(chosenStart),
    fim: toISO(addDays(addYears(chosenStart, 1), -1)),
    origem: completedStart ? 'inferido' as const : 'calculado' as const,
  };
};

const normaliseVacationRecord = (record: FeriasRegistroInput, admission: Date) => {
  if (record.periodoAquisitivoInicio && record.periodoAquisitivoFim) {
    return {
      ...record,
      inferredStart: record.periodoAquisitivoInicio,
      inferredEnd: record.periodoAquisitivoFim,
      origin: 'confirmado' as const,
    };
  }
  if (record.periodoGozoInicio) {
    const inferred = inferVacationAcquisitionPeriod(toISO(admission), record.periodoGozoInicio);
    return { ...record, inferredStart: inferred.inicio, inferredEnd: inferred.fim, origin: 'inferido' as const };
  }
  return { ...record, inferredStart: '', inferredEnd: '', origin: 'calculado' as const };
};

const getOverride = (overrides: ManualOverrideInput[], campo: ManualOverrideInput['campo'], automaticValue: number) => {
  const found = [...overrides].reverse().find((item) => item.campo === campo && String(item.motivo || '').trim());
  if (!found) return { value: round2(automaticValue), override: null as ManualOverrideInput | null };
  return { value: round2(Math.max(0, Number(found.valorManual) || 0)), override: { ...found, valorAutomatico: round2(automaticValue) } };
};

const calcInss2026 = (base: number) => {
  const taxable = clamp(Number(base) || 0, 0, 8475.55);
  const bands = [
    { from: 0, to: 1621.00, rate: 0.075 },
    { from: 1621.00, to: 2902.84, rate: 0.09 },
    { from: 2902.84, to: 4354.27, rate: 0.12 },
    { from: 4354.27, to: 8475.55, rate: 0.14 },
  ];
  return round2(bands.reduce((total, band) => {
    const slice = Math.max(0, Math.min(taxable, band.to) - band.from);
    return total + slice * band.rate;
  }, 0));
};

const calcIrrfTable2026 = (base: number) => {
  const taxable = Math.max(0, Number(base) || 0);
  if (taxable <= 2428.80) return 0;
  if (taxable <= 2826.65) return taxable * 0.075 - 182.16;
  if (taxable <= 3751.05) return taxable * 0.15 - 394.16;
  if (taxable <= 4664.68) return taxable * 0.225 - 675.49;
  return taxable * 0.275 - 908.73;
};

const calcIrrf2026 = (rendimentoTributavel: number, inss: number, dependentes: number) => {
  const bruto = Math.max(0, Number(rendimentoTributavel) || 0);
  const deducaoLegal = Math.max(0, Number(inss) || 0) + Math.max(0, Number(dependentes) || 0) * 189.59;
  const deducao = Math.max(deducaoLegal, 607.20);
  const base = Math.max(0, bruto - deducao);
  const impostoTabela = Math.max(0, calcIrrfTable2026(base));
  let reducao = 0;
  if (bruto <= 5000) reducao = Math.min(impostoTabela, 312.89);
  else if (bruto <= 7350) reducao = Math.max(0, 978.62 - 0.133145 * bruto);
  return { imposto: round2(Math.max(0, impostoTabela - reducao)), base: round2(base), reducao: round2(reducao) };
};

const buildVacationPeriods = ({
  admission,
  effectiveTermination,
  actualTermination,
  remuneration,
  records,
  absences,
  overrides,
  allowProportional,
}: {
  admission: Date;
  effectiveTermination: Date;
  actualTermination: Date;
  remuneration: number;
  records: FeriasRegistroInput[];
  absences: FaltaMensalInput[];
  overrides: FeriasPeriodoOverrideInput[];
  allowProportional: boolean;
}) => {
  const normalizedRecords = records.map((record) => normaliseVacationRecord(record, admission));
  const periods: FeriasPeriodoResultado[] = [];
  let periodStart = new Date(admission);

  for (let guard = 0; guard < 80 && periodStart <= effectiveTermination; guard += 1) {
    const periodEnd = addDays(addYears(periodStart, 1), -1);
    const complete = periodEnd < effectiveTermination;
    const referenceEnd = complete ? periodEnd : effectiveTermination;
    const absencesInPeriod = sumAbsences(absences, periodStart, referenceEnd);
    const fullEntitlement = getVacationEntitlementDays(absencesInPeriod);
    const twelfths = complete ? 12 : countAcquisitionTwelfths(periodStart, effectiveTermination);
    const proportionalEntitlement = complete ? fullEntitlement : round2((fullEntitlement / 12) * twelfths);
    const periodStartIso = toISO(periodStart);
    const periodEndIso = toISO(periodEnd);
    const concessionDeadline = addYears(periodEnd, 1);

    const periodRecords = normalizedRecords.filter((record) => record.inferredStart === periodStartIso);
    const confirmedRecord = periodRecords.some((record) => record.origin === 'confirmado');
    const inferredRecord = periodRecords.some((record) => record.origin === 'inferido');
    const sourceIds = periodRecords.map((record) => record.id).filter(Boolean);

    const effectiveRecords = periodRecords.filter((record) => {
      if (!record.periodoGozoInicio) return false;
      const gozoStart = parseLocalDate(record.periodoGozoInicio);
      const status = String(record.status || '').toLowerCase();
      return gozoStart <= actualTermination && !status.includes('cancel');
    });

    const usedFromRecords = effectiveRecords.reduce((sum, record) => sum + Math.max(0, Number(record.diasFerias) || 0), 0);
    const abonoFromRecords = effectiveRecords.reduce((sum, record) => sum + Math.max(0, Number(record.diasAbono) || 0), 0);
    const manual = overrides.find((item) => item.periodoInicio === periodStartIso && String(item.motivo || '').trim());
    const daysUsed = manual?.diasUtilizadosManual !== undefined
      ? clamp(Number(manual.diasUtilizadosManual) || 0, 0, proportionalEntitlement)
      : clamp(usedFromRecords, 0, proportionalEntitlement);
    const soldDays = manual?.diasAbonoManual !== undefined
      ? clamp(Number(manual.diasAbonoManual) || 0, 0, proportionalEntitlement)
      : clamp(abonoFromRecords, 0, proportionalEntitlement);
    const manuallySettled = Boolean(manual?.quitadoManualmente);
    const remaining = manuallySettled ? 0 : round2(Math.max(0, proportionalEntitlement - daysUsed - soldDays));

    let situation: SituacaoFerias;
    if (remaining <= 0) situation = 'Quitado';
    else if (!complete) situation = 'Férias proporcionais';
    else if (effectiveTermination > concessionDeadline) situation = 'Férias vencidas';
    else if (daysUsed + soldDays > 0) situation = 'Parcialmente usufruído';
    else situation = 'Em aberto';

    const proportionalAllowed = complete || allowProportional;
    const payableDays = proportionalAllowed ? remaining : 0;
    const normalBase = round2((remuneration / 30) * payableDays);
    const doublePay = situation === 'Férias vencidas';
    const vacationValue = round2(normalBase * (doublePay ? 2 : 1));
    const third = round2(vacationValue / 3);
    const doubleAdditional = doublePay ? normalBase : 0;
    const noHistoricalEvidence = complete && periodRecords.length === 0;
    const review = inferredRecord || noHistoricalEvidence || Boolean(manual);

    periods.push({
      periodoAquisitivoInicio: periodStartIso,
      periodoAquisitivoFim: periodEndIso,
      dataLimiteConcessiva: toISO(concessionDeadline),
      situacao: proportionalAllowed ? situation : 'Quitado',
      origemPeriodo: confirmedRecord ? 'confirmado' : inferredRecord ? 'inferido' : 'calculado',
      diasDireito: round2(proportionalEntitlement),
      diasJaUtilizados: round2(daysUsed),
      diasAbono: round2(soldDays),
      saldoDias: round2(payableDays),
      avos: complete ? null : twelfths,
      remuneracaoBase: round2(remuneration),
      valorBaseSemDobro: normalBase,
      valorFerias: vacationValue,
      tercoConstitucional: third,
      adicionalDobro: round2(doubleAdditional),
      totalPeriodo: round2(vacationValue + third),
      faltasConsideradas: absencesInPeriod,
      registrosFonte: sourceIds,
      revisaoNecessaria: review,
      observacao: manuallySettled
        ? 'Período marcado como quitado manualmente; conferir motivo na auditoria.'
        : inferredRecord
          ? 'Período aquisitivo inferido a partir da admissão e da data de gozo; conferir histórico.'
          : noHistoricalEvidence
            ? 'Não há registro de gozo/abono deste período no histórico atual; revisar antes de concluir.'
            : '',
      alteradoManualmente: Boolean(manual),
      motivoAlteracaoManual: manual?.motivo,
    });

    if (!complete) break;
    periodStart = addYears(periodStart, 1);
  }

  return periods;
};

export const calcularRescisao = (i: RescisaoInput): RescisaoResultado => {
  const admission = parseLocalDate(i.dataAdmissao);
  const dismissal = parseLocalDate(i.dataDesligamento);
  const salarioBase = Math.max(0, Number(i.salarioBase) || 0);
  const mediaHorasExtras = Math.max(0, Number(i.mediaHorasExtras) || 0);
  const mediaComissao = Math.max(0, Number(i.mediaComissao) || 0);
  const adicionaisMedia = Math.max(0, Number(i.adicionaisMedia) || 0);
  const baseRemuneracao = round2(salarioBase + mediaHorasExtras + mediaComissao + adicionaisMedia);
  const dependentes = Math.max(0, Math.floor(Number(i.dependentes) || 0));
  const overrides = i.overrides || [];
  const detailed = (i.descontos || []).map((item) => ({ ...item, valor: round2(Math.max(0, Number(item.valor) || 0)) }));
  if ((Number(i.outrosDescontos) || 0) > 0 && !detailed.some((item) => item.id === 'legado-outros')) {
    detailed.push({
      id: 'legado-outros',
      tipo: 'outros',
      descricao: 'Outros descontos (legado)',
      valor: round2(Number(i.outrosDescontos) || 0),
      observacao: 'Valor migrado do campo genérico antigo.',
    });
  }

  const years = completedYears(admission, dismissal);
  const proportionalNoticeDays = Math.min(90, 30 + years * 3);
  let daysNotice = 0;
  let noticeAutomatic = 0;
  let noticeDiscount = 0;
  let projectsContract = false;

  if (i.tipo === 'sem_justa_causa' || i.tipo === 'rescisao_indireta') {
    if (i.aviso === 'indenizado') {
      daysNotice = proportionalNoticeDays;
      noticeAutomatic = (baseRemuneracao / 30) * daysNotice;
      projectsContract = true;
    } else if (i.aviso === 'trabalhado') {
      daysNotice = proportionalNoticeDays;
    }
  } else if (i.tipo === 'acordo_mutuo_484a') {
    if (i.aviso === 'indenizado') {
      daysNotice = proportionalNoticeDays;
      noticeAutomatic = ((baseRemuneracao / 30) * daysNotice) / 2;
      projectsContract = true;
    } else if (i.aviso === 'trabalhado') {
      daysNotice = proportionalNoticeDays;
    }
  } else if (i.tipo === 'pedido_demissao') {
    if (i.aviso === 'trabalhado') daysNotice = 30;
    if (i.aviso === 'descontado') {
      daysNotice = 30;
      noticeDiscount = baseRemuneracao;
    }
  }

  const projected = projectsContract ? addDays(dismissal, daysNotice) : new Date(dismissal);
  const divisorSalary = 30;
  const daysSalary = clamp(dismissal.getDate(), 0, 30);
  const salaryBalanceAutomatic = (salarioBase / divisorSalary) * daysSalary;
  const salaryBalanceOverride = getOverride(overrides, 'saldoSalario', salaryBalanceAutomatic);
  const noticeOverride = getOverride(overrides, 'avisoPrevioValor', noticeAutomatic);
  const salaryBalance = salaryBalanceOverride.value;
  const noticeValue = noticeOverride.value;

  const allowProportionalVacation = i.tipo !== 'justa_causa';
  const vacationPeriods = buildVacationPeriods({
    admission,
    effectiveTermination: projected,
    actualTermination: dismissal,
    remuneration: baseRemuneracao,
    records: i.feriasRegistros || [],
    absences: i.faltasMensais || [],
    overrides: i.feriasOverrides || [],
    allowProportional: allowProportionalVacation,
  });

  const fullVacationPeriods = vacationPeriods.filter((period) => period.avos === null && period.situacao !== 'Quitado');
  const proportionalVacationPeriods = vacationPeriods.filter((period) => period.situacao === 'Férias proporcionais');
  const expiredVacationPeriods = fullVacationPeriods.filter((period) => period.situacao === 'Férias vencidas');
  const openVacationPeriods = fullVacationPeriods.filter((period) => period.situacao !== 'Férias vencidas');
  const vacationExpiredValue = round2(expiredVacationPeriods.reduce((sum, period) => sum + period.valorFerias, 0));
  const vacationOpenValue = round2(openVacationPeriods.reduce((sum, period) => sum + period.valorFerias, 0));
  const vacationProportionalValue = round2(proportionalVacationPeriods.reduce((sum, period) => sum + period.valorFerias, 0));
  const vacationDoubleAdditional = round2(expiredVacationPeriods.reduce((sum, period) => sum + period.adicionalDobro, 0));
  const thirdExpired = round2(expiredVacationPeriods.reduce((sum, period) => sum + period.tercoConstitucional, 0));
  const thirdOpen = round2(openVacationPeriods.reduce((sum, period) => sum + period.tercoConstitucional, 0));
  const thirdProportional = round2(proportionalVacationPeriods.reduce((sum, period) => sum + period.tercoConstitucional, 0));
  const totalVacation = round2(vacationExpiredValue + vacationOpenValue + vacationProportionalValue + thirdExpired + thirdOpen + thirdProportional);

  const thirteenthTwelfths = i.tipo === 'justa_causa' ? 0 : countThirteenthTwelfths(admission, projected);
  const thirteenthAutomatic = (baseRemuneracao / 12) * thirteenthTwelfths;
  const thirteenthOverride = getOverride(overrides, 'decimoTerceiroBruto', thirteenthAutomatic);
  const thirteenthGross = thirteenthOverride.value;
  const thirteenthAdvance = round2(detailed.filter((item) => item.tipo === 'adiantamento_13').reduce((sum, item) => sum + item.valor, 0));
  const thirteenthFinal = round2(Math.max(0, thirteenthGross - thirteenthAdvance));

  const inssMonth = calcInss2026(salaryBalance);
  const inssThirteenth = calcInss2026(thirteenthGross);
  const inss = round2(inssMonth + inssThirteenth);
  const irMonth = calcIrrf2026(salaryBalance, inssMonth, dependentes);
  const irThirteenth = calcIrrf2026(thirteenthGross, inssThirteenth, dependentes);
  const irrf = round2(irMonth.imposto + irThirteenth.imposto);

  const fgtsBase = round2(salaryBalance + thirteenthGross + noticeValue);
  const fgtsMonth = round2(fgtsBase * 0.08);
  const fgtsAutomatic = Math.max(0, Number(i.saldoFgtsDepositado) || 0);
  const fgtsOverride = getOverride(overrides, 'fgtsSaldo', fgtsAutomatic);
  const fgtsConsidered = fgtsOverride.value;
  let fgtsPenalty = 0;
  if (i.tipo === 'sem_justa_causa' || i.tipo === 'rescisao_indireta') fgtsPenalty = fgtsConsidered * 0.4;
  else if (i.tipo === 'acordo_mutuo_484a') fgtsPenalty = fgtsConsidered * 0.2;

  const automaticNoticeDiscount: RescisaoDescontoInput | null = noticeDiscount > 0 ? {
    id: 'automatico-aviso-descontado',
    tipo: 'aviso_previo_descontado',
    descricao: 'Aviso-prévio descontado',
    valor: round2(noticeDiscount),
    observacao: 'Calculado automaticamente para pedido de demissão sem cumprimento do aviso.',
    automatico: true,
  } : null;
  const allDiscounts = automaticNoticeDiscount
    ? [...detailed.filter((item) => item.tipo !== 'aviso_previo_descontado'), automaticNoticeDiscount]
    : detailed;
  const detailedDiscountTotal = round2(allDiscounts.reduce((sum, item) => sum + item.valor, 0));

  const totalEarnings = round2(salaryBalance + noticeValue + totalVacation + thirteenthGross);
  const totalDiscounts = round2(inss + irrf + detailedDiscountTotal);
  const net = round2(Math.max(0, totalEarnings - totalDiscounts));

  const manualChanges = [salaryBalanceOverride.override, noticeOverride.override, thirteenthOverride.override, fgtsOverride.override]
    .filter(Boolean) as ManualOverrideInput[];
  if (i.fgtsSaldoEditadoManual && !manualChanges.some((item) => item.campo === 'fgtsSaldo')) {
    manualChanges.push({
      campo: 'fgtsSaldo',
      valorAutomatico: fgtsAutomatic,
      valorManual: fgtsConsidered,
      motivo: i.fgtsSaldoMotivo || 'Saldo de FGTS informado/corrigido manualmente.',
      alteradoPor: i.usuarioCalculo,
      alteradoEm: i.calculadoEm,
    });
  }

  const proportionalVacationTwelfths = proportionalVacationPeriods[0]?.avos || 0;
  const sourceIds = Array.from(new Set(vacationPeriods.flatMap((period) => period.registrosFonte)));

  return {
    dataProjetadaContrato: toISO(projected),
    diasAviso: daysNotice,
    divisorSaldoSalario: divisorSalary,
    diasSaldoSalario: daysSalary,
    saldoSalario: round2(salaryBalance),
    avisoPrevioValor: round2(noticeValue),
    avisoPrevioDesconto: round2(noticeDiscount),
    periodosFerias: vacationPeriods,
    feriasVencidas: vacationExpiredValue,
    feriasEmAberto: vacationOpenValue,
    feriasProporcionais: vacationProportionalValue,
    feriasEmDobroAdicional: vacationDoubleAdditional,
    tercoFeriasVencidas: thirdExpired,
    tercoFeriasEmAberto: thirdOpen,
    tercoFeriasProporcionais: thirdProportional,
    tercoFerias: round2(thirdExpired + thirdOpen + thirdProportional),
    totalFerias: totalVacation,
    decimoTerceiroAvos: thirteenthTwelfths,
    decimoTerceiroBruto: round2(thirteenthGross),
    decimoTerceiroAdiantado: thirteenthAdvance,
    decimoTerceiro: thirteenthFinal,
    mediaHorasExtras: round2(mediaHorasExtras),
    mediaComissao: round2(mediaComissao),
    adicionaisMedia: round2(adicionaisMedia),
    baseRemuneracao,
    inss,
    irrf,
    fgtsMes: fgtsMonth,
    saldoFgtsConsiderado: round2(fgtsConsidered),
    multaFgts: round2(fgtsPenalty),
    descontosDetalhados: allDiscounts,
    outrosDescontos: detailedDiscountTotal,
    totalProventos: totalEarnings,
    totalDescontos: totalDiscounts,
    liquido: net,
    alteracoesManuais: manualChanges,
    revisaoFeriasNecessaria: vacationPeriods.some((period) => period.revisaoNecessaria),
    detalhe: {
      inssMes: inssMonth,
      inss13: inssThirteenth,
      irrfMes: irMonth.imposto,
      irrf13: irThirteenth.imposto,
      reducaoIrrfMes: irMonth.reducao,
      reducaoIrrf13: irThirteenth.reducao,
      baseIrrfMes: irMonth.base,
      baseIrrf13: irThirteenth.base,
      baseFgtsMes: fgtsBase,
      totalComFgtsInformativo: round2(totalEarnings + fgtsPenalty),
      avisoProjetaContrato: projectsContract,
    },
    auditoria: {
      calculadoEm: i.calculadoEm || new Date().toISOString(),
      usuario: i.usuarioCalculo || 'Usuário não identificado',
      salarioBaseUtilizado: round2(salarioBase),
      remuneracaoBaseUtilizada: baseRemuneracao,
      dataDesligamento: i.dataDesligamento,
      tipoRescisao: i.tipo,
      periodoIdsConsiderados: sourceIds,
      avosFeriasProporcionais: proportionalVacationTwelfths,
      avosDecimoTerceiro: thirteenthTwelfths,
    },
  };
};

export const tipoRescisaoLabel = (type: TipoRescisao) => ({
  sem_justa_causa: 'Sem justa causa (empregador)',
  pedido_demissao: 'Pedido de demissão',
  acordo_mutuo_484a: 'Acordo mútuo (Art. 484-A)',
  justa_causa: 'Justa causa',
  termino_contrato_experiencia: 'Término de contrato de experiência',
  rescisao_indireta: 'Rescisão indireta',
}[type]);
