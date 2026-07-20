import { calcINSS, calcIRRF, calcFGTS } from './calculations';

export type TipoRescisao =
  | 'sem_justa_causa'
  | 'pedido_demissao'
  | 'acordo_mutuo_484a'
  | 'justa_causa'
  | 'termino_contrato_experiencia'
  | 'rescisao_indireta';

export type AvisoPrevio = 'trabalhado' | 'indenizado' | 'dispensado';

export interface RescisaoInput {
  salarioBase: number;
  dependentes: number;
  dataAdmissao: string;
  dataDesligamento: string;
  tipo: TipoRescisao;
  aviso: AvisoPrevio;
  saldoFgtsDepositado: number;
  outrosDescontos?: number;
  feriasVencidasMeses?: number;
  mediaHorasExtras?: number;
  mediaComissao?: number;
}

export interface RescisaoResultado {
  diasAviso: number;
  saldoSalario: number;
  avisoPrevioValor: number;
  feriasVencidas: number;
  feriasProporcionais: number;
  tercoFerias: number;
  decimoTerceiro: number;
  mediaHorasExtras: number;
  mediaComissao: number;
  baseRemuneracao: number;
  inss: number;
  irrf: number;
  fgtsMes: number;
  multaFgts: number;
  outrosDescontos: number;
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  detalhe: Record<string, number>;
}

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const MS_DIA = 1000 * 60 * 60 * 24;

