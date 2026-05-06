
-- RPC: resolve filtro de empresa para acesso externo (SECURITY DEFINER)
-- Recebe o acessoId e o módulo; valida que o acesso está ativo/liberado
-- e retorna os ids de empresa permitidos com base no nome 'empresa' do registro.
CREATE OR REPLACE FUNCTION public.acesso_externo_filtro_empresa(p_acesso_id uuid, p_modulo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v RECORD;
  v_ids uuid[];
BEGIN
  SELECT * INTO v FROM public.acessos_externos
   WHERE id = p_acesso_id
     AND modulo = p_modulo
     AND status = 'ativo'
     AND acesso_liberado = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  IF COALESCE(v.empresa,'') = '' THEN
    -- Sem empresa definida => retorna nenhuma (bloqueia tudo por segurança)
    RETURN jsonb_build_object(
      'ok', true,
      'empresa', '',
      'filial', COALESCE(v.filial,''),
      'empresa_ids', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_ids
    FROM public.empresas
   WHERE lower(trim(nome)) = lower(trim(v.empresa));

  RETURN jsonb_build_object(
    'ok', true,
    'empresa', v.empresa,
    'filial', COALESCE(v.filial,''),
    'funcionario_id', v.funcionario_id,
    'empresa_ids', to_jsonb(v_ids)
  );
END;
$$;

-- Permitir execução pelos roles anon e authenticated (acesso externo é anônimo)
GRANT EXECUTE ON FUNCTION public.acesso_externo_filtro_empresa(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acesso_externo_obter(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acesso_externo_validar_pin(text, text) TO anon, authenticated;
