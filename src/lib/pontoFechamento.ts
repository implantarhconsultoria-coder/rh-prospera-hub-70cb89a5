/**
 * Cruzamento de Atestados x Cartão de Ponto x Fechamento.
 *
 * Regras solicitadas:
 *  - Tolerância de 15 min na entrada.
 *  - Se houver atestado válido cobrindo um dia ausente, NÃO conta falta nem DSR.
 *    O dia vira "atestado": desconta apenas VR e VT.
 *  - Sem atestado: conta 1 falta + 1 DSR + desconto VR e VT.
 *  - Exceções por nome: cartão em branco não vira falta para Jerri,
 *    mecânicos de rua, Rodrigo de Souza Sabino e Rodrigo Medrado
 *    (mantém horário normal — nenhum impacto no fechamento).
 *  - Marcelo: pode acumular HE 50% nos dias úteis (qualquer minuto além
 *    da jornada padrão é convertido em HE 50%).
 */

import { JORNADA_PADRAO } from '@/lib/pontoCalc';

export const TOLERANCIA_MIN = 15;

/** Nomes (em minúsculo) cujo cartão em branco deve ser IGNORADO por completo. */
export const NOMES_IGNORAR_CARTAO = [
  'jerri',
  'rodrigo de souza sabino',
  'rodrigo medrado',
];

/** Cargos cujo cartão em branco deve ser ignorado (mecânicos de rua). */
export const CARGOS_IGNORAR_CARTAO_VAZIO = [
  'mecânico',
  'mecanico',
  'mecânico de rua',
  'mecanico de rua',
];

/** Funcionário com permissão de HE 50% em dias úteis (abre a empresa). */
export const NOMES_HE50_LIVRE = ['marcelo'];

export interface DiaCartao {
  data: string;            // YYYY-MM-DD
  entrada?: string;        // HH:mm
  almoco_saida?: string;
  almoco_volta?: string;
  saida?: string;
  observacao?: string;     // FALTA, ATESTADO, FERIADO, FOLGA...
  em_branco?: boolean;
}

export interface CartaoPonto {
  funcionario_nome: string;
  cpf?: string;
  matricula?: string;
  competencia?: string;
  dias: DiaCartao[];
  confianca?: number;
}

export interface AtestadoLite {
  funcionario_id?: string;
  funcionario_nome: string;
  data_inicio: string; // YYYY-MM-DD
  data_fim: string;    // YYYY-MM-DD (inclusive)
}

export interface ResultadoCruzamento {
  funcionario_nome: string;
  funcionario_id?: string;
  competencia: string;
  diasUteis: number;
  // contadores que viram updates no lancamento_mensal
  faltasDias: number;        // só faltas reais (sem cobertura)
  diasAtestado: number;      // dias cobertos por atestado (descontam só VR/VT)
  atrasosMinutos: number;    // somados após tolerância
  he50Horas: number;         // horas extras 50% (apenas se permitido)
  he100Horas: number;        // horas extras 100% (domingo/feriado/folga trabalhado)
  dsrPerdido: number;        // 1 DSR por falta sem atestado (informativo p/ relatório)
  dias: Array<{
    data: string;
    classificacao: 'trabalhado' | 'falta' | 'atestado' | 'folga' | 'ignorado';
    minutosTrabalhados: number;
    atrasoMin: number;
    he50Min: number;
    he100Min: number;
    motivo?: string;
  }>;
  ignorado: boolean;         // funcionário todo ignorado pelas regras
  motivoIgnorado?: string;
  warnings: string[];
}

const parseHHMM = (h?: string): number | null => {
  if (!h) return null;
  const [hh, mm] = h.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(hh)) return null;
  return hh * 60 + (mm || 0);
};

const isDiaUtilISO = (iso: string): boolean => {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
};

const norm = (s: string) => (s || '').trim().toLowerCase();

