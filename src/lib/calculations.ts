import type { Employee, MonthlyEntry } from '@/types/database';
import { getInsalubridadeAplicavel, getPericulosidadeAplicavel } from '@/lib/employeeRoleRules';

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const valorHora = (salario: number) => salario / 220;

export const calcHE50 = (salario: number, horas: number) => valorHora(salario) * 1.5 * horas;
export const calcHE100 = (salario: number, horas: number) => valorHora(salario) * 2 * horas;
export const calcFalta = (salario: number, dias: number) => (salario / 30) * dias;
export const calcAtraso = (salario: number, horas: number) => valorHora(salario) * horas;
export const calcAdiantamento = (salario: number, pct: number = 40) => salario * (pct / 100);

export const getComissaoPercentual = (company?: { codigo?: string; name?: string; city?: string; nome?: string; cidade?: string } | null) => {
  const text = `${company?.codigo || ''} ${company?.name || company?.nome || ''} ${company?.city || company?.cidade || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return text.includes('topac-gyn') || text.includes('gyn') || text.includes('goian') ? 0.02 : 0.01;
};

/**
 * INSS 2026 progressive table for empregado/domestico/avulso.
 */
export const calcINSS = (baseINSS: number): number => {
  if (baseINSS <= 0) return 0;
  const faixas = [
    { teto: 1621.00, aliq: 0.075 },
    { teto: 2902.84, aliq: 0.09 },
    { teto: 4354.27, aliq: 0.12 },
    { teto: 8475.55, aliq: 0.14 },
  ];
  let inss = 0;
  let anterior = 0;
  const base = Math.min(baseINSS, faixas[faixas.length - 1].teto);
  for (const f of faixas) {
    if (base <= f.teto) {
      inss += Math.max(0, base - anterior) * f.aliq;
      break;
    }
    if (base > f.teto) {
      inss += (f.teto - anterior) * f.aliq;
      anterior = f.teto;
    }
  }
  return round2(inss);
};

/**
 * IRRF 2026 monthly table.
 * baseIR is normally taxable remuneration after INSS; rendimentoTributavel
 * applies the 2026 monthly reduction rule.
 */
export const calcIRRF = (baseIR: number, dependentes: number = 0, rendimentoTributavel?: number): number => {
  const dedDep = dependentes * 189.59;
  const base = baseIR - dedDep;
  if (base <= 2428.80) return 0;
  const faixas = [
    { teto: 2826.65, aliq: 0.075, ded: 182.16 },
    { teto: 3751.05, aliq: 0.15, ded: 394.16 },
    { teto: 4664.68, aliq: 0.225, ded: 675.49 },
    { teto: Infinity, aliq: 0.275, ded: 908.73 },
  ];
  let imposto = 0;
  for (const f of faixas) {
    if (base <= f.teto) {
      imposto = Math.max(0, base * f.aliq - f.ded);
      break;
    }
  }

  const rendimento = Math.max(0, rendimentoTributavel ?? baseIR);
  let reducao = 0;
  if (rendimento <= 5000) {
    reducao = imposto;
  } else if (rendimento <= 7350) {
    reducao = Math.max(0, 978.62 - (0.133145 * rendimento));
  }

  return round2(Math.max(0, imposto - reducao));
};

/**
 * FGTS: 8% sobre remuneração bruta
 */
export const calcFGTS = (baseFGTS: number): number => {
  return round2(baseFGTS * 0.08);
};

/**
 * Desconto VT: 6% do salário base (quando vtAtivo)
 */
export const calcDescontoVT = (salarioBase: number): number => {
  return Math.round(salarioBase * 0.06 * 100) / 100;
};

/**
 * DSR sobre horas extras: (total HE / dias úteis do mês) * domingos e feriados
 * Fórmula simplificada: totalHE / diasUteis * (diasNoMes - diasUteis)
 */
export const calcDSR = (totalHE: number, diasUteis: number, competencia?: string) => {
  if (diasUteis <= 0) return 0;
  // dias no mês
  let diasNoMes = 30;
  if (competencia) {
    const [y, m] = competencia.split('-').map(Number);
    diasNoMes = new Date(y, m, 0).getDate();
  }
  const diasDescanso = diasNoMes - diasUteis;
  return round2((totalHE / diasUteis) * diasDescanso);
};

/**
 * Calculate VR discount for absences: each falta day removes one VR daily value.
 */
export const calcDescontoVRFaltas = (vrDiario: number, faltasDias: number) => vrDiario * faltasDias;

/**
 * Calculate VT discount for absences: proportional per day (vtDiario / diasUteis * faltasDias).
 */
export const calcDescontoVTFaltas = (vtDiario: number, diasUteis: number, faltasDias: number) => {
  if (diasUteis <= 0) return 0;
  return (vtDiario / diasUteis) * faltasDias;
};

type PayrollOptions = {
  diasUteis: number;
  comissaoPct: number;
  domingosFeriados?: number;
  dependentes?: number;
};

export type PayrollBreakdown = {
  valorHora: number;
  he50Val: number;
  he100Val: number;
  totalHE: number;
  dsrHE: number;
  insVal: number;
  periculosidadeVal: number;
  comissaoBase: number;
  comissaoPct: number;
  comissaoVal: number;
  dsrComissao: number;
  faltaVal: number;
  atrasoVal: number;
  adicionais: number;
  proventos: number;
  bruto: number;
  baseINSS: number;
  inss: number;
  baseFGTS: number;
  irrf: number;
  baseIRRF: number;
  fgts: number;
  fgtsInformativo: number;
  adiantamento: number;
  descontosDiversos: number;
  descontosLegais: number;
  descontosOperacionais: number;
  liquido: number;
  pendencias: string[];
};

const calcDomingosFeriados = (competencia: string, diasUteis: number) => {
  const [y, m] = competencia.split('-').map(Number);
  const diasNoMes = new Date(y, m, 0).getDate();
  return Math.max(0, diasNoMes - diasUteis);
};

export const calcPayrollBreakdown = (
  emp: Employee,
  entry: MonthlyEntry,
  opts: PayrollOptions,
): PayrollBreakdown => {
  const diasUteis = Math.max(0, opts.diasUteis || 0);
  const domingosFeriados = opts.domingosFeriados ?? calcDomingosFeriados(entry.competencia, diasUteis);
  const adiantamentoPadrao = Math.round(calcAdiantamento(emp.salarioBase) * 100) / 100;
  const adiantamento = (entry.adiantamento ?? adiantamentoPadrao) > 0
    ? (entry.adiantamento ?? adiantamentoPadrao)
    : adiantamentoPadrao;

  const insVal = getInsalubridadeAplicavel(emp, entry);
  const periculosidadeVal = getPericulosidadeAplicavel(emp);
  const valorHora = (emp.salarioBase + insVal + periculosidadeVal) / 220;
  const he50Val = round2(valorHora * 1.5 * (entry.he50 || 0));
  const he100Val = round2(valorHora * 2 * (entry.he100 || 0));
  const totalHE = round2(he50Val + he100Val);
  const dsrHE = diasUteis > 0 ? round2((totalHE / diasUteis) * domingosFeriados) : 0;
  const comissaoBase = entry.comissaoBase || 0;
  const comissaoPct = opts.comissaoPct || 0;
  const comissaoVal = round2(comissaoBase * comissaoPct);
  const dsrComissao = diasUteis > 0 && comissaoVal > 0
    ? round2((comissaoVal / diasUteis) * domingosFeriados)
    : 0;
  const faltaVal = round2(calcFalta(emp.salarioBase, entry.faltasDias || 0));
  const atrasoVal = round2(calcAtraso(emp.salarioBase, entry.atrasos || 0));
  const adicionais = round2(entry.adicionais || 0);
  const descontosDiversos = round2(entry.descontosDiversos || 0);
  const proventos = round2(emp.salarioBase + insVal + periculosidadeVal + he50Val + he100Val + dsrHE + comissaoVal + dsrComissao + adicionais);
  const descontosOperacionais = round2(faltaVal + atrasoVal);
  const bruto = round2(Math.max(0, proventos - descontosOperacionais));
  const baseINSS = bruto;
  const inss = calcINSS(baseINSS);
  const baseIRRF = round2(Math.max(0, baseINSS - inss));
  const irrf = calcIRRF(baseIRRF, opts.dependentes || 0, baseINSS);
  const baseFGTS = bruto;
  const fgts = calcFGTS(baseFGTS);
  const descontosLegais = round2(inss + irrf);
  const liquido = round2(bruto - descontosLegais - adiantamento - descontosDiversos);
  const pendencias = [
    emp.salarioBase > 0 ? '' : 'salario',
    diasUteis > 0 ? '' : 'dias_uteis',
  ].filter(Boolean);

  return {
    valorHora: round2(valorHora),
    he50Val,
    he100Val,
    totalHE,
    dsrHE,
    insVal,
    periculosidadeVal,
    comissaoBase,
    comissaoPct,
    comissaoVal,
    dsrComissao,
    faltaVal,
    atrasoVal,
    adicionais,
    proventos,
    bruto,
    baseINSS,
    inss,
    baseFGTS,
    irrf,
    baseIRRF,
    fgts,
    fgtsInformativo: fgts,
    adiantamento: round2(adiantamento),
    descontosDiversos,
    descontosLegais,
    descontosOperacionais,
    liquido,
    pendencias,
  };
};

export const calcTotalFuncionario = (emp: Employee, entry: MonthlyEntry, diasUteis: number = 22) => {
  const insVal = getInsalubridadeAplicavel(emp, entry);
  const periculosidadeVal = getPericulosidadeAplicavel(emp);
  const baseHora = emp.salarioBase + insVal + periculosidadeVal;
  const he50Val = calcHE50(baseHora, entry.he50);
  const he100Val = calcHE100(baseHora, entry.he100);
  const totalHE = he50Val + he100Val;
  const dsrHE = calcDSR(totalHE, diasUteis, entry.competencia);

  const proventos = emp.salarioBase
    + he50Val
    + he100Val
    + dsrHE
    + entry.adicionais
    + insVal
    + periculosidadeVal;

  // VR: use entry vrDias (auto or manual), discount faltas
  const vrDiasEfetivos = Math.max(0, (entry.vrDias ?? diasUteis) - entry.faltasDias);
  const vrVal = entry.vrAplicado && emp.vrAtivo ? emp.vrDiario * vrDiasEfetivos : 0;

  // VA: fixed monthly
  const vaVal = entry.vaAplicado && emp.vaAtivo ? emp.vaMensal : 0;

  // VT: benefício, sem desconto automático
  const vtVal = entry.vtAplicado && emp.vtAtivo ? emp.vtDiario * Math.max(0, diasUteis - entry.faltasDias) : 0;

  const beneficios = vrVal + vaVal + vtVal;

  const descontos = calcFalta(emp.salarioBase, entry.faltasDias)
    + calcAtraso(emp.salarioBase, entry.atrasos)
    + entry.descontosDiversos
    + (entry.adiantamento || 0);

  return {
    proventos,
    beneficios,
    descontos,
    liquido: proventos + beneficios - descontos,
    vrVal,
    vaVal,
    vtVal,
    vrDiasEfetivos,
    he50Val,
    he100Val,
    dsrHE,
    insVal,
    periculosidadeVal,
  };
};

export const feriasStatus = (dataAdmissao: string) => {
  if (!dataAdmissao) return { status: 'em dia' as const, periodoAtual: 0, mesesNoPeriodo: 0 };
  const adm = new Date(dataAdmissao);
  const hoje = new Date();
  const diffMs = hoje.getTime() - adm.getTime();
  const diffMeses = diffMs / (1000 * 60 * 60 * 24 * 30.44);
  const periodoAtual = Math.floor(diffMeses / 12);
  const mesesNoPeriodo = diffMeses % 12;

  if (mesesNoPeriodo > 11) return { status: 'vencido' as const, periodoAtual, mesesNoPeriodo: Math.round(mesesNoPeriodo) };
  if (mesesNoPeriodo > 9) return { status: 'atenção' as const, periodoAtual, mesesNoPeriodo: Math.round(mesesNoPeriodo) };
  return { status: 'em dia' as const, periodoAtual, mesesNoPeriodo: Math.round(mesesNoPeriodo) };
};

export const asoStatus = (dataExame: string) => {
  if (!dataExame) return { status: 'ok' as const, proximoASO: new Date(), diasRestantes: 0 };
  const exame = new Date(dataExame);
  const hoje = new Date();
  const proximo = new Date(exame);
  proximo.setFullYear(proximo.getFullYear() + 1);
  const diffDias = (proximo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDias < 0) return { status: 'vencido' as const, proximoASO: proximo, diasRestantes: Math.round(diffDias) };
  if (diffDias < 60) return { status: 'próximo' as const, proximoASO: proximo, diasRestantes: Math.round(diffDias) };
  return { status: 'ok' as const, proximoASO: proximo, diasRestantes: Math.round(diffDias) };
};

export const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatDate = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
};
