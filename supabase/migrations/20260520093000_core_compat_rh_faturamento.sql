-- TOPAC RH PRO - compatibilidade do banco de producao.
-- Completa tabelas/colunas usadas pela plataforma nova sem apagar dados existentes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.empresas
SET status = CASE WHEN COALESCE(ativa, true) THEN 'ativa' ELSE 'inativa' END
WHERE status IS NULL;

UPDATE public.empresas
SET codigo = CASE
  WHEN regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g') = '07291648000103' THEN 'topac-matriz'
  WHEN regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g') = '07291648000294' THEN 'topac-pg'
  WHEN regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g') = '07291648000375' THEN 'topac-gyn'
  WHEN lower(COALESCE(nome, '')) LIKE '%lmt%' THEN 'lmt'
  WHEN lower(COALESCE(nome, '')) LIKE '%alqui%' THEN 'alqui'
  WHEN lower(COALESCE(cidade, '')) LIKE '%praia%' THEN 'topac-pg'
  WHEN lower(COALESCE(cidade, '')) LIKE '%goian%' THEN 'topac-gyn'
  ELSE COALESCE(codigo, id::text)
END
WHERE codigo IS NULL OR codigo = '';

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS salario_base numeric,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS registro text,
  ADD COLUMN IF NOT EXISTS matricula_esocial text,
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS celular text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS pix text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS agencia text,
  ADD COLUMN IF NOT EXISTS conta text,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS data_admissao date,
  ADD COLUMN IF NOT EXISTS data_exame_medico date,
  ADD COLUMN IF NOT EXISTS vr_ativo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vr_diario numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS va_ativo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS va_mensal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vt_ativo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vt_diario numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insalubridade_ativa boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insalubridade_valor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.funcionarios
SET
  company_id = COALESCE(company_id, empresa_id),
  salario_base = COALESCE(salario_base, salario),
  status = COALESCE(status, CASE WHEN COALESCE(ativo, true) THEN 'ativo' ELSE 'desligado' END),
  categoria = COALESCE(categoria, setor, 'operacional');

CREATE OR REPLACE FUNCTION public.sync_empresa_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NULL THEN
    NEW.status := CASE WHEN COALESCE(NEW.ativa, true) THEN 'ativa' ELSE 'inativa' END;
  END IF;
  IF NEW.ativa IS NULL THEN
    NEW.ativa := NEW.status IS DISTINCT FROM 'inativa';
  END IF;
  IF NEW.observacoes IS NULL THEN
    NEW.observacoes := COALESCE(NEW.tipo, '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_empresas_sync_compat ON public.empresas;
CREATE TRIGGER tg_empresas_sync_compat
BEFORE INSERT OR UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.sync_empresa_compat();

CREATE OR REPLACE FUNCTION public.sync_funcionario_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN NEW.company_id := NEW.empresa_id; END IF;
  IF NEW.empresa_id IS NULL THEN NEW.empresa_id := NEW.company_id; END IF;
  IF NEW.salario_base IS NULL THEN NEW.salario_base := COALESCE(NEW.salario, 0); END IF;
  IF NEW.salario IS NULL THEN NEW.salario := COALESCE(NEW.salario_base, 0); END IF;
  IF NEW.status IS NULL THEN NEW.status := CASE WHEN COALESCE(NEW.ativo, true) THEN 'ativo' ELSE 'desligado' END; END IF;
  IF NEW.ativo IS NULL THEN NEW.ativo := NEW.status IS DISTINCT FROM 'desligado'; END IF;
  IF NEW.categoria IS NULL THEN NEW.categoria := COALESCE(NEW.setor, 'operacional'); END IF;
  IF NEW.setor IS NULL THEN NEW.setor := COALESCE(NEW.categoria, 'operacional'); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_funcionarios_sync_compat ON public.funcionarios;
CREATE TRIGGER tg_funcionarios_sync_compat
BEFORE INSERT OR UPDATE ON public.funcionarios
FOR EACH ROW EXECUTE FUNCTION public.sync_funcionario_compat();

CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa_id ON public.funcionarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_company_id ON public.funcionarios(company_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_nome ON public.funcionarios(nome);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON public.funcionarios(cpf);

CREATE TABLE IF NOT EXISTS public.lancamentos_mensais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  competencia text NOT NULL,
  faltas_dias numeric NOT NULL DEFAULT 0,
  faltas_datas jsonb NOT NULL DEFAULT '[]'::jsonb,
  atrasos numeric NOT NULL DEFAULT 0,
  he50 numeric NOT NULL DEFAULT 0,
  he100 numeric NOT NULL DEFAULT 0,
  adicionais numeric NOT NULL DEFAULT 0,
  descontos_diversos numeric NOT NULL DEFAULT 0,
  adiantamento numeric NOT NULL DEFAULT 0,
  vr_aplicado boolean NOT NULL DEFAULT false,
  vr_dias numeric NOT NULL DEFAULT 0,
  va_aplicado boolean NOT NULL DEFAULT false,
  vt_aplicado boolean NOT NULL DEFAULT false,
  vt_desconto numeric NOT NULL DEFAULT 0,
  comissao_base numeric NOT NULL DEFAULT 0,
  insalubridade_aplicada boolean NOT NULL DEFAULT false,
  status_conferencia text NOT NULL DEFAULT 'pendente',
  origem text NOT NULL DEFAULT 'manual',
  observacoes text DEFAULT '',
  bloqueado boolean NOT NULL DEFAULT false,
  fechamento_id uuid,
  apagado_em timestamptz,
  apagado_por_user_id uuid,
  apagado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, competencia)
);

