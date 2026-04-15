
-- Function that returns allowed empresa names for current user based on role
CREATE OR REPLACE FUNCTION public.get_user_empresas()
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
      ARRAY['TOPAC MATRIZ', 'TOPAC FILIAL PRAIA GRANDE', 'ALQUI OBRAS', 'LMT', 'TOPAC FILIAL GOIÂNIA']
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'filial_praia') THEN
      ARRAY['TOPAC FILIAL PRAIA GRANDE']
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'filial_goiania') THEN
      ARRAY['TOPAC FILIAL GOIÂNIA']
    ELSE
      ARRAY[]::text[]
  END
$$;

-- aso_agendamentos: replace open SELECT with empresa-filtered policy
DROP POLICY IF EXISTS "Users can view agendamentos" ON public.aso_agendamentos;
CREATE POLICY "Users can view own empresa agendamentos"
  ON public.aso_agendamentos FOR SELECT TO authenticated
  USING (empresa = ANY(get_user_empresas()));

-- ativos: replace open SELECT with empresa-filtered policy
DROP POLICY IF EXISTS "Users can view ativos" ON public.ativos;
CREATE POLICY "Users can view own empresa ativos"
  ON public.ativos FOR SELECT TO authenticated
  USING (empresa = ANY(get_user_empresas()) OR empresa IS NULL OR empresa = '');

-- prestadores: replace open SELECT with empresa-filtered policy
DROP POLICY IF EXISTS "Users can view prestadores" ON public.prestadores;
CREATE POLICY "Users can view own empresa prestadores"
  ON public.prestadores FOR SELECT TO authenticated
  USING (empresa_pagadora = ANY(get_user_empresas()));
