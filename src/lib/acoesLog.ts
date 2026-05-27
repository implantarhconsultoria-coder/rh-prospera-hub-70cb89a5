import { supabase } from '@/integrations/supabase/client';

export interface AcaoLogInput {
  modulo: string;
  entidade: string;
  entidadeId?: string | null;
  acao:
    | 'criou'
    | 'editou'
    | 'excluiu'
    | 'gerou'
    | 'enviou'
    | 'cancelou'
    | 'aprovou'
    | 'reabriu'
    | 'anexou'
    | 'baixou'
    | 'imprimiu'
    | string;
  antes?: unknown;
  depois?: unknown;
  arquivoUrl?: string;
  observacao?: string;
}

interface AtorContext {
  funcionarioId?: string | null;
  funcionarioNome?: string | null;
  cpf?: string | null;
  empresa?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  origem?: 'app' | 'cpf-portal' | 'admin' | string;
}

/** Lê dados do ator em sessão (auth + portal CPF) */
export const obterAtorAtual = async (): Promise<AtorContext> => {
  // Portal CPF (sessionStorage)
  try {
    const raw = sessionStorage.getItem('cpf_session');
    if (raw) {
      const s = JSON.parse(raw);
      const u = s?.usuario || {};
      return {
        funcionarioId: u.funcionario_id || null,
        funcionarioNome: u.nome || null,
        cpf: u.cpf || null,
        empresa: u.empresa || s.unidade || null,
        origem: 'cpf-portal',
      };
    }
  } catch { /* ignore */ }

  // Auth tradicional
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('nome_completo')
      .eq('user_id', user.id)
      .maybeSingle();
    return {
      userId: user.id,
      userEmail: user.email || null,
      funcionarioNome: (prof as any)?.nome_completo || user.email || null,
      origem: 'app',
    };
  }
  return { origem: 'app' };
};

/** Registra ação universal. Nunca lança — só loga em console se falhar. */
export const registrarAcao = async (input: AcaoLogInput, ator?: AtorContext) => {
  try {
    const a = ator ?? (await obterAtorAtual());
    await supabase.from('acoes_log').insert({
      modulo: input.modulo,
      entidade: input.entidade,
      entidade_id: input.entidadeId ?? null,
      acao: input.acao,
      funcionario_id: a.funcionarioId ?? null,
      funcionario_nome: a.funcionarioNome ?? null,
      cpf: a.cpf ?? null,
      empresa: a.empresa ?? null,
      user_id: a.userId ?? null,
      user_email: a.userEmail ?? null,
      origem: a.origem ?? 'app',
      antes: (input.antes ?? null) as any,
      depois: (input.depois ?? null) as any,
      arquivo_url: input.arquivoUrl ?? null,
      observacao: input.observacao ?? null,
    } as any);
  } catch (e) {
    console.warn('[acoesLog] falha ao registrar', e);
  }
};

export interface AcaoLogRow {
  id: string;
  modulo: string;
  entidade: string;
  entidade_id: string | null;
  acao: string;
  funcionario_nome: string | null;
  cpf: string | null;
  empresa: string | null;
  antes: any;
  depois: any;
  arquivo_url: string | null;
  observacao: string | null;
  created_at: string;
}

/** Busca histórico por entidade */
export const buscarHistoricoEntidade = async (
  entidade: string,
  entidadeId: string,
): Promise<AcaoLogRow[]> => {
  const { data, error } = await supabase
    .from('acoes_log')
    .select('*')
    .eq('entidade', entidade)
    .eq('entidade_id', entidadeId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[acoesLog] erro', error);
    return [];
  }
  return (data || []) as any;
};

/** Busca histórico geral por funcionário */
export const buscarHistoricoFuncionarioAcoes = async (
  funcionarioId: string,
  limit = 200,
): Promise<AcaoLogRow[]> => {
  const { data, error } = await supabase
    .from('acoes_log')
    .select('*')
    .eq('funcionario_id', funcionarioId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []) as any;
};
