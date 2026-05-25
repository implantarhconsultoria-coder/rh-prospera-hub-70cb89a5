-- TOPAC RH PRO - fechamento fino do abastecimento QR e cadastro pendente.
-- Mantem as tabelas atuais em producao e expõe aliases fuel_* para integracoes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Cadastro: garante que todo signup apareca para liberacao manual, mesmo antes do
-- primeiro login ou confirmacao de e-mail.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome_completo, email, telefone)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'nome_completo', ''), NEW.raw_user_meta_data->>'full_name', NEW.email, ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET nome_completo = COALESCE(NULLIF(public.profiles.nome_completo, ''), EXCLUDED.nome_completo),
      email = COALESCE(NULLIF(public.profiles.email, ''), EXCLUDED.email),
      telefone = COALESCE(NULLIF(public.profiles.telefone, ''), EXCLUDED.telefone),
      updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.id, 'usuario'::public.app_role
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.admin_listar_usuarios()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuarios jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', u.id,
      'email', COALESCE(p.email, u.email, ''),
      'nome_completo', COALESCE(NULLIF(p.nome_completo, ''), u.raw_user_meta_data->>'nome_completo', u.raw_user_meta_data->>'full_name', ''),
      'telefone', COALESCE(p.telefone, u.raw_user_meta_data->>'telefone', ''),
      'created_at', COALESCE(p.created_at, u.created_at),
      'email_confirmed_at', u.email_confirmed_at,
      'confirmation_sent_at', u.confirmation_sent_at,
      'last_sign_in_at', u.last_sign_in_at,
      'role', r.role,
      'role_id', r.role_id
    ) ORDER BY COALESCE(p.created_at, u.created_at) DESC), '[]'::jsonb)
    INTO v_usuarios
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT ur.id AS role_id, ur.role::text AS role
      FROM public.user_roles ur
      WHERE ur.user_id = u.id
      ORDER BY CASE WHEN ur.role::text = 'usuario' THEN 1 ELSE 0 END, ur.created_at DESC
      LIMIT 1
    ) r ON true
   WHERE u.deleted_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'usuarios', v_usuarios);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_atribuir_perfil_usuario(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_role_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  v_role := p_role::public.app_role;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, v_role)
  RETURNING id INTO v_role_id;

  RETURN jsonb_build_object('ok', true, 'role_id', v_role_id, 'role', v_role::text);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'perfil_invalido');
END;
$$;

-- Estrutura de abastecimento solicitada. A origem operacional continua sendo
-- postos_combustivel/abastecimentos para preservar o modulo aprovado.
ALTER TABLE public.postos_combustivel
  ADD COLUMN IF NOT EXISTS unidade text,
  ADD COLUMN IF NOT EXISTS tipo_qr text DEFAULT 'posto',
  ADD COLUMN IF NOT EXISTS posto_opcoes text[] DEFAULT ARRAY[]::text[];

ALTER TABLE public.abastecimentos
  ADD COLUMN IF NOT EXISTS valor_por_litro numeric,
  ADD COLUMN IF NOT EXISTS km_rodado numeric,
  ADD COLUMN IF NOT EXISTS recibo_texto text,
  ADD COLUMN IF NOT EXISTS recibo_gerado_em timestamptz,
  ADD COLUMN IF NOT EXISTS validado_por text,
  ADD COLUMN IF NOT EXISTS posto_telefone text,
  ADD COLUMN IF NOT EXISTS funcionario_cpf text,
  ADD COLUMN IF NOT EXISTS funcionario_matricula text,
  ADD COLUMN IF NOT EXISTS veiculo_nome text,
  ADD COLUMN IF NOT EXISTS protocolo text,
  ADD COLUMN IF NOT EXISTS recibo_whatsapp_text text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_abastecimentos_protocolo
  ON public.abastecimentos(protocolo)
  WHERE protocolo IS NOT NULL;

