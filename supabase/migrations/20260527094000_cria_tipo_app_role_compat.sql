-- Compatibilidade para funcoes antigas que ainda fazem cast para public.app_role.

DO $$
BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'admin',
    'diretor_geral',
    'filial_matriz',
    'filial_praia',
    'filial_goiania',
    'almoxarifado',
    'usuario',
    'tecnico_campo',
    'operacional',
    'faturamento',
    'financeiro'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
