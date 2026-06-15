-- Centraliza a liberacao dos portais externos na ficha do funcionario.
-- Nenhum acesso e apagado: modulos retirados ficam bloqueados para preservar historico.

CREATE OR REPLACE FUNCTION public.admin_configurar_acessos_funcionario(
  p_funcionario_id uuid,
  p_modulos text[] DEFAULT ARRAY[]::text[],
  p_ativo boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funcionario public.funcionarios%ROWTYPE;
  v_empresa public.empresas%ROWTYPE;
  v_cpf_clean text;
  v_modulos text[];
  v_modulo text;
  v_perfil text;
  v_filial text;
BEGIN
  IF NOT public._topac_admin_usuario_autorizado() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  SELECT * INTO v_funcionario
    FROM public.funcionarios
   WHERE id = p_funcionario_id;

  IF v_funcionario.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funcionario_nao_encontrado');
  END IF;

  v_cpf_clean := regexp_replace(COALESCE(v_funcionario.cpf, ''), '\D', '', 'g');
  IF length(v_cpf_clean) <> 11 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_invalido');
  END IF;

  SELECT * INTO v_empresa
    FROM public.empresas
   WHERE id = COALESCE(v_funcionario.company_id, v_funcionario.empresa_id);

  v_filial := COALESCE(v_empresa.cidade, '');

  SELECT COALESCE(array_agg(DISTINCT modulo), ARRAY[]::text[])
    INTO v_modulos
    FROM unnest(COALESCE(p_modulos, ARRAY[]::text[])) AS modulo
   WHERE modulo = ANY(ARRAY[
     'filial', 'financeiro', 'faturamento', 'almoxarifado',
     'operacional', 'campo', 'mecanico'
   ]);

  -- Bloqueia tudo quando o funcionario nao esta ativo. Para modulos retirados,
  -- bloqueia somente o que era gerenciado pela ficha, sem excluir historico.
  UPDATE public.acessos_externos
     SET status = 'bloqueado',
         acesso_liberado = false,
         updated_at = now()
   WHERE funcionario_id = p_funcionario_id
     AND (
       p_ativo IS NOT TRUE
       OR modulo = ANY(ARRAY[
         'filial', 'financeiro', 'faturamento', 'almoxarifado',
         'operacional', 'campo', 'mecanico'
       ])
       AND NOT (modulo = ANY(v_modulos))
     );

  IF p_ativo IS TRUE THEN
    FOREACH v_modulo IN ARRAY v_modulos LOOP
      v_perfil := CASE v_modulo
        WHEN 'mecanico' THEN 'mecanico_externo'
        WHEN 'campo' THEN 'tecnico_campo'
        ELSE v_modulo
      END;

      INSERT INTO public.acessos_externos (
        nome, cpf, cpf_clean, pin, email, email_corporativo, telefone,
        empresa, filial, funcao, funcionario_id, perfil_acesso, modulo,
        status, acesso_liberado, ativo, updated_at
      ) VALUES (
        COALESCE(v_funcionario.nome, ''),
        COALESCE(v_funcionario.cpf, ''),
        v_cpf_clean,
        right(v_cpf_clean, 4),
        NULLIF(lower(trim(COALESCE(v_funcionario.email, ''))), ''),
        NULLIF(lower(trim(COALESCE(v_funcionario.email, ''))), ''),
        COALESCE(NULLIF(v_funcionario.telefone, ''), NULLIF(v_funcionario.celular, '')),
        NULLIF(v_empresa.nome, ''),
        NULLIF(v_filial, ''),
        NULLIF(v_funcionario.cargo, ''),
        v_funcionario.id,
        v_perfil,
        v_modulo,
        'ativo',
        true,
        true,
        now()
      )
      ON CONFLICT (cpf_clean, modulo) DO UPDATE
         SET nome = EXCLUDED.nome,
             cpf = EXCLUDED.cpf,
             pin = EXCLUDED.pin,
             email = COALESCE(EXCLUDED.email, acessos_externos.email),
             email_corporativo = COALESCE(EXCLUDED.email_corporativo, acessos_externos.email_corporativo),
             telefone = COALESCE(EXCLUDED.telefone, acessos_externos.telefone),
             empresa = COALESCE(EXCLUDED.empresa, acessos_externos.empresa),
             filial = COALESCE(EXCLUDED.filial, acessos_externos.filial),
             funcao = COALESCE(EXCLUDED.funcao, acessos_externos.funcao),
             funcionario_id = EXCLUDED.funcionario_id,
             perfil_acesso = EXCLUDED.perfil_acesso,
             status = 'ativo',
             acesso_liberado = true,
             ativo = true,
             updated_at = now();
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'funcionario_id', p_funcionario_id,
    'ativo', p_ativo,
    'modulos', to_jsonb(v_modulos)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.topac_bloquear_acessos_funcionario_inativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ativo IS FALSE
     OR lower(COALESCE(NEW.status, '')) IN ('desligado', 'excluido', 'inativo') THEN
    UPDATE public.acessos_externos
       SET status = 'bloqueado',
           acesso_liberado = false,
           updated_at = now()
     WHERE funcionario_id = NEW.id
       AND (status IS DISTINCT FROM 'bloqueado' OR acesso_liberado IS DISTINCT FROM false);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_topac_bloquear_acessos_funcionario_inativo
  ON public.funcionarios;

CREATE TRIGGER trg_topac_bloquear_acessos_funcionario_inativo
AFTER INSERT OR UPDATE OF status, ativo ON public.funcionarios
FOR EACH ROW
EXECUTE FUNCTION public.topac_bloquear_acessos_funcionario_inativo();

REVOKE ALL ON FUNCTION public.admin_configurar_acessos_funcionario(uuid, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_configurar_acessos_funcionario(uuid, text[], boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
