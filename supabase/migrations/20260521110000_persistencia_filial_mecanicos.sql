-- TOPAC RH PRO - persistencia real, filial matriz e historico do app mecanico.
-- Idempotente e sem apagar dados.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'filial_matriz';

CREATE OR REPLACE FUNCTION public.get_user_empresas()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'admin') THEN
      ARRAY[
        'TOPAC MATRIZ',
        'TOPAC FILIAL PRAIA GRANDE',
        'TOPAC FILIAL GOIANIA',
        'TOPAC FILIAL GOIÂNIA',
        'ALQUI OBRAS',
        'LMT'
      ]
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'financeiro') THEN
      ARRAY[
        'TOPAC MATRIZ',
        'TOPAC FILIAL PRAIA GRANDE',
        'TOPAC FILIAL GOIANIA',
        'TOPAC FILIAL GOIÂNIA',
        'ALQUI OBRAS',
        'LMT'
      ]
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'filial_matriz') THEN
      ARRAY['TOPAC MATRIZ']
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'filial_praia') THEN
      ARRAY['TOPAC FILIAL PRAIA GRANDE']
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'filial_goiania') THEN
      ARRAY['TOPAC FILIAL GOIANIA', 'TOPAC FILIAL GOIÂNIA']
    ELSE
      ARRAY[]::text[]
  END
$$;

CREATE OR REPLACE FUNCTION public.sync_funcionario_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := NEW.empresa_id;
  END IF;
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := NEW.company_id;
  END IF;
  IF NEW.salario_base IS NULL THEN
    NEW.salario_base := COALESCE(NEW.salario, 0);
  END IF;
  IF NEW.salario IS NULL THEN
    NEW.salario := COALESCE(NEW.salario_base, 0);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL AND NEW.ativo IS NULL THEN
      NEW.status := 'ativo';
      NEW.ativo := true;
    ELSIF NEW.status IS NOT NULL THEN
      NEW.ativo := NEW.status IS DISTINCT FROM 'desligado';
    ELSE
      NEW.status := CASE WHEN COALESCE(NEW.ativo, true) THEN 'ativo' ELSE 'desligado' END;
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.ativo := NEW.status IS DISTINCT FROM 'desligado';
    ELSIF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      NEW.status := CASE WHEN COALESCE(NEW.ativo, true) THEN COALESCE(NULLIF(NEW.status, 'desligado'), 'ativo') ELSE 'desligado' END;
    ELSIF NEW.status IS NULL THEN
      NEW.status := CASE WHEN COALESCE(NEW.ativo, true) THEN 'ativo' ELSE 'desligado' END;
    ELSIF NEW.ativo IS NULL THEN
      NEW.ativo := NEW.status IS DISTINCT FROM 'desligado';
    END IF;
  END IF;

  IF NEW.categoria IS NULL THEN
    NEW.categoria := COALESCE(NEW.setor, 'operacional');
  END IF;
  IF NEW.setor IS NULL THEN
    NEW.setor := COALESCE(NEW.categoria, 'operacional');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_funcionarios_sync_compat ON public.funcionarios;
CREATE TRIGGER tg_funcionarios_sync_compat
BEFORE INSERT OR UPDATE ON public.funcionarios
FOR EACH ROW EXECUTE FUNCTION public.sync_funcionario_compat();

UPDATE public.funcionarios
   SET status = CASE WHEN COALESCE(ativo, true) THEN COALESCE(NULLIF(status, 'desligado'), 'ativo') ELSE 'desligado' END,
       updated_at = now()
 WHERE (ativo = false AND status IS DISTINCT FROM 'desligado')
    OR (ativo IS NULL)
    OR (status IS NULL);

CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON public.funcionarios(status);
CREATE INDEX IF NOT EXISTS idx_funcionarios_ativo ON public.funcionarios(ativo);

ALTER TABLE public.abastecimentos
  ADD COLUMN IF NOT EXISTS excluido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_exclusao text;

CREATE OR REPLACE FUNCTION public.app_mecanico_listar_historico(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_pontos jsonb;
  v_chamados jsonb;
  v_abastecimentos jsonb;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.data DESC, p.hora DESC), '[]'::jsonb)
    INTO v_pontos
    FROM (
      SELECT id, tipo, data, hora, endereco_formatado, latitude, longitude, selfie_url
        FROM public.registros_ponto
       WHERE user_id = COALESCE(v.profile_user_id, v.id)
       ORDER BY data DESC, hora DESC
       LIMIT 50
    ) p;

  IF v.funcionario_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
      INTO v_chamados
      FROM (
        SELECT id, cliente, tipo_servico, status, created_at, concluido_em
          FROM public.chamados
         WHERE colaborador_id = v.funcionario_id
         ORDER BY created_at DESC
         LIMIT 50
      ) c;
  ELSE
    v_chamados := '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.data DESC, a.hora DESC), '[]'::jsonb)
    INTO v_abastecimentos
    FROM (
      SELECT id, data, hora, mecanico_nome, empresa, filial, placa, posto_nome, posto_cnpj,
             combustivel, litros, valor_por_litro, valor, km_atual, status, observacao,
             foto_bomba_url, foto_painel_url
        FROM public.abastecimentos
       WHERE acesso_externo_id = v.id
         AND COALESCE(excluido, false) = false
       ORDER BY data DESC, hora DESC
       LIMIT 100
    ) a;

  RETURN jsonb_build_object(
    'ok', true,
    'pontos', v_pontos,
    'chamados', v_chamados,
    'abastecimentos', v_abastecimentos
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_atualizar_abastecimento(
  p_acesso_id uuid,
  p_abastecimento_id uuid,
  p_valor numeric DEFAULT NULL,
  p_litros numeric DEFAULT NULL,
  p_valor_por_litro numeric DEFAULT NULL,
  p_km_atual numeric DEFAULT NULL,
  p_combustivel text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_id uuid;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  UPDATE public.abastecimentos
     SET valor = COALESCE(p_valor, valor),
         litros = COALESCE(p_litros, litros),
         valor_por_litro = COALESCE(p_valor_por_litro, valor_por_litro),
         km_atual = COALESCE(p_km_atual, km_atual),
         combustivel = COALESCE(NULLIF(p_combustivel, ''), combustivel),
         observacao = COALESCE(p_observacao, observacao),
         preenchimento = 'editado',
         updated_at = now()
   WHERE id = p_abastecimento_id
     AND acesso_externo_id = v.id
     AND COALESCE(excluido, false) = false
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'abastecimento_nao_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_excluir_abastecimento(
  p_acesso_id uuid,
  p_abastecimento_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_id uuid;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  UPDATE public.abastecimentos
     SET excluido = true,
         excluido_em = now(),
         excluido_por = auth.uid(),
         motivo_exclusao = COALESCE(NULLIF(p_motivo, ''), 'Excluido pelo app do mecanico'),
         status = 'cancelado',
         updated_at = now()
   WHERE id = p_abastecimento_id
     AND acesso_externo_id = v.id
     AND COALESCE(excluido, false) = false
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'abastecimento_nao_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_listar_historico(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_atualizar_abastecimento(uuid, uuid, numeric, numeric, numeric, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_excluir_abastecimento(uuid, uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';