-- TOPAC RH PRO - ponte DN4 -> financeiro.
-- Completa tabelas financeiras usadas pelas telas e cria rotina para gerar contas a receber
-- a partir do historico DN4 confirmado.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.contas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  nome text NOT NULL,
  banco text DEFAULT '',
  agencia text DEFAULT '',
  conta text DEFAULT '',
  pix text DEFAULT '',
  saldo_atual numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.titulos_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  fornecedor_id uuid,
  numero text NOT NULL,
  descricao text DEFAULT '',
  competencia text NOT NULL,
  data_emissao date NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento date NOT NULL DEFAULT CURRENT_DATE,
  valor_original numeric NOT NULL DEFAULT 0,
  desconto numeric NOT NULL DEFAULT 0,
  juros numeric NOT NULL DEFAULT 0,
  multa numeric NOT NULL DEFAULT 0,
  valor_pago numeric NOT NULL DEFAULT 0,
  saldo numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aberto',
  observacoes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id uuid REFERENCES public.titulos_receber(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT CURRENT_DATE,
  valor numeric NOT NULL DEFAULT 0,
  forma_pagamento text DEFAULT '',
  conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  observacoes text DEFAULT '',
  user_id uuid,
  usuario_nome text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id uuid REFERENCES public.titulos_pagar(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT CURRENT_DATE,
  valor numeric NOT NULL DEFAULT 0,
  forma_pagamento text DEFAULT '',
  conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  observacoes text DEFAULT '',
  user_id uuid,
  usuario_nome text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.titulos_receber
  ADD COLUMN IF NOT EXISTS origem text,
  ADD COLUMN IF NOT EXISTS origem_id uuid,
  ADD COLUMN IF NOT EXISTS conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_titulos_receber_origem
ON public.titulos_receber(origem, origem_id)
WHERE origem IS NOT NULL AND origem_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.topac_default_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM public.empresas
  ORDER BY
    CASE
      WHEN regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g') = '07291648000103' THEN 0
      ELSE 1
    END,
    created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.dn4_enviar_financeiro(p_importacao_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_empresa_id uuid;
  v_cliente_fat_id uuid;
  v_fatura_id uuid;
  v_numero text;
  v_comp text;
  v_venc date;
  v_total numeric;
  v_criados int := 0;
  v_ignorados int := 0;
  v_inserido int := 0;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'financeiro')
  ) THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  v_empresa_id := public.topac_default_empresa_id();

  FOR r IN
    SELECT h.*, c.nome_razao_social, c.cpf_cnpj, c.endereco, c.cidade, c.uf, c.cep
    FROM public.historico_locacao_faturamento h
    LEFT JOIN public.clientes_faturamento c ON c.id = h.cliente_id
    WHERE (p_importacao_id IS NULL OR EXISTS (
      SELECT 1
      FROM public.staging_historico_locacao_dn4 s
      WHERE s.importacao_id = p_importacao_id
        AND s.status = 'confirmado'
        AND COALESCE(s.numero_os, '') = COALESCE(h.numero_os, '')
        AND COALESCE(s.pedido, '') = COALESCE(h.pedido, '')
        AND COALESCE(s.patrimonio, '') = COALESCE(h.patrimonio, '')
    ))
  LOOP
    v_total := COALESCE(r.valor_faturado_periodo, r.valor_pedido_periodo, 0);
    IF v_total <= 0 OR v_empresa_id IS NULL THEN
      v_ignorados := v_ignorados + 1;
      CONTINUE;
    END IF;

    v_comp := to_char(COALESCE(r.data_fim, r.data_inicio, CURRENT_DATE), 'YYYY-MM');
    v_venc := COALESCE(r.data_fim, r.data_inicio, CURRENT_DATE) + INTERVAL '10 days';
    v_numero := COALESCE(NULLIF(r.numero_nf, ''), NULLIF(r.numero_os, ''), NULLIF(r.pedido, ''), 'DN4-' || r.id::text);

    INSERT INTO public.clientes_fat(razao_social, cnpj_cpf, endereco, cidade, uf, cep, status)
    VALUES (
      COALESCE(r.nome_razao_social, 'Cliente DN4 sem nome'),
      COALESCE(r.cpf_cnpj, ''),
      COALESCE(r.endereco, ''),
      COALESCE(r.cidade, ''),
      COALESCE(r.uf, ''),
      COALESCE(r.cep, ''),
      'ativo'
    )
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_cliente_fat_id
    FROM public.clientes_fat
    WHERE (
      COALESCE(cnpj_cpf, '') <> ''
      AND cnpj_cpf = COALESCE(r.cpf_cnpj, '')
    )
    OR lower(razao_social) = lower(COALESCE(r.nome_razao_social, 'Cliente DN4 sem nome'))
    ORDER BY created_at
    LIMIT 1;

    INSERT INTO public.faturas(
      numero, cliente_id, empresa_id, competencia, data_emissao, data_vencimento,
      subtotal, total, status, observacoes
    )
    VALUES (
      v_numero, v_cliente_fat_id, v_empresa_id, v_comp, CURRENT_DATE, v_venc,
      v_total, v_total, 'prevista',
      'Gerado automaticamente a partir do DN4'
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_fatura_id;

    IF v_fatura_id IS NULL THEN
      SELECT id INTO v_fatura_id
      FROM public.faturas
      WHERE numero = v_numero
      ORDER BY created_at
      LIMIT 1;
    END IF;

    INSERT INTO public.titulos_receber(
      cliente_id, fatura_id, empresa_id, numero, competencia, data_emissao,
      data_vencimento, valor_original, saldo, status, observacoes, origem, origem_id
    )
    VALUES (
      v_cliente_fat_id, v_fatura_id, v_empresa_id, v_numero, v_comp, CURRENT_DATE,
      v_venc, v_total, v_total, 'aberto',
      'Gerado automaticamente a partir do DN4',
      'dn4_historico', r.id
    )
    ON CONFLICT (origem, origem_id) DO NOTHING;

    GET DIAGNOSTICS v_inserido = ROW_COUNT;
    v_criados := v_criados + v_inserido;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'criados', v_criados, 'ignorados', v_ignorados);
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contas_bancarias','titulos_pagar','recebimentos','pagamentos','titulos_receber']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS topac_financeiro_all ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY topac_financeiro_all ON public.%I
      FOR ALL TO authenticated
      USING (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'financeiro')
        OR public.has_role(auth.uid(), 'faturamento')
      )
      WITH CHECK (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'financeiro')
        OR public.has_role(auth.uid(), 'faturamento')
      )
    $p$, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
