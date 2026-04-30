
-- Adiciona campos de controle de acesso por funcionário (status estendido + setor)
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS setor TEXT,
  ADD COLUMN IF NOT EXISTS acesso_status TEXT NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS acesso_motivo TEXT,
  ADD COLUMN IF NOT EXISTS acesso_atualizado_em TIMESTAMPTZ;

-- Sincroniza acesso_status com status existente (desligado -> desligado)
UPDATE public.funcionarios
   SET acesso_status = CASE
     WHEN lower(coalesce(status,'')) = 'desligado' THEN 'desligado'
     WHEN lower(coalesce(status,'')) IN ('ferias','férias') THEN 'ferias'
     WHEN lower(coalesce(status,'')) = 'bloqueado' THEN 'bloqueado'
     ELSE 'ativo'
   END
 WHERE acesso_status = 'ativo';

-- Constraint de domínio para acesso_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'funcionarios_acesso_status_chk'
  ) THEN
    ALTER TABLE public.funcionarios
      ADD CONSTRAINT funcionarios_acesso_status_chk
      CHECK (acesso_status IN ('ativo','bloqueado','ferias','desligado'));
  END IF;
END $$;

-- Cria os links permanentes por setor / unidade (usa ON CONFLICT em slug se houver índice único)
CREATE UNIQUE INDEX IF NOT EXISTS links_acesso_publico_slug_uidx ON public.links_acesso_publico (slug);

INSERT INTO public.links_acesso_publico (slug, modulo, unidade, nome, status, empresas_permitidas, token)
VALUES
  ('rh',           'rh',           '',                    'Link RH',                     'ativo', ARRAY[]::text[], encode(gen_random_bytes(18),'hex')),
  ('almoxarifado', 'almoxarifado', '',                    'Link Almoxarifado',           'ativo', ARRAY[]::text[], encode(gen_random_bytes(18),'hex')),
  ('mecanicos',    'mecanicos',    '',                    'Link Mecânicos',              'ativo', ARRAY[]::text[], encode(gen_random_bytes(18),'hex')),
  ('matriz',       'filial',       'Matriz',              'Link Filial Matriz',          'ativo', ARRAY['TOPAC MATRIZ','ALQUI OBRAS','LMT'], encode(gen_random_bytes(18),'hex')),
  ('filial-pg',    'filial',       'Praia Grande',        'Link Filial Praia Grande',    'ativo', ARRAY['TOPAC FILIAL PRAIA GRANDE'], encode(gen_random_bytes(18),'hex')),
  ('filial-go',    'filial',       'Goiânia',             'Link Filial Goiânia',         'ativo', ARRAY['TOPAC FILIAL GOIÂNIA'], encode(gen_random_bytes(18),'hex'))
ON CONFLICT (slug) DO NOTHING;