/** Verifica se o nome (ou cargo) cai numa exceção que ignora cartão em branco. */
export const decideIgnorarCartao = (
  nome: string,
  cargo: string,
  diasCartao: DiaCartao[],
): { ignorar: boolean; motivo?: string } => {
  const n = norm(nome);
  const c = norm(cargo);

  // Rodrigo Medrado e Rodrigo de Souza Sabino: cartão SEMPRE ignorado
  if (n.includes('rodrigo medrado')) {
    return { ignorar: true, motivo: 'Rodrigo Medrado: cartão rasgado, lançamento manual.' };
  }
  if (n.includes('rodrigo de souza sabino') || n.includes('rodrigo souza sabino')) {
    return { ignorar: true, motivo: 'Rodrigo de Souza Sabino: horário normal mantido.' };
  }

  // Jerri: cartão em branco → ignorar
  const todosVazios = diasCartao.every((d) => d.em_branco || (!d.entrada && !d.saida && !d.observacao));
  if (n.startsWith('jerri') && todosVazios) {
    return { ignorar: true, motivo: 'Jerri com cartão em branco: horário normal mantido.' };
  }

  // Mecânicos de rua com cartão em branco → ignorar
  if (CARGOS_IGNORAR_CARTAO_VAZIO.some((cg) => c.includes(cg)) && todosVazios) {
    return { ignorar: true, motivo: 'Mecânico de rua com cartão em branco: horário normal mantido.' };
  }

  return { ignorar: false };
};

const cobertoPorAtestado = (dataISO: string, atestados: AtestadoLite[]): boolean => {
  return atestados.some((a) => {
    if (!a.data_inicio) return false;
    const fim = a.data_fim || a.data_inicio;
    return dataISO >= a.data_inicio && dataISO <= fim;
  });
};

/**
 * Calcula minutos trabalhados de um dia respeitando tolerância e regra de almoço.
 */
const calcularMinutosDia = (dia: DiaCartao, jornadaMin: number, almocoPadraoMin: number) => {
  const ent = parseHHMM(dia.entrada);
  const sai = parseHHMM(dia.saida);
  if (ent == null || sai == null || sai <= ent) {
    return { trabalhados: 0, atrasoMin: 0, valido: false };
  }
  let total = sai - ent;
  const aSai = parseHHMM(dia.almoco_saida);
  const aVol = parseHHMM(dia.almoco_volta);
  if (aSai != null && aVol != null && aVol > aSai) {
    total -= aVol - aSai;
  } else {
    total -= almocoPadraoMin;
  }
  return { trabalhados: Math.max(0, total), atrasoMin: 0, valido: true, ent };
};

/**
 * Cruza um cartão de ponto com a lista de atestados do funcionário e devolve
 * o resultado agregado para alimentar o fechamento.
 */
