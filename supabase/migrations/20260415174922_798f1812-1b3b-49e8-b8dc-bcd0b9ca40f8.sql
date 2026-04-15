ALTER TABLE public.prestadores
ADD COLUMN IF NOT EXISTS ultimo_pagamento date,
ADD COLUMN IF NOT EXISTS proximo_pagamento date;