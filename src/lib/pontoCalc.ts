/**
 * Cálculo de fechamento mensal baseado SOMENTE em registros de ponto.
 * Não considera abastecimento, galões, chamados, KM, estoque, ASO, férias
 * ou qualquer outro módulo. Apenas as 4 batidas: entrada, almoço_saida,
 * almoço_volta e saida.
 */

export interface JornadaConfig {
  /** Horas esperadas por dia útil (ex.: 8) */
  horasDia: number;
  /** Minutos de almoço esperados (não contam como jornada) */
  minutosAlmoco: number;
  /** Tolerância de atraso em minutos (não conta como atraso até esse limite) */
  toleranciaMin: number;
  /** Hora padrão de entrada esperada (HH:mm) */
  entradaPadrao: string;
  /** Hora padrão de saída esperada (HH:mm) */
  saidaPadrao: string;
}

export const JORNADA_PADRAO: JornadaConfig = {
  horasDia: 8,
  minutosAlmoco: 60,
  toleranciaMin: 10,
  entradaPadrao: '08:00',
  saidaPadrao: '17:00',
};

/** Configuração por empresa (codigo). Default: JORNADA_PADRAO. */
export const JORNADA_POR_EMPRESA: Record<string, JornadaConfig> = {
  // Pode-se sobrescrever por empresa aqui no futuro:
  // 'topac-matriz': { ...JORNADA_PADRAO, horasDia: 8 },
};

export const getJornada = (empresaCodigo?: string): JornadaConfig => {
  if (empresaCodigo && JORNADA_POR_EMPRESA[empresaCodigo]) {
    return JORNADA_POR_EMPRESA[empresaCodigo];
  }
  return JORNADA_PADRAO;
};

export type TipoBatida = 'entrada' | 'almoco_saida' | 'almoco_volta' | 'almoco_inicio' | 'almoco_fim' | 'saida';

export interface RegistroPonto {
  id: string;
  user_id: string;
  tipo: TipoBatida | string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm:ss
}

export interface DiaPonto {
  data: string;
  entrada?: string;
  almocoSaida?: string;
  almocoVolta?: string;
  saida?: string;
  /** Minutos efetivamente trabalhados nesse dia */
  minutosTrabalhados: number;
  /** Minutos esperados (= horasDia*60 se útil; 0 se domingo/sábado) */
  minutosEsperados: number;
  /** Minutos de atraso na entrada (acima da tolerância) */
  atrasoMin: number;
  /** Inconsistências detectadas (faltam batidas, ordem errada etc.) */
  inconsistencias: string[];
  /** Esse dia é útil (seg-sex)? */
  diaUtil: boolean;
  /** Não houve nenhuma batida e era dia útil */
  faltou: boolean;
}

export interface ResumoColaborador {
  userId: string;
  diasUteis: number;
  diasTrabalhados: number;
  faltas: number;
  atrasoTotalMin: number;
  horasNormaisMin: number;
  horasExtrasMin: number;
  horasFaltantesMin: number;
  jornadaCumpridaMin: number;
  jornadaEsperadaMin: number;
  saldoMin: number;
  diasSemRegistro: number;
  inconsistencias: number;
  dias: DiaPonto[];
}

const parseHHMM = (hora: string): number => {
  // Aceita HH:mm ou HH:mm:ss
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + (m || 0);
};

const isDiaUtil = (dataISO: string): boolean => {
  const d = new Date(dataISO + 'T12:00:00');
  const dow = d.getDay(); // 0=dom 6=sab
  return dow >= 1 && dow <= 5;
};

const listarDiasDoMes = (competencia: string): string[] => {
  const [y, m] = competencia.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
};

/**
 * Agrupa registros do mês por dia e calcula minutos trabalhados,
 * atrasos, inconsistências.
 */
