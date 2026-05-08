
-- ============ STAGING COMMON ENUM ============
DO $$ BEGIN
  CREATE TYPE public.dn4_status AS ENUM ('importado','pendente_conferencia','erro_leitura','confirmado','ignorado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ LOG DE IMPORTAÇÃO ============
CREATE TABLE IF NOT EXISTS public.importacoes_dn4 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo TEXT NOT NULL,
  storage_path TEXT,
  tipo TEXT,
  usuario_id UUID,
  usuario_nome TEXT,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em TIMESTAMPTZ,
  total_lidos INT NOT NULL DEFAULT 0,
  total_confirmados INT NOT NULL DEFAULT 0,
  total_pendentes INT NOT NULL DEFAULT 0,
  total_erros INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'em_andamento',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ STAGING ============
CREATE TABLE IF NOT EXISTS public.staging_clientes_dn4 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem TEXT,
  pagina_origem INT,
  linha_original_extraida JSONB,
  status public.dn4_status NOT NULL DEFAULT 'pendente_conferencia',
  mensagem_erro TEXT,
  data_importacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_importacao UUID,
  -- dados
  codigo_dn4 TEXT,
  nome_razao_social TEXT,
  cpf_cnpj TEXT,
  inscricao_estadual TEXT,
  endereco TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  empresa_origem TEXT,
  filial_origem TEXT,
  status_cliente TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staging_representantes_dn4 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem TEXT,
  pagina_origem INT,
  linha_original_extraida JSONB,
  status public.dn4_status NOT NULL DEFAULT 'pendente_conferencia',
  mensagem_erro TEXT,
  data_importacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_importacao UUID,
  codigo_dn4 TEXT,
  nome TEXT,
  cpf_cnpj TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  email TEXT,
  telefone TEXT,
  tipo_pessoa TEXT,
  empresa_origem TEXT,
  filial_origem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staging_equipamentos_dn4 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem TEXT,
  pagina_origem INT,
  linha_original_extraida JSONB,
  status public.dn4_status NOT NULL DEFAULT 'pendente_conferencia',
  mensagem_erro TEXT,
  data_importacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_importacao UUID,
  codigo_equipamento TEXT,
  numero_patrimonio TEXT,
  descricao TEXT,
  tipo_equipamento TEXT,
  grupo TEXT,
  filial_opera TEXT,
  situacao TEXT,
  numero_serie TEXT,
  valor_venda NUMERIC,
  valor_compra NUMERIC,
  valor_mercado NUMERIC,
  valor_indenizacao NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staging_historico_locacao_dn4 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem TEXT,
  pagina_origem INT,
  linha_original_extraida JSONB,
  status public.dn4_status NOT NULL DEFAULT 'pendente_conferencia',
  mensagem_erro TEXT,
  data_importacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_importacao UUID,
  numero_os TEXT,
  pedido TEXT,
  cliente_nome TEXT,
  cliente_cpf_cnpj TEXT,
  quantidade NUMERIC,
  item TEXT,
  patrimonio TEXT,
  descricao_equipamento TEXT,
  periodo_texto TEXT,
  data_inicio DATE,
  data_fim DATE,
  valor_pedido_periodo NUMERIC,
  valor_diaria_periodo NUMERIC,
  valor_faturado_periodo NUMERIC,
  numero_nf TEXT,
  filial TEXT,
  cliente_id_resolvido UUID,
  equipamento_id_resolvido UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ OFICIAIS ============
CREATE TABLE IF NOT EXISTS public.clientes_faturamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_dn4 TEXT,
  nome_razao_social TEXT NOT NULL,
  cpf_cnpj TEXT UNIQUE,
  inscricao_estadual TEXT,
  endereco TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  empresa_origem TEXT,
  filial_origem TEXT,
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_fat_nome ON public.clientes_faturamento (lower(nome_razao_social));
CREATE INDEX IF NOT EXISTS idx_clientes_fat_codigo ON public.clientes_faturamento (codigo_dn4);

CREATE TABLE IF NOT EXISTS public.representantes_faturamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_dn4 TEXT,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  email TEXT,
  telefone TEXT,
  tipo_pessoa TEXT,
  empresa_origem TEXT,
  filial_origem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_dn4, nome)
);

