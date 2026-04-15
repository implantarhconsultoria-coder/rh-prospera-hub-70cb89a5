ALTER TABLE public.prestadores
ADD COLUMN IF NOT EXISTS banco text DEFAULT '',
ADD COLUMN IF NOT EXISTS banco_titular text DEFAULT '',
ADD COLUMN IF NOT EXISTS banco_tipo_conta text DEFAULT '',
ADD COLUMN IF NOT EXISTS banco_agencia text DEFAULT '',
ADD COLUMN IF NOT EXISTS banco_conta text DEFAULT '';