ALTER TABLE public.fechamentos_filial
  DROP CONSTRAINT IF EXISTS fechamentos_filial_status_check;

ALTER TABLE public.fechamentos_filial
  ADD CONSTRAINT fechamentos_filial_status_check
  CHECK (status IN ('aberto', 'em_conferencia', 'fechado', 'reaberto'));
