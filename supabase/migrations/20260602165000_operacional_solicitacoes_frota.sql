CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.operacional_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('galao','manutencao_veiculo')),
  status text NOT NULL DEFAULT 'pendente',
  acesso_externo_id uuid,
  funcionario_id uuid,
  solicitante_nome text NOT NULL DEFAULT '',
  empresa text NOT NULL DEFAULT '',
  filial text DEFAULT '',
  ativo_id uuid REFERENCES public.ativos(id) ON DELETE SET NULL,
  veiculo_descricao text DEFAULT '',
  placa text DEFAULT '',
  patrimonio text DEFAULT '',
  km numeric(12,1),
  combustivel_tipo text DEFAULT '',
  quantidade numeric(12,2),
  finalidade text DEFAULT '',
  manutencao_tipo text DEFAULT '',
  descricao text DEFAULT '',
  urgencia text DEFAULT 'normal',
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_url text DEFAULT '',
  pdf_nome text DEFAULT '',
  autorizado_por uuid,
  autorizado_por_nome text DEFAULT '',
  autorizado_em timestamptz,
  data_agendada date,
  hora_agendada time,
  oficina text DEFAULT '',
  observacao_admin text DEFAULT '',
  diretor_status text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_operacional_solicitacoes_tipo_status ON public.operacional_solicitacoes(tipo, status);
CREATE INDEX IF NOT EXISTS idx_operacional_solicitacoes_acesso ON public.operacional_solicitacoes(acesso_externo_id);
CREATE INDEX IF NOT EXISTS idx_operacional_solicitacoes_ativo ON public.operacional_solicitacoes(ativo_id);
CREATE INDEX IF NOT EXISTS idx_operacional_solicitacoes_created ON public.operacional_solicitacoes(created_at DESC);

CREATE TABLE IF NOT EXISTS public.veiculo_agendamentos_externos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid REFERENCES public.operacional_solicitacoes(id) ON DELETE SET NULL,
  ativo_id uuid REFERENCES public.ativos(id) ON DELETE SET NULL,
  veiculo_descricao text DEFAULT '',
  placa text DEFAULT '',
  empresa text DEFAULT '',
  km numeric(12,1),
  tipo_revisao text DEFAULT '',
  concessionaria text DEFAULT '',
  contato_whatsapp text DEFAULT '',
  preferencia_data text DEFAULT '',
  data_confirmada date,
  hora_confirmada time,
  status text NOT NULL DEFAULT 'solicitado',
  mensagem_recebida text DEFAULT '',
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  responsavel_interno text DEFAULT '',
  solicitante_nome text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_veiculo_agendamentos_ativo ON public.veiculo_agendamentos_externos(ativo_id);
CREATE INDEX IF NOT EXISTS idx_veiculo_agendamentos_status ON public.veiculo_agendamentos_externos(status);
CREATE INDEX IF NOT EXISTS idx_veiculo_agendamentos_solicitacao ON public.veiculo_agendamentos_externos(solicitacao_id);

ALTER TABLE public.veiculo_manutencoes
  ADD COLUMN IF NOT EXISTS solicitacao_id uuid REFERENCES public.operacional_solicitacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'registrado',
  ADD COLUMN IF NOT EXISTS urgencia text DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_agendada date,
  ADD COLUMN IF NOT EXISTS oficina text DEFAULT '',
  ADD COLUMN IF NOT EXISTS solicitante_nome text DEFAULT '',
  ADD COLUMN IF NOT EXISTS autorizado_por_nome text DEFAULT '';

ALTER TABLE public.combustivel_galoes
  ADD COLUMN IF NOT EXISTS solicitacao_id uuid REFERENCES public.operacional_solicitacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'registrado',
  ADD COLUMN IF NOT EXISTS autorizado_por uuid,
  ADD COLUMN IF NOT EXISTS autorizado_por_nome text DEFAULT '',
  ADD COLUMN IF NOT EXISTS autorizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS pdf_nome text DEFAULT '',
  ADD COLUMN IF NOT EXISTS entregue_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz;

