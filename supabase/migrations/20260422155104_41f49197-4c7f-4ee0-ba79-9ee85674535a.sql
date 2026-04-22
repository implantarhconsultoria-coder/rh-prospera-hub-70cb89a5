ALTER TABLE public.colaborador_veiculo
  DROP CONSTRAINT IF EXISTS colaborador_veiculo_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS colaborador_veiculo_user_veic_uniq
  ON public.colaborador_veiculo(user_id, veiculo_id);