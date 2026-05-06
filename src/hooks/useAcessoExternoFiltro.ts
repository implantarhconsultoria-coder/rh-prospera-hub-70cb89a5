import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook que detecta se o usuário está num portal de acesso externo (rotas *-ext/:acessoId)
 * e resolve o filtro de empresa (empresa_id) a partir do nome da empresa salvo no acesso.
 *
 * - Em rotas internas (admin/portais autenticados) retorna { isExterno: false, empresaIds: null }
 *   => sem restrição (mantém comportamento original).
 * - Em rotas externas, retorna { isExterno: true, empresaIds: [...] } com os ids de empresa
 *   permitidos. Se a empresa não bate com nenhum cadastro, retorna [] (bloqueia tudo).
 */
export interface AcessoExternoFiltro {
  isExterno: boolean;
  loading: boolean;
  acesso: any | null;
  empresaIds: string[] | null;     // null = sem filtro; [] = nenhuma; [...] = restritos
  empresaNome: string;
  filialNome: string;
}

const EXT_ROUTE_RE = /\/(financeiro|faturamento|almoxarifado|operacional|filial|campo|mecanico)-ext\//;

export const useAcessoExternoFiltro = (): AcessoExternoFiltro => {
  const location = useLocation();
  const isExterno = EXT_ROUTE_RE.test(location.pathname);

  const [loading, setLoading] = useState(isExterno);
  const [acesso, setAcesso] = useState<any | null>(null);
  const [empresaIds, setEmpresaIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!isExterno) {
      setLoading(false);
      setAcesso(null);
      setEmpresaIds(null);
      return;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      let local: any = null;
      try { local = JSON.parse(localStorage.getItem('acesso_externo') || 'null'); } catch { /* ignore */ }
      if (!local) { if (!cancel) { setEmpresaIds([]); setLoading(false); } return; }
      setAcesso(local);

      const nomeEmpresa = (local.empresa || '').trim();
      if (!nomeEmpresa) {
        // Sem empresa definida no acesso => não vê nada (segurança)
        if (!cancel) { setEmpresaIds([]); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from('empresas')
        .select('id, nome')
        .ilike('nome', nomeEmpresa);
      if (cancel) return;
      const ids = (data || []).map((e: any) => e.id);
      setEmpresaIds(ids);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [isExterno, location.pathname]);

  return {
    isExterno,
    loading,
    acesso,
    empresaIds,
    empresaNome: acesso?.empresa || '',
    filialNome: acesso?.filial || '',
  };
};
