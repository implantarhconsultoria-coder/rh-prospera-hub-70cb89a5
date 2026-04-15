ALTER TABLE public.ativos
ADD COLUMN IF NOT EXISTS vencimento_ipva date,
ADD COLUMN IF NOT EXISTS vencimento_licenciamento date;