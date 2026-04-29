
-- =====================================================
-- TABELA: acessos_cpf
-- Quem pode entrar via link público de cada módulo
-- =====================================================
CREATE TABLE IF NOT EXISTS public.acessos_cpf (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  nome TEXT NOT NULL,
  modulo TEXT NOT NULL CHECK (modulo IN ('operacional','financeiro','faturamento','almoxarifado','compras','chamados')),
  unidade TEXT NOT NULL DEFAULT '',
  empresa TEXT NOT NULL DEFAULT '',
  perfil TEXT NOT NULL DEFAULT 'usuario',
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','bloqueado')),
  observacoes TEXT NOT NULL DEFAULT '',
  ultimo_acesso_em TIMESTAMPTZ,
  total_acessos INTEGER NOT NULL DEFAULT 0,
  criado_por UUID,
  criado_por_nome TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT acessos_cpf_unique UNIQUE (cpf, modulo)
);

CREATE INDEX IF NOT EXISTS idx_acessos_cpf_cpf ON public.acessos_cpf(cpf);
CREATE INDEX IF NOT EXISTS idx_acessos_cpf_modulo ON public.acessos_cpf(modulo);

ALTER TABLE public.acessos_cpf ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage acessos_cpf"
  ON public.acessos_cpf FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_acessos_cpf_updated_at
  BEFORE UPDATE ON public.acessos_cpf
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- TABELA: acesso_cpf_logs (histórico de tentativas)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.acesso_cpf_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  modulo TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT '',
  resultado TEXT NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acesso_cpf_logs_cpf ON public.acesso_cpf_logs(cpf);
CREATE INDEX IF NOT EXISTS idx_acesso_cpf_logs_modulo ON public.acesso_cpf_logs(modulo);

ALTER TABLE public.acesso_cpf_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view acesso_cpf_logs"
  ON public.acesso_cpf_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- =====================================================
-- TABELA: links_acesso_publico (5 links permanentes)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.links_acesso_publico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  modulo TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT '',
  empresas_permitidas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','bloqueado')),
  total_acessos INTEGER NOT NULL DEFAULT 0,
  ultimo_acesso_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.links_acesso_publico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage links_acesso"
  ON public.links_acesso_publico FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_links_acesso_updated_at
  BEFORE UPDATE ON public.links_acesso_publico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- FUNÇÃO: validar_acesso_cpf (chamada pela edge function)
