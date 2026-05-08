
-- ============ DEDUP DN4 ============

-- Helper: comparar texto normalizado
CREATE OR REPLACE FUNCTION public.dn4_norm(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(coalesce(t,''), '\s+', ' ', 'g'))
$$;

-- ============ 1) MARCAR DUPLICADOS NO STAGING ============
CREATE OR REPLACE FUNCTION public.dn4_marcar_duplicados(p_importacao_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clientes INT := 0;
  v_repr INT := 0;
  v_equip INT := 0;
  v_hist INT := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento')) THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  -- Clientes: duplicado por CPF/CNPJ ou por nome+cidade+UF
  WITH base AS (
    SELECT s.id FROM public.staging_clientes_dn4 s
    WHERE s.importacao_id = p_importacao_id
      AND s.status NOT IN ('confirmado','ignorado','duplicado_ignorado')
      AND (
        (COALESCE(s.cpf_cnpj,'') <> '' AND EXISTS (
          SELECT 1 FROM public.clientes_faturamento c WHERE c.cpf_cnpj = s.cpf_cnpj
        ))
        OR (
          COALESCE(s.cpf_cnpj,'') = '' AND EXISTS (
            SELECT 1 FROM public.clientes_faturamento c
            WHERE public.dn4_norm(c.nome_razao_social) = public.dn4_norm(s.nome_razao_social)
              AND public.dn4_norm(c.cidade) = public.dn4_norm(s.cidade)
              AND public.dn4_norm(c.uf) = public.dn4_norm(s.uf)
          )
        )
      )
  )
  UPDATE public.staging_clientes_dn4 s
     SET status = 'duplicado_ignorado',
         mensagem_erro = 'Já existe cadastro equivalente'
   FROM base WHERE s.id = base.id;
  GET DIAGNOSTICS v_clientes = ROW_COUNT;

  -- Representantes: codigo_dn4+nome OU nome+cpf
  WITH base AS (
    SELECT s.id FROM public.staging_representantes_dn4 s
    WHERE s.importacao_id = p_importacao_id
      AND s.status NOT IN ('confirmado','ignorado','duplicado_ignorado')
      AND EXISTS (
        SELECT 1 FROM public.representantes_faturamento r
        WHERE (COALESCE(s.codigo_dn4,'') <> '' AND r.codigo_dn4 = s.codigo_dn4
                AND public.dn4_norm(r.nome) = public.dn4_norm(s.nome))
           OR (COALESCE(s.codigo_dn4,'') = '' AND COALESCE(s.cpf_cnpj,'') <> ''
                AND r.cpf_cnpj = s.cpf_cnpj
                AND public.dn4_norm(r.nome) = public.dn4_norm(s.nome))
      )
  )
  UPDATE public.staging_representantes_dn4 s
     SET status = 'duplicado_ignorado',
         mensagem_erro = 'Representante já cadastrado'
   FROM base WHERE s.id = base.id;
  GET DIAGNOSTICS v_repr = ROW_COUNT;

  -- Equipamentos: patrimônio já existe → será atualizado, então não marca como dup, só registra
  -- (UPSERT preserva histórico via trigger). Apenas marca quando idêntico em tudo.
  WITH base AS (
    SELECT s.id FROM public.staging_equipamentos_dn4 s
    JOIN public.equipamentos_faturamento e ON e.numero_patrimonio = s.numero_patrimonio
    WHERE s.importacao_id = p_importacao_id
      AND s.status NOT IN ('confirmado','ignorado','duplicado_ignorado')
      AND COALESCE(s.numero_patrimonio,'') <> ''
      AND public.dn4_norm(e.descricao) = public.dn4_norm(s.descricao)
      AND COALESCE(e.valor_compra,0) = COALESCE(s.valor_compra,0)
      AND COALESCE(e.situacao,'') = COALESCE(s.situacao,'')
  )
  UPDATE public.staging_equipamentos_dn4 s
     SET status = 'duplicado_ignorado',
         mensagem_erro = 'Patrimônio já cadastrado idêntico'
   FROM base WHERE s.id = base.id;
  GET DIAGNOSTICS v_equip = ROW_COUNT;

  -- Histórico: OS + pedido + patrimônio + período + NF
  WITH base AS (
    SELECT s.id FROM public.staging_historico_locacao_dn4 s
    JOIN public.historico_locacao_faturamento h
      ON h.numero_os = s.numero_os
     AND COALESCE(h.pedido,'') = COALESCE(s.pedido,'')
     AND COALESCE(h.patrimonio,'') = COALESCE(s.patrimonio,'')
     AND COALESCE(h.data_inicio, '1900-01-01'::date) = COALESCE(s.data_inicio, '1900-01-01'::date)
     AND COALESCE(h.data_fim, '1900-01-01'::date) = COALESCE(s.data_fim, '1900-01-01'::date)
     AND COALESCE(h.numero_nf,'') = COALESCE(s.numero_nf,'')
    WHERE s.importacao_id = p_importacao_id
      AND s.status NOT IN ('confirmado','ignorado','duplicado_ignorado')
  )
  UPDATE public.staging_historico_locacao_dn4 s
     SET status = 'duplicado_ignorado',
         mensagem_erro = 'Locação já importada'
   FROM base WHERE s.id = base.id;
  GET DIAGNOSTICS v_hist = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'clientes_ignorados', v_clientes,
    'representantes_ignorados', v_repr,
    'equipamentos_ignorados', v_equip,
    'historico_ignorados', v_hist
  );