CREATE TABLE IF NOT EXISTS public.equipamentos_faturamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_equipamento TEXT,
  numero_patrimonio TEXT NOT NULL UNIQUE,
  descricao TEXT,
  tipo_equipamento TEXT,
  grupo TEXT,
  filial_opera TEXT,
  situacao TEXT,
  numero_serie TEXT,
  valor_venda NUMERIC,
  valor_compra NUMERIC,
  valor_mercado NUMERIC,
  valor_indenizacao NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equip_fat_descricao ON public.equipamentos_faturamento (lower(descricao));
CREATE INDEX IF NOT EXISTS idx_equip_fat_grupo ON public.equipamentos_faturamento (grupo);

CREATE TABLE IF NOT EXISTS public.equipamentos_faturamento_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipamento_id UUID NOT NULL REFERENCES public.equipamentos_faturamento(id) ON DELETE CASCADE,
  alterado_por UUID,
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  dados_antes JSONB,
  dados_depois JSONB
);

CREATE TABLE IF NOT EXISTS public.historico_locacao_faturamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_os TEXT,
  pedido TEXT,
  cliente_id UUID REFERENCES public.clientes_faturamento(id) ON DELETE SET NULL,
  equipamento_id UUID REFERENCES public.equipamentos_faturamento(id) ON DELETE SET NULL,
  patrimonio TEXT,
  quantidade NUMERIC,
  item TEXT,
  descricao_equipamento TEXT,
  periodo_texto TEXT,
  data_inicio DATE,
  data_fim DATE,
  valor_pedido_periodo NUMERIC,
  valor_diaria_periodo NUMERIC,
  valor_faturado_periodo NUMERIC,
  numero_nf TEXT,
  filial TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (numero_os, pedido, patrimonio, data_inicio, data_fim)
);
CREATE INDEX IF NOT EXISTS idx_hist_loc_cliente ON public.historico_locacao_faturamento (cliente_id);
CREATE INDEX IF NOT EXISTS idx_hist_loc_equip ON public.historico_locacao_faturamento (equipamento_id);
CREATE INDEX IF NOT EXISTS idx_hist_loc_os ON public.historico_locacao_faturamento (numero_os);
CREATE INDEX IF NOT EXISTS idx_hist_loc_patrimonio ON public.historico_locacao_faturamento (patrimonio);

-- ============ TRIGGERS updated_at ============
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'importacoes_dn4','staging_clientes_dn4','staging_representantes_dn4',
    'staging_equipamentos_dn4','staging_historico_locacao_dn4',
    'clientes_faturamento','representantes_faturamento','equipamentos_faturamento',
    'historico_locacao_faturamento'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
  END LOOP;
END $$;

