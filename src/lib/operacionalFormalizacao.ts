import { supabase } from '@/integrations/supabase/client';

export type OperationalFormalizationType =
  | 'locacao'
  | 'devolucao'
  | 'ocorrencia_aberta'
  | 'ocorrencia_alterada'
  | 'ocorrencia_cancelada'
  | 'ocorrencia_concluida'
  | 'movimentacao';

export const formalizarOperacaoPorEmail = async (input: {
  type: OperationalFormalizationType;
  id?: string;
  ids?: string[];
}) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada para formalização por e-mail.');

  const response = await fetch('/api/operacional-formalizacao', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'A operação foi registrada, mas o e-mail de formalização não foi enviado.');
  }
  return payload;
};