END $$;

-- ============ 2) RESUMO DA IMPORTAÇÃO ============
CREATE OR REPLACE FUNCTION public.dn4_resumo_importacao(p_importacao_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v JSONB := '{}'::jsonb;
  v_tipo TEXT;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento')) THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  SELECT tipo INTO v_tipo FROM public.importacoes_dn4 WHERE id = p_importacao_id;

  IF v_tipo = 'cliente' THEN
    SELECT jsonb_build_object(
      'total', count(*),
      'novos', count(*) FILTER (WHERE status='aguardando_conferencia' OR status='pendente_conferencia'),
      'confirmados', count(*) FILTER (WHERE status='confirmado'),
      'duplicados_ignorados', count(*) FILTER (WHERE status='duplicado_ignorado'),
      'pendentes_conferencia', count(*) FILTER (WHERE status='pendente_conferencia'),
      'erros', count(*) FILTER (WHERE status='erro_leitura'),
      'ignorados', count(*) FILTER (WHERE status='ignorado')
    ) INTO v FROM public.staging_clientes_dn4 WHERE importacao_id = p_importacao_id;
  ELSIF v_tipo = 'representante' THEN
    SELECT jsonb_build_object(
      'total', count(*),
      'confirmados', count(*) FILTER (WHERE status='confirmado'),
      'duplicados_ignorados', count(*) FILTER (WHERE status='duplicado_ignorado'),
      'pendentes_conferencia', count(*) FILTER (WHERE status='pendente_conferencia'),
      'erros', count(*) FILTER (WHERE status='erro_leitura'),
      'ignorados', count(*) FILTER (WHERE status='ignorado')
    ) INTO v FROM public.staging_representantes_dn4 WHERE importacao_id = p_importacao_id;
  ELSIF v_tipo = 'equipamento' THEN
    SELECT jsonb_build_object(
      'total', count(*),
      'confirmados', count(*) FILTER (WHERE status='confirmado'),
      'duplicados_ignorados', count(*) FILTER (WHERE status='duplicado_ignorado'),
      'pendentes_conferencia', count(*) FILTER (WHERE status='pendente_conferencia'),
      'erros', count(*) FILTER (WHERE status='erro_leitura'),
      'ignorados', count(*) FILTER (WHERE status='ignorado')
    ) INTO v FROM public.staging_equipamentos_dn4 WHERE importacao_id = p_importacao_id;
  ELSIF v_tipo = 'historico' THEN
    SELECT jsonb_build_object(
      'total', count(*),
      'confirmados', count(*) FILTER (WHERE status='confirmado'),
      'duplicados_ignorados', count(*) FILTER (WHERE status='duplicado_ignorado'),
      'pendentes_conferencia', count(*) FILTER (WHERE status='pendente_conferencia'),
      'erros', count(*) FILTER (WHERE status='erro_leitura'),
      'ignorados', count(*) FILTER (WHERE status='ignorado')
    ) INTO v FROM public.staging_historico_locacao_dn4 WHERE importacao_id = p_importacao_id;
  END IF;

  RETURN COALESCE(v, '{}'::jsonb);
END $$;

-- ============ 3) LIMPAR DUPLICADOS NAS TABELAS OFICIAIS ============
-- Mescla clientes sem CPF/CNPJ pelo nome+cidade+UF, mantendo o mais completo.
CREATE OR REPLACE FUNCTION public.dn4_limpar_duplicados_oficial()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clientes_mesclados INT := 0;
  v_repr_mesclados INT := 0;
  r RECORD;
  v_keep UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  -- Agrupa clientes sem CPF por nome+cidade+UF, mantendo o mais antigo / mais completo
  FOR r IN
    SELECT public.dn4_norm(nome_razao_social) AS k_nome,
           public.dn4_norm(cidade) AS k_cid,
           public.dn4_norm(uf) AS k_uf,
           array_agg(id ORDER BY
             ((CASE WHEN endereco IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN cep IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN inscricao_estadual IS NOT NULL THEN 1 ELSE 0 END)) DESC,
             created_at ASC) AS ids
      FROM public.clientes_faturamento
     WHERE COALESCE(cpf_cnpj,'') = ''
     GROUP BY 1,2,3
    HAVING count(*) > 1
  LOOP
    v_keep := r.ids[1];
    -- Repassa referências do histórico
    UPDATE public.historico_locacao_faturamento
       SET cliente_id = v_keep
     WHERE cliente_id = ANY(r.ids[2:array_length(r.ids,1)]);
    -- Apaga duplicados
    DELETE FROM public.clientes_faturamento WHERE id = ANY(r.ids[2:array_length(r.ids,1)]);
    v_clientes_mesclados := v_clientes_mesclados + (array_length(r.ids,1) - 1);
  END LOOP;

  -- Representantes duplicados por nome+cpf
  FOR r IN
    SELECT public.dn4_norm(nome) AS k_nome, COALESCE(cpf_cnpj,'') AS k_doc,
           array_agg(id ORDER BY created_at ASC) AS ids
      FROM public.representantes_faturamento
     WHERE COALESCE(cpf_cnpj,'') <> ''
     GROUP BY 1,2
    HAVING count(*) > 1
  LOOP
    DELETE FROM public.representantes_faturamento
     WHERE id = ANY(r.ids[2:array_length(r.ids,1)]);
    v_repr_mesclados := v_repr_mesclados + (array_length(r.ids,1) - 1);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'clientes_mesclados', v_clientes_mesclados,
    'representantes_mesclados', v_repr_mesclados
  );
