DROP FUNCTION IF EXISTS public.qr_abastecimento_dados(text) CASCADE;
DROP FUNCTION IF EXISTS public.registrar_abastecimento_publico(text,text,text,numeric,numeric,numeric,text,text,text) CASCADE;
DROP FUNCTION IF EXISTS public.validar_qr_combustivel_publico(text) CASCADE;

DROP TABLE IF EXISTS public.qr_access_logs CASCADE;
DROP TABLE IF EXISTS public.abastecimentos CASCADE;
DROP TABLE IF EXISTS public.vales_combustivel CASCADE;