-- TOPAC RH PRO - operacao real: estabilidade, usuarios pendentes e QR abastecimento.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  modelo text NOT NULL DEFAULT '',
  identificacao_interna text DEFAULT '',
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.registros_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  hora time NOT NULL DEFAULT CURRENT_TIME,
  latitude double precision,
  longitude double precision,
  endereco_formatado text DEFAULT '',
  selfie_url text,
  dispositivo text,
  registro_teste boolean NOT NULL DEFAULT false,
  veiculo_id uuid REFERENCES public.veiculos(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chamados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente text NOT NULL DEFAULT '',
  local_servico text NOT NULL DEFAULT '',
  tipo_servico text NOT NULL DEFAULT '',
  itens_previstos text DEFAULT '',
  observacoes text DEFAULT '',
  info_adicional text DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  colaborador_id uuid,
  veiculo_id uuid REFERENCES public.veiculos(id),
  latitude double precision,
  longitude double precision,
  aceito_em timestamptz,
  concluido_em timestamptz,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.postos_combustivel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  unidade text,
  tipo_qr text NOT NULL DEFAULT 'posto',
  posto_opcoes text[] NOT NULL DEFAULT ARRAY[]::text[],
  cnpj text,
  endereco text,
  telefone text,
  status text NOT NULL DEFAULT 'ativo',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.abastecimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_codigo text,
  acesso_externo_id uuid REFERENCES public.acessos_externos(id) ON DELETE SET NULL,
  funcionario_id uuid,
  mecanico_nome text NOT NULL,
  empresa text,
  filial text,
  placa text,
  data date NOT NULL DEFAULT CURRENT_DATE,
  hora time NOT NULL DEFAULT CURRENT_TIME,
  competencia text,
  combustivel text,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  litros numeric(12,3) NOT NULL DEFAULT 0,
  valor_por_litro numeric(12,3),
  km_atual numeric(12,1),
  km_rodado numeric,
  posto_nome text,
  posto_cnpj text,
  posto_endereco text,
  posto_id uuid REFERENCES public.postos_combustivel(id),
  posto_codigo text,
  posto_telefone text,
  foto_bomba_url text,
  foto_painel_url text,
  latitude double precision,
  longitude double precision,
  endereco text,
  observacao text,
  status text NOT NULL DEFAULT 'concluido',
  preenchimento text DEFAULT 'qr_posto',
  recibo_texto text,
  recibo_gerado_em timestamptz,
  validado_por text,
  excluido boolean NOT NULL DEFAULT false,
  excluido_em timestamptz,
  excluido_motivo text,
  registro_teste boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.registros_ponto ADD COLUMN IF NOT EXISTS selfie_url text;
ALTER TABLE public.registros_ponto ADD COLUMN IF NOT EXISTS dispositivo text;
ALTER TABLE public.registros_ponto ADD COLUMN IF NOT EXISTS registro_teste boolean NOT NULL DEFAULT false;
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS aceito_em timestamptz;
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS concluido_em timestamptz;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS valor_por_litro numeric(12,3);
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS km_rodado numeric;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS posto_id uuid REFERENCES public.postos_combustivel(id);
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS posto_codigo text;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS posto_telefone text;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS recibo_texto text;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS recibo_gerado_em timestamptz;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS validado_por text;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS excluido boolean NOT NULL DEFAULT false;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS excluido_em timestamptz;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS excluido_motivo text;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS registro_teste boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_postos_combustivel_codigo ON public.postos_combustivel(codigo);
CREATE INDEX IF NOT EXISTS idx_abastecimentos_acesso ON public.abastecimentos(acesso_externo_id);
CREATE INDEX IF NOT EXISTS idx_abastecimentos_posto ON public.abastecimentos(posto_id);
CREATE INDEX IF NOT EXISTS idx_abastecimentos_placa_data ON public.abastecimentos(placa, data DESC, hora DESC);
CREATE INDEX IF NOT EXISTS idx_registros_ponto_user_data ON public.registros_ponto(user_id, data DESC, hora DESC);

ALTER TABLE public.postos_combustivel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abastecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "postos_admin_all" ON public.postos_combustivel;
CREATE POLICY "postos_admin_all" ON public.postos_combustivel
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "postos_auth_read" ON public.postos_combustivel;
CREATE POLICY "postos_auth_read" ON public.postos_combustivel
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "abastecimentos_admin_all" ON public.abastecimentos;
CREATE POLICY "abastecimentos_admin_all" ON public.abastecimentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ponto_admin_read" ON public.registros_ponto;
CREATE POLICY "ponto_admin_read" ON public.registros_ponto
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "chamados_admin_all" ON public.chamados;
CREATE POLICY "chamados_admin_all" ON public.chamados
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operacional'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operacional'));

