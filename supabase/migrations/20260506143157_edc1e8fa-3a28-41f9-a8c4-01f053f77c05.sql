-- Tabela unificada de acessos externos
CREATE TABLE IF NOT EXISTS public.acessos_externos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  cpf_clean TEXT NOT NULL,
  pin TEXT NOT NULL,
  empresa TEXT,
  filial TEXT,
  funcao TEXT,
  perfil_acesso TEXT NOT NULL,
  modulo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  acesso_liberado BOOLEAN NOT NULL DEFAULT true,
  funcionario_id UUID REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  profile_user_id UUID,
  observacoes TEXT,
  ultimo_acesso_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT acessos_externos_perfil_chk CHECK (perfil_acesso IN ('mecanico_externo','tecnico_campo','financeiro','rh','almoxarifado','operacional','filial')),
  CONSTRAINT acessos_externos_modulo_chk CHECK (modulo IN ('mecanico','financeiro','rh','almoxarifado','operacional','filial','campo')),
  CONSTRAINT acessos_externos_status_chk CHECK (status IN ('ativo','bloqueado'))
);

CREATE INDEX IF NOT EXISTS idx_acessos_externos_pin_modulo ON public.acessos_externos(pin, modulo) WHERE status='ativo' AND acesso_liberado=true;
CREATE INDEX IF NOT EXISTS idx_acessos_externos_cpf ON public.acessos_externos(cpf_clean);

-- Trigger normalizar cpf+pin
CREATE OR REPLACE FUNCTION public.acessos_externos_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.cpf_clean := regexp_replace(COALESCE(NEW.cpf,''), '[^0-9]', '', 'g');
  IF length(NEW.cpf_clean) < 4 THEN
    RAISE EXCEPTION 'CPF inválido (mínimo 4 dígitos)';
  END IF;
  NEW.pin := right(NEW.cpf_clean, 4);
  NEW.updated_at := now();
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS tg_acessos_externos_normalize ON public.acessos_externos;
CREATE TRIGGER tg_acessos_externos_normalize
BEFORE INSERT OR UPDATE ON public.acessos_externos
FOR EACH ROW EXECUTE FUNCTION public.acessos_externos_normalize();

-- RLS: só admin gerencia
ALTER TABLE public.acessos_externos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage acessos_externos"
ON public.acessos_externos
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RPC pública: valida PIN + módulo (sem auth)
CREATE OR REPLACE FUNCTION public.acesso_externo_validar_pin(p_pin TEXT, p_modulo TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin TEXT;
  v_count INT;
  v_result jsonb;
  v_blocked_count INT;
BEGIN
  v_pin := regexp_replace(COALESCE(p_pin,''), '[^0-9]', '', 'g');
  IF length(v_pin) <> 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_invalido');
  END IF;

  -- Verifica bloqueio
  SELECT COUNT(*) INTO v_blocked_count
    FROM public.acessos_externos
   WHERE pin = v_pin AND modulo = p_modulo AND (status='bloqueado' OR acesso_liberado=false);

  SELECT COUNT(*) INTO v_count
    FROM public.acessos_externos
   WHERE pin = v_pin AND modulo = p_modulo AND status='ativo' AND acesso_liberado=true;

  IF v_count = 0 THEN
    IF v_blocked_count > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'bloqueado');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'pin_nao_encontrado');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'nome', nome,
    'empresa', COALESCE(empresa,''),
    'filial', COALESCE(filial,''),
    'funcao', COALESCE(funcao,''),
    'perfil_acesso', perfil_acesso
  ) ORDER BY nome) INTO v_result
  FROM public.acessos_externos
  WHERE pin = v_pin AND modulo = p_modulo AND status='ativo' AND acesso_liberado=true;

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'usuarios', v_result);
END;
$$;

-- RPC pública: obtém dados de um acesso (após seleção)
CREATE OR REPLACE FUNCTION public.acesso_externo_obter(p_id UUID, p_modulo TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT * INTO v FROM public.acessos_externos
   WHERE id = p_id AND modulo = p_modulo AND status='ativo' AND acesso_liberado=true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_encontrado_ou_bloqueado');
  END IF;

  -- Registra último acesso
  UPDATE public.acessos_externos SET ultimo_acesso_em = now() WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'acesso', jsonb_build_object(
    'id', v.id, 'nome', v.nome,
    'empresa', COALESCE(v.empresa,''),
    'filial', COALESCE(v.filial,''),
    'funcao', COALESCE(v.funcao,''),
    'perfil_acesso', v.perfil_acesso,
    'modulo', v.modulo,
    'funcionario_id', v.funcionario_id
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.acesso_externo_validar_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acesso_externo_obter(UUID, TEXT) TO anon, authenticated;