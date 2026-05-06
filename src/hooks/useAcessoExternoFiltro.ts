import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook que detecta se o usuário está num portal de acesso externo (rotas *-ext/:acessoId)
 * e resolve o filtro de empresa via RPC SECURITY DEFINER no servidor.
 *
 * - Em rotas internas/admin: { isExterno: false, empresaIds: null } => sem restrição.
 * - Em rotas externas: { isExterno: true, empresaIds: [...] } => restringe.
 *   Se algo falhar, empresaIds = [] => bloqueia tudo (fail-closed).
 *
 * IMPORTANTE: Não usa localStorage para resolver permissões — apenas o acessoId
 * da URL, validado contra o banco. Sem fallback/mock.
 */
export interface AcessoExternoFiltro {
  isExterno: boolean;
  loading: boolean;
  empresaIds: string[] | null;
  empresaNome: string;
  filialNome: string;
  funcionarioId: string | null;
}

const EXT_ROUTE_RE = /^\/(financeiro|faturamento|almoxarifado|operacional|filial|campo|mecanico)-ext\/([^/]+)/;

export const useAcessoExternoFiltro = (): AcessoExternoFiltro => {
  const location = useLocation();
  const params = useParams<{ acessoId?: string }>();
  const match = location.pathname.match(EXT_ROUTE_RE);
  const isExterno = !!match;
  const modulo = match?.[1] || '';
  const acessoId = params.acessoId || match?.[2] || '';

  const [loading, setLoading] = useState(isExterno);
  const [empresaIds, setEmpresaIds] = useState<string[] | null>(null);
  const [empresaNome, setEmpresaNome] = useState('');
  const [filialNome, setFilialNome] = useState('');
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);

  useEffect(() => {
    if (!isExterno) {
      setLoading(false);
      setEmpresaIds(null);
      setEmpresaNome('');
      setFilialNome('');
      setFuncionarioId(null);
      return;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      if (!acessoId || !modulo) {
        if (!cancel) { setEmpresaIds([]); setLoading(false); }
        return;
      }
      const { data, error } = await supabase.rpc('acesso_externo_filtro_empresa' as any, {
        p_acesso_id: acessoId,
        p_modulo: modulo,
      });
      if (cancel) return;
      if (error || !(data as any)?.ok) {
        // Fail-closed: bloqueia tudo
        setEmpresaIds([]);
        setEmpresaNome('');
        setFilialNome('');
        setFuncionarioId(null);
        setLoading(false);
        return;
      }
      const d = data as any;
      const ids: string[] = Array.isArray(d.empresa_ids) ? d.empresa_ids : [];
      setEmpresaIds(ids);
      setEmpresaNome(d.empresa || '');
      setFilialNome(d.filial || '');
      setFuncionarioId(d.funcionario_id || null);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [isExterno, acessoId, modulo]);

  return { isExterno, loading, empresaIds, empresaNome, filialNome, funcionarioId };
};
