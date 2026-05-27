-- Libera Kayky no acesso temporario de Faturamento Sao Paulo/Matriz.

INSERT INTO public.acessos_externos (
  funcionario_id,
  cpf,
  cpf_clean,
  pin,
  nome,
  email,
  tipo_acesso,
  modulos_liberados,
  ativo,
  empresa,
  filial,
  funcao,
  perfil_acesso,
  modulo,
  status,
  acesso_liberado,
  observacoes,
  updated_at
)
SELECT
  f.id,
  regexp_replace(COALESCE(f.cpf, ''), '\D', '', 'g') AS cpf,
  regexp_replace(COALESCE(f.cpf, ''), '\D', '', 'g') AS cpf_clean,
  right(regexp_replace(COALESCE(f.cpf, ''), '\D', '', 'g'), 4) AS pin,
  f.nome,
  COALESCE(NULLIF(f.email, ''), ''),
  'operacional',
  '["faturamento"]'::jsonb,
  true,
  'TOPAC MATRIZ',
  'SAO PAULO',
  f.cargo,
  'faturamento',
  'faturamento',
  'ativo',
  true,
  jsonb_build_object('origem', 'liberacao_temporaria_faturamento_sp', 'atualizado_em', now())::text,
  now()
FROM public.funcionarios f
WHERE public.topac_norm_text(f.nome) LIKE '%kayky%'
  AND regexp_replace(COALESCE(f.cpf, ''), '\D', '', 'g') <> ''
  AND NOT EXISTS (
    SELECT 1
      FROM public.acessos_externos ae
     WHERE ae.modulo = 'faturamento'
       AND ae.cpf_clean = regexp_replace(COALESCE(f.cpf, ''), '\D', '', 'g')
       AND upper(COALESCE(ae.filial, '')) LIKE '%SAO PAULO%'
  );