-- Normaliza CPF, valida módulo/unidade, devolve permissão.
-- =====================================================
CREATE OR REPLACE FUNCTION public.validar_acesso_cpf(
  p_token TEXT,
  p_cpf TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link RECORD;
  v_acesso RECORD;
  v_cpf_clean TEXT;
BEGIN
  v_cpf_clean := regexp_replace(COALESCE(p_cpf,''), '[^0-9]', '', 'g');
  IF length(v_cpf_clean) <> 11 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_invalido');
  END IF;

  SELECT * INTO v_link FROM public.links_acesso_publico WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'link_invalido');
  END IF;
  IF v_link.status <> 'ativo' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'link_bloqueado');
  END IF;

  SELECT * INTO v_acesso
  FROM public.acessos_cpf
  WHERE regexp_replace(cpf, '[^0-9]', '', 'g') = v_cpf_clean
    AND modulo = v_link.modulo
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo)
    VALUES (v_cpf_clean, v_link.modulo, v_link.unidade, 'negado', 'cpf_nao_encontrado');
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_nao_encontrado');
  END IF;

  IF v_acesso.status <> 'ativo' THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo)
    VALUES (v_cpf_clean, v_link.modulo, v_link.unidade, 'negado', 'cpf_bloqueado');
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_bloqueado');
  END IF;

  -- Para Operacional, validar unidade/empresa
  IF v_link.modulo = 'operacional' AND array_length(v_link.empresas_permitidas,1) IS NOT NULL THEN
    IF NOT (v_acesso.empresa = ANY (v_link.empresas_permitidas)) THEN
      INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo)
      VALUES (v_cpf_clean, v_link.modulo, v_link.unidade, 'negado', 'unidade_incorreta');
      RETURN jsonb_build_object('ok', false, 'error', 'unidade_incorreta');
    END IF;
  END IF;

  -- Atualiza contadores
  UPDATE public.acessos_cpf
    SET ultimo_acesso_em = now(), total_acessos = total_acessos + 1
    WHERE id = v_acesso.id;
  UPDATE public.links_acesso_publico
    SET ultimo_acesso_em = now(), total_acessos = total_acessos + 1
    WHERE id = v_link.id;
  INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo)
  VALUES (v_cpf_clean, v_link.modulo, v_link.unidade, 'autorizado', '');

  RETURN jsonb_build_object(
    'ok', true,
    'modulo', v_link.modulo,
    'unidade', v_link.unidade,
    'link_nome', v_link.nome,
    'usuario', jsonb_build_object(
      'id', v_acesso.id,
      'cpf', v_cpf_clean,
      'nome', v_acesso.nome,
      'empresa', v_acesso.empresa,
      'perfil', v_acesso.perfil
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validar_acesso_cpf(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_acesso_cpf(TEXT, TEXT) TO service_role;

-- =====================================================
-- Pré-cadastro dos 5 links permanentes
-- =====================================================
INSERT INTO public.links_acesso_publico (slug, nome, modulo, unidade, empresas_permitidas, token)
VALUES
  ('op-sp', 'Link Operacional SP', 'operacional', 'SP',
    ARRAY['TOPAC MATRIZ','ALQUI OBRAS','LMT'],
    public.gen_tecnico_access_token()),
  ('op-pg', 'Link Operacional Praia Grande', 'operacional', 'Praia Grande',
    ARRAY['TOPAC FILIAL PRAIA GRANDE'],
    public.gen_tecnico_access_token()),
  ('op-go', 'Link Operacional Goiânia', 'operacional', 'Goiânia',
    ARRAY['TOPAC FILIAL GOIÂNIA'],
    public.gen_tecnico_access_token()),
  ('financeiro', 'Link Financeiro TOPAC', 'financeiro', '',
    ARRAY[]::TEXT[],
    public.gen_tecnico_access_token()),
  ('faturamento', 'Link Faturamento TOPAC', 'faturamento', '',
    ARRAY[]::TEXT[],
    public.gen_tecnico_access_token())
ON CONFLICT (slug) DO NOTHING;

-- Pré-cadastro de usuários autorizados (CPF vazio - admin completa depois)
INSERT INTO public.acessos_cpf (cpf, nome, modulo, empresa, perfil, status, observacoes)
VALUES
  ('00000000001','Robson','financeiro','TOPAC MATRIZ','financeiro','ativo','CPF placeholder — substituir pelo CPF real'),
  ('00000000002','Paula','financeiro','TOPAC MATRIZ','financeiro','ativo','CPF placeholder — substituir pelo CPF real'),
  ('00000000003','Rafaela','faturamento','TOPAC MATRIZ','faturamento','ativo','CPF placeholder — substituir pelo CPF real'),
  ('00000000004','Kayky','faturamento','TOPAC MATRIZ','faturamento','ativo','CPF placeholder — substituir pelo CPF real'),
  ('00000000005','Douglas','faturamento','TOPAC MATRIZ','faturamento','ativo','CPF placeholder — substituir pelo CPF real'),
  ('00000000006','Antonio Carlos','faturamento','TOPAC MATRIZ','faturamento','ativo','CPF placeholder — substituir pelo CPF real'),
  ('00000000007','Aldenei','faturamento','TOPAC MATRIZ','faturamento','ativo','CPF placeholder — substituir pelo CPF real')
ON CONFLICT (cpf, modulo) DO NOTHING;
