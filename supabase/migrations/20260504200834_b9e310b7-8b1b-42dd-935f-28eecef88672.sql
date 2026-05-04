
-- 1) Limpeza total dos links existentes e dos CPFs liberados
DELETE FROM public.acessos_cpf;
DELETE FROM public.links_acesso_publico;

-- 2) Criar os 3 links únicos por região
INSERT INTO public.links_acesso_publico (slug, nome, modulo, unidade, empresas_permitidas, token, status)
VALUES
  ('sp', 'Acesso SP',           'regiao', 'SP',           ARRAY['TOPAC MATRIZ','ALQUI OBRAS','LMT']::text[], encode(gen_random_bytes(18),'hex'), 'ativo'),
  ('pg', 'Acesso Praia Grande', 'regiao', 'Praia Grande', ARRAY['TOPAC FILIAL PRAIA GRANDE']::text[],         encode(gen_random_bytes(18),'hex'), 'ativo'),
  ('go', 'Acesso Goiânia',      'regiao', 'Goiânia',      ARRAY['TOPAC FILIAL GOIÂNIA']::text[],              encode(gen_random_bytes(18),'hex'), 'ativo');

-- 3) Reescrever validar_acesso_cpf_slug suportando os 3 slugs regionais.
-- Para sp/pg/go: identifica o funcionário pelo CPF, valida bloqueios,
-- e devolve { ok:true, slug:<regiao>, unidade, modulos:[ {modulo, label, destino} ] } com a lista
-- de módulos liberados em funcionario_modulos. O frontend escolhe o destino.
CREATE OR REPLACE FUNCTION public.validar_acesso_cpf_slug(p_slug text, p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_func RECORD;
  v_cpf_clean TEXT;
  v_slug TEXT;
  v_unidade TEXT;
  v_acesso_status TEXT;
  v_modulos JSONB;
  v_count INT;
  v_first JSONB;
  v_tec_token TEXT;
  v_tec_id UUID;
BEGIN
  v_cpf_clean := regexp_replace(COALESCE(p_cpf,''), '[^0-9]', '', 'g');
  v_slug := lower(trim(COALESCE(p_slug, '')));

  IF length(v_cpf_clean) <> 11 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_invalido');
  END IF;

  v_unidade := CASE v_slug
    WHEN 'sp' THEN 'SP'
    WHEN 'pg' THEN 'Praia Grande'
    WHEN 'go' THEN 'Goiânia'
    ELSE NULL
  END;

  IF v_unidade IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'link_invalido');
  END IF;

  -- Funcionário
  SELECT f.*, e.nome AS empresa_nome
    INTO v_func
  FROM public.funcionarios f
  LEFT JOIN public.empresas e ON e.id = f.company_id
  WHERE regexp_replace(COALESCE(f.cpf,''), '[^0-9]', '', 'g') = v_cpf_clean
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo)
    VALUES (v_cpf_clean, v_slug, v_unidade, 'negado', 'cpf_nao_encontrado');
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_nao_encontrado');
  END IF;

  IF COALESCE(v_func.acesso_cpf_liberado, true) = false THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
    VALUES (v_cpf_clean, v_slug, v_unidade, 'negado', 'acesso_bloqueado_admin', v_func.id);
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_bloqueado_admin');
  END IF;

  v_acesso_status := lower(trim(COALESCE(v_func.acesso_status, v_func.status, 'ativo')));
  IF v_acesso_status IN ('desligado','bloqueado','inativo','ferias','férias') THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
    VALUES (v_cpf_clean, v_slug, v_unidade, 'negado', 'acesso_bloqueado', v_func.id);
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_bloqueado', 'status', v_acesso_status);
  END IF;

  -- Lista de módulos liberados
  SELECT jsonb_agg(
           jsonb_build_object('modulo', fm.modulo, 'status', fm.status)
           ORDER BY fm.modulo
         ),
         count(*)
    INTO v_modulos, v_count
  FROM public.funcionario_modulos fm
  WHERE fm.funcionario_id = v_func.id
    AND lower(COALESCE(fm.status,'ativo')) <> 'bloqueado';

  IF COALESCE(v_count,0) = 0 THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
    VALUES (v_cpf_clean, v_slug, v_unidade, 'negado', 'sem_permissao_modulo', v_func.id);
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao_modulo');
  END IF;

  -- Token operacional (se houver pelo menos um módulo operacional/mecanicos)
  IF EXISTS (
    SELECT 1 FROM public.funcionario_modulos
    WHERE funcionario_id = v_func.id
      AND modulo IN ('operacional','mecanicos')
      AND lower(COALESCE(status,'ativo')) <> 'bloqueado'
  ) THEN
    SELECT id, access_token INTO v_tec_id, v_tec_token
    FROM public.tecnicos_campo WHERE funcionario_id = v_func.id LIMIT 1;
    IF v_tec_id IS NULL THEN
      v_tec_token := public.gen_tecnico_access_token();
      BEGIN
        INSERT INTO public.tecnicos_campo (funcionario_id, access_token, link_status, link_bloqueado, status)
        VALUES (v_func.id, v_tec_token, 'ativo', false, 'ativo');
      EXCEPTION WHEN OTHERS THEN NULL; END;
    ELSIF COALESCE(v_tec_token,'') = '' THEN
      v_tec_token := public.gen_tecnico_access_token();
      BEGIN
        UPDATE public.tecnicos_campo SET access_token = v_tec_token, link_status='ativo' WHERE id = v_tec_id;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
  VALUES (v_cpf_clean, v_slug, v_unidade, 'autorizado', 'ok', v_func.id);

  RETURN jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'unidade', v_unidade,
    'modulos', v_modulos,
    'tecnico_token', v_tec_token,
    'usuario', jsonb_build_object(
      'funcionario_id', v_func.id,
      'cpf', v_cpf_clean,
      'nome', COALESCE(v_func.nome, ''),
      'empresa', COALESCE(v_func.empresa_nome, ''),
      'cargo', COALESCE(v_func.cargo, ''),
      'setor', COALESCE(v_func.setor, ''),
      'company_id', v_func.company_id
    )
  );
END;
$function$;