DROP POLICY IF EXISTS "fuel postos leitura operacional" ON public.postos_combustivel;
CREATE POLICY "fuel postos leitura operacional"
  ON public.postos_combustivel
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'operacional')
    OR (
      public.has_role(auth.uid(), 'filial_matriz')
      AND upper(coalesce(company, '') || ' ' || coalesce(branch, '')) SIMILAR TO '%(MATRIZ|SAO PAULO|SP)%'
    )
    OR (
      public.has_role(auth.uid(), 'filial_praia')
      AND upper(coalesce(company, '') || ' ' || coalesce(branch, '')) LIKE '%PRAIA%'
    )
    OR (
      public.has_role(auth.uid(), 'filial_goiania')
      AND upper(coalesce(company, '') || ' ' || coalesce(branch, '')) SIMILAR TO '%(GOIANIA|GOIANI|GYN)%'
    )
  );

DROP POLICY IF EXISTS "fuel abastecimentos financeiro view" ON public.abastecimentos;
CREATE POLICY "fuel abastecimentos financeiro view"
  ON public.abastecimentos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "fuel abastecimentos filial view" ON public.abastecimentos;
CREATE POLICY "fuel abastecimentos filial view"
  ON public.abastecimentos
  FOR SELECT TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'filial_matriz')
      AND upper(coalesce(empresa, '') || ' ' || coalesce(filial, '')) SIMILAR TO '%(MATRIZ|SAO PAULO|SP)%'
    )
    OR (
      public.has_role(auth.uid(), 'filial_praia')
      AND upper(coalesce(empresa, '') || ' ' || coalesce(filial, '')) LIKE '%PRAIA%'
    )
    OR (
      public.has_role(auth.uid(), 'filial_goiania')
      AND upper(coalesce(empresa, '') || ' ' || coalesce(filial, '')) SIMILAR TO '%(GOIANIA|GOIANI|GYN)%'
    )
  );

CREATE TABLE IF NOT EXISTS public.employee_vehicle_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid,
  acesso_externo_id uuid REFERENCES public.acessos_externos(id) ON DELETE CASCADE,
  vehicle_id uuid,
  vehicle_label text,
  plate text NOT NULL,
  branch text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (acesso_externo_id, plate)
);

CREATE INDEX IF NOT EXISTS idx_employee_vehicle_links_employee
  ON public.employee_vehicle_links(employee_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_employee_vehicle_links_acesso
  ON public.employee_vehicle_links(acesso_externo_id)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.fuel_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_record_id uuid UNIQUE REFERENCES public.abastecimentos(id) ON DELETE CASCADE,
  receipt_number text UNIQUE NOT NULL,
  employee_name text NOT NULL,
  employee_document text,
  employee_registration text,
  company text,
  branch text,
  station_name text NOT NULL,
  station_cnpj text,
  station_address text,
  vehicle text,
  plate text,
  fuel_date date NOT NULL,
  fuel_time time NOT NULL,
  km numeric,
  liters numeric NOT NULL,
  price_per_liter numeric,
  total_value numeric NOT NULL,
  pump_photo_url text,
  dashboard_photo_url text,
  whatsapp_text text,
  receipt_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_vehicle_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fuel links admin manage" ON public.employee_vehicle_links;
CREATE POLICY "fuel links admin manage"
  ON public.employee_vehicle_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operacional'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operacional'));

DROP POLICY IF EXISTS "fuel receipts admin finance view" ON public.fuel_receipts;
CREATE POLICY "fuel receipts admin finance view"
  ON public.fuel_receipts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'operacional')
    OR public.has_role(auth.uid(), 'filial_matriz')
    OR public.has_role(auth.uid(), 'filial_praia')
    OR public.has_role(auth.uid(), 'filial_goiania')
  );

DROP POLICY IF EXISTS "fuel receipts admin manage" ON public.fuel_receipts;
CREATE POLICY "fuel receipts admin manage"
  ON public.fuel_receipts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operacional'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operacional'));

