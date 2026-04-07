import type { Employee } from '@/data/employees';
import type { MonthlyEntry } from '@/data/entries';

export const valorHora = (salario: number) => salario / 220;

export const calcHE50 = (salario: number, horas: number) => valorHora(salario) * 1.5 * horas;
export const calcHE100 = (salario: number, horas: number) => valorHora(salario) * 2 * horas;
export const calcFalta = (salario: number, dias: number) => (salario / 30) * dias;
export const calcAtraso = (salario: number, horas: number) => valorHora(salario) * horas;
export const calcAdiantamento = (salario: number, pct: number = 40) => salario * (pct / 100);

export const calcTotalFuncionario = (emp: Employee, entry: MonthlyEntry) => {
  const proventos = emp.salarioBase
    + calcHE50(emp.salarioBase, entry.he50)
    + calcHE100(emp.salarioBase, entry.he100)
    + entry.adicionais
    + (entry.insalubridadeAplicada && emp.insalubridadeAtiva ? emp.insalubridadeValor : 0);

  const vrDias = entry.vrDias ?? 22;
  const beneficios =
    (entry.vrAplicado && emp.vrAtivo ? emp.vrDiario * vrDias : 0)
    + (entry.vaAplicado && emp.vaAtivo ? emp.vaMensal : 0)
    + (entry.vtAplicado && emp.vtAtivo ? emp.vtValor : 0);

  const descontos = calcFalta(emp.salarioBase, entry.faltasDias)
    + calcAtraso(emp.salarioBase, entry.atrasos)
    + entry.descontosDiversos
    + (entry.adiantamento || 0)
    + (entry.vtDesconto || 0);

  return { proventos, beneficios, descontos, liquido: proventos + beneficios - descontos };
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
