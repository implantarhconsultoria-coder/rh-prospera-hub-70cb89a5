
-- ============================================================
-- 1) NOVA TABELA: funcionario_modulos (permissões por funcionário)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.funcionario_modulos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  modulo TEXT NOT NULL CHECK (modulo IN ('operacional','financeiro','faturamento','almoxarifado','compras','chamados','abastecimento','ponto','km','documentos','fechamento')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','bloqueado','revogado')),
  observacoes TEXT NOT NULL DEFAULT '',
  ultimo_acesso_em TIMESTAMPTZ,
  total_acessos INTEGER NOT NULL DEFAULT 0,
  autorizado_por UUID,
  autorizado_por_nome TEXT NOT NULL DEFAULT '',
  autorizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, modulo)
);
CREATE INDEX IF NOT EXISTS idx_funcionario_modulos_func ON public.funcionario_modulos(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_funcionario_modulos_modulo ON public.funcionario_modulos(modulo);

ALTER TABLE public.funcionario_modulos ENABLE ROW LEVEL SECURITY;

-- só admin gerencia permissões
CREATE POLICY "admin pode tudo em funcionario_modulos"
  ON public.funcionario_modulos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_funcionario_modulos_touch
  BEFORE UPDATE ON public.funcionario_modulos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 2) acessos_cpf: vincular ao funcionario_id (descontinuar avulso)
-- ============================================================
ALTER TABLE public.acessos_cpf
  ADD COLUMN IF NOT EXISTS funcionario_id UUID REFERENCES public.funcionarios(id) ON DELETE CASCADE;

-- ============================================================
-- 3) Logs: vincular ao funcionario_id quando possível
-- ============================================================
ALTER TABLE public.acesso_cpf_logs
  ADD COLUMN IF NOT EXISTS funcionario_id UUID REFERENCES public.funcionarios(id) ON DELETE SET NULL;

-- ============================================================
-- 4) FUNÇÃO: validar acesso CPF a partir de funcionarios + funcionario_modulos
-- ============================================================
CREATE OR REPLACE FUNCTION public.validar_acesso_cpf(p_token text, p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link RECORD;
  v_func RECORD;
  v_perm RECORD;
  v_empresa_nome TEXT;
  v_cpf_clean TEXT;
BEGIN
  v_cpf_clean := regexp_replace(COALESCE(p_cpf,''), '[^0-9]', '', 'g');
  IF length(v_cpf_clean) <> 11 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_invalido');
  END IF;

  -- 1. Link válido?
  SELECT * INTO v_link FROM public.links_acesso_publico WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'link_invalido');
  END IF;
  IF v_link.status <> 'ativo' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'link_bloqueado');
  END IF;

  -- 2. Funcionário existe na BASE OFICIAL?
  SELECT f.*, e.nome AS empresa_nome
    INTO v_func
  FROM public.funcionarios f
  LEFT JOIN public.empresas e ON e.id = f.company_id
  WHERE regexp_replace(COALESCE(f.cpf,''), '[^0-9]', '', 'g') = v_cpf_clean
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo)
    VALUES (v_cpf_clean, v_link.modulo, v_link.unidade, 'negado', 'cpf_nao_encontrado_funcionarios');
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_nao_encontrado_funcionarios');
  END IF;

  v_empresa_nome := COALESCE(v_func.empresa_nome,'');

  -- 3. Funcionário ativo?
  IF lower(COALESCE(v_func.status,'ativo')) NOT IN ('ativo','active') THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
    VALUES (v_cpf_clean, v_link.modulo, v_link.unidade, 'negado', 'funcionario_inativo', v_func.id);
    RETURN jsonb_build_object('ok', false, 'error', 'funcionario_inativo');
  END IF;

  -- 4. Validar empresa/unidade do link
  IF array_length(v_link.empresas_permitidas, 1) IS NOT NULL THEN
    IF NOT (v_empresa_nome = ANY (v_link.empresas_permitidas)) THEN
      INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
      VALUES (v_cpf_clean, v_link.modulo, v_link.unidade, 'negado', 'unidade_incorreta', v_func.id);
      RETURN jsonb_build_object('ok', false, 'error', 'unidade_incorreta');
    END IF;
  END IF;

  -- 5. Permissão de módulo (operacional usa tecnicos_campo, demais usam funcionario_modulos)
  IF v_link.modulo <> 'operacional' THEN
    SELECT * INTO v_perm
      FROM public.funcionario_modulos
     WHERE funcionario_id = v_func.id AND modulo = v_link.modulo
     LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
      VALUES (v_cpf_clean, v_link.modulo, v_link.unidade, 'negado', 'sem_permissao_modulo', v_func.id);
      RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao_modulo');
    END IF;
    IF v_perm.status <> 'ativo' THEN
      INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
      VALUES (v_cpf_clean, v_link.modulo, v_link.unidade, 'negado', 'modulo_bloqueado', v_func.id);
      RETURN jsonb_build_object('ok', false, 'error', 'modulo_bloqueado');
    END IF;
    UPDATE public.funcionario_modulos
       SET ultimo_acesso_em = now(), total_acessos = total_acessos + 1
     WHERE id = v_perm.id;
  END IF;

  -- 6. Atualiza link e log de sucesso
  UPDATE public.links_acesso_publico
     SET ultimo_acesso_em = now(), total_acessos = total_acessos + 1
   WHERE id = v_link.id;
  INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
  VALUES (v_cpf_clean, v_link.modulo, v_link.unidade, 'autorizado', '', v_func.id);

  RETURN jsonb_build_object(
    'ok', true,
    'modulo', v_link.modulo,
    'unidade', v_link.unidade,
    'link_nome', v_link.nome,
    'usuario', jsonb_build_object(
      'funcionario_id', v_func.id,
      'cpf', v_cpf_clean,
      'nome', v_func.nome,
      'empresa', v_empresa_nome,
      'cargo', v_func.cargo,
      'company_id', v_func.company_id
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validar_acesso_cpf(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_acesso_cpf(text,text) TO service_role;

-- ============================================================
-- 5) VIEW pública e segura para o admin listar permissões por funcionário
-- ============================================================
CREATE OR REPLACE VIEW public.vw_funcionario_permissoes AS
SELECT
  f.id           AS funcionario_id,
  f.nome,
  f.cpf,
  f.cargo,
  f.status       AS status_funcionario,
  e.nome         AS empresa,
  fm.modulo,
  fm.status      AS status_modulo,
  fm.ultimo_acesso_em,
  fm.total_acessos,
  fm.autorizado_em,
  fm.autorizado_por_nome
FROM public.funcionarios f
LEFT JOIN public.empresas e          ON e.id = f.company_id
LEFT JOIN public.funcionario_modulos fm ON fm.funcionario_id = f.id;