DROP TRIGGER IF EXISTS tg_postos_touch ON public.postos_combustivel;
CREATE TRIGGER tg_postos_touch BEFORE UPDATE ON public.postos_combustivel
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tg_chamados_touch ON public.chamados;
CREATE TRIGGER tg_chamados_touch BEFORE UPDATE ON public.chamados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tg_abast_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.competencia IS NULL OR NEW.competencia = '' THEN
    NEW.competencia := to_char(COALESCE(NEW.data, CURRENT_DATE), 'YYYY-MM');
  END IF;
  IF COALESCE(NEW.litros, 0) > 0 THEN
    NEW.valor_por_litro := round((COALESCE(NEW.valor, 0) / NEW.litros)::numeric, 3);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_abast_norm ON public.abastecimentos;
CREATE TRIGGER tg_abast_norm BEFORE INSERT OR UPDATE ON public.abastecimentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_abast_normalize();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'abastecimento-fotos') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('abastecimento-fotos', 'abastecimento-fotos', true);
  ELSE
    UPDATE storage.buckets SET public = true WHERE id = 'abastecimento-fotos';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'ponto-selfies') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('ponto-selfies', 'ponto-selfies', true);
  ELSE
    UPDATE storage.buckets SET public = true WHERE id = 'ponto-selfies';
  END IF;
END $$;

DROP POLICY IF EXISTS "Public read abastecimento-fotos" ON storage.objects;
CREATE POLICY "Public read abastecimento-fotos" ON storage.objects
  FOR SELECT USING (bucket_id = 'abastecimento-fotos');

DROP POLICY IF EXISTS "Anyone upload abastecimento-fotos" ON storage.objects;
CREATE POLICY "Anyone upload abastecimento-fotos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'abastecimento-fotos');

DROP POLICY IF EXISTS "Public read ponto-selfies" ON storage.objects;
CREATE POLICY "Public read ponto-selfies" ON storage.objects
  FOR SELECT USING (bucket_id = 'ponto-selfies');

DROP POLICY IF EXISTS "Anyone upload ponto-selfies" ON storage.objects;
CREATE POLICY "Anyone upload ponto-selfies" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'ponto-selfies');

INSERT INTO public.postos_combustivel(codigo, nome, unidade, cnpj, endereco, telefone, status, observacao, tipo_qr, posto_opcoes)
VALUES
  ('COMB-SP-001', 'Posto de Servicos Sao Donato LTDA', 'TOPAC MATRIZ', NULL, 'Rua Anhaia, 1092, Bom Retiro, Sao Paulo/SP, CEP 01130-000', NULL, 'ativo', 'QR unico da Matriz. Carro preenchido automaticamente pelo usuario quando houver vinculo.', 'posto', ARRAY[]::text[]),
  ('COMB-PG-001', 'AUTO POSTO XIXOVA LTDA', 'TOPAC PRAIA GRANDE', '46.778.064/0001-19', 'Avenida Ayrton Senna da Silva, 500, Xixova, Praia Grande/SP, CEP 11726-500', NULL, 'ativo', 'QR unico da Praia Grande. App exige selecao do carro.', 'posto', ARRAY[]::text[]),
  ('COMB-GO-000', 'TOPAC GOIANIA - Selecionar posto', 'TOPAC GOIANIA', NULL, 'Goiania/GO', NULL, 'ativo', 'QR unico de Goiania. App abre a selecao dos dois postos.', 'unidade', ARRAY['COMB-GO-001','COMB-GO-002']::text[]),
  ('COMB-GO-001', 'Posto Z + Z Sao Judas Tadeu LTDA', 'TOPAC GOIANIA', '13.759.928/0001-04', 'Avenida Presidente Kenedy, 1675, Quadra 49, Lote 01E, Vila Jardim Sao Judas Tadeu, Goiania/GO, CEP 74685-830', '62 98436-1976', 'ativo', 'Posto Goiania 1. App exige selecao do carro.', 'posto', ARRAY[]::text[]),
  ('COMB-GO-002', 'Auto Posto Indianapolis LTDA', 'TOPAC GOIANIA', '07.517.547/0001-08', 'Av. Perimetral Norte, 7354, Jardim Diamantina, Goiania/GO, CEP 74595-350', '62 3945-0984', 'ativo', 'Posto Goiania 2. App exige selecao do carro.', 'posto', ARRAY[]::text[])
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome,
    unidade = EXCLUDED.unidade,
    cnpj = EXCLUDED.cnpj,
    endereco = EXCLUDED.endereco,
    telefone = EXCLUDED.telefone,
    status = 'ativo',
    observacao = EXCLUDED.observacao,
    tipo_qr = EXCLUDED.tipo_qr,
    posto_opcoes = EXCLUDED.posto_opcoes,
    updated_at = now();