END $$;

-- ============ 4) Refinar dn4_confirmar_registros para histórico:
-- diferença de valor / período / NF → pendente_conferencia ============
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
  v_ignorados INT := 0;
  v_cliente_id UUID;
  v_equip_id UUID;
  v_existente RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'faturamento')) THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  IF p_tipo = 'cliente' THEN
    FOR r IN SELECT * FROM public.staging_clientes_dn4 WHERE id = ANY(p_ids) AND status NOT IN ('confirmado','duplicado_ignorado','ignorado') LOOP
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
    FOR r IN SELECT * FROM public.staging_representantes_dn4 WHERE id = ANY(p_ids) AND status NOT IN ('confirmado','duplicado_ignorado','ignorado') LOOP
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
    FOR r IN SELECT * FROM public.staging_equipamentos_dn4 WHERE id = ANY(p_ids) AND status NOT IN ('confirmado','duplicado_ignorado','ignorado') LOOP
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
    FOR r IN SELECT * FROM public.staging_historico_locacao_dn4 WHERE id = ANY(p_ids) AND status NOT IN ('confirmado','duplicado_ignorado','ignorado') LOOP
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

        -- Verifica se já existe e se há divergência
        SELECT * INTO v_existente FROM public.historico_locacao_faturamento
         WHERE numero_os = r.numero_os
           AND COALESCE(pedido,'') = COALESCE(r.pedido,'')
           AND COALESCE(patrimonio,'') = COALESCE(r.patrimonio,'')
           AND COALESCE(data_inicio,'1900-01-01'::date) = COALESCE(r.data_inicio,'1900-01-01'::date)
           AND COALESCE(data_fim,'1900-01-01'::date) = COALESCE(r.data_fim,'1900-01-01'::date)
         LIMIT 1;

        IF FOUND THEN
          IF COALESCE(v_existente.numero_nf,'') = COALESCE(r.numero_nf,'')
             AND COALESCE(v_existente.valor_faturado_periodo,0) = COALESCE(r.valor_faturado_periodo,0) THEN
            UPDATE public.staging_historico_locacao_dn4
               SET status='duplicado_ignorado', mensagem_erro='Locação já importada (idêntica)'
             WHERE id=r.id;
            v_ignorados := v_ignorados + 1;
            CONTINUE;
          ELSE
            UPDATE public.staging_historico_locacao_dn4
               SET status='pendente_conferencia',
                   mensagem_erro='Conflito com registro existente (NF/valor/período divergente)'
             WHERE id=r.id;
            v_pendentes := v_pendentes + 1;
            CONTINUE;
          END IF;
        END IF;

        INSERT INTO public.historico_locacao_faturamento(
          numero_os,pedido,cliente_id,equipamento_id,patrimonio,quantidade,item,descricao_equipamento,
          periodo_texto,data_inicio,data_fim,valor_pedido_periodo,valor_diaria_periodo,valor_faturado_periodo,numero_nf,filial)
        VALUES (r.numero_os,r.pedido,v_cliente_id,v_equip_id,r.patrimonio,r.quantidade,r.item,r.descricao_equipamento,
          r.periodo_texto,r.data_inicio,r.data_fim,r.valor_pedido_periodo,r.valor_diaria_periodo,r.valor_faturado_periodo,r.numero_nf,r.filial);
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

  RETURN jsonb_build_object('ok',true,'confirmados',v_confirmados,'pendentes',v_pendentes,'erros',v_erros,'duplicados_ignorados',v_ignorados);
END $$;