CREATE TABLE IF NOT EXISTS public.fechamentos_filial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  competencia text NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  observacoes text DEFAULT '',
  fechado_por uuid,
  fechado_por_nome text,
  fechado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, competencia)
);

CREATE TABLE IF NOT EXISTS public.fechamentos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid REFERENCES public.fechamentos_filial(id) ON DELETE CASCADE,
  user_id uuid,
  usuario_nome text DEFAULT '',
  acao text NOT NULL,
  detalhes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.importacoes_dn4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo text NOT NULL,
  storage_path text,
  arquivo_path text,
  arquivo_url text,
  tipo text,
  tipo_arquivo text,
  usuario_id uuid,
  usuario_nome text,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  total_lidos integer NOT NULL DEFAULT 0,
  total_confirmados integer NOT NULL DEFAULT 0,
  total_pendentes integer NOT NULL DEFAULT 0,
  total_erros integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'em_andamento',
  mensagem text,
  texto_extraido text,
  excluido boolean NOT NULL DEFAULT false,
  excluido_em timestamptz,
  motivo_exclusao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.importacoes_dn4
  ADD COLUMN IF NOT EXISTS arquivo_path text,
  ADD COLUMN IF NOT EXISTS arquivo_url text,
  ADD COLUMN IF NOT EXISTS tipo_arquivo text,
  ADD COLUMN IF NOT EXISTS mensagem text,
  ADD COLUMN IF NOT EXISTS texto_extraido text,
  ADD COLUMN IF NOT EXISTS excluido boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_exclusao text;