export const cruzarCartaoComAtestados = (
  cartao: CartaoPonto,
  cargo: string,
  atestados: AtestadoLite[],
  competencia: string,
): ResultadoCruzamento => {
  const warnings: string[] = [];
  const ignorar = decideIgnorarCartao(cartao.funcionario_nome, cargo, cartao.dias || []);

  const baseRes: ResultadoCruzamento = {
    funcionario_nome: cartao.funcionario_nome,
    competencia,
    diasUteis: 0,
    faltasDias: 0,
    diasAtestado: 0,
    atrasosMinutos: 0,
    he50Horas: 0,
    he100Horas: 0,
    dsrPerdido: 0,
    dias: [],
    ignorado: ignorar.ignorar,
    motivoIgnorado: ignorar.motivo,
    warnings,
  };

  if (ignorar.ignorar) {
    return baseRes;
  }

  const j = JORNADA_PADRAO;
  const jornadaMin = j.horasDia * 60;
  const entradaPadrao = parseHHMM(j.entradaPadrao) || 8 * 60;
  const podeHE50 = NOMES_HE50_LIVRE.some((n) => norm(cartao.funcionario_nome).includes(n));

  let faltasDias = 0;
  let diasAtestado = 0;
  let atrasosMinutos = 0;
  let he50Min = 0;
  let he100Min = 0;
  let diasUteis = 0;

  for (const dia of cartao.dias || []) {
    if (!dia.data) continue;
    const util = isDiaUtilISO(dia.data);
    if (util) diasUteis += 1;

    const obs = (dia.observacao || '').toUpperCase();
    const isFolga = obs.includes('FOLGA') || obs.includes('DSR') || obs.includes('FERIADO');
    const isFerias = obs.includes('FÉRIAS') || obs.includes('FERIAS');
    const marcaAtestado = obs.includes('ATESTADO');
    const marcaFalta = obs.includes('FALTA');

    if (isFerias) {
      baseRes.dias.push({ data: dia.data, classificacao: 'ignorado', minutosTrabalhados: 0, atrasoMin: 0, he50Min: 0, he100Min: 0, motivo: 'Férias' });
      continue;
    }

    if (isFolga && !dia.entrada && !dia.saida) {
      baseRes.dias.push({ data: dia.data, classificacao: 'folga', minutosTrabalhados: 0, atrasoMin: 0, he50Min: 0, he100Min: 0 });
      continue;
    }

    const semBatidas = !dia.entrada && !dia.saida;

    // Dia ausente
    if (semBatidas || marcaFalta || marcaAtestado) {
      if (!util && !marcaAtestado) {
        // sábado/domingo sem batida = folga normal
        baseRes.dias.push({ data: dia.data, classificacao: 'folga', minutosTrabalhados: 0, atrasoMin: 0, he50Min: 0, he100Min: 0 });
        continue;
      }
      const coberto = marcaAtestado || cobertoPorAtestado(dia.data, atestados);
      if (coberto) {
        diasAtestado += 1;
        baseRes.dias.push({ data: dia.data, classificacao: 'atestado', minutosTrabalhados: 0, atrasoMin: 0, he50Min: 0, he100Min: 0, motivo: 'Coberto por atestado' });
      } else {
        faltasDias += 1;
        baseRes.dias.push({ data: dia.data, classificacao: 'falta', minutosTrabalhados: 0, atrasoMin: 0, he50Min: 0, he100Min: 0 });
      }
      continue;
    }

    // Trabalhou
    const calc = calcularMinutosDia(dia, jornadaMin, j.minutosAlmoco);
    if (!calc.valido) {
      warnings.push(`Dia ${dia.data}: batidas inconsistentes — verifique manualmente`);
      baseRes.dias.push({ data: dia.data, classificacao: 'ignorado', minutosTrabalhados: 0, atrasoMin: 0, he50Min: 0, he100Min: 0, motivo: 'Batidas inválidas' });
      continue;
    }

    // Atraso (somente útil): aplica tolerância 15 min
    let atraso = 0;
    if (util && calc.ent != null) {
      const limite = entradaPadrao + TOLERANCIA_MIN;
      if (calc.ent > limite) atraso = calc.ent - entradaPadrao;
    }
    atrasosMinutos += atraso;

    // HE
    let he50 = 0;
    let he100 = 0;
    if (util) {
      const extra = calc.trabalhados - jornadaMin;
      if (extra > 0 && podeHE50) {
        he50 = extra; // Marcelo: HE 50% liberada
        he50Min += extra;
      }
    } else {
      // sábado/domingo trabalhado → HE 100%
      if (calc.trabalhados > 0) {
        he100 = calc.trabalhados;
        he100Min += calc.trabalhados;
      }
    }

    baseRes.dias.push({
      data: dia.data,
      classificacao: 'trabalhado',
      minutosTrabalhados: calc.trabalhados,
      atrasoMin: atraso,
      he50Min: he50,
      he100Min: he100,
    });
  }

  baseRes.diasUteis = diasUteis;
  baseRes.faltasDias = faltasDias;
  baseRes.diasAtestado = diasAtestado;
  baseRes.atrasosMinutos = atrasosMinutos;
  baseRes.he50Horas = Math.round((he50Min / 60) * 100) / 100;
  baseRes.he100Horas = Math.round((he100Min / 60) * 100) / 100;
  baseRes.dsrPerdido = faltasDias; // 1 DSR por falta sem cobertura

  return baseRes;
};