export const calcularResumoColaborador = (
  userId: string,
  registros: RegistroPonto[],
  competencia: string,
  jornada: JornadaConfig = JORNADA_PADRAO,
): ResumoColaborador => {
  const minutosEsperadosDia = jornada.horasDia * 60;
  const entradaEsperadaMin = parseHHMM(jornada.entradaPadrao);

  // Agrupa por data
  const porData = new Map<string, RegistroPonto[]>();
  for (const r of registros) {
    if (!porData.has(r.data)) porData.set(r.data, []);
    porData.get(r.data)!.push(r);
  }

  const dias: DiaPonto[] = listarDiasDoMes(competencia).map((data) => {
    const util = isDiaUtil(data);
    const regs = porData.get(data) || [];
    const get = (...tipos: string[]) => regs.find((r) => tipos.includes(r.tipo))?.hora;

    const entrada = get('entrada');
    const almocoSaida = get('almoco_saida', 'almoco_inicio');
    const almocoVolta = get('almoco_volta', 'almoco_fim');
    const saida = get('saida');

    const inconsistencias: string[] = [];
    let minutosTrabalhados = 0;
    let atrasoMin = 0;

    if (regs.length === 0) {
      // Sem batidas — falta se for dia útil
      return {
        data,
        minutosTrabalhados: 0,
        minutosEsperados: util ? minutosEsperadosDia : 0,
        atrasoMin: 0,
        inconsistencias: [],
        diaUtil: util,
        faltou: util,
      };
    }

    if (!entrada) inconsistencias.push('sem entrada');
    if (!saida) inconsistencias.push('sem saída');
    if ((almocoSaida && !almocoVolta) || (!almocoSaida && almocoVolta)) {
      inconsistencias.push('almoço incompleto');
    }

    // Cálculo de minutos trabalhados quando temos entrada+saída
    if (entrada && saida) {
      const ent = parseHHMM(entrada);
      const sai = parseHHMM(saida);
      let total = sai - ent;
      if (almocoSaida && almocoVolta) {
        const as = parseHHMM(almocoSaida);
        const av = parseHHMM(almocoVolta);
        const intervalo = Math.max(0, av - as);
        total -= intervalo;
      } else {
        // Sem batidas de almoço: descontar o almoço padrão
        total -= jornada.minutosAlmoco;
      }
      minutosTrabalhados = Math.max(0, total);

      // Atraso: entrada acima da padrão + tolerância
      if (util) {
        const limite = entradaEsperadaMin + jornada.toleranciaMin;
        if (ent > limite) atrasoMin = ent - entradaEsperadaMin;
      }
    } else {
      // Batidas insuficientes — não dá pra calcular jornada
      inconsistencias.push('batidas insuficientes');
    }

    return {
      data,
      entrada,
      almocoSaida,
      almocoVolta,
      saida,
      minutosTrabalhados,
      minutosEsperados: util ? minutosEsperadosDia : 0,
      atrasoMin,
      inconsistencias,
      diaUtil: util,
      faltou: false,
    };
  });

  // Consolida totais
  let diasUteis = 0;
  let diasTrabalhados = 0;
  let faltas = 0;
  let atrasoTotalMin = 0;
  let horasNormaisMin = 0;
  let horasExtrasMin = 0;
  let horasFaltantesMin = 0;
  let jornadaCumpridaMin = 0;
  let jornadaEsperadaMin = 0;
  let diasSemRegistro = 0;
  let inconsistenciasCount = 0;

  for (const d of dias) {
    if (d.diaUtil) {
      diasUteis += 1;
      jornadaEsperadaMin += d.minutosEsperados;
    }
    if (d.faltou) {
      faltas += 1;
      diasSemRegistro += 1;
      horasFaltantesMin += d.minutosEsperados;
      continue;
    }
    if (d.minutosTrabalhados > 0) {
      diasTrabalhados += 1;
      jornadaCumpridaMin += d.minutosTrabalhados;
      const normais = Math.min(d.minutosTrabalhados, d.minutosEsperados || d.minutosTrabalhados);
      horasNormaisMin += normais;
      const extras = Math.max(0, d.minutosTrabalhados - (d.minutosEsperados || d.minutosTrabalhados));
      horasExtrasMin += extras;
      if (d.diaUtil && d.minutosTrabalhados < d.minutosEsperados) {
        horasFaltantesMin += d.minutosEsperados - d.minutosTrabalhados;
      }
    }
    atrasoTotalMin += d.atrasoMin;
    if (d.inconsistencias.length > 0) inconsistenciasCount += 1;
  }

  const saldoMin = jornadaCumpridaMin - jornadaEsperadaMin;

  return {
    userId,
    diasUteis,
    diasTrabalhados,
    faltas,
    atrasoTotalMin,
    horasNormaisMin,
    horasExtrasMin,
    horasFaltantesMin,
    jornadaCumpridaMin,
    jornadaEsperadaMin,
    saldoMin,
    diasSemRegistro,
    inconsistencias: inconsistenciasCount,
    dias,
  };
};

/** Formata minutos como HH:mm (suporta negativos) */
export const formatarMinutos = (min: number): string => {
  const sinal = min < 0 ? '-' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sinal}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
