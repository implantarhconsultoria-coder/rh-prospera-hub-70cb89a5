
-- 1) Atualizar CPF do Robson (estava em branco)
UPDATE public.funcionarios
   SET cpf = '13776700818'
 WHERE id = '9c5c7116-f751-484f-8098-920af451fbab'
   AND COALESCE(cpf, '') = '';

-- 2) Garantir permissões de Financeiro
INSERT INTO public.funcionario_modulos (funcionario_id, modulo, status, autorizado_por_nome)
VALUES
  ('9c5c7116-f751-484f-8098-920af451fbab', 'financeiro', 'ativo', 'Migração — liberação Rodrigo'),
  ('71ce7472-7413-4191-ad75-642ba7f12398', 'financeiro', 'ativo', 'Migração — liberação Rodrigo')
ON CONFLICT (funcionario_id, modulo) DO UPDATE SET status = 'ativo';

-- 3) Garantir permissões de Faturamento (ativos)
INSERT INTO public.funcionario_modulos (funcionario_id, modulo, status, autorizado_por_nome)
VALUES
  ('c61eef34-ef64-430f-8c50-d2057d4dd57a', 'faturamento', 'ativo', 'Migração — liberação Rodrigo'), -- Rafaela
  ('f94b76a4-0974-4fd9-8eee-5444edadaeef', 'faturamento', 'ativo', 'Migração — liberação Rodrigo'), -- Kayky
  ('3d8ac264-b06e-4418-9037-fc9d7e1e2b60', 'faturamento', 'ativo', 'Migração — liberação Rodrigo'), -- Douglas
  ('9c5c7116-f751-484f-8098-920af451fbab', 'faturamento', 'ativo', 'Migração — liberação Rodrigo'), -- Robson
  ('e12a40d3-541b-4217-ac59-b3f86f7da5c9', 'faturamento', 'ativo', 'Migração — liberação Rodrigo'), -- Antonio Carlos (Praia Grande)
  ('9400a97b-a29c-4314-9c83-f464418d739d', 'faturamento', 'ativo', 'Migração — liberação Rodrigo'), -- Ilma (Goiânia)
  ('526f007c-fb9a-465d-b8d0-9d73f3f8982a', 'faturamento', 'ativo', 'Migração — liberação Rodrigo'), -- Aldenei (Goiânia)
  ('c37a32b9-db91-485d-a190-c4579c78b1cd', 'faturamento', 'ativo', 'Migração — liberação Rodrigo')  -- Igor (Goiânia)
ON CONFLICT (funcionario_id, modulo) DO UPDATE SET status = 'ativo';

-- 4) Marcelo (Operacional) — preparado, mas bloqueado por enquanto
INSERT INTO public.funcionario_modulos (funcionario_id, modulo, status, autorizado_por_nome, observacoes)
VALUES
  ('79d8c917-f42b-430b-b252-122577a85d76', 'faturamento', 'bloqueado', 'Migração — preparado p/ liberar depois', 'Acesso preparado, liberar quando solicitado.')
ON CONFLICT (funcionario_id, modulo) DO NOTHING;

-- 5) Tornar bucket documentos-ativos público (corrige URLs antigas /object/public/)
UPDATE storage.buckets SET public = true WHERE id = 'documentos-ativos';