ALTER TABLE public.operacional_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculo_agendamentos_externos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topac_operacional_solicitacoes_admin_select ON public.operacional_solicitacoes;
CREATE POLICY topac_operacional_solicitacoes_admin_select ON public.operacional_solicitacoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = ANY (ARRAY['admin','diretor_geral','operacional','filial_matriz','filial_praia','filial_goiania','tecnico_campo'])
    )
  );

DROP POLICY IF EXISTS topac_operacional_solicitacoes_admin_write ON public.operacional_solicitacoes;
CREATE POLICY topac_operacional_solicitacoes_admin_write ON public.operacional_solicitacoes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = ANY (ARRAY['admin','operacional'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = ANY (ARRAY['admin','operacional'])
    )
  );

DROP POLICY IF EXISTS topac_veiculo_agendamentos_admin_all ON public.veiculo_agendamentos_externos;
CREATE POLICY topac_veiculo_agendamentos_admin_all ON public.veiculo_agendamentos_externos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = ANY (ARRAY['admin','operacional','filial_matriz','filial_praia','filial_goiania','tecnico_campo'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = ANY (ARRAY['admin','operacional','filial_matriz','filial_praia','filial_goiania','tecnico_campo'])
    )
  );

DROP TRIGGER IF EXISTS tg_operacional_solicitacoes_touch ON public.operacional_solicitacoes;
CREATE TRIGGER tg_operacional_solicitacoes_touch BEFORE UPDATE ON public.operacional_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS tg_veiculo_agendamentos_touch ON public.veiculo_agendamentos_externos;
CREATE TRIGGER tg_veiculo_agendamentos_touch BEFORE UPDATE ON public.veiculo_agendamentos_externos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('operacional-anexos', 'operacional-anexos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS topac_operacional_storage_select ON storage.objects;
CREATE POLICY topac_operacional_storage_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'operacional-anexos');

DROP POLICY IF EXISTS topac_operacional_storage_insert ON storage.objects;
CREATE POLICY topac_operacional_storage_insert ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'operacional-anexos');

DROP POLICY IF EXISTS topac_operacional_storage_update ON storage.objects;
CREATE POLICY topac_operacional_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'operacional-anexos')
  WITH CHECK (bucket_id = 'operacional-anexos');

DROP POLICY IF EXISTS topac_operacional_storage_delete ON storage.objects;
CREATE POLICY topac_operacional_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'operacional-anexos');

