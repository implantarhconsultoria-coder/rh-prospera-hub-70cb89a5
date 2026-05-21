-- TOPAC RH PRO - perfil Diretor Geral.
-- Dashboard executivo + relatorios. Edicao apenas em Financeiro/Faturamento.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'diretor_geral';

CREATE TABLE IF NOT EXISTS public.diretor_permissoes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  liberar_visao_rh_diretor boolean NOT NULL DEFAULT false,
  modulos_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);

ALTER TABLE public.diretor_permissoes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.diretor_pode_visao_rh(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT dp.liberar_visao_rh_diretor
    FROM public.diretor_permissoes dp
    WHERE dp.user_id = _user_id
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.diretor_pode_editar_modulo(_modulo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'diretor_geral'::public.app_role)
      AND lower(COALESCE(_modulo, '')) IN ('financeiro', 'faturamento', 'contas_pagar', 'prestacao_contas')
    );
$$;

DROP POLICY IF EXISTS diretor_permissoes_admin_all ON public.diretor_permissoes;
CREATE POLICY diretor_permissoes_admin_all
ON public.diretor_permissoes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS diretor_permissoes_view_own ON public.diretor_permissoes;
CREATE POLICY diretor_permissoes_view_own
ON public.diretor_permissoes
FOR SELECT
TO authenticated
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'diretor_geral'::public.app_role));

DO $$
DECLARE
  t text;
  financial_tables text[] := ARRAY[
    'clientes_fat','contratos','contrato_equipamentos','faturas','medicoes','medicao_itens','reajustes',
    'faturamento_pendencias','faturamento_historico','clientes_faturamento','representantes_faturamento',
    'equipamentos_faturamento','equipamentos_faturamento_historico','historico_locacao_faturamento',
    'importacoes_dn4','staging_clientes_dn4','staging_equipamentos_dn4','staging_historico_locacao_dn4',
    'titulos_receber','recebimentos','titulos_pagar','pagamentos','fornecedores','contas_bancarias',
    'movimentacoes_bancarias','centros_custo','cobrancas_tentativas'
  ];
  report_tables text[] := ARRAY[
    'empresas','ativos','veiculos','documentos_ativos','documentos_veiculos','manutencoes_veiculos',
    'estoque_itens','almoxarifado_movimentos','movimentacoes_estoque','saidas_almoxarifado',
    'entradas_almoxarifado','chamados','abastecimentos','postos_combustivel'
  ];
  rh_tables text[] := ARRAY[
    'funcionarios','lancamentos_mensais','fechamentos_filial','registros_ponto','atestados',
    'asos','aso_exames','ferias','rescisao','entregas_epi','entregas_uniforme','beneficios'
  ];
BEGIN
  FOREACH t IN ARRAY financial_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS diretor_fin_fat_all ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY diretor_fin_fat_all ON public.%I FOR ALL TO authenticated
         USING (public.has_role(auth.uid(), ''diretor_geral''::public.app_role))
         WITH CHECK (public.has_role(auth.uid(), ''diretor_geral''::public.app_role))',
        t
      );
    END IF;
  END LOOP;

  FOREACH t IN ARRAY report_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS diretor_report_select ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY diretor_report_select ON public.%I FOR SELECT TO authenticated
         USING (public.has_role(auth.uid(), ''diretor_geral''::public.app_role))',
        t
      );
    END IF;
  END LOOP;

  FOREACH t IN ARRAY rh_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS diretor_rh_select_autorizado ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY diretor_rh_select_autorizado ON public.%I FOR SELECT TO authenticated
         USING (
           public.has_role(auth.uid(), ''diretor_geral''::public.app_role)
           AND public.diretor_pode_visao_rh(auth.uid())
         )',
        t
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
