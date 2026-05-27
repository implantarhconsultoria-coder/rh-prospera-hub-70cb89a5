-- Libera acesso simples por PIN para mecanicos ativos da Matriz/SP e Goiania.

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
  '["mecanico"]'::jsonb,
  true,
  e.nome,
  CASE WHEN e.codigo = 'topac-gyn' THEN 'GOIANIA' ELSE 'SAO PAULO' END,
  f.cargo,
  'mecanico_externo',
  'mecanico',
  'ativo',
  true,
  jsonb_build_object(
    'origem', 'liberacao_temporaria_por_cpf',
    'veiculo', CASE WHEN e.codigo = 'topac-matriz' THEN 'PENDENTE VINCULAR VEICULO' ELSE NULL END,
    'exige_selecao_carro', e.codigo = 'topac-gyn',
    'atualizado_em', now()
  )::text,
  now()
FROM public.funcionarios f
JOIN public.empresas e ON e.id = COALESCE(f.company_id, f.empresa_id)
WHERE COALESCE(f.status, 'ativo') = 'ativo'
  AND COALESCE(f.ativo, true) = true
  AND e.codigo IN ('topac-matriz', 'topac-gyn')
  AND regexp_replace(COALESCE(f.cpf, ''), '\D', '', 'g') <> ''
  AND upper(COALESCE(f.cargo, '')) LIKE '%MEC%'
  AND NOT EXISTS (
    SELECT 1
      FROM public.acessos_externos ae
     WHERE ae.modulo = 'mecanico'
       AND ae.cpf_clean = regexp_replace(COALESCE(f.cpf, ''), '\D', '', 'g')
  );

UPDATE public.acessos_externos ae
   SET pin = right(regexp_replace(COALESCE(ae.cpf_clean, ae.cpf, ''), '\D', '', 'g'), 4),
       status = 'ativo',
       acesso_liberado = true,
       ativo = true,
       updated_at = now()
 WHERE ae.modulo = 'mecanico'
   AND regexp_replace(COALESCE(ae.cpf_clean, ae.cpf, ''), '\D', '', 'g') <> '';
