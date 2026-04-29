import { supabase } from '@/integrations/supabase/client';
import { obterAtorAtual } from './acoesLog';

export type NivelAlerta = 'informativo' | 'atencao' | 'critico';

export interface AlertaInput {
  filial: string;
  empresaNome?: string;
  funcionarioId?: string | null;
  funcionarioNome?: string | null;
  cpf?: string | null;
  modulo: string;
  acao: string;
  dadoAnterior?: unknown;
  dadoNovo?: unknown;
  nivel?: NivelAlerta;
  observacao?: string;
}

const detectaNivel = (acao: string): NivelAlerta => {
  const a = acao.toLowerCase();
  if (a.includes('exclu') || a.includes('delet') || a.includes('remov')) return 'critico';
  if (a.includes('salar') || a.includes('cpf') || a.includes('reabre')) return 'critico';
  if (a.includes('alter') || a.includes('edit') || a.includes('corrig')) return 'atencao';
  return 'informativo';
};

export const registrarAlertaFilial = async (input: AlertaInput) => {
  try {
    const ator = await obterAtorAtual();
    await supabase.from('alertas_filial').insert({
      filial: input.filial,
      empresa_nome: input.empresaNome ?? null,
      funcionario_id: input.funcionarioId ?? null,
      funcionario_nome: input.funcionarioNome ?? null,
      cpf: input.cpf ?? null,
      modulo: input.modulo,
      acao: input.acao,
      responsavel_user_id: ator.userId ?? null,
      responsavel_nome: ator.funcionarioNome ?? null,
      responsavel_cpf: ator.cpf ?? null,
      dado_anterior: (input.dadoAnterior ?? null) as any,
      dado_novo: (input.dadoNovo ?? null) as any,
      nivel: input.nivel ?? detectaNivel(input.acao),
      observacao: input.observacao ?? null,
    } as any);
  } catch (e) {
    console.warn('[alertasFilial] falha', e);
  }
};