INSERT INTO public.postos_combustivel(codigo, nome, unidade, cnpj, endereco, telefone, status, observacao, tipo_qr, posto_opcoes)
VALUES
  (
    'COMB-SP-001',
    'Posto de Servicos Sao Donato LTDA',
    'TOPAC MATRIZ',
    NULL,
    'Rua Anhaia, 1092, Bom Retiro, Sao Paulo/SP, CEP 01130-000',
    NULL,
    'ativo',
    'QR unico da Matriz. Usa veiculo automatico vinculado ao usuario.',
    'posto',
    ARRAY[]::text[]
  ),
  (
    'COMB-PG-001',
    'AUTO POSTO XIXOVA LTDA',
    'TOPAC PRAIA GRANDE',
    '46.778.064/0001-19',
    'Avenida Ayrton Senna da Silva, 500, Xixova, Praia Grande/SP, CEP 11726-500',
    NULL,
    'ativo',
    'QR unico da Praia Grande. Exige selecao do veiculo.',
    'posto',
    ARRAY[]::text[]
  ),
  (
    'COMB-GO-000',
    'TOPAC GOIANIA - QR unico',
    'TOPAC GOIANIA',
    NULL,
    'Goiania/GO',
    NULL,
    'ativo',
    'QR unico de Goiania. App abre selecao entre os dois postos autorizados.',
    'unidade',
    ARRAY['COMB-GO-001','COMB-GO-002']::text[]
  ),
  (
    'COMB-GO-001',
    'Posto Z + Z Sao Judas Tadeu LTDA',
    'TOPAC GOIANIA',
    '13.759.928/0001-04',
    'Avenida Presidente Kenedy, 1675, Quadra 49, Lote 01E, Vila Jardim Sao Judas Tadeu, Goiania/GO, CEP 74685-830',
    '62 98436-1976',
    'ativo',
    'Posto 1 de Goiania.',
    'posto',
    ARRAY[]::text[]
  ),
  (
    'COMB-GO-002',
    'Auto Posto Indianapolis LTDA',
    'TOPAC GOIANIA',
    '07.517.547/0001-08',
    'Av. Perimetral Norte, 7354, Jardim Diamantina, Goiania/GO, CEP 74595-350',
    '62 3945-0984',
    'ativo',
    'Posto 2 de Goiania.',
    'posto',
    ARRAY[]::text[]
  )
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome,
    unidade = EXCLUDED.unidade,
    cnpj = COALESCE(EXCLUDED.cnpj, public.postos_combustivel.cnpj),
    endereco = EXCLUDED.endereco,
    telefone = COALESCE(EXCLUDED.telefone, public.postos_combustivel.telefone),
    status = 'ativo',
    observacao = EXCLUDED.observacao,
    tipo_qr = EXCLUDED.tipo_qr,
    posto_opcoes = EXCLUDED.posto_opcoes,
    updated_at = now();

DROP VIEW IF EXISTS public.fuel_qrcodes;
DROP VIEW IF EXISTS public.fuel_records;
DROP VIEW IF EXISTS public.fuel_stations;
DROP VIEW IF EXISTS public.vehicles;

CREATE VIEW public.fuel_stations WITH (security_invoker = true) AS
SELECT
  id,
  codigo AS code,
  nome AS name,
  unidade AS branch,
  cnpj,
  endereco AS address,
  telefone AS phone,
  status,
  tipo_qr AS qr_type,
  posto_opcoes AS station_options,
  created_at,
  updated_at
FROM public.postos_combustivel
WHERE deleted_at IS NULL;

CREATE VIEW public.fuel_qrcodes WITH (security_invoker = true) AS
SELECT
  id,
  id AS station_id,
  codigo AS code,
  unidade AS branch,
  tipo_qr AS qr_type,
  posto_opcoes AS station_options,
  '/acesso-mecanico?qr=' || codigo AS app_path,
  status,
  created_at,
  updated_at
FROM public.postos_combustivel
WHERE deleted_at IS NULL;

CREATE VIEW public.fuel_records WITH (security_invoker = true) AS
SELECT
  id,
  protocolo AS receipt_number,
  qr_codigo AS qr_code,
  acesso_externo_id,
  funcionario_id AS employee_id,
  mecanico_nome AS employee_name,
  funcionario_cpf AS employee_document,
  funcionario_matricula AS employee_registration,
  empresa AS company,
  filial AS branch,
  veiculo_nome AS vehicle,
  placa AS plate,
  data AS fuel_date,
  hora AS fuel_time,
  posto_id AS station_id,
  posto_codigo AS station_code,
  posto_nome AS station_name,
  posto_cnpj AS station_cnpj,
  posto_endereco AS station_address,
  combustivel AS fuel_type,
  litros AS liters,
  valor_por_litro AS price_per_liter,
  valor AS total_value,
  km_atual AS km,
  km_rodado,
  foto_bomba_url AS pump_photo_url,
  foto_painel_url AS dashboard_photo_url,
  recibo_texto AS receipt_text,
  recibo_whatsapp_text AS whatsapp_text,
  status,
  observacao AS notes,
  created_at
