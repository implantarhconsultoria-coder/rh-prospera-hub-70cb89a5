-- Faturamento: SELECT em clientes, contratos, equipamentos, titulos_receber, recebimentos, cobrancas, reajustes, categorias
DROP POLICY IF EXISTS "Faturamento view clientes_fat" ON public.clientes_fat;
CREATE POLICY "Faturamento view clientes_fat" ON public.clientes_fat
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'faturamento'::public.app_role));

DROP POLICY IF EXISTS "Faturamento view contratos" ON public.contratos;
CREATE POLICY "Faturamento view contratos" ON public.contratos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'faturamento'::public.app_role));

DROP POLICY IF EXISTS "Faturamento view contrato_equipamentos" ON public.contrato_equipamentos;
CREATE POLICY "Faturamento view contrato_equipamentos" ON public.contrato_equipamentos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'faturamento'::public.app_role));

DROP POLICY IF EXISTS "Faturamento view cobrancas" ON public.cobrancas_tentativas;
CREATE POLICY "Faturamento view cobrancas" ON public.cobrancas_tentativas
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'faturamento'::public.app_role));

-- Financeiro: SELECT em contas, movimentações, títulos, etc.
DROP POLICY IF EXISTS "Financeiro view contas_bancarias" ON public.contas_bancarias;
CREATE POLICY "Financeiro view contas_bancarias" ON public.contas_bancarias
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'financeiro'::public.app_role));

DROP POLICY IF EXISTS "Financeiro view conciliacoes" ON public.conciliacoes;
CREATE POLICY "Financeiro view conciliacoes" ON public.conciliacoes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'financeiro'::public.app_role));

-- Ambos veem categorias e centros de custo (já são públicos para authenticated; reforça)
-- (categorias_financeiras e centros_custo já têm "All view ..." policies)

-- Tabelas que podem não existir: tentar criar policies só se a tabela existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='titulos_receber') THEN
    EXECUTE $p$ DROP POLICY IF EXISTS "Faturamento view titulos_receber" ON public.titulos_receber $p$;
    EXECUTE $p$ CREATE POLICY "Faturamento view titulos_receber" ON public.titulos_receber FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'faturamento'::public.app_role)) $p$;
    EXECUTE $p$ DROP POLICY IF EXISTS "Financeiro view titulos_receber" ON public.titulos_receber $p$;
    EXECUTE $p$ CREATE POLICY "Financeiro view titulos_receber" ON public.titulos_receber FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'financeiro'::public.app_role)) $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='titulos_pagar') THEN
    EXECUTE $p$ DROP POLICY IF EXISTS "Financeiro view titulos_pagar" ON public.titulos_pagar $p$;
    EXECUTE $p$ CREATE POLICY "Financeiro view titulos_pagar" ON public.titulos_pagar FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'financeiro'::public.app_role)) $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='recebimentos') THEN
    EXECUTE $p$ DROP POLICY IF EXISTS "Faturamento view recebimentos" ON public.recebimentos $p$;
    EXECUTE $p$ CREATE POLICY "Faturamento view recebimentos" ON public.recebimentos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'faturamento'::public.app_role)) $p$;
    EXECUTE $p$ DROP POLICY IF EXISTS "Financeiro view recebimentos" ON public.recebimentos $p$;
    EXECUTE $p$ CREATE POLICY "Financeiro view recebimentos" ON public.recebimentos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'financeiro'::public.app_role)) $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pagamentos') THEN
    EXECUTE $p$ DROP POLICY IF EXISTS "Financeiro view pagamentos" ON public.pagamentos $p$;
    EXECUTE $p$ CREATE POLICY "Financeiro view pagamentos" ON public.pagamentos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'financeiro'::public.app_role)) $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='movimentacoes_bancarias') THEN
    EXECUTE $p$ DROP POLICY IF EXISTS "Financeiro view movimentacoes" ON public.movimentacoes_bancarias $p$;
    EXECUTE $p$ CREATE POLICY "Financeiro view movimentacoes" ON public.movimentacoes_bancarias FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'financeiro'::public.app_role)) $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fornecedores') THEN
    EXECUTE $p$ DROP POLICY IF EXISTS "Financeiro view fornecedores" ON public.fornecedores $p$;
    EXECUTE $p$ CREATE POLICY "Financeiro view fornecedores" ON public.fornecedores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'financeiro'::public.app_role)) $p$;
  END IF;
END $$;