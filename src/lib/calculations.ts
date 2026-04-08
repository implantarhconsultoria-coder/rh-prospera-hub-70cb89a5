import type { Employee } from '@/data/employees';
import type { MonthlyEntry } from '@/data/entries';

export const valorHora = (salario: number) => salario / 220;

export const calcHE50 = (salario: number, horas: number) => valorHora(salario) * 1.5 * horas;
export const calcHE100 = (salario: number, horas: number) => valorHora(salario) * 2 * horas;
export const calcFalta = (salario: number, dias: number) => (salario / 30) * dias;
export const calcAtraso = (salario: number, horas: number) => valorHora(salario) * horas;
export const calcAdiantamento = (salario: number, pct: number = 40) => salario * (pct / 100);

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
  return (totalHE / diasUteis) * diasDescanso;
};

/**
 * Calculate VR discount for absences: each falta day removes one VR daily value.
 */
export const calcDescontoVRFaltas = (vrDiario: number, faltasDias: number) => vrDiario * faltasDias;

/**
 * Calculate VT discount for absences: proportional per day (vtValor / diasUteis * faltasDias).
 */
export const calcDescontoVTFaltas = (vtValor: number, diasUteis: number, faltasDias: number) => {
  if (diasUteis <= 0) return 0;
  return (vtValor / diasUteis) * faltasDias;
};

export const calcTotalFuncionario = (emp: Employee, entry: MonthlyEntry, diasUteis: number = 22) => {
  const he50Val = calcHE50(emp.salarioBase, entry.he50);
  const he100Val = calcHE100(emp.salarioBase, entry.he100);
  const totalHE = he50Val + he100Val;
  const dsrHE = calcDSR(totalHE, diasUteis, entry.competencia);

  const proventos = emp.salarioBase
    + he50Val
    + he100Val
    + dsrHE
    + entry.adicionais
    + (entry.insalubridadeAplicada && emp.insalubridadeAtiva ? emp.insalubridadeValor : 0);

  // VR: use entry vrDias (auto or manual), discount faltas
  const vrDiasEfetivos = Math.max(0, (entry.vrDias ?? diasUteis) - entry.faltasDias);
  const vrVal = entry.vrAplicado && emp.vrAtivo ? emp.vrDiario * vrDiasEfetivos : 0;

  // VA: fixed monthly
  const vaVal = entry.vaAplicado && emp.vaAtivo ? emp.vaMensal : 0;

  // VT: proportional discount for faltas
  const vtBruto = entry.vtAplicado && emp.vtAtivo ? emp.vtValor : 0;
  const vtDescontoFalta = entry.vtAplicado && emp.vtAtivo
    ? calcDescontoVTFaltas(emp.vtValor, diasUteis, entry.faltasDias)
    : 0;
  const vtVal = Math.max(0, vtBruto - vtDescontoFalta);

  const beneficios = vrVal + vaVal + vtVal;

  const descontos = calcFalta(emp.salarioBase, entry.faltasDias)
    + calcAtraso(emp.salarioBase, entry.atrasos)
    + entry.descontosDiversos
    + (entry.adiantamento || 0)
    + (entry.vtDesconto || 0);

  return {
    proventos,
    beneficios,
    descontos,
    liquido: proventos + beneficios - descontos,
    vrVal,
    vaVal,
    vtVal,
    vtDescontoFalta,
    vrDiasEfetivos,
    he50Val,
    he100Val,
    dsrHE,
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