CREATE OR REPLACE FUNCTION public.app_mecanico_listar_veiculos(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acesso record;
  v_empresa text;
  v_rows jsonb;
BEGIN
  SELECT * INTO v_acesso
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND modulo = 'mecanico'
    AND status = 'ativo'
    AND COALESCE(acesso_liberado, false) = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_invalido');
  END IF;

  v_empresa := lower(coalesce(v_acesso.empresa, '') || ' ' || coalesce(v_acesso.filial, ''));

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.descricao, x.placa), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT id, descricao, placa, patrimonio, renavam, chassi, ano_fabricacao, ano_modelo, empresa, arquivo_url
    FROM public.ativos a
    WHERE COALESCE(a.tipo, 'veiculo') = 'veiculo'
      AND COALESCE(a.status, 'ativo') <> 'excluido'
      AND (
        v_empresa = ''
        OR lower(coalesce(a.empresa, '')) LIKE '%' || split_part(v_empresa, ' / ', 1) || '%'
        OR lower(coalesce(a.empresa, '')) LIKE '%matriz%'
        OR lower(coalesce(a.empresa, '')) LIKE '%topac%'
      )
    LIMIT 300
  ) x;

  RETURN jsonb_build_object('ok', true, 'veiculos', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_listar_solicitacoes(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acesso record;
  v_rows jsonb;
BEGIN
  SELECT * INTO v_acesso
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND modulo = 'mecanico'
    AND status = 'ativo'
    AND COALESCE(acesso_liberado, false) = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_invalido');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.operacional_solicitacoes s
  WHERE s.acesso_externo_id = p_acesso_id
    AND s.deleted_at IS NULL
  LIMIT 200;

  RETURN jsonb_build_object('ok', true, 'solicitacoes', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_criar_solicitacao_galao(
  p_acesso_id uuid,
  p_combustivel_tipo text,
  p_quantidade numeric,
  p_finalidade text,
  p_anexos jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acesso record;
  v_id uuid;
BEGIN
  SELECT * INTO v_acesso
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND modulo = 'mecanico'
    AND status = 'ativo'
    AND COALESCE(acesso_liberado, false) = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_invalido');
  END IF;

  IF COALESCE(p_quantidade, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'quantidade_invalida');
  END IF;

  INSERT INTO public.operacional_solicitacoes (
    tipo, status, acesso_externo_id, funcionario_id, solicitante_nome, empresa, filial,
    combustivel_tipo, quantidade, finalidade, anexos
  )
  VALUES (
    'galao', 'pendente', p_acesso_id, v_acesso.funcionario_id, COALESCE(v_acesso.nome, ''),
    COALESCE(v_acesso.empresa, ''), COALESCE(v_acesso.filial, ''),
    COALESCE(p_combustivel_tipo, ''), p_quantidade, COALESCE(p_finalidade, ''), COALESCE(p_anexos, '[]'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_criar_solicitacao_manutencao(
  p_acesso_id uuid,
  p_ativo_id uuid,
  p_placa text,
  p_km numeric,
  p_manutencao_tipo text,
  p_descricao text,
  p_urgencia text,
  p_anexos jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acesso record;
  v_veiculo_descricao text := '';
  v_veiculo_placa text := '';
  v_veiculo_patrimonio text := '';
  v_id uuid;
BEGIN
  SELECT * INTO v_acesso
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND modulo = 'mecanico'
    AND status = 'ativo'
    AND COALESCE(acesso_liberado, false) = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_invalido');
  END IF;

  IF p_ativo_id IS NOT NULL THEN
    SELECT
      COALESCE(descricao, ''),
      COALESCE(placa, ''),
      COALESCE(patrimonio, '')
    INTO v_veiculo_descricao, v_veiculo_placa, v_veiculo_patrimonio
    FROM public.ativos
    WHERE id = p_ativo_id
    LIMIT 1;
  END IF;

  IF COALESCE(p_manutencao_tipo, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_obrigatorio');
  END IF;

  INSERT INTO public.operacional_solicitacoes (
    tipo, status, acesso_externo_id, funcionario_id, solicitante_nome, empresa, filial,
    ativo_id, veiculo_descricao, placa, patrimonio, km, manutencao_tipo, descricao, urgencia, anexos
  )
  VALUES (
    'manutencao_veiculo', 'pendente', p_acesso_id, v_acesso.funcionario_id, COALESCE(v_acesso.nome, ''),
    COALESCE(v_acesso.empresa, ''), COALESCE(v_acesso.filial, ''),
    p_ativo_id,
    COALESCE(v_veiculo_descricao, ''),
    COALESCE(NULLIF(p_placa, ''), v_veiculo_placa, ''),
    COALESCE(v_veiculo_patrimonio, ''),
    p_km,
    COALESCE(p_manutencao_tipo, ''),
    COALESCE(p_descricao, ''),
    COALESCE(p_urgencia, 'normal'),
    COALESCE(p_anexos, '[]'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_listar_veiculos(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_listar_solicitacoes(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_criar_solicitacao_galao(uuid, text, numeric, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_criar_solicitacao_manutencao(uuid, uuid, text, numeric, text, text, text, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
