// Tipos auxiliares e helpers para movimento diário e fechamento

export type TipoOcorrencia = 'falta' | 'atraso' | 'he50' | 'he100' | 'adicional' | 'desconto' | 'adiantamento' | 'observacao';

export const TIPOS_OCORRENCIA: { value: TipoOcorrencia; label: string; campoEntry: string; usaQuantidade: boolean; usaValor: boolean }[] = [
  { value: 'falta',         label: 'Falta',          campoEntry: 'faltasDias',         usaQuantidade: true,  usaValor: false },
  { value: 'atraso',        label: 'Atraso (h)',     campoEntry: 'atrasos',            usaQuantidade: true,  usaValor: false },
  { value: 'he50',          label: 'HE 50%',         campoEntry: 'he50',               usaQuantidade: true,  usaValor: false },
  { value: 'he100',         label: 'HE 100%',        campoEntry: 'he100',              usaQuantidade: true,  usaValor: false },
  { value: 'adicional',     label: 'Adicional R$',   campoEntry: 'adicionais',         usaQuantidade: false, usaValor: true  },
  { value: 'desconto',      label: 'Desconto R$',    campoEntry: 'descontosDiversos',  usaQuantidade: false, usaValor: true  },
  { value: 'adiantamento',  label: 'Adiantamento R$',campoEntry: 'adiantamento',       usaQuantidade: false, usaValor: true  },
  { value: 'observacao',    label: 'Observação',     campoEntry: 'observacoes',        usaQuantidade: false, usaValor: false },
];

export interface MovimentoRow {
  id: string;
  company_id: string;
  funcionario_id: string;
  competencia: string;
  data: string;
  tipo: TipoOcorrencia;
  quantidade: number;
  valor: number;
  observacao: string;
  registrado_por_nome: string;
  created_at: string;
}

export interface FechamentoRow {
  id: string;
  company_id: string;
  empresa_nome: string;
  competencia: string;
  status: 'aberto' | 'fechado' | 'reaberto';
  fechado_por_nome: string;
  fechado_em: string | null;
  reaberto_por_nome: string;
  reaberto_em: string | null;
  motivo_reabertura: string;
  total_funcionarios: number;
  total_proventos: number;
  total_descontos: number;
  total_liquido: number;
  observacoes: string;
  created_at: string;
}

/** Consolida o array de movimento em totais por funcionário/tipo. */
export function consolidarMovimento(movimentos: MovimentoRow[]) {
  const porFuncionario = new Map<string, Record<TipoOcorrencia, { quantidade: number; valor: number; observacoes: string[] }>>();
  for (const m of movimentos) {
    if (!porFuncionario.has(m.funcionario_id)) {
      porFuncionario.set(m.funcionario_id, {
        falta: { quantidade: 0, valor: 0, observacoes: [] },
        atraso: { quantidade: 0, valor: 0, observacoes: [] },
        he50: { quantidade: 0, valor: 0, observacoes: [] },
        he100: { quantidade: 0, valor: 0, observacoes: [] },
        adicional: { quantidade: 0, valor: 0, observacoes: [] },
        desconto: { quantidade: 0, valor: 0, observacoes: [] },
        adiantamento: { quantidade: 0, valor: 0, observacoes: [] },
        observacao: { quantidade: 0, valor: 0, observacoes: [] },
      });
    }
    const acc = porFuncionario.get(m.funcionario_id)!;
    acc[m.tipo].quantidade += Number(m.quantidade || 0);
    acc[m.tipo].valor += Number(m.valor || 0);
    if (m.observacao) acc[m.tipo].observacoes.push(m.observacao);
  }
  return porFuncionario;
}
