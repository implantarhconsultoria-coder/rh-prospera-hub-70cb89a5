ALTER TABLE public.acessos_externos
  ADD COLUMN IF NOT EXISTS email_corporativo text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS ultima_validacao_email_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_acessos_externos_cpf_ativo
  ON public.acessos_externos(cpf_clean)
  WHERE status = 'ativo' AND acesso_liberado = true;

CREATE OR REPLACE FUNCTION public.acessos_externos_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.cpf_clean := regexp_replace(COALESCE(NEW.cpf, ''), '[^0-9]', '', 'g');
  IF length(NEW.cpf_clean) < 4 THEN
    RAISE EXCEPTION 'CPF invalido (minimo 4 digitos)';
  END IF;

  NEW.pin := right(NEW.cpf_clean, 4);
  NEW.status := COALESCE(NEW.status, CASE WHEN COALESCE(NEW.ativo, true) THEN 'ativo' ELSE 'bloqueado' END, 'ativo');
  NEW.acesso_liberado := COALESCE(NEW.acesso_liberado, NEW.ativo, true);
  NEW.email_corporativo := NULLIF(lower(trim(COALESCE(NEW.email_corporativo, ''))), '');
  NEW.telefone := NULLIF(trim(COALESCE(NEW.telefone, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_acessos_externos_normalize ON public.acessos_externos;
CREATE TRIGGER tg_acessos_externos_normalize
BEFORE INSERT OR UPDATE ON public.acessos_externos
FOR EACH ROW EXECUTE FUNCTION public.acessos_externos_normalize();

CREATE OR REPLACE FUNCTION public.acesso_externo_mask_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_local text;
  v_domain text;
BEGIN
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN '';
  END IF;

  v_local := split_part(v_email, '@', 1);
  v_domain := split_part(v_email, '@', 2);

  IF length(v_local) <= 2 THEN
    RETURN left(v_local, 1) || '*' || '@' || v_domain;
  END IF;

  RETURN left(v_local, 1) || repeat('*', greatest(length(v_local) - 2, 1)) || right(v_local, 1) || '@' || v_domain;
END;
$$;

CREATE OR REPLACE FUNCTION public.acesso_externo_completar_cadastro(
  p_cpf text,
  p_nome text,
  p_email text,
  p_telefone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf text;
  v_nome text;
  v_email text;
  v_telefone text;
  v_updated int;
BEGIN
  v_cpf := regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g');
  IF length(v_cpf) <> 11 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_invalido');
  END IF;

  v_nome := trim(COALESCE(p_nome, ''));
  IF length(v_nome) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nome_invalido');
  END IF;

  v_email := lower(trim(COALESCE(p_email, '')));
  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_invalido');
  END IF;

  v_telefone := trim(COALESCE(p_telefone, ''));
  IF length(regexp_replace(v_telefone, '[^0-9]', '', 'g')) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'telefone_invalido');
  END IF;

  UPDATE public.acessos_externos
     SET nome = v_nome,
         email_corporativo = v_email,
         telefone = v_telefone,
         updated_at = now()
   WHERE cpf_clean = v_cpf;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_nao_encontrado');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'cpf_clean', v_cpf,
    'email_corporativo', v_email,
    'telefone', v_telefone
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.acesso_externo_marcar_validacao_email(
  p_cpf text,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf text;
  v_email text;
  v_updated int;
BEGIN
  v_cpf := regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g');
  IF length(v_cpf) <> 11 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_invalido');
  END IF;

  v_email := NULLIF(lower(trim(COALESCE(p_email, ''))), '');

  IF v_email IS NOT NULL THEN
    UPDATE public.acessos_externos
       SET ultima_validacao_email_em = now(),
           updated_at = now()
     WHERE cpf_clean = v_cpf
       AND lower(COALESCE(email_corporativo, '')) = v_email;
  ELSE
    UPDATE public.acessos_externos
       SET ultima_validacao_email_em = now(),
           updated_at = now()
     WHERE cpf_clean = v_cpf;
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registro_nao_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'validado_em', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.acesso_externo_listar_por_cpf(p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf text;
  v_blocked int;
  v_nome text;
  v_email text;
  v_telefone text;
  v_ultima_validacao timestamptz;
  v_precisa_validacao boolean;
  v_result jsonb;
BEGIN
  v_cpf := regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g');
  IF length(v_cpf) <> 11 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_invalido');
  END IF;

  SELECT count(*) INTO v_blocked
    FROM public.acessos_externos
   WHERE cpf_clean = v_cpf
     AND (status = 'bloqueado' OR acesso_liberado = false OR COALESCE(ativo, true) = false);

  SELECT
    max(trim(COALESCE(nome, ''))),
    max(NULLIF(lower(trim(COALESCE(email_corporativo, ''))), '')),
    max(NULLIF(trim(COALESCE(telefone, '')), '')),
    max(ultima_validacao_email_em)
    INTO v_nome, v_email, v_telefone, v_ultima_validacao
    FROM public.acessos_externos
   WHERE cpf_clean = v_cpf
     AND status = 'ativo'
     AND acesso_liberado = true
     AND COALESCE(ativo, true) = true;

  IF COALESCE(v_nome, '') = '' THEN
    IF v_blocked > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'bloqueado');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_nao_encontrado');
  END IF;

  IF v_email IS NULL OR v_telefone IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'cadastro_incompleto',
      'cadastro', jsonb_build_object(
        'cpf_clean', v_cpf,
        'nome', v_nome,
        'email_corporativo', COALESCE(v_email, ''),
        'telefone', COALESCE(v_telefone, '')
      )
    );
  END IF;

  v_precisa_validacao := v_ultima_validacao IS NULL OR v_ultima_validacao < (now() - interval '7 days');
  IF v_precisa_validacao THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'validacao_email_obrigatoria',
      'desafio', jsonb_build_object(
        'cpf_clean', v_cpf,
        'nome', v_nome,
        'email_corporativo', v_email,
        'email_mask', public.acesso_externo_mask_email(v_email),
        'ultima_validacao_email_em', v_ultima_validacao
      )
    );
  END IF;

  WITH acessos AS (
    SELECT id, cpf_clean, nome, empresa, filial, funcao, modulo, perfil_acesso
      FROM public.acessos_externos
     WHERE cpf_clean = v_cpf
       AND status = 'ativo'
       AND acesso_liberado = true
       AND COALESCE(ativo, true) = true
  ), agrupado AS (
    SELECT
      cpf_clean,
      nome,
      max(COALESCE(empresa, '')) AS empresa,
      max(COALESCE(filial, '')) AS filial,
      max(COALESCE(funcao, '')) AS funcao,
      jsonb_agg(jsonb_build_object(
        'acesso_id', id,
        'modulo', modulo,
        'perfil_acesso', perfil_acesso,
        'empresa', COALESCE(empresa, ''),
        'filial', COALESCE(filial, ''),
        'funcao', COALESCE(funcao, '')
      ) ORDER BY modulo) AS portais
    FROM acessos
    GROUP BY cpf_clean, nome
  )
  SELECT jsonb_agg(jsonb_build_object(
      'cpf_clean', cpf_clean,
      'nome', nome,
      'empresa', empresa,
      'filial', filial,
      'funcao', funcao,
      'portais', portais
    ) ORDER BY nome)
    INTO v_result
    FROM agrupado;

  RETURN jsonb_build_object(
    'ok', true,
    'usuarios', COALESCE(v_result, '[]'::jsonb),
    'meta', jsonb_build_object(
      'cpf_clean', v_cpf,
      'nome', v_nome,
      'email_mask', public.acesso_externo_mask_email(v_email),
      'ultima_validacao_email_em', v_ultima_validacao
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.acesso_externo_completar_cadastro(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acesso_externo_marcar_validacao_email(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acesso_externo_listar_por_cpf(text) TO anon, authenticated;