// Evita o erro de fuso horario do new Date('YYYY-MM-DD'), que em Brasil
// podia transformar dia 21 em dia 20 e reduzir o saldo de salario.
const parseLocalDate = (value: string) => {
  const [ano, mes, dia] = String(value || '').split('-').map(Number);
  if (!ano || !mes || !dia) return new Date();
  return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const completedYears = (start: Date, end: Date) => {
  let years = end.getFullYear() - start.getFullYear();
  const anniversary = new Date(end.getFullYear(), start.getMonth(), start.getDate(), 12);
  if (end < anniversary) years -= 1;
  return Math.max(0, years);
};

const countVacationTwelfths = (admission: Date, reference: Date) => {
  let periodStart = new Date(admission);
  while (true) {
    const next = new Date(periodStart);
    next.setFullYear(next.getFullYear() + 1);
    if (next > reference) break;
    periodStart = next;
  }

  let months =
    (reference.getFullYear() - periodStart.getFullYear()) * 12 +
    (reference.getMonth() - periodStart.getMonth());

  const monthReference = new Date(
    periodStart.getFullYear(),
    periodStart.getMonth() + Math.max(0, months),
    periodStart.getDate(),
    12,
  );

  const fractionDays = Math.floor((reference.getTime() - monthReference.getTime()) / MS_DIA);
  if (fractionDays >= 15) months += 1;

  return Math.min(12, Math.max(0, months));
};

const countThirteenthTwelfths = (admission: Date, reference: Date) => {
  const year = reference.getFullYear();
  const start = admission.getFullYear() === year ? admission : new Date(year, 0, 1, 12);
  if (start > reference) return 0;

  let months = reference.getMonth() - start.getMonth();
  const firstMonthDays = new Date(year, start.getMonth() + 1, 0).getDate() - start.getDate() + 1;
  if (firstMonthDays >= 15) months += 1;

  for (let month = start.getMonth() + 1; month < reference.getMonth(); month += 1) months += 1;
  if (reference.getDate() >= 15 && reference.getMonth() !== start.getMonth()) months += 1;

  return Math.min(12, Math.max(0, months));
};

export const calcularRescisao = (i: RescisaoInput): RescisaoResultado => {
  const adm = parseLocalDate(i.dataAdmissao);
  const desl = parseLocalDate(i.dataDesligamento);
  const salarioBase = Math.max(0, Number(i.salarioBase) || 0);
  const mediaHorasExtras = Math.max(0, Number(i.mediaHorasExtras) || 0);
  const mediaComissao = Math.max(0, Number(i.mediaComissao) || 0);
  const baseRemuneracao = salarioBase + mediaHorasExtras + mediaComissao;
  const valorDiaSalario = salarioBase / 30;
  const valorDiaRemuneracao = baseRemuneracao / 30;
  const dependentes = Math.max(0, Number(i.dependentes) || 0);
  const saldoFgts = Math.max(0, Number(i.saldoFgtsDepositado) || 0);

  const anosCompletos = completedYears(adm, desl);
  const diasAvisoBase = Math.min(90, 30 + anosCompletos * 3);

  let diasAviso = 0;
  let avisoPrevioValor = 0;
  if (i.tipo === 'sem_justa_causa' || i.tipo === 'rescisao_indireta') {
    if (i.aviso === 'indenizado') {
      diasAviso = diasAvisoBase;
      avisoPrevioValor = valorDiaRemuneracao * diasAviso;
    } else if (i.aviso === 'trabalhado') {
      diasAviso = diasAvisoBase;
    }
  } else if (i.tipo === 'acordo_mutuo_484a') {
    if (i.aviso === 'indenizado') {
      diasAviso = diasAvisoBase;
      avisoPrevioValor = (valorDiaRemuneracao * diasAviso) / 2;
    } else if (i.aviso === 'trabalhado') {
      diasAviso = diasAvisoBase;
    }
  }

  const projetada = avisoPrevioValor > 0 ? addDays(desl, diasAviso) : new Date(desl);
  const saldoSalario = valorDiaSalario * Math.min(30, Math.max(0, desl.getDate()));

  const mesesVencidos = Math.max(0, Number(i.feriasVencidasMeses) || 0);
  const feriasVencidas = mesesVencidos >= 12 ? baseRemuneracao : 0;

  const mesesPeriodoFerias = countVacationTwelfths(adm, projetada);
  const feriasProporcionais = i.tipo === 'justa_causa'
    ? 0
    : (baseRemuneracao / 12) * mesesPeriodoFerias;
  const tercoFerias = (feriasVencidas + feriasProporcionais) / 3;

  const mesesAno = countThirteenthTwelfths(adm, projetada);
  const decimoTerceiro = i.tipo === 'justa_causa' ? 0 : (baseRemuneracao / 12) * mesesAno;

  const baseInssMes = saldoSalario;
  const inssMes = calcINSS(baseInssMes);
  const inss13 = calcINSS(decimoTerceiro);
  const inss = inssMes + inss13;

  const irrfMes = calcIRRF(Math.max(0, baseInssMes - inssMes), dependentes, baseInssMes);
  const irrf13 = calcIRRF(Math.max(0, decimoTerceiro - inss13), dependentes, decimoTerceiro);
  const irrf = irrfMes + irrf13;

  const baseFgtsMes = saldoSalario + decimoTerceiro + avisoPrevioValor;
  const fgtsMes = calcFGTS(baseFgtsMes);

  let multaFgts = 0;
  if (i.tipo === 'sem_justa_causa' || i.tipo === 'rescisao_indireta') multaFgts = saldoFgts * 0.4;
  else if (i.tipo === 'acordo_mutuo_484a') multaFgts = saldoFgts * 0.2;

  const outros = Math.max(0, Number(i.outrosDescontos) || 0);

  // A multa de FGTS e informativa/depositada na conta vinculada e nao entra
  // no liquido pago diretamente pela empresa ao funcionario.
  const totalProventos =
    saldoSalario +
    avisoPrevioValor +
    feriasVencidas +
    feriasProporcionais +
    tercoFerias +
    decimoTerceiro;

  const totalDescontos = inss + irrf + outros;
  const liquido = Math.max(0, totalProventos - totalDescontos);

  return {
    diasAviso,
    saldoSalario: round2(saldoSalario),
    avisoPrevioValor: round2(avisoPrevioValor),
    feriasVencidas: round2(feriasVencidas),
    feriasProporcionais: round2(feriasProporcionais),
    tercoFerias: round2(tercoFerias),
    decimoTerceiro: round2(decimoTerceiro),
    mediaHorasExtras: round2(mediaHorasExtras),
    mediaComissao: round2(mediaComissao),
    baseRemuneracao: round2(baseRemuneracao),
    inss: round2(inss),
    irrf: round2(irrf),
    fgtsMes: round2(fgtsMes),
    multaFgts: round2(multaFgts),
    outrosDescontos: round2(outros),
    totalProventos: round2(totalProventos),
    totalDescontos: round2(totalDescontos),
    liquido: round2(liquido),
    detalhe: {
      inssMes: round2(inssMes),
      inss13: round2(inss13),
      irrfMes: round2(irrfMes),
      irrf13: round2(irrf13),
      baseInssMes: round2(baseInssMes),
      baseInss13: round2(decimoTerceiro),
      baseIrrfMes: round2(Math.max(0, baseInssMes - inssMes)),
      baseIrrf13: round2(Math.max(0, decimoTerceiro - inss13)),
      baseFgtsMes: round2(baseFgtsMes),
      mesesPeriodoFerias,
      mesesAno,
      totalComFgtsInformativo: round2(totalProventos + multaFgts),
    },
  };
};

export const tipoRescisaoLabel = (t: TipoRescisao) => ({
  sem_justa_causa: 'Sem justa causa (empregador)',
  pedido_demissao: 'Pedido de demissão',
  acordo_mutuo_484a: 'Acordo mútuo (Art. 484-A)',
  justa_causa: 'Justa causa',
  termino_contrato_experiencia: 'Término de contrato de experiência',
  rescisao_indireta: 'Rescisão indireta',
}[t]);