-- ============ TRIGGER HISTÓRICO EQUIPAMENTOS ============
CREATE OR REPLACE FUNCTION public.tg_equip_fat_historico()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.equipamentos_faturamento_historico(equipamento_id, alterado_por, dados_antes, dados_depois)
  VALUES (NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_equip_fat_hist ON public.equipamentos_faturamento;
CREATE TRIGGER trg_equip_fat_hist AFTER UPDATE ON public.equipamentos_faturamento
  FOR EACH ROW EXECUTE FUNCTION public.tg_equip_fat_historico();

-- ============ RLS ============
ALTER TABLE public.importacoes_dn4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_clientes_dn4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_representantes_dn4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_equipamentos_dn4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_historico_locacao_dn4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_faturamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representantes_faturamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipamentos_faturamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipamentos_faturamento_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_locacao_faturamento ENABLE ROW LEVEL SECURITY;

-- Política única: admin OU faturamento podem tudo
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'importacoes_dn4','staging_clientes_dn4','staging_representantes_dn4',
    'staging_equipamentos_dn4','staging_historico_locacao_dn4',
    'clientes_faturamento','representantes_faturamento','equipamentos_faturamento',
    'equipamentos_faturamento_historico','historico_locacao_faturamento'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS dn4_all ON public.%I', t);
    EXECUTE format($p$CREATE POLICY dn4_all ON public.%I FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento'))
      WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento'))$p$, t);
  END LOOP;
END $$;

-- ============ RPC: confirmar registros staging → oficial ============
CREATE OR REPLACE FUNCTION public.dn4_confirmar_registros(
  p_tipo TEXT,
  p_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_confirmados INT := 0;
  v_pendentes INT := 0;
  v_erros INT := 0;
  v_cliente_id UUID;
  v_equip_id UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento')) THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  IF p_tipo = 'cliente' THEN
    FOR r IN SELECT * FROM public.staging_clientes_dn4 WHERE id = ANY(p_ids) AND status <> 'confirmado' LOOP
      BEGIN
        IF COALESCE(r.cpf_cnpj,'') <> '' THEN
          INSERT INTO public.clientes_faturamento(codigo_dn4,nome_razao_social,cpf_cnpj,inscricao_estadual,
            endereco,bairro,cidade,uf,cep,empresa_origem,filial_origem,status)
          VALUES (r.codigo_dn4, COALESCE(r.nome_razao_social,'(sem nome)'), r.cpf_cnpj, r.inscricao_estadual,
            r.endereco, r.bairro, r.cidade, r.uf, r.cep, r.empresa_origem, r.filial_origem, COALESCE(r.status_cliente,'ativo'))
          ON CONFLICT (cpf_cnpj) DO UPDATE SET
            nome_razao_social = EXCLUDED.nome_razao_social,
            codigo_dn4 = COALESCE(EXCLUDED.codigo_dn4, public.clientes_faturamento.codigo_dn4),
            inscricao_estadual = COALESCE(EXCLUDED.inscricao_estadual, public.clientes_faturamento.inscricao_estadual),
            endereco = COALESCE(EXCLUDED.endereco, public.clientes_faturamento.endereco),
            bairro = COALESCE(EXCLUDED.bairro, public.clientes_faturamento.bairro),
            cidade = COALESCE(EXCLUDED.cidade, public.clientes_faturamento.cidade),
            uf = COALESCE(EXCLUDED.uf, public.clientes_faturamento.uf),
            cep = COALESCE(EXCLUDED.cep, public.clientes_faturamento.cep),
            updated_at = now();
        ELSE
          INSERT INTO public.clientes_faturamento(codigo_dn4,nome_razao_social,inscricao_estadual,
            endereco,bairro,cidade,uf,cep,empresa_origem,filial_origem,status)
          VALUES (r.codigo_dn4, COALESCE(r.nome_razao_social,'(sem nome)'), r.inscricao_estadual,
            r.endereco, r.bairro, r.cidade, r.uf, r.cep, r.empresa_origem, r.filial_origem, COALESCE(r.status_cliente,'ativo'));
        END IF;
        UPDATE public.staging_clientes_dn4 SET status='confirmado', mensagem_erro=NULL WHERE id=r.id;
        v_confirmados := v_confirmados + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.staging_clientes_dn4 SET status='erro_leitura', mensagem_erro=SQLERRM WHERE id=r.id;
        v_erros := v_erros + 1;
      END;
    END LOOP;

  ELSIF p_tipo = 'representante' THEN
    FOR r IN SELECT * FROM public.staging_representantes_dn4 WHERE id = ANY(p_ids) AND status <> 'confirmado' LOOP
      BEGIN
        INSERT INTO public.representantes_faturamento(codigo_dn4,nome,cpf_cnpj,endereco,cidade,uf,email,telefone,tipo_pessoa,empresa_origem,filial_origem)
        VALUES (r.codigo_dn4, COALESCE(r.nome,'(sem nome)'), r.cpf_cnpj, r.endereco, r.cidade, r.uf, r.email, r.telefone, r.tipo_pessoa, r.empresa_origem, r.filial_origem)
        ON CONFLICT (codigo_dn4, nome) DO UPDATE SET
          cpf_cnpj = COALESCE(EXCLUDED.cpf_cnpj, public.representantes_faturamento.cpf_cnpj),
          endereco = COALESCE(EXCLUDED.endereco, public.representantes_faturamento.endereco),
          cidade = COALESCE(EXCLUDED.cidade, public.representantes_faturamento.cidade),
          uf = COALESCE(EXCLUDED.uf, public.representantes_faturamento.uf),
          email = COALESCE(EXCLUDED.email, public.representantes_faturamento.email),
          telefone = COALESCE(EXCLUDED.telefone, public.representantes_faturamento.telefone),
          updated_at = now();
        UPDATE public.staging_representantes_dn4 SET status='confirmado', mensagem_erro=NULL WHERE id=r.id;
        v_confirmados := v_confirmados + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.staging_representantes_dn4 SET status='erro_leitura', mensagem_erro=SQLERRM WHERE id=r.id;
        v_erros := v_erros + 1;
      END;
    END LOOP;

  ELSIF p_tipo = 'equipamento' THEN
    FOR r IN SELECT * FROM public.staging_equipamentos_dn4 WHERE id = ANY(p_ids) AND status <> 'confirmado' LOOP
      BEGIN
        IF COALESCE(r.numero_patrimonio,'') = '' THEN
          UPDATE public.staging_equipamentos_dn4 SET status='pendente_conferencia', mensagem_erro='patrimônio obrigatório' WHERE id=r.id;
          v_pendentes := v_pendentes + 1;
          CONTINUE;
        END IF;
        INSERT INTO public.equipamentos_faturamento(codigo_equipamento,numero_patrimonio,descricao,tipo_equipamento,grupo,filial_opera,situacao,numero_serie,valor_venda,valor_compra,valor_mercado,valor_indenizacao)
        VALUES (r.codigo_equipamento,r.numero_patrimonio,r.descricao,r.tipo_equipamento,r.grupo,r.filial_opera,r.situacao,r.numero_serie,r.valor_venda,r.valor_compra,r.valor_mercado,r.valor_indenizacao)
        ON CONFLICT (numero_patrimonio) DO UPDATE SET
          codigo_equipamento = COALESCE(EXCLUDED.codigo_equipamento, public.equipamentos_faturamento.codigo_equipamento),
          descricao = COALESCE(EXCLUDED.descricao, public.equipamentos_faturamento.descricao),
          tipo_equipamento = COALESCE(EXCLUDED.tipo_equipamento, public.equipamentos_faturamento.tipo_equipamento),
          grupo = COALESCE(EXCLUDED.grupo, public.equipamentos_faturamento.grupo),
          filial_opera = COALESCE(EXCLUDED.filial_opera, public.equipamentos_faturamento.filial_opera),
          situacao = COALESCE(EXCLUDED.situacao, public.equipamentos_faturamento.situacao),
          numero_serie = COALESCE(EXCLUDED.numero_serie, public.equipamentos_faturamento.numero_serie),
          valor_venda = COALESCE(EXCLUDED.valor_venda, public.equipamentos_faturamento.valor_venda),
          valor_compra = COALESCE(EXCLUDED.valor_compra, public.equipamentos_faturamento.valor_compra),
          valor_mercado = COALESCE(EXCLUDED.valor_mercado, public.equipamentos_faturamento.valor_mercado),
          valor_indenizacao = COALESCE(EXCLUDED.valor_indenizacao, public.equipamentos_faturamento.valor_indenizacao),
          updated_at = now();
        UPDATE public.staging_equipamentos_dn4 SET status='confirmado', mensagem_erro=NULL WHERE id=r.id;
        v_confirmados := v_confirmados + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.staging_equipamentos_dn4 SET status='erro_leitura', mensagem_erro=SQLERRM WHERE id=r.id;
        v_erros := v_erros + 1;
      END;
    END LOOP;

  ELSIF p_tipo = 'historico' THEN
    FOR r IN SELECT * FROM public.staging_historico_locacao_dn4 WHERE id = ANY(p_ids) AND status <> 'confirmado' LOOP
      BEGIN
        v_cliente_id := r.cliente_id_resolvido;
        IF v_cliente_id IS NULL AND COALESCE(r.cliente_cpf_cnpj,'') <> '' THEN
          SELECT id INTO v_cliente_id FROM public.clientes_faturamento WHERE cpf_cnpj = r.cliente_cpf_cnpj LIMIT 1;
        END IF;
        IF v_cliente_id IS NULL AND COALESCE(r.cliente_nome,'') <> '' THEN
          SELECT id INTO v_cliente_id FROM public.clientes_faturamento
           WHERE lower(nome_razao_social) = lower(r.cliente_nome) LIMIT 1;
        END IF;

        v_equip_id := r.equipamento_id_resolvido;
        IF v_equip_id IS NULL AND COALESCE(r.patrimonio,'') <> '' THEN
          SELECT id INTO v_equip_id FROM public.equipamentos_faturamento WHERE numero_patrimonio = r.patrimonio LIMIT 1;
        END IF;

        IF v_cliente_id IS NULL OR v_equip_id IS NULL THEN
          UPDATE public.staging_historico_locacao_dn4 SET status='pendente_conferencia',
            mensagem_erro = 'Vínculo não encontrado: ' ||
              CASE WHEN v_cliente_id IS NULL THEN 'cliente ' ELSE '' END ||
              CASE WHEN v_equip_id IS NULL THEN 'equipamento' ELSE '' END
          WHERE id=r.id;
          v_pendentes := v_pendentes + 1;
          CONTINUE;
        END IF;

        INSERT INTO public.historico_locacao_faturamento(
          numero_os,pedido,cliente_id,equipamento_id,patrimonio,quantidade,item,descricao_equipamento,
          periodo_texto,data_inicio,data_fim,valor_pedido_periodo,valor_diaria_periodo,valor_faturado_periodo,numero_nf,filial)
        VALUES (r.numero_os,r.pedido,v_cliente_id,v_equip_id,r.patrimonio,r.quantidade,r.item,r.descricao_equipamento,
          r.periodo_texto,r.data_inicio,r.data_fim,r.valor_pedido_periodo,r.valor_diaria_periodo,r.valor_faturado_periodo,r.numero_nf,r.filial)
        ON CONFLICT (numero_os, pedido, patrimonio, data_inicio, data_fim) DO UPDATE SET
          valor_faturado_periodo = COALESCE(EXCLUDED.valor_faturado_periodo, public.historico_locacao_faturamento.valor_faturado_periodo),
          valor_diaria_periodo = COALESCE(EXCLUDED.valor_diaria_periodo, public.historico_locacao_faturamento.valor_diaria_periodo),
          numero_nf = COALESCE(EXCLUDED.numero_nf, public.historico_locacao_faturamento.numero_nf),
          updated_at = now();
        UPDATE public.staging_historico_locacao_dn4 SET status='confirmado', mensagem_erro=NULL WHERE id=r.id;
        v_confirmados := v_confirmados + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.staging_historico_locacao_dn4 SET status='erro_leitura', mensagem_erro=SQLERRM WHERE id=r.id;
        v_erros := v_erros + 1;
      END;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'tipo_invalido: %', p_tipo;
  END IF;

  RETURN jsonb_build_object('ok',true,'confirmados',v_confirmados,'pendentes',v_pendentes,'erros',v_erros);
END $$;

CREATE OR REPLACE FUNCTION public.dn4_ignorar_registros(p_tipo TEXT, p_ids UUID[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento')) THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;
  IF p_tipo = 'cliente' THEN
    UPDATE public.staging_clientes_dn4 SET status='ignorado' WHERE id = ANY(p_ids); GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_tipo = 'representante' THEN
    UPDATE public.staging_representantes_dn4 SET status='ignorado' WHERE id = ANY(p_ids); GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_tipo = 'equipamento' THEN
    UPDATE public.staging_equipamentos_dn4 SET status='ignorado' WHERE id = ANY(p_ids); GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_tipo = 'historico' THEN
    UPDATE public.staging_historico_locacao_dn4 SET status='ignorado' WHERE id = ANY(p_ids); GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ok',true,'ignorados',v_count);
END $$;

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('dn4-imports', 'dn4-imports', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS dn4_imports_read ON storage.objects;
CREATE POLICY dn4_imports_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dn4-imports' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento')));

DROP POLICY IF EXISTS dn4_imports_write ON storage.objects;
CREATE POLICY dn4_imports_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dn4-imports' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento')));

DROP POLICY IF EXISTS dn4_imports_update ON storage.objects;
CREATE POLICY dn4_imports_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'dn4-imports' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento')));

DROP POLICY IF EXISTS dn4_imports_delete ON storage.objects;
CREATE POLICY dn4_imports_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dn4-imports' AND public.has_role(auth.uid(),'admin'));