CREATE TABLE IF NOT EXISTS public.staging_clientes_dn4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), importacao_id uuid REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem text, pagina_origem integer, linha_original_extraida jsonb, status text NOT NULL DEFAULT 'pendente_conferencia', mensagem_erro text,
  data_importacao timestamptz NOT NULL DEFAULT now(), usuario_importacao uuid, codigo_dn4 text, nome_razao_social text, cpf_cnpj text,
  inscricao_estadual text, endereco text, bairro text, cidade text, uf text, cep text, empresa_origem text, filial_origem text, status_cliente text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staging_equipamentos_dn4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), importacao_id uuid REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem text, pagina_origem integer, linha_original_extraida jsonb, status text NOT NULL DEFAULT 'pendente_conferencia', mensagem_erro text,
  data_importacao timestamptz NOT NULL DEFAULT now(), usuario_importacao uuid, codigo_equipamento text, numero_patrimonio text, descricao text,
  tipo_equipamento text, grupo text, filial_opera text, situacao text, numero_serie text, valor_venda numeric, valor_compra numeric, valor_mercado numeric, valor_indenizacao numeric,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staging_historico_locacao_dn4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), importacao_id uuid REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem text, pagina_origem integer, linha_original_extraida jsonb, status text NOT NULL DEFAULT 'pendente_conferencia', mensagem_erro text,
  data_importacao timestamptz NOT NULL DEFAULT now(), usuario_importacao uuid, numero_os text, pedido text, cliente_nome text, cliente_cpf_cnpj text,
  quantidade numeric, item text, patrimonio text, descricao_equipamento text, periodo_texto text, data_inicio date, data_fim date,
  valor_pedido_periodo numeric, valor_diaria_periodo numeric, valor_faturado_periodo numeric, numero_nf text, filial text,
  cliente_id_resolvido uuid, equipamento_id_resolvido uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clientes_faturamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo_dn4 text, nome_razao_social text NOT NULL, cpf_cnpj text, inscricao_estadual text,
  endereco text, bairro text, cidade text, uf text, cep text, empresa_origem text, filial_origem text, status text DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_faturamento_cpf_cnpj_not_null ON public.clientes_faturamento(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj <> '';

CREATE TABLE IF NOT EXISTS public.equipamentos_faturamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo_equipamento text, numero_patrimonio text NOT NULL, descricao text, tipo_equipamento text,
  grupo text, filial_opera text, situacao text, numero_serie text, valor_venda numeric, valor_compra numeric, valor_mercado numeric, valor_indenizacao numeric,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_equipamentos_faturamento_patrimonio ON public.equipamentos_faturamento(numero_patrimonio);

CREATE TABLE IF NOT EXISTS public.historico_locacao_faturamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero_os text, pedido text, cliente_id uuid REFERENCES public.clientes_faturamento(id) ON DELETE SET NULL,
  equipamento_id uuid REFERENCES public.equipamentos_faturamento(id) ON DELETE SET NULL, patrimonio text, quantidade numeric, item text,
  descricao_equipamento text, periodo_texto text, data_inicio date, data_fim date, valor_pedido_periodo numeric, valor_diaria_periodo numeric,
  valor_faturado_periodo numeric, numero_nf text, filial text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clientes_fat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), razao_social text NOT NULL, nome_fantasia text DEFAULT '', cnpj_cpf text DEFAULT '', inscricao_estadual text DEFAULT '',
  email text DEFAULT '', telefone text DEFAULT '', contato_responsavel text DEFAULT '', endereco text DEFAULT '', cidade text DEFAULT '', uf text DEFAULT '', cep text DEFAULT '',
  observacoes text DEFAULT '', status text NOT NULL DEFAULT 'ativo', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text NOT NULL, cliente_id uuid NOT NULL REFERENCES public.clientes_fat(id), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  tipo text NOT NULL DEFAULT 'locacao', data_inicio date NOT NULL DEFAULT CURRENT_DATE, data_fim date, regra_faturamento text NOT NULL DEFAULT 'mensal_fixo',
  periodicidade text NOT NULL DEFAULT 'mensal', dia_vencimento integer DEFAULT 10, indice_reajuste text DEFAULT 'IPCA', percentual_reajuste numeric DEFAULT 0,
  data_base_reajuste date, proximo_reajuste date, valor_mensal numeric NOT NULL DEFAULT 0, observacoes text DEFAULT '', status text NOT NULL DEFAULT 'ativo',
  arquivo_url text DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contrato_equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE, ativo_id uuid REFERENCES public.ativos(id) ON DELETE SET NULL,
  descricao_livre text DEFAULT '', patrimonio text DEFAULT '', placa text DEFAULT '', data_envio date, data_retorno date, valor_unitario numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo', observacao text DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text NOT NULL, contrato_id uuid REFERENCES public.contratos(id) ON DELETE SET NULL, cliente_id uuid NOT NULL REFERENCES public.clientes_fat(id),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id), competencia text NOT NULL, data_emissao date NOT NULL DEFAULT CURRENT_DATE, data_vencimento date NOT NULL,
  data_pagamento date, subtotal numeric NOT NULL DEFAULT 0, descontos numeric NOT NULL DEFAULT 0, acrescimos numeric NOT NULL DEFAULT 0, total numeric NOT NULL DEFAULT 0,
  valor_pago numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'prevista', observacoes text DEFAULT '', arquivo_pdf_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.titulos_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id uuid NOT NULL REFERENCES public.clientes_fat(id), contrato_id uuid REFERENCES public.contratos(id) ON DELETE SET NULL,
  fatura_id uuid REFERENCES public.faturas(id) ON DELETE SET NULL, empresa_id uuid NOT NULL REFERENCES public.empresas(id), numero text NOT NULL, competencia text NOT NULL,
  data_emissao date NOT NULL DEFAULT CURRENT_DATE, data_vencimento date NOT NULL, valor_original numeric NOT NULL DEFAULT 0, desconto numeric NOT NULL DEFAULT 0,
  juros numeric NOT NULL DEFAULT 0, multa numeric NOT NULL DEFAULT 0, valor_pago numeric NOT NULL DEFAULT 0, saldo numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aberto', observacoes text DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresas','funcionarios','lancamentos_mensais','fechamentos_filial','fechamentos_historico','ativos','veiculo_manutencoes',
    'importacoes_dn4','staging_clientes_dn4','staging_equipamentos_dn4','staging_historico_locacao_dn4','clientes_faturamento','equipamentos_faturamento',
    'historico_locacao_faturamento','clientes_fat','contratos','contrato_equipamentos','faturas','titulos_receber'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS topac_admin_all ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY topac_admin_all ON public.%I
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faturamento') OR public.has_role(auth.uid(), 'financeiro') OR public.has_role(auth.uid(), 'operacional'))
      WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faturamento') OR public.has_role(auth.uid(), 'financeiro') OR public.has_role(auth.uid(), 'operacional'))
    $p$, t);
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('documentos-ativos', 'documentos-ativos', true),
  ('dn4-imports', 'dn4-imports', false),
  ('documentos-funcionarios', 'documentos-funcionarios', true),
  ('atestados', 'atestados', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS topac_storage_authenticated_select ON storage.objects;
CREATE POLICY topac_storage_authenticated_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('documentos-ativos','dn4-imports','documentos-funcionarios','atestados'));

DROP POLICY IF EXISTS topac_storage_authenticated_insert ON storage.objects;
CREATE POLICY topac_storage_authenticated_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('documentos-ativos','dn4-imports','documentos-funcionarios','atestados'));

DROP POLICY IF EXISTS topac_storage_authenticated_update ON storage.objects;
CREATE POLICY topac_storage_authenticated_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('documentos-ativos','dn4-imports','documentos-funcionarios','atestados'));

NOTIFY pgrst, 'reload schema';