CREATE OR REPLACE FUNCTION public._app_mecanico_get_acesso(p_acesso_id uuid)
RETURNS public.acessos_externos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
BEGIN
  SELECT * INTO v
    FROM public.acessos_externos
   WHERE id = p_acesso_id
     AND modulo = 'mecanico'
     AND status = 'ativo'
     AND acesso_liberado = true
     AND COALESCE(ativo, true) = true
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'acesso_nao_autorizado';
  END IF;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public._app_mecanico_placas_from_obs(p_obs text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text := upper(coalesce(p_obs, ''));
  v_after text;
  v_result text[];
BEGIN
  IF v_text !~* 'CARRO[S]?[[:space:]]+VINCULADO[S]?' THEN
    RETURN ARRAY[]::text[];
  END IF;

  v_after := regexp_replace(v_text, '.*CARRO[S]?[[:space:]]+VINCULADO[S]?[[:space:]]*:', '', 'i');

  SELECT array_agg(placa ORDER BY placa)
    INTO v_result
    FROM (
      SELECT DISTINCT regexp_replace(item, '[^A-Z0-9-]', '', 'g') AS placa
        FROM unnest(regexp_split_to_array(v_after, '[,;/|[:space:]]+')) item
    ) s
   WHERE length(placa) BETWEEN 6 AND 8;

  RETURN coalesce(v_result, ARRAY[]::text[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_validar_acesso(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  UPDATE public.acessos_externos SET ultimo_acesso_em = now(), updated_at = now() WHERE id = v.id;

  RETURN jsonb_build_object('ok', true, 'mecanico', jsonb_build_object(
    'acesso_id', v.id,
    'nome', v.nome,
    'empresa', COALESCE(v.empresa, ''),
    'filial', COALESCE(v.filial, ''),
    'funcao', COALESCE(v.funcao, ''),
    'funcionario_id', v.funcionario_id,
    'perfil_acesso', COALESCE(v.perfil_acesso, '')
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_status_dia(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_user uuid;
  v_count int;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  v_user := COALESCE(v.profile_user_id, v.id);
  SELECT count(*) INTO v_count
    FROM public.registros_ponto
   WHERE user_id = v_user
     AND data = CURRENT_DATE;

  RETURN jsonb_build_object('ok', true, 'batidas_hoje', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_ponto(
  p_acesso_id uuid,
  p_tipo text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_selfie_url text DEFAULT NULL,
  p_dispositivo text DEFAULT NULL
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
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  IF p_tipo NOT IN ('entrada','saida','almoco_inicio','almoco_fim','pausa_inicio','pausa_fim') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  END IF;

  INSERT INTO public.registros_ponto(user_id, tipo, data, hora, latitude, longitude, endereco_formatado, selfie_url, dispositivo)
  VALUES (COALESCE(v.profile_user_id, v.id), p_tipo, CURRENT_DATE, CURRENT_TIME, p_latitude, p_longitude, COALESCE(p_endereco, ''), p_selfie_url, p_dispositivo)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_listar_chamados(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_arr jsonb;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_arr
    FROM public.chamados c
   WHERE c.colaborador_id = v.funcionario_id
     AND c.status <> 'cancelado';

  RETURN jsonb_build_object('ok', true, 'chamados', v_arr);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_atualizar_chamado(
  p_acesso_id uuid,
  p_chamado_id uuid,
  p_acao text,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_count int;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  IF p_acao = 'iniciar' THEN
    UPDATE public.chamados
       SET status = 'em_atendimento', aceito_em = COALESCE(aceito_em, now()),
           observacoes = COALESCE(p_observacao, observacoes), updated_at = now()
     WHERE id = p_chamado_id AND colaborador_id = v.funcionario_id;
  ELSIF p_acao = 'finalizar' THEN
    UPDATE public.chamados
       SET status = 'concluido', concluido_em = now(),
           observacoes = COALESCE(p_observacao, observacoes), updated_at = now()
     WHERE id = p_chamado_id AND colaborador_id = v.funcionario_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'acao_invalida');
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_count > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_validar_qr_posto(p_acesso_id uuid, p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  p public.postos_combustivel;
  v_codigo text;
  v_placas text[];
  v_placa text;
  v_ultimo_km numeric;
  v_unidade text;
  v_empresa text;
  v_exige_selecao_carro boolean;
  v_postos jsonb := '[]'::jsonb;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  v_codigo := upper(trim(coalesce(p_codigo, '')));
  SELECT * INTO p
    FROM public.postos_combustivel
   WHERE upper(trim(codigo)) = v_codigo
     AND deleted_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'qr_nao_encontrado'); END IF;
  IF p.status <> 'ativo' THEN RETURN jsonb_build_object('ok', false, 'error', 'qr_bloqueado'); END IF;

  v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro := v_unidade LIKE '%GOIANIA%' OR v_unidade LIKE '%PRAIA%' OR v_empresa LIKE '%GOIANIA%' OR v_empresa LIKE '%PRAIA%';
  v_placa := CASE WHEN v_exige_selecao_carro THEN NULL ELSE NULLIF(v_placas[1], '') END;

  IF COALESCE(p.tipo_qr, 'posto') = 'unidade' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', px.id, 'codigo', px.codigo, 'nome', px.nome, 'unidade', px.unidade,
        'cnpj', px.cnpj, 'endereco', px.endereco, 'telefone', px.telefone, 'tipo_qr', px.tipo_qr
      ) ORDER BY px.codigo), '[]'::jsonb)
      INTO v_postos
      FROM public.postos_combustivel px
     WHERE px.codigo = ANY(COALESCE(p.posto_opcoes, ARRAY[]::text[]))
       AND px.status = 'ativo'
       AND px.deleted_at IS NULL;
  END IF;

  SELECT a.km_atual INTO v_ultimo_km
    FROM public.abastecimentos a
   WHERE a.placa IS NOT NULL
     AND upper(replace(a.placa, '-', '')) = upper(replace(coalesce(v_placa, v_placas[1], ''), '-', ''))
     AND a.km_atual IS NOT NULL
     AND COALESCE(a.excluido, false) = false
   ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'posto', jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nome', p.nome, 'unidade', p.unidade, 'cnpj', p.cnpj, 'endereco', p.endereco, 'telefone', p.telefone, 'tipo_qr', COALESCE(p.tipo_qr, 'posto')),
    'postos', v_postos,
    'mecanico', jsonb_build_object('nome', v.nome, 'empresa', COALESCE(v.empresa, ''), 'filial', COALESCE(v.filial, ''), 'funcionario_id', v.funcionario_id, 'placa', v_placa, 'carros', COALESCE((SELECT jsonb_agg(x) FROM unnest(v_placas) x), '[]'::jsonb), 'exige_selecao_carro', v_exige_selecao_carro, 'ultimo_km', v_ultimo_km)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_abastecimento_posto(
  p_acesso_id uuid,
  p_posto_codigo text,
  p_valor numeric,
  p_litros numeric,
  p_combustivel text,
  p_km numeric,
  p_placa text DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_foto_bomba_url text DEFAULT NULL,
  p_foto_painel_url text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_endereco text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  p public.postos_combustivel;
  v_id uuid;
  v_placas text[];
  v_placa text;
  v_unidade text;
  v_empresa text;
  v_exige_selecao_carro boolean;
  v_ultimo_km numeric;
  v_preco_litro numeric;
  v_km_rodado numeric;
  v_recibo text;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  IF COALESCE(p_foto_bomba_url, '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'foto_bomba_obrigatoria'); END IF;
  IF COALESCE(p_foto_painel_url, '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'foto_painel_obrigatoria'); END IF;
  IF COALESCE(p_valor, 0) <= 0 OR COALESCE(p_litros, 0) <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'valor_litros_obrigatorios'); END IF;

  SELECT * INTO p
    FROM public.postos_combustivel
   WHERE upper(trim(codigo)) = upper(trim(coalesce(p_posto_codigo, '')))
     AND status = 'ativo'
     AND deleted_at IS NULL
   LIMIT 1;

  IF NOT FOUND OR COALESCE(p.tipo_qr, 'posto') = 'unidade' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'posto_invalido');
  END IF;

  v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro := v_unidade LIKE '%GOIANIA%' OR v_unidade LIKE '%PRAIA%' OR v_empresa LIKE '%GOIANIA%' OR v_empresa LIKE '%PRAIA%';
  v_placa := upper(coalesce(nullif(p_placa, ''), CASE WHEN v_exige_selecao_carro THEN NULL ELSE v_placas[1] END));

  IF coalesce(v_placa, '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'placa_obrigatoria'); END IF;

  SELECT a.km_atual INTO v_ultimo_km
    FROM public.abastecimentos a
   WHERE a.placa IS NOT NULL
     AND upper(replace(a.placa, '-', '')) = upper(replace(coalesce(v_placa, ''), '-', ''))
     AND a.km_atual IS NOT NULL
     AND COALESCE(a.excluido, false) = false
   ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
   LIMIT 1;

  v_preco_litro := round(COALESCE(p_valor, 0) / NULLIF(p_litros, 0), 3);
  v_km_rodado := CASE WHEN p_km IS NOT NULL AND v_ultimo_km IS NOT NULL AND p_km >= v_ultimo_km THEN p_km - v_ultimo_km ELSE NULL END;
  v_recibo := concat_ws(E'\n',
    'TOPAC RH PRO - RECIBO DE ABASTECIMENTO',
    'Funcionario: ' || COALESCE(v.nome, ''),
    'Empresa/Unidade: ' || COALESCE(v.empresa, '') || CASE WHEN COALESCE(v.filial, '') <> '' THEN ' - ' || v.filial ELSE '' END,
    'Veiculo: ' || COALESCE(v_placa, ''),
    'Posto: ' || COALESCE(p.nome, ''),
    'CNPJ: ' || COALESCE(p.cnpj, ''),
    'Endereco: ' || COALESCE(p.endereco, ''),
    'Combustivel: ' || COALESCE(p_combustivel, ''),
    'Litros: ' || COALESCE(p_litros::text, ''),
    'Valor por litro: ' || COALESCE(v_preco_litro::text, ''),
    'Valor total: ' || COALESCE(p_valor::text, ''),
    'KM: ' || COALESCE(p_km::text, ''),
    'Data/Hora: ' || to_char(now(), 'DD/MM/YYYY HH24:MI:SS')
  );

  INSERT INTO public.abastecimentos(
    qr_codigo, acesso_externo_id, funcionario_id, mecanico_nome, empresa, filial, placa,
    data, hora, combustivel, valor, litros, valor_por_litro, km_atual, km_rodado,
    posto_nome, posto_cnpj, posto_endereco, posto_id, posto_codigo, posto_telefone,
    foto_bomba_url, foto_painel_url, latitude, longitude, endereco, observacao,
    status, preenchimento, recibo_texto, recibo_gerado_em, validado_por
  ) VALUES (
    p.codigo, v.id, v.funcionario_id, v.nome, COALESCE(v.empresa, ''), COALESCE(v.filial, ''), NULLIF(v_placa, ''),
    CURRENT_DATE, CURRENT_TIME, NULLIF(p_combustivel, ''), COALESCE(p_valor, 0), COALESCE(p_litros, 0), v_preco_litro, p_km, v_km_rodado,
    p.nome, p.cnpj, p.endereco, p.id, p.codigo, p.telefone,
    p_foto_bomba_url, p_foto_painel_url, p_latitude, p_longitude, p_endereco, NULLIF(p_observacao, ''),
    'concluido', 'qr_posto', v_recibo, now(), v.nome
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'preco_litro', v_preco_litro, 'valor_por_litro', v_preco_litro, 'km_rodado', v_km_rodado, 'recibo_texto', v_recibo);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_listar_historico(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_user uuid;
  v_pontos jsonb;
  v_abast jsonb;
  v_chamados jsonb;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  v_user := COALESCE(v.profile_user_id, v.id);

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.data DESC, p.hora DESC), '[]'::jsonb)
    INTO v_pontos
    FROM (SELECT * FROM public.registros_ponto WHERE user_id = v_user ORDER BY data DESC, hora DESC LIMIT 80) p;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.data DESC, a.hora DESC), '[]'::jsonb)
    INTO v_abast
    FROM (SELECT * FROM public.abastecimentos WHERE acesso_externo_id = v.id AND COALESCE(excluido, false) = false ORDER BY data DESC, hora DESC LIMIT 80) a;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_chamados
    FROM (SELECT * FROM public.chamados WHERE colaborador_id = v.funcionario_id ORDER BY created_at DESC LIMIT 80) c;

  RETURN jsonb_build_object('ok', true, 'pontos', v_pontos, 'abastecimentos', v_abast, 'chamados', v_chamados);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_atualizar_abastecimento(
  p_acesso_id uuid,
  p_abastecimento_id uuid,
  p_valor numeric,
  p_litros numeric,
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
  v_count int;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  UPDATE public.abastecimentos
     SET valor = COALESCE(p_valor, valor),
         litros = COALESCE(p_litros, litros),
         valor_por_litro = COALESCE(p_valor_por_litro, CASE WHEN COALESCE(p_litros, litros, 0) > 0 THEN round((COALESCE(p_valor, valor, 0) / COALESCE(p_litros, litros))::numeric, 3) ELSE valor_por_litro END),
         km_atual = p_km_atual,
         combustivel = COALESCE(NULLIF(p_combustivel, ''), combustivel),
         observacao = p_observacao,
         updated_at = now()
   WHERE id = p_abastecimento_id
     AND acesso_externo_id = v.id
     AND COALESCE(excluido, false) = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_count > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_excluir_abastecimento(
  p_acesso_id uuid,
  p_abastecimento_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_count int;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  UPDATE public.abastecimentos
     SET excluido = true,
         excluido_em = now(),
         excluido_motivo = NULLIF(p_motivo, ''),
         status = 'cancelado',
         updated_at = now()
   WHERE id = p_abastecimento_id
     AND acesso_externo_id = v.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_count > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_posto_combustivel_upsert(
  p_id uuid,
  p_nome text,
  p_cnpj text,
  p_endereco text,
  p_telefone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  r public.postos_combustivel;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.postos_combustivel(codigo, nome, cnpj, endereco, telefone)
    VALUES ('POSTO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), p_nome, NULLIF(p_cnpj, ''), NULLIF(p_endereco, ''), NULLIF(p_telefone, ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.postos_combustivel
       SET nome = p_nome, cnpj = NULLIF(p_cnpj, ''), endereco = NULLIF(p_endereco, ''), telefone = NULLIF(p_telefone, ''), updated_at = now()
     WHERE id = p_id
     RETURNING id INTO v_id;
  END IF;

  SELECT * INTO r FROM public.postos_combustivel WHERE id = v_id;
  RETURN jsonb_build_object('ok', true, 'posto', to_jsonb(r));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_posto_combustivel_toggle(p_id uuid, p_bloquear boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  UPDATE public.postos_combustivel
     SET status = CASE WHEN p_bloquear THEN 'bloqueado' ELSE 'ativo' END,
         updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_listar_usuarios()
RETURNS TABLE (
  user_id uuid,
  email text,
  nome_completo text,
  telefone text,
  cpf text,
  empresa text,
  filial text,
  created_at timestamptz,
  email_confirmed boolean,
  blocked boolean,
  role text,
  role_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM auth.users au WHERE au.id = auth.uid() AND lower(au.email) = 'adm.matriz@topac.com.br')
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    au.id AS user_id,
    lower(COALESCE(au.email, p.email, ae.email, '')) AS email,
    COALESCE(NULLIF(p.nome_completo, ''), au.raw_user_meta_data->>'nome_completo', ae.nome, '') AS nome_completo,
    COALESCE(NULLIF(p.telefone, ''), au.raw_user_meta_data->>'telefone', ae.telefone, '') AS telefone,
    COALESCE(ae.cpf, f.cpf, '') AS cpf,
    COALESCE(ae.empresa, e.nome, '') AS empresa,
    COALESCE(ae.filial, '') AS filial,
    au.created_at,
    au.email_confirmed_at IS NOT NULL AS email_confirmed,
    au.banned_until IS NOT NULL AND au.banned_until > now() AS blocked,
    ur.user_role AS role,
    ur.user_role_id AS role_id
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN LATERAL (
    SELECT *
      FROM public.acessos_externos a
     WHERE lower(COALESCE(a.email, a.email_corporativo, '')) = lower(COALESCE(au.email, ''))
        OR a.profile_user_id = au.id
     ORDER BY a.created_at DESC
     LIMIT 1
  ) ae ON true
  LEFT JOIN public.funcionarios f ON f.id = ae.funcionario_id
  LEFT JOIN public.empresas e ON e.id = COALESCE(f.company_id, f.empresa_id)
  LEFT JOIN LATERAL (
    SELECT r.id AS user_role_id, r.role AS user_role
      FROM public.user_roles r
     WHERE r.user_id = au.id
     ORDER BY CASE WHEN r.role = 'admin' THEN 0 WHEN r.role = 'diretor_geral' THEN 1 ELSE 2 END, r.created_at DESC
     LIMIT 1
  ) ur ON true
  ORDER BY au.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bloquear_usuario(p_user_id uuid, p_bloquear boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM auth.users au WHERE au.id = auth.uid() AND lower(au.email) = 'adm.matriz@topac.com.br')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  UPDATE auth.users
     SET banned_until = CASE WHEN p_bloquear THEN 'infinity'::timestamptz ELSE NULL END,
         updated_at = now()
   WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles(user_id, email, nome_completo, telefone)
  VALUES (
    NEW.id,
    lower(COALESCE(NEW.email, '')),
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', '')
  )
  ON CONFLICT (user_id) DO UPDATE
     SET email = EXCLUDED.email,
         nome_completo = COALESCE(NULLIF(public.profiles.nome_completo, ''), EXCLUDED.nome_completo),
         telefone = COALESCE(NULLIF(public.profiles.telefone, ''), EXCLUDED.telefone),
         updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles(user_id, email, nome_completo, telefone)
SELECT
  au.id,
  lower(COALESCE(au.email, '')),
  COALESCE(au.raw_user_meta_data->>'nome_completo', au.raw_user_meta_data->>'full_name', ''),
  COALESCE(au.raw_user_meta_data->>'telefone', '')
FROM auth.users au
ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      nome_completo = COALESCE(NULLIF(public.profiles.nome_completo, ''), EXCLUDED.nome_completo),
      telefone = COALESCE(NULLIF(public.profiles.telefone, ''), EXCLUDED.telefone),
      updated_at = now();

GRANT EXECUTE ON FUNCTION public._app_mecanico_get_acesso(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public._app_mecanico_placas_from_obs(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_validar_acesso(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_status_dia(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_ponto(uuid, text, double precision, double precision, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_listar_chamados(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_atualizar_chamado(uuid, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_validar_qr_posto(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_abastecimento_posto(uuid, text, numeric, numeric, text, numeric, text, text, text, text, double precision, double precision, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_listar_historico(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_atualizar_abastecimento(uuid, uuid, numeric, numeric, numeric, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_excluir_abastecimento(uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_posto_combustivel_upsert(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_posto_combustivel_toggle(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_listar_usuarios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bloquear_usuario(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