FROM public.abastecimentos
WHERE COALESCE(excluido, false) = false;

CREATE VIEW public.vehicles WITH (security_invoker = true) AS
SELECT
  a.id,
  COALESCE(NULLIF(a.descricao, ''), NULLIF(a.placa, ''), a.patrimonio) AS name,
  a.placa AS plate,
  a.empresa AS company,
  NULL::text AS branch,
  a.status,
  a.created_at,
  a.updated_at
FROM public.ativos a
WHERE COALESCE(a.tipo, '') = 'veiculo'
UNION ALL
SELECT
  v.id,
  COALESCE(NULLIF(v.modelo, ''), NULLIF(v.identificacao_interna, ''), v.placa) AS name,
  v.placa AS plate,
  NULL::text AS company,
  NULL::text AS branch,
  v.status,
  v.created_at,
  v.updated_at
FROM public.veiculos v;

GRANT SELECT ON public.fuel_stations TO authenticated;
GRANT SELECT ON public.fuel_qrcodes TO authenticated;
GRANT SELECT ON public.fuel_records TO authenticated;
GRANT SELECT ON public.vehicles TO authenticated;

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
  v_obs_placas text[];
  v_link_placas text[];
  v_placas text[];
  v_placa text;
  v_veiculo_nome text;
  v_ultimo_km numeric;
  v_unidade text;
  v_empresa text;
  v_exige_selecao_carro boolean;
  v_postos jsonb := '[]'::jsonb;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  v_codigo := upper(trim(coalesce(p_codigo, '')));

  SELECT *
    INTO p
    FROM public.postos_combustivel
   WHERE upper(trim(codigo)) = v_codigo
     AND deleted_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_nao_encontrado');
  END IF;

  IF p.status <> 'ativo' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_bloqueado');
  END IF;

  IF COALESCE(v.registro_teste, false) THEN
    v_placas := ARRAY[COALESCE(NULLIF(v.placa_teste, ''), 'PEU0TST')];
  ELSE
    v_obs_placas := public._app_mecanico_placas_from_obs(v.observacoes);

    SELECT COALESCE(array_agg(DISTINCT upper(trim(evl.plate)) ORDER BY upper(trim(evl.plate))), ARRAY[]::text[])
      INTO v_link_placas
      FROM public.employee_vehicle_links evl
     WHERE evl.active = true
       AND (
         evl.acesso_externo_id = v.id
         OR (v.funcionario_id IS NOT NULL AND evl.employee_id = v.funcionario_id)
       );

    SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::text[])
      INTO v_placas
      FROM unnest(COALESCE(v_link_placas, ARRAY[]::text[]) || COALESCE(v_obs_placas, ARRAY[]::text[])) AS t(x)
     WHERE COALESCE(x, '') <> '';
  END IF;

  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro :=
    COALESCE(v.registro_teste, false) = false
    AND (
      v_unidade LIKE '%GOIANIA%'
      OR v_unidade LIKE '%PRAIA%'
      OR v_empresa LIKE '%GOIANIA%'
      OR v_empresa LIKE '%PRAIA%'
    );

  v_placa := CASE
    WHEN v_exige_selecao_carro THEN NULL
    ELSE NULLIF(v_placas[1], '')
  END;

  IF v_placa IS NOT NULL THEN
    SELECT COALESCE(NULLIF(evl.vehicle_label, ''), evl.plate)
      INTO v_veiculo_nome
      FROM public.employee_vehicle_links evl
     WHERE evl.active = true
       AND upper(replace(evl.plate, '-', '')) = upper(replace(v_placa, '-', ''))
       AND (
         evl.acesso_externo_id = v.id
         OR (v.funcionario_id IS NOT NULL AND evl.employee_id = v.funcionario_id)
       )
     LIMIT 1;
  END IF;

  IF COALESCE(v.registro_teste, false) THEN
    v_veiculo_nome := COALESCE(NULLIF(v.veiculo_teste, ''), v_veiculo_nome, v_placa);
  END IF;

  IF COALESCE(p.tipo_qr, 'posto') = 'unidade' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', px.id,
        'codigo', px.codigo,
        'nome', px.nome,
        'unidade', px.unidade,
        'cnpj', px.cnpj,
        'endereco', px.endereco,
        'telefone', px.telefone,
        'tipo_qr', COALESCE(px.tipo_qr, 'posto')
      ) ORDER BY px.codigo), '[]'::jsonb)
      INTO v_postos
      FROM public.postos_combustivel px
     WHERE px.codigo = ANY(COALESCE(p.posto_opcoes, ARRAY[]::text[]))
       AND px.status = 'ativo'
       AND px.deleted_at IS NULL;
  END IF;

  SELECT a.km_atual
    INTO v_ultimo_km
    FROM public.abastecimentos a
   WHERE a.placa IS NOT NULL
     AND upper(replace(a.placa, '-', '')) = upper(replace(coalesce(v_placa, v_placas[1], ''), '-', ''))
     AND a.km_atual IS NOT NULL
     AND COALESCE(a.excluido, false) = false
     AND COALESCE(a.registro_teste, false) = COALESCE(v.registro_teste, false)
   ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'posto', jsonb_build_object(
      'id', p.id,
      'codigo', p.codigo,
      'nome', p.nome,
      'unidade', p.unidade,
      'cnpj', p.cnpj,
      'endereco', p.endereco,
      'telefone', p.telefone,
      'tipo_qr', COALESCE(p.tipo_qr, 'posto')
    ),
    'postos', v_postos,
    'mecanico', jsonb_build_object(
      'nome', v.nome,
      'empresa', COALESCE(v.empresa, ''),
      'filial', COALESCE(v.filial, ''),
      'funcionario_id', v.funcionario_id,
      'cpf', COALESCE(v.cpf, ''),
      'matricula', COALESCE(v.cpf_clean, ''),
      'placa', v_placa,
      'veiculo', COALESCE(v_veiculo_nome, v_placa, ''),
      'carros', COALESCE((SELECT jsonb_agg(x) FROM unnest(v_placas) x), '[]'::jsonb),
      'exige_selecao_carro', v_exige_selecao_carro,
      'ultimo_km', v_ultimo_km,
      'registro_teste', COALESCE(v.registro_teste, false),
      'veiculo_teste', COALESCE(v.veiculo_teste, '')
    )
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
  v_obs_placas text[];
  v_link_placas text[];
  v_placas text[];
  v_placa text;
  v_veiculo_nome text;
  v_unidade text;
  v_empresa text;
  v_exige_selecao_carro boolean;
  v_ultimo_km numeric;
  v_preco_litro numeric;
  v_km_rodado numeric;
  v_recibo text;
  v_whatsapp text;
  v_protocolo text;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  IF COALESCE(p_foto_bomba_url, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'foto_bomba_obrigatoria');
  END IF;

  IF COALESCE(p_foto_painel_url, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'foto_painel_obrigatoria');
  END IF;

  IF COALESCE(p_valor, 0) <= 0 OR COALESCE(p_litros, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'valor_litros_obrigatorios');
  END IF;

  SELECT *
    INTO p
    FROM public.postos_combustivel
   WHERE upper(trim(codigo)) = upper(trim(coalesce(p_posto_codigo, '')))
     AND status = 'ativo'
     AND deleted_at IS NULL
   LIMIT 1;

  IF NOT FOUND OR COALESCE(p.tipo_qr, 'posto') = 'unidade' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'posto_invalido');
  END IF;

  IF COALESCE(v.registro_teste, false) THEN
    v_placas := ARRAY[COALESCE(NULLIF(v.placa_teste, ''), 'PEU0TST')];
  ELSE
    v_obs_placas := public._app_mecanico_placas_from_obs(v.observacoes);

    SELECT COALESCE(array_agg(DISTINCT upper(trim(evl.plate)) ORDER BY upper(trim(evl.plate))), ARRAY[]::text[])
      INTO v_link_placas
      FROM public.employee_vehicle_links evl
     WHERE evl.active = true
       AND (
         evl.acesso_externo_id = v.id
         OR (v.funcionario_id IS NOT NULL AND evl.employee_id = v.funcionario_id)
       );

    SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::text[])
      INTO v_placas
      FROM unnest(COALESCE(v_link_placas, ARRAY[]::text[]) || COALESCE(v_obs_placas, ARRAY[]::text[])) AS t(x)
     WHERE COALESCE(x, '') <> '';
  END IF;

  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro :=
    COALESCE(v.registro_teste, false) = false
    AND (
      v_unidade LIKE '%GOIANIA%'
      OR v_unidade LIKE '%PRAIA%'
      OR v_empresa LIKE '%GOIANIA%'
      OR v_empresa LIKE '%PRAIA%'
    );

  v_placa := upper(coalesce(nullif(p_placa, ''), CASE WHEN v_exige_selecao_carro THEN NULL ELSE v_placas[1] END));

  IF coalesce(v_placa, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'placa_obrigatoria');
  END IF;

  SELECT COALESCE(NULLIF(evl.vehicle_label, ''), evl.plate)
    INTO v_veiculo_nome
    FROM public.employee_vehicle_links evl
   WHERE evl.active = true
     AND upper(replace(evl.plate, '-', '')) = upper(replace(v_placa, '-', ''))
     AND (
       evl.acesso_externo_id = v.id
       OR (v.funcionario_id IS NOT NULL AND evl.employee_id = v.funcionario_id)
     )
   LIMIT 1;

  IF COALESCE(v.registro_teste, false) THEN
    v_veiculo_nome := COALESCE(NULLIF(v.veiculo_teste, ''), v_veiculo_nome, v_placa);
  ELSE
    v_veiculo_nome := COALESCE(v_veiculo_nome, v_placa);
  END IF;

  SELECT a.km_atual
    INTO v_ultimo_km
    FROM public.abastecimentos a
   WHERE a.placa IS NOT NULL
     AND upper(replace(a.placa, '-', '')) = upper(replace(coalesce(v_placa, ''), '-', ''))
     AND a.km_atual IS NOT NULL
     AND COALESCE(a.excluido, false) = false
     AND COALESCE(a.registro_teste, false) = COALESCE(v.registro_teste, false)
   ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
   LIMIT 1;

  v_preco_litro := round(COALESCE(p_valor, 0) / NULLIF(p_litros, 0), 3);
  v_km_rodado := CASE WHEN p_km IS NOT NULL AND v_ultimo_km IS NOT NULL AND p_km >= v_ultimo_km THEN p_km - v_ultimo_km ELSE NULL END;
  v_protocolo := 'AB-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  v_whatsapp := 'Comprovante de abastecimento — ' || COALESCE(v.nome, '') || ' — ' ||
    to_char(CURRENT_DATE, 'DD/MM/YYYY') || ' — ' || COALESCE(v_veiculo_nome, v_placa, '') || ' — R$ ' ||
    replace(to_char(COALESCE(p_valor, 0), 'FM999999990D00'), '.', ',');

  v_recibo := concat_ws(E'\n',
    CASE WHEN COALESCE(v.registro_teste, false) THEN 'TOPAC RH PRO - RECIBO DE ABASTECIMENTO (TESTE)' ELSE 'TOPAC RH PRO - RECIBO DE ABASTECIMENTO' END,
    'Protocolo: ' || v_protocolo,
    'Funcionario: ' || COALESCE(v.nome, ''),
    'CPF: ' || COALESCE(v.cpf, ''),
    'Matricula: ' || COALESCE(v.cpf_clean, ''),
    'Empresa/Filial: ' || COALESCE(v.empresa, '') || CASE WHEN COALESCE(v.filial, '') <> '' THEN ' - ' || v.filial ELSE '' END,
    'Posto: ' || COALESCE(p.nome, ''),
    'CNPJ: ' || COALESCE(p.cnpj, ''),
    'Endereco: ' || COALESCE(p.endereco, ''),
    'Veiculo: ' || COALESCE(v_veiculo_nome, ''),
    'Placa: ' || COALESCE(v_placa, ''),
    'Data: ' || to_char(CURRENT_DATE, 'DD/MM/YYYY'),
    'Hora: ' || to_char(CURRENT_TIME, 'HH24:MI:SS'),
    'KM: ' || COALESCE(p_km::text, ''),
    'Litros: ' || COALESCE(p_litros::text, ''),
    'Valor por litro: ' || COALESCE(v_preco_litro::text, ''),
    'Valor total: ' || COALESCE(p_valor::text, ''),
    'Foto da bomba: ' || COALESCE(p_foto_bomba_url, ''),
    'Foto do painel: ' || COALESCE(p_foto_painel_url, ''),
    CASE WHEN COALESCE(v.registro_teste, false) THEN 'Registro de teste: nao impacta relatorios oficiais.' ELSE NULL END
  );

  INSERT INTO public.abastecimentos(
    qr_codigo, acesso_externo_id, funcionario_id, mecanico_nome, empresa, filial, placa,
    funcionario_cpf, funcionario_matricula, veiculo_nome, protocolo,
    data, hora, combustivel, valor, litros, valor_por_litro, km_atual, km_rodado,
    posto_nome, posto_cnpj, posto_endereco, posto_id, posto_codigo, posto_telefone,
    foto_bomba_url, foto_painel_url, latitude, longitude, endereco, observacao,
    status, preenchimento, recibo_texto, recibo_whatsapp_text, recibo_gerado_em, validado_por,
    registro_teste, teste_chave
  ) VALUES (
    p.codigo, v.id, v.funcionario_id, v.nome, COALESCE(v.empresa, ''), COALESCE(v.filial, ''), NULLIF(v_placa, ''),
    COALESCE(v.cpf, ''), COALESCE(v.cpf_clean, ''), COALESCE(v_veiculo_nome, ''), v_protocolo,
    CURRENT_DATE, CURRENT_TIME, NULLIF(p_combustivel, ''), COALESCE(p_valor, 0), COALESCE(p_litros, 0),
    v_preco_litro, p_km, v_km_rodado,
    p.nome, p.cnpj, p.endereco, p.id, p.codigo, p.telefone,
    p_foto_bomba_url, p_foto_painel_url, p_latitude, p_longitude, p_endereco, NULLIF(p_observacao, ''),
    'concluido', 'qr_posto', v_recibo, v_whatsapp, now(), v.nome,
    COALESCE(v.registro_teste, false), NULLIF(v.teste_chave, '')
  )
  RETURNING id INTO v_id;

  INSERT INTO public.fuel_receipts(
    fuel_record_id, receipt_number, employee_name, employee_document, employee_registration,
    company, branch, station_name, station_cnpj, station_address, vehicle, plate,
    fuel_date, fuel_time, km, liters, price_per_liter, total_value,
    pump_photo_url, dashboard_photo_url, whatsapp_text, receipt_text
  )
  VALUES (
    v_id, v_protocolo, COALESCE(v.nome, ''), COALESCE(v.cpf, ''), COALESCE(v.cpf_clean, ''),
    COALESCE(v.empresa, ''), COALESCE(v.filial, ''), COALESCE(p.nome, ''), p.cnpj, p.endereco,
    COALESCE(v_veiculo_nome, ''), NULLIF(v_placa, ''),
    CURRENT_DATE, CURRENT_TIME, p_km, COALESCE(p_litros, 0), v_preco_litro, COALESCE(p_valor, 0),
    p_foto_bomba_url, p_foto_painel_url, v_whatsapp, v_recibo
  )
  ON CONFLICT (fuel_record_id) DO UPDATE
  SET receipt_number = EXCLUDED.receipt_number,
      whatsapp_text = EXCLUDED.whatsapp_text,
      receipt_text = EXCLUDED.receipt_text;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'protocolo', v_protocolo,
    'preco_litro', v_preco_litro,
    'valor_por_litro', v_preco_litro,
    'km_rodado', v_km_rodado,
    'recibo_texto', v_recibo,
    'whatsapp_text', v_whatsapp,
    'cpf', COALESCE(v.cpf, ''),
    'matricula', COALESCE(v.cpf_clean, ''),
    'veiculo_nome', COALESCE(v_veiculo_nome, ''),
    'registro_teste', COALESCE(v.registro_teste, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_listar_usuarios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atribuir_perfil_usuario(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_validar_qr_posto(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_abastecimento_posto(uuid, text, numeric, numeric, text, numeric, text, text, text, text, double precision, double precision, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
